import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  initSupabaseAuth,
  getSupabaseClient,
  verifySupabaseToken,
  supabaseAuthHook
} from '../src/auth/supabaseAuth.js'
import type { FastifyRequest, FastifyReply } from 'fastify'
import type { Mock } from 'vitest'

interface MockAuthClient {
  auth: {
    getUser: Mock
  }
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn()
    }
  }))
}))

function getMockClient(): MockAuthClient {
  return getSupabaseClient() as unknown as MockAuthClient
}

describe('Supabase Auth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    initSupabaseAuth('https://test.supabase.co', 'test-anon-key')
  })

  afterEach(() => {
    vi.resetModules()
  })

  describe('initSupabaseAuth', () => {
    it('initializes supabase client', () => {
      const client = getSupabaseClient()
      expect(client).toBeDefined()
    })
  })

  describe('verifySupabaseToken', () => {
    it('throws when supabase not initialized', async () => {
      vi.resetModules()
      const { verifySupabaseToken: verify } = await import(
        '../src/auth/supabaseAuth.js'
      )
      await expect(verify('token')).rejects.toThrow(
        'Supabase auth not initialized'
      )
    })

    it('returns user when token is valid', async () => {
      const client = getMockClient()
      const mockUser = { id: 'user-123', email: 'test@example.com' }
      client.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null
      })

      const user = await verifySupabaseToken('valid-token')
      expect(user).toEqual(mockUser)
    })

    it('throws when token is invalid', async () => {
      const client = getMockClient()
      client.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Invalid token' }
      })

      await expect(verifySupabaseToken('invalid-token')).rejects.toThrow(
        'Invalid or expired token'
      )
    })

    it('throws when user is null', async () => {
      const client = getMockClient()
      client.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: null
      })

      await expect(verifySupabaseToken('token')).rejects.toThrow(
        'Invalid or expired token'
      )
    })
  })

  describe('supabaseAuthHook', () => {
    const createMockRequest = (authHeader?: string): FastifyRequest => {
      return {
        headers: {
          authorization: authHeader
        }
      } as FastifyRequest
    }

    const createMockReply = (): {
      reply: FastifyReply
      code: Mock
      send: Mock
    } => {
      const calls = { code: vi.fn(), send: vi.fn() }
      const reply = {
        code: calls.code.mockReturnValue(calls),
        send: calls.send.mockReturnValue(calls)
      }
      return { reply: reply as unknown as FastifyReply, ...calls }
    }

    it('returns 401 when no authorization header', async () => {
      const request = createMockRequest()
      const { reply, code, send } = createMockReply()

      await supabaseAuthHook(request, reply)

      expect(code).toHaveBeenCalledWith(401)
      expect(send).toHaveBeenCalledWith({
        error: 'Missing authorization token'
      })
    })

    it('returns 401 when authorization header does not start with Bearer', async () => {
      const request = createMockRequest('Basic abc123')
      const { reply, code, send } = createMockReply()

      await supabaseAuthHook(request, reply)

      expect(code).toHaveBeenCalledWith(401)
      expect(send).toHaveBeenCalledWith({
        error: 'Missing authorization token'
      })
    })

    it('returns 401 when token is invalid', async () => {
      const client = getMockClient()
      client.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Invalid' }
      })

      const request = createMockRequest('Bearer invalid-token')
      const { reply, code, send } = createMockReply()

      await supabaseAuthHook(request, reply)

      expect(code).toHaveBeenCalledWith(401)
      expect(send).toHaveBeenCalledWith({
        error: 'Invalid or expired token'
      })
    })

    it('decorates request with userId when token is valid', async () => {
      const client = getMockClient()
      const mockUser = { id: 'user-123', email: 'test@example.com' }
      client.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null
      })

      const request = createMockRequest('Bearer valid-token')
      const { reply, code } = createMockReply()

      await supabaseAuthHook(request, reply)

      expect((request as { userId?: string }).userId).toBe('user-123')
      expect((request as { supabaseUser?: unknown }).supabaseUser).toEqual(
        mockUser
      )
      expect(code).not.toHaveBeenCalled()
    })
  })
})
