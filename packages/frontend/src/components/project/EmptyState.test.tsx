import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { EmptyState } from '@/components/project/EmptyState'
import { capabilitiesApi } from '@/lib/capabilitiesApi'
import { githubApi } from '@/lib/githubApi'

vi.mock('@/components/project/NewProjectDialog', () => ({
  NewProjectDialog: ({ triggerLabel }: { triggerLabel: string }) => (
    <button type="button">{triggerLabel}</button>
  )
}))

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

describe('EmptyState', () => {
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

  it('shows the GitHub connect action on the empty dashboard', async () => {
    vi.mocked(githubApi.getConnection).mockResolvedValue(null)

    render(
      <MemoryRouter>
        <EmptyState onProjectCreated={vi.fn()} />
      </MemoryRouter>
    )

    const connectButton = await screen.findByRole('button', { name: 'Connect GitHub' })
    expect(connectButton).toBeInTheDocument()

    fireEvent.click(connectButton)
    expect(githubApi.beginConnection).toHaveBeenCalledTimes(1)
  })
})
