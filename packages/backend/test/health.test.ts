import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../src/app.js'
import type { DatabaseProvider } from '../src/db/connection.js'
import { createTestRuntime } from './test-helpers.js'

describe('GET /health', () => {
  const app = createApp()

  afterEach(async () => {
    await app.close()
  })

  it('returns status ok with runtime capabilities', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      status: 'ok',
      runtime: {
        mode: 'local',
        capabilities: {
          mode: 'local',
          database: true,
          auth: false,
          localProjects: true,
          githubProjects: false,
          terminal: true,
          preview: true,
          localDirectoryPicker: true,
          mcp: true
        }
      }
    })
  })

  it('surfaces cloud mode when full cloud configuration is present', async () => {
    const close = vi.fn(async () => {})
    const cloudApp = createApp({
      runtime: createTestRuntime('cloud'),
      databaseProviderFactory: () =>
        ({
          mode: 'cloud',
          dialect: 'postgres',
          client: {} as never,
          db: {} as never,
          metadata: {
            connectionString: 'postgresql://postgres:postgres@localhost:5432/ralph'
          },
          close
        }) satisfies DatabaseProvider
    })

    try {
      const response = await cloudApp.inject({ method: 'GET', url: '/health' })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toMatchObject({
        status: 'ok',
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
            mcp: true
          }
        }
      })
    } finally {
      await cloudApp.close()
      expect(close).toHaveBeenCalledTimes(1)
    }
  })
})

describe('createApp logger config', () => {
  it('uses LOG_LEVEL when provided', async () => {
    const previous = process.env.LOG_LEVEL
    process.env.LOG_LEVEL = 'debug'
    const app = createApp()

    try {
      expect(app.log.level).toBe('debug')
    } finally {
      await app.close()
      if (previous === undefined) {
        delete process.env.LOG_LEVEL
      } else {
        process.env.LOG_LEVEL = previous
      }
    }
  })
})
