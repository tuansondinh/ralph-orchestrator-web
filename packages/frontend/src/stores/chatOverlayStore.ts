import { create } from 'zustand'

export type AIModel = 'gemini' | 'openai' | 'claude'

export interface ToolConfirmation {
  id: string
  toolName: string
  description: string
  args: Record<string, unknown>
  status: 'pending' | 'confirmed' | 'cancelled'
  isSubmitting: boolean
}

export interface OverlayMessage {
  id: string
  role: 'user' | 'assistant' | 'tool'
  content: string
  toolCall?: {
    id: string
    name: string
    link?: string
  }
  isStreaming?: boolean
  timestamp: number
}

interface ChatOverlayStoreState {
  isOpen: boolean
  messages: OverlayMessage[]
  isStreaming: boolean
  pendingConfirmation: ToolConfirmation | null
  selectedModel: AIModel
  sessionId: string
  toggle: () => void
  open: () => void
  close: () => void
  addMessage: (message: OverlayMessage) => void
  appendStreamChunk: (chunk: string) => void
  finalizeStreamMessage: () => void
  setPendingConfirmation: (confirmation: ToolConfirmation | null) => void
  updatePendingConfirmation: (updates: Partial<ToolConfirmation>) => void
  setModel: (model: AIModel) => void
}

function createId() {
  return globalThis.crypto.randomUUID()
}

function createInitialState() {
  return {
    isOpen: false,
    messages: [] as OverlayMessage[],
    isStreaming: false,
    pendingConfirmation: null as ToolConfirmation | null,
    selectedModel: 'gemini' as AIModel,
    sessionId: createId()
  }
}

export const useChatOverlayStore = create<ChatOverlayStoreState>((set) => ({
  ...createInitialState(),
  toggle: () =>
    set((state) => ({
      isOpen: !state.isOpen
    })),
  open: () =>
    set({
      isOpen: true
    }),
  close: () =>
    set({
      isOpen: false
    }),
  addMessage: (message) =>
    set((state) => ({
      messages: [...state.messages, message]
    })),
  appendStreamChunk: (chunk) =>
    set((state) => {
      const messages = [...state.messages]
      let streamingIndex = -1
      for (let index = messages.length - 1; index >= 0; index -= 1) {
        const candidate = messages[index]
        if (candidate?.role === 'assistant' && candidate.isStreaming) {
          streamingIndex = index
          break
        }
      }

      if (streamingIndex >= 0) {
        const streamingMessage = messages[streamingIndex]
        messages[streamingIndex] = {
          ...streamingMessage,
          content: `${streamingMessage.content}${chunk}`,
          isStreaming: true
        }
      } else {
        messages.push({
          id: createId(),
          role: 'assistant',
          content: chunk,
          isStreaming: true,
          timestamp: Date.now()
        })
      }

      return {
        messages,
        isStreaming: true
      }
    }),
  finalizeStreamMessage: () =>
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
  setPendingConfirmation: (confirmation) =>
    set({
      pendingConfirmation: confirmation
    }),
  updatePendingConfirmation: (updates) =>
    set((state) => {
      if (!state.pendingConfirmation) {
        return {}
      }

      return {
        pendingConfirmation: {
          ...state.pendingConfirmation,
          ...updates
        }
      }
    }),
  setModel: (model) =>
    set({
      selectedModel: model
    })
}))

export function resetChatOverlayStore() {
  useChatOverlayStore.setState({ ...createInitialState() })
}
