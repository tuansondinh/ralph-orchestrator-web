import { afterEach, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'

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
    const previous = {
      SUPABASE_URL: process.env.SUPABASE_URL,
      SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
      SUPABASE_DB_URL: process.env.SUPABASE_DB_URL
    }

    process.env.SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_ANON_KEY = 'anon-key'
    process.env.SUPABASE_DB_URL = 'postgresql://postgres:postgres@localhost:5432/ralph'

    const cloudApp = createApp()

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
            mcp: false
          }
        }
      })
    } finally {
      await cloudApp.close()
      if (previous.SUPABASE_URL === undefined) {
        delete process.env.SUPABASE_URL
      } else {
        process.env.SUPABASE_URL = previous.SUPABASE_URL
      }
      if (previous.SUPABASE_ANON_KEY === undefined) {
        delete process.env.SUPABASE_ANON_KEY
      } else {
        process.env.SUPABASE_ANON_KEY = previous.SUPABASE_ANON_KEY
      }
      if (previous.SUPABASE_DB_URL === undefined) {
        delete process.env.SUPABASE_DB_URL
      } else {
        process.env.SUPABASE_DB_URL = previous.SUPABASE_DB_URL
      }
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
