import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  resetChatOverlayStore,
  useChatOverlayStore,
  type OverlayMessage
} from '@/stores/chatOverlayStore'

function makeMessage(overrides: Partial<OverlayMessage> = {}): OverlayMessage {
  return {
    id: overrides.id ?? 'message-1',
    role: overrides.role ?? 'user',
    content: overrides.content ?? 'hello',
    timestamp: overrides.timestamp ?? 1,
    isStreaming: overrides.isStreaming,
    toolCall: overrides.toolCall
  }
}

describe('chatOverlayStore', () => {
  beforeEach(() => {
    vi
      .spyOn(globalThis.crypto, 'randomUUID')
      .mockReturnValue('11111111-1111-4111-8111-111111111111')
    resetChatOverlayStore()
  })

  it('initializes with closed state and a generated session id', () => {
    const state = useChatOverlayStore.getState()

    expect(state.isOpen).toBe(false)
    expect(state.messages).toEqual([])
    expect(state.isStreaming).toBe(false)
    expect(state.pendingConfirmation).toBeNull()
    expect(state.selectedModel).toBe('gemini')
    expect(state.sessionId).toBe('11111111-1111-4111-8111-111111111111')
  })

  it('supports toggle/open/close transitions', () => {
    useChatOverlayStore.getState().toggle()
    expect(useChatOverlayStore.getState().isOpen).toBe(true)

    useChatOverlayStore.getState().close()
    expect(useChatOverlayStore.getState().isOpen).toBe(false)

    useChatOverlayStore.getState().open()
    expect(useChatOverlayStore.getState().isOpen).toBe(true)
  })

  it('adds messages and appends/finalizes streamed assistant content', () => {
    useChatOverlayStore.getState().addMessage(makeMessage())
    useChatOverlayStore.getState().appendStreamChunk('first')
    useChatOverlayStore.getState().appendStreamChunk(' second')

    let state = useChatOverlayStore.getState()
    expect(state.isStreaming).toBe(true)
    expect(state.messages).toHaveLength(2)
    expect(state.messages[1]).toMatchObject({
      role: 'assistant',
      content: 'first second',
      isStreaming: true
    })

    useChatOverlayStore.getState().finalizeStreamMessage()

    state = useChatOverlayStore.getState()
    expect(state.isStreaming).toBe(false)
    expect(state.messages[1]).toMatchObject({
      role: 'assistant',
      content: 'first second',
      isStreaming: false
    })
  })

  it('sets and clears pending confirmation', () => {
    const confirmation = {
      id: 'tool-call-1',
      toolName: 'delete_project',
      description: 'Delete the project',
      args: {
        projectId: 'project-1'
      },
      status: 'pending' as const,
      isSubmitting: false
    }

    useChatOverlayStore.getState().setPendingConfirmation(confirmation)
    expect(useChatOverlayStore.getState().pendingConfirmation).toEqual(confirmation)

    useChatOverlayStore.getState().setPendingConfirmation(null)
    expect(useChatOverlayStore.getState().pendingConfirmation).toBeNull()
  })

  it('updates selected model', () => {
    useChatOverlayStore.getState().setModel('claude')

    expect(useChatOverlayStore.getState().selectedModel).toBe('claude')
  })
})
