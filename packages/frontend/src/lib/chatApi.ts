import { trpcClient } from '@/lib/trpc'
import type { RalphBackend } from '@/lib/backends'

export type ChatSessionType = 'plan' | 'task'
export type ChatSessionBackend = RalphBackend
export type ChatSessionState = 'active' | 'waiting' | 'completed' | 'unknown'
export type ChatRole = 'user' | 'assistant'

export interface ChatSessionRecord {
  id: string
  projectId: string
  type: ChatSessionType
  backend: ChatSessionBackend
  state: ChatSessionState
  processId: string | null
  createdAt: number
  endedAt: number | null
}

export interface ChatMessageRecord {
  id: string
  sessionId: string
  role: ChatRole
  content: string
  timestamp: number
  link?: string
}

export const chatApi = {
  startSession(input: {
    projectId: string
    type: ChatSessionType
    backend?: ChatSessionBackend
    initialInput?: string
  }): Promise<ChatSessionRecord> {
    return trpcClient.chat.startSession.mutate(input)
  },
  restartSession(input: {
    projectId: string
    type: ChatSessionType
    backend?: ChatSessionBackend
    initialInput?: string
  }): Promise<ChatSessionRecord> {
    return trpcClient.chat.restartSession.mutate(input)
  },
  getProjectSession(input: {
    projectId: string
  }): Promise<ChatSessionRecord | null> {
    return trpcClient.chat.getProjectSession.query(input)
  },
  sendMessage(input: {
    sessionId: string
    message: string
  }): Promise<void> {
    return trpcClient.chat.sendMessage.mutate(input)
  },
  endSession(input: {
    sessionId: string
  }): Promise<void> {
    return trpcClient.chat.endSession.mutate(input)
  },
  getHistory(input: {
    sessionId: string
  }): Promise<ChatMessageRecord[]> {
    return trpcClient.chat.getHistory.query(input)
  }
}
