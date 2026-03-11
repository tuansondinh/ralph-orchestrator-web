import { createContext, type PropsWithChildren, useEffect, useRef } from 'react'
import { useWebSocket } from '@/hooks/useWebSocket'
import { useChatSessionStore } from '@/stores/chatSessionStore'
import type {
  ChatMessage,
  ChatSessionStatus,
  PendingConfirmation
} from '@/types/chat'

type ChatSend = (message: Record<string, unknown>) => boolean

interface BackendChatMessage {
  id: string
  role: 'user' | 'assistant' | 'thinking'
  content: string
  createdAt: number
  streaming?: boolean
}

type BackendSocketMessage =
  | { type: 'chat:delta'; text: string }
  | { type: 'chat:tool-call'; toolName: string; args?: Record<string, unknown>; state: string }
  | { type: 'chat:tool-result'; toolName: string; result: string; state?: string }
  | ({
      type: 'chat:confirm-request'
    } & PendingConfirmation)
  | { type: 'chat:status'; status: Exclude<ChatSessionStatus, 'disconnected'> }
  | { type: 'chat:error'; error: string }
  | { type: 'chat:message'; message: BackendChatMessage }
  | {
      type: 'chat:snapshot'
      sessionId: string | null
      messages: BackendChatMessage[]
      status: Exclude<ChatSessionStatus, 'disconnected'>
      pendingConfirmation: PendingConfirmation | null
    }

const noopSend: ChatSend = () => false

export const ChatSendContext = createContext<ChatSend>(noopSend)

function normalizeMessage(message: BackendChatMessage): ChatMessage {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    timestamp: message.createdAt,
    isStreaming: message.streaming ?? false
  }
}

function normalizeToolCallState(state: string | undefined) {
  if (state === 'pending' || state === 'running' || state === 'completed' || state === 'error') {
    return state
  }

  return 'running'
}

export function ChatSessionProvider({ children }: PropsWithChildren) {
  const previousConnectedRef = useRef(false)
  const { isConnected, send } = useWebSocket({
    channels: ['opencode-chat'],
    onMessage: (rawMessage) => {
      const message = rawMessage as BackendSocketMessage
      const store = useChatSessionStore.getState()

      switch (message.type) {
        case 'chat:delta':
          store.appendDelta(message.text)
          return
        case 'chat:tool-call':
          store.addMessage({
            id: globalThis.crypto.randomUUID(),
            role: 'tool',
            content: '',
            timestamp: Date.now(),
            toolCall: {
              name: message.toolName,
              args: message.args ?? {},
              state: normalizeToolCallState(message.state)
            }
          })
          return
        case 'chat:tool-result':
          store.addMessage({
            id: globalThis.crypto.randomUUID(),
            role: 'tool',
            content: message.result,
            timestamp: Date.now(),
            toolCall: {
              name: message.toolName,
              args: {},
              state: normalizeToolCallState(message.state ?? 'completed')
            }
          })
          return
        case 'chat:confirm-request':
          store.setPendingConfirmation({
            permissionId: message.permissionId,
            toolName: message.toolName,
            description: message.description,
            args: message.args
          })
          return
        case 'chat:status':
          store.setStatus(message.status)
          if (message.status === 'idle') {
            store.finalizeCurrent()
          }
          return
        case 'chat:error':
          store.addError(message.error)
          return
        case 'chat:message':
          store.addMessage(normalizeMessage(message.message))
          return
        case 'chat:snapshot':
          store.hydrateFromSnapshot({
            sessionId: message.sessionId,
            messages: message.messages.map(normalizeMessage),
            status: message.status,
            pendingConfirmation: message.pendingConfirmation
          })
          return
        default:
          return
      }
    }
  })

  useEffect(() => {
    if (!isConnected) {
      useChatSessionStore.getState().setStatus('disconnected')
      previousConnectedRef.current = false
      return
    }

    if (!previousConnectedRef.current) {
      send({ type: 'chat:sync' })
    }

    previousConnectedRef.current = true
  }, [isConnected, send])

  return <ChatSendContext.Provider value={send}>{children}</ChatSendContext.Provider>
}
