import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PreviewView } from '@/components/preview/PreviewView'
import { previewApi, type PreviewStatus } from '@/lib/previewApi'

vi.mock('@/lib/previewApi', () => ({
  previewApi: {
    start: vi.fn(),
    stop: vi.fn(),
    status: vi.fn(),
    getSettings: vi.fn(),
    setSettings: vi.fn()
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

const startingPreview: PreviewStatus = {
  projectId: 'project-1',
  url: 'http://127.0.0.1:3001',
  port: 3001,
  state: 'starting',
  command: 'npm',
  args: ['run', 'dev'],
  error: null
}

describe('PreviewView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    MockWebSocket.instances = []
    vi.stubGlobal('WebSocket', MockWebSocket as unknown as typeof WebSocket)

    vi.mocked(previewApi.status).mockResolvedValue(null)
    vi.mocked(previewApi.start).mockResolvedValue(startingPreview)
    vi.mocked(previewApi.stop).mockResolvedValue(undefined)
    vi.mocked(previewApi.getSettings).mockResolvedValue({
      baseUrl: 'http://localhost',
      command: null
    })
    vi.mocked(previewApi.setSettings).mockImplementation(async (input) => ({
      baseUrl: input.baseUrl ?? 'http://localhost',
      command: input.command ?? null
    }))
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('auto-starts preview and renders iframe when websocket reports ready', async () => {
    render(<PreviewView projectId="project-1" />)

    await waitFor(() => {
      expect(previewApi.status).toHaveBeenCalledWith('project-1')
    })
    await waitFor(() => {
      expect(previewApi.start).toHaveBeenCalledWith('project-1')
    })

    expect(await screen.findByText('Starting preview server...')).toBeInTheDocument()

    const socket = MockWebSocket.instances[0]
    expect(socket).toBeDefined()
    socket?.emitMessage({
      type: 'preview.state',
      channel: 'preview:project-1:state',
      projectId: 'project-1',
      state: 'ready',
      url: 'http://127.0.0.1:3001',
      port: 3001,
      command: 'npm',
      args: ['run', 'dev'],
      error: null
    })

    const frame = await screen.findByTestId('preview-frame')
    expect(frame).toHaveAttribute('src', 'http://127.0.0.1:3001')
  })

  it('refreshes the iframe and supports restart/configure actions in error state', async () => {
    render(<PreviewView projectId="project-1" />)

    await waitFor(() => {
      expect(previewApi.start).toHaveBeenCalledWith('project-1')
    })

    const socket = MockWebSocket.instances[0]
    socket?.emitMessage({
      type: 'preview.state',
      channel: 'preview:project-1:state',
      projectId: 'project-1',
      state: 'ready',
      url: 'http://127.0.0.1:3001',
      port: 3001,
      command: 'npm',
      args: ['run', 'dev'],
      error: null
    })

    const firstFrame = await screen.findByTestId('preview-frame')
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    await waitFor(() => {
      expect(screen.getByTestId('preview-frame')).not.toBe(firstFrame)
    })

    socket?.emitMessage({
      type: 'preview.state',
      channel: 'preview:project-1:state',
      projectId: 'project-1',
      state: 'error',
      url: 'http://127.0.0.1:3001',
      port: 3001,
      command: 'npm',
      args: ['run', 'dev'],
      error: 'Preview process crashed'
    })

    expect(await screen.findByText('Preview process crashed')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Configure Command' }))
    fireEvent.change(screen.getByLabelText('Preview Base URL'), {
      target: { value: 'http://my-machine.local' }
    })
    fireEvent.change(screen.getByLabelText('Preview Command'), {
      target: { value: 'yarn dev' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save Configuration' }))

    await waitFor(() => {
      expect(previewApi.setSettings).toHaveBeenCalledWith({
        baseUrl: 'http://my-machine.local',
        command: 'yarn dev'
      })
    })

    expect(await screen.findByText('Preview settings saved.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Restart Preview' }))
    await waitFor(() => {
      expect(previewApi.start).toHaveBeenCalledTimes(2)
    })
  })

  it('allows configuring the preview URL from the preview toolbar', async () => {
    render(<PreviewView projectId="project-1" />)

    await waitFor(() => {
      expect(previewApi.start).toHaveBeenCalledWith('project-1')
    })

    fireEvent.change(screen.getByLabelText('Preview URL'), {
      target: { value: 'https://preview.example.com:9999' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save URL' }))

    await waitFor(() => {
      expect(previewApi.setSettings).toHaveBeenCalledWith({
        baseUrl: 'https://preview.example.com:9999'
      })
    })

    expect(await screen.findByText('Preview URL saved.')).toBeInTheDocument()
  })

  it('does not stop preview automatically when unmounting the tab', async () => {
    const { unmount } = render(<PreviewView projectId="project-1" />)

    await waitFor(() => {
      expect(previewApi.start).toHaveBeenCalledWith('project-1')
    })

    unmount()

    expect(previewApi.stop).not.toHaveBeenCalled()
  })
})
