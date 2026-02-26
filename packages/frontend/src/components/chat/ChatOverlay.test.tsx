import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { ChatOverlay } from '@/components/chat/ChatOverlay'
import { resetChatOverlayStore, useChatOverlayStore } from '@/stores/chatOverlayStore'
import { settingsApi } from '@/lib/settingsApi'

vi.mock('@/lib/settingsApi', () => ({
  settingsApi: {
    get: vi.fn()
  }
}))

describe('ChatOverlay', () => {
  function LocationProbe() {
    const location = useLocation()
    return <p data-testid="location-path">{`${location.pathname}${location.search}`}</p>
  }

  beforeEach(() => {
    vi.restoreAllMocks()
    vi
      .spyOn(globalThis.crypto, 'randomUUID')
      .mockReturnValue('11111111-1111-4111-8111-111111111111')
    resetChatOverlayStore()
    vi.mocked(settingsApi.get).mockResolvedValue({
      chatModel: 'openai',
      ralphBinaryPath: null,
      notifications: {
        loopComplete: true,
        loopFailed: true,
        needsInput: true
      },
      preview: {
        portStart: 3001,
        portEnd: 3010,
        baseUrl: 'http://localhost',
        command: null
      },
      data: {
        dbPath: '/tmp/ralph.db'
      }
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('renders collapsed by default and toggles open/close from button clicks', () => {
    render(<ChatOverlay />)

    expect(screen.getByRole('button', { name: 'Open chat assistant' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Ralph Assistant' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Open chat assistant' }))

    expect(screen.getByRole('heading', { name: 'Ralph Assistant' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Close chat assistant' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Close chat assistant' }))
    expect(screen.queryByRole('heading', { name: 'Ralph Assistant' })).not.toBeInTheDocument()
  })

  it('renders user and streaming assistant messages from store updates', () => {
    useChatOverlayStore.setState({
      isOpen: true,
      messages: [
        {
          id: 'user-1',
          role: 'user',
          content: 'List projects',
          timestamp: Date.now()
        }
      ]
    })

    render(<ChatOverlay />)
    expect(screen.getByText('List projects')).toBeInTheDocument()

    act(() => {
      useChatOverlayStore.getState().appendStreamChunk('Working')
      useChatOverlayStore.getState().appendStreamChunk(' now')
    })

    expect(screen.getByText('Working now')).toBeInTheDocument()
  })

  it('loads model from settings when opened and updates selected model from header dropdown', async () => {
    render(<ChatOverlay />)

    fireEvent.click(screen.getByRole('button', { name: 'Open chat assistant' }))

    await waitFor(() => {
      expect(useChatOverlayStore.getState().selectedModel).toBe('openai')
    })

    const modelSelector = screen.getByLabelText('Chat model')
    expect(modelSelector).toHaveValue('openai')

    fireEvent.change(modelSelector, {
      target: { value: 'claude' }
    })

    expect(useChatOverlayStore.getState().selectedModel).toBe('claude')
  })

  it('renders deep-link for tool results and closes overlay on click after navigating', async () => {
    useChatOverlayStore.setState({
      isOpen: true,
      messages: [
        {
          id: 'tool-1',
          role: 'tool',
          content: 'Showing 50 lines',
          toolCall: {
            id: 'tool-1',
            name: 'get_loop_output',
            link: '/project/project-1/loops?loopId=loop-1'
          },
          timestamp: Date.now()
        }
      ]
    })

    render(
      <MemoryRouter initialEntries={['/project/project-1/chat']}>
        <Routes>
          <Route
            path="*"
            element={
              <>
                <ChatOverlay />
                <LocationProbe />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    )

    expect(screen.getByRole('link', { name: 'View details' })).toHaveAttribute(
      'href',
      '/project/project-1/loops?loopId=loop-1'
    )

    fireEvent.click(screen.getByRole('link', { name: 'View details' }))

    await waitFor(() => {
      expect(screen.getByTestId('location-path')).toHaveTextContent(
        '/project/project-1/loops?loopId=loop-1'
      )
      expect(useChatOverlayStore.getState().isOpen).toBe(false)
    })
  })
})
