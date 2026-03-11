import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { ChatView } from '@/components/chat/ChatView'
import { useChatSession } from '@/hooks/useChatSession'
import { resetProjectStore, useProjectStore } from '@/stores/projectStore'
import type { ChatMessage, PendingConfirmation } from '@/types/chat'

vi.mock('@/hooks/useChatSession', () => ({
  useChatSession: vi.fn()
}))

vi.mock('@/hooks/useMediaQuery', () => ({
  useMediaQuery: vi.fn()
}))

vi.mock('@/hooks/useCapabilities', () => ({
  useCapabilities: vi.fn(() => ({
    capabilities: null
  }))
}))

const mockedUseChatSession = vi.mocked(useChatSession)

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

describe('ChatView', () => {
  const sendMessage = vi.fn()
  const confirmAction = vi.fn()
  const restartChat = vi.fn()

  beforeEach(async () => {
    resetProjectStore()
    vi.clearAllMocks()

    const { useMediaQuery } = await import('@/hooks/useMediaQuery')
    vi.mocked(useMediaQuery).mockReturnValue(false)

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

    mockedUseChatSession.mockReturnValue({
      messages: [],
      isStreaming: false,
      status: 'idle',
      pendingConfirmation: null,
      sendMessage,
      confirmAction,
      restartChat
    })
  })

  afterEach(() => {
    cleanup()
  })

  function renderChatView() {
    return render(
      <MemoryRouter>
        <ChatView projectId="project-1" />
      </MemoryRouter>
    )
  }

  it('renders messages from the shared chat session store', () => {
    mockedUseChatSession.mockReturnValue({
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
      ],
      isStreaming: false,
      status: 'idle',
      pendingConfirmation: null,
      sendMessage,
      confirmAction,
      restartChat
    })

    renderChatView()

    expect(screen.getByTestId('chat-message-user')).toHaveTextContent('Show me the projects')
    expect(screen.getByTestId('chat-message-assistant')).toHaveTextContent('Projects')
    expect(screen.getByText('Alpha')).toBeInTheDocument()
  })

  it('opens the mobile drawer with project navigation links from the hamburger button', async () => {
    const { useMediaQuery } = await import('@/hooks/useMediaQuery')
    vi.mocked(useMediaQuery).mockReturnValue(true)

    renderChatView()

    fireEvent.click(screen.getByRole('button', { name: 'Open project navigation' }))

    expect(screen.getByText('Project One')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Loops' })).toHaveAttribute(
      'href',
      '/project/project-1/loops'
    )
    expect(screen.getByRole('link', { name: 'Terminal' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Settings' })).toBeInTheDocument()
  })

  it('renders the confirmation card inline when an action is pending', () => {
    mockedUseChatSession.mockReturnValue({
      messages: [makeMessage()],
      isStreaming: false,
      status: 'idle',
      pendingConfirmation: makePendingConfirmation(),
      sendMessage,
      confirmAction,
      restartChat
    })

    renderChatView()

    expect(screen.getByText('start_loop')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
  })

  it('sends messages through useChatSession when the input submits', () => {
    renderChatView()

    fireEvent.change(screen.getByLabelText('Message'), {
      target: { value: 'Run a status check' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    expect(sendMessage).toHaveBeenCalledWith('Run a status check')
  })

  it('does not render the removed legacy session management controls', () => {
    renderChatView()

    expect(screen.queryByRole('button', { name: 'Start Session' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Restart Session' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'End Session' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Session backend')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Session type')).not.toBeInTheDocument()
  })

  it('restarts chat from the desktop header action', () => {
    renderChatView()

    fireEvent.click(screen.getByRole('button', { name: 'Restart chat' }))

    expect(restartChat).toHaveBeenCalledTimes(1)
  })

  it('uses the full available width for the desktop chat content', () => {
    renderChatView()

    expect(screen.getByTestId('chat-view')).toHaveClass('w-full', 'flex-1', 'min-w-0')
    expect(screen.getByTestId('chat-content')).toHaveClass('w-full')
    expect(screen.getByTestId('chat-content')).not.toHaveClass('max-w-5xl')
    expect(screen.getByTestId('chat-composer')).toHaveClass('w-full', 'self-stretch')
  })
})
