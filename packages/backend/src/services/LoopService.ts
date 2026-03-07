import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { execFile as execFileCallback } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { mkdir, readFile } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { promisify } from 'node:util'
import { eq } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import {
  loopRuns,
  projects,
  type LoopRun,
  schema
} from '../db/schema.js'
import { resolveRalphBinary } from '../lib/ralph.js'
import { OutputBuffer } from '../runner/OutputBuffer.js'
import {
  ProcessManager,
  type OutputChunk,
  type ProcessState
} from '../runner/ProcessManager.js'
import { RalphEventParser, type RalphEvent } from '../runner/RalphEventParser.js'
import { ServiceError, type ServiceErrorCode } from '../lib/ServiceError.js'
import {
  asPrimaryLoopId,
  asNumber,
  asRecord,
  asString,
  extractIterationCandidates,
  isLikelyActiveLoopState,
  parseConfigRecord,
  parsePersistedConfig,
  primaryLoopIdFromEventsPath,
  primaryLoopIdFromTimestamp,
  readIterationValue,
  toMilliseconds,
  uniqueLoopIds,
  usesLiveRuntime,
  type LoopBackend
} from './loopUtils.js'
import {
  LoopNotificationService,
  type LoopNotification,
  type NotificationType
} from './LoopNotificationService.js'
import { LoopDiffService, type LoopDiff, type LoopDiffStats } from './LoopDiffService.js'
import { LoopMetricsService, type LoopMetrics } from './LoopMetricsService.js'

type LoopLifecycleState =
  | ProcessState
  | 'queued'
  | 'merging'
  | 'merged'
  | 'needs-review'
  | 'orphan'

export class LoopServiceError extends ServiceError {
  constructor(code: ServiceErrorCode, message: string) {
    super(code, message)
    this.name = 'LoopServiceError'
  }
}

export interface LoopStartOptions {
  config?: string
  prompt?: string
  promptSnapshot?: string
  promptFile?: string
  backend?: LoopBackend
  exclusive?: boolean
  worktree?: string
}

export interface LoopSummary {
  id: string
  projectId: string
  ralphLoopId: string | null
  processId: string | null
  processPid: number | null
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

export interface LoopOutputSnapshot {
  summary: string
  lines: string[]
  link: string
}

interface LoopRuntime {
  processId: string | null
  processPid: number | null
  active: boolean
  stopRequested: boolean
  ralphLoopId: string | null
  outputRemainder: string
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
const PROJECT_RECONCILE_MIN_INTERVAL_MS = 2_000
const DEFAULT_OUTPUT_BUFFER_LINES = 500

const OUTPUT_EVENT_PREFIX = 'loop-output:'
const STATE_EVENT_PREFIX = 'loop-state:'
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

function getErrorOutput(error: unknown): string {
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

function isLoopUnavailableError(error: unknown): boolean {
  const output = getErrorOutput(error)
    .toLowerCase()
    .replace(/\s+/g, ' ')
  return (
    (output.includes('loop') && output.includes('not found')) ||
    output.includes('not running') ||
    output.includes('no such loop') ||
    output.includes('no active loop') ||
    output.includes('unable to find loop') ||
    output.includes('cannot find loop')
  )
}

function buildRunArgs(options: LoopStartOptions): string[] {
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

  if (options.backend) {
    args.push('--backend', options.backend)
  }

  if (options.exclusive) {
    args.push('--exclusive')
  }

  return args
}

function quoteShellArg(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

function buildRunCommand(
  binaryPath: string,
  options: LoopStartOptions,
  outputLogFile: string
): string {
  const runArgs = buildRunArgs(options)
  const command = [binaryPath, ...runArgs].map(quoteShellArg).join(' ')
  return `set -o pipefail; ${command} 2>&1 | tee debug.log ${quoteShellArg(outputLogFile)}`
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export class LoopService {
  private readonly resolveBinary: () => Promise<string>
  private readonly stopLoopWithCli: (input: StopLoopInput) => Promise<void>
  private readonly now: () => Date
  private readonly bufferLines: number
  private readonly runtimes = new Map<string, LoopRuntime>()
  private readonly events = new EventEmitter()
  private readonly reconcileInFlightByProject = new Map<string, Promise<number>>()
  private readonly lastReconcileAtByProject = new Map<string, number>()
  private readonly notificationService: LoopNotificationService
  private readonly diffService: LoopDiffService
  private readonly metricsService: LoopMetricsService

  constructor(
    private readonly db: Database,
    private readonly processManager: ProcessManager,
    options: LoopServiceOptions = {}
  ) {
    this.resolveBinary = options.resolveBinary ?? (() => resolveRalphBinary())
    this.stopLoopWithCli = options.stopLoop ?? stopLoopWithCli
    this.now = options.now ?? (() => new Date())
    this.bufferLines = options.bufferLines ?? DEFAULT_OUTPUT_BUFFER_LINES
    this.notificationService = new LoopNotificationService(db, this.events, this.now)
    this.diffService = new LoopDiffService(db)
    this.metricsService = new LoopMetricsService(db, this.now)
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

    let runCwd = project.path
    if (options.worktree) {
      const resolvedWorktreePath = await this.diffService.resolveWorktreePath(
        project.path,
        options.worktree
      )
      if (!resolvedWorktreePath) {
        throw new LoopServiceError('BAD_REQUEST', `Worktree not found: ${options.worktree}`)
      }
      runCwd = resolvedWorktreePath
    }

    const existingLoopIds = await this.listRalphLoopIds(binaryPath, runCwd)
    const markerBefore = await this.readCurrentLoopId(runCwd)
    const currentEventsBefore = await this.readCurrentEventsLoopId(runCwd)

    const loopId = randomUUID()
    const startCommit = await this.resolveHeadCommit(runCwd)
    const promptSnapshot = await this.resolvePromptSnapshot(runCwd, options)
    const outputLogFile = join('.ralph-ui', 'loop-logs', `${loopId}.log`)
    await mkdir(join(project.path, '.ralph-ui', 'loop-logs'), { recursive: true })
    const outputLogPath = join(project.path, outputLogFile)
    const shellCommand = buildRunCommand(binaryPath, options, outputLogPath)
    const handle = await this.processManager.spawn(projectId, 'bash', ['-lc', shellCommand], {
      cwd: runCwd
    })

    const markerAfter = await this.readCurrentLoopId(runCwd)
    const currentEventsAfter = await this.readCurrentEventsLoopId(runCwd)
    const initialRalphLoopId =
      (currentEventsAfter && currentEventsAfter !== currentEventsBefore
        ? currentEventsAfter
        : null) ??
      (markerAfter && markerAfter !== markerBefore ? markerAfter : null)

    const nowMs = this.now().getTime()
    const configPayload = JSON.stringify({
      config: options.config ?? null,
      prompt: options.prompt ?? null,
      promptFile: options.promptFile ?? null,
      backend: options.backend ?? null,
      exclusive: Boolean(options.exclusive),
      worktree: options.worktree ?? null,
      ralphLoopId: initialRalphLoopId,
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
          ralphLoopId: initialRalphLoopId,
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
      processPid: handle.pid > 0 ? handle.pid : null,
      active: true,
      stopRequested: false,
      ralphLoopId: initialRalphLoopId,
      outputRemainder: '',
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
      void this.handleOutput(loopId, chunk).catch((error) => {
        this.handleBackgroundError(loopId, error)
      })
    })
    runtime.unsubState = this.processManager.onStateChange(handle.id, (state) => {
      void this.handleState(loopId, state).catch((error) => {
        this.handleBackgroundError(loopId, error)
      })
    })

    if (!initialRalphLoopId) {
      void this.bootstrapRalphLoopId(loopId, {
        binaryPath,
        cwd: runCwd,
        existingLoopIds,
        markerBefore,
        currentEventsBefore
      })
    }

    return this.get(loopId)
  }

  private handleBackgroundError(loopId: string, error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('database connection is not open')) {
      return
    }

    console.error(`[LoopService] background handler failed for loop ${loopId}`, error)
  }

  async stop(loopId: string): Promise<void> {
    const run = await this.requireLoop(loopId)
    const resolvedLoopId = run.id
    const runtime = this.runtimes.get(resolvedLoopId)
    const persistedConfig = parsePersistedConfig(run.config)
    const stopLoopIds = uniqueLoopIds([
      runtime?.ralphLoopId ?? undefined,
      run.ralphLoopId ?? undefined,
      persistedConfig.ralphLoopId,
      resolvedLoopId,
      loopId,
      asPrimaryLoopId(loopId),
      primaryLoopIdFromTimestamp(run.startedAt)
    ])

    if (run.state === 'stopped' && (!runtime?.active || !runtime.processId)) {
      return
    }

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

    if (runtime?.active && runtime.processId) {
      runtime.stopRequested = true

      let lastStopCliError: unknown
      let binaryPath: string | null = null
      try {
        binaryPath = await this.resolveBinary()
      } catch (error) {
        lastStopCliError = error
      }

      if (binaryPath) {
        for (let attempt = 0; attempt < STOP_ATTEMPTS; attempt += 1) {
          const stopResult = await this.tryStopLoopViaCli({
            binaryPath,
            cwd: project.path,
            loopIds: stopLoopIds
          })
          if (stopResult.ok) {
            const didStop = await this.waitForRuntimeStop(
              resolvedLoopId,
              STOP_WAIT_MS_PER_ATTEMPT
            )
            if (didStop) {
              return
            }
          } else {
            lastStopCliError = stopResult.lastError
          }
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
          resolvedLoopId,
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

    if (run.state !== 'stopped') {
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
      let didRequestStop = false
      for (let attempt = 0; attempt < STOP_ATTEMPTS; attempt += 1) {
        const stopResult = await this.tryStopLoopViaCli({
          binaryPath,
          cwd: project.path,
          loopIds: stopLoopIds
        })
        if (stopResult.ok) {
          didRequestStop = true
          break
        }
        lastStopCliError = stopResult.lastError
      }

      if (!didRequestStop) {
        if (isLoopUnavailableError(lastStopCliError)) {
          // Runtime tracking is unavailable and CLI confirms the loop is already gone.
          // Treat this as a stale-state reconciliation and continue with DB stop update.
          didRequestStop = true
        }
      }

      if (!didRequestStop) {
        if (lastStopCliError instanceof Error) {
          throw new LoopServiceError(
            'BAD_REQUEST',
            `${lastStopCliError.message} (unable to stop runtime because process tracking was unavailable)`
          )
        }
        throw new LoopServiceError(
          'BAD_REQUEST',
          `Unable to stop loop: ${loopId} (process tracking was unavailable)`
        )
      }
    }

    const updates: Partial<typeof loopRuns.$inferInsert> = {
      state: 'stopped',
      endedAt: this.now().getTime()
    }
    const endCommitConfig = await this.buildEndCommitConfig(run)
    if (endCommitConfig !== undefined) {
      updates.config = endCommitConfig
    }

    await this.db.update(loopRuns).set(updates).where(eq(loopRuns.id, resolvedLoopId)).run()

    this.events.emit(`${STATE_EVENT_PREFIX}${resolvedLoopId}`, 'stopped')
  }

  private async tryStopLoopViaCli(input: {
    binaryPath: string
    cwd: string
    loopIds: string[]
  }): Promise<{ ok: boolean; lastError: unknown }> {
    let lastError: unknown
    for (const candidateLoopId of input.loopIds) {
      try {
        await this.stopLoopWithCli({
          binaryPath: input.binaryPath,
          loopId: candidateLoopId,
          cwd: input.cwd
        })
        return { ok: true, lastError: null }
      } catch (error) {
        lastError = error
      }
    }

    return { ok: false, lastError }
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
      backend: persistedConfig.backend,
      exclusive: persistedConfig.exclusive,
      worktree: run.worktree ?? persistedConfig.worktree
    }

    await this.stop(loopId)
    return this.start(run.projectId, restartOptions)
  }

  async list(projectId: string): Promise<LoopSummary[]> {
    await this.reconcileProjectLoops(projectId)

    const rows = this.db
      .select()
      .from(loopRuns)
      .where(eq(loopRuns.projectId, projectId))
      .all()

    return rows
      .sort((a, b) => b.startedAt - a.startedAt)
      .map((row) => this.toSummary(row))
  }

  async reconcileProjectLoops(
    projectId: string,
    options: { minIntervalMs?: number } = {}
  ): Promise<number> {
    const minIntervalMs = Math.max(
      0,
      options.minIntervalMs ?? PROJECT_RECONCILE_MIN_INTERVAL_MS
    )
    const nowMs = this.now().getTime()
    const lastReconcileAt = this.lastReconcileAtByProject.get(projectId) ?? 0
    if (nowMs - lastReconcileAt < minIntervalMs) {
      return 0
    }

    const existing = this.reconcileInFlightByProject.get(projectId)
    if (existing) {
      return existing
    }

    const reconcilePromise = this.reconcileProjectLoopsInternal(projectId)
      .catch(() => 0)
      .finally(() => {
        this.reconcileInFlightByProject.delete(projectId)
        this.lastReconcileAtByProject.set(projectId, this.now().getTime())
      })

    this.reconcileInFlightByProject.set(projectId, reconcilePromise)
    return reconcilePromise
  }

  async get(loopId: string): Promise<LoopSummary> {
    const row = await this.requireLoop(loopId)
    return this.toSummary(row)
  }

  async getOutput(input: { loopId: string; limit?: number }): Promise<LoopOutputSnapshot> {
    const run = await this.requireLoop(input.loopId)
    const maxLines = Math.max(1, Math.min(input.limit ?? 50, 500))
    const lines = this.replayOutput(input.loopId).slice(-maxLines)
    const lineLabel = lines.length === 1 ? 'line' : 'lines'

    return {
      summary: `Showing ${lines.length} recent ${lineLabel} for loop ${input.loopId} (${run.state})`,
      lines,
      link: `/project/${run.projectId}/loops?loopId=${run.id}`
    }
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

    return this.diffService.getDiff(run, project)
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

    const runtime = this.runtimes.get(loopId)
    const runtimeData = runtime
      ? { active: runtime.active, iterations: runtime.iterations }
      : undefined

    return this.metricsService.getMetrics(run, project, runtimeData)
  }

  async listNotifications(options: { projectId?: string; limit?: number } = {}) {
    return this.notificationService.list(options)
  }

  async markNotificationRead(notificationId: string): Promise<LoopNotification> {
    return this.notificationService.markRead(notificationId)
  }

  subscribeNotifications(cb: (notification: LoopNotification) => void) {
    return this.notificationService.subscribe(cb)
  }

  async replayNotifications(limit = 20) {
    return this.notificationService.replay(limit)
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

  replayOutput(loopId: string): string[] {
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

  private toSummary(row: LoopRun): LoopSummary {
    const runtime = this.runtimes.get(row.id)
    const persistedConfig = parsePersistedConfig(row.config)
    const canonicalRalphLoopId =
      asPrimaryLoopId(runtime?.ralphLoopId) ??
      asPrimaryLoopId(row.ralphLoopId) ??
      asPrimaryLoopId(persistedConfig.ralphLoopId) ??
      primaryLoopIdFromTimestamp(row.startedAt) ??
      null
    return {
      id: row.id,
      projectId: row.projectId,
      ralphLoopId: canonicalRalphLoopId,
      processId: runtime?.active ? runtime.processId : null,
      processPid: runtime?.active ? runtime.processPid : null,
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

  private async requireLoop(loopId: string): Promise<LoopRun> {
    const row = this.db.select().from(loopRuns).where(eq(loopRuns.id, loopId)).get()
    if (row) {
      return row
    }

    const primaryLoopId = asPrimaryLoopId(loopId)
    if (!primaryLoopId) {
      throw new LoopServiceError('NOT_FOUND', `Loop not found: ${loopId}`)
    }

    const ralphLoopRows = this.db
      .select()
      .from(loopRuns)
      .where(eq(loopRuns.ralphLoopId, primaryLoopId))
      .all()
      .sort((a, b) => {
        const stateScoreDiff =
          Number(isLikelyActiveLoopState(b.state)) - Number(isLikelyActiveLoopState(a.state))
        if (stateScoreDiff !== 0) {
          return stateScoreDiff
        }

        return b.startedAt - a.startedAt
      })

    if (ralphLoopRows.length > 0) {
      return ralphLoopRows[0] as LoopRun
    }

    const candidates = this.db.select().from(loopRuns).all()
    const inferred = candidates
      .filter((candidate) => {
        const persisted = parsePersistedConfig(candidate.config)
        return (
          asPrimaryLoopId(persisted.ralphLoopId) === primaryLoopId ||
          primaryLoopIdFromTimestamp(candidate.startedAt) === primaryLoopId
        )
      })
      .sort((a, b) => {
        const stateScoreDiff =
          Number(isLikelyActiveLoopState(b.state)) - Number(isLikelyActiveLoopState(a.state))
        if (stateScoreDiff !== 0) {
          return stateScoreDiff
        }

        return b.startedAt - a.startedAt
      })

    if (inferred.length > 0) {
      return inferred[0] as LoopRun
    }

    throw new LoopServiceError('NOT_FOUND', `Loop not found: ${loopId}`)
  }

  private async handleOutput(loopId: string, chunk: OutputChunk) {
    const runtime = this.runtimes.get(loopId)
    if (!runtime) {
      return
    }

    runtime.buffer.append(chunk.data)
    this.events.emit(`${OUTPUT_EVENT_PREFIX}${loopId}`, chunk)
    await this.applyOutputDerivedIteration(loopId, runtime, chunk.data)

    const events = runtime.parser.parseChunk(chunk.data)
    for (const event of events) {
      await this.applyParsedEvent(loopId, runtime, event)
    }
  }

  private async applyOutputDerivedIteration(
    loopId: string,
    runtime: LoopRuntime,
    chunkData: string,
    emitState = true
  ) {
    const combined = `${runtime.outputRemainder}${chunkData.replace(/\r\n/g, '\n')}`
    const lines = combined.split('\n')
    runtime.outputRemainder = lines.pop() ?? ''

    let nextIteration = runtime.iterations
    for (const line of lines) {
      const candidates = extractIterationCandidates(line)
      for (const candidate of candidates) {
        nextIteration = Math.max(nextIteration, candidate)
      }
    }

    if (nextIteration <= runtime.iterations) {
      return
    }

    runtime.iterations = nextIteration
    await this.db
      .update(loopRuns)
      .set({ iterations: runtime.iterations })
      .where(eq(loopRuns.id, loopId))
      .run()

    if (emitState) {
      this.events.emit(`${STATE_EVENT_PREFIX}${loopId}`, 'running')
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

        // Snapshot the latest persisted/live metrics before terminalizing the run,
        // so loop cards keep the final token count after completion.
        try {
          const project = this.db
            .select()
            .from(projects)
            .where(eq(projects.id, run.projectId))
            .get()

          const runtimeData = runtime
            ? { active: runtime.active, iterations: runtime.iterations }
            : undefined
          const finalMetrics = project
            ? await this.metricsService.getMetrics(run, project, runtimeData)
            : null
          const tokensFromOutputLog = project
            ? await this.metricsService.readTokensFromLoopOutputLog(project.path, run.config)
            : undefined
          const tokensFromEvents = project
            ? await this.metricsService.readTokensFromLoopEvents(project.path, run)
            : undefined
          const nextIterations = Math.max(
            run.iterations,
            runtime?.iterations ?? run.iterations,
            finalMetrics?.iterations ?? 0
          )
          const nextTokensUsed = Math.max(
            run.tokensUsed,
            finalMetrics?.tokensUsed ?? 0,
            tokensFromOutputLog ?? 0,
            tokensFromEvents ?? 0
          )
          const nextErrors = Math.max(run.errors, finalMetrics?.errors ?? 0)

          if (nextIterations > run.iterations) {
            updates.iterations = nextIterations
          }
          if (nextTokensUsed > run.tokensUsed) {
            updates.tokensUsed = nextTokensUsed
          }
          if (nextErrors > run.errors) {
            updates.errors = nextErrors
          }
        } catch {
          // Best effort: state transition should not fail if final metric snapshot fails.
        }
      }
    }

    await this.db.update(loopRuns).set(updates).where(eq(loopRuns.id, loopId)).run()

    this.events.emit(`${STATE_EVENT_PREFIX}${loopId}`, nextState)
    await this.notificationService.notifyForLoopState(loopId, nextState, runtime?.notified)

    if (!runtime) {
      return
    }

    if (nextState !== 'running' && runtime.outputRemainder.trim().length > 0) {
      await this.applyOutputDerivedIteration(loopId, runtime, '\n', false)
    }

    runtime.unsubOutput()
    runtime.unsubState()
    runtime.active = false
    runtime.stopRequested = false
    runtime.processId = null
    runtime.processPid = null
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
    const payloadMetrics = asRecord(payload.metrics)
    const nextIteration =
      readIterationValue(payload) ??
      (payloadMetrics ? readIterationValue(payloadMetrics) : undefined)
    const nextHat =
      asString(payload.sourceHat) ??
      asString(payload.currentHat) ??
      asString(payload.hat)
    const nextTokens =
      asNumber(payload.tokensUsed) ??
      asNumber(payload.tokens_used) ??
      asNumber(payload.totalTokens) ??
      asNumber(payload.total_tokens) ??
      (payloadMetrics
        ? asNumber(payloadMetrics.tokensUsed) ??
          asNumber(payloadMetrics.tokens_used) ??
          asNumber(payloadMetrics.totalTokens) ??
          asNumber(payloadMetrics.total_tokens)
        : undefined)
    const nextErrors =
      asNumber(payload.errors) ??
      asNumber(payload.error_count) ??
      (payloadMetrics
        ? asNumber(payloadMetrics.errors) ?? asNumber(payloadMetrics.error_count)
        : undefined)
    const nextRalphLoopId =
      asPrimaryLoopId(payload.loop_id) ??
      asPrimaryLoopId(payload.loopId) ??
      undefined

    if (nextIteration !== undefined) {
      runtime.iterations = Math.max(runtime.iterations, Math.floor(nextIteration))
    }
    if (nextHat) {
      runtime.currentHat = nextHat
    }
    if (nextRalphLoopId && runtime.ralphLoopId !== nextRalphLoopId) {
      runtime.ralphLoopId = nextRalphLoopId
      await this.persistRalphLoopId(loopId, nextRalphLoopId)
    }

    const updates: Partial<typeof loopRuns.$inferInsert> = {}
    if (nextIteration !== undefined) {
      updates.iterations = Math.max(0, runtime.iterations)
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
      await this.notificationService.notifyForLoopState(loopId, nextState, runtime.notified)
    }

    if (Object.keys(updates).length > 0) {
      await this.db.update(loopRuns).set(updates).where(eq(loopRuns.id, loopId)).run()
    }
  }

  private async persistRalphLoopId(loopId: string, ralphLoopId: string) {
    const run = this.db
      .select({
        config: loopRuns.config,
        ralphLoopId: loopRuns.ralphLoopId
      })
      .from(loopRuns)
      .where(eq(loopRuns.id, loopId))
      .get()
    if (!run) {
      return
    }

    const config = parseConfigRecord(run.config)
    const persistedConfigLoopId = asString(config.ralphLoopId)
    if (run.ralphLoopId === ralphLoopId && persistedConfigLoopId === ralphLoopId) {
      return
    }

    await this.db
      .update(loopRuns)
      .set({
        ralphLoopId,
        config: JSON.stringify({
          ...config,
          ralphLoopId
        })
      })
      .where(eq(loopRuns.id, loopId))
      .run()
  }

  private async reconcileProjectLoopsInternal(projectId: string): Promise<number> {
    const runs = this.db
      .select()
      .from(loopRuns)
      .where(eq(loopRuns.projectId, projectId))
      .all()
    const activeRuns = runs.filter((run) => usesLiveRuntime(run.state))
    if (activeRuns.length === 0) {
      return 0
    }

    const activeRunsWithoutRuntime = activeRuns.filter((run) => {
      const runtime = this.runtimes.get(run.id)
      return !(runtime?.active && runtime.processId)
    })
    if (activeRunsWithoutRuntime.length === 0) {
      return 0
    }

    const project = this.db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .get()
    if (!project) {
      return 0
    }

    let binaryPath: string
    try {
      binaryPath = await this.resolveBinary()
    } catch {
      return 0
    }

    const listed = await this.listRalphLoopIdsWithStatus(binaryPath, project.path)
    if (!listed.ok) {
      return 0
    }

    const nowMs = this.now().getTime()
    let reconciled = 0
    for (const run of activeRunsWithoutRuntime) {
      const persistedConfig = parsePersistedConfig(run.config)
      const explicitRalphLoopId =
        asPrimaryLoopId(run.ralphLoopId) ??
        asPrimaryLoopId(persistedConfig.ralphLoopId) ??
        null
      if (!explicitRalphLoopId) {
        continue
      }

      if (listed.ids.has(explicitRalphLoopId)) {
        continue
      }

      await this.db
        .update(loopRuns)
        .set({
          state: 'stopped',
          endedAt: run.endedAt ?? nowMs
        })
        .where(eq(loopRuns.id, run.id))
        .run()

      this.events.emit(`${STATE_EVENT_PREFIX}${run.id}`, 'stopped')
      reconciled += 1
    }

    return reconciled
  }

  private async readCurrentLoopId(projectPath: string): Promise<string | null> {
    try {
      const marker = await readFile(join(projectPath, '.ralph', 'current-loop-id'), 'utf8')
      const normalized = asPrimaryLoopId(marker.trim())
      return normalized ?? null
    } catch {
      return null
    }
  }

  private async readCurrentEventsLoopId(projectPath: string): Promise<string | null> {
    try {
      const marker = await readFile(join(projectPath, '.ralph', 'current-events'), 'utf8')
      const normalized = primaryLoopIdFromEventsPath(marker)
      return normalized ?? null
    } catch {
      return null
    }
  }

  private async listRalphLoopIdsWithStatus(
    binaryPath: string,
    cwd: string
  ): Promise<{ ok: boolean; ids: Set<string> }> {
    try {
      const result = await execFile(binaryPath, ['loops', 'list', '--json'], {
        cwd,
        encoding: 'utf8'
      })
      const parsed: unknown = JSON.parse(result.stdout)
      if (!Array.isArray(parsed)) {
        return { ok: true, ids: new Set() }
      }

      const ids = parsed
        .flatMap((entry) => {
          if (!entry || typeof entry !== 'object') {
            return []
          }

          const row = entry as Record<string, unknown>
          return [
            asPrimaryLoopId(row.loop_id),
            asPrimaryLoopId(row.loopId),
            asPrimaryLoopId(row.id)
          ]
        })
        .filter((id): id is string => typeof id === 'string')

      return { ok: true, ids: new Set(ids) }
    } catch {
      return { ok: false, ids: new Set() }
    }
  }

  private async listRalphLoopIds(binaryPath: string, cwd: string): Promise<Set<string>> {
    const listed = await this.listRalphLoopIdsWithStatus(binaryPath, cwd)
    return listed.ids
  }

  private async bootstrapRalphLoopId(
    loopId: string,
    input: {
      binaryPath: string
      cwd: string
      existingLoopIds: Set<string>
      markerBefore: string | null
      currentEventsBefore: string | null
    }
  ) {
    for (let attempt = 0; attempt < 15; attempt += 1) {
      const runtime = this.runtimes.get(loopId)
      if (!runtime?.active || runtime.ralphLoopId) {
        return
      }

      const currentEventsLoopId = await this.readCurrentEventsLoopId(input.cwd)
      if (currentEventsLoopId && currentEventsLoopId !== input.currentEventsBefore) {
        runtime.ralphLoopId = currentEventsLoopId
        await this.persistRalphLoopId(loopId, currentEventsLoopId)
        return
      }

      const markerLoopId = await this.readCurrentLoopId(input.cwd)
      if (markerLoopId && markerLoopId !== input.markerBefore) {
        runtime.ralphLoopId = markerLoopId
        await this.persistRalphLoopId(loopId, markerLoopId)
        return
      }

      const listedLoopIds = await this.listRalphLoopIds(input.binaryPath, input.cwd)
      const newLoopIds = [...listedLoopIds].filter(
        (candidate) => !input.existingLoopIds.has(candidate) && candidate !== '(primary)'
      )
      if (newLoopIds.length === 1) {
        const detectedLoopId = newLoopIds[0]
        runtime.ralphLoopId = detectedLoopId
        await this.persistRalphLoopId(loopId, detectedLoopId)
        return
      }

      await delay(200)
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
}

// Re-export types from sub-services for backwards compatibility.
export type { LoopNotification } from './LoopNotificationService.js'
export type { LoopDiff, LoopDiffStats } from './LoopDiffService.js'
export type { LoopMetrics } from './LoopMetricsService.js'
