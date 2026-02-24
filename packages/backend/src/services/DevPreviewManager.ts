import { EventEmitter } from 'node:events'
import { access, readFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { createServer as createNetServer } from 'node:net'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { projects, schema, settings } from '../db/schema.js'
import {
  ProcessManager,
  type OutputChunk,
  type ProcessState
} from '../runner/ProcessManager.js'

type ServiceErrorCode = 'BAD_REQUEST' | 'NOT_FOUND' | 'CONFLICT'
type Database = BetterSQLite3Database<typeof schema>
type PreviewState = 'starting' | 'ready' | 'stopped' | 'error'

export interface DevCommand {
  command: string
  args: string[]
  portFlag: string | null
}

export interface PreviewInfo {
  projectId: string
  url: string
  port: number
  state: PreviewState
  command: string
  args: string[]
  error: string | null
}

interface PreviewRuntime {
  processId: string | null
  baseUrl: string
  status: PreviewInfo
  unsubOutput: () => void
  unsubState: () => void
  lastError: string | null
}

interface StartCommand {
  command: string
  args: string[]
  env: NodeJS.ProcessEnv
}

interface DevPreviewManagerOptions {
  portStart?: number
  portEnd?: number
  logger?: PreviewLogger
}

const STATE_EVENT_PREFIX = 'preview-state:'
const PREVIEW_BASE_URL_KEY = 'preview.baseUrl'
const PREVIEW_COMMAND_KEY = 'preview.command'
const DEFAULT_PREVIEW_BASE_URL = 'http://localhost'

interface PreviewLogger {
  debug: (context: Record<string, unknown>, message: string) => void
  info: (context: Record<string, unknown>, message: string) => void
  error: (context: Record<string, unknown>, message: string) => void
}

const NOOP_LOGGER: PreviewLogger = {
  debug: () => {},
  info: () => {},
  error: () => {}
}

export class DevPreviewManagerError extends Error {
  code: ServiceErrorCode

  constructor(code: ServiceErrorCode, message: string) {
    super(message)
    this.name = 'DevPreviewManagerError'
    this.code = code
  }
}

function cloneStatus(status: PreviewInfo): PreviewInfo {
  return {
    ...status,
    args: [...status.args]
  }
}

async function exists(path: string) {
  try {
    await access(path, constants.F_OK)
    return true
  } catch {
    return false
  }
}

function stripTrailingSlash(url: string) {
  return url.endsWith('/') ? url.slice(0, -1) : url
}

function isLoopbackHost(hostname: string) {
  return (
    hostname === '127.0.0.1' ||
    hostname === '0.0.0.0' ||
    hostname === '::' ||
    hostname === '[::]' ||
    hostname === '::1' ||
    hostname === '[::1]'
  )
}

function normalizeBaseUrl(rawUrl: string, fallback = DEFAULT_PREVIEW_BASE_URL) {
  try {
    const parsed = new URL(rawUrl)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('Preview base URL must use http(s)')
    }
    if (isLoopbackHost(parsed.hostname)) {
      parsed.hostname = 'localhost'
    }
    parsed.pathname = ''
    parsed.search = ''
    parsed.hash = ''
    return stripTrailingSlash(parsed.toString())
  } catch {
    return fallback
  }
}

function buildPreviewUrl(baseUrl: string, port: number) {
  const parsed = new URL(normalizeBaseUrl(baseUrl))
  parsed.port = String(port)
  parsed.pathname = ''
  parsed.search = ''
  parsed.hash = ''
  return stripTrailingSlash(parsed.toString())
}

function normalizeUrl(rawUrl: string, fallbackPort: number, baseUrl: string) {
  try {
    const parsed = new URL(rawUrl)

    const parsedPort = parsed.port ? Number(parsed.port) : fallbackPort
    const port = Number.isInteger(parsedPort) && parsedPort > 0 ? parsedPort : fallbackPort

    return buildPreviewUrl(baseUrl, port)
  } catch {
    return buildPreviewUrl(baseUrl, fallbackPort)
  }
}

function extractReadyUrl(output: string, port: number, baseUrl: string) {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  for (const line of lines) {
    const localMatch = /\blocal:\s*(https?:\/\/\S+)/i.exec(line)
    if (localMatch) {
      return normalizeUrl(localMatch[1], port, baseUrl)
    }

    const urlMatch = /(https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|\[::\]|\S+:\d+)\S*)/i.exec(
      line
    )
    if (urlMatch) {
      return normalizeUrl(urlMatch[1], port, baseUrl)
    }

    const hostPortMatch =
      /\b(?:listening on|started server on|server running at)\s+([0-9a-zA-Z\.\-:\[\]]+):(\d+)\b/i.exec(
        line
      )
    if (hostPortMatch) {
      return normalizeUrl(
        `http://${hostPortMatch[1]}:${hostPortMatch[2]}`,
        Number(hostPortMatch[2]),
        baseUrl
      )
    }

    if (
      /\b(listening on|started server|server running|ready in)\b/i.test(line)
    ) {
      return buildPreviewUrl(baseUrl, port)
    }
  }

  return null
}

function containsErrorText(output: string) {
  return /\b(eaddrinuse|address already in use|npm err!|error:)\b/i.test(output)
}

function normalizePackageManager(raw: unknown) {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return 'npm'
  }

  const normalized = raw.trim().toLowerCase()
  if (normalized.startsWith('yarn')) {
    return 'yarn'
  }

  if (normalized.startsWith('pnpm')) {
    return 'pnpm'
  }

  if (normalized.startsWith('bun')) {
    return 'bun'
  }

  return 'npm'
}

function asString(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function parseNodeDevCommand(
  pkg: Record<string, unknown>
): DevCommand | null {
  const scripts =
    typeof pkg.scripts === 'object' && pkg.scripts !== null
      ? (pkg.scripts as Record<string, unknown>)
      : {}
  const scriptName = scripts.dev ? 'dev' : scripts.start ? 'start' : null

  if (!scriptName) {
    return null
  }

  const commandText = asString(scripts[scriptName]).toLowerCase()
  const dependencies =
    typeof pkg.dependencies === 'object' && pkg.dependencies !== null
      ? (pkg.dependencies as Record<string, unknown>)
      : {}
  const devDependencies =
    typeof pkg.devDependencies === 'object' && pkg.devDependencies !== null
      ? (pkg.devDependencies as Record<string, unknown>)
      : {}

  const hasDependency = (name: string) =>
    name in dependencies || name in devDependencies

  let portFlag: string | null = '--port'
  if (hasDependency('next') || commandText.includes('next')) {
    portFlag = '-p'
  } else if (
    hasDependency('react-scripts') ||
    commandText.includes('react-scripts')
  ) {
    portFlag = null
  } else if (hasDependency('vite') || commandText.includes('vite')) {
    portFlag = '--port'
  }

  const packageManager = normalizePackageManager(pkg.packageManager)
  if (packageManager === 'yarn') {
    return {
      command: 'yarn',
      args: [scriptName],
      portFlag
    }
  }

  if (packageManager === 'pnpm') {
    return {
      command: 'pnpm',
      args: ['run', scriptName],
      portFlag
    }
  }

  if (packageManager === 'bun') {
    return {
      command: 'bun',
      args: ['run', scriptName],
      portFlag
    }
  }

  return {
    command: 'npm',
    args: ['run', scriptName],
    portFlag
  }
}

function parseConfiguredDevCommand(commandLine: string): DevCommand | null {
  const tokens = commandLine
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0)
  if (tokens.length === 0) {
    return null
  }

  const command = tokens[0]
  const args = tokens.slice(1)
  const normalized = commandLine.toLowerCase()
  let portFlag: string | null = '--port'
  if (normalized.includes('next')) {
    portFlag = '-p'
  } else if (normalized.includes('react-scripts')) {
    portFlag = null
  }

  return {
    command,
    args,
    portFlag
  }
}

function buildStartCommand(devCommand: DevCommand, port: number): StartCommand {
  const args = [...devCommand.args]
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PORT: String(port)
  }

  if (devCommand.command === 'npm' || devCommand.command === 'pnpm') {
    if (devCommand.portFlag) {
      args.push('--', devCommand.portFlag, String(port))
    }

    return {
      command: devCommand.command,
      args,
      env
    }
  }

  if (devCommand.command === 'yarn') {
    if (devCommand.portFlag) {
      args.push(devCommand.portFlag, String(port))
    }

    return {
      command: devCommand.command,
      args,
      env
    }
  }

  if (
    devCommand.command === 'python' &&
    devCommand.args[0] === 'manage.py' &&
    devCommand.args[1] === 'runserver'
  ) {
    args.push(`localhost:${port}`)
    return {
      command: devCommand.command,
      args,
      env
    }
  }

  if (devCommand.portFlag) {
    args.push(devCommand.portFlag, String(port))
  }

  return {
    command: devCommand.command,
    args,
    env
  }
}

export class DevPreviewManager {
  private readonly portStart: number
  private readonly portEnd: number
  private readonly logger: PreviewLogger
  private readonly runtimes = new Map<string, PreviewRuntime>()
  private readonly events = new EventEmitter()

  constructor(
    private readonly db: Database,
    private readonly processManager: ProcessManager,
    options: DevPreviewManagerOptions = {}
  ) {
    this.portStart = options.portStart ?? 3001
    this.portEnd = options.portEnd ?? 3010
    this.logger = options.logger ?? NOOP_LOGGER
  }

  async detectDevCommand(projectPath: string): Promise<DevCommand> {
    const node = await this.detectNodeCommand(projectPath)
    if (node) {
      return node
    }

    const rust = await this.detectRustCommand(projectPath)
    if (rust) {
      return rust
    }

    const python = await this.detectPythonCommand(projectPath)
    if (python) {
      return python
    }

    throw new DevPreviewManagerError(
      'BAD_REQUEST',
      `No dev command detected for project at ${projectPath}`
    )
  }

  async start(projectId: string): Promise<PreviewInfo> {
    const project = await this.requireProject(projectId)
    this.logger.info({ projectId, projectPath: project.path }, '[Preview] Start requested')
    const existing = this.runtimes.get(projectId)
    if (existing?.processId) {
      this.logger.debug(
        {
          projectId,
          processId: existing.processId,
          state: existing.status.state
        },
        '[Preview] Returning existing runtime'
      )
      return cloneStatus(existing.status)
    }

    const baseUrl = this.getPreviewBaseUrl()
    const configuredCommand = this.getPreviewCommand()
    const parsedConfiguredCommand = configuredCommand
      ? parseConfiguredDevCommand(configuredCommand)
      : null
    const devCommand = parsedConfiguredCommand ?? (await this.detectDevCommand(project.path))
    if (configuredCommand && !parsedConfiguredCommand) {
      throw new DevPreviewManagerError('BAD_REQUEST', 'Configured preview command is invalid')
    }
    const port = await this.findAvailablePort()
    this.logger.debug({ projectId, port }, '[Preview] Port assigned')
    const startCommand = buildStartCommand(devCommand, port)
    const url = buildPreviewUrl(baseUrl, port)

    const runtime: PreviewRuntime = {
      processId: null,
      baseUrl,
      status: {
        projectId,
        url,
        port,
        state: 'starting',
        command: startCommand.command,
        args: [...startCommand.args],
        error: null
      },
      unsubOutput: () => {},
      unsubState: () => {},
      lastError: null
    }

    this.runtimes.set(projectId, runtime)
    this.emitState(projectId)

    let handle
    try {
      this.logger.info(
        {
          projectId,
          command: startCommand.command,
          args: startCommand.args,
          port
        },
        '[Preview] Spawning preview process'
      )
      handle = await this.processManager.spawn(
        projectId,
        startCommand.command,
        startCommand.args,
        {
          cwd: project.path,
          env: startCommand.env
        }
      )
    } catch (error) {
      this.setState(projectId, 'error', {
        error:
          error instanceof Error
            ? error.message
            : 'Unable to start preview process'
      })
      throw new DevPreviewManagerError(
        'BAD_REQUEST',
        error instanceof Error
          ? error.message
          : 'Unable to start preview process'
      )
    }

    runtime.processId = handle.id
    runtime.unsubOutput = this.processManager.onOutput(handle.id, (chunk) => {
      this.handleOutput(projectId, chunk)
    })
    runtime.unsubState = this.processManager.onStateChange(handle.id, (state) => {
      void this.handleProcessState(projectId, state)
    })

    return cloneStatus(runtime.status)
  }

  async stop(projectId: string): Promise<void> {
    await this.requireProject(projectId)
    const runtime = this.runtimes.get(projectId)
    if (!runtime) {
      return
    }

    if (runtime.processId) {
      await this.processManager.kill(runtime.processId)
    }

    runtime.processId = null
    runtime.unsubOutput()
    runtime.unsubOutput = () => {}
    runtime.unsubState()
    runtime.unsubState = () => {}
    this.setState(projectId, 'stopped', { error: null })
    this.logger.info({ projectId }, '[Preview] Preview stopped')
  }

  async getStatus(projectId: string): Promise<PreviewInfo | null> {
    await this.requireProject(projectId)
    const runtime = this.runtimes.get(projectId)
    return runtime ? cloneStatus(runtime.status) : null
  }

  subscribeState(projectId: string, cb: (status: PreviewInfo) => void) {
    const key = `${STATE_EVENT_PREFIX}${projectId}`
    this.events.on(key, cb)
    return () => this.events.off(key, cb)
  }

  private async detectNodeCommand(projectPath: string): Promise<DevCommand | null> {
    const packageJsonPath = join(projectPath, 'package.json')
    if (!(await exists(packageJsonPath))) {
      return null
    }

    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(await readFile(packageJsonPath, 'utf8')) as Record<
        string,
        unknown
      >
    } catch {
      throw new DevPreviewManagerError(
        'BAD_REQUEST',
        `Invalid package.json in project: ${projectPath}`
      )
    }

    return parseNodeDevCommand(parsed)
  }

  private async detectRustCommand(projectPath: string): Promise<DevCommand | null> {
    if (await exists(join(projectPath, 'Trunk.toml'))) {
      return {
        command: 'trunk',
        args: ['serve'],
        portFlag: '--port'
      }
    }

    if (await exists(join(projectPath, 'Cargo.toml'))) {
      return {
        command: 'cargo',
        args: ['run'],
        portFlag: null
      }
    }

    return null
  }

  private async detectPythonCommand(projectPath: string): Promise<DevCommand | null> {
    if (await exists(join(projectPath, 'manage.py'))) {
      return {
        command: 'python',
        args: ['manage.py', 'runserver'],
        portFlag: null
      }
    }

    const candidates = ['requirements.txt', 'pyproject.toml']
    let combined = ''
    for (const file of candidates) {
      const filePath = join(projectPath, file)
      if (!(await exists(filePath))) {
        continue
      }

      combined += `\n${await readFile(filePath, 'utf8')}`
    }

    if (!combined) {
      return null
    }

    const normalized = combined.toLowerCase()
    if (normalized.includes('uvicorn')) {
      return {
        command: 'python',
        args: ['-m', 'uvicorn', 'main:app', '--reload'],
        portFlag: '--port'
      }
    }

    if (normalized.includes('flask')) {
      return {
        command: 'python',
        args: ['-m', 'flask', 'run'],
        portFlag: '--port'
      }
    }

    if (normalized.includes('django')) {
      return {
        command: 'python',
        args: ['manage.py', 'runserver'],
        portFlag: null
      }
    }

    return null
  }

  private getPreviewBaseUrl() {
    const configured = this.getSettingValue(PREVIEW_BASE_URL_KEY)
    if (!configured) {
      return DEFAULT_PREVIEW_BASE_URL
    }

    return normalizeBaseUrl(configured, DEFAULT_PREVIEW_BASE_URL)
  }

  private getPreviewCommand() {
    const configured = this.getSettingValue(PREVIEW_COMMAND_KEY)
    if (!configured) {
      return null
    }

    const normalized = configured.trim()
    return normalized.length > 0 ? normalized : null
  }

  private getSettingValue(key: string) {
    const setting = this.db
      .select()
      .from(settings)
      .where(eq(settings.key, key))
      .get()

    return setting?.value
  }

  private async requireProject(projectId: string) {
    const project = this.db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .get()

    if (!project) {
      throw new DevPreviewManagerError('NOT_FOUND', `Project not found: ${projectId}`)
    }

    return project
  }

  private async findAvailablePort() {
    for (let port = this.portStart; port <= this.portEnd; port += 1) {
      // eslint-disable-next-line no-await-in-loop
      if (await this.isPortAvailable(port)) {
        return port
      }
    }

    const fallbackPort = await this.findEphemeralPort().catch(() => null)
    if (fallbackPort !== null) {
      this.logger.info(
        {
          configuredPortStart: this.portStart,
          configuredPortEnd: this.portEnd,
          fallbackPort
        },
        '[Preview] Falling back to ephemeral preview port'
      )
      return fallbackPort
    }

    throw new DevPreviewManagerError(
      'CONFLICT',
      `No available preview port in range ${this.portStart}-${this.portEnd}`
    )
  }

  private async isPortAvailable(port: number): Promise<boolean> {
    const ipv4Available = await this.isPortAvailableOnHost(port, '127.0.0.1')
    if (!ipv4Available) {
      return false
    }

    return this.isPortAvailableOnHost(port, '::1')
  }

  private async isPortAvailableOnHost(port: number, host: string): Promise<boolean> {
    return new Promise((resolve) => {
      const server = createNetServer()
      server.once('error', (error: NodeJS.ErrnoException) => {
        if (error.code === 'EAFNOSUPPORT' || error.code === 'EADDRNOTAVAIL') {
          // Some environments do not provide IPv6 loopback; ignore that case.
          resolve(true)
          return
        }

        resolve(false)
      })
      server.listen(port, host, () => {
        server.close(() => resolve(true))
      })
    })
  }

  private async findEphemeralPort(): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = createNetServer()
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => {
        const address = server.address()
        const port =
          address && typeof address === 'object' && 'port' in address
            ? Number(address.port)
            : null

        if (!port || !Number.isInteger(port) || port <= 0) {
          server.close(() => {
            reject(new Error('Unable to determine ephemeral preview port'))
          })
          return
        }

        server.close((error) => {
          if (error) {
            reject(error)
            return
          }
          resolve(port)
        })
      })
    })
  }

  private handleOutput(projectId: string, chunk: OutputChunk) {
    const runtime = this.runtimes.get(projectId)
    if (!runtime) {
      return
    }

    const readyUrl = extractReadyUrl(chunk.data, runtime.status.port, runtime.baseUrl)
    if (readyUrl && runtime.status.state === 'starting') {
      this.logger.info(
        {
          projectId,
          port: runtime.status.port,
          url: readyUrl
        },
        '[Preview] Ready URL detected'
      )
      this.setState(projectId, 'ready', {
        url: readyUrl,
        error: null
      })
      return
    }

    if (chunk.stream === 'stderr' && containsErrorText(chunk.data)) {
      runtime.lastError = chunk.data.trim().slice(0, 240)
      this.logger.error(
        {
          projectId,
          error: runtime.lastError
        },
        '[Preview] Error output detected'
      )
    }
  }

  private async handleProcessState(projectId: string, state: ProcessState) {
    const runtime = this.runtimes.get(projectId)
    if (!runtime) {
      return
    }

    runtime.processId = null
    runtime.unsubOutput()
    runtime.unsubOutput = () => {}
    runtime.unsubState()
    runtime.unsubState = () => {}

    if (state === 'crashed') {
      this.logger.error(
        {
          projectId,
          state,
          error: runtime.lastError ?? 'Preview process crashed'
        },
        '[Preview] Process crashed'
      )
      this.setState(projectId, 'error', {
        error: runtime.lastError ?? 'Preview process crashed'
      })
      return
    }

    if (runtime.status.state !== 'error') {
      this.setState(projectId, 'stopped', { error: null })
      this.logger.info({ projectId, state }, '[Preview] Process stopped')
    }
  }

  private setState(
    projectId: string,
    state: PreviewState,
    overrides: Partial<PreviewInfo>
  ) {
    const runtime = this.runtimes.get(projectId)
    if (!runtime) {
      return
    }

    runtime.status = {
      ...runtime.status,
      ...overrides,
      state
    }
    this.emitState(projectId)
  }

  private emitState(projectId: string) {
    const runtime = this.runtimes.get(projectId)
    if (!runtime) {
      return
    }

    this.events.emit(
      `${STATE_EVENT_PREFIX}${projectId}`,
      cloneStatus(runtime.status)
    )
  }
}
