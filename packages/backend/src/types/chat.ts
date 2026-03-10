export type ChatStatus = 'idle' | 'busy' | 'error'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: number
}

export interface PendingConfirmation {
  permissionId: string
  toolName: string
  description: string
  args: Record<string, unknown>
}

export interface ChatSnapshot {
  sessionId: string | null
  messages: ChatMessage[]
  status: ChatStatus
  pendingConfirmation: PendingConfirmation | null
}

export type OpenCodeEvent =
  | { type: 'chat:delta'; text: string }
  | { type: 'chat:tool-call'; toolName: string; args: Record<string, unknown>; state: string }
  | { type: 'chat:tool-result'; toolName: string; result: string; state: string }
  | {
      type: 'chat:confirm-request'
      permissionId: string
      toolName: string
      description: string
      args: Record<string, unknown>
    }
  | { type: 'chat:status'; status: ChatStatus }
  | { type: 'chat:error'; error: string }
  | { type: 'chat:message'; message: ChatMessage }
