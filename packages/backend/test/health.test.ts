import { afterEach, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'

describe('GET /health', () => {
  const app = createApp()

  afterEach(async () => {
    await app.close()
  })

  it('returns status ok', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ status: 'ok' })
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
