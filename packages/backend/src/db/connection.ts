import { existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle as drizzleSqlite } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { eq } from 'drizzle-orm'
import { type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres, { type Sql } from 'postgres'
import type { ResolvedRuntimeMode } from '../config/runtimeMode.js'
import { schema, settings } from './schema.js'
import { postgresSchema } from './schema/postgres.js'

export interface CreateDatabaseOptions {
  filePath?: string
}

export interface DatabaseConnection {
  mode: 'local'
  dialect: 'sqlite'
  filePath: string
  metadata: {
    filePath: string
  }
  sqlite: Database.Database
  db: BetterSQLite3Database<typeof schema>
  close(): void
}

export interface CloudDatabaseConnection {
  mode: 'cloud'
  dialect: 'postgres'
  metadata: {
    connectionString: string
  }
  client: Sql
  db: PostgresJsDatabase<typeof postgresSchema>
  close(): Promise<void>
}

export type DatabaseProvider = DatabaseConnection | CloudDatabaseConnection

export interface CreateDatabaseProviderOptions {
  runtime?: ResolvedRuntimeMode
  sqlite?: CreateDatabaseOptions
  postgresFactory?: (
    connectionString: string
  ) => Pick<CloudDatabaseConnection, 'client' | 'db' | 'close'>
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

  const db = drizzleSqlite(sqlite, { schema })

  return {
    mode: 'local',
    dialect: 'sqlite',
    filePath,
    metadata: {
      filePath
    },
    sqlite,
    db,
    close() {
      sqlite.close()
    }
  }
}

function createPostgresDatabase(connectionString: string) {
  const client = postgres(connectionString, {
    prepare: false
  })

  return {
    client,
    db: drizzlePostgres(client, { schema: postgresSchema }),
    close() {
      return client.end()
    }
  }
}

export function createDatabaseProvider(
  options: CreateDatabaseProviderOptions = {}
): DatabaseProvider {
  const runtime = options.runtime

  if (!runtime || runtime.mode === 'local') {
    return createDatabase(options.sqlite)
  }

  const cloud = runtime.cloud
  if (!cloud) {
    throw new Error('Cloud runtime config is required when runtime mode is cloud')
  }

  const postgresConnection =
    options.postgresFactory?.(cloud.databaseUrl) ?? createPostgresDatabase(cloud.databaseUrl)

  return {
    mode: 'cloud',
    dialect: 'postgres',
    metadata: {
      connectionString: cloud.databaseUrl
    },
    client: postgresConnection.client,
    db: postgresConnection.db,
    close() {
      return postgresConnection.close()
    }
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

export function closeDatabase(connection: DatabaseProvider) {
  return connection.close()
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
