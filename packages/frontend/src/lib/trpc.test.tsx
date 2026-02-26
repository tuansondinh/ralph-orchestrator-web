import { describe, expect, it } from 'vitest'
import { resolveTrpcBaseUrl } from '@/lib/trpc'

describe('resolveTrpcBaseUrl', () => {
  it('defaults to 127.0.0.1 backend origin in dev when backend origin is not set', () => {
    expect(resolveTrpcBaseUrl({ DEV: true }, { hostname: 'localhost' })).toBe(
      'http://127.0.0.1:3003/trpc'
    )
  })

  it('uses explicit backend origin in dev when provided', () => {
    expect(
      resolveTrpcBaseUrl({
        DEV: true,
        VITE_RALPH_ORCHESTRATOR_BACKEND_ORIGIN: 'http://127.0.0.1:43300/'
      }, { hostname: 'localhost' })
    ).toBe('http://127.0.0.1:43300/trpc')
  })

  it('uses localhost backend origin in dev when provided', () => {
    expect(
      resolveTrpcBaseUrl({
        DEV: true,
        VITE_RALPH_ORCHESTRATOR_BACKEND_ORIGIN: 'http://localhost:3001'
      }, { hostname: 'localhost' })
    ).toBe('http://localhost:3001/trpc')

    expect(
      resolveTrpcBaseUrl({
        DEV: true,
        VITE_RALPH_ORCHESTRATOR_BACKEND_ORIGIN: 'http://127.0.0.1:3001'
      }, { hostname: 'localhost' })
    ).toBe('http://127.0.0.1:3001/trpc')
  })

  it('defaults to 127.0.0.1 backend origin for local non-dev hosts', () => {
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
