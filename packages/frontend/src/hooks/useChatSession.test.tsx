import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ChatSendContext } from '@/providers/ChatSessionProvider'
import { useChatSession } from '@/hooks/useChatSession'
import { resetChatSessionStore, useChatSessionStore } from '@/stores/chatSessionStore'

describe('useChatSession', () => {
  beforeEach(() => {
    let idCounter = 0
    vi.spyOn(globalThis.crypto, 'randomUUID').mockImplementation(() => {
      idCounter += 1
      return `00000000-0000-4000-8000-${String(idCounter).padStart(12, '0')}`
    })
    resetChatSessionStore()
  })

  it('optimistically adds a user message and sends chat:send', () => {
    const send = vi.fn(() => true)
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ChatSendContext.Provider value={send}>{children}</ChatSendContext.Provider>
    )

    const { result } = renderHook(() => useChatSession(), { wrapper })

    act(() => {
      result.current.sendMessage('test')
    })

    expect(send).toHaveBeenCalledWith({ type: 'chat:send', message: 'test' })
    expect(useChatSessionStore.getState().messages).toEqual([
      expect.objectContaining({
        id: '00000000-0000-4000-8000-000000000001',
        role: 'user',
        content: 'test'
      })
    ])
  })

  it('adds an error instead of an optimistic message when chat is disconnected', () => {
    const send = vi.fn(() => false)
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ChatSendContext.Provider value={send}>{children}</ChatSendContext.Provider>
    )

    const { result } = renderHook(() => useChatSession(), { wrapper })

    act(() => {
      result.current.sendMessage('test')
    })

    expect(send).toHaveBeenCalledWith({ type: 'chat:send', message: 'test' })
    expect(useChatSessionStore.getState().messages).toEqual([
      expect.objectContaining({
        role: 'assistant',
        content: 'Chat is disconnected. Reconnect and try again.'
      })
    ])
  })

  it('sends confirmation responses and clears pendingConfirmation locally', () => {
    const send = vi.fn(() => true)
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ChatSendContext.Provider value={send}>{children}</ChatSendContext.Provider>
    )

    useChatSessionStore.getState().setPendingConfirmation({
      permissionId: 'permission-1',
      toolName: 'start_loop',
      description: 'Approve start_loop',
      args: { loopId: 'loop-1' }
    })

    const { result } = renderHook(() => useChatSession(), { wrapper })

    act(() => {
      result.current.confirmAction('permission-1', true)
    })

    expect(send).toHaveBeenCalledWith({
      type: 'chat:confirm',
      permissionId: 'permission-1',
      confirmed: true
    })
    expect(useChatSessionStore.getState().pendingConfirmation).toBeNull()
  })

  it('keeps pending confirmation in place when confirm cannot be sent', () => {
    const send = vi.fn(() => false)
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ChatSendContext.Provider value={send}>{children}</ChatSendContext.Provider>
    )

    useChatSessionStore.getState().setPendingConfirmation({
      permissionId: 'permission-1',
      toolName: 'start_loop',
      description: 'Approve start_loop',
      args: { loopId: 'loop-1' }
    })

    const { result } = renderHook(() => useChatSession(), { wrapper })

    act(() => {
      result.current.confirmAction('permission-1', true)
    })

    expect(useChatSessionStore.getState().pendingConfirmation).toMatchObject({
      permissionId: 'permission-1'
    })
    expect(useChatSessionStore.getState().messages.at(-1)).toMatchObject({
      role: 'assistant',
      content: 'Chat is disconnected. Reconnect and try again.'
    })
  })

  it('clears the local transcript and sends chat:restart', () => {
    const send = vi.fn(() => true)
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ChatSendContext.Provider value={send}>{children}</ChatSendContext.Provider>
    )

    useChatSessionStore.getState().addMessage({
      id: 'assistant-1',
      role: 'assistant',
      content: 'Old transcript',
      timestamp: 1,
      isStreaming: false
    })

    const { result } = renderHook(() => useChatSession(), { wrapper })

    act(() => {
      result.current.restartChat()
    })

    expect(send).toHaveBeenCalledWith({ type: 'chat:restart' })
    expect(useChatSessionStore.getState()).toMatchObject({
      sessionId: null,
      messages: [],
      status: 'idle',
      pendingConfirmation: null
    })
  })
})
