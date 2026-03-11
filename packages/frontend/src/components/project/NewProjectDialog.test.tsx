import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { NewProjectDialog } from '@/components/project/NewProjectDialog'
import { capabilitiesApi } from '@/lib/capabilitiesApi'
import { githubApi } from '@/lib/githubApi'
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

  it('renders the GitHub repository selector in cloud mode', async () => {
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
    expect(screen.queryByLabelText('Project name')).not.toBeInTheDocument()
    expect(await screen.findByText('octocat/hello-world')).toBeInTheDocument()
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
