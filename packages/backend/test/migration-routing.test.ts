import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../src/app.js'
import {
  migrateDatabaseProvider,
  resolveMigrationPaths,
  runDatabaseMigrations
} from '../src/db/migrations.js'
import type { DatabaseProvider } from '../src/db/connection.js'

describe('database migration routing', () => {
  const tempDirs: string[] = []
  const apps: Array<ReturnType<typeof createApp>> = []

  async function createTempDir(name: string) {
    const dir = await mkdtemp(join(tmpdir(), `ralph-ui-${name}-`))
    tempDirs.push(dir)
    return dir
  }

  afterEach(async () => {
    while (apps.length > 0) {
      const app = apps.pop()
      if (app) {
        await app.close()
      }
    }

    while (tempDirs.length > 0) {
      const dir = tempDirs.pop()
      if (dir) {
        await rm(dir, { recursive: true, force: true })
      }
    }
  })

  it('routes sqlite providers to the sqlite migration target only', async () => {
    const sqliteMigrator = vi.fn()
    const postgresMigrator = vi.fn()

    await migrateDatabaseProvider(
      {
        mode: 'local',
        dialect: 'sqlite',
        filePath: '/tmp/local.db',
        metadata: {
          filePath: '/tmp/local.db'
        },
        sqlite: {} as never,
        db: {} as never,
        close() {}
      },
      {
        sqliteMigrator,
        postgresMigrator
      }
    )

    const paths = resolveMigrationPaths()
    expect(sqliteMigrator).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        migrationsFolder: paths.sqlite
      })
    )
    expect(postgresMigrator).not.toHaveBeenCalled()
  })

  it('routes postgres providers to the postgres migration target only', async () => {
    const sqliteMigrator = vi.fn()
    const postgresMigrator = vi.fn()

    await migrateDatabaseProvider(
      {
        mode: 'cloud',
        dialect: 'postgres',
        metadata: {
          connectionString: 'postgresql://postgres:postgres@localhost:5432/ralph'
        },
        client: {} as never,
        db: {} as never,
        async close() {}
      },
      {
        sqliteMigrator,
        postgresMigrator
      }
    )

    const paths = resolveMigrationPaths()
    expect(postgresMigrator).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        migrationsFolder: paths.postgres
      })
    )
    expect(sqliteMigrator).not.toHaveBeenCalled()
  })

  it('fails partial cloud configuration before any provider or migration work runs', async () => {
    const databaseProviderFactory = vi.fn<() => DatabaseProvider>()
    const sqliteMigrator = vi.fn()
    const postgresMigrator = vi.fn()

    await expect(
      runDatabaseMigrations({
        env: {
          SUPABASE_URL: 'https://example.supabase.co'
        },
        databaseProviderFactory,
        sqliteMigrator,
        postgresMigrator
      })
    ).rejects.toThrow(
      'Incomplete cloud database configuration. Provide SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_DB_URL together. Missing: SUPABASE_ANON_KEY, SUPABASE_DB_URL.'
    )

    expect(databaseProviderFactory).not.toHaveBeenCalled()
    expect(sqliteMigrator).not.toHaveBeenCalled()
    expect(postgresMigrator).not.toHaveBeenCalled()
  })

  it('does not mutate an existing local sqlite file when cloud startup is enabled', async () => {
    const dir = await createTempDir('cloud-startup')
    const sqlitePath = join(dir, '.ralph-ui', 'data.db')
    await mkdir(join(dir, '.ralph-ui'), { recursive: true })
    await writeFile(sqlitePath, 'local-db-before')
    const before = await stat(sqlitePath)
    const originalContents = await readFile(sqlitePath, 'utf8')

    const app = createApp({
      runtime: {
        mode: 'cloud',
        capabilities: {
          mode: 'cloud',
          database: true,
          auth: false,
          remoteExecution: false,
          realtime: false
        },
        cloud: {
          supabaseUrl: 'https://example.supabase.co',
          supabaseAnonKey: 'anon-key',
          databaseUrl: 'postgresql://postgres:postgres@localhost:5432/ralph'
        }
      },
      databaseProviderFactory: () => ({
        mode: 'cloud',
        dialect: 'postgres',
        metadata: {
          connectionString: 'postgresql://postgres:postgres@localhost:5432/ralph'
        },
        client: {} as never,
        db: {
          select() {
            return {
              from() {
                return Promise.resolve([])
              }
            }
          }
        } as never,
        async close() {}
      })
    })
    apps.push(app)

    const after = await stat(sqlitePath)
    const nextContents = await readFile(sqlitePath, 'utf8')

    expect(after.mtimeMs).toBe(before.mtimeMs)
    expect(after.size).toBe(before.size)
    expect(nextContents).toBe(originalContents)
  })
})
