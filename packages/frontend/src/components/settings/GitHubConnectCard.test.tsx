import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { GitHubConnectCard } from '@/components/settings/GitHubConnectCard'
import { capabilitiesApi } from '@/lib/capabilitiesApi'
import { githubApi } from '@/lib/githubApi'

vi.mock('@/lib/capabilitiesApi', () => ({
  capabilitiesApi: {
    get: vi.fn()
  }
}))

vi.mock('@/lib/githubApi', () => ({
  githubApi: {
    getConnection: vi.fn(),
    beginConnection: vi.fn(),
    disconnect: vi.fn()
  }
}))

describe('GitHubConnectCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
  })

  afterEach(() => {
    cleanup()
  })

  it('renders a connect action when no GitHub connection exists', async () => {
    vi.mocked(githubApi.getConnection).mockResolvedValue(null)

    render(
      <MemoryRouter>
        <GitHubConnectCard />
      </MemoryRouter>
    )

    expect(await screen.findByRole('heading', { name: 'GitHub connector' })).toBeInTheDocument()
    expect(screen.getByText('GitHub is not connected.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Connect GitHub' }))
    expect(githubApi.beginConnection).toHaveBeenCalledTimes(1)
  })

  it('renders an unavailable state when GitHub projects are disabled', async () => {
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
        <GitHubConnectCard />
      </MemoryRouter>
    )

    expect(
      await screen.findByText('GitHub connection is unavailable in this runtime.')
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Connect GitHub' })).not.toBeInTheDocument()
  })

  it('renders the connected username and disconnect action', async () => {
    vi.mocked(githubApi.getConnection).mockResolvedValue({
      githubUserId: 42,
      githubUsername: 'octocat',
      scope: 'repo',
      connectedAt: Date.UTC(2026, 2, 9, 12, 0, 0)
    })

    render(
      <MemoryRouter>
        <GitHubConnectCard />
      </MemoryRouter>
    )

    expect(await screen.findByText('Connected as @octocat')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Disconnect GitHub' })).toBeInTheDocument()
  })

  it('disconnects and refreshes back to the disconnected state', async () => {
    vi.mocked(githubApi.getConnection)
      .mockResolvedValueOnce({
        githubUserId: 42,
        githubUsername: 'octocat',
        scope: 'repo',
        connectedAt: Date.UTC(2026, 2, 9, 12, 0, 0)
      })
      .mockResolvedValueOnce(null)
    vi.mocked(githubApi.disconnect).mockResolvedValue(undefined)

    render(
      <MemoryRouter>
        <GitHubConnectCard />
      </MemoryRouter>
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Disconnect GitHub' }))

    await waitFor(() => {
      expect(githubApi.disconnect).toHaveBeenCalledTimes(1)
      expect(screen.getByText('GitHub is not connected.')).toBeInTheDocument()
    })
  })
})
