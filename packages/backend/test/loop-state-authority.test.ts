import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProcessManager } from '../src/runner/ProcessManager.js'
import { LoopService } from '../src/services/LoopService.js'
import type { RepositoryBundle, LoopRunRecord, LoopRunUpdate } from '../src/db/repositories/contracts.js'
import type { OutputBuffer } from '../src/runner/OutputBuffer.js'
import type { RalphEventParser } from '../src/runner/RalphEventParser.js'

function createMockRepos(): RepositoryBundle {
  const loopRunsStore = new Map<string, LoopRunRecord>()
  
  return {
    projects: {
      list: vi.fn(),
      findById: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn()
    },
    loopRuns: {
      listAll: vi.fn(async () => Array.from(loopRunsStore.values())),
      listByProjectId: vi.fn(),
      findById: vi.fn(async (id: string) => loopRunsStore.get(id) || null),
      create: vi.fn(async (run: LoopRunRecord) => {
        loopRunsStore.set(run.id, run)
        return run
      }),
      update: vi.fn(async (id: string, updates: LoopRunUpdate) => {
        const existing = loopRunsStore.get(id)
        if (!existing) throw new Error('Not found')
        const updated = { ...existing, ...updates }
        loopRunsStore.set(id, updated)
        return updated
      }),
      findByState: vi.fn(async (states: string[]) => {
        return Array.from(loopRunsStore.values()).filter(r => states.includes(r.state))
      })
    },
    chats: {} as RepositoryBundle['chats'],
    notifications: {
      list: vi.fn(),
      findById: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn()
    } as RepositoryBundle['notifications'],
    settings: {} as RepositoryBundle['settings'],
    githubConnections: {} as RepositoryBundle['githubConnections'],
    loopOutput: {
      append: vi.fn(),
      getByLoopRunId: vi.fn(),
      deleteByLoopRunId: vi.fn()
    }
  }
}

describe('Loop State Authority', () => {
  let processManager: ProcessManager
  let loopService: LoopService
  let repos: RepositoryBundle

  beforeEach(() => {
    processManager = new ProcessManager({ killGraceMs: 100 })
    repos = createMockRepos()
    loopService = new LoopService(repos, processManager)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('recoverState()', () => {
    it('marks stale active loops as orphaned', async () => {
      const projectId = 'project-1'
      const now = Date.now()

      await repos.loopRuns.create({
        id: 'loop-1',
        projectId,
        ralphLoopId: null,
        state: 'running',
        config: '{}',
        prompt: null,
        worktree: null,
        iterations: 0,
        tokensUsed: 0,
        errors: 0,
        startedAt: now - 60000,
        endedAt: null
      })

      await repos.loopRuns.create({
        id: 'loop-2',
        projectId,
        ralphLoopId: null,
        state: 'queued',
        config: '{}',
        prompt: null,
        worktree: null,
        iterations: 0,
        tokensUsed: 0,
        errors: 0,
        startedAt: now - 30000,
        endedAt: null
      })

      await repos.loopRuns.create({
        id: 'loop-3',
        projectId,
        ralphLoopId: null,
        state: 'completed',
        config: '{}',
        prompt: null,
        worktree: null,
        iterations: 5,
        tokensUsed: 1000,
        errors: 0,
        startedAt: now - 120000,
        endedAt: now - 60000
      })

      await loopService.recoverState()

      const recovered1 = await repos.loopRuns.findById('loop-1')
      expect(recovered1?.state).toBe('orphan')
      expect(recovered1?.endedAt).toBeGreaterThan(0)

      const recovered2 = await repos.loopRuns.findById('loop-2')
      expect(recovered2?.state).toBe('orphan')
      expect(recovered2?.endedAt).toBeGreaterThan(0)

      const recovered3 = await repos.loopRuns.findById('loop-3')
      expect(recovered3?.state).toBe('completed')
      expect(recovered3?.endedAt).toBe(now - 60000)
    })

    it('does not mark loops as failed when no stale loops exist', async () => {
      const projectId = 'project-1'
      const now = Date.now()

      await repos.loopRuns.create({
        id: 'loop-1',
        projectId,
        ralphLoopId: null,
        state: 'completed',
        config: '{}',
        prompt: null,
        worktree: null,
        iterations: 5,
        tokensUsed: 1000,
        errors: 0,
        startedAt: now - 120000,
        endedAt: now - 60000
      })

      await loopService.recoverState()

      const loop = await repos.loopRuns.findById('loop-1')
      expect(loop?.state).toBe('completed')
    })
  })

  describe('runtime liveness reconciliation', () => {
    it('marks tracked loops as crashed when their pid is no longer alive', async () => {
      vi.useFakeTimers()
      const now = Date.now()
      const projectId = 'project-1'
      const observedStates: string[] = []

      loopService = new LoopService(repos, processManager, {
        healthCheckIntervalMs: 50,
        isProcessAlive: () => false
      } as never)

      await repos.loopRuns.create({
        id: 'loop-1',
        projectId,
        ralphLoopId: 'primary-20260311-101500',
        state: 'running',
        config: '{}',
        prompt: null,
        worktree: null,
        iterations: 2,
        tokensUsed: 80,
        errors: 0,
        startedAt: now - 5_000,
        endedAt: null
      })

      loopService.subscribeState('loop-1', (state) => {
        observedStates.push(state)
      })

      ;(loopService as unknown as { runtimes: Map<string, unknown> }).runtimes.set('loop-1', {
        processId: 'process-1',
        processPid: 43210,
        active: true,
        stopRequested: false,
        ralphLoopId: 'primary-20260311-101500',
        outputRemainder: '',
        buffer: {} as OutputBuffer,
        parser: {} as RalphEventParser,
        currentHat: null,
        iterations: 2,
        notified: new Set(),
        unsubOutput: vi.fn(),
        unsubState: vi.fn(),
        outputSequenceCounter: 0
      })

      await vi.advanceTimersByTimeAsync(55)

      const updated = await repos.loopRuns.findById('loop-1')
      expect(updated?.state).toBe('crashed')
      expect(updated?.endedAt).toBeGreaterThan(0)
      expect(observedStates).toContain('crashed')
    })
  })

  describe('findByState()', () => {
    it('finds loops by state', async () => {
      const projectId = 'project-1'
      const now = Date.now()

      await repos.loopRuns.create({
        id: 'loop-1',
        projectId,
        ralphLoopId: null,
        state: 'running',
        config: '{}',
        prompt: null,
        worktree: null,
        iterations: 0,
        tokensUsed: 0,
        errors: 0,
        startedAt: now - 60000,
        endedAt: null
      })

      await repos.loopRuns.create({
        id: 'loop-2',
        projectId,
        ralphLoopId: null,
        state: 'queued',
        config: '{}',
        prompt: null,
        worktree: null,
        iterations: 0,
        tokensUsed: 0,
        errors: 0,
        startedAt: now - 30000,
        endedAt: null
      })

      await repos.loopRuns.create({
        id: 'loop-3',
        projectId,
        ralphLoopId: null,
        state: 'completed',
        config: '{}',
        prompt: null,
        worktree: null,
        iterations: 5,
        tokensUsed: 1000,
        errors: 0,
        startedAt: now - 120000,
        endedAt: now - 60000
      })

      const runningOrQueued = await repos.loopRuns.findByState(['running', 'queued'])
      expect(runningOrQueued).toHaveLength(2)
      expect(runningOrQueued.map((r: LoopRunRecord) => r.id).sort()).toEqual(['loop-1', 'loop-2'])

      const completed = await repos.loopRuns.findByState(['completed'])
      expect(completed).toHaveLength(1)
      expect(completed[0].id).toBe('loop-3')

      const failed = await repos.loopRuns.findByState(['failed'])
      expect(failed).toHaveLength(0)
    })
  })

  describe('state transition ordering', () => {
    it('writes state to DB before emitting event', async () => {
      const projectId = 'project-1'
      const now = Date.now()

      await repos.loopRuns.create({
        id: 'loop-1',
        projectId,
        ralphLoopId: null,
        state: 'running',
        config: '{}',
        prompt: null,
        worktree: null,
        iterations: 0,
        tokensUsed: 0,
        errors: 0,
        startedAt: now,
        endedAt: null
      })

      const stateTransitions: string[] = []
      const dbStates: string[] = []

      const unsubscribe = loopService.subscribeState('loop-1', async (state) => {
        stateTransitions.push(state)
        const loop = await repos.loopRuns.findById('loop-1')
        dbStates.push(loop?.state || 'not-found')
      })

      const runtime = {
        processId: 'proc-1',
        processPid: 1234,
        active: true,
        stopRequested: false,
        ralphLoopId: null,
        outputRemainder: '',
        buffer: { append: vi.fn(), replay: vi.fn().mockReturnValue([]) } as unknown as OutputBuffer,
        parser: { parseChunk: vi.fn().mockReturnValue([]) } as unknown as RalphEventParser,
        currentHat: null,
        iterations: 0,
        notified: new Set(),
        unsubOutput: vi.fn(),
        unsubState: vi.fn(),
        outputSequenceCounter: 0
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(loopService as any).runtimes.set('loop-1', runtime)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (loopService as any).handleState('loop-1', 'completed')

      expect(stateTransitions).toContain('completed')
      expect(dbStates[0]).toBe('completed')

      unsubscribe()
    })
  })

  describe('get() reads from DB', () => {
    it('returns DB state, not in-memory state, when they differ', async () => {
      const projectId = 'project-1'
      const now = Date.now()

      await repos.loopRuns.create({
        id: 'loop-1',
        projectId,
        ralphLoopId: null,
        state: 'completed',
        config: '{}',
        prompt: null,
        worktree: null,
        iterations: 5,
        tokensUsed: 1000,
        errors: 0,
        startedAt: now - 120000,
        endedAt: now - 60000
      })

      const summary = await loopService.get('loop-1')
      expect(summary?.state).toBe('completed')
      expect(summary?.iterations).toBe(5)
    })
  })
})
