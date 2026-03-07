import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  closeDatabase,
  createDatabase,
  migrateDatabase,
  type DatabaseConnection
} from '../src/db/connection.js'
import { projects } from '../src/db/schema.js'
import { TerminalService } from '../src/services/TerminalService.js'

// ---------------------------------------------------------------------------
// Mock node-pty — must be hoisted so it intercepts before TerminalService loads
// ---------------------------------------------------------------------------
const { spawnMock, lastPty } = vi.hoisted(() => {
  let _last: unknown = null
  const spawnFn = vi.fn(() => {
    const dataCbs: ((d: string) => void)[] = []
    const exitCbs: ((e: { exitCode: number; signal?: number }) => void)[] = []
    const pty = {
      pid: 9999,
      onData: vi.fn((cb: (d: string) => void) => {
        dataCbs.push(cb)
      }),
      onExit: vi.fn((cb: (e: { exitCode: number; signal?: number }) => void) => {
        exitCbs.push(cb)
      }),
      write: vi.fn(),
      kill: vi.fn(),
      resize: vi.fn(),
      _triggerData: (data: string) => {
        for (const cb of dataCbs) cb(data)
      },
      _triggerExit: (exitCode: number, signal?: number) => {
        for (const cb of exitCbs) cb({ exitCode, signal })
      }
    }
    _last = pty
    return pty
  })
  return {
    spawnMock: spawnFn,
    lastPty: () => _last as ReturnType<typeof spawnFn> | null
  }
})

vi.mock('node-pty', () => ({ spawn: spawnMock }))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function injectRuntime(
  service: TerminalService,
  sessionId: string,
  projectId: string,
  options: { state?: 'active' | 'completed'; outputBuffer?: string[] } = {}
) {
  const runtimes = (service as unknown as { runtimes: Map<string, unknown> }).runtimes
  const sessionsByProjectId = (service as unknown as { sessionsByProjectId: Map<string, Set<string>> }).sessionsByProjectId
  const state = options.state ?? 'active'
  const mockPty = { kill: vi.fn(), write: vi.fn(), resize: vi.fn() }

  runtimes.set(sessionId, {
    session: {
      id: sessionId,
      projectId,
      state,
      shell: '/bin/sh',
      cwd: '/tmp',
      pid: 1234,
      cols: 80,
      rows: 24,
      createdAt: Date.now(),
      endedAt: state === 'completed' ? Date.now() : null
    },
    pty: mockPty,
    outputBuffer: options.outputBuffer ?? []
  })

  if (state === 'active') {
    let set = sessionsByProjectId.get(projectId)
    if (!set) {
      set = new Set()
      sessionsByProjectId.set(projectId, set)
    }
    set.add(sessionId)
  }

  return mockPty
}

async function setupDatabase() {
  const tempDir = await mkdtemp(join(tmpdir(), 'terminal-svc-'))
  const connection = createDatabase({ filePath: join(tempDir, 'test.db') })
  migrateDatabase(connection.db)
  return { tempDir, connection }
}

async function insertProject(connection: DatabaseConnection, projectPath: string) {
  const id = randomUUID()
  const now = Date.now()
  await connection.db
    .insert(projects)
    .values({
      id,
      name: 'Test Project',
      path: projectPath,
      type: 'node',
      ralphConfig: null,
      createdAt: now,
      updatedAt: now
    })
    .run()
  return id
}

// Minimal DB stub for tests that don't call database methods
const stubDb = {} as ConstructorParameters<typeof TerminalService>[0]

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TerminalService', () => {
  const tempDirs: string[] = []
  const connections: DatabaseConnection[] = []

  afterEach(async () => {
    spawnMock.mockClear()
    while (connections.length > 0) {
      closeDatabase(connections.pop()!)
    }
    while (tempDirs.length > 0) {
      await rm(tempDirs.pop()!, { recursive: true, force: true })
    }
  })

  describe('startSession', () => {
    it('rejects unknown project ID', async () => {
      const { tempDir, connection } = await setupDatabase()
      tempDirs.push(tempDir)
      connections.push(connection)

      const service = new TerminalService(connection.db)
      await expect(service.startSession({ projectId: randomUUID() })).rejects.toThrow(
        'Project not found'
      )
    })

    it('creates a session with correct defaults', async () => {
      const { tempDir, connection } = await setupDatabase()
      tempDirs.push(tempDir)
      connections.push(connection)

      const projectPath = join(tempDir, 'project')
      await mkdir(projectPath, { recursive: true })
      const projectId = await insertProject(connection, projectPath)

      const service = new TerminalService(connection.db)
      const session = await service.startSession({ projectId })

      expect(session.projectId).toBe(projectId)
      expect(session.state).toBe('active')
      expect(session.cols).toBe(120)
      expect(session.rows).toBe(36)
      expect(session.endedAt).toBeNull()
      expect(typeof session.id).toBe('string')
      expect(spawnMock).toHaveBeenCalledOnce()
    })

    it('applies custom cols and rows', async () => {
      const { tempDir, connection } = await setupDatabase()
      tempDirs.push(tempDir)
      connections.push(connection)

      const projectPath = join(tempDir, 'project2')
      await mkdir(projectPath, { recursive: true })
      const projectId = await insertProject(connection, projectPath)

      const service = new TerminalService(connection.db)
      const session = await service.startSession({ projectId, cols: 200, rows: 50 })
      expect(session.cols).toBe(200)
      expect(session.rows).toBe(50)
    })
  })

  describe('sendInput', () => {
    it('forwards data to the PTY', () => {
      const service = new TerminalService(stubDb)
      const pty = injectRuntime(service, 'sess-1', 'proj-1')
      service.sendInput('sess-1', 'echo hello\r')
      expect(pty.write).toHaveBeenCalledWith('echo hello\r')
    })

    it('does nothing for empty data', () => {
      const service = new TerminalService(stubDb)
      const pty = injectRuntime(service, 'sess-2', 'proj-1')
      service.sendInput('sess-2', '')
      expect(pty.write).not.toHaveBeenCalled()
    })

    it('throws for unknown session ID', () => {
      const service = new TerminalService(stubDb)
      expect(() => service.sendInput('ghost', 'data')).toThrow('Terminal session not found')
    })

    it('throws when session is not active', () => {
      const service = new TerminalService(stubDb)
      injectRuntime(service, 'done', 'proj-1', { state: 'completed' })
      expect(() => service.sendInput('done', 'data')).toThrow('not active')
    })
  })

  describe('resizeSession', () => {
    it('forwards valid dimensions to the PTY', () => {
      const service = new TerminalService(stubDb)
      const pty = injectRuntime(service, 'sess-resize', 'proj-2')
      service.resizeSession('sess-resize', 100, 40)
      expect(pty.resize).toHaveBeenCalledWith(100, 40)
    })

    it('clamps cols and rows below minimum', () => {
      const service = new TerminalService(stubDb)
      const pty = injectRuntime(service, 'sess-min', 'proj-2')
      service.resizeSession('sess-min', 1, 1)
      // MIN_COLS=20, MIN_ROWS=8
      expect(pty.resize).toHaveBeenCalledWith(20, 8)
    })

    it('clamps cols and rows above maximum', () => {
      const service = new TerminalService(stubDb)
      const pty = injectRuntime(service, 'sess-max', 'proj-2')
      service.resizeSession('sess-max', 9999, 9999)
      // MAX_COLS=400, MAX_ROWS=200
      expect(pty.resize).toHaveBeenCalledWith(400, 200)
    })
  })

  describe('endSession', () => {
    it('marks session as completed and emits state change', () => {
      const service = new TerminalService(stubDb)
      const pty = injectRuntime(service, 'sess-end', 'proj-3')

      const states: string[] = []
      const unsub = service.subscribeState('sess-end', (s) => states.push(s))

      service.endSession('sess-end')

      expect(pty.kill).toHaveBeenCalled()
      expect(service.getSession('sess-end').state).toBe('completed')
      expect(states).toContain('completed')
      unsub()
    })

    it('is idempotent for already-completed sessions', () => {
      const service = new TerminalService(stubDb)
      const pty = injectRuntime(service, 'already-done', 'proj-3', { state: 'completed' })

      expect(() => service.endSession('already-done')).not.toThrow()
      expect(pty.kill).not.toHaveBeenCalled()
    })
  })

  describe('getProjectSessions', () => {
    it('returns only active sessions for the project', async () => {
      const service = new TerminalService(stubDb)
      const projectId = 'proj-sessions'
      injectRuntime(service, 'active-1', projectId)
      injectRuntime(service, 'active-2', projectId)
      // Completed session is not added to sessionsByProjectId by injectRuntime
      // so it mirrors what the real code does after completeSession removes it

      const sessions = await service.getProjectSessions(projectId)
      expect(sessions.map((s) => s.id).sort()).toEqual(['active-1', 'active-2'])
    })

    it('returns empty array for unknown project', async () => {
      const service = new TerminalService(stubDb)
      const sessions = await service.getProjectSessions('no-such-project')
      expect(sessions).toEqual([])
    })
  })

  describe('replayOutput', () => {
    it('returns buffered output chunks', () => {
      const service = new TerminalService(stubDb)
      injectRuntime(service, 'sess-buf', 'proj-4', { outputBuffer: ['a', 'b', 'c'] })
      expect(service.replayOutput('sess-buf')).toEqual(['a', 'b', 'c'])
    })

    it('returns a copy of the buffer, not a reference', () => {
      const service = new TerminalService(stubDb)
      injectRuntime(service, 'sess-copy', 'proj-4', { outputBuffer: ['x'] })
      const buf1 = service.replayOutput('sess-copy')
      const buf2 = service.replayOutput('sess-copy')
      expect(buf1).not.toBe(buf2)
      expect(buf1).toEqual(buf2)
    })

    it('respects the configurable buffer size limit', async () => {
      const { tempDir, connection } = await setupDatabase()
      tempDirs.push(tempDir)
      connections.push(connection)

      const projectPath = join(tempDir, 'proj-limit')
      await mkdir(projectPath, { recursive: true })
      const projectId = await insertProject(connection, projectPath)

      const service = new TerminalService(connection.db, { replayBufferChunks: 3 })
      const session = await service.startSession({ projectId })

      const pty = lastPty()!
      for (let i = 0; i < 5; i++) {
        pty._triggerData(`chunk-${i}`)
      }

      const chunks = service.replayOutput(session.id)
      expect(chunks.length).toBe(3)
      expect(chunks).toContain('chunk-4')
      expect(chunks).toContain('chunk-3')
      expect(chunks).not.toContain('chunk-0')
      expect(chunks).not.toContain('chunk-1')
    })
  })

  describe('shutdown', () => {
    it('ends all active sessions', async () => {
      const service = new TerminalService(stubDb)
      const pty1 = injectRuntime(service, 'sd-1', 'proj-5')
      const pty2 = injectRuntime(service, 'sd-2', 'proj-5')

      await service.shutdown()

      expect(pty1.kill).toHaveBeenCalled()
      expect(pty2.kill).toHaveBeenCalled()
    })

    it('skips already-completed sessions without throwing', async () => {
      const service = new TerminalService(stubDb)
      const pty = injectRuntime(service, 'sd-done', 'proj-5', { state: 'completed' })

      await expect(service.shutdown()).resolves.not.toThrow()
      expect(pty.kill).not.toHaveBeenCalled()
    })
  })
})
