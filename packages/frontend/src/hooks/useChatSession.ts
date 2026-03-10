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
      useChatSessionStore.getState().addMessage({
        id: globalThis.crypto.randomUUID(),
        role: 'user',
        content: text,
        timestamp: Date.now(),
        isStreaming: false
      })
      send({
        type: 'chat:send',
        message: text
      })
    },
    confirmAction(permissionId: string, confirmed: boolean) {
      send({
        type: 'chat:confirm',
        permissionId,
        confirmed
      })
      useChatSessionStore.getState().setPendingConfirmation(null)
    }
  }
}
