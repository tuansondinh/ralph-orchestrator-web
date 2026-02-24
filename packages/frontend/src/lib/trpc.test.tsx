import { describe, expect, it } from 'vitest'
import { resolveTrpcBaseUrl } from '@/lib/trpc'

describe('resolveTrpcBaseUrl', () => {
  it('returns relative /trpc in dev when backend origin is not set', () => {
    expect(resolveTrpcBaseUrl({ DEV: true })).toBe('/trpc')
  })

  it('uses explicit backend origin in dev when provided', () => {
    expect(
      resolveTrpcBaseUrl({
        DEV: true,
        VITE_RALPH_UI_BACKEND_ORIGIN: 'http://127.0.0.1:43300/'
      })
    ).toBe('http://127.0.0.1:43300/trpc')
  })

  it('ignores localhost:3001 backend origin to prefer proxy', () => {
    expect(
      resolveTrpcBaseUrl({
        DEV: true,
        VITE_RALPH_UI_BACKEND_ORIGIN: 'http://localhost:3001'
      })
    ).toBe('/trpc')

    expect(
      resolveTrpcBaseUrl({
        DEV: true,
        VITE_RALPH_UI_BACKEND_ORIGIN: 'http://127.0.0.1:3001'
      })
    ).toBe('/trpc')
  })
})
