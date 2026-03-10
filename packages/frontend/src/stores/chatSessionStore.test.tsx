import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  resetChatSessionStore,
  useChatSessionStore,
  type ChatSessionMessage
} from '@/stores/chatSessionStore'
import type { ChatSnapshot, PendingConfirmation } from '@/types/chat'

function makeMessage(overrides: Partial<ChatSessionMessage> = {}): ChatSessionMessage {
  return {
    id: overrides.id ?? 'message-1',
    role: overrides.role ?? 'user',
    content: overrides.content ?? 'hello',
    timestamp: overrides.timestamp ?? 1,
    isStreaming: overrides.isStreaming,
    toolCall: overrides.toolCall
  }
}

function makePendingConfirmation(
  overrides: Partial<PendingConfirmation> = {}
): PendingConfirmation {
  return {
    permissionId: overrides.permissionId ?? 'permission-1',
    toolName: overrides.toolName ?? 'start_loop',
    description: overrides.description ?? 'Approve start_loop',
    args: overrides.args ?? { loopId: 'loop-1' }
  }
}

function makeSnapshot(overrides: Partial<ChatSnapshot> = {}): ChatSnapshot {
  return {
    sessionId: overrides.sessionId ?? 'session-1',
    status: overrides.status ?? 'busy',
    messages: overrides.messages ?? [makeMessage()],
    pendingConfirmation:
      'pendingConfirmation' in overrides
        ? (overrides.pendingConfirmation ?? null)
        : makePendingConfirmation()
  }
}

describe('chatSessionStore', () => {
  beforeEach(() => {
    vi
      .spyOn(globalThis.crypto, 'randomUUID')
      .mockReturnValue('00000000-0000-4000-8000-000000000001')
    resetChatSessionStore()
  })

  it('appends delta chunks into a single streaming assistant message', () => {
    useChatSessionStore.getState().appendDelta('Hello')
    useChatSessionStore.getState().appendDelta(' world')

    const state = useChatSessionStore.getState()
    expect(state.isStreaming).toBe(true)
    expect(state.messages).toEqual([
      expect.objectContaining({
        id: '00000000-0000-4000-8000-000000000001',
        role: 'assistant',
        content: 'Hello world',
        isStreaming: true
      })
    ])
  })

  it('finalizeCurrent marks the active assistant message as no longer streaming', () => {
    useChatSessionStore.getState().appendDelta('Hello')

    useChatSessionStore.getState().finalizeCurrent()

    expect(useChatSessionStore.getState().messages).toEqual([
      expect.objectContaining({
        role: 'assistant',
        content: 'Hello',
        isStreaming: false
      })
    ])
    expect(useChatSessionStore.getState().isStreaming).toBe(false)
  })

  it('hydrateFromSnapshot replaces all existing state atomically', () => {
    useChatSessionStore.getState().addMessage(makeMessage({ id: 'stale-message' }))
    useChatSessionStore
      .getState()
      .setPendingConfirmation(makePendingConfirmation({ permissionId: 'stale-permission' }))
    useChatSessionStore.getState().setStatus('error')

    useChatSessionStore
      .getState()
      .hydrateFromSnapshot(
        makeSnapshot({
          sessionId: 'session-fresh',
          status: 'idle',
          messages: [],
          pendingConfirmation: null
        })
      )

    expect(useChatSessionStore.getState()).toMatchObject({
      sessionId: 'session-fresh',
      status: 'idle',
      pendingConfirmation: null,
      messages: [],
      isStreaming: false
    })
  })

  it('addError appends an assistant error message and updates status', () => {
    useChatSessionStore.getState().addError('provider failed')

    expect(useChatSessionStore.getState()).toMatchObject({
      status: 'error',
      isStreaming: false
    })
    expect(useChatSessionStore.getState().messages).toEqual([
      expect.objectContaining({
        role: 'assistant',
        content: 'provider failed',
        isStreaming: false
      })
    ])
  })
})
