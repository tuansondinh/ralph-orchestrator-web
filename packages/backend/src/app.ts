import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest
} from 'fastify'
import crypto from 'crypto'
import cors from '@fastify/cors'
import fastifyStatic from '@fastify/static'
import cookie from '@fastify/cookie'
import { fastifyTRPCPlugin } from '@trpc/server/adapters/fastify'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { appRouter } from './trpc/router.js'
import { createContext } from './trpc/context.js'
import {
  resolveRuntimeMode,
  type ResolvedRuntimeMode
} from './config/runtimeMode.js'
import {
  closeDatabase,
  createDatabaseProvider,
  type DatabaseConnection,
  type DatabaseProvider,
  getSetting,
  initializeDatabase
} from './db/connection.js'
import { createRepositoryBundle } from './db/repositories/index.js'
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
import { SopService } from './services/SopService.js'
import { OpenCodeService } from './services/OpenCodeService.js'
import { TaskService } from './services/TaskService.js'
import { GitService } from './services/GitService.js'
import { RalphMcpServer } from './mcp/RalphMcpServer.js'
import { resolveRalphBinary } from './lib/ralph.js'
import { isOriginAllowed, parseAllowedOrigins } from './lib/origin.js'
import { registerWebsocket } from './api/websocket.js'
import { LocalWorkspaceManager } from './services/WorkspaceManager.js'
import { WORKSPACE_BASE_DIR } from './config/runtimeMode.js'

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

const API_ROUTE_PREFIXES = ['/trpc', '/chat', '/ws', '/mcp', '/health']
const INTERNAL_MCP_AUTH_HEADER = 'x-ralph-internal-mcp-token'

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

type CloudRuntimeConfig = NonNullable<ResolvedRuntimeMode['cloud']>

async function cloudStartupPlugin(
  app: FastifyInstance,
  options: {
    cloud: CloudRuntimeConfig
    projectService: ProjectService
    repositories: ReturnType<typeof createRepositoryBundle>
    internalMcpAuthToken: string
  }
): Promise<void> {
  const { cloud, projectService, repositories, internalMcpAuthToken } = options
  const workspaceManager = new LocalWorkspaceManager(WORKSPACE_BASE_DIR)
  app.decorate('workspaceManager', workspaceManager)
  projectService.setWorkspaceManager(workspaceManager)

  if (cloud.supabaseUrl && cloud.supabaseAnonKey) {
    const { initSupabaseAuth, supabaseAuthHook } = await import(
      './auth/supabaseAuth.js'
    )

    initSupabaseAuth(cloud.supabaseUrl, cloud.supabaseAnonKey)
    app.addHook('onRequest', async (request, reply) => {
      const url = request.url
      const pathname = url.split('?')[0] ?? '/'
      // Skip auth for health check, capabilities, and static files
      if (
        pathname === '/health' ||
        pathname === '/trpc/capabilities' ||
        pathname === '/ws' ||
        (pathname === '/mcp' &&
          request.headers[INTERNAL_MCP_AUTH_HEADER] === internalMcpAuthToken) ||
        !API_ROUTE_PREFIXES.some(
          (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
        )
      ) {
        return
      }

      await supabaseAuthHook(request, reply)
    })
  }

  if (cloud.githubClientId && cloud.githubClientSecret && cloud.githubCallbackUrl) {
    const [{ registerGitHubAuthRoutes }, { GitHubService }] = await Promise.all([
      import('./api/githubAuth.js'),
      import('./services/GitHubService.js')
    ])
    const encryptionKey = crypto
      .createHash('sha256')
      .update(cloud.githubClientSecret)
      .digest()
    const githubService = new GitHubService(
      repositories.githubConnections,
      cloud.githubClientId,
      cloud.githubClientSecret,
      cloud.githubCallbackUrl,
      encryptionKey
    )

    app.decorate('githubService', githubService)
    registerGitHubAuthRoutes(app)
  }
}

;(cloudStartupPlugin as typeof cloudStartupPlugin & Record<symbol, boolean>)[
  Symbol.for('skip-override')
] = true

export interface CreateAppOptions {
  runtime?: ResolvedRuntimeMode
  databaseProviderFactory?: () => DatabaseProvider
}

export function createApp(options: CreateAppOptions = {}) {
  const runtime = options.runtime ?? resolveRuntimeMode()
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info'
    }
  })
  const database =
    options.databaseProviderFactory?.() ??
    createDatabaseProvider({
      runtime
    })
  const localDatabase =
    database.dialect === 'sqlite' ? initializeDatabase(database) : null
  const repositories = createRepositoryBundle(database)
  const processManager = new ProcessManager({ logger: app.log })
  const presetService = new PresetService()
  const hatsPresetService = new HatsPresetService()
  const sopService = new SopService()
  const ralphProcessService = new RalphProcessService()
  const settingsService = new SettingsService(repositories)
  const gitService = new GitService()
  const resolveConfiguredBinary =
    async () => {
      const current = await settingsService.get()
      return resolveRalphBinary({
        customPath: current.ralphBinaryPath
      })
    }

  const loopService =
    new LoopService(repositories, processManager, {
      resolveBinary: resolveConfiguredBinary,
      gitService
    })
  
  // Recover stale loop state in the background - don't block app startup
  setImmediate(() => {
    loopService.recoverState().catch((error) => {
      app.log.warn({ error }, 'Failed to recover loop state on startup (non-fatal)')
    })
  })
  
  const chatService =
    new ChatService(repositories, processManager, {
      resolveBinary: resolveConfiguredBinary,
      logger: app.log
    })
  const monitoringService =
    new MonitoringService(repositories, loopService)
  const rawPreviewPortStart =
    localDatabase
      ? parseSettingInteger(getSetting(localDatabase, 'preview.portStart'), 3001)
      : 3001
  const rawPreviewPortEnd =
    localDatabase
      ? parseSettingInteger(getSetting(localDatabase, 'preview.portEnd'), 3010)
      : 3010
  const previewPortStart = Math.min(rawPreviewPortStart, rawPreviewPortEnd)
  const previewPortEnd = Math.max(rawPreviewPortStart, rawPreviewPortEnd)
  const previewService =
    new DevPreviewManager(repositories, processManager, {
      portStart: previewPortStart,
      portEnd: previewPortEnd,
      logger: app.log
    })
  const terminalService = new TerminalService(repositories, {
    logger: app.log
  })
  const projectService = new ProjectService(repositories)
  const ralphMcpServer =
    new RalphMcpServer({
      projectService,
      presetService,
      loopService,
      monitoringService,
      settingsService,
      ralphProcessService,
      hatsPresetService,
      chatService,
      sopService
    })
  const configuredAllowedOrigins = parseAllowedOrigins(
    process.env.RALPH_UI_ALLOWED_ORIGINS
  )

  const taskService =
    new TaskService(repositories)
  const internalMcpAuthToken = crypto.randomUUID()
  const openCodeService = new OpenCodeService({
    mcpEndpointUrl: `http://127.0.0.1:${Number(process.env.PORT ?? 3003)}/mcp`,
    mcpHeaders: {
      [INTERNAL_MCP_AUTH_HEADER]: internalMcpAuthToken
    },
    settingsService
  })

  app.decorate('runtimeConfig', runtime)
  app.decorate(
    'db',
    (localDatabase?.db ?? (null as never)) as typeof app.db
  )
  app.decorate(
    'dbConnection',
    (localDatabase ?? (null as never)) as DatabaseConnection
  )
  app.decorate('databaseProvider', database as never)
  app.decorate('processManager', processManager)
  app.decorate('loopService', loopService)
  app.decorate('chatService', chatService)
  app.decorate('monitoringService', monitoringService)
  app.decorate('previewService', previewService)
  app.decorate('terminalService', terminalService)
  app.decorate('ralphProcessService', ralphProcessService)
  app.decorate('openCodeService', openCodeService)
  app.decorate('ralphMcpServer', ralphMcpServer)
  app.decorate('projectService', projectService)
  app.decorate('presetService', presetService)
  app.decorate('settingsService', settingsService)
  app.decorate('hatsPresetService', hatsPresetService)
  app.decorate('taskService', taskService)
  app.decorate('gitService', gitService)

  app.register(cookie)

  if (runtime.mode === 'cloud' && runtime.cloud) {
    app.register(cloudStartupPlugin, {
      cloud: runtime.cloud,
      projectService,
      repositories,
      internalMcpAuthToken
    })
  }

  app.register(cors, {
    origin: (origin, callback) => {
      const allowed = isOriginAllowed(origin ?? undefined, configuredAllowedOrigins)
      callback(null, allowed)
    },
    credentials: true
  })

  app.get('/health', async () => ({
    status: 'ok',
    runtime: {
      mode: runtime.mode,
      capabilities: runtime.capabilities
    }
  }))

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
    await openCodeService.stop()
    await ralphMcpServer.close()
    if (localDatabase) {
      await terminalService.shutdown()
      await processManager.shutdown()
    }
    await closeDatabase(database)
  })

  return app
}
