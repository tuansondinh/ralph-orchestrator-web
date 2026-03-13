import { describe, expect, it, vi } from 'vitest'
import { appRouter } from '../src/trpc/router.js'
import { createTestRuntime } from './test-helpers.js'

function createCallerContext(
  overrides: {
    mode?: 'local' | 'cloud'
    userId?: string
    projectService?: Record<string, unknown>
    settingsService?: Record<string, unknown>
    githubService?: Record<string, unknown>
  } = {}
) {
  return {
    runtime: createTestRuntime(overrides.mode ?? 'cloud'),
    db: {} as never,
    userId: overrides.userId,
    supabaseUser: overrides.userId
      ? ({
          id: overrides.userId,
          email: `${overrides.userId}@example.com`
        } as never)
      : undefined,
    processManager: {} as never,
    loopService: {} as never,
    chatService: {} as never,
    monitoringService: {} as never,
    previewService: {} as never,
    terminalService: undefined,
    ralphProcessService: undefined,
    projectService: overrides.projectService ?? ({} as never),
    presetService: {} as never,
    settingsService: overrides.settingsService ?? ({} as never),
    hatsPresetService: {} as never,
    taskService: {} as never,
    githubService: overrides.githubService
  } as unknown as Parameters<typeof appRouter.createCaller>[0]
}

describe('cloud tRPC routes', () => {
  it('rejects unauthenticated cloud-only procedure calls', async () => {
    const caller = appRouter.createCaller(createCallerContext())

    await expect(caller.project.listGitHubRepos()).rejects.toMatchObject({
      code: 'UNAUTHORIZED'
    })
    await expect(
      caller.project.createFromGitHub({
        name: 'platform',
        private: true
      })
    ).rejects.toMatchObject({
      code: 'UNAUTHORIZED'
    })
    await expect(caller.settings.githubConnection()).rejects.toMatchObject({
      code: 'UNAUTHORIZED'
    })
  })

  it('scopes project.list to the authenticated cloud user', async () => {
    const findByUserId = vi.fn().mockResolvedValue([
      {
        id: 'project-1',
        name: 'Project 1',
        path: '/workspace/project-1',
        type: 'node',
        ralphConfig: 'ralph.yml',
        createdAt: 1,
        updatedAt: 1,
        userId: 'user-123'
      }
    ])
    const list = vi.fn().mockResolvedValue([
      {
        id: 'project-local',
        name: 'Local project',
        path: '/workspace/local',
        type: 'node',
        ralphConfig: 'ralph.yml',
        createdAt: 1,
        updatedAt: 1
      }
    ])

    const caller = appRouter.createCaller(
      createCallerContext({
        userId: 'user-123',
        projectService: {
          findByUserId,
          list
        }
      })
    )

    await expect(caller.project.list()).resolves.toEqual([
      expect.objectContaining({
        id: 'project-1',
        userId: 'user-123'
      })
    ])
    expect(findByUserId).toHaveBeenCalledWith('user-123')
    expect(list).not.toHaveBeenCalled()
  })

  it('preserves local project.list behavior', async () => {
    const list = vi.fn().mockResolvedValue([
      {
        id: 'project-local',
        name: 'Local project',
        path: '/workspace/local',
        type: 'node',
        ralphConfig: 'ralph.yml',
        createdAt: 1,
        updatedAt: 1
      }
    ])

    const caller = appRouter.createCaller(
      createCallerContext({
        mode: 'local',
        projectService: {
          list
        }
      })
    )

    await expect(caller.project.list()).resolves.toEqual([
      expect.objectContaining({
        id: 'project-local'
      })
    ])
    expect(list).toHaveBeenCalledTimes(1)
  })

  it('rejects cloud project access when the project belongs to another user', async () => {
    const get = vi.fn().mockResolvedValue({
      id: 'project-foreign',
      name: 'Foreign project',
      path: '/workspace/foreign',
      type: 'node',
      ralphConfig: 'ralph.yml',
      createdAt: 1,
      updatedAt: 1,
      userId: 'user-999'
    })

    const caller = appRouter.createCaller(
      createCallerContext({
        userId: 'user-123',
        projectService: {
          get
        }
      })
    )

    await expect(caller.project.get({ id: 'project-foreign' })).rejects.toMatchObject({
      code: 'FORBIDDEN'
    })
    expect(get).toHaveBeenCalledWith('project-foreign')
  })

  it('returns GitHub connection state for authenticated cloud users', async () => {
    const getConnection = vi.fn().mockResolvedValue({
      id: 'github-1',
      userId: 'user-123',
      githubUserId: 42,
      githubUsername: 'octocat',
      accessToken: 'encrypted',
      scope: 'repo',
      connectedAt: 123
    })

    const caller = appRouter.createCaller(
      createCallerContext({
        userId: 'user-123',
        githubService: {
          getConnection
        }
      })
    )

    await expect(caller.settings.githubConnection()).resolves.toEqual({
      connected: true,
      githubUsername: 'octocat',
      connectedAt: 123
    })
    expect(getConnection).toHaveBeenCalledWith('user-123')
  })

  it('lists repos and provisions cloud projects from the authenticated GitHub connection', async () => {
    const listConnectedRepos = vi.fn().mockResolvedValue({
      repos: [
        {
          id: 99,
          fullName: 'acme/platform',
          private: true,
          defaultBranch: 'main',
          htmlUrl: 'https://github.com/acme/platform'
        }
      ],
      hasMore: false
    })
    const createFromGitHub = vi.fn().mockResolvedValue({
      id: 'project-123',
      name: 'Platform',
      path: '/workspace/project-123',
      type: 'node',
      ralphConfig: 'ralph.yml',
      createdAt: 1,
      updatedAt: 1,
      userId: 'user-123',
      githubOwner: 'acme',
      githubRepo: 'platform',
      defaultBranch: 'main',
      workspacePath: '/workspace/project-123'
    })

    const caller = appRouter.createCaller(
      createCallerContext({
        userId: 'user-123',
        projectService: {
          createFromGitHub
        },
        githubService: {
          listConnectedRepos
        }
      })
    )

    await expect(
      caller.project.listGitHubRepos({
        page: 2,
        perPage: 10
      })
    ).resolves.toEqual({
      repos: [
        expect.objectContaining({
          fullName: 'acme/platform'
        })
      ],
      hasMore: false
    })
    expect(listConnectedRepos).toHaveBeenCalledWith('user-123', 2, 10)

    await expect(
      caller.project.createFromGitHub({
        name: 'Platform',
        description: 'Cloud repo',
        private: true
      })
    ).resolves.toEqual(
      expect.objectContaining({
        id: 'project-123',
        githubOwner: 'acme',
        githubRepo: 'platform'
      })
    )
    expect(createFromGitHub).toHaveBeenCalledWith({
      userId: 'user-123',
      name: 'Platform',
      description: 'Cloud repo',
      private: true
    })
  })
})
