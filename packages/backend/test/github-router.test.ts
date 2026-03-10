import { describe, expect, it, vi } from 'vitest'
import { appRouter } from '../src/trpc/router.js'
import { createTestRuntime } from './test-helpers.js'

/* eslint-disable @typescript-eslint/no-explicit-any */

describe('github tRPC router', () => {
  it('returns sanitized connection details for the authenticated user', async () => {
    const githubService = {
      getConnection: vi.fn().mockResolvedValue({
        id: 'conn-1',
        userId: 'user-123',
        githubUserId: 42,
        githubUsername: 'octocat',
        accessToken: 'encrypted-token',
        scope: 'repo',
        connectedAt: 1234567890
      }),
      disconnect: vi.fn()
    }

    const caller = appRouter.createCaller({
      runtime: createTestRuntime('cloud'),
      db: {} as any,
      processManager: {} as any,
      loopService: {} as any,
      chatService: {} as any,
      monitoringService: {} as any,
      previewService: {} as any,
      projectService: {} as any,
      presetService: {} as any,
      settingsService: {} as any,
      hatsPresetService: {} as any,
      taskService: {} as any,
      githubService: githubService as any,
      userId: 'user-123'
    })

    await expect(caller.github.getConnection()).resolves.toEqual({
      githubUserId: 42,
      githubUsername: 'octocat',
      scope: 'repo',
      connectedAt: 1234567890
    })
    expect(githubService.getConnection).toHaveBeenCalledWith('user-123')
  })

  it('disconnects the authenticated user connection', async () => {
    const githubService = {
      getConnection: vi.fn(),
      disconnect: vi.fn().mockResolvedValue(undefined)
    }

    const caller = appRouter.createCaller({
      runtime: createTestRuntime('cloud'),
      db: {} as any,
      processManager: {} as any,
      loopService: {} as any,
      chatService: {} as any,
      monitoringService: {} as any,
      previewService: {} as any,
      projectService: {} as any,
      presetService: {} as any,
      settingsService: {} as any,
      hatsPresetService: {} as any,
      taskService: {} as any,
      githubService: githubService as any,
      userId: 'user-123'
    })

    await expect(caller.github.disconnect()).resolves.toBeUndefined()
    expect(githubService.disconnect).toHaveBeenCalledWith('user-123')
  })

  it('lists repositories for the authenticated user without exposing the token', async () => {
    const githubService = {
      getConnection: vi.fn(),
      disconnect: vi.fn(),
      getDecryptedToken: vi.fn().mockResolvedValue('token-123'),
      listRepos: vi.fn().mockResolvedValue({
        repos: [
          {
            id: 100,
            fullName: 'octocat/hello-world',
            private: true,
            defaultBranch: 'main',
            htmlUrl: 'https://github.com/octocat/hello-world'
          }
        ],
        hasMore: false
      })
    }

    const caller = appRouter.createCaller({
      runtime: createTestRuntime('cloud'),
      db: {} as any,
      processManager: {} as any,
      loopService: {} as any,
      chatService: {} as any,
      monitoringService: {} as any,
      previewService: {} as any,
      projectService: {} as any,
      presetService: {} as any,
      settingsService: {} as any,
      hatsPresetService: {} as any,
      taskService: {} as any,
      githubService: githubService as any,
      userId: 'user-123'
    })

    await expect(caller.github.listRepos({ page: 2 })).resolves.toEqual({
      repos: [
        {
          id: 100,
          fullName: 'octocat/hello-world',
          private: true,
          defaultBranch: 'main',
          htmlUrl: 'https://github.com/octocat/hello-world'
        }
      ],
      hasMore: false
    })

    expect(githubService.getDecryptedToken).toHaveBeenCalledWith('user-123')
    expect(githubService.listRepos).toHaveBeenCalledWith('token-123', 2)
  })
})
