import { access, mkdtemp, rm } from 'node:fs/promises'
import { constants } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveRuntimeMode } from '../src/config/runtimeMode.js'
import {
  closeDatabase,
  createDatabaseProvider,
  type DatabaseProvider,
  initializeDatabase
} from '../src/db/connection.js'
import { postgresSchema } from '../src/db/schema/postgres.js'

describe('database provider', () => {
  const tempDirs: string[] = []
  const providers: DatabaseProvider[] = []

  async function createTempDir(name: string) {
    const dir = await mkdtemp(join(tmpdir(), `ralph-ui-${name}-`))
    tempDirs.push(dir)
    return dir
  }

  afterEach(async () => {
    while (providers.length > 0) {
      const provider = providers.pop()
      if (provider) {
        await closeDatabase(provider)
      }
    }

    while (tempDirs.length > 0) {
      const dir = tempDirs.pop()
      if (dir) {
        await rm(dir, { recursive: true, force: true })
      }
    }
  })

  it('creates a sqlite provider for local mode with current metadata and lifecycle', async () => {
    const dir = await createTempDir('local-provider')
    const filePath = join(dir, 'local.db')

    const provider = createDatabaseProvider({
      runtime: resolveRuntimeMode({}),
      sqlite: { filePath }
    })
    providers.push(provider)

    expect(provider.mode).toBe('local')
    expect(provider.dialect).toBe('sqlite')
    expect(provider.metadata).toEqual({
      filePath
    })

    if (provider.dialect !== 'sqlite') {
      throw new Error('Expected sqlite provider for local mode')
    }

    initializeDatabase(provider)

    expect(provider.db).toBeDefined()
    await expect(access(filePath, constants.F_OK)).resolves.toBeUndefined()
  })

  it('creates a postgres provider for cloud mode without touching the local sqlite path', async () => {
    const dir = await createTempDir('cloud-provider')
    const unexpectedSqlitePath = join(dir, 'should-not-exist.db')
    const close = vi.fn(async () => {})
    const postgresFactory = vi.fn(() => ({
      client: {} as never,
      db: drizzlePostgres.mock() as unknown as PostgresJsDatabase<typeof postgresSchema>,
      close
    }))

    const provider = createDatabaseProvider({
      runtime: resolveRuntimeMode({
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_ANON_KEY: 'anon-key',
        SUPABASE_DB_URL: 'postgresql://postgres:postgres@localhost:5432/ralph'
      }),
      sqlite: { filePath: unexpectedSqlitePath },
      postgresFactory
    })
    providers.push(provider)

    expect(provider.mode).toBe('cloud')
    expect(provider.dialect).toBe('postgres')
    expect(provider.metadata).toEqual({
      connectionString: 'postgresql://postgres:postgres@localhost:5432/ralph'
    })
    expect(postgresFactory).toHaveBeenCalledTimes(1)

    await expect(access(unexpectedSqlitePath, constants.F_OK)).rejects.toThrow()

    await closeDatabase(provider)
    expect(close).toHaveBeenCalledTimes(1)
    providers.pop()
  })
})
