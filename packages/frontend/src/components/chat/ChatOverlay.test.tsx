import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { ChatOverlay } from '@/components/chat/ChatOverlay'
import { ChatView } from '@/components/chat/ChatView'
import { ChatSendContext } from '@/providers/ChatSessionProvider'
import { resetChatSessionStore, useChatSessionStore } from '@/stores/chatSessionStore'
import { resetProjectStore, useProjectStore } from '@/stores/projectStore'
import type { ChatMessage, PendingConfirmation } from '@/types/chat'

vi.mock('@/hooks/useCapabilities', () => ({
  useCapabilities: vi.fn(() => ({
    capabilities: null
  }))
}))

vi.mock('@/hooks/useMediaQuery', () => ({
  useMediaQuery: vi.fn(() => false)
}))

function makeMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'message-1',
    role: 'assistant',
    content: 'Default message',
    timestamp: 1_773_132_000_000,
    isStreaming: false,
    ...overrides
  }
}

function makePendingConfirmation(
  overrides: Partial<PendingConfirmation> = {}
): PendingConfirmation {
  return {
    permissionId: 'permission-1',
    toolName: 'start_loop',
    description: 'Start the loop for project-1',
    args: {
      projectId: 'project-1'
    },
    ...overrides
  }
}

describe('ChatOverlay', () => {
  const send = vi.fn(() => true)

  beforeEach(() => {
    vi.clearAllMocks()
    vi
      .spyOn(globalThis.crypto, 'randomUUID')
      .mockReturnValue('11111111-1111-4111-8111-111111111111')
    resetChatSessionStore()
    resetProjectStore()
    useProjectStore.setState({
      projects: [
        {
          id: 'project-1',
          name: 'Project One',
          path: '/tmp/project-one',
          type: 'node',
          ralphConfig: '.ralph',
          createdAt: 1_773_132_000_000,
          updatedAt: 1_773_132_000_000
        }
      ],
      activeProjectId: 'project-1',
      isLoading: false,
      error: null
    })
  })

  afterEach(() => {
    cleanup()
  })

  function renderOverlay() {
    return render(
      <MemoryRouter initialEntries={['/project/project-1/chat']}>
        <ChatSendContext.Provider value={send}>
          <ChatOverlay />
        </ChatSendContext.Provider>
      </MemoryRouter>
    )
  }

  it('renders collapsed by default and toggles open and closed from the launcher button', () => {
    renderOverlay()

    expect(screen.getByRole('button', { name: 'Open chat assistant' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Ralph Assistant' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Open chat assistant' }))

    expect(screen.getByRole('heading', { name: 'Ralph Assistant' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Close chat assistant' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Close chat assistant' }))

    expect(screen.queryByRole('heading', { name: 'Ralph Assistant' })).not.toBeInTheDocument()
  })

  it('renders shared-session messages and omits the removed model selector', () => {
    useChatSessionStore.setState({
      messages: [
        makeMessage({
          id: 'user-1',
          role: 'user',
          content: 'Show me the projects'
        }),
        makeMessage({
          id: 'assistant-1',
          role: 'assistant',
          content: '# Projects\n\n- Alpha'
        })
      ]
    })

    renderOverlay()
    fireEvent.click(screen.getByRole('button', { name: 'Open chat assistant' }))

    expect(screen.getByTestId('chat-message-user')).toHaveTextContent('Show me the projects')
    expect(screen.getByTestId('chat-message-assistant')).toHaveTextContent('Projects')
    expect(screen.getByText('Alpha')).toBeInTheDocument()
    expect(screen.queryByLabelText('Chat model')).not.toBeInTheDocument()
  })

  it('shows inline confirmation cards and routes confirmation through the shared session hook', () => {
    useChatSessionStore.setState({
      pendingConfirmation: makePendingConfirmation()
    })

    renderOverlay()
    fireEvent.click(screen.getByRole('button', { name: 'Open chat assistant' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    expect(send).toHaveBeenCalledWith({
      type: 'chat:confirm',
      permissionId: 'permission-1',
      confirmed: true
    })
    expect(useChatSessionStore.getState().pendingConfirmation).toBeNull()
  })

  it('sends messages through the shared session hook and renders the optimistic user message', () => {
    renderOverlay()
    fireEvent.click(screen.getByRole('button', { name: 'Open chat assistant' }))

    fireEvent.change(screen.getByLabelText('Message'), {
      target: { value: 'Run a status check' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    expect(send).toHaveBeenCalledWith({
      type: 'chat:send',
      message: 'Run a status check'
    })
    expect(screen.getByTestId('chat-message-user')).toHaveTextContent('Run a status check')
  })

  it('restarts chat from the overlay header action', () => {
    useChatSessionStore.setState({
      messages: [
        makeMessage({
          id: 'assistant-1',
          role: 'assistant',
          content: 'Shared history'
        })
      ]
    })

    renderOverlay()
    fireEvent.click(screen.getByRole('button', { name: 'Open chat assistant' }))
    fireEvent.click(screen.getByRole('button', { name: 'Restart chat' }))

    expect(send).toHaveBeenCalledWith({ type: 'chat:restart' })
    expect(useChatSessionStore.getState().messages).toEqual([])
  })

  it('shows the same shared transcript in the chat tab and desktop bubble at the same time', () => {
    useChatSessionStore.setState({
      messages: [
        makeMessage({
          id: 'assistant-1',
          role: 'assistant',
          content: 'Shared history'
        })
      ]
    })

    render(
      <MemoryRouter initialEntries={['/project/project-1/chat']}>
        <ChatSendContext.Provider value={send}>
          <div>
            <ChatView projectId="project-1" />
            <ChatOverlay />
          </div>
        </ChatSendContext.Provider>
      </MemoryRouter>
    )

    fireEvent.click(screen.getByRole('button', { name: 'Open chat assistant' }))

    expect(screen.getAllByText('Shared history')).toHaveLength(2)
  })
})
