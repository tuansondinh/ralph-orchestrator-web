import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { migrate as migrateSqlite } from 'drizzle-orm/better-sqlite3/migrator'
import { migrate as migratePostgres } from 'drizzle-orm/postgres-js/migrator'
import {
  resolveRuntimeMode,
  type ResolvedRuntimeMode
} from '../config/runtimeMode.js'
import {
  closeDatabase,
  createDatabaseProvider,
  initializeDatabase,
  type CreateDatabaseProviderOptions,
  type DatabaseProvider
} from './connection.js'

interface MigrationFolderOptions {
  cwd?: string
}

export interface MigrationPaths {
  sqlite: string
  postgres: string
}

export interface MigrateDatabaseProviderOptions extends MigrationFolderOptions {
  paths?: Partial<MigrationPaths>
  sqliteMigrator?: (
    db: Extract<DatabaseProvider, { dialect: 'sqlite' }>['db'],
    options: { migrationsFolder: string }
  ) => unknown
  postgresMigrator?: (
    db: Extract<DatabaseProvider, { dialect: 'postgres' }>['db'],
    options: { migrationsFolder: string }
  ) => unknown
}

export interface RunDatabaseMigrationsOptions
  extends MigrateDatabaseProviderOptions {
  env?: NodeJS.ProcessEnv
  runtime?: ResolvedRuntimeMode
  databaseProviderFactory?: (
    runtime: ResolvedRuntimeMode
  ) => DatabaseProvider | Promise<DatabaseProvider>
  databaseProviderOptions?: Omit<CreateDatabaseProviderOptions, 'runtime'>
}

function resolveExistingPath(candidates: string[], fallback: string) {
  return candidates.find((candidate) => existsSync(candidate)) ?? fallback
}

export function resolveMigrationPaths(
  options: MigrationFolderOptions = {}
): MigrationPaths {
  const cwd = options.cwd ?? process.cwd()

  const sqliteFallback = resolve(cwd, 'drizzle')
  const postgresFallback = resolve(cwd, 'drizzle', 'postgres')

  return {
    sqlite: resolveExistingPath(
      [
        resolve(cwd, 'packages', 'backend', 'drizzle'),
        resolve(cwd, 'drizzle')
      ],
      sqliteFallback
    ),
    postgres: resolveExistingPath(
      [
        resolve(cwd, 'packages', 'backend', 'drizzle', 'postgres'),
        resolve(cwd, 'drizzle', 'postgres')
      ],
      postgresFallback
    )
  }
}

export async function migrateDatabaseProvider(
  provider: DatabaseProvider,
  options: MigrateDatabaseProviderOptions = {}
) {
  const paths = {
    ...resolveMigrationPaths({ cwd: options.cwd }),
    ...options.paths
  }

  if (provider.dialect === 'sqlite') {
    await Promise.resolve(
      (options.sqliteMigrator ?? migrateSqlite)(provider.db, {
        migrationsFolder: paths.sqlite
      })
    )
    return
  }

  await Promise.resolve(
    (options.postgresMigrator ?? migratePostgres)(provider.db, {
      migrationsFolder: paths.postgres
    })
  )
}

export async function runDatabaseMigrations(
  options: RunDatabaseMigrationsOptions = {}
) {
  const runtime = options.runtime ?? resolveRuntimeMode(options.env)
  const provider =
    (await options.databaseProviderFactory?.(runtime)) ??
    createDatabaseProvider({
      runtime,
      ...options.databaseProviderOptions
    })

  try {
    if (provider.dialect === 'sqlite') {
      initializeDatabase(provider)
      return
    }

    await migrateDatabaseProvider(provider, options)
  } finally {
    await closeDatabase(provider)
  }
}
