import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LoopsView } from '@/components/loops/LoopsView'
import { loopApi, type LoopMetrics, type LoopSummary } from '@/lib/loopApi'
import { presetApi } from '@/lib/presetApi'
import { projectApi } from '@/lib/projectApi'
import { settingsApi } from '@/lib/settingsApi'
import { terminalApi } from '@/lib/terminalApi'
import { worktreeApi } from '@/lib/worktreeApi'
import { resetLoopStore, useLoopStore } from '@/stores/loopStore'
import { resetTerminalStore } from '@/stores/terminalStore'

vi.mock('@/lib/loopApi', () => ({
  loopApi: {
    list: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    restart: vi.fn(),
    getMetrics: vi.fn()
  }
}))

vi.mock('@/lib/presetApi', () => ({
  presetApi: {
    list: vi.fn(),
    get: vi.fn()
  }
}))

vi.mock('@/lib/projectApi', () => ({
  projectApi: {
    getPrompt: vi.fn(),
    updatePrompt: vi.fn()
  }
}))

vi.mock('@/lib/settingsApi', () => ({
  settingsApi: {
    getDefaultPreset: vi.fn(),
    setDefaultPreset: vi.fn()
  }
}))

vi.mock('@/lib/worktreeApi', () => ({
  worktreeApi: {
    list: vi.fn(),
    create: vi.fn()
  }
}))

vi.mock('@/lib/terminalApi', () => ({
  terminalApi: {
    startSession: vi.fn()
  }
}))

class MockWebSocket {
  static instances: MockWebSocket[] = []
  static OPEN = 1

  readyState = MockWebSocket.OPEN
  sent: string[] = []
  private listeners: Record<string, Array<(event: MessageEvent | Event) => void>> = {
    open: [],
    close: [],
    message: [],
    error: []
  }

  constructor(_url: string) {
    MockWebSocket.instances.push(this)
    setTimeout(() => this.dispatch('open', new Event('open')))
  }

  addEventListener(type: 'open' | 'close' | 'message' | 'error', listener: (event: MessageEvent | Event) => void) {
    this.listeners[type].push(listener)
  }

  removeEventListener(
    type: 'open' | 'close' | 'message' | 'error',
    listener: (event: MessageEvent | Event) => void
  ) {
    this.listeners[type] = this.listeners[type].filter((candidate) => candidate !== listener)
  }

  send(payload: string) {
    this.sent.push(payload)
  }

  close() {
    this.dispatch('close', new Event('close'))
  }

  emitMessage(payload: unknown) {
    this.dispatch(
      'message',
      new MessageEvent('message', {
        data: JSON.stringify(payload)
      })
    )
  }

  private dispatch(type: 'open' | 'close' | 'message' | 'error', event: MessageEvent | Event) {
    for (const listener of this.listeners[type]) {
      listener(event)
    }
  }
}

const fixedNow = 1_770_768_000_000

const baseLoop: LoopSummary = {
  id: 'loop-1',
  projectId: 'project-1',
  ralphLoopId: null,
  processId: 'proc-1',
  state: 'running',
  config: null,
  prompt: 'Ship it',
  worktree: null,
  iterations: 0,
  tokensUsed: 0,
  errors: 0,
  startedAt: fixedNow - 12_000,
  endedAt: null,
  currentHat: 'builder'
}

const metrics: LoopMetrics = {
  iterations: 9,
  runtime: 45,
  tokensUsed: 1200,
  errors: 1,
  lastOutputSize: 300,
  filesChanged: ['src/App.tsx']
}

describe('LoopsView', () => {
  const renderLoopsView = () =>
    render(
      <MemoryRouter initialEntries={['/project/project-1/loops']}>
        <Routes>
          <Route path="/project/:id/:tab" element={<LoopsView projectId="project-1" />} />
          <Route path="/project/:id/terminal" element={<div>Terminal Destination</div>} />
        </Routes>
      </MemoryRouter>
    )

  beforeEach(() => {
    resetLoopStore()
    resetTerminalStore()
    vi.clearAllMocks()
    MockWebSocket.instances = []
    sessionStorage.clear()

    vi.stubGlobal('WebSocket', MockWebSocket as unknown as typeof WebSocket)
    vi.spyOn(Date, 'now').mockReturnValue(fixedNow)

    vi.mocked(loopApi.list).mockResolvedValue([])
    vi.mocked(loopApi.start).mockResolvedValue(baseLoop)
    vi.mocked(loopApi.stop).mockResolvedValue(undefined)
    vi.mocked(loopApi.restart).mockResolvedValue(baseLoop)
    vi.mocked(loopApi.getMetrics).mockResolvedValue(metrics)
    vi.mocked(projectApi.getPrompt).mockResolvedValue({
      projectId: 'project-1',
      path: 'PROMPT.md',
      content: '# Loop Prompt\nFollow the checklist.'
    })
    vi.mocked(projectApi.updatePrompt).mockImplementation(async (projectId, input) => ({
      projectId,
      path: 'PROMPT.md',
      content: input.content
    }))
    vi.mocked(presetApi.list).mockResolvedValue([
      { name: 'code-assist', filename: 'code-assist.yml' },
      { name: 'hatless-baseline', filename: 'hatless-baseline.yml' },
      { name: 'spec-driven', filename: 'spec-driven.yml' }
    ])
    vi.mocked(settingsApi.getDefaultPreset).mockResolvedValue('hatless-baseline.yml')
    vi.mocked(settingsApi.setDefaultPreset).mockResolvedValue('hatless-baseline.yml')
    vi.mocked(worktreeApi.list).mockResolvedValue([])
    vi.mocked(worktreeApi.create).mockResolvedValue({
      name: 'feature-a',
      path: '/tmp/project/workspaces/feature-a',
      branch: 'feature-a',
      isPrimary: false
    })
    vi.mocked(terminalApi.startSession).mockResolvedValue({
      id: 'terminal-1',
      projectId: 'project-1',
      state: 'active',
      shell: '/bin/zsh',
      cwd: '/tmp/project',
      pid: 1234,
      cols: 120,
      rows: 36,
      createdAt: fixedNow,
      endedAt: null
    })
  })

  afterEach(() => {
    cleanup()
    sessionStorage.clear()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('starts, renders, streams, and stops loops', async () => {
    renderLoopsView()

    await waitFor(() => {
      expect(loopApi.list).toHaveBeenCalledWith('project-1')
    })
    expect(await screen.findByLabelText('PROMPT.md')).toHaveValue(
      '# Loop Prompt\nFollow the checklist.'
    )


    fireEvent.change(screen.getByLabelText('PROMPT.md'), {
      target: { value: 'Ship it' }
    })
    expect(await screen.findByDisplayValue('hatless-baseline')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Start' }))

    await waitFor(() => {
      expect(projectApi.updatePrompt).toHaveBeenCalledWith('project-1', {
        content: 'Ship it'
      })
    })
    await waitFor(() => {
      expect(loopApi.start).toHaveBeenCalledWith('project-1', {
        exclusive: true,
        promptSnapshot: 'Ship it',
        presetFilename: 'hatless-baseline.yml'
      })
    })

    expect(await screen.findByText('loop id: loop-1')).toBeInTheDocument()
    expect(screen.getByText('Running')).toBeInTheDocument()
    expect(await screen.findByText('Iterations: 9')).toBeInTheDocument()
    expect(screen.getByText('Runtime: 45s')).toBeInTheDocument()
    expect(screen.getByText('Tokens: 1200')).toBeInTheDocument()

    const socket = MockWebSocket.instances[0]
    expect(socket).toBeDefined()
    await waitFor(() => {
      expect(
        socket?.sent.some((payload) => {
          const parsed = JSON.parse(payload) as Record<string, unknown>
          if (parsed.type !== 'subscribe' || !Array.isArray(parsed.channels)) {
            return false
          }

          return (
            parsed.channels.includes('loop:loop-1:metrics') &&
            parsed.channels.includes('loop:loop-1:output')
          )
        })
      ).toBe(true)
    })

    socket?.emitMessage({
      type: 'loop.output',
      channel: 'loop:loop-1:output',
      loopId: 'loop-1',
      stream: 'stdout',
      data: 'tick-1',
      timestamp: new Date().toISOString(),
      replay: false
    })

    expect(await screen.findByText('tick-1')).toBeInTheDocument()

    socket?.emitMessage({
      type: 'loop.metrics',
      channel: 'loop:loop-1:metrics',
      loopId: 'loop-1',
      iterations: 11,
      runtime: 99,
      tokensUsed: 2200,
      errors: 2,
      lastOutputSize: 500,
      filesChanged: ['src/App.tsx'],
      fileChanges: [],
      timestamp: new Date().toISOString()
    })

    expect(await screen.findByText('Runtime: 99s')).toBeInTheDocument()
    expect((await screen.findAllByText('Iterations: 11')).length).toBeGreaterThan(0)
    expect((await screen.findAllByText('Tokens: 2200')).length).toBeGreaterThan(0)

    socket?.emitMessage({
      type: 'loop.metrics',
      channel: 'loop:loop-1:metrics',
      loopId: 'loop-1',
      iterations: 4,
      runtime: 20,
      tokensUsed: 300,
      errors: 0,
      lastOutputSize: 150,
      filesChanged: ['src/App.tsx'],
      fileChanges: [],
      timestamp: new Date().toISOString()
    })

    await waitFor(() => {
      const metricsByLoop = useLoopStore.getState().metricsByLoop
      expect(metricsByLoop['loop-1']?.iterations).toBe(11)
    })

    socket?.emitMessage({
      type: 'loop.state',
      channel: 'loop:loop-1:state',
      loopId: 'loop-1',
      state: 'stopped',
      currentHat: 'builder',
      iterations: 9,
      endedAt: fixedNow
    })

    expect(await screen.findByText('Stopped')).toBeInTheDocument()
    await waitFor(() => {
      const loops = useLoopStore.getState().loopsByProject['project-1'] ?? []
      expect(loops.find((loop) => loop.id === 'loop-1')?.iterations).toBe(11)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    await waitFor(() => {
      expect(loopApi.stop).toHaveBeenCalledWith('loop-1')
    })
  })

  it('subscribes output replay only for the selected loop', async () => {
    vi.mocked(loopApi.list).mockResolvedValue([
      baseLoop,
      {
        ...baseLoop,
        id: 'loop-2',
        processId: null,
        state: 'stopped',
        startedAt: fixedNow - 20_000,
        endedAt: fixedNow - 1_000
      }
    ])

    renderLoopsView()

    const socket = await waitFor(() => {
      const current = MockWebSocket.instances[0]
      expect(current).toBeDefined()
      return current
    })

    await waitFor(() => {
      const subscribePayloads = (socket?.sent ?? [])
        .map((payload) => JSON.parse(payload) as Record<string, unknown>)
        .filter((payload) => payload.type === 'subscribe' && Array.isArray(payload.channels))

      expect(subscribePayloads.length).toBeGreaterThan(0)
      const latest = subscribePayloads[subscribePayloads.length - 1] as {
        channels: string[]
      }

      expect(latest.channels).toContain('loop:loop-1:output')
      expect(latest.channels).not.toContain('loop:loop-2:output')
      expect(latest.channels).toContain('loop:loop-2:state')
      expect(latest.channels).toContain('loop:loop-2:metrics')
    })
  })

  it('shows loading skeleton while loop list is fetching', async () => {
    vi.mocked(loopApi.list).mockImplementation(() => new Promise(() => { }))

    renderLoopsView()

    expect(await screen.findByTestId('loops-loading-skeleton')).toBeInTheDocument()
  })

  it('keeps prompt input empty when prompt file is missing', async () => {
    vi.mocked(projectApi.getPrompt).mockRejectedValueOnce(
      new Error('Prompt file not found: PROMPT.md')
    )

    renderLoopsView()

    expect(await screen.findByLabelText('PROMPT.md')).toHaveValue('')
    expect(screen.queryByText('Prompt file not found: PROMPT.md')).not.toBeInTheDocument()
  })

  it('opens terminal tab and runs Ralph Plan command', async () => {
    renderLoopsView()

    fireEvent.click(await screen.findByRole('button', { name: 'Ralph Plan' }))

    await waitFor(() => {
      expect(terminalApi.startSession).toHaveBeenCalledWith({
        projectId: 'project-1',
        initialCommand: 'ralph plan'
      })
    })

    expect(await screen.findByText('Terminal Destination')).toBeInTheDocument()
  })

  it('opens terminal tab and runs Ralph Task command', async () => {
    renderLoopsView()

    fireEvent.click(await screen.findByRole('button', { name: 'Ralph Task' }))

    await waitFor(() => {
      expect(terminalApi.startSession).toHaveBeenCalledWith({
        projectId: 'project-1',
        initialCommand: 'ralph task'
      })
    })

    expect(await screen.findByText('Terminal Destination')).toBeInTheDocument()
  })
})
