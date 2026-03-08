import { type InferInsertModel, type InferSelectModel } from 'drizzle-orm'
import { bigint, boolean, pgTable, text } from 'drizzle-orm/pg-core'

const epoch = (name: string) => bigint(name, { mode: 'number' })

export const projects = pgTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  path: text('path').notNull().unique(),
  type: text('type'),
  ralphConfig: text('ralph_config'),
  createdAt: epoch('created_at').notNull(),
  updatedAt: epoch('updated_at').notNull()
})

export const loopRuns = pgTable('loop_runs', {
  id: text('id').primaryKey(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  ralphLoopId: text('ralph_loop_id'),
  state: text('state').notNull(),
  config: text('config'),
  prompt: text('prompt'),
  worktree: text('worktree'),
  iterations: bigint('iterations', { mode: 'number' }).notNull().default(0),
  tokensUsed: bigint('tokens_used', { mode: 'number' }).notNull().default(0),
  errors: bigint('errors', { mode: 'number' }).notNull().default(0),
  startedAt: epoch('started_at').notNull(),
  endedAt: epoch('ended_at')
})

export const chatSessions = pgTable('chat_sessions', {
  id: text('id').primaryKey(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  state: text('state').notNull(),
  createdAt: epoch('created_at').notNull(),
  endedAt: epoch('ended_at')
})

export const chatMessages = pgTable('chat_messages', {
  id: text('id').primaryKey(),
  sessionId: text('session_id')
    .notNull()
    .references(() => chatSessions.id, { onDelete: 'cascade' }),
  role: text('role').notNull(),
  content: text('content').notNull(),
  timestamp: epoch('timestamp').notNull()
})

export const notifications = pgTable('notifications', {
  id: text('id').primaryKey(),
  projectId: text('project_id').references(() => projects.id),
  type: text('type').notNull(),
  title: text('title').notNull(),
  message: text('message'),
  read: boolean('read').notNull().default(false),
  createdAt: epoch('created_at').notNull()
})

export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull()
})

export const postgresSchema = {
  projects,
  loopRuns,
  chatSessions,
  chatMessages,
  notifications,
  settings
}

export type PgProject = InferSelectModel<typeof projects>
export type NewPgProject = InferInsertModel<typeof projects>
export type PgLoopRun = InferSelectModel<typeof loopRuns>
export type NewPgLoopRun = InferInsertModel<typeof loopRuns>
export type PgChatSession = InferSelectModel<typeof chatSessions>
export type NewPgChatSession = InferInsertModel<typeof chatSessions>
export type PgChatMessage = InferSelectModel<typeof chatMessages>
export type NewPgChatMessage = InferInsertModel<typeof chatMessages>
export type PgNotification = InferSelectModel<typeof notifications>
export type NewPgNotification = InferInsertModel<typeof notifications>
export type PgSetting = InferSelectModel<typeof settings>
export type NewPgSetting = InferInsertModel<typeof settings>
