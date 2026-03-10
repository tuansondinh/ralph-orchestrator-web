import { act, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ChatSessionProvider } from '@/providers/ChatSessionProvider'
import { resetChatSessionStore, useChatSessionStore } from '@/stores/chatSessionStore'

const {
  useWebSocketMock,
  websocketSendMock,
  setConnectedState,
  getLastOptions
} = vi.hoisted(() => {
  let isConnected = false
  let lastOptions: {
    channels: string[]
    onMessage: (message: Record<string, unknown>) => void
  } | null = null

  return {
    useWebSocketMock: vi.fn((options: { channels: string[]; onMessage: (message: Record<string, unknown>) => void }) => {
      lastOptions = options
      return {
        isConnected,
        status: isConnected ? 'connected' : 'connecting',
        reconnectAttempt: 0,
        send: websocketSendMock
      }
    }),
    websocketSendMock: vi.fn(() => true),
    setConnectedState: (nextValue: boolean) => {
      isConnected = nextValue
    },
    getLastOptions: () => lastOptions
  }
})

vi.mock('@/hooks/useWebSocket', () => ({
  useWebSocket: useWebSocketMock
}))

describe('ChatSessionProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setConnectedState(false)
    resetChatSessionStore()
  })

  it('subscribes exactly once to the opencode-chat websocket channel', () => {
    render(
      <ChatSessionProvider>
        <div>chat shell</div>
      </ChatSessionProvider>
    )

    expect(useWebSocketMock).toHaveBeenCalledTimes(1)
    expect(useWebSocketMock).toHaveBeenCalledWith(
      expect.objectContaining({
        channels: ['opencode-chat'],
        onMessage: expect.any(Function)
      })
    )
  })

  it('sends chat:sync when the websocket becomes connected', () => {
    const view = render(
      <ChatSessionProvider>
        <div>chat shell</div>
      </ChatSessionProvider>
    )

    expect(websocketSendMock).not.toHaveBeenCalled()

    setConnectedState(true)
    view.rerender(
      <ChatSessionProvider>
        <div>chat shell</div>
      </ChatSessionProvider>
    )

    expect(websocketSendMock).toHaveBeenCalledWith({ type: 'chat:sync' })
  })

  it('routes websocket events into chat session store state', () => {
    render(
      <ChatSessionProvider>
        <div>chat shell</div>
      </ChatSessionProvider>
    )

    const options = getLastOptions()
    if (!options) {
      throw new Error('Expected useWebSocket options to be captured')
    }

    act(() => {
      options.onMessage({ type: 'chat:delta', text: 'hello' })
      options.onMessage({ type: 'chat:delta', text: ' world' })
      options.onMessage({
        type: 'chat:confirm-request',
        permissionId: 'permission-1',
        toolName: 'start_loop',
        description: 'Approve start_loop',
        args: { loopId: 'loop-1' }
      })
      options.onMessage({ type: 'chat:status', status: 'busy' })
      options.onMessage({ type: 'chat:tool-result', toolName: 'list_projects', result: '- demo' })
      options.onMessage({
        type: 'chat:message',
        message: {
          id: 'assistant-1',
          role: 'assistant',
          content: 'done',
          createdAt: 10
        }
      })
    })

    expect(useChatSessionStore.getState()).toMatchObject({
      status: 'busy',
      pendingConfirmation: {
        permissionId: 'permission-1',
        toolName: 'start_loop'
      },
      isStreaming: false
    })
    expect(useChatSessionStore.getState().messages).toEqual([
      expect.objectContaining({
        id: 'assistant-1',
        role: 'assistant',
        content: 'done',
        timestamp: 10
      }),
      expect.objectContaining({
        role: 'tool',
        content: '- demo'
      })
    ])
  })

  it('hydrates the entire store from chat:snapshot events', () => {
    render(
      <ChatSessionProvider>
        <div>chat shell</div>
      </ChatSessionProvider>
    )

    const options = getLastOptions()
    if (!options) {
      throw new Error('Expected useWebSocket options to be captured')
    }

    act(() => {
      options.onMessage({
        type: 'chat:snapshot',
        sessionId: 'session-1',
        status: 'idle',
        pendingConfirmation: null,
        messages: [
          {
            id: 'user-1',
            role: 'user',
            content: 'hello',
            createdAt: 12
          }
        ]
      })
    })

    expect(useChatSessionStore.getState()).toMatchObject({
      sessionId: 'session-1',
      status: 'idle',
      pendingConfirmation: null
    })
    expect(useChatSessionStore.getState().messages).toEqual([
      expect.objectContaining({
        id: 'user-1',
        role: 'user',
        content: 'hello',
        timestamp: 12
      })
    ])
  })
})
