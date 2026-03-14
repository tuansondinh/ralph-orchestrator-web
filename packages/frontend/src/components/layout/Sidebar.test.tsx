import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { Sidebar } from '@/components/layout/Sidebar'

vi.mock('@/components/project/NewProjectDialog', () => ({
  NewProjectDialog: () => <div>new-project-dialog</div>
}))

vi.mock('@/components/project/ProjectList', () => ({
  ProjectList: () => <div>project-list</div>
}))

describe('Sidebar', () => {
  it('exposes a dashboard link from project navigation', () => {
    render(
      <MemoryRouter initialEntries={['/project/project-1/loops']}>
        <Sidebar
          connectionStatus="connected"
          onProjectCreated={vi.fn()}
          onProjectDelete={vi.fn()}
          onProjectSelect={vi.fn()}
          reconnectAttempt={0}
        />
      </MemoryRouter>
    )

    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/')
  })
})
