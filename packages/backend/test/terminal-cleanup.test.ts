import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TerminalService } from '../src/services/TerminalService.js'

// Minimal DB stub — TerminalService only uses db in startSession, not in completeSession
const stubDb = {} as Parameters<typeof TerminalService['prototype']['constructor']>[0]

describe('TerminalService — session cleanup', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('removes the runtime from the map 30 seconds after session completes', () => {
    const service = new TerminalService(stubDb)
    const runtimes = (service as unknown as { runtimes: Map<string, unknown> }).runtimes
    const sessionId = 'test-session-id'

    // Inject a fake runtime directly into the private map
    const fakeRuntime = {
      session: {
        id: sessionId,
        projectId: 'proj-1',
        state: 'active' as const,
        shell: '/bin/sh',
        cwd: '/tmp',
        pid: 1234,
        cols: 80,
        rows: 24,
        createdAt: Date.now(),
        endedAt: null
      },
      pty: { kill: vi.fn(), write: vi.fn() },
      outputBuffer: []
    }
    runtimes.set(sessionId, fakeRuntime)
    expect(runtimes.has(sessionId)).toBe(true)

    // Trigger completeSession via the private method
    const completeSession = (service as unknown as {
      completeSession: (id: string, details: { source: 'manual' }) => void
    }).completeSession.bind(service)
    completeSession(sessionId, { source: 'manual' })

    // Runtime still present during grace period
    expect(runtimes.has(sessionId)).toBe(true)

    // Advance time past the 30s grace period
    vi.advanceTimersByTime(30_000)

    // Runtime should now be removed
    expect(runtimes.has(sessionId)).toBe(false)
  })

  it('runtime is still accessible immediately after session completes (replay window)', () => {
    const service = new TerminalService(stubDb)
    const runtimes = (service as unknown as { runtimes: Map<string, unknown> }).runtimes
    const sessionId = 'test-session-replay'

    const fakeRuntime = {
      session: {
        id: sessionId,
        projectId: 'proj-2',
        state: 'active' as const,
        shell: '/bin/sh',
        cwd: '/tmp',
        pid: 5678,
        cols: 80,
        rows: 24,
        createdAt: Date.now(),
        endedAt: null
      },
      pty: { kill: vi.fn(), write: vi.fn() },
      outputBuffer: ['some output']
    }
    runtimes.set(sessionId, fakeRuntime)

    const completeSession = (service as unknown as {
      completeSession: (id: string, details: { source: 'manual' }) => void
    }).completeSession.bind(service)
    completeSession(sessionId, { source: 'manual' })

    // Should still be present at 29 seconds
    vi.advanceTimersByTime(29_999)
    expect(runtimes.has(sessionId)).toBe(true)

    // Gone after 30 seconds
    vi.advanceTimersByTime(1)
    expect(runtimes.has(sessionId)).toBe(false)
  })
})
