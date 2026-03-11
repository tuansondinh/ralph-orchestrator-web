import { create } from 'zustand'
import type {
  ChatMessage,
  ChatSessionStatus,
  ChatSnapshot,
  PendingConfirmation
} from '@/types/chat'

export interface ChatSessionState {
  messages: ChatMessage[]
  isStreaming: boolean
  currentStreamingIndex: number
  status: ChatSessionStatus
  sessionId: string | null
  pendingConfirmation: PendingConfirmation | null
  addMessage: (message: ChatMessage) => void
  appendDelta: (text: string) => void
  finalizeCurrent: () => void
  setStatus: (status: ChatSessionStatus) => void
  setPendingConfirmation: (pendingConfirmation: PendingConfirmation | null) => void
  hydrateFromSnapshot: (snapshot: ChatSnapshot) => void
  reset: () => void
  addError: (error: string) => void
}

export type ChatSessionMessage = ChatMessage

const initialState = {
  messages: [] as ChatMessage[],
  isStreaming: false,
  currentStreamingIndex: -1 as number,
  status: 'disconnected' as ChatSessionStatus,
  sessionId: null as string | null,
  pendingConfirmation: null as PendingConfirmation | null
}

const CLAUDE_CODE_IDENTITY_PATTERN =
  /^(?:(?:hi|hello)\s*[,.! ]*)?i(?:'| a)m claude code, anthropic'?s official cli for claude\b/i

const RALPH_ASSISTANT_IDENTITY_MESSAGE =
  "I'm Ralph Assistant, built into Ralph Orchestrator. I help with software engineering tasks in this workspace. What would you like to work on today?"

function normalizeAssistantContent(content: string) {
  const trimmed = content.trim()
  if (!trimmed) {
    return content
  }

  if (CLAUDE_CODE_IDENTITY_PATTERN.test(trimmed)) {
    return RALPH_ASSISTANT_IDENTITY_MESSAGE
  }

  return content
}

function normalizeMessage(message: ChatMessage): ChatMessage {
  if (message.role !== 'assistant') {
    return message
  }

  return {
    ...message,
    content: normalizeAssistantContent(message.content)
  }
}

function createStreamingAssistantMessage(content: string): ChatMessage {
  return normalizeMessage({
    id: globalThis.crypto.randomUUID(),
    role: 'assistant',
    content,
    timestamp: Date.now(),
    isStreaming: true
  })
}

export const useChatSessionStore = create<ChatSessionState>((set) => ({
  ...initialState,
  addMessage: (message) =>
    set((state) => {
      if (message.role === 'assistant' || message.role === 'thinking') {
        // 1) Deduplicate by message ID (handles repeated message.updated SDK events)
        const existingByIdIndex = state.messages.findIndex(
          (candidate) => candidate.id === message.id
        )
        if (existingByIdIndex >= 0) {
          let messages = [...state.messages]
          messages[existingByIdIndex] = normalizeMessage(message)
          // Also remove orphan assistant streaming message created from deltas
          if (
            message.role === 'assistant' &&
            state.currentStreamingIndex >= 0 &&
            state.currentStreamingIndex !== existingByIdIndex &&
            state.currentStreamingIndex < messages.length &&
            messages[state.currentStreamingIndex]?.role === 'assistant'
          ) {
            const orphanIdx = state.currentStreamingIndex
            messages = messages.filter((_, i) => i !== orphanIdx)
          }
          return {
            messages,
            isStreaming:
              message.role === 'assistant' ? Boolean(message.isStreaming) : state.isStreaming,
            currentStreamingIndex:
              message.role === 'assistant' && !message.isStreaming ? -1 : state.currentStreamingIndex
          }
        }

        if (message.role === 'assistant') {
          // 2) Use tracked streaming index (survives finalizeCurrent race)
          if (
            state.currentStreamingIndex >= 0 &&
            state.currentStreamingIndex < state.messages.length
          ) {
            const target = state.messages[state.currentStreamingIndex]
            if (target?.role === 'assistant') {
              const messages = [...state.messages]
              messages[state.currentStreamingIndex] = normalizeMessage(message)
              return {
                messages,
                isStreaming: Boolean(message.isStreaming),
                currentStreamingIndex: message.isStreaming ? state.currentStreamingIndex : -1
              }
            }
          }

          // 3) Fallback: find a streaming message by flag
          const streamingIndex = state.messages.findIndex(
            (candidate) => candidate.role === 'assistant' && candidate.isStreaming
          )
          if (streamingIndex >= 0) {
            const messages = [...state.messages]
            messages[streamingIndex] = normalizeMessage(message)
            return {
              messages,
              isStreaming: Boolean(message.isStreaming),
              currentStreamingIndex: message.isStreaming ? streamingIndex : -1
            }
          }
        }
      }

      return {
        messages: [...state.messages, normalizeMessage(message)],
        isStreaming:
          message.role === 'assistant' ? Boolean(message.isStreaming) : state.isStreaming
      }
    }),
  appendDelta: (text) =>
    set((state) => {
      const messages = [...state.messages]

      for (let index = messages.length - 1; index >= 0; index -= 1) {
        const candidate = messages[index]
        if (candidate?.role === 'assistant' && candidate.isStreaming) {
          messages[index] = {
            ...candidate,
            content: normalizeAssistantContent(`${candidate.content}${text}`),
            isStreaming: true
          }
          return {
            messages,
            isStreaming: true
          }
        }
      }

      const newIndex = messages.length
      return {
        messages: [...messages, createStreamingAssistantMessage(text)],
        isStreaming: true,
        currentStreamingIndex: newIndex
      }
    }),
  finalizeCurrent: () =>
    set((state) => {
      const messages = [...state.messages]

      for (let index = messages.length - 1; index >= 0; index -= 1) {
        const candidate = messages[index]
        if (candidate?.role === 'assistant' && candidate.isStreaming) {
          messages[index] = {
            ...candidate,
            isStreaming: false
          }
          break
        }
      }

      return {
        messages,
        isStreaming: false
      }
    }),
  setStatus: (status) =>
    set({
      status
    }),
  setPendingConfirmation: (pendingConfirmation) =>
    set({
      pendingConfirmation
    }),
  hydrateFromSnapshot: (snapshot) =>
    set({
      messages: snapshot.messages.map(normalizeMessage),
      sessionId: snapshot.sessionId,
      status: snapshot.status,
      pendingConfirmation: snapshot.pendingConfirmation,
      isStreaming: snapshot.messages.some((message) => Boolean(message.isStreaming)),
      currentStreamingIndex: -1
    }),
  reset: () =>
    set({
      ...initialState
    }),
  addError: (error) =>
    set((state) => ({
      messages: [
        ...state.messages.map((message, index, messages) =>
          index === messages.length - 1 && message.role === 'assistant' && message.isStreaming
            ? { ...message, isStreaming: false }
            : message
        ),
        {
          id: globalThis.crypto.randomUUID(),
          role: 'assistant',
          content: normalizeAssistantContent(error),
          timestamp: Date.now(),
          isStreaming: false
        }
      ],
      isStreaming: false,
      status: 'error'
    }))
}))

export function resetChatSessionStore() {
  useChatSessionStore.getState().reset()
}
