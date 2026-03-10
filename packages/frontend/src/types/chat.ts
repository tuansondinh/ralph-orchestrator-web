export type ChatMessageRole = 'user' | 'assistant' | 'tool'
export type ChatSessionStatus = 'idle' | 'busy' | 'error' | 'disconnected'

export interface ChatToolCall {
  name: string
  args: Record<string, unknown>
  state: 'pending' | 'running' | 'completed' | 'error'
}

export interface ChatMessage {
  id: string
  role: ChatMessageRole
  content: string
  timestamp: number
  isStreaming?: boolean
  toolCall?: ChatToolCall
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
  status: Exclude<ChatSessionStatus, 'disconnected'>
  pendingConfirmation: PendingConfirmation | null
}
