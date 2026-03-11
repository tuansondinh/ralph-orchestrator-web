import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ProjectPage } from '@/pages/ProjectPage'
import { resetProjectStore, useProjectStore } from '@/stores/projectStore'
import type { ProjectRecord } from '@/lib/projectApi'

const { useMediaQueryMock } = vi.hoisted(() => ({
  useMediaQueryMock: vi.fn(() => false)
}))

vi.mock('@/hooks/useCapabilities', () => ({
  useCapabilities: () => ({
    capabilities: {
      preview: true
    }
  })
}))

vi.mock('@/hooks/useMediaQuery', () => ({
  useMediaQuery: useMediaQueryMock
}))

vi.mock('@/components/chat/ChatView', () => ({
  ChatView: ({ projectId }: { projectId: string }) => (
    <div data-testid="chat-view">{`chat:${projectId}`}</div>
  )
}))

vi.mock('@/components/layout/TabBar', () => ({
  TabBar: () => <div data-testid="tab-bar" />
}))

vi.mock('@/components/loops/LoopsView', () => ({
  LoopsView: ({ projectId }: { projectId: string }) => (
    <div data-testid="loops-view">{`loops:${projectId}`}</div>
  )
}))

vi.mock('@/components/monitor/MonitorView', () => ({
  MonitorView: () => <div data-testid="monitor-view" />
}))

vi.mock('@/components/preview/PreviewView', () => ({
  PreviewView: () => <div data-testid="preview-view" />
}))

vi.mock('@/components/project/HatsPresetsView', () => ({
  HatsPresetsView: () => <div data-testid="hats-presets-view" />
}))

vi.mock('@/components/project/ProjectHeader', () => ({
  ProjectHeader: () => <div data-testid="project-header" />
}))

vi.mock('@/components/project/ProjectConfigView', () => ({
  ProjectConfigView: () => <div data-testid="project-config-view" />
}))

vi.mock('@/components/tasks/TasksView', () => ({
  TasksView: () => <div data-testid="tasks-view" />
}))

vi.mock('@/components/terminal/TerminalView', () => ({
  TerminalView: () => <div data-testid="terminal-view" />
}))

function makeProject(overrides: Partial<ProjectRecord> = {}): ProjectRecord {
  return {
    id: overrides.id ?? 'project-1',
    name: overrides.name ?? 'Test Project',
    path: overrides.path ?? '/projects/test',
    type: overrides.type ?? 'node',
    ralphConfig: overrides.ralphConfig ?? 'ralph.yml',
    createdAt: overrides.createdAt ?? 1000,
    updatedAt: overrides.updatedAt ?? 1000
  }
}

describe('ProjectPage', () => {
  beforeEach(() => {
    resetProjectStore()
    useProjectStore.getState().setProjects([makeProject()])
    useProjectStore.getState().setLoading(false)
    useMediaQueryMock.mockReturnValue(false)
  })

  afterEach(() => {
    cleanup()
  })

  it('renders the chat tab when the route requests /project/:id/chat', () => {
    render(
      <MemoryRouter initialEntries={['/project/project-1/chat']}>
        <Routes>
          <Route path="/project/:id/:tab" element={<ProjectPage />} />
        </Routes>
      </MemoryRouter>
    )

    expect(screen.getByTestId('chat-view')).toHaveTextContent('chat:project-1')
    expect(screen.queryByTestId('loops-view')).not.toBeInTheDocument()
  })

  it('hides the project header on mobile chat routes to maximize chat space', () => {
    useMediaQueryMock.mockReturnValue(true)

    render(
      <MemoryRouter initialEntries={['/project/project-1/chat']}>
        <Routes>
          <Route path="/project/:id/:tab" element={<ProjectPage />} />
        </Routes>
      </MemoryRouter>
    )

    expect(screen.getByTestId('chat-view')).toHaveTextContent('chat:project-1')
    expect(screen.queryByTestId('project-header')).not.toBeInTheDocument()
    expect(screen.getByTestId('tab-bar')).toBeInTheDocument()
  })

  it('shows a loading state instead of project-not-found while projects are still hydrating', () => {
    useProjectStore.getState().setProjects([])
    useProjectStore.getState().setLoading(true)

    render(
      <MemoryRouter initialEntries={['/project/project-1/chat']}>
        <Routes>
          <Route path="/project/:id/:tab" element={<ProjectPage />} />
        </Routes>
      </MemoryRouter>
    )

    expect(screen.getByText('Loading project...')).toBeInTheDocument()
    expect(screen.queryByText('Project not found')).not.toBeInTheDocument()
  })
})
