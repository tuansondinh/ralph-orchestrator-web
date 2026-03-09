import { randomUUID } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { ProcessManager } from '../src/runner/ProcessManager.js'
import { LoopService } from '../src/services/LoopService.js'
import type { LoopOutputChunkRecord, RepositoryBundle } from '../src/db/repositories/contracts.js'

async function createTempDir(prefix: string) {
  return mkdtemp(join(tmpdir(), `ralph-ui-${prefix}-`))
}

function createMockRepo() {
  return {
    append: vi.fn(),
    getByLoopRunId: vi.fn(),
    deleteByLoopRunId: vi.fn()
  }
}

function createMockRepos(mockLoopOutput: ReturnType<typeof createMockRepo> = createMockRepo()): RepositoryBundle {
  return {
    projects: {
      list: vi.fn(),
      findById: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn()
    },
    loopRuns: {
      listAll: vi.fn(),
      listByProjectId: vi.fn(),
      findById: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      findByState: vi.fn()
    },
    chats: {} as RepositoryBundle['chats'],
    notifications: {} as RepositoryBundle['notifications'],
    settings: {} as RepositoryBundle['settings'],
    githubConnections: {} as RepositoryBundle['githubConnections'],
    loopOutput: mockLoopOutput
  }
}

describe('Loop Output Persistence', () => {
  let processManager: ProcessManager
  let loopService: LoopService
  let tempDir: string

  beforeEach(async () => {
    processManager = new ProcessManager({ killGraceMs: 100 })
    tempDir = await createTempDir('loop-output-persistence')
  })

  afterEach(async () => {
    await processManager.shutdown()
    await rm(tempDir, { recursive: true, force: true })
  })

  describe('output persistence to database', () => {
    it('should persist output chunks with correct sequence ordering', async () => {
      const loopRunId = randomUUID()
      const mockRepo = createMockRepo()
      const repos = createMockRepos(mockRepo)
      
      loopService = new LoopService(repos, processManager)

      const outputChunks: LoopOutputChunkRecord[] = []
      mockRepo.append.mockImplementation((chunk: LoopOutputChunkRecord) => {
        outputChunks.push(chunk)
        return Promise.resolve()
      })

      const runtime = {
        processId: 'test-process',
        processPid: 1234,
        active: true,
        stopRequested: false,
        ralphLoopId: null,
        outputRemainder: '',
        buffer: { append: vi.fn(), replay: vi.fn().mockReturnValue([]) } as unknown as import('../src/runner/OutputBuffer.js').OutputBuffer,
        parser: { parseChunk: vi.fn().mockReturnValue([]) } as unknown as import('../src/runner/RalphEventParser.js').RalphEventParser,
        currentHat: null,
        iterations: 0,
        notified: new Set(),
        unsubOutput: vi.fn(),
        unsubState: vi.fn(),
        outputSequenceCounter: 0
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(loopService as any).runtimes.set(loopRunId, runtime)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (loopService as any).handleOutput(loopRunId, { data: 'line 1\n', stream: 'stdout' })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (loopService as any).handleOutput(loopRunId, { data: 'line 2\n', stream: 'stdout' })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (loopService as any).handleOutput(loopRunId, { data: 'error line\n', stream: 'stderr' })

      await new Promise((resolve) => setTimeout(resolve, 50))

      expect(mockRepo.append).toHaveBeenCalledTimes(3)
      expect(outputChunks).toHaveLength(3)
      expect(outputChunks[0].sequence).toBe(0)
      expect(outputChunks[1].sequence).toBe(1)
      expect(outputChunks[2].sequence).toBe(2)
      expect(outputChunks[0].data).toBe('line 1\n')
      expect(outputChunks[1].data).toBe('line 2\n')
      expect(outputChunks[2].stream).toBe('stderr')
    })

    it('should replay output from database when in-memory buffer is empty', async () => {
      const loopRunId = randomUUID()
      const dbChunks: LoopOutputChunkRecord[] = [
        {
          id: randomUUID(),
          loopRunId,
          sequence: 0,
          stream: 'stdout',
          data: 'db line 1\n',
          createdAt: Date.now()
        },
        {
          id: randomUUID(),
          loopRunId,
          sequence: 1,
          stream: 'stdout',
          data: 'db line 2\n',
          createdAt: Date.now()
        },
        {
          id: randomUUID(),
          loopRunId,
          sequence: 2,
          stream: 'stderr',
          data: 'db error\n',
          createdAt: Date.now()
        }
      ]

      const mockRepo = createMockRepo()
      mockRepo.getByLoopRunId.mockResolvedValue(dbChunks)
      
      const repos = createMockRepos(mockRepo)
      ;(repos.loopRuns.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: loopRunId,
        projectId: 'test-project',
        ralphLoopId: null,
        state: 'completed',
        config: JSON.stringify({ outputLogFile: 'test.log' }),
        prompt: null,
        worktree: null,
        iterations: 0,
        tokensUsed: 0,
        errors: 0,
        startedAt: Date.now(),
        endedAt: Date.now()
      })
      ;(repos.projects.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'test-project',
        name: 'Test Project',
        path: tempDir,
        type: null,
        ralphConfig: null,
        createdAt: Date.now(),
        updatedAt: Date.now()
      })
      
      loopService = new LoopService(repos, processManager)

      const replayed = await loopService.replayOutput(loopRunId)

      expect(mockRepo.getByLoopRunId).toHaveBeenCalledWith(loopRunId)
      expect(replayed).toEqual(['db line 1', 'db line 2', 'db error'])
    })

    it('should not crash loop when database write fails (fire-and-forget)', async () => {
      const loopRunId = randomUUID()
      const mockRepo = createMockRepo()
      mockRepo.append.mockRejectedValue(new Error('Database write failed'))
      
      const repos = createMockRepos(mockRepo)
      loopService = new LoopService(repos, processManager)

      const runtime = {
        processId: 'test-process',
        processPid: 1234,
        active: true,
        stopRequested: false,
        ralphLoopId: null,
        outputRemainder: '',
        buffer: { append: vi.fn(), replay: vi.fn().mockReturnValue([]) } as unknown as import('../src/runner/OutputBuffer.js').OutputBuffer,
        parser: { parseChunk: vi.fn().mockReturnValue([]) } as unknown as import('../src/runner/RalphEventParser.js').RalphEventParser,
        currentHat: null,
        iterations: 0,
        notified: new Set(),
        unsubOutput: vi.fn(),
        unsubState: vi.fn(),
        outputSequenceCounter: 0
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(loopService as any).runtimes.set(loopRunId, runtime)

      await expect(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (loopService as any).handleOutput(loopRunId, { data: 'test output\n', stream: 'stdout' })
      ).resolves.not.toThrow()

      await new Promise((resolve) => setTimeout(resolve, 50))

      expect(mockRepo.append).toHaveBeenCalled()
    })

    it('does not warn when cloud output persistence is unavailable in local mode', async () => {
      const loopRunId = randomUUID()
      const mockRepo = createMockRepo()
      mockRepo.append.mockRejectedValue(
        new Error('Loop output persistence is not available in local mode')
      )

      const repos = createMockRepos(mockRepo)
      loopService = new LoopService(repos, processManager)
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const runtime = {
        processId: 'test-process',
        processPid: 1234,
        active: true,
        stopRequested: false,
        ralphLoopId: null,
        outputRemainder: '',
        buffer: { append: vi.fn(), replay: vi.fn().mockReturnValue([]) } as unknown as import('../src/runner/OutputBuffer.js').OutputBuffer,
        parser: { parseChunk: vi.fn().mockReturnValue([]) } as unknown as import('../src/runner/RalphEventParser.js').RalphEventParser,
        currentHat: null,
        iterations: 0,
        notified: new Set(),
        unsubOutput: vi.fn(),
        unsubState: vi.fn(),
        outputSequenceCounter: 0
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(loopService as any).runtimes.set(loopRunId, runtime)

      await expect(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (loopService as any).handleOutput(loopRunId, { data: 'test output\n', stream: 'stdout' })
      ).resolves.not.toThrow()

      await new Promise((resolve) => setTimeout(resolve, 50))

      expect(mockRepo.append).toHaveBeenCalled()
      expect(warnSpy).not.toHaveBeenCalled()

      warnSpy.mockRestore()
    })

    it('should prefer in-memory buffer over database for active loops', async () => {
      const loopRunId = randomUUID()
      const mockRepo = createMockRepo()
      const repos = createMockRepos(mockRepo)
      
      loopService = new LoopService(repos, processManager)

      const runtime = {
        processId: 'test-process',
        processPid: 1234,
        active: true,
        stopRequested: false,
        ralphLoopId: null,
        outputRemainder: '',
        buffer: { 
          append: vi.fn(), 
          replay: vi.fn().mockReturnValue(['buffer line 1', 'buffer line 2']) 
        } as unknown as import('../src/runner/OutputBuffer.js').OutputBuffer,
        parser: { parseChunk: vi.fn().mockReturnValue([]) } as unknown as import('../src/runner/RalphEventParser.js').RalphEventParser,
        currentHat: null,
        iterations: 0,
        notified: new Set(),
        unsubOutput: vi.fn(),
        unsubState: vi.fn(),
        outputSequenceCounter: 0
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(loopService as any).runtimes.set(loopRunId, runtime)

      const replayed = await loopService.replayOutput(loopRunId)

      expect(mockRepo.getByLoopRunId).not.toHaveBeenCalled()
      expect(replayed).toEqual(['buffer line 1', 'buffer line 2'])
    })

    it('falls back to persisted database chunks when an active runtime buffer is empty', async () => {
      const loopRunId = randomUUID()
      const dbChunks: LoopOutputChunkRecord[] = [
        {
          id: randomUUID(),
          loopRunId,
          sequence: 0,
          stream: 'stdout',
          data: 'persisted line 1\n',
          createdAt: Date.now()
        },
        {
          id: randomUUID(),
          loopRunId,
          sequence: 1,
          stream: 'stderr',
          data: 'persisted error\n',
          createdAt: Date.now()
        }
      ]
      const mockRepo = createMockRepo()
      mockRepo.getByLoopRunId.mockResolvedValue(dbChunks)
      const repos = createMockRepos(mockRepo)

      loopService = new LoopService(repos, processManager)

      const runtime = {
        processId: 'test-process',
        processPid: 1234,
        active: true,
        stopRequested: false,
        ralphLoopId: null,
        outputRemainder: '',
        buffer: {
          append: vi.fn(),
          replay: vi.fn().mockReturnValue([])
        } as unknown as import('../src/runner/OutputBuffer.js').OutputBuffer,
        parser: { parseChunk: vi.fn().mockReturnValue([]) } as unknown as import('../src/runner/RalphEventParser.js').RalphEventParser,
        currentHat: null,
        iterations: 0,
        notified: new Set(),
        unsubOutput: vi.fn(),
        unsubState: vi.fn(),
        outputSequenceCounter: 0
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(loopService as any).runtimes.set(loopRunId, runtime)

      const replayed = await loopService.replayOutput(loopRunId)

      expect(mockRepo.getByLoopRunId).toHaveBeenCalledWith(loopRunId)
      expect(replayed).toEqual(['persisted line 1', 'persisted error'])
    })

    it('falls back to disk replay without warning when database persistence is unavailable in local mode', async () => {
      const loopRunId = randomUUID()
      const mockRepo = createMockRepo()
      mockRepo.getByLoopRunId.mockRejectedValue(
        new Error('Loop output persistence is not available in local mode')
      )

      const repos = createMockRepos(mockRepo)
      ;(repos.loopRuns.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: loopRunId,
        projectId: 'test-project',
        ralphLoopId: null,
        state: 'completed',
        config: JSON.stringify({ outputLogFile: 'test.log' }),
        prompt: null,
        worktree: null,
        iterations: 0,
        tokensUsed: 0,
        errors: 0,
        startedAt: Date.now(),
        endedAt: Date.now()
      })
      ;(repos.projects.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'test-project',
        name: 'Test Project',
        path: tempDir,
        type: null,
        ralphConfig: null,
        createdAt: Date.now(),
        updatedAt: Date.now()
      })

      await writeFile(join(tempDir, 'test.log'), 'disk line 1\ndisk error\n', 'utf8')

      loopService = new LoopService(repos, processManager)
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const replayed = await loopService.replayOutput(loopRunId)

      expect(mockRepo.getByLoopRunId).toHaveBeenCalledWith(loopRunId)
      expect(replayed).toEqual(['disk line 1', 'disk error'])
      expect(warnSpy).not.toHaveBeenCalled()

      warnSpy.mockRestore()
    })
  })
})
