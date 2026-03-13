import { describe, expect, it, vi } from 'vitest'
import { appRouter } from '../src/trpc/router.js'
import { createTestRuntime } from './test-helpers.js'

/* eslint-disable @typescript-eslint/no-explicit-any */

describe('project tRPC router', () => {
  it('creates a cloud project from a new GitHub repository request', async () => {
    const projectService = {
      createFromGitHub: vi.fn().mockResolvedValue({
        id: 'project-1',
        name: 'hello-world',
        path: '/srv/ralph/octocat/hello-world/project-1',
        type: 'node',
        ralphConfig: 'ralph.yml',
        createdAt: 1,
        updatedAt: 1,
        userId: 'user-123',
        githubOwner: 'octocat',
        githubRepo: 'hello-world',
        defaultBranch: 'main',
        workspacePath: '/srv/ralph/octocat/hello-world/project-1'
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
      projectService: projectService as any,
      presetService: {} as any,
      settingsService: {} as any,
      hatsPresetService: {} as any,
      taskService: {} as any,
      githubService: {} as any,
      userId: 'user-123'
    })

    await expect(
      caller.project.createFromGitHub({
        name: 'hello-world',
        description: 'Demo app',
        private: false
      })
    ).resolves.toMatchObject({
      id: 'project-1',
      githubOwner: 'octocat',
      githubRepo: 'hello-world'
    })

    expect(projectService.createFromGitHub).toHaveBeenCalledWith({
      userId: 'user-123',
      name: 'hello-world',
      description: 'Demo app',
      private: false
    })
  })
})
