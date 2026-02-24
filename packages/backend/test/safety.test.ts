import { afterEach, describe, expect, it } from 'vitest'
import {
  allowsDangerousOperations,
  isLoopbackBindHost
} from '../src/lib/safety.js'

const ORIGINAL_BIND_HOST = process.env.RALPH_UI_BIND_HOST
const ORIGINAL_ALLOW_REMOTE_UNSAFE = process.env.RALPH_UI_ALLOW_REMOTE_UNSAFE_OPS

function restoreEnv() {
  if (ORIGINAL_BIND_HOST === undefined) {
    delete process.env.RALPH_UI_BIND_HOST
  } else {
    process.env.RALPH_UI_BIND_HOST = ORIGINAL_BIND_HOST
  }

  if (ORIGINAL_ALLOW_REMOTE_UNSAFE === undefined) {
    delete process.env.RALPH_UI_ALLOW_REMOTE_UNSAFE_OPS
  } else {
    process.env.RALPH_UI_ALLOW_REMOTE_UNSAFE_OPS = ORIGINAL_ALLOW_REMOTE_UNSAFE
  }
}

describe('local-only safety gating', () => {
  afterEach(() => {
    restoreEnv()
  })

  it('treats loopback bind hosts as safe for dangerous operations', () => {
    process.env.RALPH_UI_BIND_HOST = '127.0.0.1'
    delete process.env.RALPH_UI_ALLOW_REMOTE_UNSAFE_OPS

    expect(isLoopbackBindHost()).toBe(true)
    expect(allowsDangerousOperations()).toBe(true)
  })

  it('blocks dangerous operations on non-loopback hosts by default', () => {
    process.env.RALPH_UI_BIND_HOST = '0.0.0.0'
    delete process.env.RALPH_UI_ALLOW_REMOTE_UNSAFE_OPS

    expect(isLoopbackBindHost()).toBe(false)
    expect(allowsDangerousOperations()).toBe(false)
  })

  it('allows explicit remote override for dangerous operations', () => {
    process.env.RALPH_UI_BIND_HOST = '0.0.0.0'
    process.env.RALPH_UI_ALLOW_REMOTE_UNSAFE_OPS = '1'

    expect(allowsDangerousOperations()).toBe(true)
  })
})
