import { randomUUID } from 'node:crypto'
import { execFile as execFileCallback } from 'node:child_process'
import { readFileSync } from 'node:fs'
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
import { ProjectService } from '../src/services/ProjectService.js'
import { PresetService } from '../src/services/PresetService.js'
import { SettingsService } from '../src/services/SettingsService.js'
import { HatsPresetService } from '../src/services/HatsPresetService.js'
import { TaskService } from '../src/services/TaskService.js'
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

async function createMockRalphBinary(
  directory: string,
  options: {
    stopNoop?: boolean
    decreasingIterations?: boolean
    markerLoopId?: string
    currentEventsLoopId?: string
    eventLoopId?: string
    eventLoopIdSnake?: string
    outputTokenCount?: number
    emitIterationEvents?: boolean
    outputIterationHeader?: boolean
    listedLoopIds?: string[]
    listedLoopEntries?: Array<Record<string, unknown>>
  } = {}
) {
  const filePath = join(directory, 'mock-ralph.mjs')
  const stopNoop = options.stopNoop === true
  const decreasingIterations = options.decreasingIterations === true
  const markerLoopId = options.markerLoopId ?? ''
  const currentEventsLoopId = options.currentEventsLoopId ?? ''
  const eventLoopId = options.eventLoopId ?? ''
  const eventLoopIdSnake = options.eventLoopIdSnake ?? ''
  const outputTokenCount = Number.isFinite(options.outputTokenCount)
    ? Number(options.outputTokenCount)
    : 0
  const listedLoopIds = Array.isArray(options.listedLoopIds)
    ? options.listedLoopIds.filter((id) => typeof id === 'string' && id.trim().length > 0)
    : []
  const listedLoopEntries = Array.isArray(options.listedLoopEntries)
    ? options.listedLoopEntries
    : []
  const emitIterationEvents = options.emitIterationEvents !== false
  const outputIterationHeader = options.outputIterationHeader === true
  const script = `#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)
const stopNoop = ${stopNoop ? 'true' : 'false'}
const markerLoopId = ${JSON.stringify(markerLoopId)}
const currentEventsLoopId = ${JSON.stringify(currentEventsLoopId)}
const eventLoopId = ${JSON.stringify(eventLoopId)}
const eventLoopIdSnake = ${JSON.stringify(eventLoopIdSnake)}
const outputTokenCount = ${outputTokenCount}
const listedLoopIds = ${JSON.stringify(listedLoopIds)}
const listedLoopEntries = ${JSON.stringify(listedLoopEntries)}
const scriptDir = dirname(fileURLToPath(import.meta.url))
const pidFile = join(scriptDir, 'mock-ralph.pid')
const stopArgsFile = join(scriptDir, 'mock-ralph-stop-args.log')
const promptArg = args.find((arg) => arg.startsWith('--prompt=')) || ''
const shouldExitFast = promptArg.includes('exit-fast')
const decreasingIterations = ${decreasingIterations ? 'true' : 'false'}
const emitIterationEvents = ${emitIterationEvents ? 'true' : 'false'}
const outputIterationHeader = ${outputIterationHeader ? 'true' : 'false'}
let iteration = 0

if (args[0] === 'loops' && args[1] === 'stop') {
  writeFileSync(stopArgsFile, JSON.stringify(args), 'utf8')
  if (!stopNoop && existsSync(pidFile)) {
    const pid = Number(readFileSync(pidFile, 'utf8').trim())
    if (Number.isFinite(pid)) {
      try {
        process.kill(pid, 'SIGTERM')
      } catch {}
    }
  }
  process.exit(0)
}

if (args[0] === 'loops' && args[1] === 'list') {
  const payload = listedLoopEntries.length > 0
    ? listedLoopEntries
    : listedLoopIds.map((loop_id) => ({ loop_id }))
  process.stdout.write(\`\${JSON.stringify(payload)}\\n\`)
  process.exit(0)
}

writeFileSync(pidFile, String(process.pid), 'utf8')
if (markerLoopId) {
  const ralphDir = join(process.cwd(), '.ralph')
  mkdirSync(ralphDir, { recursive: true })
  writeFileSync(join(ralphDir, 'current-loop-id'), markerLoopId, 'utf8')
}
if (currentEventsLoopId) {
  const ralphDir = join(process.cwd(), '.ralph')
  mkdirSync(ralphDir, { recursive: true })
  const normalized = /^primary-(\\d{8})-(\\d{6})$/i.exec(currentEventsLoopId)
  if (normalized) {
    writeFileSync(join(ralphDir, 'current-events'), \`.ralph/events-\${normalized[1]}-\${normalized[2]}.jsonl\`, 'utf8')
  }
}

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
  const eventIteration = decreasingIterations
    ? (iteration === 1 ? 5 : iteration === 2 ? 1 : iteration)
    : iteration
  process.stdout.write(\`tick-\${iteration}\\n\`)
  if (outputIterationHeader) {
    process.stdout.write(\` ITERATION \${iteration} | ? ralph | \${iteration}s elapsed | \${iteration}/100\\n\`)
  }
  if (outputTokenCount > 0) {
    process.stdout.write(\`Total tokens: \${outputTokenCount}\\n\`)
  }
  if (emitIterationEvents) {
    const payload = {"iteration":eventIteration,"sourceHat":"builder"}
    if (eventLoopId) {
      payload.loopId = eventLoopId
    }
    if (eventLoopIdSnake) {
      payload.loop_id = eventLoopIdSnake
    }
    process.stdout.write(\`Event: loop:iteration - \${JSON.stringify(payload)}\\n\`)
  }

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

  async function setupCaller(
    options: {
      stopNoop?: boolean
      decreasingIterations?: boolean
      markerLoopId?: string
      currentEventsLoopId?: string
      eventLoopId?: string
      eventLoopIdSnake?: string
      outputTokenCount?: number
      emitIterationEvents?: boolean
      outputIterationHeader?: boolean
      listedLoopIds?: string[]
      listedLoopEntries?: Array<Record<string, unknown>>
    } = {}
  ) {
    const tempDir = await createTempDir('loop')
    tempDirs.push(tempDir)

    const dbPath = join(tempDir, 'loop.db')
    const connection = createDatabase({ filePath: dbPath })
    migrateDatabase(connection.db)
    connections.push(connection)

    const binaryPath = await createMockRalphBinary(tempDir, {
      stopNoop: options.stopNoop,
      decreasingIterations: options.decreasingIterations,
      markerLoopId: options.markerLoopId,
      currentEventsLoopId: options.currentEventsLoopId,
      eventLoopId: options.eventLoopId,
      eventLoopIdSnake: options.eventLoopIdSnake,
      outputTokenCount: options.outputTokenCount,
      emitIterationEvents: options.emitIterationEvents,
      outputIterationHeader: options.outputIterationHeader,
      listedLoopIds: options.listedLoopIds,
      listedLoopEntries: options.listedLoopEntries
    })
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
      previewService,
      projectService: new ProjectService(connection.db),
      presetService: new PresetService(),
      settingsService: new SettingsService(connection.db),
      hatsPresetService: new HatsPresetService(),
      taskService: new TaskService(connection.db)
    })

    return { caller, connection, processManager, loopService, tempDir, binaryPath }
  }

  it('starts and stops a loop while persisting run state in the database', async () => {
    const { caller, connection, processManager, tempDir } = await setupCaller()
    const killSpy = vi.spyOn(processManager, 'kill')
    const projectPath = join(tempDir, 'project')
    await mkdir(projectPath, { recursive: true })
    const projectId = await createProject(connection, projectPath)

    const started = await caller.loop.start({
      projectId,
      prompt: 'keep-running',
      backend: 'claude'
    })

    expect(started.projectId).toBe(projectId)
    expect(started.state).toBe('running')
    const handle = processManager.list().find((proc) => proc.id === started.processId)
    expect(handle).toBeDefined()
    expect(handle?.args[1]).toContain("'--backend' 'claude'")

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
    await expect(
      readFile(join(projectPath, '.ralph-ui', 'loop-logs', `${started.id}.log`), 'utf8')
    ).resolves.toBeTypeOf('string')

    const stopArgs = JSON.parse(
      await readFile(join(tempDir, 'mock-ralph-stop-args.log'), 'utf8')
    )
    expect(stopArgs).toEqual(['loops', 'stop', '--loop-id', started.id])
  })

  it('captures the Ralph loop id from current-loop-id marker during start', async () => {
    const { caller, connection, tempDir } = await setupCaller({
      markerLoopId: 'primary-20260225-090000'
    })
    const projectPath = join(tempDir, 'project')
    await mkdir(projectPath, { recursive: true })
    const projectId = await createProject(connection, projectPath)

    const started = await caller.loop.start({
      projectId,
      prompt: 'keep-running'
    })

    await waitFor(() => {
      const row = connection.db
        .select()
        .from(loopRuns)
        .where(eq(loopRuns.id, started.id))
        .get()
      return row?.ralphLoopId === 'primary-20260225-090000'
    })

    const refreshed = await caller.loop.list({ projectId })
    expect(refreshed.find((loop) => loop.id === started.id)?.ralphLoopId).toBe(
      'primary-20260225-090000'
    )

    const persisted = connection.db
      .select()
      .from(loopRuns)
      .where(eq(loopRuns.id, started.id))
      .get()
    expect(persisted?.ralphLoopId).toBe('primary-20260225-090000')

    await caller.loop.stop({ loopId: started.id })

    const stopArgs = JSON.parse(
      await readFile(join(tempDir, 'mock-ralph-stop-args.log'), 'utf8')
    )
    expect(stopArgs).toEqual(['loops', 'stop', '--loop-id', 'primary-20260225-090000'])
  })

  it('captures non-primary Ralph loop ids from current-loop-id markers during start', async () => {
    const { caller, connection, tempDir } = await setupCaller({
      markerLoopId: 'feature-a-loop'
    })
    const projectPath = join(tempDir, 'project')
    await mkdir(projectPath, { recursive: true })
    const projectId = await createProject(connection, projectPath)

    const started = await caller.loop.start({
      projectId,
      prompt: 'keep-running'
    })

    await waitFor(() => {
      const row = connection.db
        .select()
        .from(loopRuns)
        .where(eq(loopRuns.id, started.id))
        .get()
      return row?.ralphLoopId === 'feature-a-loop'
    })

    const refreshed = await caller.loop.list({ projectId })
    expect(refreshed.find((loop) => loop.id === started.id)?.ralphLoopId).toBe('feature-a-loop')

    await caller.loop.stop({ loopId: started.id })

    const stopArgs = JSON.parse(
      await readFile(join(tempDir, 'mock-ralph-stop-args.log'), 'utf8')
    )
    expect(stopArgs).toEqual(['loops', 'stop', '--loop-id', 'feature-a-loop'])
  })

  it('captures the Ralph loop id from current-events during start', async () => {
    const { caller, connection, tempDir } = await setupCaller({
      currentEventsLoopId: 'primary-20260225-090111'
    })
    const projectPath = join(tempDir, 'project')
    await mkdir(projectPath, { recursive: true })
    const projectId = await createProject(connection, projectPath)

    const started = await caller.loop.start({
      projectId,
      prompt: 'keep-running'
    })

    await waitFor(() => {
      const row = connection.db
        .select()
        .from(loopRuns)
        .where(eq(loopRuns.id, started.id))
        .get()
      return row?.ralphLoopId === 'primary-20260225-090111'
    })

    await caller.loop.stop({ loopId: started.id })

    const stopArgs = JSON.parse(
      await readFile(join(tempDir, 'mock-ralph-stop-args.log'), 'utf8')
    )
    expect(stopArgs).toEqual(['loops', 'stop', '--loop-id', 'primary-20260225-090111'])
  })

  it('stops a loop when called with a primary loop id', async () => {
    const { caller, connection, tempDir } = await setupCaller({
      markerLoopId: 'primary-20260225-090512'
    })
    const projectPath = join(tempDir, 'project')
    await mkdir(projectPath, { recursive: true })
    const projectId = await createProject(connection, projectPath)

    const started = await caller.loop.start({
      projectId,
      prompt: 'keep-running'
    })

    await waitFor(() => {
      const row = connection.db
        .select()
        .from(loopRuns)
        .where(eq(loopRuns.id, started.id))
        .get()
      return row?.ralphLoopId === 'primary-20260225-090512'
    })

    await expect(caller.loop.stop({ loopId: 'primary-20260225-090512' })).resolves.toBeUndefined()

    const stopped = connection.db
      .select()
      .from(loopRuns)
      .where(eq(loopRuns.id, started.id))
      .get()
    expect(stopped?.state).toBe('stopped')
  })

  it('prefers payload.loop_id over payload.loopId when both are present', async () => {
    const { caller, connection, tempDir } = await setupCaller({
      eventLoopId: 'able-owl',
      eventLoopIdSnake: 'primary-20260225-090222'
    })
    const projectPath = join(tempDir, 'project')
    await mkdir(projectPath, { recursive: true })
    const projectId = await createProject(connection, projectPath)

    const started = await caller.loop.start({
      projectId,
      prompt: 'keep-running'
    })

    await waitFor(() => {
      const row = connection.db
        .select()
        .from(loopRuns)
        .where(eq(loopRuns.id, started.id))
        .get()
      return row?.ralphLoopId === 'primary-20260225-090222'
    })

    await caller.loop.stop({ loopId: started.id })

    const stopArgs = JSON.parse(
      await readFile(join(tempDir, 'mock-ralph-stop-args.log'), 'utf8')
    )
    expect(stopArgs).toEqual(['loops', 'stop', '--loop-id', 'primary-20260225-090222'])
  })

  it('prefers persisted Ralph loop ids when stopping loops', async () => {
    const { caller, connection, tempDir } = await setupCaller()
    const projectPath = join(tempDir, 'project')
    await mkdir(projectPath, { recursive: true })
    const projectId = await createProject(connection, projectPath)

    const started = await caller.loop.start({
      projectId,
      prompt: 'keep-running'
    })

    const persisted = connection.db
      .select()
      .from(loopRuns)
      .where(eq(loopRuns.id, started.id))
      .get()
    const parsedConfig = JSON.parse(persisted?.config ?? '{}') as Record<string, unknown>

    await connection.db
      .update(loopRuns)
      .set({
        ralphLoopId: 'ralph-loop-123',
        config: JSON.stringify({
          ...parsedConfig,
          ralphLoopId: 'ralph-loop-123'
        })
      })
      .where(eq(loopRuns.id, started.id))
      .run()

    await caller.loop.stop({ loopId: started.id })

    const stopArgs = JSON.parse(
      await readFile(join(tempDir, 'mock-ralph-stop-args.log'), 'utf8')
    )
    expect(stopArgs).toEqual(['loops', 'stop', '--loop-id', 'ralph-loop-123'])
  })

  it('persists prompt snapshots for loops started from PROMPT.md content', async () => {
    const { caller, connection, tempDir } = await setupCaller()
    const projectPath = join(tempDir, 'project')
    await mkdir(projectPath, { recursive: true })
    const projectId = await createProject(connection, projectPath)

    const started = await caller.loop.start({
      projectId,
      promptSnapshot: '# Loop Prompt\nUse the file snapshot.\n'
    })

    const persisted = connection.db
      .select()
      .from(loopRuns)
      .where(eq(loopRuns.id, started.id))
      .get()

    expect(persisted?.prompt).toBe('# Loop Prompt\nUse the file snapshot.\n')

    await caller.loop.stop({ loopId: started.id })
  })

  it('keeps persisted iterations monotonic when parsed event iterations decrease', async () => {
    const { caller, connection, tempDir } = await setupCaller({
      decreasingIterations: true
    })
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

    const persisted = connection.db
      .select()
      .from(loopRuns)
      .where(eq(loopRuns.id, started.id))
      .get()

    expect(persisted?.iterations).toBe(5)
  })

  it('tracks iterations from output headers when Ralph events do not include iteration payloads', async () => {
    const { caller, connection, tempDir } = await setupCaller({
      emitIterationEvents: false,
      outputIterationHeader: true
    })
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

    const persisted = connection.db
      .select()
      .from(loopRuns)
      .where(eq(loopRuns.id, started.id))
      .get()
    expect(persisted?.iterations).toBeGreaterThanOrEqual(2)

    const metrics = await caller.loop.getMetrics({ loopId: started.id })
    expect(metrics.iterations).toBeGreaterThanOrEqual(2)
  })

  it('restarts loops with the persisted backend override', async () => {
    const { caller, connection, processManager, tempDir } = await setupCaller()
    const projectPath = join(tempDir, 'project')
    await mkdir(projectPath, { recursive: true })
    const projectId = await createProject(connection, projectPath)

    const started = await caller.loop.start({
      projectId,
      prompt: 'keep-running',
      backend: 'claude'
    })

    const restarted = await caller.loop.restart({ loopId: started.id })
    const handle = processManager.list().find((proc) => proc.id === restarted.processId)
    expect(handle).toBeDefined()
    expect(handle?.args[1]).toContain("'--backend' 'claude'")

    await caller.loop.stop({ loopId: restarted.id })

    const previous = connection.db
      .select()
      .from(loopRuns)
      .where(eq(loopRuns.id, started.id))
      .get()
    expect(previous?.state).toBe('stopped')
  })

  it('does not regress metrics iterations when live metric files report lower values', async () => {
    const { caller, connection, tempDir } = await setupCaller()
    const projectPath = join(tempDir, 'project')
    await mkdir(projectPath, { recursive: true })
    const metricsDir = join(projectPath, '.agent', 'metrics')
    await mkdir(metricsDir, { recursive: true })
    await writeFile(join(metricsDir, 'iterations'), '2\n', 'utf8')

    const projectId = await createProject(connection, projectPath)
    const loopId = randomUUID()
    await connection.db
      .insert(loopRuns)
      .values({
        id: loopId,
        projectId,
        state: 'running',
        config: null,
        prompt: null,
        worktree: null,
        iterations: 10,
        tokensUsed: 0,
        errors: 0,
        startedAt: Date.now() - 5_000,
        endedAt: null
      })
      .run()

    const metrics = await caller.loop.getMetrics({ loopId })
    expect(metrics.iterations).toBe(10)
  })

  it('reads iterations from .ralph/current-events when live metric files are unavailable', async () => {
    const { caller, connection, tempDir } = await setupCaller()
    const projectPath = join(tempDir, 'project')
    await mkdir(join(projectPath, '.ralph'), { recursive: true })

    const eventsPath = join(projectPath, '.ralph', 'events-20260225-120000.jsonl')
    await writeFile(
      eventsPath,
      [
        JSON.stringify({ topic: 'task.start', iteration: 0 }),
        JSON.stringify({ topic: 'loop.terminate', iteration: 3 })
      ].join('\n'),
      'utf8'
    )
    await writeFile(
      join(projectPath, '.ralph', 'current-events'),
      '.ralph/events-20260225-120000.jsonl',
      'utf8'
    )

    const projectId = await createProject(connection, projectPath)
    const loopId = randomUUID()
    await connection.db
      .insert(loopRuns)
      .values({
        id: loopId,
        projectId,
        state: 'running',
        config: null,
        prompt: null,
        worktree: null,
        iterations: 0,
        tokensUsed: 0,
        errors: 0,
        startedAt: Date.now() - 5_000,
        endedAt: null
      })
      .run()

    const metrics = await caller.loop.getMetrics({ loopId })
    expect(metrics.iterations).toBe(3)
  })

  it('falls back to process kill when ralph loops stop does not terminate runtime', async () => {
    const { caller, connection, processManager, tempDir } = await setupCaller({
      stopNoop: true
    })
    const killSpy = vi.spyOn(processManager, 'kill')
    const projectPath = join(tempDir, 'project')
    await mkdir(projectPath, { recursive: true })
    const projectId = await createProject(connection, projectPath)

    const started = await caller.loop.start({
      projectId,
      prompt: 'keep-running'
    })

    expect(started.processId).toBeTruthy()
    await caller.loop.stop({ loopId: started.id })

    const afterStop = connection.db
      .select()
      .from(loopRuns)
      .where(eq(loopRuns.id, started.id))
      .get()

    expect(afterStop?.state).toBe('stopped')
    expect(afterStop?.endedAt).toBeTypeOf('number')
    expect(processManager.list()).toEqual([])
    expect(killSpy).toHaveBeenCalledWith(started.processId)

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
    expect(parsedConfig.outputLogFile).toBe(`.ralph-ui/loop-logs/${started.id}.log`)
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

  it('attempts CLI stop when runtime tracking is unavailable', async () => {
    const { caller, connection, processManager, tempDir, binaryPath } = await setupCaller()
    const projectPath = join(tempDir, 'project')
    await mkdir(projectPath, { recursive: true })
    const projectId = await createProject(connection, projectPath)

    const started = await caller.loop.start({
      projectId,
      prompt: 'keep-running'
    })

    const stopSpy = vi.fn(
      async (input: { binaryPath: string; loopId: string; cwd: string }) => {
        void input
        return undefined
      }
    )
    const detachedLoopService = new LoopService(connection.db, processManager, {
      resolveBinary: async () => binaryPath,
      stopLoop: stopSpy
    })

    await detachedLoopService.stop(started.id)

    const stoppedLoop = connection.db
      .select()
      .from(loopRuns)
      .where(eq(loopRuns.id, started.id))
      .get()

    expect(stopSpy).toHaveBeenCalled()
    expect(stopSpy.mock.calls[0]?.[0]).toMatchObject({ loopId: started.id })
    expect(stoppedLoop?.state).toBe('stopped')
  })

  it('falls back to process kill when binary resolution fails for an active runtime', async () => {
    const { caller, connection, processManager, loopService, tempDir } = await setupCaller()
    const killSpy = vi.spyOn(processManager, 'kill')
    const projectPath = join(tempDir, 'project')
    await mkdir(projectPath, { recursive: true })
    const projectId = await createProject(connection, projectPath)

    const started = await caller.loop.start({
      projectId,
      prompt: 'keep-running'
    })

    ;(
      loopService as unknown as {
        resolveBinary: () => Promise<string>
      }
    ).resolveBinary = async () => {
      throw new Error('Unable to resolve Ralph binary')
    }

    await expect(loopService.stop(started.id)).resolves.toBeUndefined()

    const stoppedLoop = connection.db
      .select()
      .from(loopRuns)
      .where(eq(loopRuns.id, started.id))
      .get()

    expect(stoppedLoop?.state).toBe('stopped')
    expect(killSpy).toHaveBeenCalled()
  })

  it('tries a derived primary loop id when runtime tracking is unavailable', async () => {
    const { connection, processManager, tempDir, binaryPath } = await setupCaller()
    const projectPath = join(tempDir, 'project')
    await mkdir(projectPath, { recursive: true })
    const projectId = await createProject(connection, projectPath)
    const loopId = randomUUID()
    const startedAt = Date.UTC(2026, 1, 25, 9, 0, 0)
    const derivedPrimaryLoopId = 'primary-20260225-090000'

    await connection.db
      .insert(loopRuns)
      .values({
        id: loopId,
        projectId,
        state: 'running',
        config: null,
        prompt: null,
        worktree: null,
        iterations: 0,
        tokensUsed: 0,
        errors: 0,
        startedAt,
        endedAt: null
      })
      .run()

    const stopSpy = vi.fn(
      async (input: { binaryPath: string; loopId: string; cwd: string }) => {
        if (input.loopId !== derivedPrimaryLoopId) {
          throw new Error(`loop not found: ${input.loopId}`)
        }
      }
    )

    const detachedLoopService = new LoopService(connection.db, processManager, {
      resolveBinary: async () => binaryPath,
      stopLoop: stopSpy
    })

    await expect(detachedLoopService.stop(loopId)).resolves.toBeUndefined()

    expect(
      stopSpy.mock.calls.some((call) => call[0]?.loopId === derivedPrimaryLoopId)
    ).toBe(true)

    const stoppedLoop = connection.db
      .select()
      .from(loopRuns)
      .where(eq(loopRuns.id, loopId))
      .get()
    expect(stoppedLoop?.state).toBe('stopped')
  })

  it('reconciles stale running loops when CLI reports loop not found', async () => {
    const { connection, processManager, tempDir, binaryPath } = await setupCaller()
    const projectPath = join(tempDir, 'project')
    await mkdir(projectPath, { recursive: true })
    const projectId = await createProject(connection, projectPath)
    const loopId = randomUUID()

    await connection.db
      .insert(loopRuns)
      .values({
        id: loopId,
        projectId,
        state: 'running',
        config: null,
        prompt: null,
        worktree: null,
        iterations: 0,
        tokensUsed: 0,
        errors: 0,
        startedAt: Date.now(),
        endedAt: null
      })
      .run()

    const stopSpy = vi.fn(async () => {
      throw new Error('loop not found')
    })

    const detachedLoopService = new LoopService(connection.db, processManager, {
      resolveBinary: async () => binaryPath,
      stopLoop: stopSpy
    })

    await expect(detachedLoopService.stop(loopId)).resolves.toBeUndefined()

    const stoppedLoop = connection.db
      .select()
      .from(loopRuns)
      .where(eq(loopRuns.id, loopId))
      .get()
    expect(stoppedLoop?.state).toBe('stopped')
    expect(stoppedLoop?.endedAt).toBeTypeOf('number')
  })

  it('reconciles stale running loops when CLI wraps not-found with loop id text', async () => {
    const { connection, processManager, tempDir, binaryPath } = await setupCaller()
    const projectPath = join(tempDir, 'project')
    await mkdir(projectPath, { recursive: true })
    const projectId = await createProject(connection, projectPath)
    const loopId = randomUUID()
    const primaryLoopId = 'primary-20260226-002039'

    await connection.db
      .insert(loopRuns)
      .values({
        id: loopId,
        projectId,
        ralphLoopId: primaryLoopId,
        state: 'running',
        config: null,
        prompt: null,
        worktree: null,
        iterations: 0,
        tokensUsed: 0,
        errors: 0,
        startedAt: Date.now(),
        endedAt: null
      })
      .run()

    const detachedLoopService = new LoopService(connection.db, processManager, {
      resolveBinary: async () => binaryPath,
      stopLoop: async () => {
        throw new Error(
          `Command failed: /mock/ralph loops stop ${primaryLoopId}\nError: Loop '${primaryLoopId}' not found\n`
        )
      }
    })

    await expect(detachedLoopService.stop(loopId)).resolves.toBeUndefined()

    const stoppedLoop = connection.db
      .select()
      .from(loopRuns)
      .where(eq(loopRuns.id, loopId))
      .get()
    expect(stoppedLoop?.state).toBe('stopped')
    expect(stoppedLoop?.endedAt).toBeTypeOf('number')
  })

  it('auto-reconciles stale running loops during list()', async () => {
    const { connection, processManager, tempDir, binaryPath } = await setupCaller()
    const projectPath = join(tempDir, 'project')
    await mkdir(projectPath, { recursive: true })
    const projectId = await createProject(connection, projectPath)
    const loopId = randomUUID()

    await connection.db
      .insert(loopRuns)
      .values({
        id: loopId,
        projectId,
        ralphLoopId: 'primary-20260226-003500',
        state: 'running',
        config: null,
        prompt: null,
        worktree: null,
        iterations: 0,
        tokensUsed: 0,
        errors: 0,
        startedAt: Date.now(),
        endedAt: null
      })
      .run()

    const detachedLoopService = new LoopService(connection.db, processManager, {
      resolveBinary: async () => binaryPath
    })

    const listed = await detachedLoopService.list(projectId)
    expect(listed.find((loop) => loop.id === loopId)?.state).toBe('stopped')

    const persisted = connection.db
      .select()
      .from(loopRuns)
      .where(eq(loopRuns.id, loopId))
      .get()
    expect(persisted?.state).toBe('stopped')
    expect(persisted?.endedAt).toBeTypeOf('number')
  })

  it('keeps active loops running during reconciliation when CLI lists them', async () => {
    const listedLoopId = 'primary-20260226-003559'
    const { connection, processManager, tempDir, binaryPath } = await setupCaller({
      listedLoopIds: [listedLoopId]
    })
    const projectPath = join(tempDir, 'project')
    await mkdir(projectPath, { recursive: true })
    const projectId = await createProject(connection, projectPath)
    const loopId = randomUUID()

    await connection.db
      .insert(loopRuns)
      .values({
        id: loopId,
        projectId,
        ralphLoopId: listedLoopId,
        state: 'running',
        config: null,
        prompt: null,
        worktree: null,
        iterations: 0,
        tokensUsed: 0,
        errors: 0,
        startedAt: Date.now(),
        endedAt: null
      })
      .run()

    const detachedLoopService = new LoopService(connection.db, processManager, {
      resolveBinary: async () => binaryPath
    })

    const listed = await detachedLoopService.list(projectId)
    expect(listed.find((loop) => loop.id === loopId)?.state).toBe('running')

    const persisted = connection.db
      .select()
      .from(loopRuns)
      .where(eq(loopRuns.id, loopId))
      .get()
    expect(persisted?.state).toBe('running')
    expect(persisted?.endedAt).toBeNull()
  })

  it('keeps active loops running during reconciliation when CLI lists non-primary ids', async () => {
    const listedLoopId = 'feature-b-loop'
    const { connection, processManager, tempDir, binaryPath } = await setupCaller({
      listedLoopIds: [listedLoopId]
    })
    const projectPath = join(tempDir, 'project')
    await mkdir(projectPath, { recursive: true })
    const projectId = await createProject(connection, projectPath)
    const loopId = randomUUID()

    await connection.db
      .insert(loopRuns)
      .values({
        id: loopId,
        projectId,
        ralphLoopId: listedLoopId,
        state: 'running',
        config: null,
        prompt: null,
        worktree: null,
        iterations: 0,
        tokensUsed: 0,
        errors: 0,
        startedAt: Date.now(),
        endedAt: null
      })
      .run()

    const detachedLoopService = new LoopService(connection.db, processManager, {
      resolveBinary: async () => binaryPath
    })

    const listed = await detachedLoopService.list(projectId)
    expect(listed.find((loop) => loop.id === loopId)?.ralphLoopId).toBe(listedLoopId)
    expect(listed.find((loop) => loop.id === loopId)?.state).toBe('running')

    const persisted = connection.db
      .select()
      .from(loopRuns)
      .where(eq(loopRuns.id, loopId))
      .get()
    expect(persisted?.state).toBe('running')
    expect(persisted?.endedAt).toBeNull()
  })

  it('imports orphan loops from the CLI and preserves their worktree location', async () => {
    const { connection, processManager, tempDir, binaryPath } = await setupCaller({
      listedLoopEntries: [
        {
          id: 'fair-fox',
          status: 'orphan',
          location: 'fair-fox',
          prompt: ''
        }
      ]
    })
    const projectPath = join(tempDir, 'project')
    await mkdir(projectPath, { recursive: true })
    const projectId = await createProject(connection, projectPath)

    const detachedLoopService = new LoopService(connection.db, processManager, {
      resolveBinary: async () => binaryPath
    })

    const listed = await detachedLoopService.list(projectId)
    expect(listed.find((loop) => loop.id === 'fair-fox')).toMatchObject({
      id: 'fair-fox',
      ralphLoopId: 'fair-fox',
      state: 'orphan',
      worktree: 'fair-fox'
    })

    const persisted = connection.db
      .select()
      .from(loopRuns)
      .where(eq(loopRuns.id, 'fair-fox'))
      .get()
    expect(persisted).toMatchObject({
      id: 'fair-fox',
      ralphLoopId: 'fair-fox',
      state: 'orphan',
      worktree: 'fair-fox'
    })
  })

  it('keeps throwing when CLI stop fails with non-stale errors', async () => {
    const { connection, processManager, tempDir, binaryPath } = await setupCaller()
    const projectPath = join(tempDir, 'project')
    await mkdir(projectPath, { recursive: true })
    const projectId = await createProject(connection, projectPath)
    const loopId = randomUUID()

    await connection.db
      .insert(loopRuns)
      .values({
        id: loopId,
        projectId,
        state: 'running',
        config: null,
        prompt: null,
        worktree: null,
        iterations: 0,
        tokensUsed: 0,
        errors: 0,
        startedAt: Date.now(),
        endedAt: null
      })
      .run()

    const detachedLoopService = new LoopService(connection.db, processManager, {
      resolveBinary: async () => binaryPath,
      stopLoop: async () => {
        throw new Error('permission denied')
      }
    })

    await expect(detachedLoopService.stop(loopId)).rejects.toThrow(
      /unable to stop runtime because process tracking was unavailable/i
    )
  })

  it('replays output from persisted loop log files when runtime state is unavailable', async () => {
    const { caller, connection, processManager, tempDir } = await setupCaller()
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

    const perLoopLogPath = join(projectPath, '.ralph-ui', 'loop-logs', `${started.id}.log`)
    const persistedLog = readFileSync(perLoopLogPath, 'utf8')
    expect(persistedLog.length).toBeGreaterThan(0)

    const replayService = new LoopService(connection.db, processManager)
    const replayed = await replayService.replayOutput(started.id)
    expect(replayed.length).toBeGreaterThan(0)
    expect(replayed.join('\n')).toMatch(/(boot|tick|Event: loop:iteration)/)
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

  it('persists final token usage when a loop transitions to completed', async () => {
    const { caller, connection, tempDir } = await setupCaller({
      emitIterationEvents: false
    })
    const projectPath = join(tempDir, 'project')
    await mkdir(projectPath, { recursive: true })
    const metricsDir = join(projectPath, '.agent', 'metrics')
    await mkdir(metricsDir, { recursive: true })
    await writeFile(join(metricsDir, 'tokens_used'), '4321\n', 'utf8')
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

    const persisted = connection.db
      .select()
      .from(loopRuns)
      .where(eq(loopRuns.id, started.id))
      .get()
    expect(persisted?.tokensUsed).toBe(4321)

    const listed = await caller.loop.list({ projectId })
    expect(listed[0]?.tokensUsed).toBe(4321)
  })

  it('captures final token usage from loop output logs when metrics files are absent', async () => {
    const { caller, connection, tempDir } = await setupCaller({
      emitIterationEvents: false,
      outputTokenCount: 9876
    })
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

    const persisted = connection.db
      .select()
      .from(loopRuns)
      .where(eq(loopRuns.id, started.id))
      .get()
    expect(persisted?.tokensUsed).toBe(9876)

    const metrics = await caller.loop.getMetrics({ loopId: started.id })
    expect(metrics.tokensUsed).toBe(9876)
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

  it('returns unavailable when commit-range metadata points to missing commits', async () => {
    const { caller, connection, tempDir } = await setupCaller()
    const projectPath = join(tempDir, 'project')
    await mkdir(projectPath, { recursive: true })

    await runGit(projectPath, ['init', '-b', 'main'])
    await runGit(projectPath, ['config', 'user.name', 'Test User'])
    await runGit(projectPath, ['config', 'user.email', 'test@example.com'])
    await writeFile(join(projectPath, 'README.md'), 'hello\n', 'utf8')
    await runGit(projectPath, ['add', '.'])
    await runGit(projectPath, ['commit', '-m', 'initial'])

    const projectId = await createProject(connection, projectPath)
    const loopId = randomUUID()
    await connection.db
      .insert(loopRuns)
      .values({
        id: loopId,
        projectId,
        state: 'completed',
        config: JSON.stringify({
          startCommit: '001dc19077a1a4fb534fcd45f1af4bbb8e5f519d',
          endCommit: '5d8f4e80c77e07dbffc0b70f1b95e16bca40e4f6'
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

    await expect(caller.loop.getDiff({ loopId })).resolves.toEqual({
      available: false,
      reason:
        'Stored commit-range metadata is no longer available in this repository (missing start and end commits).'
    })
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

  it('includes uncommitted changes from an active worktree branch', async () => {
    const { caller, connection, tempDir } = await setupCaller()
    const projectPath = join(tempDir, 'project')
    const worktreePath = join(tempDir, 'project-feature')
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

    await runGit(projectPath, ['worktree', 'add', '-b', 'feature-loop', worktreePath, 'HEAD'])
    await writeFile(
      join(worktreePath, 'src', 'app.ts'),
      'const value = 2;\nconst pending = true;\n',
      'utf8'
    )

    const projectId = await createProject(connection, projectPath)
    const loopId = randomUUID()

    await connection.db
      .insert(loopRuns)
      .values({
        id: loopId,
        projectId,
        state: 'completed',
        config: JSON.stringify({
          startCommit
        }),
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
