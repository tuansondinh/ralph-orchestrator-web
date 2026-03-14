import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { NewProjectDialog } from '@/components/project/NewProjectDialog'
import { capabilitiesApi } from '@/lib/capabilitiesApi'
import { githubApi } from '@/lib/githubApi'
import { projectApi } from '@/lib/projectApi'
import { resetProjectStore } from '@/stores/projectStore'

vi.mock('@/lib/capabilitiesApi', () => ({
  capabilitiesApi: {
    get: vi.fn()
  }
}))

vi.mock('@/lib/githubApi', () => ({
  githubApi: {
    getConnection: vi.fn(),
    listRepos: vi.fn()
  }
}))

vi.mock('@/lib/projectApi', () => ({
  projectApi: {
    create: vi.fn(),
    createFromGitHub: vi.fn(),
    selectDirectory: vi.fn()
  }
}))

describe('NewProjectDialog', () => {
  const createdProject = {
    id: 'project-1',
    name: 'hello-world',
    path: '/srv/ralph/hello-world',
    type: 'node',
    ralphConfig: 'ralph.yml',
    createdAt: 1,
    updatedAt: 1,
    userId: 'user-1',
    githubOwner: 'octocat',
    githubRepo: 'hello-world',
    defaultBranch: 'main',
    workspacePath: '/srv/ralph/hello-world'
  }

  beforeEach(() => {
    vi.clearAllMocks()
    resetProjectStore()
    vi.mocked(githubApi.getConnection).mockResolvedValue(null)
    vi.mocked(githubApi.listRepos).mockResolvedValue({
      repos: [],
      hasMore: false
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('renders the local directory picker flow outside cloud mode', async () => {
    vi.mocked(capabilitiesApi.get).mockResolvedValue({
      mode: 'local',
      database: true,
      auth: false,
      localProjects: true,
      githubProjects: false,
      terminal: true,
      preview: true,
      localDirectoryPicker: true,
      mcp: true
    })

    render(
      <MemoryRouter>
        <NewProjectDialog onCreated={vi.fn()} />
      </MemoryRouter>
    )

    fireEvent.click(screen.getByRole('button', { name: 'New Project' }))

    expect(await screen.findByLabelText('Project name')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open Existing' })).toBeInTheDocument()
  })

  it('renders the cloud project creation form in cloud mode', async () => {
    vi.mocked(capabilitiesApi.get).mockResolvedValue({
      mode: 'cloud',
      database: true,
      auth: true,
      localProjects: false,
      githubProjects: true,
      terminal: false,
      preview: false,
      localDirectoryPicker: false,
      mcp: false
    })
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

    render(
      <MemoryRouter>
        <NewProjectDialog onCreated={vi.fn()} />
      </MemoryRouter>
    )

    fireEvent.click(screen.getByRole('button', { name: 'New Project' }))

    expect(await screen.findByRole('heading', { name: 'Create cloud project' })).toBeInTheDocument()
    expect(await screen.findByLabelText('Repository name')).toBeInTheDocument()
    expect(screen.getByLabelText('Description')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.queryByText('Loading GitHub connection...')).not.toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: 'Private' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    expect(screen.getByRole('button', { name: 'Clone Repo' })).toBeInTheDocument()
  })

  it('creates a cloud project from the dialog form', async () => {
    const onCreated = vi.fn()

    vi.mocked(capabilitiesApi.get).mockResolvedValue({
      mode: 'cloud',
      database: true,
      auth: true,
      localProjects: false,
      githubProjects: true,
      terminal: false,
      preview: false,
      localDirectoryPicker: false,
      mcp: false
    })
    vi.mocked(githubApi.getConnection).mockResolvedValue({
      githubUserId: 42,
      githubUsername: 'octocat',
      scope: 'repo',
      connectedAt: Date.UTC(2026, 2, 10, 8, 0, 0)
    })
    vi.mocked(projectApi.createFromGitHub).mockResolvedValue(createdProject)

    render(
      <MemoryRouter>
        <NewProjectDialog onCreated={onCreated} />
      </MemoryRouter>
    )

    fireEvent.click(screen.getByRole('button', { name: 'New Project' }))
    fireEvent.change(await screen.findByLabelText('Repository name'), {
      target: { value: 'hello-world' }
    })
    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'Fresh repo' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Public' }))
    fireEvent.click(screen.getByRole('button', { name: 'Create Project' }))

    await waitFor(() => {
      expect(projectApi.createFromGitHub).toHaveBeenCalledWith({
        name: 'hello-world',
        description: 'Fresh repo',
        private: false
      })
      expect(onCreated).toHaveBeenCalledWith(createdProject)
    })
  })

  it('clones an existing GitHub repository from the cloud dialog', async () => {
    const onCreated = vi.fn()

    vi.mocked(capabilitiesApi.get).mockResolvedValue({
      mode: 'cloud',
      database: true,
      auth: true,
      localProjects: false,
      githubProjects: true,
      terminal: false,
      preview: false,
      localDirectoryPicker: false,
      mcp: false
    })
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
        <NewProjectDialog onCreated={onCreated} />
      </MemoryRouter>
    )

    fireEvent.click(screen.getByRole('button', { name: 'New Project' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Clone Repo' }))
    fireEvent.click(
      await screen.findByRole('button', { name: 'Create from octocat/hello-world' })
    )

    await waitFor(() => {
      expect(projectApi.createFromGitHub).toHaveBeenCalledWith({
        owner: 'octocat',
        repo: 'hello-world',
        defaultBranch: 'main'
      })
      expect(onCreated).toHaveBeenCalledWith(createdProject)
    })
  })

  it('opens directly on the clone tab from the global dialog event', async () => {
    vi.mocked(capabilitiesApi.get).mockResolvedValue({
      mode: 'cloud',
      database: true,
      auth: true,
      localProjects: false,
      githubProjects: true,
      terminal: false,
      preview: false,
      localDirectoryPicker: false,
      mcp: false
    })
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

    render(
      <MemoryRouter>
        <NewProjectDialog enableGlobalShortcut onCreated={vi.fn()} showTrigger={false} />
      </MemoryRouter>
    )

    window.dispatchEvent(
      new CustomEvent('ralph:new-project', {
        detail: { cloudMode: 'clone' }
      })
    )

    expect(
      await screen.findByText('Choose a GitHub repository to clone onto the cloud workspace.')
    ).toBeInTheDocument()
    expect(screen.queryByLabelText('Repository name')).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Create from octocat/hello-world' })
    ).toBeInTheDocument()
  })

  it('uses stacked mobile layout primitives inside the local project dialog', async () => {
    vi.mocked(capabilitiesApi.get).mockResolvedValue({
      mode: 'local',
      database: true,
      auth: false,
      localProjects: true,
      githubProjects: false,
      terminal: true,
      preview: true,
      localDirectoryPicker: true,
      mcp: true
    })

    render(
      <MemoryRouter>
        <NewProjectDialog onCreated={vi.fn()} />
      </MemoryRouter>
    )

    fireEvent.click(screen.getByRole('button', { name: 'New Project' }))

    const projectName = await screen.findByLabelText('Project name')
    expect(projectName).toBeInTheDocument()

    const createPathRow = screen.getByPlaceholderText('/path/to/new/project').closest('div')
    expect(createPathRow).toHaveClass('flex-col')
    expect(createPathRow).toHaveClass('sm:flex-row')

    const actionRow = screen.getByRole('button', { name: 'Create' }).closest('div')
    expect(actionRow).toHaveClass('flex-col-reverse')
    expect(actionRow).toHaveClass('sm:flex-row')
    expect(actionRow).toHaveClass('sm:justify-end')
  })
})
