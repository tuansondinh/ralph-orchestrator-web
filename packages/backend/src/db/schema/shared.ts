import type {
  ChatMessageRecord,
  ChatSessionRecord,
  LoopRunRecord,
  NotificationRecord,
  ProjectRecord,
  SettingRecord
} from '../repositories/contracts.js'

export const persistenceTableNames = [
  'projects',
  'loop_runs',
  'chat_sessions',
  'chat_messages',
  'notifications',
  'settings'
] as const

export const epochTimestampColumns = [
  'created_at',
  'updated_at',
  'started_at',
  'ended_at',
  'timestamp'
] as const

export const nullableColumns = {
  projects: ['type', 'ralph_config'],
  loopRuns: ['ralph_loop_id', 'config', 'prompt', 'worktree', 'ended_at'],
  chatSessions: ['ended_at'],
  notifications: ['project_id', 'message']
} as const

export type ProjectEntity = ProjectRecord
export type LoopRunEntity = LoopRunRecord
export type ChatSessionEntity = ChatSessionRecord
export type ChatMessageEntity = ChatMessageRecord
export type NotificationEntity = NotificationRecord
export type SettingEntity = SettingRecord
