import { getTableColumns, getTableName } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { postgresSchema } from '../src/db/schema/postgres.js'
import { sqliteSchema } from '../src/db/schema/sqlite.js'

function readColumnMetadata(column: object) {
  return {
    columnType: Reflect.get(column, 'columnType'),
    dataType: Reflect.get(column, 'dataType'),
    defaultValue: Reflect.get(column, 'default'),
    isUnique: Reflect.get(column, 'isUnique'),
    notNull: Reflect.get(column, 'notNull')
  }
}

function getInlineForeignKeys(table: object) {
  const symbol = Object.getOwnPropertySymbols(table).find((candidate) =>
    candidate.toString().includes('InlineForeignKeys')
  )

  if (!symbol) {
    return []
  }

  const foreignKeys = Reflect.get(table, symbol)
  return Array.isArray(foreignKeys) ? foreignKeys : []
}

describe('dual-dialect schema bundles', () => {
  const CLOUD_ONLY_TABLES = ['githubConnections', 'loopOutputChunks']

  it('exposes the same logical tables for sqlite and postgres (excluding cloud-only tables)', () => {
    const sqliteTables = Object.keys(sqliteSchema).filter((k) => !CLOUD_ONLY_TABLES.includes(k)).sort()
    const postgresTables = Object.keys(postgresSchema).filter((k) => !CLOUD_ONLY_TABLES.includes(k)).sort()
    expect(sqliteTables).toEqual(postgresTables)

    expect(
      Object.values(sqliteSchema)
        .filter((_, i) => !CLOUD_ONLY_TABLES.includes(Object.keys(sqliteSchema)[i]))
        .map(getTableName)
        .sort()
    ).toEqual(
      Object.values(postgresSchema)
        .filter((_, i) => !CLOUD_ONLY_TABLES.includes(Object.keys(postgresSchema)[i]))
        .map(getTableName)
        .sort()
    )
  })

  it('normalizes boolean, timestamp, and nullable column semantics across dialects', () => {
    const sqliteNotificationColumns = getTableColumns(sqliteSchema.notifications)
    const postgresNotificationColumns = getTableColumns(postgresSchema.notifications)
    const sqliteProjectColumns = getTableColumns(sqliteSchema.projects)
    const postgresProjectColumns = getTableColumns(postgresSchema.projects)
    const sqliteLoopRunColumns = getTableColumns(sqliteSchema.loopRuns)
    const postgresLoopRunColumns = getTableColumns(postgresSchema.loopRuns)
    const sqliteNotificationRead = readColumnMetadata(sqliteNotificationColumns.read)
    const postgresNotificationRead = readColumnMetadata(postgresNotificationColumns.read)
    const sqliteProjectCreatedAt = readColumnMetadata(sqliteProjectColumns.createdAt)
    const postgresProjectCreatedAt = readColumnMetadata(postgresProjectColumns.createdAt)
    const sqliteLoopRunEndedAt = readColumnMetadata(sqliteLoopRunColumns.endedAt)
    const postgresLoopRunEndedAt = readColumnMetadata(postgresLoopRunColumns.endedAt)
    const sqliteNotificationMessage = readColumnMetadata(sqliteNotificationColumns.message)
    const postgresNotificationMessage = readColumnMetadata(postgresNotificationColumns.message)

    expect(sqliteNotificationRead.columnType).toBe('SQLiteInteger')
    expect(sqliteNotificationRead.defaultValue).toBe(0)
    expect(postgresNotificationRead.columnType).toBe('PgBoolean')
    expect(postgresNotificationRead.defaultValue).toBe(false)

    expect(sqliteProjectCreatedAt.dataType).toBe('number')
    expect(postgresProjectCreatedAt.dataType).toBe('number')
    expect(sqliteProjectCreatedAt.notNull).toBe(true)
    expect(postgresProjectCreatedAt.notNull).toBe(true)

    expect(sqliteLoopRunEndedAt.notNull).toBe(false)
    expect(postgresLoopRunEndedAt.notNull).toBe(false)
    expect(sqliteNotificationMessage.notNull).toBe(false)
    expect(postgresNotificationMessage.notNull).toBe(false)
  })

  it('preserves unique and cascade constraints across dialects', () => {
    const sqliteProjectColumns = getTableColumns(sqliteSchema.projects)
    const postgresProjectColumns = getTableColumns(postgresSchema.projects)
    const sqliteLoopRunForeignKeys = getInlineForeignKeys(sqliteSchema.loopRuns)
    const postgresLoopRunForeignKeys = getInlineForeignKeys(postgresSchema.loopRuns)
    const sqliteChatSessionForeignKeys = getInlineForeignKeys(sqliteSchema.chatSessions)
    const postgresChatSessionForeignKeys = getInlineForeignKeys(postgresSchema.chatSessions)
    const sqliteChatMessageForeignKeys = getInlineForeignKeys(sqliteSchema.chatMessages)
    const postgresChatMessageForeignKeys = getInlineForeignKeys(postgresSchema.chatMessages)
    const sqliteProjectPath = readColumnMetadata(sqliteProjectColumns.path)
    const postgresProjectPath = readColumnMetadata(postgresProjectColumns.path)

    expect(sqliteProjectPath.isUnique).toBe(true)
    expect(postgresProjectPath.isUnique).toBe(true)

    expect(sqliteLoopRunForeignKeys).toHaveLength(1)
    expect(postgresLoopRunForeignKeys).toHaveLength(1)
    expect(sqliteLoopRunForeignKeys[0]?.onDelete).toBe('cascade')
    expect(postgresLoopRunForeignKeys[0]?.onDelete).toBe('cascade')

    expect(sqliteChatSessionForeignKeys).toHaveLength(1)
    expect(postgresChatSessionForeignKeys).toHaveLength(1)
    expect(sqliteChatSessionForeignKeys[0]?.onDelete).toBe('cascade')
    expect(postgresChatSessionForeignKeys[0]?.onDelete).toBe('cascade')

    expect(sqliteChatMessageForeignKeys).toHaveLength(1)
    expect(postgresChatMessageForeignKeys).toHaveLength(1)
    expect(sqliteChatMessageForeignKeys[0]?.onDelete).toBe('cascade')
    expect(postgresChatMessageForeignKeys[0]?.onDelete).toBe('cascade')
  })
})
