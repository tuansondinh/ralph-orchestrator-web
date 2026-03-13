import { LATEST_PROTOCOL_VERSION } from '@modelcontextprotocol/sdk/types.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DatabaseProvider } from '../src/db/connection.js'
import type { RepositoryBundle } from '../src/db/repositories/contracts.js'
import type { ResolvedRuntimeMode } from '../src/config/runtimeMode.js'
import { createTestRuntime } from './test-helpers.js'

const createRepositoryBundle = vi.fn<(database: DatabaseProvider) => RepositoryBundle>()
const mockSupabaseGetUser = vi.fn()

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: mockSupabaseGetUser
    }
  }))
}))

vi.mock('../src/db/repositories/index.js', async () => {
  const actual = await vi.importActual<typeof import('../src/db/repositories/index.js')>(
    '../src/db/repositories/index.js'
  )

  return {
    ...actual,
    createRepositoryBundle
  }
})

const { createApp } = await import('../src/app.js')

function parseSseMessages(payload: string): Array<Record<string, unknown>> {
  return payload
    .split('\n\n')
    .map((chunk) =>
      chunk
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice('data:'.length).trim())
        .join('')
    )
    .filter((data) => data.length > 0)
    .map((data) => JSON.parse(data) as Record<string, unknown>)
}

function createLocalCloudRuntime(): ResolvedRuntimeMode {
  return {
    mode: 'local-cloud',
    capabilities: {
      mode: 'local-cloud',
      database: true,
      auth: true,
      localProjects: false,
      githubProjects: true,
      terminal: true,
      preview: true,
      localDirectoryPicker: false,
      mcp: true
    },
    cloud: {
      supabaseUrl: 'https://test.supabase.co',
      supabaseAnonKey: 'test-anon-key',
      databaseUrl: 'postgresql://postgres:postgres@localhost:5432/ralph'
    }
  }
}

describe('createApp cloud service wiring', () => {
  const apps: Array<ReturnType<typeof createApp>> = []

  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabaseGetUser.mockResolvedValue({
      data: {
        user: {
          id: 'user-123',
          email: 'user@example.com'
        }
      },
      error: null
    })
  })

  afterEach(async () => {
    while (apps.length > 0) {
      const app = apps.pop()
      if (app) {
        await app.close()
      }
    }
  })

  it('exposes repository-backed loop, chat, monitoring, project, and settings services in cloud mode', async () => {
    const now = Date.now()
    const project = {
      id: 'project-1',
      name: 'Project One',
      path: process.cwd(),
      type: null,
      ralphConfig: null,
      createdAt: now,
      updatedAt: now,
      userId: null,
      githubOwner: null,
      githubRepo: null,
      defaultBranch: null,
      workspacePath: null
    }
    const repositories: RepositoryBundle = {
      projects: {
        list: vi.fn().mockResolvedValue([project]),
        findById: vi.fn().mockImplementation(async (id: string) => (id === project.id ? project : null)),
        create: vi.fn().mockResolvedValue(project),
        update: vi.fn().mockResolvedValue(project),
        delete: vi.fn().mockResolvedValue(undefined),
        findByUserId: vi.fn().mockResolvedValue([]),
        findByGitHubRepo: vi.fn().mockResolvedValue(null)
      },
      loopRuns: {
        listAll: vi.fn().mockResolvedValue([]),
        listByProjectId: vi.fn().mockResolvedValue([]),
        findById: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: 'loop-1',
          projectId: project.id,
          ralphLoopId: null,
          state: 'running',
          config: null,
          prompt: null,
          worktree: null,
          iterations: 0,
          tokensUsed: 0,
          errors: 0,
          startedAt: now,
          endedAt: null
        }),
        update: vi.fn().mockRejectedValue(new Error('not used')),
        findByState: vi.fn().mockResolvedValue([])
      },
      chats: {
        findSessionById: vi.fn().mockResolvedValue(null),
        findLatestActiveSessionByProjectId: vi.fn().mockResolvedValue(null),
        createSession: vi.fn().mockRejectedValue(new Error('not used')),
        updateSession: vi.fn().mockRejectedValue(new Error('not used')),
        listMessagesBySessionId: vi.fn().mockResolvedValue([]),
        createMessage: vi.fn().mockRejectedValue(new Error('not used'))
      },
      notifications: {
        list: vi.fn().mockResolvedValue([]),
        findById: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockRejectedValue(new Error('not used')),
        update: vi.fn().mockRejectedValue(new Error('not used')),
        delete: vi.fn().mockResolvedValue(undefined)
      },
      settings: {
        list: vi.fn().mockResolvedValue([]),
        get: vi.fn().mockResolvedValue(null),
        upsert: vi.fn().mockRejectedValue(new Error('not used')),
        delete: vi.fn().mockResolvedValue(undefined)
      },
      githubConnections: {
        findByUserId: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockRejectedValue(new Error('not used')),
        delete: vi.fn().mockResolvedValue(undefined)
      },
      loopOutput: {
        append: vi.fn().mockResolvedValue(undefined),
        getByLoopRunId: vi.fn().mockResolvedValue([]),
        deleteByLoopRunId: vi.fn().mockResolvedValue(undefined)
      }
    }
    const close = vi.fn(async () => {})
    const databaseProvider: DatabaseProvider = {
      mode: 'cloud',
      dialect: 'postgres',
      client: {} as never,
      db: {} as never,
      metadata: {
        connectionString: 'postgresql://postgres:postgres@localhost:5432/ralph'
      },
      close
    }
    createRepositoryBundle.mockReturnValue(repositories)

    const databaseProviderFactory = vi.fn(() => databaseProvider)
    const app = createApp({
      runtime: createTestRuntime('cloud'),
      databaseProviderFactory
    })
    apps.push(app)

    await expect(app.projectService.list()).resolves.toEqual([
      expect.objectContaining({
        id: 'project-1',
        name: 'Project One'
      })
    ])
    await expect(app.settingsService.get()).resolves.toMatchObject({
      chatProvider: 'anthropic',
      chatModel: 'claude-sonnet-4-20250514',
      ralphBinaryPath: null
    })
    await expect(app.loopService.list('project-1')).resolves.toEqual([])
    await expect(app.chatService.getProjectSession('project-1')).resolves.toBeNull()
    await expect(app.monitoringService.getStatus()).resolves.toMatchObject({
      activeLoops: 0,
      totalRuns: 0,
      erroredRuns: 0
    })

    expect(databaseProviderFactory).toHaveBeenCalledTimes(1)
    expect(createRepositoryBundle).toHaveBeenCalledWith(databaseProvider)
    expect(close).not.toHaveBeenCalled()
  })

  it('serves the Ralph MCP endpoint in cloud mode', async () => {
    const now = Date.now()
    const project = {
      id: 'project-1',
      name: 'Project One',
      path: process.cwd(),
      type: null,
      ralphConfig: 'ralph.yml',
      createdAt: now,
      updatedAt: now,
      userId: null,
      githubOwner: null,
      githubRepo: null,
      defaultBranch: null,
      workspacePath: null
    }
    const repositories: RepositoryBundle = {
      projects: {
        list: vi.fn().mockResolvedValue([project]),
        findById: vi.fn().mockResolvedValue(project),
        create: vi.fn().mockResolvedValue(project),
        update: vi.fn().mockResolvedValue(project),
        delete: vi.fn().mockResolvedValue(undefined),
        findByUserId: vi.fn().mockResolvedValue([]),
        findByGitHubRepo: vi.fn().mockResolvedValue(null)
      },
      loopRuns: {
        listAll: vi.fn().mockResolvedValue([]),
        listByProjectId: vi.fn().mockResolvedValue([]),
        findById: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(null),
        update: vi.fn().mockResolvedValue(null),
        findByState: vi.fn().mockResolvedValue([])
      },
      chats: {
        findSessionById: vi.fn().mockResolvedValue(null),
        findLatestActiveSessionByProjectId: vi.fn().mockResolvedValue(null),
        createSession: vi.fn().mockResolvedValue(null),
        updateSession: vi.fn().mockResolvedValue(null),
        listMessagesBySessionId: vi.fn().mockResolvedValue([]),
        createMessage: vi.fn().mockResolvedValue(null)
      },
      notifications: {
        list: vi.fn().mockResolvedValue([]),
        findById: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(null),
        update: vi.fn().mockResolvedValue(null),
        delete: vi.fn().mockResolvedValue(undefined)
      },
      settings: {
        list: vi.fn().mockResolvedValue([]),
        get: vi.fn().mockResolvedValue(null),
        upsert: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockResolvedValue(undefined)
      },
      githubConnections: {
        findByUserId: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(null),
        delete: vi.fn().mockResolvedValue(undefined)
      },
      loopOutput: {
        append: vi.fn().mockResolvedValue(undefined),
        getByLoopRunId: vi.fn().mockResolvedValue([]),
        deleteByLoopRunId: vi.fn().mockResolvedValue(undefined)
      }
    }
    const databaseProvider: DatabaseProvider = {
      mode: 'cloud',
      dialect: 'postgres',
      client: {} as never,
      db: {} as never,
      metadata: {
        connectionString: 'postgresql://postgres:postgres@localhost:5432/ralph'
      },
      close: vi.fn(async () => {})
    }
    createRepositoryBundle.mockReturnValue(repositories)

    const app = createApp({
      runtime: createTestRuntime('cloud'),
      databaseProviderFactory: () => databaseProvider
    })
    apps.push(app)

    const initializeResponse = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: {
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
        authorization: 'Bearer valid-token'
      },
      payload: {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: LATEST_PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: {
            name: 'cloud-test-client',
            version: '1.0.0'
          }
        }
      }
    })

    expect(initializeResponse.statusCode).toBe(200)

    const sessionId = initializeResponse.headers['mcp-session-id']
    expect(typeof sessionId).toBe('string')

    const toolsResponse = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: {
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
        authorization: 'Bearer valid-token',
        'mcp-protocol-version': LATEST_PROTOCOL_VERSION,
        'mcp-session-id': String(sessionId)
      },
      payload: {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {}
      }
    })

    expect(toolsResponse.statusCode).toBe(200)

    const toolMessages = parseSseMessages(toolsResponse.body)
    const toolListResult = toolMessages.find((message) => message.id === 2)
    const tools =
      ((toolListResult?.result as { tools?: Array<{ name?: string }> } | undefined)?.tools ?? [])
        .map((tool) => tool.name)
        .sort()

    expect(tools).toContain('list_projects')
    expect(tools).toContain('start_loop')
    expect(tools).toContain('activate_plan_mode')
  })

  it('initializes auth middleware in local-cloud mode and still shuts down terminal resources on close', async () => {
    const repositories: RepositoryBundle = {
      projects: {
        list: vi.fn().mockResolvedValue([]),
        findById: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(null),
        update: vi.fn().mockResolvedValue(null),
        delete: vi.fn().mockResolvedValue(undefined),
        findByUserId: vi.fn().mockResolvedValue([]),
        findByGitHubRepo: vi.fn().mockResolvedValue(null)
      },
      loopRuns: {
        listAll: vi.fn().mockResolvedValue([]),
        listByProjectId: vi.fn().mockResolvedValue([]),
        findById: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(null),
        update: vi.fn().mockResolvedValue(null),
        findByState: vi.fn().mockResolvedValue([])
      },
      chats: {
        findSessionById: vi.fn().mockResolvedValue(null),
        findLatestActiveSessionByProjectId: vi.fn().mockResolvedValue(null),
        createSession: vi.fn().mockResolvedValue(null),
        updateSession: vi.fn().mockResolvedValue(null),
        listMessagesBySessionId: vi.fn().mockResolvedValue([]),
        createMessage: vi.fn().mockResolvedValue(null)
      },
      notifications: {
        list: vi.fn().mockResolvedValue([]),
        findById: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(null),
        update: vi.fn().mockResolvedValue(null),
        delete: vi.fn().mockResolvedValue(undefined)
      },
      settings: {
        list: vi.fn().mockResolvedValue([]),
        get: vi.fn().mockResolvedValue(null),
        upsert: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockResolvedValue(undefined)
      },
      githubConnections: {
        findByUserId: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(null),
        delete: vi.fn().mockResolvedValue(undefined)
      },
      loopOutput: {
        append: vi.fn().mockResolvedValue(undefined),
        getByLoopRunId: vi.fn().mockResolvedValue([]),
        deleteByLoopRunId: vi.fn().mockResolvedValue(undefined)
      }
    }
    createRepositoryBundle.mockReturnValue(repositories)

    const close = vi.fn(async () => {})
    const app = createApp({
      runtime: createLocalCloudRuntime(),
      databaseProviderFactory: () => ({
        mode: 'cloud',
        dialect: 'postgres',
        client: {} as never,
        db: {} as never,
        metadata: {
          connectionString: 'postgresql://postgres:postgres@localhost:5432/ralph'
        },
        close
      })
    })
    apps.push(app)

    const terminalShutdownSpy = vi
      .spyOn(app.terminalService, 'shutdown')
      .mockResolvedValue(undefined)
    const processShutdownSpy = vi
      .spyOn(app.processManager, 'shutdown')
      .mockResolvedValue(undefined)

    const unauthorizedProjectList = await app.inject({
      method: 'GET',
      url: '/trpc/project.list'
    })

    expect(unauthorizedProjectList.statusCode).toBe(401)
    expect(app.workspaceManager).toBeDefined()

    await app.close()
    apps.pop()

    expect(terminalShutdownSpy).toHaveBeenCalledTimes(1)
    expect(processShutdownSpy).toHaveBeenCalledTimes(1)
    expect(close).toHaveBeenCalledTimes(1)
  })
})
