import { afterEach, describe, expect, it, vi } from 'vitest'
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js'
import { createApp } from '../src/app.js'
import type { DatabaseProvider } from '../src/db/connection.js'

function createEmptySelectDb() {
  return {
    select() {
      return {
        from() {
          return Promise.resolve([])
        }
      }
    }
  }
}

describe('createApp cloud service wiring', () => {
  const apps: Array<ReturnType<typeof createApp>> = []

  afterEach(async () => {
    while (apps.length > 0) {
      const app = apps.pop()
      if (app) {
        await app.close()
      }
    }
  })

  it('exposes repository-backed project and settings services in cloud mode', async () => {
    const close = vi.fn(async () => {})
    const databaseProviderFactory = vi.fn<() => DatabaseProvider>(() => ({
      mode: 'cloud',
      dialect: 'postgres',
      client: {} as never,
      db: (createEmptySelectDb() as never) ?? drizzlePostgres.mock(),
      metadata: {
        connectionString: 'postgresql://postgres:postgres@localhost:5432/ralph'
      },
      async close() {
        await close()
      }
    }))

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
      databaseProviderFactory
    })
    apps.push(app)

    await expect(app.projectService.list()).resolves.toEqual([])
    await expect(app.settingsService.get()).resolves.toMatchObject({
      chatModel: 'gemini',
      ralphBinaryPath: null
    })
  })
})
