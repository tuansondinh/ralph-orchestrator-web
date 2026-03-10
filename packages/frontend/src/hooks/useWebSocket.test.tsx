import { StrictMode } from 'react'
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setAuthAccessToken } from '@/lib/authSession'
import { resolveWebsocketUrl, useWebSocket } from '@/hooks/useWebSocket'

class MockWebSocket {
  static instances: MockWebSocket[] = []
  static CONNECTING = 0
  static OPEN = 1
  static CLOSED = 3

  readyState = MockWebSocket.CONNECTING
  readonly url: string
  private listeners: Record<string, Array<(event: Event | MessageEvent) => void>> = {
    open: [],
    close: [],
    message: [],
    error: []
  }

  constructor(url: string) {
    this.url = url
    MockWebSocket.instances.push(this)
  }

  addEventListener(
    type: 'open' | 'close' | 'message' | 'error',
    listener: (event: Event | MessageEvent) => void
  ) {
    this.listeners[type].push(listener)
  }

  removeEventListener(
    type: 'open' | 'close' | 'message' | 'error',
    listener: (event: Event | MessageEvent) => void
  ) {
    this.listeners[type] = this.listeners[type].filter((candidate) => candidate !== listener)
  }

  close() {
    this.readyState = MockWebSocket.CLOSED
    this.emitClose()
  }

  send(_payload: string) {}

  emitOpen() {
    this.readyState = MockWebSocket.OPEN
    for (const listener of this.listeners.open) {
      listener(new Event('open'))
    }
  }

  emitClose() {
    for (const listener of this.listeners.close) {
      listener(new Event('close'))
    }
  }

  emitMessage(payload: Record<string, unknown>) {
    const event = new MessageEvent('message', {
      data: JSON.stringify(payload)
    })
    for (const listener of this.listeners.message) {
      listener(event)
    }
  }

  emitError() {
    for (const listener of this.listeners.error) {
      listener(new Event('error'))
    }
  }
}

function HookHarness({
  connectTimeoutMs,
  accessToken
}: {
  connectTimeoutMs?: number
  accessToken?: string
}) {
  const { status, reconnectAttempt } = useWebSocket({
    channels: ['notifications'],
    onMessage: () => {},
    reconnectDelayMs: 100,
    connectTimeoutMs,
    accessToken
  })

  return (
    <div>
      <p data-testid="socket-status">{status}</p>
      <p data-testid="socket-attempt">{reconnectAttempt}</p>
    </div>
  )
}

describe('useWebSocket', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('WebSocket', MockWebSocket as unknown as typeof WebSocket)
    MockWebSocket.instances = []
    setAuthAccessToken(null)
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    setAuthAccessToken(null)
  })

  it('uses exponential reconnect backoff and tracks reconnect status', () => {
    render(<HookHarness />)

    expect(screen.getByTestId('socket-status')).toHaveTextContent('connecting')
    expect(screen.getByTestId('socket-attempt')).toHaveTextContent('0')
    expect(MockWebSocket.instances).toHaveLength(0)

    act(() => {
      vi.advanceTimersByTime(0)
    })

    expect(MockWebSocket.instances).toHaveLength(1)

    act(() => {
      MockWebSocket.instances[0]?.emitOpen()
    })
    expect(screen.getByTestId('socket-status')).toHaveTextContent('connected')
    expect(screen.getByTestId('socket-attempt')).toHaveTextContent('0')

    act(() => {
      MockWebSocket.instances[0]?.emitClose()
    })
    expect(screen.getByTestId('socket-status')).toHaveTextContent('reconnecting')
    expect(screen.getByTestId('socket-attempt')).toHaveTextContent('1')

    act(() => {
      vi.advanceTimersByTime(99)
    })
    expect(MockWebSocket.instances).toHaveLength(1)
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(MockWebSocket.instances).toHaveLength(2)

    act(() => {
      MockWebSocket.instances[1]?.emitClose()
    })
    expect(screen.getByTestId('socket-attempt')).toHaveTextContent('2')
    act(() => {
      vi.advanceTimersByTime(199)
    })
    expect(MockWebSocket.instances).toHaveLength(2)
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(MockWebSocket.instances).toHaveLength(3)

    act(() => {
      MockWebSocket.instances[2]?.emitOpen()
    })
    expect(screen.getByTestId('socket-status')).toHaveTextContent('connected')
    expect(screen.getByTestId('socket-attempt')).toHaveTextContent('0')
  })

  it('creates a single websocket during React StrictMode mount cycle', () => {
    render(
      <StrictMode>
        <HookHarness />
      </StrictMode>
    )

    expect(MockWebSocket.instances).toHaveLength(0)

    act(() => {
      vi.advanceTimersByTime(0)
    })

    expect(MockWebSocket.instances).toHaveLength(1)
  })

  it('retries connection when a websocket connect attempt times out', () => {
    render(<HookHarness connectTimeoutMs={50} />)

    act(() => {
      vi.advanceTimersByTime(0)
    })

    expect(MockWebSocket.instances).toHaveLength(1)
    expect(screen.getByTestId('socket-status')).toHaveTextContent('connecting')

    act(() => {
      vi.advanceTimersByTime(50)
    })
    expect(screen.getByTestId('socket-status')).toHaveTextContent('reconnecting')
    expect(screen.getByTestId('socket-attempt')).toHaveTextContent('1')

    act(() => {
      vi.advanceTimersByTime(100)
    })
    expect(MockWebSocket.instances).toHaveLength(2)
  })

  it('passes an access token in the websocket connection URL when provided', () => {
    render(<HookHarness accessToken="supabase-access-token" />)

    act(() => {
      vi.advanceTimersByTime(0)
    })

    expect(MockWebSocket.instances[0]?.url).toBe(
      'ws://127.0.0.1:3003/ws?access_token=supabase-access-token'
    )
  })

  it('reuses the shared auth access token when a websocket caller does not pass one', () => {
    setAuthAccessToken('shared-cloud-token')

    render(<HookHarness />)

    act(() => {
      vi.advanceTimersByTime(0)
    })

    expect(MockWebSocket.instances[0]?.url).toBe(
      'ws://127.0.0.1:3003/ws?access_token=shared-cloud-token'
    )
  })

  it('logs lifecycle transitions and received message types', () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})
    render(<HookHarness />)

    act(() => {
      vi.advanceTimersByTime(0)
    })

    act(() => {
      MockWebSocket.instances[0]?.emitOpen()
      MockWebSocket.instances[0]?.emitMessage({ type: 'notification' })
      MockWebSocket.instances[0]?.emitClose()
    })

    expect(debugSpy).toHaveBeenCalledWith(
      '[ws] connect attempt',
      expect.objectContaining({ attempt: 0 })
    )
    expect(debugSpy).toHaveBeenCalledWith('[ws] connected')
    expect(debugSpy).toHaveBeenCalledWith(
      '[ws] message received',
      expect.objectContaining({ type: 'notification' })
    )
    expect(debugSpy).toHaveBeenCalledWith(
      '[ws] reconnecting',
      expect.objectContaining({ attempt: 1 })
    )
  })
})

describe('resolveWebsocketUrl', () => {
  it('defaults to 127.0.0.1 backend origin in dev when backend origin is not set', () => {
    expect(resolveWebsocketUrl({ DEV: true })).toBe('ws://127.0.0.1:3003/ws')
  })

  it('uses explicit backend origin in dev when provided', () => {
    expect(
      resolveWebsocketUrl(
        {
          DEV: true,
          VITE_RALPH_ORCHESTRATOR_BACKEND_ORIGIN: 'http://127.0.0.1:43300'
        }
      )
    ).toBe('ws://127.0.0.1:43300/ws')
  })

  it('uses localhost backend origin in dev when provided', () => {
    expect(
      resolveWebsocketUrl({
        DEV: true,
        VITE_RALPH_ORCHESTRATOR_BACKEND_ORIGIN: 'http://localhost:3001'
      })
    ).toBe('ws://localhost:3001/ws')

    expect(
      resolveWebsocketUrl({
        DEV: true,
        VITE_RALPH_ORCHESTRATOR_BACKEND_ORIGIN: 'http://127.0.0.1:3001'
      })
    ).toBe('ws://127.0.0.1:3001/ws')
  })

  it('appends the access_token query parameter when provided', () => {
    expect(
      resolveWebsocketUrl(
        {
          DEV: true,
          VITE_RALPH_ORCHESTRATOR_BACKEND_ORIGIN: 'https://cloud.example.com'
        },
        {
          protocol: 'https:',
          host: 'cloud.example.com'
        },
        'token with spaces'
      )
    ).toBe('wss://cloud.example.com/ws?access_token=token+with+spaces')
  })
})
