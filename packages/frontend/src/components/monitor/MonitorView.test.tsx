import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MonitorView } from '@/components/monitor/MonitorView'
import { loopApi, type LoopSummary } from '@/lib/loopApi'
import {
  monitoringApi,
  type MonitoringEvent,
  type MonitoringLoopMetrics,
  type ProjectStatus
} from '@/lib/monitoringApi'

vi.mock('@/lib/loopApi', () => ({
  loopApi: {
    list: vi.fn()
  }
}))

vi.mock('@/lib/monitoringApi', () => ({
  monitoringApi: {
    projectStatus: vi.fn(),
    loopMetrics: vi.fn(),
    eventHistory: vi.fn(),
    fileContent: vi.fn()
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

const loop: LoopSummary = {
  id: 'loop-1',
  projectId: 'project-1',
  processId: 'proc-1',
  state: 'running',
  config: null,
  prompt: null,
  worktree: null,
  iterations: 1,
  tokensUsed: 250,
  errors: 0,
  startedAt: 1_770_760_000_000,
  endedAt: null,
  currentHat: 'builder'
}

const status: ProjectStatus = {
  activeLoops: 1,
  totalRuns: 4,
  lastRunAt: 1_770_760_100_000,
  health: 'warning',
  tokenUsage: 250,
  errorRate: 25
}

const refreshedStatus: ProjectStatus = {
  activeLoops: 2,
  totalRuns: 5,
  lastRunAt: 1_770_760_200_000,
  health: 'healthy',
  tokenUsage: 420,
  errorRate: 20
}

const metrics: MonitoringLoopMetrics = {
  iterations: 4,
  runtime: 32,
  tokensUsed: 250,
  errors: 1,
  lastOutputSize: 128,
  filesChanged: ['src/main.ts'],
  fileChanges: [{ path: 'src/main.ts', additions: 12, deletions: 3 }]
}

const liveMetrics: MonitoringLoopMetrics = {
  iterations: 9,
  runtime: 71,
  tokensUsed: 420,
  errors: 2,
  lastOutputSize: 196,
  filesChanged: ['src/main.ts', 'src/components/App.tsx'],
  fileChanges: [
    { path: 'src/main.ts', additions: 18, deletions: 4 },
    { path: 'src/components/App.tsx', additions: 6, deletions: 1 }
  ]
}

const events: MonitoringEvent[] = [
  {
    topic: 'loop.start',
    sourceHat: 'planner',
    timestamp: 1_770_760_001_000
  },
  {
    topic: 'task.complete',
    sourceHat: 'validator',
    timestamp: 1_770_760_003_000
  },
  {
    topic: 'loop.error',
    sourceHat: 'builder',
    payload: { message: 'boom' },
    timestamp: 1_770_760_002_000
  }
]

describe('MonitorView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    MockWebSocket.instances = []
    vi.stubGlobal('WebSocket', MockWebSocket as unknown as typeof WebSocket)

    vi.mocked(loopApi.list).mockResolvedValue([loop])
    vi.mocked(monitoringApi.projectStatus)
      .mockResolvedValueOnce(status)
      .mockResolvedValueOnce(refreshedStatus)
    vi.mocked(monitoringApi.loopMetrics).mockResolvedValue(metrics)
    vi.mocked(monitoringApi.eventHistory).mockResolvedValue(events)
    vi.mocked(monitoringApi.fileContent).mockResolvedValue({
      path: 'src/main.ts',
      content: 'export const value = 1\n'
    })
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('renders monitoring data and reacts to live metrics updates', async () => {
    render(<MonitorView projectId="project-1" />)

    await waitFor(() => {
      expect(monitoringApi.projectStatus).toHaveBeenCalledWith('project-1')
    })
    expect(loopApi.list).toHaveBeenCalledWith('project-1')
    expect(monitoringApi.eventHistory).toHaveBeenCalledWith({ projectId: 'project-1' })
    await waitFor(() => {
      expect(monitoringApi.loopMetrics).toHaveBeenCalledWith('loop-1')
    })

    const activeLoopsCard = screen.getByText('Active Loops').closest('article')
    expect(activeLoopsCard).not.toBeNull()
    expect(within(activeLoopsCard as HTMLElement).getByText('1')).toBeInTheDocument()
    expect(screen.getByText('Total Runs')).toBeInTheDocument()
    expect(screen.getByText('Token Usage')).toBeInTheDocument()
    expect(screen.getByText('Error Rate')).toBeInTheDocument()

    expect(await screen.findByText('Iterations: 4')).toBeInTheDocument()
    expect(screen.getByText('Runtime: 32s')).toBeInTheDocument()
    const timelineRows = await screen.findAllByTestId('event-row')
    expect(
      timelineRows.map((row) => within(row).getByTestId('event-topic').textContent)
    ).toEqual(['task.complete', 'loop.error', 'loop.start'])

    const completeRow = timelineRows[0]
    const errorRow = timelineRows[1]
    expect(within(completeRow).getByTestId('event-dot')).toHaveClass('bg-emerald-400')
    expect(within(errorRow).getByTestId('event-dot')).toHaveClass('bg-red-400')

    fireEvent.change(screen.getByLabelText('Filter topic'), {
      target: { value: 'loop.error' }
    })
    const filteredRows = screen.getAllByTestId('event-row')
    expect(filteredRows).toHaveLength(1)
    expect(within(filteredRows[0]).getByText('loop.error')).toBeInTheDocument()

    const socket = MockWebSocket.instances[0]
    expect(socket).toBeDefined()
    socket?.emitMessage({
      type: 'loop.metrics',
      channel: 'loop:loop-1:metrics',
      loopId: 'loop-1',
      ...liveMetrics,
      timestamp: new Date().toISOString()
    })

    expect(await screen.findByText('Iterations: 9')).toBeInTheDocument()
    expect(screen.getByText('Runtime: 71s')).toBeInTheDocument()

    await waitFor(() => {
      expect(monitoringApi.projectStatus).toHaveBeenCalledTimes(2)
    })
    expect(within(activeLoopsCard as HTMLElement).getByText('2')).toBeInTheDocument()
  })

  it('shows empty states gracefully when no monitoring data exists', async () => {
    vi.mocked(loopApi.list).mockResolvedValue([])
    vi.mocked(monitoringApi.projectStatus).mockResolvedValue({
      activeLoops: 0,
      totalRuns: 0,
      lastRunAt: null,
      health: 'healthy',
      tokenUsage: 0,
      errorRate: 0
    })
    vi.mocked(monitoringApi.eventHistory).mockResolvedValue([])

    render(<MonitorView projectId="project-1" />)

    await waitFor(() => {
      expect(monitoringApi.projectStatus).toHaveBeenCalledWith('project-1')
    })

    expect(screen.getByText('No loop metrics yet.')).toBeInTheDocument()
    expect(screen.getByText('No events found.')).toBeInTheDocument()
  })
})
