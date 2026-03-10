import { beforeEach, describe, expect, it } from 'vitest'
import { setAuthAccessToken } from '@/lib/authSession'
import { resolveTrpcHeaders } from '@/lib/trpc'

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
})
