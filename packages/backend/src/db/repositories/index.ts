import { desc, eq } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type { DatabaseConnection, DatabaseProvider } from '../connection.js'
import { sqliteSchema } from '../schema/sqlite.js'
import { postgresSchema } from '../schema/postgres.js'
import {
  defineRepositoryBundle,
  type ChatMessageRecord,
  type ChatMessageRole,
  type ChatRepository,
  type ChatSessionRecord,
  type ChatSessionState,
  type ChatSessionType,
  type GitHubConnectionRecord,
  type GitHubConnectionRepository,
  type LoopOutputChunkRecord,
  type LoopOutputRepository,
  type LoopRunRepository,
  type NotificationListOptions,
  type NotificationRecord,
  type NotificationRepository,
  type ProjectRepository,
  type RepositoryBundle,
  type SettingsRepository
} from './contracts.js'

type SqliteDb = BetterSQLite3Database<typeof sqliteSchema>
type PostgresDb = PostgresJsDatabase<typeof postgresSchema>

export type RepositoryBundleSource = RepositoryBundle | SqliteDb

function toNotificationReadValue(read: boolean) {
  return read ? 1 : 0
}

function fromSqliteNotification(row: typeof sqliteSchema.notifications.$inferSelect): NotificationRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    type: row.type as NotificationRecord['type'],
    title: row.title,
    message: row.message,
    read: row.read === 1,
    createdAt: row.createdAt
  }
}

function fromSqliteChatSession(
  row: typeof sqliteSchema.chatSessions.$inferSelect
): ChatSessionRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    type: row.type as ChatSessionType,
    state: row.state as ChatSessionState,
    createdAt: row.createdAt,
    endedAt: row.endedAt
  }
}

function fromSqliteChatMessage(
  row: typeof sqliteSchema.chatMessages.$inferSelect
): ChatMessageRecord {
  return {
    id: row.id,
    sessionId: row.sessionId,
    role: row.role as ChatMessageRole,
    content: row.content,
    timestamp: row.timestamp
  }
}

function fromPostgresNotification(
  row: typeof postgresSchema.notifications.$inferSelect
): NotificationRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    type: row.type as NotificationRecord['type'],
    title: row.title,
    message: row.message,
    read: row.read,
    createdAt: row.createdAt
  }
}

function fromPostgresChatSession(
  row: typeof postgresSchema.chatSessions.$inferSelect
): ChatSessionRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    type: row.type as ChatSessionType,
    state: row.state as ChatSessionState,
    createdAt: row.createdAt,
    endedAt: row.endedAt
  }
}

function fromPostgresChatMessage(
  row: typeof postgresSchema.chatMessages.$inferSelect
): ChatMessageRecord {
  return {
    id: row.id,
    sessionId: row.sessionId,
    role: row.role as ChatMessageRole,
    content: row.content,
    timestamp: row.timestamp
  }
}

function createSqliteProjectRepository(db: SqliteDb): ProjectRepository {
  return {
    async list() {
      return db.select().from(sqliteSchema.projects).all()
    },
    async findById(id) {
      return db.select().from(sqliteSchema.projects).where(eq(sqliteSchema.projects.id, id)).get() ?? null
    },
    async create(project) {
      db.insert(sqliteSchema.projects).values(project).run()
      return project
    },
    async update(id, updates) {
      db.update(sqliteSchema.projects).set(updates).where(eq(sqliteSchema.projects.id, id)).run()
      const updated = db
        .select()
        .from(sqliteSchema.projects)
        .where(eq(sqliteSchema.projects.id, id))
        .get()
      if (!updated) {
        throw new Error(`Project not found after update: ${id}`)
      }
      return updated
    },
    async delete(id) {
      db.delete(sqliteSchema.projects).where(eq(sqliteSchema.projects.id, id)).run()
    }
  }
}

function createSqliteLoopRunRepository(db: SqliteDb): LoopRunRepository {
  return {
    async listAll() {
      return db.select().from(sqliteSchema.loopRuns).all()
    },
    async listByProjectId(projectId) {
      return db
        .select()
        .from(sqliteSchema.loopRuns)
        .where(eq(sqliteSchema.loopRuns.projectId, projectId))
        .all()
    },
    async findById(id) {
      return db.select().from(sqliteSchema.loopRuns).where(eq(sqliteSchema.loopRuns.id, id)).get() ?? null
    },
    async create(run) {
      db.insert(sqliteSchema.loopRuns).values(run).run()
      return run
    },
    async update(id, updates) {
      db.update(sqliteSchema.loopRuns).set(updates).where(eq(sqliteSchema.loopRuns.id, id)).run()
      const updated = db.select().from(sqliteSchema.loopRuns).where(eq(sqliteSchema.loopRuns.id, id)).get()
      if (!updated) {
        throw new Error(`Loop run not found after update: ${id}`)
      }
      return updated
    }
  }
}

function createSqliteChatRepository(db: SqliteDb): ChatRepository {
  return {
    async findSessionById(sessionId) {
      const row = db
        .select()
        .from(sqliteSchema.chatSessions)
        .where(eq(sqliteSchema.chatSessions.id, sessionId))
        .get()
      return row ? fromSqliteChatSession(row) : null
    },
    async findLatestActiveSessionByProjectId(projectId) {
      const rows = db
        .select()
        .from(sqliteSchema.chatSessions)
        .where(eq(sqliteSchema.chatSessions.projectId, projectId))
        .all()
        .sort((left, right) => right.createdAt - left.createdAt)

      const active = rows.find((row) => row.state !== 'completed')
      return active ? fromSqliteChatSession(active) : null
    },
    async createSession(session) {
      db.insert(sqliteSchema.chatSessions).values(session).run()
      return session
    },
    async updateSession(sessionId, updates) {
      db
        .update(sqliteSchema.chatSessions)
        .set(updates)
        .where(eq(sqliteSchema.chatSessions.id, sessionId))
        .run()
      const updated = db
        .select()
        .from(sqliteSchema.chatSessions)
        .where(eq(sqliteSchema.chatSessions.id, sessionId))
        .get()
      if (!updated) {
        throw new Error(`Chat session not found after update: ${sessionId}`)
      }
      return fromSqliteChatSession(updated)
    },
    async listMessagesBySessionId(sessionId) {
      return db
        .select()
        .from(sqliteSchema.chatMessages)
        .where(eq(sqliteSchema.chatMessages.sessionId, sessionId))
        .all()
        .sort((left, right) => left.timestamp - right.timestamp)
        .map(fromSqliteChatMessage)
    },
    async createMessage(message) {
      db.insert(sqliteSchema.chatMessages).values(message).run()
      return message
    }
  }
}

function createSqliteNotificationRepository(db: SqliteDb): NotificationRepository {
  return {
    async list(options: NotificationListOptions = {}) {
      const limit = Math.max(1, Math.min(options.limit ?? 50, 200))
      const rows = options.projectId
        ? db
            .select()
            .from(sqliteSchema.notifications)
            .where(eq(sqliteSchema.notifications.projectId, options.projectId))
            .orderBy(desc(sqliteSchema.notifications.createdAt))
            .limit(limit)
            .all()
        : db
            .select()
            .from(sqliteSchema.notifications)
            .orderBy(desc(sqliteSchema.notifications.createdAt))
            .limit(limit)
            .all()
      return rows.map(fromSqliteNotification)
    },
    async findById(id) {
      const row = db
        .select()
        .from(sqliteSchema.notifications)
        .where(eq(sqliteSchema.notifications.id, id))
        .get()
      return row ? fromSqliteNotification(row) : null
    },
    async create(notification) {
      db
        .insert(sqliteSchema.notifications)
        .values({
          ...notification,
          read: toNotificationReadValue(notification.read)
        })
        .run()
      return notification
    },
    async update(id, updates) {
      db
        .update(sqliteSchema.notifications)
        .set({
          ...updates,
          read: typeof updates.read === 'boolean' ? toNotificationReadValue(updates.read) : undefined
        })
        .where(eq(sqliteSchema.notifications.id, id))
        .run()
      const row = db
        .select()
        .from(sqliteSchema.notifications)
        .where(eq(sqliteSchema.notifications.id, id))
        .get()
      if (!row) {
        throw new Error(`Notification not found after update: ${id}`)
      }
      return fromSqliteNotification(row)
    },
    async delete(id) {
      db.delete(sqliteSchema.notifications).where(eq(sqliteSchema.notifications.id, id)).run()
    }
  }
}

function createSqliteSettingsRepository(db: SqliteDb): SettingsRepository {
  return {
    async list() {
      return db.select().from(sqliteSchema.settings).all()
    },
    async get(key) {
      return db.select().from(sqliteSchema.settings).where(eq(sqliteSchema.settings.key, key)).get() ?? null
    },
    async upsert(setting) {
      db
        .insert(sqliteSchema.settings)
        .values(setting)
        .onConflictDoUpdate({
          target: sqliteSchema.settings.key,
          set: {
            value: setting.value
          }
        })
        .run()
      return setting
    },
    async delete(key) {
      db.delete(sqliteSchema.settings).where(eq(sqliteSchema.settings.key, key)).run()
    }
  }
}

function createSqliteGitHubConnectionRepository(): GitHubConnectionRepository {
  return {
    async findByUserId() {
      throw new Error('GitHub connections are not available in local mode')
    },
    async create() {
      throw new Error('GitHub connections are not available in local mode')
    },
    async delete() {
      throw new Error('GitHub connections are not available in local mode')
    }
  }
}

function createSqliteLoopOutputRepository(): LoopOutputRepository {
  return {
    async append() {
      throw new Error('Loop output persistence is not available in local mode')
    },
    async getByLoopRunId() {
      throw new Error('Loop output persistence is not available in local mode')
    },
    async deleteByLoopRunId() {
      throw new Error('Loop output persistence is not available in local mode')
    }
  }
}

export function createSqliteRepositoryBundle(db: SqliteDb): RepositoryBundle {
  return defineRepositoryBundle({
    projects: createSqliteProjectRepository(db),
    loopRuns: createSqliteLoopRunRepository(db),
    chats: createSqliteChatRepository(db),
    notifications: createSqliteNotificationRepository(db),
    settings: createSqliteSettingsRepository(db),
    githubConnections: createSqliteGitHubConnectionRepository(),
    loopOutput: createSqliteLoopOutputRepository()
  })
}

function createPostgresProjectRepository(db: PostgresDb): ProjectRepository {
  return {
    async list() {
      return await db.select().from(postgresSchema.projects)
    },
    async findById(id) {
      const rows = await db.select().from(postgresSchema.projects).where(eq(postgresSchema.projects.id, id))
      return rows[0] ?? null
    },
    async create(project) {
      const rows = await db.insert(postgresSchema.projects).values(project).returning()
      return rows[0] ?? project
    },
    async update(id, updates) {
      const rows = await db
        .update(postgresSchema.projects)
        .set(updates)
        .where(eq(postgresSchema.projects.id, id))
        .returning()
      const updated = rows[0]
      if (!updated) {
        throw new Error(`Project not found after update: ${id}`)
      }
      return updated
    },
    async delete(id) {
      await db.delete(postgresSchema.projects).where(eq(postgresSchema.projects.id, id))
    }
  }
}

function createPostgresLoopRunRepository(db: PostgresDb): LoopRunRepository {
  return {
    async listAll() {
      return await db.select().from(postgresSchema.loopRuns)
    },
    async listByProjectId(projectId) {
      return await db.select().from(postgresSchema.loopRuns).where(eq(postgresSchema.loopRuns.projectId, projectId))
    },
    async findById(id) {
      const rows = await db.select().from(postgresSchema.loopRuns).where(eq(postgresSchema.loopRuns.id, id))
      return rows[0] ?? null
    },
    async create(run) {
      const rows = await db.insert(postgresSchema.loopRuns).values(run).returning()
      return rows[0] ?? run
    },
    async update(id, updates) {
      const rows = await db
        .update(postgresSchema.loopRuns)
        .set(updates)
        .where(eq(postgresSchema.loopRuns.id, id))
        .returning()
      const updated = rows[0]
      if (!updated) {
        throw new Error(`Loop run not found after update: ${id}`)
      }
      return updated
    }
  }
}

function createPostgresChatRepository(db: PostgresDb): ChatRepository {
  return {
    async findSessionById(sessionId) {
      const rows = await db
        .select()
        .from(postgresSchema.chatSessions)
        .where(eq(postgresSchema.chatSessions.id, sessionId))
      return rows[0] ? fromPostgresChatSession(rows[0]) : null
    },
    async findLatestActiveSessionByProjectId(projectId) {
      const rows = await db
        .select()
        .from(postgresSchema.chatSessions)
        .where(eq(postgresSchema.chatSessions.projectId, projectId))
      const active = rows
        .sort((left, right) => right.createdAt - left.createdAt)
        .find((row) => row.state !== 'completed')
      return active ? fromPostgresChatSession(active) : null
    },
    async createSession(session) {
      const rows = await db.insert(postgresSchema.chatSessions).values(session).returning()
      return rows[0] ? fromPostgresChatSession(rows[0]) : session
    },
    async updateSession(sessionId, updates) {
      const rows = await db
        .update(postgresSchema.chatSessions)
        .set(updates)
        .where(eq(postgresSchema.chatSessions.id, sessionId))
        .returning()
      const updated = rows[0]
      if (!updated) {
        throw new Error(`Chat session not found after update: ${sessionId}`)
      }
      return fromPostgresChatSession(updated)
    },
    async listMessagesBySessionId(sessionId) {
      const rows = await db
        .select()
        .from(postgresSchema.chatMessages)
        .where(eq(postgresSchema.chatMessages.sessionId, sessionId))
      return rows.sort((left, right) => left.timestamp - right.timestamp).map(fromPostgresChatMessage)
    },
    async createMessage(message) {
      const rows = await db.insert(postgresSchema.chatMessages).values(message).returning()
      return rows[0] ? fromPostgresChatMessage(rows[0]) : message
    }
  }
}

function createPostgresNotificationRepository(db: PostgresDb): NotificationRepository {
  return {
    async list(options: NotificationListOptions = {}) {
      const limit = Math.max(1, Math.min(options.limit ?? 50, 200))
      const rows = options.projectId
        ? await db
            .select()
            .from(postgresSchema.notifications)
            .where(eq(postgresSchema.notifications.projectId, options.projectId))
            .orderBy(desc(postgresSchema.notifications.createdAt))
            .limit(limit)
        : await db
            .select()
            .from(postgresSchema.notifications)
            .orderBy(desc(postgresSchema.notifications.createdAt))
            .limit(limit)
      return rows.map(fromPostgresNotification)
    },
    async findById(id) {
      const rows = await db
        .select()
        .from(postgresSchema.notifications)
        .where(eq(postgresSchema.notifications.id, id))
      return rows[0] ? fromPostgresNotification(rows[0]) : null
    },
    async create(notification) {
      const rows = await db
        .insert(postgresSchema.notifications)
        .values(notification)
        .returning()
      return rows[0] ? fromPostgresNotification(rows[0]) : notification
    },
    async update(id, updates) {
      const rows = await db
        .update(postgresSchema.notifications)
        .set(updates)
        .where(eq(postgresSchema.notifications.id, id))
        .returning()
      const updated = rows[0]
      if (!updated) {
        throw new Error(`Notification not found after update: ${id}`)
      }
      return fromPostgresNotification(updated)
    },
    async delete(id) {
      await db.delete(postgresSchema.notifications).where(eq(postgresSchema.notifications.id, id))
    }
  }
}

function createPostgresSettingsRepository(db: PostgresDb): SettingsRepository {
  return {
    async list() {
      return await db.select().from(postgresSchema.settings)
    },
    async get(key) {
      const rows = await db.select().from(postgresSchema.settings).where(eq(postgresSchema.settings.key, key))
      return rows[0] ?? null
    },
    async upsert(setting) {
      const rows = await db
        .insert(postgresSchema.settings)
        .values(setting)
        .onConflictDoUpdate({
          target: postgresSchema.settings.key,
          set: {
            value: setting.value
          }
        })
        .returning()
      return rows[0] ?? setting
    },
    async delete(key) {
      await db.delete(postgresSchema.settings).where(eq(postgresSchema.settings.key, key))
    }
  }
}

function createPostgresGitHubConnectionRepository(db: PostgresDb): GitHubConnectionRepository {
  return {
    async findByUserId(userId) {
      const rows = await db
        .select()
        .from(postgresSchema.githubConnections)
        .where(eq(postgresSchema.githubConnections.userId, userId))
      return rows[0] ?? null
    },
    async create(record) {
      await db.insert(postgresSchema.githubConnections).values(record)
    },
    async delete(userId) {
      await db
        .delete(postgresSchema.githubConnections)
        .where(eq(postgresSchema.githubConnections.userId, userId))
    }
  }
}

function createPostgresLoopOutputRepository(db: PostgresDb): LoopOutputRepository {
  return {
    async append(chunk) {
      await db.insert(postgresSchema.loopOutputChunks).values(chunk)
    },
    async getByLoopRunId(loopRunId, afterSequence) {
      if (afterSequence !== undefined) {
        const rows = await db
          .select()
          .from(postgresSchema.loopOutputChunks)
          .where(eq(postgresSchema.loopOutputChunks.loopRunId, loopRunId))
        return rows
          .filter((row) => row.sequence > afterSequence)
          .sort((a, b) => a.sequence - b.sequence)
          .map((row) => ({
            ...row,
            stream: row.stream as 'stdout' | 'stderr'
          }))
      }

      const rows = await db
        .select()
        .from(postgresSchema.loopOutputChunks)
        .where(eq(postgresSchema.loopOutputChunks.loopRunId, loopRunId))
      return rows.sort((a, b) => a.sequence - b.sequence).map((row) => ({
        ...row,
        stream: row.stream as 'stdout' | 'stderr'
      }))
    },
    async deleteByLoopRunId(loopRunId) {
      await db
        .delete(postgresSchema.loopOutputChunks)
        .where(eq(postgresSchema.loopOutputChunks.loopRunId, loopRunId))
    }
  }
}

export function createPostgresRepositoryBundle(db: PostgresDb): RepositoryBundle {
  return defineRepositoryBundle({
    projects: createPostgresProjectRepository(db),
    loopRuns: createPostgresLoopRunRepository(db),
    chats: createPostgresChatRepository(db),
    notifications: createPostgresNotificationRepository(db),
    settings: createPostgresSettingsRepository(db),
    githubConnections: createPostgresGitHubConnectionRepository(db),
    loopOutput: createPostgresLoopOutputRepository(db)
  })
}

export function createRepositoryBundle(provider: DatabaseProvider | DatabaseConnection): RepositoryBundle {
  if (provider.dialect === 'sqlite') {
    return createSqliteRepositoryBundle(provider.db)
  }

  return createPostgresRepositoryBundle(provider.db)
}

export function resolveRepositoryBundle(source: RepositoryBundleSource): RepositoryBundle {
  if ('projects' in source && 'loopRuns' in source && 'chats' in source) {
    return source
  }

  return createSqliteRepositoryBundle(source)
}
