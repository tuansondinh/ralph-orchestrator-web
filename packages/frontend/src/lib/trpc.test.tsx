import { beforeEach, describe, expect, it } from 'vitest'
import { setAuthAccessToken } from '@/lib/authSession'
import { resolveTrpcBaseUrl, resolveTrpcHeaders } from '@/lib/trpc'

describe('resolveTrpcBaseUrl', () => {
  it('uses relative /trpc in dev mode so Vite proxy handles routing (avoids CORS)', () => {
    expect(resolveTrpcBaseUrl({ DEV: true }, { hostname: 'localhost' })).toBe('/trpc')
  })

  it('uses relative /trpc in dev even when explicit backend origin env var is set', () => {
    expect(
      resolveTrpcBaseUrl({
        DEV: true,
        VITE_RALPH_ORCHESTRATOR_BACKEND_ORIGIN: 'http://127.0.0.1:43300/'
      }, { hostname: 'localhost' })
    ).toBe('/trpc')
  })

  it('uses relative /trpc in dev regardless of backend origin env var value', () => {
    expect(
      resolveTrpcBaseUrl({
        DEV: true,
        VITE_RALPH_ORCHESTRATOR_BACKEND_ORIGIN: 'http://localhost:3001'
      }, { hostname: 'localhost' })
    ).toBe('/trpc')

    expect(
      resolveTrpcBaseUrl({
        DEV: true,
        VITE_RALPH_ORCHESTRATOR_BACKEND_ORIGIN: 'http://127.0.0.1:3001'
      }, { hostname: 'localhost' })
    ).toBe('/trpc')
  })

  it('defaults to 127.0.0.1 backend origin for local non-dev hosts (production build on localhost)', () => {
    expect(resolveTrpcBaseUrl({ DEV: false }, { hostname: 'localhost' })).toBe(
      'http://127.0.0.1:3003/trpc'
    )
    expect(resolveTrpcBaseUrl({ DEV: false }, { hostname: '127.0.0.1' })).toBe(
      'http://127.0.0.1:3003/trpc'
    )
  })

  it('uses relative /trpc for non-local non-dev hosts', () => {
    expect(resolveTrpcBaseUrl({ DEV: false }, { hostname: 'ralph.example.com' })).toBe('/trpc')
  })
})

describe('resolveTrpcHeaders', () => {
  beforeEach(() => {
    setAuthAccessToken(null)
  })

  it('adds a bearer token header when a cloud auth session is available', () => {
    setAuthAccessToken(' supabase-access-token ')

    expect(resolveTrpcHeaders()).toEqual({
      authorization: 'Bearer supabase-access-token'
    })
  })

  it('returns no auth headers when no session token is available', () => {
    expect(resolveTrpcHeaders()).toEqual({})
  })

  it('adds a bearer token when frontend auth has a cached session', () => {
    expect(resolveTrpcHeaders(() => 'token-123')).toEqual({
      Authorization: 'Bearer token-123'
    })
  })

  it('returns empty headers when there is no cached auth token', () => {
    expect(resolveTrpcHeaders(() => null)).toEqual({})
  })
})
