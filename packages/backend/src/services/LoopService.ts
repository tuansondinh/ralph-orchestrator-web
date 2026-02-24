import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { execFile as execFileCallback } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { mkdir, readFile, readdir } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { promisify } from 'node:util'
import { desc, eq } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import {
  loopRuns,
  notifications,
  projects,
  type LoopRun,
  schema
} from '../db/schema.js'
import { resolveRalphBinary } from '../lib/ralph.js'
import { parseDiff, type DiffFile } from '../lib/parseDiff.js'
import { OutputBuffer } from '../runner/OutputBuffer.js'
import {
  ProcessManager,
  type OutputChunk,
  type ProcessState
} from '../runner/ProcessManager.js'
import { RalphEventParser, type RalphEvent } from '../runner/RalphEventParser.js'

type ServiceErrorCode = 'BAD_REQUEST' | 'NOT_FOUND' | 'CONFLICT'

type LoopLifecycleState =
  | ProcessState
  | 'queued'
  | 'merging'
  | 'merged'
  | 'needs-review'
  | 'orphan'

export class LoopServiceError extends Error {
  code: ServiceErrorCode

  constructor(code: ServiceErrorCode, message: string) {
    super(message)
    this.name = 'LoopServiceError'
    this.code = code
  }
}

export interface LoopStartOptions {
  config?: string
  prompt?: string
  promptSnapshot?: string
  promptFile?: string
  exclusive?: boolean
  worktree?: string
}

export interface LoopSummary {
  id: string
  projectId: string
  processId: string | null
  state: LoopLifecycleState
  config: string | null
  prompt: string | null
  worktree: string | null
  iterations: number
  tokensUsed: number
  errors: number
  startedAt: number
  endedAt: number | null
  currentHat: string | null
}

export interface LoopMetrics {
  iterations: number
  runtime: number
  tokensUsed: number
  errors: number
  lastOutputSize: number
  filesChanged: string[]
}

export interface LoopDiffStats {
  filesChanged: number
  additions: number
  deletions: number
}

export interface LoopDiff {
  available: boolean
  reason?: string
  baseBranch?: string
  worktreeBranch?: string
  files?: DiffFile[]
  stats?: LoopDiffStats
}

type NotificationType = 'loop_complete' | 'loop_failed' | 'needs_input'

export interface LoopNotification {
  id: string
  projectId: string | null
  type: NotificationType
  title: string
  message: string | null
  read: number
  createdAt: number
}

interface LoopRuntime {
  processId: string | null
  active: boolean
  stopRequested: boolean
  buffer: OutputBuffer
  parser: RalphEventParser
  currentHat: string | null
  iterations: number
  notified: Set<NotificationType>
  unsubOutput: () => void
  unsubState: () => void
}

interface LoopServiceOptions {
  resolveBinary?: () => Promise<string>
  stopLoop?: (input: StopLoopInput) => Promise<void>
  now?: () => Date
  bufferLines?: number
}

type Database = BetterSQLite3Database<typeof schema>
interface StopLoopInput {
  binaryPath: string
  loopId: string
  cwd: string
}

const STOP_ATTEMPTS = 3
const STOP_WAIT_MS_PER_ATTEMPT = 700
const DEFAULT_OUTPUT_BUFFER_LINES = 500

const OUTPUT_EVENT_PREFIX = 'loop-output:'
const STATE_EVENT_PREFIX = 'loop-state:'
const NOTIFICATION_EVENT = 'notifications'
const execFile = promisify(execFileCallback)

async function stopLoopWithCli(input: StopLoopInput) {
  try {
    await execFile(input.binaryPath, ['loops', 'stop', '--loop-id', input.loopId], {
      cwd: input.cwd
    })
  } catch {
    // Backward compatibility with older Ralph CLIs that use positional id.
    await execFile(input.binaryPath, ['loops', 'stop', input.loopId], {
      cwd: input.cwd
    })
  }
}

function getErrorOutput(error: unknown) {
  if (error && typeof error === 'object' && 'stderr' in error) {
    const stderr = error.stderr
    if (typeof stderr === 'string' && stderr.trim()) {
      return stderr.trim()
    }
  }

  if (error instanceof Error) {
    return error.message
  }

  return 'Unknown error'
}

function isMissingGitRevisionError(output: string) {
  return /\b(invalid revision range|bad revision|unknown revision|bad object|ambiguous argument)\b/i.test(
    output
  )
}

function asNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const parsed = Number(value.trim())
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }

  return undefined
}

function asString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined
}

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined
  }

  const items = value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)

  return items.length > 0 ? items : undefined
}

function parseConfigRecord(config: string | null): Record<string, unknown> {
  if (!config) {
    return {}
  }

  try {
    const parsed = JSON.parse(config)
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {
    // Ignore malformed persisted config payloads.
  }

  return {}
}

function parsePersistedConfig(config: string | null) {
  const parsed = parseConfigRecord(config)
  return {
    config: asString(parsed.config),
    prompt: asString(parsed.prompt),
    promptFile: asString(parsed.promptFile),
    exclusive: Boolean(parsed.exclusive),
    worktree: asString(parsed.worktree),
    startCommit: asString(parsed.startCommit),
    endCommit: asString(parsed.endCommit),
    outputLogFile: asString(parsed.outputLogFile)
  }
}

function summarizeDiff(files: DiffFile[]): LoopDiffStats {
  return files.reduce(
    (summary, file) => ({
      filesChanged: summary.filesChanged + 1,
      additions: summary.additions + file.additions,
      deletions: summary.deletions + file.deletions
    }),
    {
      filesChanged: 0,
      additions: 0,
      deletions: 0
    } satisfies LoopDiffStats
  )
}

function buildRunArgs(options: LoopStartOptions) {
  const args = ['run', '--verbose']

  if (options.config) {
    args.push('--config', options.config)
  }

  if (options.prompt) {
    args.push(`--prompt=${options.prompt}`)
  }

  if (options.promptFile) {
    args.push('--prompt-file', options.promptFile)
  }

  if (options.exclusive) {
    args.push('--exclusive')
  }

  if (options.worktree) {
    args.push('--worktree', options.worktree)
  }

  return args
}

function quoteShellArg(value: string) {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

function buildRunCommand(binaryPath: string, options: LoopStartOptions, outputLogFile: string) {
  const runArgs = buildRunArgs(options)
  const command = [binaryPath, ...runArgs].map(quoteShellArg).join(' ')
  return `set -o pipefail; ${command} 2>&1 | tee debug.log ${quoteShellArg(outputLogFile)}`
}

function toMilliseconds(timestamp: number | null | undefined) {
  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) {
    return null
  }

  // Backward compatibility for historical second-based persisted timestamps.
  return timestamp < 1_000_000_000_000 ? timestamp * 1_000 : timestamp
}

function usesLiveRuntime(state: string) {
  return state === 'running' || state === 'queued' || state === 'merging'
}

export class LoopService {
  private readonly resolveBinary: () => Promise<string>
  private readonly stopLoopWithCli: (input: StopLoopInput) => Promise<void>
  private readonly now: () => Date
  private readonly bufferLines: number
  private readonly runtimes = new Map<string, LoopRuntime>()
  private readonly events = new EventEmitter()

  constructor(
    private readonly db: Database,
    private readonly processManager: ProcessManager,
    options: LoopServiceOptions = {}
  ) {
    this.resolveBinary = options.resolveBinary ?? (() => resolveRalphBinary())
    this.stopLoopWithCli = options.stopLoop ?? stopLoopWithCli
    this.now = options.now ?? (() => new Date())
    this.bufferLines = options.bufferLines ?? DEFAULT_OUTPUT_BUFFER_LINES
  }

  async start(projectId: string, options: LoopStartOptions = {}): Promise<LoopSummary> {
    const project = this.db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .get()

    if (!project) {
      throw new LoopServiceError('NOT_FOUND', `Project not found: ${projectId}`)
    }

    let binaryPath: string
    try {
      binaryPath = await this.resolveBinary()
    } catch (error) {
      throw new LoopServiceError(
        'BAD_REQUEST',
        error instanceof Error ? error.message : 'Unable to resolve Ralph binary'
      )
    }

    const loopId = randomUUID()
    const startCommit = await this.resolveHeadCommit(project.path)
    const promptSnapshot = await this.resolvePromptSnapshot(project.path, options)
    const outputLogFile = join('.ralph-ui', 'loop-logs', `${loopId}.log`)
    await mkdir(join(project.path, '.ralph-ui', 'loop-logs'), { recursive: true })
    const shellCommand = buildRunCommand(binaryPath, options, outputLogFile)
    const handle = await this.processManager.spawn(projectId, 'bash', ['-lc', shellCommand], {
      cwd: project.path
    })

    const nowMs = this.now().getTime()
    const configPayload = JSON.stringify({
      config: options.config ?? null,
      prompt: options.prompt ?? null,
      promptFile: options.promptFile ?? null,
      exclusive: Boolean(options.exclusive),
      worktree: options.worktree ?? null,
      startCommit,
      endCommit: null,
      outputLogFile
    })

    try {
      await this.db
        .insert(loopRuns)
        .values({
          id: loopId,
          projectId,
          state: 'running',
          config: configPayload,
          prompt: promptSnapshot,
          worktree: options.worktree ?? null,
          iterations: 0,
          tokensUsed: 0,
          errors: 0,
          startedAt: nowMs,
          endedAt: null
        })
        .run()
    } catch (error) {
      await this.processManager.kill(handle.id, 'SIGKILL')
      throw error
    }

    const runtime: LoopRuntime = {
      processId: handle.id,
      active: true,
      stopRequested: false,
      buffer: new OutputBuffer(this.bufferLines),
      parser: new RalphEventParser(),
      currentHat: null,
      iterations: 0,
      notified: new Set<NotificationType>(),
      unsubOutput: () => {},
      unsubState: () => {}
    }

    this.runtimes.set(loopId, runtime)
    runtime.unsubOutput = this.processManager.onOutput(handle.id, (chunk) => {
      void this.handleOutput(loopId, chunk)
    })
    runtime.unsubState = this.processManager.onStateChange(handle.id, (state) => {
      void this.handleState(loopId, state)
    })

    return this.get(loopId)
  }

  async stop(loopId: string): Promise<void> {
    const run = await this.requireLoop(loopId)
    const runtime = this.runtimes.get(loopId)

    if (run.state === 'stopped' && (!runtime?.active || !runtime.processId)) {
      return
    }

    if (runtime?.active && runtime.processId) {
      runtime.stopRequested = true
      const project = this.db
        .select()
        .from(projects)
        .where(eq(projects.id, run.projectId))
        .get()

      if (!project) {
        throw new LoopServiceError(
          'NOT_FOUND',
          `Project not found for loop: ${loopId}`
        )
      }

      let binaryPath: string
      try {
        binaryPath = await this.resolveBinary()
      } catch (error) {
        throw new LoopServiceError(
          'BAD_REQUEST',
          error instanceof Error ? error.message : 'Unable to resolve Ralph binary'
        )
      }

      let lastStopCliError: unknown
      for (let attempt = 0; attempt < STOP_ATTEMPTS; attempt += 1) {
        try {
          await this.stopLoopWithCli({
            binaryPath,
            loopId,
            cwd: project.path
          })
        } catch (error) {
          lastStopCliError = error
        }

        const didStop = await this.waitForRuntimeStop(
          loopId,
          STOP_WAIT_MS_PER_ATTEMPT
        )
        if (didStop) {
          return
        }
      }

      const processId = runtime.processId
      if (processId) {
        try {
          await this.processManager.kill(processId)
        } catch {
          // Ignore and rely on runtime state check below.
        }

        const didStopViaKill = await this.waitForRuntimeStop(
          loopId,
          STOP_WAIT_MS_PER_ATTEMPT * 2
        )
        if (didStopViaKill) {
          return
        }
      }

      runtime.stopRequested = false
      if (lastStopCliError instanceof Error) {
        throw new LoopServiceError(
          'BAD_REQUEST',
          `${lastStopCliError.message} (forced stop fallback did not terminate runtime)`
        )
      }

      throw new LoopServiceError(
        'BAD_REQUEST',
        `Unable to stop loop: ${loopId} (forced stop fallback did not terminate runtime)`
      )
    }

    const updates: Partial<typeof loopRuns.$inferInsert> = {
      state: 'stopped',
      endedAt: this.now().getTime()
    }
    const endCommitConfig = await this.buildEndCommitConfig(run)
    if (endCommitConfig !== undefined) {
      updates.config = endCommitConfig
    }

    await this.db.update(loopRuns).set(updates).where(eq(loopRuns.id, loopId)).run()

    this.events.emit(`${STATE_EVENT_PREFIX}${loopId}`, 'stopped')
  }

  private async waitForRuntimeStop(
    loopId: string,
    timeoutMs = 2_000,
    pollMs = 25
  ): Promise<boolean> {
    const deadline = this.now().getTime() + timeoutMs
    while (this.now().getTime() <= deadline) {
      const runtime = this.runtimes.get(loopId)
      if (!runtime?.active || !runtime.processId) {
        return true
      }

      await new Promise((resolve) => setTimeout(resolve, pollMs))
    }

    return false
  }

  async restart(loopId: string): Promise<LoopSummary> {
    const run = await this.requireLoop(loopId)
    const persistedConfig = parsePersistedConfig(run.config)
    const restartOptions: LoopStartOptions = {
      config: persistedConfig.config,
      prompt: persistedConfig.prompt,
      promptSnapshot: run.prompt ?? undefined,
      promptFile: persistedConfig.promptFile,
      exclusive: persistedConfig.exclusive,
      worktree: run.worktree ?? persistedConfig.worktree
    }

    await this.stop(loopId)
    return this.start(run.projectId, restartOptions)
  }

  async list(projectId: string): Promise<LoopSummary[]> {
    const rows = this.db
      .select()
      .from(loopRuns)
      .where(eq(loopRuns.projectId, projectId))
      .all()

    return rows
      .sort((a, b) => b.startedAt - a.startedAt)
      .map((row) => this.toSummary(row))
  }

  async get(loopId: string): Promise<LoopSummary> {
    const row = await this.requireLoop(loopId)
    return this.toSummary(row)
  }

  async getDiff(loopId: string): Promise<LoopDiff> {
    const run = await this.requireLoop(loopId)
    const project = this.db
      .select()
      .from(projects)
      .where(eq(projects.id, run.projectId))
      .get()

    if (!project) {
      throw new LoopServiceError('NOT_FOUND', `Project not found for loop: ${loopId}`)
    }

    if (run.worktree) {
      let baseBranch = 'main'
      try {
        const result = await execFile(
          'git',
          ['symbolic-ref', 'refs/remotes/origin/HEAD'],
          {
            cwd: project.path,
            encoding: 'utf8'
          }
        )
        const resolvedBranch = result.stdout
          .trim()
          .replace(/^refs\/remotes\/origin\//, '')
        if (resolvedBranch) {
          baseBranch = resolvedBranch
        }
      } catch {
        // Fall back to "main" when origin/HEAD is unavailable.
      }

      let rawDiff = ''
      try {
        const result = await execFile('git', ['diff', `${baseBranch}...${run.worktree}`, '--'], {
          cwd: project.path,
          encoding: 'utf8'
        })
        rawDiff = result.stdout
      } catch (error) {
        throw new LoopServiceError(
          'BAD_REQUEST',
          `Unable to load diff for loop: ${getErrorOutput(error)}`
        )
      }

      const files = parseDiff(rawDiff)
      return {
        available: true,
        baseBranch,
        worktreeBranch: run.worktree,
        files,
        stats: summarizeDiff(files)
      }
    }

    const persistedConfig = parsePersistedConfig(run.config)
    if (!persistedConfig.startCommit || !persistedConfig.endCommit) {
      return {
        available: false,
        reason: 'No worktree configured and commit-range metadata is unavailable for this loop.'
      }
    }

    const [hasStartCommit, hasEndCommit] = await Promise.all([
      this.commitExists(project.path, persistedConfig.startCommit),
      this.commitExists(project.path, persistedConfig.endCommit)
    ])
    if (!hasEndCommit) {
      const missing =
        !hasStartCommit
          ? 'start and end commits'
          : 'end commit'
      return {
        available: false,
        reason: `Stored commit-range metadata is no longer available in this repository (missing ${missing}).`
      }
    }

    let diffStartCommit = persistedConfig.startCommit
    if (!hasStartCommit) {
      const fallbackStartCommit = await this.resolveParentCommit(
        project.path,
        persistedConfig.endCommit
      )
      if (!fallbackStartCommit) {
        return {
          available: false,
          reason: 'Stored commit-range metadata is no longer available in this repository (missing start commit).'
        }
      }
      diffStartCommit = fallbackStartCommit
    }

    let rawDiff = ''
    try {
      const result = await execFile(
        'git',
        ['diff', `${diffStartCommit}..${persistedConfig.endCommit}`, '--'],
        {
          cwd: project.path,
          encoding: 'utf8'
        }
      )
      rawDiff = result.stdout
    } catch (error) {
      const output = getErrorOutput(error)
      if (isMissingGitRevisionError(output)) {
        return {
          available: false,
          reason: 'Stored commit-range metadata is no longer available in this repository.'
        }
      }
      throw new LoopServiceError(
        'BAD_REQUEST',
        `Unable to load commit-range diff for loop: ${output}`
      )
    }

    const files = parseDiff(rawDiff)
    return {
      available: true,
      baseBranch: diffStartCommit,
      worktreeBranch: persistedConfig.endCommit,
      files,
      stats: summarizeDiff(files)
    }
  }

  async getMetrics(loopId: string): Promise<LoopMetrics> {
    const run = await this.requireLoop(loopId)
    const project = this.db
      .select()
      .from(projects)
      .where(eq(projects.id, run.projectId))
      .get()

    if (!project) {
      throw new LoopServiceError('NOT_FOUND', `Project not found for loop: ${loopId}`)
    }

    const nowMs = this.now().getTime()
    const startedAtMs = toMilliseconds(run.startedAt) ?? nowMs
    const endedAtMs = toMilliseconds(run.endedAt)
    const effectiveEndMs =
      endedAtMs ?? (usesLiveRuntime(run.state) ? nowMs : startedAtMs)
    const metrics: LoopMetrics = {
      iterations: run.iterations,
      runtime: Math.max(0, Math.floor((effectiveEndMs - startedAtMs) / 1_000)),
      tokensUsed: run.tokensUsed,
      errors: run.errors,
      lastOutputSize: 0,
      filesChanged: []
    }

    const runtime = this.runtimes.get(loopId)
    const shouldUseLiveMetricFiles = Boolean(runtime?.active) || usesLiveRuntime(run.state)
    if (!shouldUseLiveMetricFiles) {
      return metrics
    }

    const fromDisk = await this.readMetricsDirectory(join(project.path, '.agent', 'metrics'))
    return {
      iterations: fromDisk.iterations ?? metrics.iterations,
      runtime: fromDisk.runtime ?? metrics.runtime,
      tokensUsed: fromDisk.tokensUsed ?? metrics.tokensUsed,
      errors: fromDisk.errors ?? metrics.errors,
      lastOutputSize: fromDisk.lastOutputSize ?? metrics.lastOutputSize,
      filesChanged: fromDisk.filesChanged ?? metrics.filesChanged
    }
  }

  subscribeOutput(loopId: string, cb: (chunk: OutputChunk) => void) {
    const key = `${OUTPUT_EVENT_PREFIX}${loopId}`
    this.events.on(key, cb)
    return () => this.events.off(key, cb)
  }

  subscribeState(loopId: string, cb: (state: LoopLifecycleState) => void) {
    const key = `${STATE_EVENT_PREFIX}${loopId}`
    this.events.on(key, cb)
    return () => this.events.off(key, cb)
  }

  replayOutput(loopId: string) {
    const runtime = this.runtimes.get(loopId)
    if (runtime) {
      return runtime.buffer.replay()
    }

    const run = this.db.select().from(loopRuns).where(eq(loopRuns.id, loopId)).get()
    if (!run) {
      return []
    }

    const project = this.db
      .select()
      .from(projects)
      .where(eq(projects.id, run.projectId))
      .get()
    if (!project) {
      return []
    }

    const persistedConfig = parsePersistedConfig(run.config)
    const outputLogPath = persistedConfig.outputLogFile
      ? join(project.path, persistedConfig.outputLogFile)
      : join(project.path, 'debug.log')

    return this.readOutputReplayFromDisk(outputLogPath)
  }

  async listNotifications(options: { projectId?: string; limit?: number } = {}) {
    const limit = Math.max(1, Math.min(options.limit ?? 50, 200))
    const rows = options.projectId
      ? this.db
          .select()
          .from(notifications)
          .where(eq(notifications.projectId, options.projectId))
          .orderBy(desc(notifications.createdAt))
          .limit(limit)
          .all()
      : this.db
          .select()
          .from(notifications)
          .orderBy(desc(notifications.createdAt))
          .limit(limit)
          .all()
    return rows.map((row) => this.toNotification(row))
  }

  async markNotificationRead(notificationId: string): Promise<LoopNotification> {
    const existing = this.db
      .select()
      .from(notifications)
      .where(eq(notifications.id, notificationId))
      .get()

    if (!existing) {
      throw new LoopServiceError('NOT_FOUND', `Notification not found: ${notificationId}`)
    }

    await this.db
      .update(notifications)
      .set({ read: 1 })
      .where(eq(notifications.id, notificationId))
      .run()

    return this.toNotification({ ...existing, read: 1 })
  }

  subscribeNotifications(cb: (notification: LoopNotification) => void) {
    this.events.on(NOTIFICATION_EVENT, cb)
    return () => this.events.off(NOTIFICATION_EVENT, cb)
  }

  async replayNotifications(limit = 20) {
    return this.listNotifications({ limit })
  }

  private toSummary(row: LoopRun): LoopSummary {
    const runtime = this.runtimes.get(row.id)
    return {
      id: row.id,
      projectId: row.projectId,
      processId: runtime?.active ? runtime.processId : null,
      state: row.state as LoopLifecycleState,
      config: row.config,
      prompt: row.prompt,
      worktree: row.worktree,
      iterations: Math.max(row.iterations, runtime?.iterations ?? row.iterations),
      tokensUsed: row.tokensUsed,
      errors: row.errors,
      startedAt: row.startedAt,
      endedAt: row.endedAt,
      currentHat: runtime?.currentHat ?? null
    }
  }

  private toNotification(
    row: typeof notifications.$inferSelect
  ): LoopNotification {
    return {
      id: row.id,
      projectId: row.projectId,
      type: row.type as NotificationType,
      title: row.title,
      message: row.message,
      read: row.read,
      createdAt: row.createdAt
    }
  }

  private async requireLoop(loopId: string) {
    const row = this.db.select().from(loopRuns).where(eq(loopRuns.id, loopId)).get()
    if (!row) {
      throw new LoopServiceError('NOT_FOUND', `Loop not found: ${loopId}`)
    }
    return row
  }

  private async handleOutput(loopId: string, chunk: OutputChunk) {
    const runtime = this.runtimes.get(loopId)
    if (!runtime) {
      return
    }

    runtime.buffer.append(chunk.data)
    this.events.emit(`${OUTPUT_EVENT_PREFIX}${loopId}`, chunk)

    const events = runtime.parser.parseChunk(chunk.data)
    for (const event of events) {
      await this.applyParsedEvent(loopId, runtime, event)
    }
  }

  private async handleState(loopId: string, state: ProcessState) {
    const runtime = this.runtimes.get(loopId)
    const nextState: ProcessState =
      runtime?.stopRequested && state !== 'running' ? 'stopped' : state
    const endedAt = nextState === 'running' ? null : this.now().getTime()
    const updates: Partial<typeof loopRuns.$inferInsert> = {
      state: nextState,
      endedAt
    }
    if (nextState !== 'running') {
      const run = this.db.select().from(loopRuns).where(eq(loopRuns.id, loopId)).get()
      if (run) {
        const endCommitConfig = await this.buildEndCommitConfig(run)
        if (endCommitConfig !== undefined) {
          updates.config = endCommitConfig
        }
      }
    }

    await this.db.update(loopRuns).set(updates).where(eq(loopRuns.id, loopId)).run()

    this.events.emit(`${STATE_EVENT_PREFIX}${loopId}`, nextState)
    await this.notifyForLoopState(loopId, nextState, runtime)

    if (!runtime) {
      return
    }

    runtime.unsubOutput()
    runtime.unsubState()
    runtime.active = false
    runtime.stopRequested = false
    runtime.processId = null
  }

  private async applyParsedEvent(
    loopId: string,
    runtime: LoopRuntime,
    event: RalphEvent
  ) {
    if (typeof event.payload !== 'object' || event.payload === null) {
      return
    }

    const payload = event.payload as Record<string, unknown>
    const nextIteration =
      asNumber(payload.iteration) ??
      asNumber(payload.iterations) ??
      asNumber(payload.iteration_count)
    const nextHat =
      asString(payload.sourceHat) ??
      asString(payload.currentHat) ??
      asString(payload.hat)
    const nextTokens =
      asNumber(payload.tokensUsed) ??
      asNumber(payload.tokens_used) ??
      asNumber(payload.totalTokens) ??
      asNumber(payload.total_tokens)
    const nextErrors = asNumber(payload.errors) ?? asNumber(payload.error_count)

    if (nextIteration !== undefined) {
      runtime.iterations = Math.max(runtime.iterations, Math.floor(nextIteration))
    }
    if (nextHat) {
      runtime.currentHat = nextHat
    }

    const updates: Partial<typeof loopRuns.$inferInsert> = {}
    if (nextIteration !== undefined) {
      updates.iterations = Math.max(0, Math.floor(nextIteration))
    }
    if (nextTokens !== undefined) {
      updates.tokensUsed = Math.max(0, Math.floor(nextTokens))
    }
    if (nextErrors !== undefined) {
      updates.errors = Math.max(0, Math.floor(nextErrors))
    }

    const nextState = asString(payload.state)
    if (nextState) {
      updates.state = nextState
      this.events.emit(`${STATE_EVENT_PREFIX}${loopId}`, nextState)
      await this.notifyForLoopState(loopId, nextState, runtime)
    }

    if (Object.keys(updates).length > 0) {
      await this.db.update(loopRuns).set(updates).where(eq(loopRuns.id, loopId)).run()
    }
  }

  private async readMetricsDirectory(metricsDir: string): Promise<Partial<LoopMetrics>> {
    let entries
    try {
      entries = await readdir(metricsDir, { withFileTypes: true })
    } catch {
      return {}
    }

    const metrics: Partial<LoopMetrics> = {}
    for (const entry of entries) {
      if (!entry.isFile()) {
        continue
      }

      const filePath = join(metricsDir, entry.name)
      let raw: string
      try {
        raw = (await readFile(filePath, 'utf8')).trim()
      } catch {
        continue
      }

      if (!raw) {
        continue
      }

      if (entry.name.endsWith('.json')) {
        try {
          const parsed = JSON.parse(raw)
          const fromFileName = entry.name.replace(/\.json$/i, '')
          this.applyMetricValue(metrics, fromFileName, parsed)
          continue
        } catch {
          // Fall through to plain text parsing.
        }
      }

      const baseName = entry.name.replace(/\.[^.]+$/, '')
      this.applyMetricValue(metrics, baseName, raw)
    }

    return metrics
  }

  private applyMetricValue(
    metrics: Partial<LoopMetrics>,
    key: string,
    value: unknown
  ) {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      for (const [nestedKey, nestedValue] of Object.entries(
        value as Record<string, unknown>
      )) {
        this.applyMetricValue(metrics, nestedKey, nestedValue)
      }
      return
    }

    const normalizedKey = key.toLowerCase()
    const numericValue = asNumber(value)

    if (['iterations', 'iteration', 'iteration_count'].includes(normalizedKey)) {
      if (numericValue !== undefined) {
        metrics.iterations = Math.max(0, Math.floor(numericValue))
      }
      return
    }

    if (['runtime', 'runtime_seconds'].includes(normalizedKey)) {
      if (numericValue !== undefined) {
        metrics.runtime = Math.max(0, Math.floor(numericValue))
      }
      return
    }

    if (
      ['tokens_used', 'tokensused', 'tokens', 'total_tokens', 'totaltokens'].includes(
        normalizedKey
      )
    ) {
      if (numericValue !== undefined) {
        metrics.tokensUsed = Math.max(0, Math.floor(numericValue))
      }
      return
    }

    if (['errors', 'error_count', 'errorcount'].includes(normalizedKey)) {
      if (numericValue !== undefined) {
        metrics.errors = Math.max(0, Math.floor(numericValue))
      }
      return
    }

    if (['last_output_size', 'lastoutputsize'].includes(normalizedKey)) {
      if (numericValue !== undefined) {
        metrics.lastOutputSize = Math.max(0, Math.floor(numericValue))
      }
      return
    }

    if (normalizedKey === 'files_changed') {
      const files = asStringArray(value)
      if (files) {
        metrics.filesChanged = files
      }
    }
  }

  private mapStateToNotification(
    state: string
  ): { type: NotificationType; title: string; message: string } | null {
    if (state === 'completed') {
      return {
        type: 'loop_complete',
        title: 'Loop completed',
        message: 'Loop finished successfully.'
      }
    }

    if (state === 'crashed' || state === 'failed') {
      return {
        type: 'loop_failed',
        title: 'Loop crashed',
        message: 'Loop exited with an error.'
      }
    }

    if (state === 'needs_input') {
      return {
        type: 'needs_input',
        title: 'Loop needs input',
        message: 'Loop is waiting for user input.'
      }
    }

    return null
  }

  private async notifyForLoopState(
    loopId: string,
    state: string,
    runtime?: LoopRuntime
  ) {
    const mapped = this.mapStateToNotification(state)
    if (!mapped) {
      return
    }

    if (runtime?.notified.has(mapped.type)) {
      return
    }

    const run = this.db.select().from(loopRuns).where(eq(loopRuns.id, loopId)).get()
    if (!run) {
      return
    }

    const notification: LoopNotification = {
      id: randomUUID(),
      projectId: run.projectId,
      type: mapped.type,
      title: mapped.title,
      message: mapped.message,
      read: 0,
      createdAt: this.now().getTime()
    }

    await this.db
      .insert(notifications)
      .values({
        id: notification.id,
        projectId: notification.projectId,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        read: notification.read,
        createdAt: notification.createdAt
      })
      .run()

    runtime?.notified.add(notification.type)
    this.events.emit(NOTIFICATION_EVENT, notification)
  }

  private async resolveHeadCommit(projectPath: string): Promise<string | null> {
    try {
      const result = await execFile('git', ['rev-parse', 'HEAD'], {
        cwd: projectPath,
        encoding: 'utf8'
      })
      const commit = result.stdout.trim()
      return commit.length > 0 ? commit : null
    } catch {
      return null
    }
  }

  private async resolvePromptSnapshot(
    projectPath: string,
    options: LoopStartOptions
  ): Promise<string | null> {
    if (typeof options.promptSnapshot === 'string') {
      return options.promptSnapshot
    }

    if (typeof options.prompt === 'string') {
      return options.prompt
    }

    const promptFilePath = options.promptFile ?? 'PROMPT.md'
    if (isAbsolute(promptFilePath)) {
      return null
    }

    const absolutePath = resolve(projectPath, promptFilePath)
    const relativePath = relative(projectPath, absolutePath)
    if (
      !relativePath ||
      relativePath.startsWith(`..${sep}`) ||
      relativePath === '..' ||
      isAbsolute(relativePath)
    ) {
      return null
    }

    try {
      return await readFile(absolutePath, 'utf8')
    } catch {
      return null
    }
  }

  private readOutputReplayFromDisk(filePath: string): string[] {
    const maxLines =
      Number.isFinite(this.bufferLines) && this.bufferLines > 0
        ? Math.floor(this.bufferLines)
        : 500

    try {
      const raw = readFileSync(filePath, 'utf8')
      const normalized = raw.replace(/\r\n/g, '\n')
      const lines = normalized.split('\n')

      if (lines.length > 0 && lines[lines.length - 1] === '') {
        lines.pop()
      }

      return lines.slice(Math.max(0, lines.length - maxLines))
    } catch {
      return []
    }
  }

  private async commitExists(projectPath: string, commit: string): Promise<boolean> {
    try {
      await execFile('git', ['cat-file', '-e', `${commit}^{commit}`], {
        cwd: projectPath
      })
      return true
    } catch {
      return false
    }
  }

  private async resolveParentCommit(projectPath: string, commit: string): Promise<string | null> {
    try {
      const result = await execFile('git', ['rev-parse', `${commit}^`], {
        cwd: projectPath,
        encoding: 'utf8'
      })
      const resolved = result.stdout.trim()
      return resolved.length > 0 ? resolved : null
    } catch {
      return null
    }
  }

  private async buildEndCommitConfig(run: LoopRun): Promise<string | undefined> {
    const persistedConfig = parsePersistedConfig(run.config)
    if (persistedConfig.endCommit) {
      return undefined
    }

    const project = this.db
      .select()
      .from(projects)
      .where(eq(projects.id, run.projectId))
      .get()
    if (!project) {
      return undefined
    }

    const endCommit = await this.resolveHeadCommit(project.path)
    if (!endCommit) {
      return undefined
    }

    const rawConfig = parseConfigRecord(run.config)
    return JSON.stringify({
      ...rawConfig,
      endCommit
    })
  }
}
