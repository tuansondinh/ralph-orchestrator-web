import websocket from '@fastify/websocket'
import type { FastifyInstance } from 'fastify'
import type { RawData } from 'ws'
import type { OutputChunk } from '../runner/ProcessManager.js'
import type { LoopSummary } from '../services/LoopService.js'
import type { ChatMessageSummary, ChatSessionSummary } from '../services/ChatService.js'
import type { MonitoringLoopMetrics } from '../services/MonitoringService.js'
import type { PreviewInfo } from '../services/DevPreviewManager.js'
import type { LoopNotification } from '../services/LoopService.js'
import type { TerminalSessionSummary } from '../services/TerminalService.js'
import {
  isOriginAllowed,
  parseAllowedOrigins,
  parseRequestHosts
} from '../lib/origin.js'
import { verifySupabaseToken } from '../auth/supabaseAuth.js'
import {
  allowsDangerousOperations,
  getDangerousOperationBlockMessage
} from '../lib/safety.js'

interface SubscribeRequest {
  type: 'subscribe'
  channels: string[]
}

interface TerminalInputRequest {
  type: 'terminal.input'
  sessionId: string
  data: string
}

interface TerminalResizeRequest {
  type: 'terminal.resize'
  sessionId: string
  cols: number
  rows: number
}

type ClientMessage = SubscribeRequest | TerminalInputRequest | TerminalResizeRequest

function safeSend(app: FastifyInstance, socket: websocket.WebSocket, message: unknown) {
  if (socket.readyState !== socket.OPEN) {
    return
  }

  try {
    const payload =
      typeof message === 'object' && message !== null
        ? (message as Record<string, unknown>)
        : null
    app.log.debug(
      {
        type: payload?.type ?? 'unknown',
        channel: payload?.channel ?? null
      },
      '[WS] Broadcast message'
    )
    socket.send(JSON.stringify(message))
  } catch (error) {
    app.log.debug({ error }, 'Failed to send websocket payload')
  }
}

function parseClientMessage(raw: RawData): ClientMessage | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw.toString('utf8'))
  } catch {
    return null
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return null
  }

  const body = parsed as Record<string, unknown>
  const type = body.type
  if (type === 'subscribe') {
    const channels = body.channels
    if (!Array.isArray(channels)) {
      return null
    }

    const normalized = channels.filter(
      (value): value is string => typeof value === 'string' && value.trim().length > 0
    )

    return {
      type: 'subscribe',
      channels: normalized
    }
  }

  if (
    type === 'terminal.input' &&
    typeof body.sessionId === 'string' &&
    typeof body.data === 'string'
  ) {
    return {
      type: 'terminal.input',
      sessionId: body.sessionId,
      data: body.data
    }
  }

  if (
    type === 'terminal.resize' &&
    typeof body.sessionId === 'string' &&
    typeof body.cols === 'number' &&
    typeof body.rows === 'number'
  ) {
    return {
      type: 'terminal.resize',
      sessionId: body.sessionId,
      cols: body.cols,
      rows: body.rows
    }
  }

  return null
}

function asTerminalOutputMessage(sessionId: string, data: string, replay = false) {
  return {
    type: 'terminal.output',
    channel: `terminal:${sessionId}:output`,
    sessionId,
    data,
    timestamp: new Date().toISOString(),
    replay
  }
}

function asTerminalStateMessage(sessionId: string, session: TerminalSessionSummary | null) {
  return {
    type: 'terminal.state',
    channel: `terminal:${sessionId}:state`,
    sessionId,
    state: session?.state ?? 'unknown',
    cols: session?.cols ?? null,
    rows: session?.rows ?? null,
    endedAt: session?.endedAt ?? null
  }
}

function asOutputMessage(loopId: string, chunk: OutputChunk, replay = false) {
  return {
    type: 'loop.output',
    channel: `loop:${loopId}:output`,
    loopId,
    stream: chunk.stream,
    data: chunk.data,
    timestamp: chunk.timestamp.toISOString(),
    replay
  }
}

function asStateMessage(loopId: string, loop: LoopSummary | null) {
  return {
    type: 'loop.state',
    channel: `loop:${loopId}:state`,
    loopId,
    state: loop?.state ?? 'unknown',
    currentHat: loop?.currentHat ?? null,
    iterations: loop?.iterations ?? 0,
    tokensUsed: loop?.tokensUsed ?? 0,
    errors: loop?.errors ?? 0,
    endedAt: loop?.endedAt ?? null
  }
}

function asChatMessage(
  sessionId: string,
  message: ChatMessageSummary,
  replay = false
) {
  return {
    type: 'chat.message',
    channel: `chat:${sessionId}:message`,
    sessionId,
    id: message.id,
    role: message.role,
    content: message.content,
    timestamp: new Date(message.timestamp).toISOString(),
    replay
  }
}

function asChatStateMessage(
  sessionId: string,
  session: ChatSessionSummary | null
) {
  return {
    type: 'chat.state',
    channel: `chat:${sessionId}:message`,
    sessionId,
    backend: session?.backend ?? null,
    state: session?.state ?? 'unknown',
    endedAt: session?.endedAt ?? null
  }
}

function asMetricsMessage(loopId: string, metrics: MonitoringLoopMetrics) {
  return {
    type: 'loop.metrics',
    channel: `loop:${loopId}:metrics`,
    loopId,
    iterations: metrics.iterations,
    runtime: metrics.runtime,
    tokensUsed: metrics.tokensUsed,
    errors: metrics.errors,
    lastOutputSize: metrics.lastOutputSize,
    filesChanged: metrics.filesChanged,
    fileChanges: metrics.fileChanges,
    timestamp: new Date().toISOString()
  }
}

function asPreviewStateMessage(projectId: string, preview: PreviewInfo | null) {
  return {
    type: 'preview.state',
    channel: `preview:${projectId}:state`,
    projectId,
    state: preview?.state ?? 'stopped',
    url: preview?.url ?? null,
    port: preview?.port ?? null,
    command: preview?.command ?? null,
    args: preview?.args ?? [],
    error: preview?.error ?? null
  }
}

function asNotificationMessage(
  notification: LoopNotification,
  replay = false
) {
  return {
    type: 'notification',
    channel: 'notifications',
    id: notification.id,
    projectId: notification.projectId,
    notificationType: notification.type,
    title: notification.title,
    message: notification.message,
    read: notification.read,
    createdAt: notification.createdAt,
    replay
  }
}

function resolveMetricsIntervalMs() {
  const raw = process.env.RALPH_UI_METRICS_INTERVAL_MS
  const parsed = raw ? Number.parseInt(raw, 10) : 5_000
  if (!Number.isFinite(parsed) || parsed < 100) {
    return 5_000
  }
  return parsed
}

export async function registerWebsocket(app: FastifyInstance) {
  await app.register(websocket)
  const configuredAllowedOrigins = parseAllowedOrigins(
    process.env.RALPH_UI_ALLOWED_ORIGINS
  )
  const dangerousOperationsAllowed = allowsDangerousOperations()

  app.get('/ws', { websocket: true }, (socket, req) => {
    const origin = typeof req.headers.origin === 'string' ? req.headers.origin : undefined
    const requestHosts = parseRequestHosts([
      typeof req.headers.host === 'string' ? req.headers.host : undefined,
      typeof req.headers['x-forwarded-host'] === 'string'
        ? req.headers['x-forwarded-host']
        : undefined
    ])

    if (!isOriginAllowed(origin, configuredAllowedOrigins, requestHosts)) {
      app.log.warn({ origin }, '[WS] Connection rejected due to origin policy')
      socket.close(1008, 'Origin not allowed')
      return
    }

    const unsubscribers = new Map<string, () => void>()
    let cleaned = false
    let subscriptionUpdate = Promise.resolve()
    let sessionReady = app.runtimeConfig.mode !== 'cloud'

    const cleanup = (reason: 'close' | 'error') => {
      if (cleaned) {
        return
      }

      cleaned = true
      for (const unsubscribe of unsubscribers.values()) {
        unsubscribe()
      }
      unsubscribers.clear()
      app.log.info({ reason }, '[WS] Client disconnected')
    }

    const startSession = async () => {
      if (app.runtimeConfig.mode === 'cloud') {
        const host =
          typeof req.headers.host === 'string' && req.headers.host.trim().length > 0
            ? req.headers.host
            : 'localhost'
        const requestUrl = new URL(req.url, `http://${host}`)
        const token = requestUrl.searchParams.get('token')

        if (!token) {
          socket.close(4001, 'Authentication required')
          return
        }

        try {
          const user = await verifySupabaseToken(token)
          req.userId = user.id
          req.supabaseUser = user
          sessionReady = true
        } catch {
          socket.close(4001, 'Invalid or expired token')
          return
        }
      }

      sessionReady = true
      app.log.info('[WS] Client connected')
    }

    const unsubscribeChannel = (channel: string) => {
      const unsubscribe = unsubscribers.get(channel)
      if (!unsubscribe) {
        return
      }

      unsubscribe()
      unsubscribers.delete(channel)
    }

    const subscribeChannel = async (channel: string) => {
      if (cleaned) {
        return
      }

      if (unsubscribers.has(channel)) {
        return
      }

      app.log.debug({ channel }, '[WS] Subscribe request')

      const outputMatch = /^loop:([^:]+):output$/.exec(channel)
      if (outputMatch) {
        const loopId = outputMatch[1]
        const replayLines = await app.loopService.replayOutput(loopId)
        for (const line of replayLines) {
          safeSend(
            app,
            socket,
            asOutputMessage(
              loopId,
              {
                stream: 'stdout',
                data: line,
                timestamp: new Date()
              },
              true
            )
          )
        }

        const unsubscribe = app.loopService.subscribeOutput(loopId, (chunk) => {
          safeSend(app, socket, asOutputMessage(loopId, chunk))
        })

        unsubscribers.set(channel, unsubscribe)
        return
      }

      const stateMatch = /^loop:([^:]+):state$/.exec(channel)
      if (stateMatch) {
        const loopId = stateMatch[1]
        const current = await app.loopService.get(loopId).catch(() => null)
        safeSend(app, socket, asStateMessage(loopId, current))

        const unsubscribe = app.loopService.subscribeState(loopId, async () => {
          const latest = await app.loopService.get(loopId).catch(() => null)
          safeSend(app, socket, asStateMessage(loopId, latest))
        })

        unsubscribers.set(channel, unsubscribe)
        return
      }

      const metricsMatch = /^loop:([^:]+):metrics$/.exec(channel)
      if (metricsMatch) {
        const loopId = metricsMatch[1]
        const metricsIntervalMs = resolveMetricsIntervalMs()
        const sendMetrics = async () => {
          const metrics = await app.monitoringService.getLoopMetrics(loopId).catch(() => null)
          if (!metrics) {
            return
          }

          safeSend(app, socket, asMetricsMessage(loopId, metrics))
        }

        await sendMetrics()

        const watchUnsubscribe = app.monitoringService.watchMetrics(loopId, (metrics) => {
          safeSend(app, socket, asMetricsMessage(loopId, metrics))
        })
        const timer = setInterval(() => {
          void sendMetrics()
        }, metricsIntervalMs)

        unsubscribers.set(channel, () => {
          clearInterval(timer)
          watchUnsubscribe()
        })
        return
      }

      const chatMatch = /^chat:([^:]+):message$/.exec(channel)
      if (chatMatch) {
        const sessionId = chatMatch[1]
        const replayMessages = await app.chatService
          .replayMessages(sessionId)
          .catch(() => [])

        for (const message of replayMessages) {
          safeSend(app, socket, asChatMessage(sessionId, message, true))
        }

        const current = await app.chatService.getSession(sessionId).catch(() => null)
        safeSend(app, socket, asChatStateMessage(sessionId, current))

        const unsubMessage = app.chatService.subscribeMessages(sessionId, (message) => {
          safeSend(app, socket, asChatMessage(sessionId, message))
        })

        const unsubState = app.chatService.subscribeState(sessionId, async () => {
          const latest = await app.chatService.getSession(sessionId).catch(() => null)
          safeSend(app, socket, asChatStateMessage(sessionId, latest))
        })

        unsubscribers.set(channel, () => {
          unsubMessage()
          unsubState()
        })
        return
      }

      const previewMatch = /^preview:([^:]+):state$/.exec(channel)
      if (previewMatch) {
        const projectId = previewMatch[1]
        const current = await app.previewService.getStatus(projectId).catch(() => null)
        safeSend(app, socket, asPreviewStateMessage(projectId, current))

        const unsubscribe = app.previewService.subscribeState(projectId, (status) => {
          safeSend(app, socket, asPreviewStateMessage(projectId, status))
        })

        unsubscribers.set(channel, unsubscribe)
        return
      }

      const terminalOutputMatch = /^terminal:([^:]+):output$/.exec(channel)
      if (terminalOutputMatch) {
        if (!dangerousOperationsAllowed) {
          safeSend(app, socket, {
            type: 'error',
            message: getDangerousOperationBlockMessage('terminal.output')
          })
          return
        }
        const sessionId = terminalOutputMatch[1]
        try {
          const replayChunks = app.terminalService.replayOutput(sessionId)
          for (const replayChunk of replayChunks) {
            safeSend(app, socket, asTerminalOutputMessage(sessionId, replayChunk, true))
          }

          const unsubscribe = app.terminalService.subscribeOutput(sessionId, (chunk) => {
            safeSend(app, socket, asTerminalOutputMessage(sessionId, chunk.data))
          })
          unsubscribers.set(channel, unsubscribe)
        } catch {
          safeSend(app, socket, {
            type: 'error',
            message: `Terminal session not found: ${sessionId}`
          })
        }
        return
      }

      const terminalStateMatch = /^terminal:([^:]+):state$/.exec(channel)
      if (terminalStateMatch) {
        if (!dangerousOperationsAllowed) {
          safeSend(app, socket, {
            type: 'error',
            message: getDangerousOperationBlockMessage('terminal.state')
          })
          return
        }
        const sessionId = terminalStateMatch[1]
        try {
          const current = app.terminalService.getSession(sessionId)
          safeSend(app, socket, asTerminalStateMessage(sessionId, current))
          const unsubscribe = app.terminalService.subscribeState(sessionId, () => {
            const latest = app.terminalService.getSession(sessionId)
            safeSend(app, socket, asTerminalStateMessage(sessionId, latest))
          })
          unsubscribers.set(channel, unsubscribe)
        } catch {
          safeSend(app, socket, {
            type: 'error',
            message: `Terminal session not found: ${sessionId}`
          })
        }
        return
      }

      if (channel === 'notifications') {
        const replay = await app.loopService.replayNotifications().catch(() => [])
        for (const notification of replay) {
          safeSend(app, socket, asNotificationMessage(notification, true))
        }

        const unsubscribe = app.loopService.subscribeNotifications((notification) => {
          safeSend(app, socket, asNotificationMessage(notification))
        })

        unsubscribers.set(channel, unsubscribe)
      }
    }

    const applySubscriptions = async (channels: string[]) => {
      if (cleaned) {
        return
      }

      const desired = new Set(channels)
      for (const existingChannel of [...unsubscribers.keys()]) {
        if (!desired.has(existingChannel)) {
          unsubscribeChannel(existingChannel)
        }
      }

      for (const channel of desired) {
        try {
          await subscribeChannel(channel)
        } catch (error) {
          app.log.debug({ channel, error }, '[WS] Failed to subscribe channel')
        }
      }
    }

    socket.on('message', (raw: RawData) => {
      if (!sessionReady) {
        return
      }

      const message = parseClientMessage(raw)
      if (!message) {
        app.log.debug('[WS] Invalid subscribe payload')
        safeSend(app, socket, {
          type: 'error',
          message:
            'Expected {"type":"subscribe","channels":[...]} or terminal.input/terminal.resize payload'
        })
        return
      }

      if (message.type === 'subscribe') {
        subscriptionUpdate = subscriptionUpdate
          .then(() => applySubscriptions(message.channels))
          .catch((error) => {
            app.log.debug({ error }, '[WS] Failed to apply websocket subscriptions')
          })
        return
      }

      if (message.type === 'terminal.input') {
        if (!dangerousOperationsAllowed) {
          safeSend(app, socket, {
            type: 'error',
            message: getDangerousOperationBlockMessage('terminal.input')
          })
          return
        }
        try {
          app.terminalService.sendInput(message.sessionId, message.data)
        } catch {
          safeSend(app, socket, {
            type: 'error',
            message: `Terminal session not active: ${message.sessionId}`
          })
        }
        return
      }

      if (message.type === 'terminal.resize') {
        if (!dangerousOperationsAllowed) {
          safeSend(app, socket, {
            type: 'error',
            message: getDangerousOperationBlockMessage('terminal.resize')
          })
          return
        }
        try {
          app.terminalService.resizeSession(message.sessionId, message.cols, message.rows)
        } catch {
          safeSend(app, socket, {
            type: 'error',
            message: `Terminal session not active: ${message.sessionId}`
          })
        }
      }
    })

    socket.on('close', () => cleanup('close'))
    socket.on('error', () => cleanup('error'))

    void startSession().catch((error) => {
      app.log.warn({ error }, '[WS] Failed to initialize websocket session')
      socket.close(1011, 'WebSocket initialization failed')
    })
  })
}
