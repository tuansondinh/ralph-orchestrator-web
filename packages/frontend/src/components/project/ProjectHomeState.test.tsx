import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { ProjectHomeState } from '@/components/project/ProjectHomeState'
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

describe('ProjectHomeState', () => {
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

  it('shows the GitHub connect action on the dashboard when not connected', async () => {
    vi.mocked(githubApi.getConnection).mockResolvedValue(null)

    render(
      <MemoryRouter>
        <ProjectHomeState
          onProjectCreated={vi.fn()}
          onProjectSelect={vi.fn()}
          projects={[
            {
              id: 'project-1',
              name: 'Acme',
              path: '/workspace/acme',
              type: 'vite',
              ralphConfig: null,
              createdAt: Date.UTC(2026, 2, 1),
              updatedAt: Date.UTC(2026, 2, 10)
            }
          ]}
        />
      </MemoryRouter>
    )

    const connectButton = await screen.findByRole('button', { name: 'Connect GitHub' })
    expect(connectButton).toBeInTheDocument()

    fireEvent.click(connectButton)
    expect(githubApi.beginConnection).toHaveBeenCalledTimes(1)
  })
})
