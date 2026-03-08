import { type InferInsertModel, type InferSelectModel } from 'drizzle-orm'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  path: text('path').notNull().unique(),
  type: text('type'),
  ralphConfig: text('ralph_config'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull()
})

export const loopRuns = sqliteTable('loop_runs', {
  id: text('id').primaryKey(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  ralphLoopId: text('ralph_loop_id'),
  state: text('state').notNull(),
  config: text('config'),
  prompt: text('prompt'),
  worktree: text('worktree'),
  iterations: integer('iterations').notNull().default(0),
  tokensUsed: integer('tokens_used').notNull().default(0),
  errors: integer('errors').notNull().default(0),
  startedAt: integer('started_at').notNull(),
  endedAt: integer('ended_at')
})

export const chatSessions = sqliteTable('chat_sessions', {
  id: text('id').primaryKey(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  state: text('state').notNull(),
  createdAt: integer('created_at').notNull(),
  endedAt: integer('ended_at')
})

export const chatMessages = sqliteTable('chat_messages', {
  id: text('id').primaryKey(),
  sessionId: text('session_id')
    .notNull()
    .references(() => chatSessions.id, { onDelete: 'cascade' }),
  role: text('role').notNull(),
  content: text('content').notNull(),
  timestamp: integer('timestamp').notNull()
})

export const notifications = sqliteTable('notifications', {
  id: text('id').primaryKey(),
  projectId: text('project_id').references(() => projects.id),
  type: text('type').notNull(),
  title: text('title').notNull(),
  message: text('message'),
  read: integer('read').notNull().default(0),
  createdAt: integer('created_at').notNull()
})

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull()
})

export const sqliteSchema = {
  projects,
  loopRuns,
  chatSessions,
  chatMessages,
  notifications,
  settings
}

export type Project = InferSelectModel<typeof projects>
export type NewProject = InferInsertModel<typeof projects>
export type LoopRun = InferSelectModel<typeof loopRuns>
export type NewLoopRun = InferInsertModel<typeof loopRuns>
export type ChatSession = InferSelectModel<typeof chatSessions>
export type NewChatSession = InferInsertModel<typeof chatSessions>
export type ChatMessage = InferSelectModel<typeof chatMessages>
export type NewChatMessage = InferInsertModel<typeof chatMessages>
export type Notification = InferSelectModel<typeof notifications>
export type NewNotification = InferInsertModel<typeof notifications>
export type Setting = InferSelectModel<typeof settings>
export type NewSetting = InferInsertModel<typeof settings>
