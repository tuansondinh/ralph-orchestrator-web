import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DatabaseProvider } from '../src/db/connection.js'
import type { RepositoryBundle } from '../src/db/repositories/contracts.js'
import { createTestRuntime } from './test-helpers.js'

const createRepositoryBundle = vi.fn<(database: DatabaseProvider) => RepositoryBundle>()

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

describe('createApp cloud service wiring', () => {
  const apps: Array<ReturnType<typeof createApp>> = []

  beforeEach(() => {
    vi.clearAllMocks()
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
      chatModel: 'gemini',
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
})
