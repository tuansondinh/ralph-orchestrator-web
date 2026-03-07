import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify'
import type { ModelMessage } from 'ai'
import cors from '@fastify/cors'
import fastifyStatic from '@fastify/static'
import { fastifyTRPCPlugin } from '@trpc/server/adapters/fastify'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { z } from 'zod'
import { appRouter } from './trpc/router.js'
import { createContext } from './trpc/context.js'
import {
  closeDatabase,
  createDatabase,
  getSetting,
  initializeDatabase
} from './db/connection.js'
import { ProcessManager } from './runner/ProcessManager.js'
import { LoopService } from './services/LoopService.js'
import { ChatService } from './services/ChatService.js'
import { MonitoringService } from './services/MonitoringService.js'
import { DevPreviewManager } from './services/DevPreviewManager.js'
import { SettingsService } from './services/SettingsService.js'
import { TerminalService } from './services/TerminalService.js'
import { RalphProcessService } from './services/RalphProcessService.js'
import { ProjectService } from './services/ProjectService.js'
import { PresetService } from './services/PresetService.js'
import { HatsPresetService } from './services/HatsPresetService.js'
import { McpChatService, type AIModel } from './services/McpChatService.js'
import { TaskService } from './services/TaskService.js'
import { RalphMcpServer } from './mcp/RalphMcpServer.js'
import { resolveRalphBinary } from './lib/ralph.js'
import { isOriginAllowed, parseAllowedOrigins } from './lib/origin.js'
import { registerWebsocket } from './api/websocket.js'

const CHAT_STREAM_MESSAGE_SCHEMA = z
  .object({
    role: z.enum(['system', 'user', 'assistant', 'tool']),
    content: z.union([z.string(), z.array(z.unknown())])
  })
  .passthrough()

const CHAT_STREAM_BODY_SCHEMA = z.object({
  messages: z.array(CHAT_STREAM_MESSAGE_SCHEMA).min(1),
  model: z.enum(['gemini', 'openai', 'claude']).optional(),
  sessionId: z.string().trim().min(1)
})

const CHAT_CONFIRM_BODY_SCHEMA = z.object({
  sessionId: z.string().trim().min(1),
  toolCallId: z.string().trim().min(1),
  confirmed: z.boolean()
})

function writeSseEvent(
  rawReply: FastifyReply['raw'],
  event: string,
  data: unknown
) {
  rawReply.write(`event: ${event}\n`)
  rawReply.write(`data: ${JSON.stringify(data)}\n\n`)
}

function getValidationErrorMessage(error: z.ZodError) {
  const firstIssue = error.issues[0]
  return firstIssue?.message ?? 'Invalid request body'
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }

  return 'Failed to stream chat response'
}

function parseSettingInteger(value: string | undefined, fallback: number) {
  if (!value) {
    return fallback
  }

  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback
  }

  return parsed
}

function createChatStreamTimeoutError(timeoutMs: number) {
  const timeoutSeconds = Math.ceil(timeoutMs / 1000)
  return new Error(`Chat stream timed out after ${timeoutSeconds}s`)
}

function createChatStreamFirstEventTimeoutError(timeoutMs: number) {
  const timeoutSeconds = Math.ceil(timeoutMs / 1000)
  return new Error(
    `Chat stream produced no events after ${timeoutSeconds}s. Check model credentials/network and try again.`
  )
}

function getMissingModelCredential(model: AIModel) {
  if (model === 'gemini') {
    if (process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GOOGLE_API_KEY) {
      return null
    }

    return 'Missing Gemini API key. Set GOOGLE_GENERATIVE_AI_API_KEY.'
  }

  if (model === 'openai') {
    if (process.env.OPENAI_API_KEY) {
      return null
    }

    return 'Missing OpenAI API key. Set OPENAI_API_KEY.'
  }

  if (process.env.ANTHROPIC_API_KEY) {
    return null
  }

  return 'Missing Claude API key. Set ANTHROPIC_API_KEY.'
}

const API_ROUTE_PREFIXES = ['/trpc', '/chat', '/ws', '/mcp', '/health']

function resolveStaticDirectory() {
  const configuredRoot = process.env.RALPH_UI_STATIC_ROOT
  const candidates = [
    configuredRoot,
    resolve(process.cwd(), 'packages', 'frontend', 'dist'),
    resolve(process.cwd(), '..', 'frontend', 'dist')
  ]

  for (const candidate of candidates) {
    if (!candidate) {
      continue
    }

    const resolved = resolve(candidate)
    if (existsSync(resolve(resolved, 'index.html'))) {
      return resolved
    }
  }

  return null
}

function isApiRequestPath(pathname: string) {
  return API_ROUTE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

function toStaticRelativePath(pathname: string) {
  const stripped = pathname.replace(/^\/+/, '')
  if (!stripped) {
    return 'index.html'
  }

  const segments = stripped.split('/')
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    return null
  }

  return stripped
}

export function createApp() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info'
    }
  })
  const database = initializeDatabase(createDatabase())
  const processManager = new ProcessManager({ logger: app.log })
  const settingsService = new SettingsService(database.db)
  const ralphProcessService = new RalphProcessService()
  const resolveConfiguredBinary = async () => {
    const current = await settingsService.get()
    return resolveRalphBinary({
      customPath: current.ralphBinaryPath
    })
  }

  const loopService = new LoopService(database.db, processManager, {
    resolveBinary: resolveConfiguredBinary
  })
  const chatService = new ChatService(database.db, processManager, {
    resolveBinary: resolveConfiguredBinary,
    logger: app.log
  })
  const monitoringService = new MonitoringService(database.db, loopService)
  const rawPreviewPortStart = parseSettingInteger(
    getSetting(database, 'preview.portStart'),
    3001
  )
  const rawPreviewPortEnd = parseSettingInteger(
    getSetting(database, 'preview.portEnd'),
    3010
  )
  const previewPortStart = Math.min(rawPreviewPortStart, rawPreviewPortEnd)
  const previewPortEnd = Math.max(rawPreviewPortStart, rawPreviewPortEnd)
  const previewService = new DevPreviewManager(database.db, processManager, {
    portStart: previewPortStart,
    portEnd: previewPortEnd,
    logger: app.log
  })
  const terminalService = new TerminalService(database.db, {
    logger: app.log
  })
  const projectService = new ProjectService(database.db)
  const presetService = new PresetService()
  const hatsPresetService = new HatsPresetService()
  const ralphMcpServer = new RalphMcpServer({
    projectService,
    presetService,
    loopService,
    monitoringService,
    settingsService,
    ralphProcessService,
    hatsPresetService,
    chatService
  })
  const mcpChatService = new McpChatService({
    mcpServer: ralphMcpServer
  })
  const configuredAllowedOrigins = parseAllowedOrigins(
    process.env.RALPH_UI_ALLOWED_ORIGINS
  )
  const chatStreamTimeoutMs = parseSettingInteger(
    process.env.RALPH_UI_CHAT_STREAM_TIMEOUT_MS,
    120_000
  )
  const chatStreamFirstEventTimeoutMs = parseSettingInteger(
    process.env.RALPH_UI_CHAT_STREAM_FIRST_EVENT_TIMEOUT_MS,
    25_000
  )

  const taskService = new TaskService(database.db)

  app.decorate('db', database.db)
  app.decorate('dbConnection', database)
  app.decorate('processManager', processManager)
  app.decorate('loopService', loopService)
  app.decorate('chatService', chatService)
  app.decorate('monitoringService', monitoringService)
  app.decorate('previewService', previewService)
  app.decorate('terminalService', terminalService)
  app.decorate('ralphProcessService', ralphProcessService)
  app.decorate('mcpChatService', mcpChatService)
  app.decorate('ralphMcpServer', ralphMcpServer)
  app.decorate('projectService', projectService)
  app.decorate('presetService', presetService)
  app.decorate('settingsService', settingsService)
  app.decorate('hatsPresetService', hatsPresetService)
  app.decorate('taskService', taskService)

  app.register(cors, {
    origin: (origin, callback) => {
      const allowed = isOriginAllowed(origin ?? undefined, configuredAllowedOrigins)
      callback(null, allowed)
    },
    credentials: true
  })

  app.get('/health', async () => ({ status: 'ok' }))

  app.register(fastifyTRPCPlugin, {
    prefix: '/trpc',
    trpcOptions: {
      router: appRouter,
      createContext
    }
  })

  const handleMcpRequest = async (request: FastifyRequest, reply: FastifyReply) => {
    reply.hijack()
    try {
      await ralphMcpServer.handleRequest(request.raw, reply.raw, request.body)
    } catch (error) {
      app.log.error({ error }, 'Failed to process MCP request')
      if (!reply.raw.headersSent) {
        reply.raw.statusCode = 500
        reply.raw.setHeader('content-type', 'application/json')
        reply.raw.end(
          JSON.stringify({
            jsonrpc: '2.0',
            error: {
              code: -32603,
              message: 'Internal server error'
            },
            id: null
          })
        )
      }
    }
  }

  app.route({
    method: ['GET', 'POST', 'DELETE'],
    url: '/mcp',
    handler: handleMcpRequest
  })

  const handleChatStream = async (request: FastifyRequest, reply: FastifyReply) => {
    reply.hijack()

    const rawReply = reply.raw
    const abortController = new AbortController()
    const requestOrigin =
      typeof request.headers.origin === 'string' ? request.headers.origin : undefined
    const requestOriginAllowed = isOriginAllowed(requestOrigin, configuredAllowedOrigins)
    let streamClosed = false
    const markClosed = () => {
      streamClosed = true
      if (!abortController.signal.aborted) {
        abortController.abort(new Error('Chat stream closed by client'))
      }
    }

    const endStream = () => {
      rawReply.off('close', markClosed)
      request.raw.off('aborted', markClosed)

      if (!streamClosed && !rawReply.writableEnded && !rawReply.destroyed) {
        rawReply.end()
      }
    }

    const sendEvent = (event: string, data: unknown) => {
      if (streamClosed || rawReply.writableEnded || rawReply.destroyed) {
        return
      }

      writeSseEvent(rawReply, event, data)
    }

    rawReply.on('close', markClosed)
    request.raw.on('aborted', markClosed)

    const setSseHeaders = (statusCode: number) => {
      rawReply.statusCode = statusCode
      rawReply.setHeader('content-type', 'text/event-stream; charset=utf-8')
      rawReply.setHeader('cache-control', 'no-cache, no-transform')
      rawReply.setHeader('connection', 'keep-alive')
      if (requestOrigin && requestOriginAllowed) {
        rawReply.setHeader('access-control-allow-origin', requestOrigin)
        rawReply.setHeader('access-control-allow-credentials', 'true')
        rawReply.setHeader('vary', 'Origin')
      }
      rawReply.flushHeaders?.()
    }

    const parsed = CHAT_STREAM_BODY_SCHEMA.safeParse(request.body)
    if (!parsed.success) {
      setSseHeaders(400)
      sendEvent('error', {
        message: getValidationErrorMessage(parsed.error)
      })
      endStream()
      return
    }

    const input = parsed.data
    const selectedModel = (input.model ?? 'gemini') as AIModel
    setSseHeaders(200)

    let timeoutId: NodeJS.Timeout | null = null
    let firstEventTimeoutId: NodeJS.Timeout | null = null
    let receivedStreamEvent = false
    const markStreamEvent = () => {
      receivedStreamEvent = true
      if (firstEventTimeoutId) {
        clearTimeout(firstEventTimeoutId)
        firstEventTimeoutId = null
      }
    }

    try {
      const missingCredential = getMissingModelCredential(selectedModel)
      if (missingCredential) {
        throw new Error(missingCredential)
      }

      const streamPromise = app.mcpChatService.streamChat({
        sessionId: input.sessionId,
        model: selectedModel,
        messages: input.messages as ModelMessage[],
        abortSignal: abortController.signal,
        onTextDelta: (text) => {
          markStreamEvent()
          sendEvent('text-delta', { text })
        },
        onToolCall: (event) => {
          markStreamEvent()
          sendEvent('tool-call', event)
        },
        onToolResult: (event) => {
          markStreamEvent()
          sendEvent('tool-result', event)
        }
      })

      const timeoutPromises: Array<Promise<never>> = []

      if (chatStreamFirstEventTimeoutMs > 0) {
        timeoutPromises.push(
          new Promise<never>((_, reject) => {
            firstEventTimeoutId = setTimeout(() => {
              if (receivedStreamEvent) {
                return
              }

              const timeoutError = createChatStreamFirstEventTimeoutError(
                chatStreamFirstEventTimeoutMs
              )
              if (!abortController.signal.aborted) {
                abortController.abort(timeoutError)
              }
              reject(timeoutError)
            }, chatStreamFirstEventTimeoutMs)
          })
        )
      }

      if (chatStreamTimeoutMs > 0) {
        timeoutPromises.push(new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => {
            const timeoutError = createChatStreamTimeoutError(chatStreamTimeoutMs)
            if (!abortController.signal.aborted) {
              abortController.abort(timeoutError)
            }
            reject(timeoutError)
          }, chatStreamTimeoutMs)
        }))
      }

      if (timeoutPromises.length > 0) {
        await Promise.race([streamPromise, ...timeoutPromises])
      } else {
        await streamPromise
      }

      sendEvent('done', {})
    } catch (error) {
      app.log.error({ error }, 'Failed to stream chat response')
      sendEvent('error', {
        message: getErrorMessage(error)
      })
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
      if (firstEventTimeoutId) {
        clearTimeout(firstEventTimeoutId)
      }
      endStream()
    }
  }

  const handleChatConfirm = async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = CHAT_CONFIRM_BODY_SCHEMA.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        ok: false,
        message: getValidationErrorMessage(parsed.error)
      })
    }

    const confirmed = app.mcpChatService.confirmToolCall(parsed.data)
    if (!confirmed) {
      return reply.status(404).send({
        ok: false,
        message: 'No pending confirmation found'
      })
    }

    return {
      ok: true
    }
  }

  app.post('/chat/stream', handleChatStream)
  app.post('/trpc/chat/stream', handleChatStream)
  app.post('/chat/confirm', handleChatConfirm)
  app.post('/trpc/chat/confirm', handleChatConfirm)

  app.register(registerWebsocket)

  const staticDirectory = resolveStaticDirectory()
  if (staticDirectory) {
    app.register(fastifyStatic, {
      root: staticDirectory,
      serve: false,
      index: false
    })

    const serveFrontend = async (request: FastifyRequest, reply: FastifyReply) => {
      const rawUrl = request.raw.url ?? request.url
      const pathname = rawUrl.split('?')[0] ?? '/'
      if (isApiRequestPath(pathname)) {
        return reply.callNotFound()
      }

      const relativePath = toStaticRelativePath(pathname)
      if (!relativePath) {
        return reply.callNotFound()
      }

      if (
        relativePath !== 'index.html' &&
        existsSync(resolve(staticDirectory, relativePath))
      ) {
        return reply.sendFile(relativePath)
      }

      return reply.sendFile('index.html')
    }

    app.get('/', serveFrontend)
    app.get('/*', serveFrontend)
    app.log.info({ staticDirectory }, 'Serving frontend static bundle')
  } else {
    app.log.info('Frontend static bundle not found; running API-only mode')
  }

  app.addHook('onReady', async () => {
    await ralphMcpServer.start()
  })

  app.addHook('onClose', async () => {
    await ralphMcpServer.close()
    await terminalService.shutdown()
    await processManager.shutdown()
    closeDatabase(database)
  })

  return app
}
