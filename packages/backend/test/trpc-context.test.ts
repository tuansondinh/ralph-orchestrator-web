import type { User } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { createContext } from '../src/trpc/context.js'
import { createTestRuntime } from './test-helpers.js'

function createContextOptions(
  overrides: {
    userId?: string
    supabaseUser?: User
  } = {}
) {
  return {
    req: {
      server: {
        runtimeConfig: createTestRuntime('cloud'),
        db: {} as never,
        processManager: {} as never,
        loopService: {} as never,
        chatService: {} as never,
        monitoringService: {} as never,
        previewService: {} as never,
        terminalService: undefined,
        ralphProcessService: undefined,
        projectService: {} as never,
        presetService: {} as never,
        settingsService: {} as never,
        hatsPresetService: {} as never,
        taskService: {} as never
      },
      userId: overrides.userId,
      supabaseUser: overrides.supabaseUser
    },
    res: {},
    info: {} as never
  } as unknown as Parameters<typeof createContext>[0]
}

describe('tRPC context auth decoration', () => {
  it('includes the authenticated Supabase user from the Fastify request', () => {
    const supabaseUser = {
      id: 'user-123',
      email: 'user@example.com'
    } as User

    const context = createContext(
      createContextOptions({
        userId: supabaseUser.id,
        supabaseUser
      })
    )

    expect(context.userId).toBe('user-123')
    expect(context.supabaseUser).toEqual(supabaseUser)
  })
})
