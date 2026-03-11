import { useContext } from 'react'
import { ChatSendContext } from '@/providers/ChatSessionProvider'
import { useChatSessionStore } from '@/stores/chatSessionStore'

export function useChatSession() {
  const send = useContext(ChatSendContext)
  const messages = useChatSessionStore((state) => state.messages)
  const isStreaming = useChatSessionStore((state) => state.isStreaming)
  const status = useChatSessionStore((state) => state.status)
  const pendingConfirmation = useChatSessionStore((state) => state.pendingConfirmation)

  return {
    messages,
    isStreaming,
    status,
    pendingConfirmation,
    sendMessage(text: string) {
      const sent = send({
        type: 'chat:send',
        message: text
      })
      if (!sent) {
        useChatSessionStore.getState().addError(
          'Chat is disconnected. Reconnect and try again.'
        )
        return
      }
      useChatSessionStore.getState().addMessage({
        id: globalThis.crypto.randomUUID(),
        role: 'user',
        content: text,
        timestamp: Date.now(),
        isStreaming: false
      })
    },
    confirmAction(permissionId: string, confirmed: boolean) {
      const sent = send({
        type: 'chat:confirm',
        permissionId,
        confirmed
      })
      if (!sent) {
        useChatSessionStore.getState().addError(
          'Chat is disconnected. Reconnect and try again.'
        )
        return
      }
      useChatSessionStore.getState().setPendingConfirmation(null)
    },
    restartChat() {
      const sent = send({
        type: 'chat:restart'
      })
      if (!sent) {
        useChatSessionStore.getState().addError(
          'Chat is disconnected. Reconnect and try again.'
        )
        return
      }

      useChatSessionStore.getState().hydrateFromSnapshot({
        sessionId: null,
        messages: [],
        status: 'idle',
        pendingConfirmation: null
      })
    }
  }
}
