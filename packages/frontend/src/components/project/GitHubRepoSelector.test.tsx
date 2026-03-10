import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { GitHubRepoSelector } from '@/components/project/GitHubRepoSelector'
import { githubApi } from '@/lib/githubApi'
import { projectApi, type ProjectRecord } from '@/lib/projectApi'

vi.mock('@/lib/githubApi', () => ({
  githubApi: {
    getConnection: vi.fn(),
    listRepos: vi.fn()
  }
}))

vi.mock('@/lib/projectApi', () => ({
  projectApi: {
    createFromGitHub: vi.fn()
  }
}))

describe('GitHubRepoSelector', () => {
  const createdProject: ProjectRecord = {
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
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders repositories from the authenticated GitHub connection', async () => {
    vi.mocked(githubApi.getConnection).mockResolvedValue({
      githubUserId: 42,
      githubUsername: 'octocat',
      scope: 'repo',
      connectedAt: Date.UTC(2026, 2, 10, 8, 0, 0)
    })
    vi.mocked(githubApi.listRepos).mockResolvedValue({
      repos: [
        {
          id: 100,
          fullName: 'octocat/hello-world',
          private: true,
          defaultBranch: 'main',
          htmlUrl: 'https://github.com/octocat/hello-world'
        },
        {
          id: 101,
          fullName: 'octocat/public-repo',
          private: false,
          defaultBranch: 'main',
          htmlUrl: 'https://github.com/octocat/public-repo'
        }
      ],
      hasMore: false
    })

    render(
      <MemoryRouter>
        <GitHubRepoSelector onProjectCreated={vi.fn()} />
      </MemoryRouter>
    )

    expect(await screen.findByText('octocat/hello-world')).toBeInTheDocument()
    expect(screen.getByText('Private')).toBeInTheDocument()
    expect(screen.getByText('Public')).toBeInTheDocument()
    expect(githubApi.listRepos).toHaveBeenCalledWith({ page: 1 })
  })

  it('creates a cloud project from the selected repository', async () => {
    const onProjectCreated = vi.fn()

    vi.mocked(githubApi.getConnection).mockResolvedValue({
      githubUserId: 42,
      githubUsername: 'octocat',
      scope: 'repo',
      connectedAt: Date.UTC(2026, 2, 10, 8, 0, 0)
    })
    vi.mocked(githubApi.listRepos).mockResolvedValue({
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
    vi.mocked(projectApi.createFromGitHub).mockResolvedValue(createdProject)

    render(
      <MemoryRouter>
        <GitHubRepoSelector onProjectCreated={onProjectCreated} />
      </MemoryRouter>
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Create from octocat/hello-world' }))

    await waitFor(() => {
      expect(projectApi.createFromGitHub).toHaveBeenCalledWith({
        githubOwner: 'octocat',
        githubRepo: 'hello-world',
        defaultBranch: 'main'
      })
    })
    expect(onProjectCreated).toHaveBeenCalledWith(createdProject)
  })

  it('shows a connect GitHub prompt when no connection exists', async () => {
    vi.mocked(githubApi.getConnection).mockResolvedValue(null)

    render(
      <MemoryRouter>
        <GitHubRepoSelector onProjectCreated={vi.fn()} />
      </MemoryRouter>
    )

    expect(
      await screen.findByText('Connect GitHub in Settings before creating a cloud project.')
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open Settings' })).toHaveAttribute(
      'href',
      '/settings'
    )
  })
})
