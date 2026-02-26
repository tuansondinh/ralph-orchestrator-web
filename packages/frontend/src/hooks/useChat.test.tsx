import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useChat } from '@/hooks/useChat'
import { resetChatOverlayStore, useChatOverlayStore } from '@/stores/chatOverlayStore'

function createSseStream(events: Array<{ event: string; data: Record<string, unknown> }>) {
  const encoder = new TextEncoder()
  const payload = events
    .map((event) => `event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`)
    .join('')

  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(payload))
      controller.close()
    }
  })
}

describe('useChat', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    let idCounter = 0
    vi.spyOn(globalThis.crypto, 'randomUUID').mockImplementation(() => {
      idCounter += 1
      return `00000000-0000-4000-8000-${String(idCounter).padStart(12, '0')}`
    })
    resetChatOverlayStore()
  })

  it('posts chat stream input and applies text/tool events to store', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        createSseStream([
          {
            event: 'text-delta',
            data: { text: 'hello' }
          },
          {
            event: 'tool-call',
            data: {
              id: 'tool-1',
              name: 'delete_project',
              args: { projectId: 'project-1' },
              requiresConfirmation: true
            }
          },
          {
            event: 'tool-result',
            data: {
              id: 'tool-1',
              result: '{"ok":true}',
              link: '/project/project-1'
            }
          },
          {
            event: 'done',
            data: {}
          }
        ]),
        {
          status: 200,
          headers: {
            'content-type': 'text/event-stream'
          }
        }
      )
    )

    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useChat())

    await act(async () => {
      await result.current.sendMessage('hello')
    })

    const state = useChatOverlayStore.getState()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      '/chat/stream',
      expect.objectContaining({
        method: 'POST'
      })
    )

    const [firstMessage, secondMessage, thirdMessage] = state.messages
    expect(firstMessage).toMatchObject({
      role: 'user',
      content: 'hello'
    })
    expect(secondMessage).toMatchObject({
      role: 'assistant',
      content: 'hello',
      isStreaming: false
    })
    expect(thirdMessage).toMatchObject({
      role: 'tool',
      content: '{"ok":true}',
      toolCall: {
        name: 'delete_project',
        id: 'tool-1',
        link: '/project/project-1'
      }
    })

    expect(state.pendingConfirmation).toMatchObject({
      id: 'tool-1',
      toolName: 'delete_project',
      args: {
        projectId: 'project-1'
      }
    })
    expect(state.isStreaming).toBe(false)
  })

  it('handles error event by finalizing stream and appending assistant error message', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        createSseStream([
          {
            event: 'error',
            data: {
              message: 'stream failed'
            }
          }
        ]),
        {
          status: 200,
          headers: {
            'content-type': 'text/event-stream'
          }
        }
      )
    )

    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useChat())

    await act(async () => {
      await result.current.sendMessage('hello')
    })

    const state = useChatOverlayStore.getState()
    expect(state.isStreaming).toBe(false)
    expect(state.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'assistant',
          content: 'stream failed'
        })
      ])
    )
  })

  it('sends the currently selected model with each stream request', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(createSseStream([{ event: 'done', data: {} }]), {
        status: 200,
        headers: {
          'content-type': 'text/event-stream'
        }
      })
    )

    vi.stubGlobal('fetch', fetchMock)
    useChatOverlayStore.getState().setModel('claude')

    const { result } = renderHook(() => useChat())
    await act(async () => {
      await result.current.sendMessage('use selected model')
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const calls = fetchMock.mock.calls as unknown[]
    const firstCall = calls[0] as unknown[] | undefined
    const request = (firstCall?.[1] ?? null) as RequestInit | null
    if (!request || typeof request.body !== 'string') {
      throw new Error('Missing chat stream request body')
    }

    const body = JSON.parse(request.body) as { model?: string }
    expect(body.model).toBe('claude')
  })

  it('posts tool confirmation decisions and updates confirmation status', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          'content-type': 'application/json'
        }
      })
    )

    vi.stubGlobal('fetch', fetchMock)
    const sessionId = useChatOverlayStore.getState().sessionId
    useChatOverlayStore.getState().setPendingConfirmation({
      id: 'tool-confirm-1',
      toolName: 'delete_project',
      description: 'Confirm delete_project',
      args: {
        projectId: 'project-1'
      },
      status: 'pending',
      isSubmitting: false
    })

    const { result } = renderHook(() => useChat())

    await act(async () => {
      await result.current.confirmToolCall('tool-confirm-1', false)
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      '/chat/confirm',
      expect.objectContaining({
        method: 'POST'
      })
    )

    const calls = fetchMock.mock.calls as unknown[]
    const firstCall = calls[0] as unknown[] | undefined
    const request = (firstCall?.[1] ?? null) as RequestInit | null
    if (!request || typeof request.body !== 'string') {
      throw new Error('Missing chat confirm request body')
    }

    const body = JSON.parse(request.body) as {
      sessionId?: string
      toolCallId?: string
      confirmed?: boolean
    }
    expect(body).toEqual({
      sessionId,
      toolCallId: 'tool-confirm-1',
      confirmed: false
    })

    expect(useChatOverlayStore.getState().pendingConfirmation).toMatchObject({
      id: 'tool-confirm-1',
      status: 'cancelled',
      isSubmitting: false
    })
  })
})
