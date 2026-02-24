import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LoopsView } from '@/components/loops/LoopsView'
import { loopApi, type LoopMetrics, type LoopSummary } from '@/lib/loopApi'
import { presetApi } from '@/lib/presetApi'
import { projectApi } from '@/lib/projectApi'
import { settingsApi } from '@/lib/settingsApi'
import { worktreeApi } from '@/lib/worktreeApi'
import { resetLoopStore } from '@/stores/loopStore'

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
    getPrompt: vi.fn()
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
  beforeEach(() => {
    resetLoopStore()
    vi.clearAllMocks()
    MockWebSocket.instances = []

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
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('starts, renders, streams, and stops loops', async () => {
    render(<LoopsView projectId="project-1" />)

    await waitFor(() => {
      expect(loopApi.list).toHaveBeenCalledWith('project-1')
    })
    expect(await screen.findByText('Current Prompt')).toBeInTheDocument()
    expect(await screen.findByText('PROMPT.md')).toBeInTheDocument()
    expect(await screen.findByTestId('current-prompt-content')).toHaveTextContent(
      'Follow the checklist.'
    )


    fireEvent.change(screen.getByLabelText('Prompt'), {
      target: { value: 'Ship it' }
    })
    expect(await screen.findByDisplayValue('hatless-baseline')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Start' }))

    await waitFor(() => {
      expect(loopApi.start).toHaveBeenCalledWith('project-1', {
        prompt: 'Ship it',
        exclusive: false,
        presetFilename: 'hatless-baseline.yml'
      })
    })

    expect(await screen.findByText('loop-1')).toBeInTheDocument()
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

          return parsed.channels.includes('loop:loop-1:metrics')
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
    expect(await screen.findByText('Iterations: 11')).toBeInTheDocument()
    expect(await screen.findByText('Tokens: 2200')).toBeInTheDocument()

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

    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    await waitFor(() => {
      expect(loopApi.stop).toHaveBeenCalledWith('loop-1')
    })
  })

  it('shows loading skeleton while loop list is fetching', async () => {
    vi.mocked(loopApi.list).mockImplementation(() => new Promise(() => { }))

    render(<LoopsView projectId="project-1" />)

    expect(await screen.findByTestId('loops-loading-skeleton')).toBeInTheDocument()
  })
})
