import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import { ProjectService } from '../src/services/ProjectService.js'
import type { ProjectRepository, ProjectRecord, RepositoryBundle } from '../src/db/repositories/contracts.js'
import type { WorkspaceManager } from '../src/services/WorkspaceManager.js'

vi.mock('node:fs/promises', () => ({
  access: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn().mockResolvedValue(''),
  writeFile: vi.fn().mockResolvedValue(undefined),
  stat: vi.fn().mockResolvedValue({ isDirectory: () => true }),
  rm: vi.fn().mockResolvedValue(undefined)
}))

vi.mock('../src/lib/detect.js', () => ({
  detectProjectType: vi.fn().mockResolvedValue('node'),
  detectRalphConfig: vi.fn().mockResolvedValue('ralph.yml')
}))

describe('CloudProjectService', () => {
  let mockProjectRepo: ProjectRepository
  let mockFindByGitHubRepo: Mock<NonNullable<ProjectRepository['findByGitHubRepo']>>
  let mockFindByUserId: Mock<NonNullable<ProjectRepository['findByUserId']>>
  let mockWorkspaceManager: WorkspaceManager
  let projectService: ProjectService
  let createdProjects: Map<string, ProjectRecord>

  beforeEach(() => {
    vi.clearAllMocks()
    createdProjects = new Map()
    mockFindByGitHubRepo = vi.fn<NonNullable<ProjectRepository['findByGitHubRepo']>>().mockResolvedValue(
      null
    )
    mockFindByUserId = vi.fn<NonNullable<ProjectRepository['findByUserId']>>().mockResolvedValue([])

    mockProjectRepo = {
      list: vi.fn().mockResolvedValue([]),
      findById: vi.fn().mockImplementation((id: string) => {
        return Promise.resolve(createdProjects.get(id) ?? null)
      }),
      create: vi.fn().mockImplementation((p: ProjectRecord) => {
        createdProjects.set(p.id, p)
        return Promise.resolve(p)
      }),
      update: vi.fn().mockResolvedValue({} as ProjectRecord),
      delete: vi.fn().mockResolvedValue(undefined),
      findByGitHubRepo: mockFindByGitHubRepo,
      findByUserId: mockFindByUserId
    }

    mockWorkspaceManager = {
      prepare: vi.fn().mockResolvedValue('/workspace/project-123'),
      pushBranch: vi.fn().mockResolvedValue(undefined),
      cleanup: vi.fn().mockResolvedValue(undefined),
      exists: vi.fn().mockResolvedValue(false)
    }

    const mockRepos = {
      projects: mockProjectRepo,
      notifications: {
        list: vi.fn().mockResolvedValue([]),
        findById: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({}),
        delete: vi.fn().mockResolvedValue(undefined)
      },
      loopRuns: {
        listAll: vi.fn().mockResolvedValue([]),
        listByProjectId: vi.fn().mockResolvedValue([]),
        findById: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({}),
        findByState: vi.fn().mockResolvedValue([])
      },
      chats: {
        findSessionById: vi.fn().mockResolvedValue(null),
        findLatestActiveSessionByProjectId: vi.fn().mockResolvedValue(null),
        createSession: vi.fn().mockResolvedValue({}),
        updateSession: vi.fn().mockResolvedValue({}),
        listMessagesBySessionId: vi.fn().mockResolvedValue([]),
        createMessage: vi.fn().mockResolvedValue({})
      },
      settings: {
        list: vi.fn().mockResolvedValue([]),
        get: vi.fn().mockResolvedValue(null),
        upsert: vi.fn().mockResolvedValue({}),
        delete: vi.fn().mockResolvedValue(undefined)
      },
      githubConnections: {
        findByUserId: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockResolvedValue(undefined)
      },
      loopOutput: {
        append: vi.fn().mockResolvedValue(undefined),
        getByLoopRunId: vi.fn().mockResolvedValue([]),
        deleteByLoopRunId: vi.fn().mockResolvedValue(undefined)
      }
    } as RepositoryBundle

    projectService = new ProjectService(mockRepos as RepositoryBundle)
    projectService.setWorkspaceManager(mockWorkspaceManager)
  })

  describe('createFromGitHub', () => {
    it('creates project and clones repo', async () => {
      const params = {
        userId: 'user-123',
        githubOwner: 'acme',
        githubRepo: 'my-app',
        defaultBranch: 'main',
        githubToken: 'gho_test_token',
        name: 'My App'
      }

      const project = await projectService.createFromGitHub(params)

      expect(mockWorkspaceManager.prepare).toHaveBeenCalledWith({
        projectId: expect.any(String),
        githubOwner: 'acme',
        githubRepo: 'my-app',
        branch: 'main',
        token: 'gho_test_token'
      })

      expect(mockProjectRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'My App',
          path: '/workspace/project-123',
          userId: 'user-123',
          githubOwner: 'acme',
          githubRepo: 'my-app',
          defaultBranch: 'main',
          workspacePath: '/workspace/project-123'
        })
      )

      expect(project.name).toBe('My App')
      expect(project.path).toBe('/workspace/project-123')
    })

    it('uses repo name as project name when not provided', async () => {
      const params = {
        userId: 'user-123',
        githubOwner: 'acme',
        githubRepo: 'my-app',
        defaultBranch: 'main',
        githubToken: 'gho_test_token'
      }

      const project = await projectService.createFromGitHub(params)

      expect(project.name).toBe('my-app')
    })

    it('rejects duplicate GitHub repos', async () => {
      mockFindByGitHubRepo.mockResolvedValueOnce({
        id: 'existing-project',
        name: 'Existing Project',
        path: '/workspace/existing-project',
        type: 'node',
        ralphConfig: 'ralph.yml',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        userId: 'user-123',
        githubOwner: 'acme',
        githubRepo: 'my-app',
        defaultBranch: 'main',
        workspacePath: '/workspace/existing-project'
      })

      const params = {
        userId: 'user-123',
        githubOwner: 'acme',
        githubRepo: 'my-app',
        defaultBranch: 'main',
        githubToken: 'gho_test_token'
      }

      await expect(projectService.createFromGitHub(params)).rejects.toThrow(
        'Project already exists for acme/my-app'
      )

      expect(mockWorkspaceManager.prepare).not.toHaveBeenCalled()
      expect(mockProjectRepo.create).not.toHaveBeenCalled()
    })
  })

  describe('findByUserId', () => {
    it('returns projects for a user', async () => {
      const mockProjects: ProjectRecord[] = [
        {
          id: 'project-1',
          name: 'Project 1',
          path: '/workspace/project-1',
          type: 'node',
          ralphConfig: 'ralph.yml',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          userId: 'user-123',
          githubOwner: 'acme',
          githubRepo: 'app1',
          defaultBranch: 'main',
          workspacePath: '/workspace/project-1'
        },
        {
          id: 'project-2',
          name: 'Project 2',
          path: '/workspace/project-2',
          type: 'python',
          ralphConfig: 'ralph.yml',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          userId: 'user-123',
          githubOwner: 'acme',
          githubRepo: 'app2',
          defaultBranch: 'main',
          workspacePath: '/workspace/project-2'
        }
      ]

      mockFindByUserId.mockResolvedValueOnce(mockProjects)

      const result = await projectService.findByUserId('user-123')

      expect(mockProjectRepo.findByUserId).toHaveBeenCalledWith('user-123')
      expect(result).toHaveLength(2)
      expect(result[0].name).toBe('Project 1')
      expect(result[1].name).toBe('Project 2')
    })

    it('returns empty array when user has no projects', async () => {
      mockFindByUserId.mockResolvedValueOnce([])

      const result = await projectService.findByUserId('user-456')

      expect(result).toEqual([])
    })
  })

  describe('findByGitHubRepo', () => {
    it('returns project for a GitHub repo', async () => {
      const mockProject: ProjectRecord = {
        id: 'project-1',
        name: 'My App',
        path: '/workspace/project-1',
        type: 'node',
        ralphConfig: 'ralph.yml',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        userId: 'user-123',
        githubOwner: 'acme',
        githubRepo: 'my-app',
        defaultBranch: 'main',
        workspacePath: '/workspace/project-1'
      }

      mockFindByGitHubRepo.mockResolvedValueOnce(mockProject)

      const result = await projectService.findByGitHubRepo('user-123', 'acme', 'my-app')

      expect(mockProjectRepo.findByGitHubRepo).toHaveBeenCalledWith('user-123', 'acme', 'my-app')
      expect(result?.name).toBe('My App')
    })

    it('returns null when project not found', async () => {
      mockFindByGitHubRepo.mockResolvedValueOnce(null)

      const result = await projectService.findByGitHubRepo('user-123', 'acme', 'nonexistent')

      expect(result).toBeNull()
    })
  })
})
