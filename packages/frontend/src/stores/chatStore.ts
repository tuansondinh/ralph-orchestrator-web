import { create } from 'zustand'
import type {
  ChatMessageRecord,
  ChatSessionBackend,
  ChatSessionRecord,
  ChatSessionState,
  ChatSessionType
} from '@/lib/chatApi'

interface ChatStoreState {
  sessionsByProject: Record<string, ChatSessionRecord | undefined>
  messagesBySession: Record<string, ChatMessageRecord[] | undefined>
  historyLoadedBySession: Record<string, boolean | undefined>
  sessionTypeByProject: Record<string, ChatSessionType | undefined>
  sessionBackendByProject: Record<string, ChatSessionBackend | undefined>
  setSessionType: (projectId: string, type: ChatSessionType) => void
  setSessionBackend: (projectId: string, backend: ChatSessionBackend) => void
  setSession: (projectId: string, session: ChatSessionRecord) => void
  setMessages: (sessionId: string, messages: ChatMessageRecord[]) => void
  upsertMessage: (message: ChatMessageRecord) => void
  markHistoryLoaded: (sessionId: string, loaded?: boolean) => void
  updateSessionState: (
    sessionId: string,
    state: ChatSessionState,
    endedAt?: number | null
  ) => void
}

const initialState = {
  sessionsByProject: {} as Record<string, ChatSessionRecord | undefined>,
  messagesBySession: {} as Record<string, ChatMessageRecord[] | undefined>,
  historyLoadedBySession: {} as Record<string, boolean | undefined>,
  sessionTypeByProject: {} as Record<string, ChatSessionType | undefined>,
  sessionBackendByProject: {} as Record<string, ChatSessionBackend | undefined>
}

function sortByTimestamp(messages: ChatMessageRecord[]) {
  return [...messages].sort((a, b) => a.timestamp - b.timestamp)
}

export const useChatStore = create<ChatStoreState>((set) => ({
  ...initialState,
  setSessionType: (projectId, type) =>
    set((state) => ({
      sessionTypeByProject: {
        ...state.sessionTypeByProject,
        [projectId]: type
      }
    })),
  setSessionBackend: (projectId, backend) =>
    set((state) => ({
      sessionBackendByProject: {
        ...state.sessionBackendByProject,
        [projectId]: backend
      }
    })),
  setSession: (projectId, session) =>
    set((state) => ({
      sessionsByProject: {
        ...state.sessionsByProject,
        [projectId]: session
      },
      sessionTypeByProject: {
        ...state.sessionTypeByProject,
        [projectId]: session.type
      },
      sessionBackendByProject: {
        ...state.sessionBackendByProject,
        [projectId]: session.backend
      }
    })),
  setMessages: (sessionId, messages) =>
    set((state) => ({
      messagesBySession: {
        ...state.messagesBySession,
        [sessionId]: sortByTimestamp(messages)
      }
    })),
  upsertMessage: (message) =>
    set((state) => {
      const current = state.messagesBySession[message.sessionId] ?? []
      const existingIndex = current.findIndex((candidate) => candidate.id === message.id)

      if (existingIndex >= 0) {
        const nextMessages = [...current]
        nextMessages[existingIndex] = message
        return {
          messagesBySession: {
            ...state.messagesBySession,
            [message.sessionId]: sortByTimestamp(nextMessages)
          }
        }
      }

      return {
        messagesBySession: {
          ...state.messagesBySession,
          [message.sessionId]: sortByTimestamp([...current, message])
        }
      }
    }),
  markHistoryLoaded: (sessionId, loaded = true) =>
    set((state) => ({
      historyLoadedBySession: {
        ...state.historyLoadedBySession,
        [sessionId]: loaded
      }
    })),
  updateSessionState: (sessionId, state, endedAt = null) =>
    set((store) => {
      const sessionsByProject: Record<string, ChatSessionRecord | undefined> = {}
      for (const [projectId, session] of Object.entries(store.sessionsByProject)) {
        if (!session || session.id !== sessionId) {
          sessionsByProject[projectId] = session
          continue
        }

        sessionsByProject[projectId] = {
          ...session,
          state,
          endedAt: endedAt ?? session.endedAt
        }
      }

      return {
        sessionsByProject
      }
    })
}))

export function resetChatStore() {
  useChatStore.setState({ ...initialState })
}

export type { ChatSessionRecord, ChatMessageRecord }
