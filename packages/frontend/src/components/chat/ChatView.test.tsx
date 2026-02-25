import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ChatView } from '@/components/chat/ChatView'
import {
  useChatStore,
  resetChatStore,
  type ChatSessionRecord
} from '@/stores/chatStore'
import { chatApi } from '@/lib/chatApi'

vi.mock('@/lib/chatApi', () => ({
  chatApi: {
    startSession: vi.fn(),
    restartSession: vi.fn(),
    sendMessage: vi.fn(),
    endSession: vi.fn(),
    getHistory: vi.fn(),
    getProjectSession: vi.fn()
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

const now = 1_770_768_123_000

const session: ChatSessionRecord = {
  id: 'session-1',
  projectId: 'project-1',
  type: 'plan',
  backend: 'codex',
  state: 'active',
  processId: 'proc-1',
  createdAt: now,
  endedAt: null
}

const restartedSession: ChatSessionRecord = {
  ...session,
  id: 'session-2',
  type: 'task',
  createdAt: now + 5_000
}

describe('ChatView', () => {
  beforeEach(() => {
    resetChatStore()
    vi.clearAllMocks()
    MockWebSocket.instances = []

    vi.stubGlobal('WebSocket', MockWebSocket as unknown as typeof WebSocket)

    vi.mocked(chatApi.startSession).mockResolvedValue(session)
    vi.mocked(chatApi.restartSession).mockResolvedValue(restartedSession)
    vi.mocked(chatApi.sendMessage).mockResolvedValue(undefined)
    vi.mocked(chatApi.endSession).mockResolvedValue(undefined)
    vi.mocked(chatApi.getHistory).mockResolvedValue([])
    vi.mocked(chatApi.getProjectSession).mockResolvedValue(null)
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('starts a session, shows state changes, and streams assistant markdown messages', async () => {
    render(<ChatView projectId="project-1" />)

    fireEvent.click(screen.getByRole('button', { name: 'Start Session' }))

    await waitFor(() => {
      expect(chatApi.startSession).toHaveBeenCalledWith({
        projectId: 'project-1',
        type: 'plan',
        backend: 'codex'
      })
    })

    expect(await screen.findByText('No messages yet')).toBeInTheDocument()
    expect(screen.getByText('Ralph is thinking...')).toBeInTheDocument()
    expect(screen.getByTestId('chat-thinking-indicator')).toBeInTheDocument()
    expect(screen.getByLabelText('Message')).toBeEnabled()

    const socket = MockWebSocket.instances[0]
    expect(socket).toBeDefined()
    socket?.emitMessage({
      type: 'chat.state',
      channel: 'chat:session-1:message',
      sessionId: 'session-1',
      state: 'waiting',
      endedAt: null
    })

    expect(await screen.findByText('Waiting for input')).toBeInTheDocument()
    expect(screen.queryByTestId('chat-thinking-indicator')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Message')).toBeEnabled()

    fireEvent.change(screen.getByLabelText('Message'), {
      target: { value: 'I want to build a REST API' }
    })
    fireEvent.keyDown(screen.getByLabelText('Message'), {
      key: 'Enter',
      shiftKey: false
    })

    await waitFor(() => {
      expect(chatApi.sendMessage).toHaveBeenCalledWith({
        sessionId: 'session-1',
        message: 'I want to build a REST API'
      })
    })

    const userMessage = await screen.findByTestId('chat-message-user')
    expect(userMessage).toHaveTextContent('I want to build a REST API')
    expect(userMessage).toHaveClass('justify-end')

    socket?.emitMessage({
      type: 'chat.message',
      channel: 'chat:session-1:message',
      sessionId: 'session-1',
      id: 'assistant-1',
      role: 'assistant',
      content: '# Plan\n\n- Build API routes',
      timestamp: new Date(now + 1000).toISOString(),
      replay: false
    })

    const assistantMessage = await screen.findByTestId('chat-message-assistant')
    expect(assistantMessage).toHaveClass('justify-start')
    expect(await screen.findByRole('heading', { name: 'Plan' })).toBeInTheDocument()
    expect(screen.getByText('Build API routes')).toBeInTheDocument()
    expect(screen.queryByTestId('chat-thinking-indicator')).not.toBeInTheDocument()
  })

  it('loads history for an existing session when returning to a project', async () => {
    useChatStore.setState({
      sessionsByProject: {
        'project-1': {
          ...session,
          state: 'waiting'
        }
      },
      messagesBySession: {},
      historyLoadedBySession: {},
      sessionTypeByProject: {}
    })

    vi.mocked(chatApi.getHistory).mockResolvedValue([
      {
        id: 'history-1',
        sessionId: 'session-1',
        role: 'assistant',
        content: 'Previously generated plan',
        timestamp: now - 1000
      }
    ])

    render(<ChatView projectId="project-1" />)

    await waitFor(() => {
      expect(chatApi.getHistory).toHaveBeenCalledWith({ sessionId: 'session-1' })
    })
    await waitFor(() => {
      expect(screen.getByText('Previously generated plan')).toBeInTheDocument()
    })
  })

  it('shows loading skeleton while session history is being fetched', async () => {
    useChatStore.setState({
      sessionsByProject: {
        'project-1': {
          ...session,
          state: 'waiting'
        }
      },
      messagesBySession: {},
      historyLoadedBySession: {},
      sessionTypeByProject: {}
    })

    vi.mocked(chatApi.getHistory).mockImplementation(
      () =>
        new Promise(() => { })
    )

    render(<ChatView projectId="project-1" />)
    expect(await screen.findByTestId('chat-history-skeleton')).toBeInTheDocument()
  })

  it('clears loading skeleton when history is marked loaded during an in-flight fetch', async () => {
    useChatStore.setState({
      sessionsByProject: {
        'project-1': {
          ...session,
          state: 'waiting'
        }
      },
      messagesBySession: {
        'session-1': [
          {
            id: 'ws-message-1',
            sessionId: 'session-1',
            role: 'assistant',
            content: 'Live message already arrived',
            timestamp: now
          }
        ]
      },
      historyLoadedBySession: {},
      sessionTypeByProject: {}
    })

    vi.mocked(chatApi.getHistory).mockImplementation(
      () =>
        new Promise(() => { })
    )

    render(<ChatView projectId="project-1" />)
    expect(await screen.findByTestId('chat-history-skeleton')).toBeInTheDocument()
    expect(screen.getByText('Live message already arrived')).toBeInTheDocument()

    useChatStore.setState((state) => ({
      ...state,
      historyLoadedBySession: {
        ...state.historyLoadedBySession,
        'session-1': true
      }
    }))

    await waitFor(() => {
      expect(screen.queryByTestId('chat-history-skeleton')).not.toBeInTheDocument()
    })
  })

  it('reconnects to an existing active session when chat view opens', async () => {
    vi.mocked(chatApi.getProjectSession).mockResolvedValue({
      ...session,
      state: 'waiting'
    })
    vi.mocked(chatApi.getHistory).mockResolvedValue([
      {
        id: 'history-1',
        sessionId: 'session-1',
        role: 'assistant',
        content: 'Recovered history',
        timestamp: now - 500
      }
    ])

    render(<ChatView projectId="project-1" />)

    await waitFor(() => {
      expect(chatApi.getProjectSession).toHaveBeenCalledWith({ projectId: 'project-1' })
    })
    await waitFor(() => {
      expect(chatApi.getHistory).toHaveBeenCalledWith({ sessionId: 'session-1' })
    })
    await waitFor(() => {
      expect(screen.getByText('Recovered history')).toBeInTheDocument()
    })
  })

  it('starts a session with the selected backend', async () => {
    render(<ChatView projectId="project-1" />)

    fireEvent.change(screen.getByLabelText('Session backend'), {
      target: { value: 'opencode' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Start Session' }))

    await waitFor(() => {
      expect(chatApi.startSession).toHaveBeenCalledWith({
        projectId: 'project-1',
        type: 'plan',
        backend: 'opencode'
      })
    })
  })

  it('restarts an active session from the chat controls', async () => {
    useChatStore.setState({
      sessionsByProject: {
        'project-1': {
          ...session,
          state: 'waiting'
        }
      },
      messagesBySession: {
        'session-1': [
          {
            id: 'old-message',
            sessionId: 'session-1',
            role: 'assistant',
            content: 'Old response',
            timestamp: now - 1_000
          }
        ]
      },
      historyLoadedBySession: {
        'session-1': true
      },
      sessionTypeByProject: {}
    })

    vi.mocked(chatApi.getHistory).mockResolvedValue([])

    render(<ChatView projectId="project-1" />)

    fireEvent.click(await screen.findByRole('button', { name: 'Restart Session' }))

    await waitFor(() => {
      expect(chatApi.restartSession).toHaveBeenCalledWith({
        projectId: 'project-1',
        type: 'plan',
        backend: 'codex'
      })
    })
    await waitFor(() => {
      expect(chatApi.getHistory).toHaveBeenCalledWith({ sessionId: 'session-2' })
    })
  })
})
