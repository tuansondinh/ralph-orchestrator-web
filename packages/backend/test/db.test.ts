import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { count, eq } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'
import {
  type DatabaseConnection,
  closeDatabase,
  createDatabase,
  migrateDatabase
} from '../src/db/connection.js'
import {
  chatMessages,
  chatSessions,
  loopRuns,
  notifications,
  projects,
  settings
} from '../src/db/schema.js'

describe('database schema and connection', () => {
  const tempDirs: string[] = []
  const connections: DatabaseConnection[] = []

  async function createTestDatabase(name: string) {
    const dir = await mkdtemp(join(tmpdir(), `ralph-ui-${name}-`))
    tempDirs.push(dir)

    const filePath = join(dir, 'test.db')
    const connection = createDatabase({ filePath })
    connections.push(connection)
    migrateDatabase(connection.db)

    return connection
  }

  afterEach(async () => {
    while (connections.length > 0) {
      const connection = connections.pop()
      if (connection) {
        closeDatabase(connection)
      }
    }

    while (tempDirs.length > 0) {
      const dir = tempDirs.pop()
      if (dir) {
        await rm(dir, { recursive: true, force: true })
      }
    }
  })

  it('creates all required tables', async () => {
    const connection = await createTestDatabase('tables')

    const tables = connection.sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all() as Array<{ name: string }>

    const names = tables.map((table) => table.name)

    expect(names).toContain('projects')
    expect(names).toContain('loop_runs')
    expect(names).toContain('chat_sessions')
    expect(names).toContain('chat_messages')
    expect(names).toContain('notifications')
    expect(names).toContain('settings')
  })

  it('supports CRUD operations across all tables', async () => {
    const connection = await createTestDatabase('crud')
    const now = Date.now()

    await connection.db.insert(projects).values({
      id: 'project-1',
      name: 'Project One',
      path: '/tmp/project-one',
      type: 'node',
      ralphConfig: 'ralph.yml',
      createdAt: now,
      updatedAt: now
    })

    await connection.db.insert(loopRuns).values({
      id: 'loop-1',
      projectId: 'project-1',
      state: 'running',
      config: '{}',
      prompt: 'Ship it',
      worktree: null,
      iterations: 1,
      tokensUsed: 100,
      errors: 0,
      startedAt: now,
      endedAt: null
    })

    await connection.db.insert(chatSessions).values({
      id: 'chat-1',
      projectId: 'project-1',
      type: 'plan',
      state: 'active',
      createdAt: now,
      endedAt: null
    })

    await connection.db.insert(chatMessages).values({
      id: 'message-1',
      sessionId: 'chat-1',
      role: 'user',
      content: 'Create a plan',
      timestamp: now
    })

    await connection.db.insert(notifications).values({
      id: 'notification-1',
      projectId: 'project-1',
      type: 'loop_complete',
      title: 'Done',
      message: 'Loop finished',
      read: 0,
      createdAt: now
    })

    await connection.db.insert(settings).values({
      key: 'db.path',
      value: '/tmp/db.sqlite'
    })

    const [project] = await connection.db
      .select()
      .from(projects)
      .where(eq(projects.id, 'project-1'))

    expect(project?.name).toBe('Project One')

    await connection.db
      .update(loopRuns)
      .set({ state: 'completed', endedAt: now + 1000 })
      .where(eq(loopRuns.id, 'loop-1'))

    const [loop] = await connection.db
      .select()
      .from(loopRuns)
      .where(eq(loopRuns.id, 'loop-1'))

    expect(loop?.state).toBe('completed')

    await connection.db
      .delete(chatMessages)
      .where(eq(chatMessages.id, 'message-1'))

    const remainingMessages = await connection.db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.sessionId, 'chat-1'))

    expect(remainingMessages).toHaveLength(0)

    const [notification] = await connection.db
      .select()
      .from(notifications)
      .where(eq(notifications.id, 'notification-1'))

    expect(notification?.title).toBe('Done')

    const [setting] = await connection.db
      .select()
      .from(settings)
      .where(eq(settings.key, 'db.path'))

    expect(setting?.value).toBe('/tmp/db.sqlite')
  })

  it('enforces foreign key cascade deletes from project to loops and chats', async () => {
    const connection = await createTestDatabase('cascade')
    const now = Date.now()

    await connection.db.insert(projects).values({
      id: 'project-1',
      name: 'Project One',
      path: '/tmp/project-one',
      type: 'node',
      ralphConfig: 'ralph.yml',
      createdAt: now,
      updatedAt: now
    })

    await connection.db.insert(loopRuns).values({
      id: 'loop-1',
      projectId: 'project-1',
      state: 'running',
      config: null,
      prompt: null,
      worktree: null,
      iterations: 0,
      tokensUsed: 0,
      errors: 0,
      startedAt: now,
      endedAt: null
    })

    await connection.db.insert(chatSessions).values({
      id: 'chat-1',
      projectId: 'project-1',
      type: 'plan',
      state: 'active',
      createdAt: now,
      endedAt: null
    })

    await connection.db.insert(chatMessages).values({
      id: 'message-1',
      sessionId: 'chat-1',
      role: 'assistant',
      content: 'Working on it',
      timestamp: now
    })

    await connection.db.delete(projects).where(eq(projects.id, 'project-1'))

    const [loopCount] = await connection.db
      .select({ count: count() })
      .from(loopRuns)
      .where(eq(loopRuns.projectId, 'project-1'))
    const [chatCount] = await connection.db
      .select({ count: count() })
      .from(chatSessions)
      .where(eq(chatSessions.projectId, 'project-1'))
    const [messageCount] = await connection.db
      .select({ count: count() })
      .from(chatMessages)
      .where(eq(chatMessages.sessionId, 'chat-1'))

    expect(loopCount?.count).toBe(0)
    expect(chatCount?.count).toBe(0)
    expect(messageCount?.count).toBe(0)
  })

  it('supports concurrent reads from multiple connections', async () => {
    const primary = await createTestDatabase('concurrency')
    const secondary = createDatabase({ filePath: primary.filePath })
    connections.push(secondary)

    const now = Date.now()
    await primary.db.insert(projects).values(
      Array.from({ length: 5 }, (_, index) => ({
        id: `project-${index}`,
        name: `Project ${index}`,
        path: `/tmp/project-${index}`,
        type: 'node',
        ralphConfig: 'ralph.yml',
        createdAt: now + index,
        updatedAt: now + index
      }))
    )

    const reads = await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        Promise.resolve(
          (
            (index % 2 === 0 ? primary.sqlite : secondary.sqlite)
              .prepare('SELECT COUNT(*) AS count FROM projects')
              .get() as { count: number }
          ).count
        )
      )
    )

    expect(reads).toHaveLength(20)
    expect(new Set(reads)).toEqual(new Set([5]))
  })
})
