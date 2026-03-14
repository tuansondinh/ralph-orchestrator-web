import { randomUUID } from 'node:crypto'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { constants } from 'node:fs'
import { access, chmod, stat } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import * as pty from 'node-pty'

export type ProcessState = 'running' | 'stopped' | 'crashed' | 'completed'

export interface SpawnOpts {
  cwd?: string
  env?: NodeJS.ProcessEnv
  killGraceMs?: number
  tty?: boolean
}

interface ProcessLogger {
  debug: (context: Record<string, unknown>, message: string) => void
  info: (context: Record<string, unknown>, message: string) => void
  error: (context: Record<string, unknown>, message: string) => void
}

export interface ProcessHandle {
  id: string
  projectId: string
  command: string
  args: string[]
  tty: boolean
  pid: number
  state: ProcessState
  startedAt: Date
  endedAt: Date | null
}

export interface OutputChunk {
  stream: 'stdout' | 'stderr'
  data: string
  timestamp: Date
}

interface ManagedProcess {
  mode: 'pipe' | 'pty'
  handle: ProcessHandle
  child: ChildProcessWithoutNullStreams | null
  pty: pty.IPty | null
  outputEmitter: EventEmitter
  stateEmitter: EventEmitter
  closePromise: Promise<void>
  resolveClose: () => void
  rejectClose: (error: Error) => void
  killRequested: boolean
  killGraceMs: number
}

interface ProcessManagerOptions {
  killGraceMs?: number
  idFactory?: () => string
  now?: () => Date
  logger?: ProcessLogger
}

const NOOP_LOGGER: ProcessLogger = {
  debug: () => { },
  info: () => { },
  error: () => { }
}
const require = createRequire(import.meta.url)
function toPtyEnvironment(env: NodeJS.ProcessEnv): Record<string, string> {
  const ptyEnv: Record<string, string> = {}
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === 'string') {
      ptyEnv[key] = value
    }
  }

  if (!ptyEnv.TERM) {
    ptyEnv.TERM = 'xterm-256color'
  }

  return ptyEnv
}

export class ProcessManager {
  private readonly killGraceMs: number
  private readonly idFactory: () => string
  private readonly now: () => Date
  private readonly logger: ProcessLogger
  private readonly processes = new Map<string, ManagedProcess>()
  private helperPermissionsEnsured = false

  constructor(options: ProcessManagerOptions = {}) {
    this.killGraceMs = options.killGraceMs ?? 1_000
    this.idFactory = options.idFactory ?? (() => randomUUID())
    this.now = options.now ?? (() => new Date())
    this.logger = options.logger ?? NOOP_LOGGER
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
          '[ProcessManager] Fixed execute permissions for node-pty spawn-helper'
        )
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        throw new Error(`node-pty helper is not executable: ${helperPath} (${reason})`)
      }
    }

    if (!foundAnyHelper) {
      this.logger.debug(
        {},
        '[ProcessManager] No node-pty spawn-helper binary found to permission-fix'
      )
    }

    this.helperPermissionsEnsured = true
  }

  private signalProcessTree(
    managed: ManagedProcess,
    signal: 'SIGTERM' | 'SIGKILL'
  ) {
    if (managed.mode === 'pty' && managed.pty) {
      try {
        managed.pty.kill(signal)
        return true
      } catch {
        // Fall through to direct pid signaling.
      }
    }

    const pid = managed.handle.pid
    if (pid > 0) {
      try {
        // Detached child processes can be targeted via process-group id.
        process.kill(-pid, signal)
        return true
      } catch {
        // Fall through to direct child signaling.
      }

      try {
        process.kill(pid, signal)
        return true
      } catch {
        // Fall through to child handle signaling.
      }
    }

    if (managed.child) {
      return managed.child.kill(signal)
    }

    return false
  }

  private emitOutput(
    managed: ManagedProcess,
    stream: 'stdout' | 'stderr',
    data: string | Buffer
  ) {
    const text = typeof data === 'string' ? data : data.toString('utf8')
    if (text.length === 0) {
      return
    }

    managed.outputEmitter.emit('output', {
      stream,
      data: text,
      timestamp: this.now()
    } satisfies OutputChunk)
  }

  private markProcessClosed(
    processId: string,
    managed: ManagedProcess,
    exitCode: number | null
  ) {
    const handle = managed.handle
    handle.state = managed.killRequested
      ? 'stopped'
      : exitCode === 0
        ? 'completed'
        : 'crashed'
    handle.endedAt = this.now()
    this.logger.info(
      {
        processId,
        pid: handle.pid,
        state: handle.state,
        exitCode
      },
      '[ProcessManager] Process exited'
    )
    managed.stateEmitter.emit('state', handle.state)
    this.processes.delete(processId)
    managed.resolveClose()
  }

  private markProcessError(
    processId: string,
    managed: ManagedProcess,
    error: Error
  ) {
    managed.handle.state = 'crashed'
    managed.handle.endedAt = this.now()
    this.logger.error(
      {
        processId,
        pid: managed.handle.pid,
        error: error.message
      },
      '[ProcessManager] Process error'
    )
    managed.stateEmitter.emit('state', managed.handle.state)
    this.processes.delete(processId)
    managed.rejectClose(error)
  }

  async spawn(
    projectId: string,
    command: string,
    args: string[],
    opts: SpawnOpts = {}
  ): Promise<ProcessHandle> {
    const env = { ...process.env, ...opts.env }
    const tty = Boolean(opts.tty)

    const id = this.idFactory()
    let closeResolved = false
    let resolveClose!: () => void
    let rejectClose!: (error: Error) => void
    const closePromise = new Promise<void>((resolve, reject) => {
      resolveClose = resolve
      rejectClose = reject
    })

    const handle: ProcessHandle = {
      id,
      projectId,
      command,
      args: [...args],
      tty,
      pid: -1,
      state: 'running',
      startedAt: this.now(),
      endedAt: null
    }

    const managed: ManagedProcess = {
      mode: tty ? 'pty' : 'pipe',
      handle,
      child: null,
      pty: null,
      outputEmitter: new EventEmitter(),
      stateEmitter: new EventEmitter(),
      closePromise,
      resolveClose: () => {
        if (!closeResolved) {
          closeResolved = true
          resolveClose()
        }
      },
      rejectClose: (error: Error) => {
        if (!closeResolved) {
          closeResolved = true
          rejectClose(error)
        }
      },
      killRequested: false,
      killGraceMs: opts.killGraceMs ?? this.killGraceMs
    }

    if (tty) {
      await this.ensureNodePtyHelperExecutable()
      const terminal = pty.spawn(command, args, {
        name: 'xterm-256color',
        cols: 120,
        rows: 36,
        cwd: opts.cwd,
        env: toPtyEnvironment(env)
      })
      managed.pty = terminal
      handle.pid = terminal.pid
      this.processes.set(id, managed)

      terminal.onData((data) => {
        this.emitOutput(managed, 'stdout', data)
      })

      terminal.onExit(({ exitCode, signal }) => {
        this.markProcessClosed(id, managed, exitCode)
      })
    } else {
      const child = spawn(command, args, {
        cwd: opts.cwd,
        env,
        stdio: 'pipe',
        detached: true
      })
      managed.child = child
      handle.pid = child.pid ?? -1
      this.processes.set(id, managed)

      child.stdout.on('data', (data: Buffer) =>
        this.emitOutput(managed, 'stdout', data)
      )
      child.stderr.on('data', (data: Buffer) =>
        this.emitOutput(managed, 'stderr', data)
      )

      child.once('error', (error) => {
        this.markProcessError(id, managed, error)
      })

      child.once('close', (code) => {
        this.markProcessClosed(id, managed, code)
      })
    }

    this.logger.info(
      {
        projectId,
        processId: id,
        command,
        args,
        pid: handle.pid,
        tty,
        cwd: opts.cwd ?? null
      },
      '[ProcessManager] Spawned process'
    )

    return { ...handle, args: [...handle.args] }
  }

  sendInput(processId: string, input: string) {
    const managed = this.processes.get(processId)
    if (!managed) {
      throw new Error(`Process ${processId} is not running`)
    }

    if (managed.mode === 'pty') {
      if (!managed.pty) {
        throw new Error(`Process ${processId} pseudo-terminal is not available`)
      }
      managed.pty.write(input)
      return
    }

    const child = managed.child
    if (!child?.stdin.writable) {
      throw new Error(`Process ${processId} stdin is not writable`)
    }

    child.stdin.write(input)
  }

  async kill(processId: string, signal: 'SIGTERM' | 'SIGKILL' = 'SIGTERM') {
    const managed = this.processes.get(processId)
    if (!managed) {
      this.logger.debug({ processId, signal }, '[ProcessManager] Kill ignored; process missing')
      return
    }

    managed.killRequested = true
    this.logger.info(
      {
        processId,
        pid: managed.handle.pid,
        signal
      },
      '[ProcessManager] Killing process'
    )

    if (signal === 'SIGKILL') {
      this.signalProcessTree(managed, 'SIGKILL')
      await managed.closePromise
      return
    }

    this.signalProcessTree(managed, 'SIGTERM')
    const timeout = setTimeout(() => {
      if (this.processes.has(processId)) {
        this.signalProcessTree(managed, 'SIGKILL')
      }
    }, managed.killGraceMs)

    try {
      await managed.closePromise
    } finally {
      clearTimeout(timeout)
    }
  }

  list() {
    return [...this.processes.values()].map((managed) => ({
      ...managed.handle,
      args: [...managed.handle.args]
    }))
  }

  onOutput(processId: string, cb: (chunk: OutputChunk) => void) {
    const managed = this.processes.get(processId)
    if (!managed) {
      throw new Error(`Process ${processId} is not running`)
    }

    const listener = (chunk: OutputChunk) => cb(chunk)
    managed.outputEmitter.on('output', listener)
    return () => {
      managed.outputEmitter.off('output', listener)
    }
  }

  onStateChange(processId: string, cb: (state: ProcessState) => void) {
    const managed = this.processes.get(processId)
    if (!managed) {
      throw new Error(`Process ${processId} is not running`)
    }

    const listener = (state: ProcessState) => cb(state)
    managed.stateEmitter.on('state', listener)
    return () => {
      managed.stateEmitter.off('state', listener)
    }
  }

  async shutdown() {
    const processIds = [...this.processes.keys()]
    await Promise.allSettled(processIds.map((processId) => this.kill(processId)))
  }
}
