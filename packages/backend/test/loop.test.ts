import { randomUUID } from 'node:crypto'
import { execFile as execFileCallback } from 'node:child_process'
import {
  chmod,
  mkdtemp,
  mkdir,
  readFile,
  rm,
  writeFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it, vi } from 'vitest'
import WebSocket from 'ws'
import { eq } from 'drizzle-orm'
import {
  closeDatabase,
  createDatabase,
  migrateDatabase,
  type DatabaseConnection
} from '../src/db/connection.js'
import { loopRuns, projects } from '../src/db/schema.js'
import { ProcessManager } from '../src/runner/ProcessManager.js'
import { LoopService } from '../src/services/LoopService.js'
import { ChatService } from '../src/services/ChatService.js'
import { MonitoringService } from '../src/services/MonitoringService.js'
import { DevPreviewManager } from '../src/services/DevPreviewManager.js'
import { appRouter } from '../src/trpc/router.js'
import { createApp } from '../src/app.js'

const execFile = promisify(execFileCallback)

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 2_000,
  pollMs = 20
) {
  const start = Date.now()
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`Timed out after ${timeoutMs}ms`)
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs))
  }
}

async function createTempDir(prefix: string) {
  return mkdtemp(join(tmpdir(), `ralph-ui-${prefix}-`))
}

async function createMockRalphBinary(directory: string) {
  const filePath = join(directory, 'mock-ralph.mjs')
  const script = `#!/usr/bin/env node
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)
const scriptDir = dirname(fileURLToPath(import.meta.url))
const pidFile = join(scriptDir, 'mock-ralph.pid')
const stopArgsFile = join(scriptDir, 'mock-ralph-stop-args.log')
const promptArg = args.find((arg) => arg.startsWith('--prompt=')) || ''
const shouldExitFast = promptArg.includes('exit-fast')
let iteration = 0

if (args[0] === 'loops' && args[1] === 'stop') {
  writeFileSync(stopArgsFile, JSON.stringify(args), 'utf8')
  if (existsSync(pidFile)) {
    const pid = Number(readFileSync(pidFile, 'utf8').trim())
    if (Number.isFinite(pid)) {
      try {
        process.kill(pid, 'SIGTERM')
      } catch {}
    }
  }
  process.exit(0)
}

writeFileSync(pidFile, String(process.pid), 'utf8')

const clearPid = () => {
  if (!existsSync(pidFile)) {
    return
  }
  try {
    unlinkSync(pidFile)
  } catch {}
}

process.stdout.write('boot\\n')
const timer = setInterval(() => {
  iteration += 1
  process.stdout.write(\`tick-\${iteration}\\n\`)
  process.stdout.write(\`Event: loop:iteration - {"iteration":\${iteration},"sourceHat":"builder"}\\n\`)

  if (shouldExitFast && iteration >= 2) {
    clearInterval(timer)
    clearPid()
    process.exit(0)
  }
}, 30)

process.on('SIGTERM', () => {
  process.stdout.write('stopping\\n')
  clearInterval(timer)
  clearPid()
  process.exit(0)
})
`

  await writeFile(filePath, script, 'utf8')
  await chmod(filePath, 0o755)
  return filePath
}

async function createProject(
  connection: DatabaseConnection,
  projectPath: string,
  name = 'Demo project'
) {
  const now = Date.now()
  const id = randomUUID()

  await connection.db
    .insert(projects)
    .values({
      id,
      name,
      path: projectPath,
      type: 'node',
      ralphConfig: 'ralph.yml',
      createdAt: now,
      updatedAt: now
    })
    .run()

  return id
}

async function runGit(projectPath: string, args: string[]) {
  await execFile('git', args, { cwd: projectPath })
}

function createMessageWaiter(socket: WebSocket) {
  return (predicate: (message: Record<string, unknown>) => boolean) =>
    new Promise<Record<string, unknown>>((resolve, reject) => {
      const timeout = setTimeout(() => {
        socket.off('message', onMessage)
        reject(new Error('Timed out waiting for websocket message'))
      }, 2_000)

      const onMessage = (raw: WebSocket.RawData) => {
        let parsed: Record<string, unknown>
        try {
          parsed = JSON.parse(raw.toString('utf8'))
        } catch {
          return
        }

        if (predicate(parsed)) {
          clearTimeout(timeout)
          socket.off('message', onMessage)
          resolve(parsed)
        }
      }

      socket.on('message', onMessage)
    })
}

describe('loop tRPC routes', () => {
  const tempDirs: string[] = []
  const connections: DatabaseConnection[] = []
  const managers: ProcessManager[] = []

  afterEach(async () => {
    while (managers.length > 0) {
      await managers.pop()?.shutdown()
    }

    while (connections.length > 0) {
      const connection = connections.pop()
      if (connection) {
        closeDatabase(connection)
      }
    }

    while (tempDirs.length > 0) {
      const dir = tempDirs.pop()
      if (dir) {
        await rm(dir, { recursive: true, force: true })
      }
    }
  })

  async function setupCaller() {
    const tempDir = await createTempDir('loop')
    tempDirs.push(tempDir)

    const dbPath = join(tempDir, 'loop.db')
    const connection = createDatabase({ filePath: dbPath })
    migrateDatabase(connection.db)
    connections.push(connection)

    const binaryPath = await createMockRalphBinary(tempDir)
    const processManager = new ProcessManager({ killGraceMs: 100 })
    managers.push(processManager)

    const loopService = new LoopService(connection.db, processManager, {
      resolveBinary: async () => binaryPath
    })
    const chatService = new ChatService(connection.db, processManager, {
      resolveBinary: async () => binaryPath
    })
    const monitoringService = new MonitoringService(connection.db, loopService)
    const previewService = new DevPreviewManager(connection.db, processManager)

    const caller = appRouter.createCaller({
      db: connection.db,
      processManager,
      loopService,
      chatService,
      monitoringService,
      previewService
    })

    return { caller, connection, processManager, loopService, tempDir }
  }

  it('starts and stops a loop while persisting run state in the database', async () => {
    const { caller, connection, processManager, tempDir } = await setupCaller()
    const killSpy = vi.spyOn(processManager, 'kill')
    const projectPath = join(tempDir, 'project')
    await mkdir(projectPath, { recursive: true })
    const projectId = await createProject(connection, projectPath)

    const started = await caller.loop.start({
      projectId,
      prompt: 'keep-running'
    })

    expect(started.projectId).toBe(projectId)
    expect(started.state).toBe('running')
    expect(processManager.list().some((proc) => proc.id === started.processId)).toBe(
      true
    )

    const persisted = connection.db
      .select()
      .from(loopRuns)
      .where(eq(loopRuns.id, started.id))
      .get()
    expect(persisted?.state).toBe('running')

    await caller.loop.stop({ loopId: started.id })

    const afterStop = connection.db
      .select()
      .from(loopRuns)
      .where(eq(loopRuns.id, started.id))
      .get()

    expect(afterStop?.state).toBe('stopped')
    expect(afterStop?.endedAt).toBeTypeOf('number')
    expect(killSpy).not.toHaveBeenCalled()
    expect(processManager.list()).toEqual([])
    await expect(readFile(join(projectPath, 'debug.log'), 'utf8')).resolves.toBeTypeOf(
      'string'
    )

    const stopArgs = JSON.parse(
      await readFile(join(tempDir, 'mock-ralph-stop-args.log'), 'utf8')
    )
    expect(stopArgs).toEqual(['loops', 'stop', '--loop-id', started.id])
  })

  it('captures loop start and end commit metadata for commit-range review fallback', async () => {
    const { caller, connection, tempDir } = await setupCaller()
    const projectPath = join(tempDir, 'project')
    await mkdir(projectPath, { recursive: true })

    await runGit(projectPath, ['init', '-b', 'main'])
    await runGit(projectPath, ['config', 'user.name', 'Test User'])
    await runGit(projectPath, ['config', 'user.email', 'test@example.com'])
    await writeFile(join(projectPath, 'README.md'), 'hello\n', 'utf8')
    await runGit(projectPath, ['add', '.'])
    await runGit(projectPath, ['commit', '-m', 'initial'])
    const initialHead = (await execFile('git', ['rev-parse', 'HEAD'], { cwd: projectPath }))
      .stdout
      .trim()

    const projectId = await createProject(connection, projectPath)
    const started = await caller.loop.start({
      projectId,
      prompt: 'keep-running'
    })

    await caller.loop.stop({ loopId: started.id })

    const persisted = connection.db
      .select()
      .from(loopRuns)
      .where(eq(loopRuns.id, started.id))
      .get()
    const parsedConfig = JSON.parse(persisted?.config ?? '{}') as Record<string, unknown>

    expect(parsedConfig.startCommit).toBe(initialHead)
    expect(parsedConfig.endCommit).toBe(initialHead)
  })

  it('treats stop as a no-op for an already-stopped loop', async () => {
    const { caller, connection, tempDir } = await setupCaller()
    const projectPath = join(tempDir, 'project')
    await mkdir(projectPath, { recursive: true })
    const projectId = await createProject(connection, projectPath)
    const loopId = randomUUID()

    await connection.db
      .insert(loopRuns)
      .values({
        id: loopId,
        projectId,
        state: 'stopped',
        config: null,
        prompt: null,
        worktree: null,
        iterations: 0,
        tokensUsed: 0,
        errors: 0,
        startedAt: 1_000,
        endedAt: 1_500
      })
      .run()

    await expect(caller.loop.stop({ loopId })).resolves.toBeUndefined()

    const afterStop = connection.db
      .select()
      .from(loopRuns)
      .where(eq(loopRuns.id, loopId))
      .get()

    expect(afterStop?.state).toBe('stopped')
    expect(afterStop?.endedAt).toBe(1_500)
  })

  it('tracks completed state and parses iteration/hat metadata from Ralph events', async () => {
    const { caller, connection, tempDir } = await setupCaller()
    const projectPath = join(tempDir, 'project')
    await mkdir(projectPath, { recursive: true })
    const projectId = await createProject(connection, projectPath)

    const started = await caller.loop.start({
      projectId,
      prompt: 'exit-fast'
    })

    await waitFor(() => {
      const row = connection.db
        .select()
        .from(loopRuns)
        .where(eq(loopRuns.id, started.id))
        .get()
      return row?.state === 'completed'
    })

    const listed = await caller.loop.list({ projectId })
    expect(listed).toHaveLength(1)
    expect(listed[0]?.state).toBe('completed')
    expect(listed[0]?.iterations).toBeGreaterThanOrEqual(2)
    expect(listed[0]?.currentHat).toBe('builder')
  })

  it('reads loop metrics from .agent/metrics files', async () => {
    const { caller, connection, tempDir } = await setupCaller()
    const projectPath = join(tempDir, 'project')
    await mkdir(projectPath, { recursive: true })
    const metricsDir = join(projectPath, '.agent', 'metrics')
    await mkdir(metricsDir, { recursive: true })

    await writeFile(join(metricsDir, 'iterations'), '7\n', 'utf8')
    await writeFile(join(metricsDir, 'runtime'), '42\n', 'utf8')
    await writeFile(join(metricsDir, 'tokens_used'), '101\n', 'utf8')
    await writeFile(join(metricsDir, 'errors'), '3\n', 'utf8')
    await writeFile(join(metricsDir, 'last_output_size'), '55\n', 'utf8')
    await writeFile(
      join(metricsDir, 'files_changed.json'),
      JSON.stringify(['src/a.ts', 'src/b.ts']),
      'utf8'
    )

    const projectId = await createProject(connection, projectPath)
    const started = await caller.loop.start({
      projectId,
      prompt: 'keep-running'
    })

    const metrics = await caller.loop.getMetrics({ loopId: started.id })
    expect(metrics).toMatchObject({
      iterations: 7,
      runtime: 42,
      tokensUsed: 101,
      errors: 3,
      lastOutputSize: 55,
      filesChanged: ['src/a.ts', 'src/b.ts']
    })

    await caller.loop.stop({ loopId: started.id })
  })

  it('uses persisted loop metrics for completed loops instead of project-level live metric files', async () => {
    const { caller, connection, tempDir } = await setupCaller()
    const projectPath = join(tempDir, 'project')
    await mkdir(projectPath, { recursive: true })
    const metricsDir = join(projectPath, '.agent', 'metrics')
    await mkdir(metricsDir, { recursive: true })

    await writeFile(join(metricsDir, 'iterations'), '999\n', 'utf8')
    await writeFile(join(metricsDir, 'runtime'), '999\n', 'utf8')
    await writeFile(join(metricsDir, 'tokens_used'), '999\n', 'utf8')
    await writeFile(join(metricsDir, 'errors'), '999\n', 'utf8')

    const projectId = await createProject(connection, projectPath)
    const loopId = randomUUID()

    await connection.db
      .insert(loopRuns)
      .values({
        id: loopId,
        projectId,
        state: 'completed',
        config: null,
        prompt: null,
        worktree: null,
        iterations: 7,
        tokensUsed: 101,
        errors: 3,
        startedAt: 1_770_768_000_000,
        endedAt: 1_770_768_042_000
      })
      .run()

    const metrics = await caller.loop.getMetrics({ loopId })
    expect(metrics).toMatchObject({
      iterations: 7,
      runtime: 42,
      tokensUsed: 101,
      errors: 3
    })
  })

  it('returns unavailable diff state when no worktree is configured', async () => {
    const { caller, connection, tempDir } = await setupCaller()
    const projectPath = join(tempDir, 'project')
    await mkdir(projectPath, { recursive: true })
    const projectId = await createProject(connection, projectPath)
    const loopId = randomUUID()

    await connection.db
      .insert(loopRuns)
      .values({
        id: loopId,
        projectId,
        state: 'completed',
        config: null,
        prompt: null,
        worktree: null,
        iterations: 0,
        tokensUsed: 0,
        errors: 0,
        startedAt: 1_000,
        endedAt: 2_000
      })
      .run()

    await expect(caller.loop.getDiff({ loopId })).resolves.toEqual({
      available: false,
      reason: 'No worktree configured and commit-range metadata is unavailable for this loop.'
    })
  })

  it('falls back to commit-range diff when no worktree branch is available', async () => {
    const { caller, connection, tempDir } = await setupCaller()
    const projectPath = join(tempDir, 'project')
    const srcPath = join(projectPath, 'src')
    await mkdir(srcPath, { recursive: true })

    await runGit(projectPath, ['init', '-b', 'main'])
    await runGit(projectPath, ['config', 'user.name', 'Test User'])
    await runGit(projectPath, ['config', 'user.email', 'test@example.com'])

    await writeFile(join(srcPath, 'app.ts'), 'const value = 1;\n', 'utf8')
    await runGit(projectPath, ['add', '.'])
    await runGit(projectPath, ['commit', '-m', 'initial'])
    const startCommit = (await execFile('git', ['rev-parse', 'HEAD'], { cwd: projectPath }))
      .stdout
      .trim()

    await writeFile(
      join(srcPath, 'app.ts'),
      'const value = 2;\nconst added = true;\n',
      'utf8'
    )
    await runGit(projectPath, ['add', '.'])
    await runGit(projectPath, ['commit', '-m', 'update app'])
    const endCommit = (await execFile('git', ['rev-parse', 'HEAD'], { cwd: projectPath }))
      .stdout
      .trim()

    const projectId = await createProject(connection, projectPath)
    const loopId = randomUUID()
    await connection.db
      .insert(loopRuns)
      .values({
        id: loopId,
        projectId,
        state: 'completed',
        config: JSON.stringify({
          startCommit,
          endCommit
        }),
        prompt: null,
        worktree: null,
        iterations: 0,
        tokensUsed: 0,
        errors: 0,
        startedAt: 1_000,
        endedAt: 2_000
      })
      .run()

    const diff = await caller.loop.getDiff({ loopId })

    expect(diff.available).toBe(true)
    expect(diff.baseBranch).toBe(startCommit)
    expect(diff.worktreeBranch).toBe(endCommit)
    expect(diff.stats).toEqual({
      filesChanged: 1,
      additions: 2,
      deletions: 1
    })
    expect(diff.files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'src/app.ts',
          status: 'M',
          additions: 2,
          deletions: 1
        })
      ])
    )
  })

  it('returns parsed diff and summary stats for a loop worktree branch', async () => {
    const { caller, connection, tempDir } = await setupCaller()
    const projectPath = join(tempDir, 'project')
    const srcPath = join(projectPath, 'src')
    await mkdir(srcPath, { recursive: true })

    await runGit(projectPath, ['init', '-b', 'main'])
    await runGit(projectPath, ['config', 'user.name', 'Test User'])
    await runGit(projectPath, ['config', 'user.email', 'test@example.com'])

    await writeFile(
      join(srcPath, 'app.ts'),
      'const value = 1;\nconst untouched = true;\n',
      'utf8'
    )
    await runGit(projectPath, ['add', '.'])
    await runGit(projectPath, ['commit', '-m', 'initial'])

    await runGit(projectPath, ['checkout', '-b', 'feature-loop'])

    await writeFile(
      join(srcPath, 'app.ts'),
      'const value = 2;\nconst untouched = true;\nconst added = 3;\n',
      'utf8'
    )
    await writeFile(join(srcPath, 'new-file.ts'), 'export const item = 1;\n', 'utf8')
    await runGit(projectPath, ['add', '.'])
    await runGit(projectPath, ['commit', '-m', 'changes'])

    const projectId = await createProject(connection, projectPath)
    const loopId = randomUUID()

    await connection.db
      .insert(loopRuns)
      .values({
        id: loopId,
        projectId,
        state: 'completed',
        config: null,
        prompt: null,
        worktree: 'feature-loop',
        iterations: 0,
        tokensUsed: 0,
        errors: 0,
        startedAt: 1_000,
        endedAt: 2_000
      })
      .run()

    const diff = await caller.loop.getDiff({ loopId })

    expect(diff.available).toBe(true)
    expect(diff.baseBranch).toBe('main')
    expect(diff.worktreeBranch).toBe('feature-loop')
    expect(diff.stats).toEqual({
      filesChanged: 2,
      additions: 3,
      deletions: 1
    })
    expect(diff.files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'src/app.ts',
          status: 'M',
          additions: 2,
          deletions: 1
        }),
        expect.objectContaining({
          path: 'src/new-file.ts',
          status: 'A',
          additions: 1,
          deletions: 0
        })
      ])
    )
  })
})

describe('loop websocket streaming', () => {
  const tempDirs: string[] = []
  const apps: ReturnType<typeof createApp>[] = []
  const envSnapshots: Record<string, string | undefined>[] = []

  afterEach(async () => {
    while (apps.length > 0) {
      await apps.pop()?.close()
    }

    while (envSnapshots.length > 0) {
      const snapshot = envSnapshots.pop()
      if (!snapshot) {
        continue
      }

      for (const [key, value] of Object.entries(snapshot)) {
        if (value === undefined) {
          delete process.env[key]
        } else {
          process.env[key] = value
        }
      }
    }

    while (tempDirs.length > 0) {
      const dir = tempDirs.pop()
      if (dir) {
        await rm(dir, { recursive: true, force: true })
      }
    }
  })

  it('streams live output and replays buffered output after reconnect', async () => {
    const tempDir = await createTempDir('loop-ws')
    tempDirs.push(tempDir)

    const dbPath = join(tempDir, 'ws.db')
    const binaryPath = await createMockRalphBinary(tempDir)

    envSnapshots.push({
      RALPH_UI_DB_PATH: process.env.RALPH_UI_DB_PATH,
      RALPH_UI_RALPH_BIN: process.env.RALPH_UI_RALPH_BIN
    })

    process.env.RALPH_UI_DB_PATH = dbPath
    process.env.RALPH_UI_RALPH_BIN = binaryPath

    const app = createApp()
    apps.push(app)

    await app.listen({ host: '127.0.0.1', port: 0 })

    const projectPath = join(tempDir, 'project')
    await mkdir(projectPath, { recursive: true })
    const projectId = await createProject(app.dbConnection, projectPath)

    const loop = await app.loopService.start(projectId, {
      prompt: 'keep-running'
    })

    const address = app.server.address() as AddressInfo
    const baseUrl = `ws://127.0.0.1:${address.port}/ws`

    const ws1 = new WebSocket(baseUrl)
    await new Promise((resolve, reject) => {
      ws1.once('open', resolve)
      ws1.once('error', reject)
    })

    const nextMessage1 = createMessageWaiter(ws1)
    ws1.send(
      JSON.stringify({
        type: 'subscribe',
        channels: [`loop:${loop.id}:output`]
      })
    )

    const liveMessage = await nextMessage1(
      (message) =>
        message.type === 'loop.output' &&
        message.channel === `loop:${loop.id}:output` &&
        message.replay !== true
    )

    expect(String(liveMessage.data)).toMatch(/(boot|tick)/)
    ws1.close()

    await new Promise((resolve) => setTimeout(resolve, 120))

    const ws2 = new WebSocket(baseUrl)
    await new Promise((resolve, reject) => {
      ws2.once('open', resolve)
      ws2.once('error', reject)
    })

    const nextMessage2 = createMessageWaiter(ws2)
    ws2.send(
      JSON.stringify({
        type: 'subscribe',
        channels: [`loop:${loop.id}:output`]
      })
    )

    const replayMessage = await nextMessage2(
      (message) =>
        message.type === 'loop.output' &&
        message.channel === `loop:${loop.id}:output` &&
        message.replay === true
    )

    expect(String(replayMessage.data).length).toBeGreaterThan(0)

    await app.loopService.stop(loop.id)
    ws2.close()

    const run = app.db
      .select()
      .from(loopRuns)
      .where(eq(loopRuns.id, loop.id))
      .get()

    expect(run?.state).toBe('stopped')

    const outputLog = await readFile(join(tempDir, 'mock-ralph.mjs'), 'utf8')
    expect(outputLog).toContain('Event: loop:iteration')
  })
})
