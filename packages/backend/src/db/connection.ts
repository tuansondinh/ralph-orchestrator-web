import { existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { homedir } from 'node:os'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { eq } from 'drizzle-orm'
import { type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { schema, settings } from './schema.js'

export interface CreateDatabaseOptions {
  filePath?: string
}

export interface DatabaseConnection {
  filePath: string
  sqlite: Database.Database
  db: BetterSQLite3Database<typeof schema>
}

export interface MigrateDatabaseOptions {
  migrationsFolder?: string
}

export function resolveDefaultDatabasePath() {
  return resolve(process.cwd(), '.ralph-ui', 'data.db')
}

export function resolveMigrationsFolder() {
  const candidates = [
    resolve(process.cwd(), 'drizzle'),
    resolve(process.cwd(), 'packages', 'backend', 'drizzle')
  ]

  const match = candidates.find((candidate) => existsSync(candidate))
  return match ?? candidates[0]
}

export function createDatabase(options: CreateDatabaseOptions = {}): DatabaseConnection {
  const filePath =
    options.filePath ?? process.env.RALPH_UI_DB_PATH ?? resolveDefaultDatabasePath()

  mkdirSync(dirname(filePath), { recursive: true })

  const sqlite = new Database(filePath)
  sqlite.pragma('foreign_keys = ON')
  sqlite.pragma('journal_mode = WAL')

  const db = drizzle(sqlite, { schema })

  return {
    filePath,
    sqlite,
    db
  }
}

export function migrateDatabase(
  db: BetterSQLite3Database<typeof schema>,
  options: MigrateDatabaseOptions = {}
) {
  migrate(db, {
    migrationsFolder: options.migrationsFolder ?? resolveMigrationsFolder()
  })
}

export function initializeDatabase(connection: DatabaseConnection) {
  migrateDatabase(connection.db)

  connection.db
    .insert(settings)
    .values({ key: 'db.path', value: connection.filePath })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: connection.filePath }
    })

  return connection
}

export function closeDatabase(connection: DatabaseConnection) {
  connection.sqlite.close()
}

export function getSetting(
  connection: DatabaseConnection,
  key: string
): string | undefined {
  const setting = connection.db
    .select()
    .from(settings)
    .where(eq(settings.key, key))
    .get()
  return setting?.value
}
