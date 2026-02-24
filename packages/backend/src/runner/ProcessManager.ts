import { randomUUID } from 'node:crypto'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { EventEmitter } from 'node:events'

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
  handle: ProcessHandle
  child: ChildProcessWithoutNullStreams
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

function truncateOutput(data: string, limit = 200) {
  if (data.length <= limit) {
    return data
  }

  return `${data.slice(0, limit)}…`
}

function toTclLiteral(value: string) {
  const escaped = value
    .replace(/\\/g, '\\\\')
    .replace(/{/g, '\\{')
    .replace(/}/g, '\\}')

  return `{${escaped}}`
}

function buildExpectTtyBridgeScript(command: string, args: string[]) {
  return [
    'set timeout -1',
    `spawn -noecho ${[command, ...args].map(toTclLiteral).join(' ')}`,
    'interact'
  ].join('\n')
}

export class ProcessManager {
  private readonly killGraceMs: number
  private readonly idFactory: () => string
  private readonly now: () => Date
  private readonly logger: ProcessLogger
  private readonly processes = new Map<string, ManagedProcess>()

  constructor(options: ProcessManagerOptions = {}) {
    this.killGraceMs = options.killGraceMs ?? 1_000
    this.idFactory = options.idFactory ?? (() => randomUUID())
    this.now = options.now ?? (() => new Date())
    this.logger = options.logger ?? NOOP_LOGGER
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

    this.logger.debug(
      {
        processId: managed.handle.id,
        stream,
        output: truncateOutput(text),
        bytes: text.length
      },
      '[ProcessManager] Output chunk'
    )
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
    const spawnCommand = tty ? 'expect' : command
    const spawnArgs = tty ? ['-c', buildExpectTtyBridgeScript(command, args)] : args

    const id = this.idFactory()
    let closeResolved = false
    let resolveClose!: () => void
    let rejectClose!: (error: Error) => void
    const closePromise = new Promise<void>((resolve, reject) => {
      resolveClose = resolve
      rejectClose = reject
    })

    const child = spawn(spawnCommand, spawnArgs, {
      cwd: opts.cwd,
      env,
      stdio: 'pipe'
    })

    const handle: ProcessHandle = {
      id,
      projectId,
      command,
      args: [...args],
      tty,
      pid: child.pid ?? -1,
      state: 'running',
      startedAt: this.now(),
      endedAt: null
    }

    const managed: ManagedProcess = {
      handle,
      child,
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
    this.processes.set(id, managed)

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

    return { ...handle, args: [...handle.args] }
  }

  sendInput(processId: string, input: string) {
    const managed = this.processes.get(processId)
    if (!managed) {
      throw new Error(`Process ${processId} is not running`)
    }

    if (!managed.child.stdin.writable) {
      throw new Error(`Process ${processId} stdin is not writable`)
    }

    managed.child.stdin.write(input)
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
      managed.child.kill('SIGKILL')
      await managed.closePromise
      return
    }

    managed.child.kill('SIGTERM')
    const timeout = setTimeout(() => {
      if (this.processes.has(processId)) {
        managed.child.kill('SIGKILL')
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
