import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ProjectPage } from '@/pages/ProjectPage'
import { resetProjectStore, useProjectStore } from '@/stores/projectStore'

vi.mock('@/hooks/useCapabilities', () => ({
  useCapabilities: () => ({
    capabilities: null
  })
}))

vi.mock('@/components/project/ProjectHeader', () => ({
  ProjectHeader: ({ project }: { project: { name: string } }) => (
    <div data-testid="project-header">{project.name}</div>
  )
}))

vi.mock('@/components/layout/TabBar', () => ({
  TabBar: ({ projectId }: { projectId: string }) => (
    <nav aria-label="Project sections" data-testid="tab-bar">
      {projectId}
    </nav>
  )
}))

vi.mock('@/components/chat/ChatView', () => ({
  ChatView: ({ projectId }: { projectId: string }) => (
    <div data-testid="chat-view">{projectId}</div>
  )
}))

vi.mock('@/components/loops/LoopsView', () => ({
  LoopsView: ({ projectId }: { projectId: string }) => (
    <div data-testid="loops-view">{projectId}</div>
  )
}))

vi.mock('@/components/tasks/TasksView', () => ({
  TasksView: ({ projectId }: { projectId: string }) => (
    <div data-testid="tasks-view">{projectId}</div>
  )
}))

vi.mock('@/components/terminal/TerminalView', () => ({
  TerminalView: ({ projectId }: { projectId: string }) => (
    <div data-testid="terminal-view">{projectId}</div>
  )
}))

vi.mock('@/components/monitor/MonitorView', () => ({
  MonitorView: ({ projectId }: { projectId: string }) => (
    <div data-testid="monitor-view">{projectId}</div>
  )
}))

vi.mock('@/components/preview/PreviewView', () => ({
  PreviewView: ({ projectId }: { projectId: string }) => (
    <div data-testid="preview-view">{projectId}</div>
  )
}))

vi.mock('@/components/project/HatsPresetsView', () => ({
  HatsPresetsView: ({ projectId }: { projectId: string }) => (
    <div data-testid="hats-presets-view">{projectId}</div>
  )
}))

vi.mock('@/components/project/ProjectConfigView', () => ({
  ProjectConfigView: ({ projectId }: { projectId: string }) => (
    <div data-testid="project-config-view">{projectId}</div>
  )
}))

type MatchMediaController = {
  set: (query: string, matches: boolean) => void
}

const matchMediaController = (
  window as Window & typeof globalThis & { __matchMediaController: MatchMediaController }
).__matchMediaController

function renderProjectPage(path: string) {
  const view = render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<ProjectPage />} path="/project/:id/:tab" />
      </Routes>
    </MemoryRouter>
  )

  const section = view.container.querySelector('section')
  if (!section) {
    throw new Error('Expected ProjectPage to render a section element')
  }

  return {
    ...view,
    section
  }
}

describe('ProjectPage', () => {
  beforeEach(() => {
    resetProjectStore()
    useProjectStore.setState({
      projects: [
        {
          id: 'project-1',
          name: 'Project One',
          path: '/tmp/project-one',
          type: 'node',
          ralphConfig: null,
          createdAt: Date.parse('2026-03-10T00:00:00.000Z'),
          updatedAt: Date.parse('2026-03-10T00:00:00.000Z')
        }
      ],
      isLoading: false
    })
    matchMediaController.set('(max-width: 767px)', false)
  })

  afterEach(() => {
    cleanup()
    resetProjectStore()
    matchMediaController.set('(max-width: 767px)', false)
  })

  it('hides the project header and tab bar on mobile chat', () => {
    matchMediaController.set('(max-width: 767px)', true)

    const { section } = renderProjectPage('/project/project-1/chat')

    expect(screen.queryByTestId('project-header')).not.toBeInTheDocument()
    expect(screen.queryByTestId('tab-bar')).not.toBeInTheDocument()
    expect(screen.getByTestId('chat-view')).toBeInTheDocument()
    expect(section).toHaveClass('flex', 'h-[100dvh]', 'flex-col')
    expect(section).not.toHaveClass('min-h-0', 'flex-1', 'gap-3', 'overflow-hidden')
  })

  it('keeps the existing chrome on mobile non-chat tabs', () => {
    matchMediaController.set('(max-width: 767px)', true)

    const { section } = renderProjectPage('/project/project-1/loops')

    expect(screen.getByTestId('project-header')).toBeInTheDocument()
    expect(screen.getByTestId('tab-bar')).toBeInTheDocument()
    expect(screen.getByTestId('loops-view')).toBeInTheDocument()
    expect(section).toHaveClass(
      'flex',
      'h-full',
      'min-h-0',
      'min-w-0',
      'flex-1',
      'flex-col',
      'gap-3',
      'overflow-hidden'
    )
    expect(section).not.toHaveClass('h-[100dvh]')
  })

  it('keeps the existing chrome on desktop chat', () => {
    const { section } = renderProjectPage('/project/project-1/chat')

    expect(screen.getByTestId('project-header')).toBeInTheDocument()
    expect(screen.getByTestId('tab-bar')).toBeInTheDocument()
    expect(screen.getByTestId('chat-view')).toBeInTheDocument()
    expect(section).toHaveClass(
      'flex',
      'h-full',
      'min-h-0',
      'min-w-0',
      'flex-1',
      'flex-col',
      'gap-3',
      'overflow-hidden'
    )
    expect(section).not.toHaveClass('h-[100dvh]')
  })
})
