import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { projectApi, type ProjectRecord } from '@/lib/projectApi'
import { monitoringApi } from '@/lib/monitoringApi'
import { taskApi } from '@/lib/taskApi'
import { terminalApi } from '@/lib/terminalApi'
import { worktreeApi } from '@/lib/worktreeApi'
import { resetLoopStore } from '@/stores/loopStore'
import { resetProjectStore } from '@/stores/projectStore'
import { resetTerminalStore } from '@/stores/terminalStore'
import App from './App'

const { websocketSendMock } = vi.hoisted(() => ({
  websocketSendMock: vi.fn(() => true)
}))

vi.mock('@/lib/projectApi', () => ({
  projectApi: {
    list: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
    getPrompt: vi.fn(),
    updatePrompt: vi.fn(),
    selectDirectory: vi.fn()
  }
}))

vi.mock('@/lib/terminalApi', () => ({
  terminalApi: {
    getProjectSessions: vi.fn(async () => []),
    getProjectSession: vi.fn(async () => null),
    startSession: vi.fn(),
    endSession: vi.fn(),
    getOutputHistory: vi.fn(async () => [])
  }
}))

vi.mock('@/lib/taskApi', () => ({
  taskApi: {
    list: vi.fn()
  }
}))

vi.mock('@/lib/worktreeApi', () => ({
  worktreeApi: {
    list: vi.fn(async () => []),
    create: vi.fn()
  }
}))

vi.mock('@/lib/monitoringApi', () => ({
  monitoringApi: {
    projectStatus: vi.fn()
  }
}))

vi.mock('@/hooks/useNotifications', () => ({
  useNotifications: () => ({
    notifications: [],
    toasts: [],
    dismissToast: vi.fn(),
    markRead: vi.fn(async () => undefined),
    requestPermission: vi.fn(async () => undefined),
    notificationPermission: 'granted',
    unreadCount: 0,
    isConnected: true,
    connectionStatus: 'connected',
    reconnectAttempt: 0
  })
}))

vi.mock('@/hooks/useWebSocket', () => ({
  useWebSocket: () => ({
    isConnected: true,
    status: 'connected',
    reconnectAttempt: 0,
    send: websocketSendMock
  })
}))

let projects: ProjectRecord[] = []
let terminalSessionCounter = 0

function seedProjects(nextProjects: ProjectRecord[]) {
  projects = nextProjects
}

beforeEach(() => {
  resetLoopStore()
  resetProjectStore()
  resetTerminalStore()
  vi.clearAllMocks()
  terminalSessionCounter = 0
  seedProjects([])
  window.localStorage.clear()
  document.documentElement.classList.remove('dark')
  window.history.pushState({}, '', '/')

  vi.mocked(projectApi.list).mockImplementation(async () => projects)
  vi.mocked(projectApi.create).mockImplementation(async (input) => {
    const createdProject: ProjectRecord = {
      id: `project-${projects.length + 1}`,
      name: input.name,
      path: input.path,
      type: 'node',
      ralphConfig: 'ralph.yml',
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    projects = [...projects, createdProject]
    return createdProject
  })
  vi.mocked(projectApi.delete).mockImplementation(async (id) => {
    projects = projects.filter((project) => project.id !== id)
  })
  vi.mocked(projectApi.getPrompt).mockImplementation(async (projectId: string) => ({
    projectId,
    path: '/tmp/.prompt.md',
    content: ''
  }))
  vi.mocked(projectApi.updatePrompt).mockImplementation(async (projectId: string, input) => ({
    projectId,
    path: '/tmp/.prompt.md',
    content: input.content
  }))
  vi.mocked(worktreeApi.list).mockResolvedValue([])
  vi.mocked(monitoringApi.projectStatus).mockResolvedValue({
    activeLoops: 0,
    totalRuns: 0,
    lastRunAt: null,
    health: 'healthy',
    tokenUsage: 0,
    errorRate: 0
  })
  vi.mocked(projectApi.selectDirectory).mockResolvedValue({
    path: '/tmp/existing-app'
  })
  vi.mocked(taskApi.list).mockResolvedValue([])
  vi.mocked(terminalApi.startSession).mockImplementation(async ({ projectId }) => {
    terminalSessionCounter += 1
    return {
      id: `terminal-${terminalSessionCounter}`,
      projectId,
      state: 'active',
      shell: '/bin/zsh',
      cwd: '/tmp',
      pid: 9999,
      cols: 120,
      rows: 36,
      createdAt: Date.now(),
      endedAt: null
    }
  })
})

afterEach(() => {
  cleanup()
})

describe('App', () => {
  it('shows active loop spinner counts next to project names in the sidebar', async () => {
    seedProjects([
      {
        id: 'alpha',
        name: 'Alpha App',
        path: '/tmp/alpha-app',
        type: 'node',
        ralphConfig: 'ralph.yml',
        createdAt: 1,
        updatedAt: 10
      },
      {
        id: 'beta',
        name: 'Beta App',
        path: '/tmp/beta-app',
        type: 'python',
        ralphConfig: 'ralph.yml',
        createdAt: 2,
        updatedAt: 20
      }
    ])

    vi.mocked(monitoringApi.projectStatus).mockImplementation(async (projectId: string) => {
      if (projectId === 'alpha') {
        return {
          activeLoops: 2,
          totalRuns: 3,
          lastRunAt: Date.now(),
          health: 'healthy',
          tokenUsage: 120,
          errorRate: 0
        }
      }

      if (projectId === 'beta') {
        return {
          activeLoops: 1,
          totalRuns: 4,
          lastRunAt: Date.now(),
          health: 'warning',
          tokenUsage: 200,
          errorRate: 25
        }
      }

      return {
        activeLoops: 0,
        totalRuns: 0,
        lastRunAt: null,
        health: 'healthy',
        tokenUsage: 0,
        errorRate: 0
      }
    })

    render(<App />)

    expect(await screen.findByTestId('project-active-loops-alpha')).toHaveTextContent('2')
    expect(await screen.findByTestId('project-active-loops-beta')).toHaveTextContent('1')
  })

  it('renders empty state when no projects exist', async () => {
    render(<App />)

    expect(await screen.findByRole('heading', { name: 'No projects yet' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create Project' })).toBeInTheDocument()
  })

  it('does not render a floating chat assistant button', async () => {
    render(<App />)

    await screen.findByRole('heading', { name: 'No projects yet' })

    expect(screen.queryByRole('button', { name: 'Open chat assistant' })).not.toBeInTheDocument()
  })

  it('renders developer-focused empty homepage content', async () => {
    render(<App />)

    expect(await screen.findByText('Developer Workspace')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: /Build smarter software with a focused home base/i })
    ).toBeInTheDocument()
    expect(screen.getByText('Workflow Snapshot')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create Project' })).toBeInTheDocument()
  })

  it('toggles the left sidebar visibility', async () => {
    render(<App />)

    const collapseButton = await screen.findByRole('button', { name: 'Collapse sidebar' })
    expect(collapseButton).toBeInTheDocument()

    fireEvent.click(collapseButton)

    const expandButton = screen.getByRole('button', { name: 'Expand sidebar' })
    expect(expandButton).toBeInTheDocument()

    fireEvent.click(expandButton)
    expect(screen.getByRole('button', { name: 'Collapse sidebar' })).toBeInTheDocument()
  })

  it('renders project-aware homepage and opens latest project from hero action', async () => {
    seedProjects([
      {
        id: 'alpha',
        name: 'Alpha App',
        path: '/tmp/alpha-app',
        type: 'node',
        ralphConfig: 'ralph.yml',
        createdAt: 1,
        updatedAt: 10
      },
      {
        id: 'beta',
        name: 'Beta App',
        path: '/tmp/beta-app',
        type: 'python',
        ralphConfig: 'ralph.yml',
        createdAt: 2,
        updatedAt: 20
      }
    ])

    render(<App />)

    expect(
      await screen.findByRole('heading', { name: 'Pick up where your last build left off.' })
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Active Projects' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open Beta App' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Open Workspace' })).toHaveLength(2)

    fireEvent.click(screen.getByRole('button', { name: 'Open Beta App' }))

    expect(await screen.findByRole('heading', { name: 'Beta App' })).toBeInTheDocument()
  })

  it('creates a project from dialog and adds it to sidebar', async () => {
    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: 'Create Project' }))
    fireEvent.change(screen.getByLabelText('Project name'), {
      target: { value: 'Sample App' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))

    expect(await screen.findByRole('button', { name: 'Sample App' })).toBeInTheDocument()
  })

  it('creates a project with selected path in create mode', async () => {
    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: 'Create Project' }))
    fireEvent.change(screen.getByLabelText('Project name'), {
      target: { value: 'Sample App' }
    })

    fireEvent.click(screen.getByRole('button', { name: 'Select Path' }))
    await waitFor(() => {
      expect(projectApi.selectDirectory).toHaveBeenCalled()
    })

    await waitFor(() => {
      expect(screen.getByLabelText('Project path (optional)')).toHaveValue('/tmp/existing-app')
    })

    fireEvent.click(screen.getByRole('button', { name: 'Create' }))

    await waitFor(() => {
      expect(projectApi.create).toHaveBeenCalledWith({
        name: 'Sample App',
        path: '/tmp/existing-app/Sample App',
        createIfMissing: true
      })
    })
  })

  it('opens existing project without name input and derives name from selected path', async () => {
    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: 'Create Project' }))
    fireEvent.click(screen.getByRole('button', { name: 'Open Existing' }))

    expect(screen.queryByLabelText('Project name')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Project path')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Select Path' }))
    await waitFor(() => {
      expect(projectApi.selectDirectory).toHaveBeenCalled()
    })

    await waitFor(() => {
      expect(screen.getByLabelText('Project path')).toHaveValue('/tmp/existing-app')
    })

    fireEvent.click(screen.getByRole('button', { name: 'Open' }))

    await waitFor(() => {
      expect(projectApi.create).toHaveBeenCalledWith({
        name: 'existing-app',
        path: '/tmp/existing-app',
        createIfMissing: false
      })
    })

    expect(await screen.findByRole('button', { name: 'existing-app' })).toBeInTheDocument()
  })

  it('activates a project and shows tabs when selected in sidebar', async () => {
    seedProjects([
      {
        id: 'alpha',
        name: 'Alpha App',
        path: '/tmp/alpha-app',
        type: 'node',
        ralphConfig: 'ralph.yml',
        createdAt: 1,
        updatedAt: 1
      },
      {
        id: 'beta',
        name: 'Beta App',
        path: '/tmp/beta-app',
        type: 'python',
        ralphConfig: 'ralph.yml',
        createdAt: 2,
        updatedAt: 2
      }
    ])
    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: 'Beta App' }))

    expect(await screen.findByRole('heading', { name: 'Beta App' })).toBeInTheDocument()
    const projectSections = screen.getByRole('navigation', { name: 'Project sections' })
    expect(within(projectSections).queryByRole('link', { name: 'Chat' })).not.toBeInTheDocument()
    expect(within(projectSections).getByRole('link', { name: 'Terminal' })).toBeInTheDocument()
    expect(within(projectSections).getByRole('link', { name: 'Loops' })).toBeInTheDocument()
    expect(within(projectSections).getByRole('link', { name: 'Monitor' })).toBeInTheDocument()
    expect(within(projectSections).getByRole('link', { name: 'Preview' })).toBeInTheDocument()
    expect(within(projectSections).getByRole('link', { name: 'Hats presets' })).toBeInTheDocument()
    expect(within(projectSections).getByRole('link', { name: 'Settings' })).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Global settings' }).length).toBeGreaterThan(0)
  })

  it('reorders projects in sidebar via drag and drop', async () => {
    seedProjects([
      {
        id: 'alpha',
        name: 'Alpha App',
        path: '/tmp/alpha-app',
        type: 'node',
        ralphConfig: 'ralph.yml',
        createdAt: 1,
        updatedAt: 1
      },
      {
        id: 'beta',
        name: 'Beta App',
        path: '/tmp/beta-app',
        type: 'python',
        ralphConfig: 'ralph.yml',
        createdAt: 2,
        updatedAt: 2
      }
    ])

    render(<App />)

    const alphaItem = await screen.findByTestId('project-item-alpha')
    const betaItem = screen.getByTestId('project-item-beta')
    const dataTransfer = {
      effectAllowed: 'move',
      dropEffect: 'move',
      setData: vi.fn(),
      getData: vi.fn(() => 'alpha')
    }

    fireEvent.dragStart(alphaItem, { dataTransfer })
    fireEvent.dragOver(betaItem, { dataTransfer })
    fireEvent.drop(betaItem, { dataTransfer })
    fireEvent.dragEnd(alphaItem, { dataTransfer })

    await waitFor(() => {
      expect(screen.getAllByTestId(/project-item-/).map((item) => item.dataset.testid)).toEqual([
        'project-item-beta',
        'project-item-alpha'
      ])
    })
  })

  it('remembers the last opened tab for each project when switching projects', async () => {
    seedProjects([
      {
        id: 'alpha',
        name: 'Alpha App',
        path: '/tmp/alpha-app',
        type: 'node',
        ralphConfig: 'ralph.yml',
        createdAt: 1,
        updatedAt: 1
      },
      {
        id: 'beta',
        name: 'Beta App',
        path: '/tmp/beta-app',
        type: 'python',
        ralphConfig: 'ralph.yml',
        createdAt: 2,
        updatedAt: 2
      }
    ])

    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: 'Alpha App' }))
    fireEvent.click(await screen.findByRole('link', { name: 'Terminal' }))
    await waitFor(() => {
      expect(window.location.pathname).toBe('/project/alpha/terminal')
    })

    fireEvent.click(screen.getByRole('button', { name: 'Beta App' }))
    await waitFor(() => {
      expect(window.location.pathname).toBe('/project/beta/loops')
    })
    fireEvent.click(await screen.findByRole('link', { name: 'Preview' }))
    await waitFor(() => {
      expect(window.location.pathname).toBe('/project/beta/preview')
    })

    fireEvent.click(screen.getByRole('button', { name: 'Alpha App' }))
    await waitFor(() => {
      expect(window.location.pathname).toBe('/project/alpha/terminal')
    })

    fireEvent.click(screen.getByRole('button', { name: 'Beta App' }))
    await waitFor(() => {
      expect(window.location.pathname).toBe('/project/beta/preview')
    })
  })

  it('redirects /project/:id to the remembered tab for that specific project', async () => {
    seedProjects([
      {
        id: 'alpha',
        name: 'Alpha App',
        path: '/tmp/alpha-app',
        type: 'node',
        ralphConfig: 'ralph.yml',
        createdAt: 1,
        updatedAt: 1
      }
    ])
    window.localStorage.setItem(
      'ralph-ui.last-project-tabs',
      JSON.stringify({
        alpha: 'terminal'
      })
    )
    window.history.pushState({}, '', '/project/alpha')

    render(<App />)

    await waitFor(() => {
      expect(window.location.pathname).toBe('/project/alpha/terminal')
    })
  })

  it('navigates between project tabs', async () => {
    seedProjects([
      {
        id: 'alpha',
        name: 'Alpha App',
        path: '/tmp/alpha-app',
        type: 'node',
        ralphConfig: 'ralph.yml',
        createdAt: 1,
        updatedAt: 1
      }
    ])
    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: 'Alpha App' }))

    // Check Terminal tab explicitly as it was added recently
    const terminalLink = await screen.findByRole('link', { name: 'Terminal' })
    fireEvent.click(terminalLink)
    await waitFor(() => {
      expect(terminalApi.startSession).toHaveBeenCalledWith({ projectId: 'alpha' })
    })
    expect(await screen.findByRole('button', { name: 'Terminal 1' })).toBeInTheDocument()

    // Resume checking other tabs
    fireEvent.click(await screen.findByRole('link', { name: 'Loops' }))
    expect(await screen.findByRole('heading', { name: 'Loops' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('link', { name: 'Preview' }))
    expect(await screen.findByRole('heading', { name: 'Preview' })).toBeInTheDocument()

    fireEvent.click(
      within(screen.getByRole('navigation', { name: 'Project sections' })).getByRole('link', {
        name: 'Settings'
      })
    )
    expect(await screen.findByRole('heading', { name: 'Project settings' })).toBeInTheDocument()
  })

  it('closes a terminal session from the terminal tab strip', async () => {
    seedProjects([
      {
        id: 'alpha',
        name: 'Alpha App',
        path: '/tmp/alpha-app',
        type: 'node',
        ralphConfig: 'ralph.yml',
        createdAt: 1,
        updatedAt: 1
      }
    ])

    vi.mocked(terminalApi.startSession)
      .mockResolvedValueOnce({
        id: 'session-one',
        projectId: 'alpha',
        state: 'active',
        shell: '/bin/zsh',
        cwd: '/tmp',
        pid: 9101,
        cols: 120,
        rows: 36,
        createdAt: Date.now(),
        endedAt: null
      })
      .mockResolvedValueOnce({
        id: 'session-two',
        projectId: 'alpha',
        state: 'active',
        shell: '/bin/zsh',
        cwd: '/tmp',
        pid: 9102,
        cols: 120,
        rows: 36,
        createdAt: Date.now(),
        endedAt: null
      })

    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: 'Alpha App' }))
    fireEvent.click(await screen.findByRole('link', { name: 'Terminal' }))

    expect(await screen.findByRole('button', { name: 'Terminal 1' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'New terminal tab' }))
    expect(await screen.findByRole('button', { name: 'Terminal 2' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Close Terminal 2' }))

    await waitFor(() => {
      expect(terminalApi.endSession).toHaveBeenCalledWith({ sessionId: 'session-two' })
    })

    expect(screen.getByRole('button', { name: 'Terminal 1' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Close Terminal 2' })).not.toBeInTheDocument()
  })

  it('runs plan with selected terminal backend', async () => {
    seedProjects([
      {
        id: 'alpha',
        name: 'Alpha App',
        path: '/tmp/alpha-app',
        type: 'node',
        ralphConfig: 'ralph.yml',
        createdAt: 1,
        updatedAt: 1
      }
    ])

    vi.mocked(terminalApi.startSession).mockResolvedValueOnce({
      id: 'terminal-backend-1',
      projectId: 'alpha',
      state: 'active',
      shell: '/bin/zsh',
      cwd: '/tmp',
      pid: 9201,
      cols: 120,
      rows: 36,
      createdAt: Date.now(),
      endedAt: null
    })

    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: 'Alpha App' }))
    fireEvent.click(await screen.findByRole('link', { name: 'Terminal' }))

    expect(await screen.findByRole('button', { name: 'Terminal 1' })).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Terminal backend'), {
      target: { value: 'claude' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'PLAN' }))

    await waitFor(() => {
      expect(websocketSendMock).toHaveBeenCalledWith({
        type: 'terminal.input',
        sessionId: 'terminal-backend-1',
        data: 'ralph plan --backend claude\r'
      })
    })
  })

  it('includes tasks tab and renders tasks view when selected', async () => {
    seedProjects([
      {
        id: 'alpha',
        name: 'Alpha App',
        path: '/tmp/alpha-app',
        type: 'node',
        ralphConfig: 'ralph.yml',
        createdAt: 1,
        updatedAt: 1
      }
    ])

    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: 'Alpha App' }))

    const projectSections = screen.getByRole('navigation', { name: 'Project sections' })
    const tasksLink = within(projectSections).getByRole('link', { name: 'Tasks' })
    expect(tasksLink).toHaveAttribute('href', '/project/alpha/tasks')

    fireEvent.click(tasksLink)

    expect(await screen.findByRole('heading', { name: 'Tasks' })).toBeInTheDocument()
    await waitFor(() => {
      expect(taskApi.list).toHaveBeenCalledWith('alpha')
    })
  })

  it('applies dark theme by default', async () => {
    render(<App />)

    await waitFor(() => {
      expect(document.documentElement.classList.contains('dark')).toBe(true)
    })
  })

  it('opens create-project dialog with Cmd+N and closes with Escape', async () => {
    render(<App />)

    fireEvent.keyDown(window, { key: 'n', metaKey: true })
    expect(await screen.findByRole('heading', { name: 'Create new project' })).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Create new project' })).not.toBeInTheDocument()
    })
  })

  it('switches tabs with Cmd+number shortcuts for the active project', async () => {
    seedProjects([
      {
        id: 'alpha',
        name: 'Alpha App',
        path: '/tmp/alpha-app',
        type: 'node',
        ralphConfig: 'ralph.yml',
        createdAt: 1,
        updatedAt: 1
      }
    ])

    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Alpha App' }))

    fireEvent.keyDown(window, { key: '1', metaKey: true })
    expect(await screen.findByRole('heading', { name: 'Loops' })).toBeInTheDocument()

    fireEvent.keyDown(window, { key: '2', metaKey: true })
    await waitFor(() => {
      expect(terminalApi.startSession).toHaveBeenCalledWith({ projectId: 'alpha' })
    })
    expect(await screen.findByRole('button', { name: 'Terminal 1' })).toBeInTheDocument()
  })

  it('opens project quick switcher with Cmd+K', async () => {
    seedProjects([
      {
        id: 'alpha',
        name: 'Alpha App',
        path: '/tmp/alpha-app',
        type: 'node',
        ralphConfig: 'ralph.yml',
        createdAt: 1,
        updatedAt: 1
      },
      {
        id: 'beta',
        name: 'Beta App',
        path: '/tmp/beta-app',
        type: 'python',
        ralphConfig: 'ralph.yml',
        createdAt: 2,
        updatedAt: 2
      }
    ])

    render(<App />)
    expect(await screen.findByRole('button', { name: 'Beta App' })).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'k', metaKey: true })

    expect(await screen.findByRole('dialog', { name: 'Project switcher' })).toBeInTheDocument()
  })

  it('renders project-list skeleton while projects are loading', async () => {
    vi.mocked(projectApi.list).mockImplementation(() => new Promise(() => { }))

    render(<App />)

    expect(await screen.findByTestId('project-list-skeleton')).toBeInTheDocument()
  })

  it('removes a project from the sidebar list', async () => {
    seedProjects([
      {
        id: 'alpha',
        name: 'Alpha App',
        path: '/tmp/alpha-app',
        type: 'node',
        ralphConfig: 'ralph.yml',
        createdAt: 1,
        updatedAt: 1
      },
      {
        id: 'beta',
        name: 'Beta App',
        path: '/tmp/beta-app',
        type: 'python',
        ralphConfig: 'ralph.yml',
        createdAt: 2,
        updatedAt: 2
      }
    ])

    render(<App />)
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)

    expect(await screen.findByRole('button', { name: 'Beta App' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Remove Beta App' }))

    await waitFor(() => {
      expect(confirmSpy).toHaveBeenCalledWith('Remove project "Beta App"?')
      expect(projectApi.delete).toHaveBeenCalledWith('beta')
    })

    expect(screen.queryByRole('button', { name: 'Beta App' })).not.toBeInTheDocument()
    confirmSpy.mockRestore()
  })

  it('navigates back to dashboard when removing the active project', async () => {
    seedProjects([
      {
        id: 'alpha',
        name: 'Alpha App',
        path: '/tmp/alpha-app',
        type: 'node',
        ralphConfig: 'ralph.yml',
        createdAt: 1,
        updatedAt: 1
      }
    ])

    render(<App />)
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    fireEvent.click(await screen.findByRole('button', { name: 'Alpha App' }))
    expect(await screen.findByRole('heading', { name: 'Alpha App' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Remove Alpha App' }))

    await waitFor(() => {
      expect(confirmSpy).toHaveBeenCalledWith('Remove project "Alpha App"?')
      expect(projectApi.delete).toHaveBeenCalledWith('alpha')
    })
    expect(await screen.findByRole('heading', { name: 'No projects yet' })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/')
    confirmSpy.mockRestore()
  })

  it('does not remove a project when confirmation is declined', async () => {
    seedProjects([
      {
        id: 'alpha',
        name: 'Alpha App',
        path: '/tmp/alpha-app',
        type: 'node',
        ralphConfig: 'ralph.yml',
        createdAt: 1,
        updatedAt: 1
      }
    ])

    render(<App />)
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    fireEvent.click(await screen.findByRole('button', { name: 'Remove Alpha App' }))

    expect(confirmSpy).toHaveBeenCalledWith('Remove project "Alpha App"?')
    expect(projectApi.delete).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Alpha App' })).toBeInTheDocument()
    confirmSpy.mockRestore()
  })
})
