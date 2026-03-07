import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { constants } from 'node:fs'
import { access, chmod, stat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { eq } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import * as pty from 'node-pty'
import { projects, schema } from '../db/schema.js'

type ServiceErrorCode = 'BAD_REQUEST' | 'NOT_FOUND' | 'CONFLICT'
type TerminalSessionState = 'active' | 'completed'

type Database = BetterSQLite3Database<typeof schema>

const OUTPUT_EVENT_PREFIX = 'terminal-output:'
const STATE_EVENT_PREFIX = 'terminal-state:'
const MIN_COLS = 20
const MAX_COLS = 400
const MIN_ROWS = 8
const MAX_ROWS = 200
const require = createRequire(import.meta.url)

export interface TerminalSessionSummary {
  id: string
  projectId: string
  state: TerminalSessionState
  shell: string
  cwd: string
  pid: number
  cols: number
  rows: number
  createdAt: number
  endedAt: number | null
}

export interface TerminalOutputChunk {
  data: string
  timestamp: Date
}

interface TerminalRuntime {
  session: TerminalSessionSummary
  pty: pty.IPty
  outputBuffer: string[]
}

export class TerminalServiceError extends Error {
  code: ServiceErrorCode

  constructor(code: ServiceErrorCode, message: string) {
    super(message)
    this.name = 'TerminalServiceError'
    this.code = code
  }
}

interface TerminalServiceOptions {
  now?: () => Date
  replayBufferChunks?: number
  logger?: TerminalLogger
}

interface TerminalLogger {
  debug: (context: Record<string, unknown>, message: string) => void
  info: (context: Record<string, unknown>, message: string) => void
  error: (context: Record<string, unknown>, message: string) => void
}

const NOOP_LOGGER: TerminalLogger = {
  debug: () => { },
  info: () => { },
  error: () => { }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function normalizeCols(value: number | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 120
  }
  return clamp(Math.floor(value), MIN_COLS, MAX_COLS)
}

function normalizeRows(value: number | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 36
  }
  return clamp(Math.floor(value), MIN_ROWS, MAX_ROWS)
}

export class TerminalService {
  private readonly now: () => Date
  private readonly replayBufferChunks: number
  private readonly logger: TerminalLogger
  private readonly events = new EventEmitter()
  private readonly runtimes = new Map<string, TerminalRuntime>()
  private readonly sessionsByProjectId = new Map<string, Set<string>>()
  private helperPermissionsEnsured = false

  constructor(private readonly db: Database, options: TerminalServiceOptions = {}) {
    this.now = options.now ?? (() => new Date())
    this.replayBufferChunks = options.replayBufferChunks ?? 500
    this.logger = options.logger ?? NOOP_LOGGER
  }

  private async resolveShellCommand() {
    if (process.platform === 'win32') {
      return process.env.COMSPEC || 'cmd.exe'
    }

    const candidates = [
      process.env.SHELL,
      '/bin/zsh',
      '/bin/bash',
      '/bin/sh'
    ].filter((value): value is string => Boolean(value && value.trim()))

    for (const candidate of candidates) {
      try {
        await access(candidate, constants.X_OK)
        return candidate
      } catch {
        // Try the next shell candidate.
      }
    }

    throw new TerminalServiceError(
      'BAD_REQUEST',
      `No executable shell found. Tried: ${candidates.join(', ')}`
    )
  }

  private async validateSessionCwd(projectPath: string) {
    const cwd = resolve(projectPath)
    let stats
    try {
      stats = await stat(cwd)
    } catch {
      throw new TerminalServiceError(
        'BAD_REQUEST',
        `Project directory does not exist: ${cwd}`
      )
    }

    if (!stats.isDirectory()) {
      throw new TerminalServiceError(
        'BAD_REQUEST',
        `Project path is not a directory: ${cwd}`
      )
    }

    try {
      await access(cwd, constants.R_OK | constants.X_OK)
    } catch {
      throw new TerminalServiceError(
        'BAD_REQUEST',
        `Project directory is not accessible: ${cwd}`
      )
    }

    return cwd
  }

  private async ensureNodePtyHelperExecutable() {
    if (this.helperPermissionsEnsured || process.platform === 'win32') {
      return
    }

    const packageJsonPath = require.resolve('node-pty/package.json')
    const packageRoot = dirname(packageJsonPath)
    const helperCandidates = [
      join(
        packageRoot,
        'prebuilds',
        `${process.platform}-${process.arch}`,
        'spawn-helper'
      ),
      join(packageRoot, 'build', 'Release', 'spawn-helper'),
      join(packageRoot, 'build', 'Debug', 'spawn-helper')
    ]

    let foundAnyHelper = false
    for (const helperPath of helperCandidates) {
      try {
        const helperStats = await stat(helperPath)
        if (!helperStats.isFile()) {
          continue
        }
        foundAnyHelper = true
      } catch {
        continue
      }

      try {
        await access(helperPath, constants.X_OK)
        continue
      } catch {
        // Continue and try to make it executable.
      }

      try {
        await chmod(helperPath, 0o755)
        await access(helperPath, constants.X_OK)
        this.logger.info(
          {
            helperPath
          },
          '[TerminalService] Fixed execute permissions for node-pty spawn-helper'
        )
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        throw new TerminalServiceError(
          'BAD_REQUEST',
          `node-pty helper is not executable: ${helperPath} (${reason})`
        )
      }
    }

    if (!foundAnyHelper) {
      this.logger.debug(
        {},
        '[TerminalService] No node-pty spawn-helper binary found to permission-fix'
      )
    }

    this.helperPermissionsEnsured = true
  }

  async startSession(input: {
    projectId: string
    cols?: number
    rows?: number
    initialCommand?: string
  }): Promise<TerminalSessionSummary> {
    const project = this.db
      .select()
      .from(projects)
      .where(eq(projects.id, input.projectId))
      .get()

    if (!project) {
      throw new TerminalServiceError('NOT_FOUND', `Project not found: ${input.projectId}`)
    }

    // We now allow multiple sessions per project.

    const cols = normalizeCols(input.cols)
    const rows = normalizeRows(input.rows)
    const shell = await this.resolveShellCommand()
    const cwd = await this.validateSessionCwd(project.path)
    await this.ensureNodePtyHelperExecutable()
    const nowMs = this.now().getTime()
    const sessionId = randomUUID()
    const env: Record<string, string> = {}
    for (const [key, value] of Object.entries(process.env)) {
      if (typeof value === 'string') {
        env[key] = value
      }
    }
    env.TERM = 'xterm-256color'

    let terminal: pty.IPty
    try {
      terminal = pty.spawn(shell, [], {
        name: 'xterm-256color',
        cols,
        rows,
        cwd,
        env
      })
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown error'
      throw new TerminalServiceError(
        'BAD_REQUEST',
        `Unable to start terminal session (shell: ${shell}, cwd: ${cwd}): ${reason}`
      )
    }

    const summary: TerminalSessionSummary = {
      id: sessionId,
      projectId: input.projectId,
      state: 'active',
      shell,
      cwd,
      pid: terminal.pid,
      cols,
      rows,
      createdAt: nowMs,
      endedAt: null
    }

    const runtime: TerminalRuntime = {
      session: summary,
      pty: terminal,
      outputBuffer: []
    }

    terminal.onData((data) => {
      this.pushReplayChunk(runtime, data)
      this.events.emit(`${OUTPUT_EVENT_PREFIX}${sessionId}`, {
        data,
        timestamp: this.now()
      } satisfies TerminalOutputChunk)
    })

    terminal.onExit(({ exitCode, signal }) => {
      this.completeSession(sessionId, {
        exitCode,
        signal,
        source: 'exit'
      })
    })

    this.runtimes.set(sessionId, runtime)
    let projectSessions = this.sessionsByProjectId.get(input.projectId)
    if (!projectSessions) {
      projectSessions = new Set()
      this.sessionsByProjectId.set(input.projectId, projectSessions)
    }
    projectSessions.add(sessionId)
    this.events.emit(`${STATE_EVENT_PREFIX}${sessionId}`, 'active' satisfies TerminalSessionState)

    const initialCommand = input.initialCommand?.trim()
    if (initialCommand) {
      terminal.write(`${initialCommand}\r`)
    }

    this.logger.info(
      {
        projectId: input.projectId,
        sessionId,
        pid: terminal.pid,
        cols,
        rows
      },
      '[TerminalService] Session started'
    )

    return { ...summary }
  }

  async getProjectSessions(projectId: string): Promise<TerminalSessionSummary[]> {
    const sessionIds = this.sessionsByProjectId.get(projectId)
    if (!sessionIds) {
      return []
    }

    const summaries: TerminalSessionSummary[] = []
    for (const sessionId of sessionIds) {
      const runtime = this.runtimes.get(sessionId)
      if (runtime && runtime.session.state === 'active') {
        summaries.push({ ...runtime.session })
      }
    }

    return summaries
  }

  async getProjectSession(projectId: string): Promise<TerminalSessionSummary | null> {
    const sessions = await this.getProjectSessions(projectId)
    return sessions[0] ?? null
  }

  getSession(sessionId: string): TerminalSessionSummary {
    const runtime = this.requireRuntime(sessionId)
    return { ...runtime.session }
  }

  sendInput(sessionId: string, data: string) {
    if (!data) {
      return
    }

    const runtime = this.requireActiveRuntime(sessionId)
    runtime.pty.write(data)
  }

  resizeSession(sessionId: string, cols: number, rows: number) {
    const runtime = this.requireActiveRuntime(sessionId)
    const normalizedCols = normalizeCols(cols)
    const normalizedRows = normalizeRows(rows)
    runtime.pty.resize(normalizedCols, normalizedRows)
    runtime.session.cols = normalizedCols
    runtime.session.rows = normalizedRows
  }

  endSession(sessionId: string) {
    const runtime = this.requireRuntime(sessionId)

    if (runtime.session.state !== 'active') {
      return
    }

    runtime.pty.kill()
    this.completeSession(sessionId, { source: 'manual' })
  }

  replayOutput(sessionId: string) {
    const runtime = this.requireRuntime(sessionId)
    return [...runtime.outputBuffer]
  }

  subscribeOutput(sessionId: string, cb: (chunk: TerminalOutputChunk) => void) {
    const key = `${OUTPUT_EVENT_PREFIX}${sessionId}`
    this.events.on(key, cb)
    return () => this.events.off(key, cb)
  }

  subscribeState(sessionId: string, cb: (state: TerminalSessionState) => void) {
    const key = `${STATE_EVENT_PREFIX}${sessionId}`
    this.events.on(key, cb)
    return () => this.events.off(key, cb)
  }

  async shutdown() {
    const sessions = [...this.runtimes.keys()]
    for (const sessionId of sessions) {
      try {
        this.endSession(sessionId)
      } catch {
        // Keep shutdown best-effort.
      }
    }
  }

  private pushReplayChunk(runtime: TerminalRuntime, data: string) {
    runtime.outputBuffer.push(data)
    if (runtime.outputBuffer.length > this.replayBufferChunks) {
      runtime.outputBuffer.shift()
    }
  }

  private completeSession(
    sessionId: string,
    details: {
      source: 'exit' | 'manual'
      exitCode?: number
      signal?: number
    }
  ) {
    const runtime = this.runtimes.get(sessionId)
    if (!runtime) {
      return
    }

    if (runtime.session.state === 'completed') {
      return
    }

    runtime.session.state = 'completed'
    runtime.session.endedAt = this.now().getTime()
    this.events.emit(
      `${STATE_EVENT_PREFIX}${sessionId}`,
      'completed' satisfies TerminalSessionState
    )
    this.sessionsByProjectId.get(runtime.session.projectId)?.delete(sessionId)
    this.logger.info(
      {
        sessionId,
        projectId: runtime.session.projectId,
        source: details.source,
        exitCode: details.exitCode ?? null,
        signal: details.signal ?? null
      },
      '[TerminalService] Session ended'
    )
    setTimeout(() => {
      this.runtimes.delete(sessionId)
    }, 30_000)
  }

  private requireRuntime(sessionId: string) {
    const runtime = this.runtimes.get(sessionId)
    if (!runtime) {
      throw new TerminalServiceError('NOT_FOUND', `Terminal session not found: ${sessionId}`)
    }

    return runtime
  }

  private requireActiveRuntime(sessionId: string) {
    const runtime = this.requireRuntime(sessionId)
    if (runtime.session.state !== 'active') {
      throw new TerminalServiceError(
        'BAD_REQUEST',
        `Terminal session is not active: ${sessionId}`
      )
    }

    return runtime
  }
}
