import { afterEach, describe, expect, it, vi } from 'vitest'
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js'
import { createApp } from '../src/app.js'
import type { DatabaseProvider } from '../src/db/connection.js'

describe('createApp database provider wiring', () => {
  const apps: Array<ReturnType<typeof createApp>> = []

  afterEach(async () => {
    while (apps.length > 0) {
      const app = apps.pop()
      if (app) {
        await app.close()
      }
    }
  })

  it('uses the provided database factory for cloud startup instead of creating sqlite directly', async () => {
    const close = vi.fn(async () => {})
    const databaseProviderFactory = vi.fn<() => DatabaseProvider>(() => ({
      mode: 'cloud',
      dialect: 'postgres',
      client: {} as never,
      db: drizzlePostgres.mock(),
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
          auth: true,
          localProjects: false,
          githubProjects: true,
          terminal: false,
          preview: false,
          localDirectoryPicker: false,
          mcp: false
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

    const response = await app.inject({ method: 'GET', url: '/health' })

    expect(response.statusCode).toBe(200)
    expect(databaseProviderFactory).toHaveBeenCalledTimes(1)
    expect(app.databaseProvider.mode).toBe('cloud')
    expect(app.databaseProvider.dialect).toBe('postgres')
    expect(close).not.toHaveBeenCalled()
  })
})
