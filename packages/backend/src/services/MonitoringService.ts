import { execFile as execFileCallback } from 'node:child_process'
import { watch, type Dirent, type FSWatcher } from 'node:fs'
import { readFile, readdir, realpath, stat } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { promisify } from 'node:util'
import { eq } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { loopRuns, projects, type LoopRun, schema } from '../db/schema.js'
import {
  LoopService,
  LoopServiceError,
  type LoopMetrics
} from './LoopService.js'

type ServiceErrorCode = 'BAD_REQUEST' | 'NOT_FOUND'
type Database = BetterSQLite3Database<typeof schema>

export interface FileChange {
  path: string
  additions: number
  deletions: number
}

export interface MonitoringLoopMetrics extends LoopMetrics {
  fileChanges: FileChange[]
}

export interface MonitoringFileContent {
  path: string
  content: string
}

export interface ProjectStatus {
  activeLoops: number
  totalRuns: number
  lastRunAt: number | null
  health: 'healthy' | 'warning' | 'error'
  tokenUsage: number
  errorRate: number
}

export interface MonitoringEvent {
  topic: string
  payload?: unknown
  sourceHat?: string
  timestamp: number
}

export interface EventQueryOptions {
  topic?: string
  sourceHat?: string
  limit?: number
}

interface MonitoringServiceOptions {
  now?: () => Date
  watchDebounceMs?: number
}

interface GitScope {
  repoRoot: string
  pathPrefix: string
}

const execFile = promisify(execFileCallback)
const FINAL_STATES = new Set(['completed', 'stopped', 'failed', 'crashed', 'error'])
const ERROR_STATES = new Set(['failed', 'crashed', 'error'])
const MTIME_SCAN_IGNORE_DIRS = new Set([
  '.git',
  '.agent',
  'node_modules',
  '.next',
  'dist',
  'build',
  'coverage',
  '.turbo'
])
const MAX_MTIME_SCAN_RESULTS = 300
const MAX_MTIME_SCAN_FILES = 3000

export class MonitoringServiceError extends Error {
  code: ServiceErrorCode

  constructor(code: ServiceErrorCode, message: string) {
    super(message)
    this.name = 'MonitoringServiceError'
    this.code = code
  }
}

function asTimestamp(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.floor(value)
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const numeric = Number(value)
    if (Number.isFinite(numeric)) {
      return Math.floor(numeric)
    }

    const parsed = Date.parse(value)
    if (!Number.isNaN(parsed)) {
      return parsed
    }
  }

  return undefined
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function parseNumStat(output: string): FileChange[] {
  const rows = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  const changes = new Map<string, FileChange>()
  for (const row of rows) {
    const parts = row.split('\t')
    if (parts.length < 3) {
      continue
    }

    const path = parts.slice(2).join('\t').trim()
    if (!path) {
      continue
    }

    const additions =
      parts[0] === '-' ? 0 : Number.isFinite(Number(parts[0])) ? Number(parts[0]) : 0
    const deletions =
      parts[1] === '-' ? 0 : Number.isFinite(Number(parts[1])) ? Number(parts[1]) : 0

    const existing = changes.get(path)
    if (existing) {
      existing.additions += additions
      existing.deletions += deletions
      continue
    }

    changes.set(path, { path, additions, deletions })
  }

  return Array.from(changes.values())
}

function parseStatusPaths(output: string): string[] {
  const rows = output
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)

  const paths: string[] = []
  for (const row of rows) {
    if (row.length < 4) {
      continue
    }

    let path = row.slice(3).trim()
    if (!path) {
      continue
    }

    const renameMarker = ' -> '
    if (path.includes(renameMarker)) {
      path = path.split(renameMarker).at(-1)?.trim() ?? path
    }

    if (!path) {
      continue
    }

    paths.push(path)
  }

  return paths
}

function isActiveState(state: string) {
  return !FINAL_STATES.has(state)
}

function hasErrors(run: LoopRun) {
  return run.errors > 0 || ERROR_STATES.has(run.state)
}

export class MonitoringService {
  private readonly now: () => Date
  private readonly watchDebounceMs: number

  constructor(
    private readonly db: Database,
    private readonly loopService: LoopService,
    options: MonitoringServiceOptions = {}
  ) {
    this.now = options.now ?? (() => new Date())
    this.watchDebounceMs = options.watchDebounceMs ?? 125
  }

  async getProjectStatus(projectId: string): Promise<ProjectStatus> {
    await this.requireProject(projectId)

    const runs = this.db
      .select()
      .from(loopRuns)
      .where(eq(loopRuns.projectId, projectId))
      .all()

    const activeLoops = runs.filter((run) => isActiveState(run.state)).length
    const totalRuns = runs.length
    const tokenUsage = runs.reduce((sum, run) => sum + run.tokensUsed, 0)
    const erroredRuns = runs.filter((run) => hasErrors(run)).length

    const health = runs.some((run) => ERROR_STATES.has(run.state))
      ? 'error'
      : runs.some((run) => run.errors > 0)
        ? 'warning'
        : 'healthy'

    const lastRunAt = runs.reduce<number | null>((latest, run) => {
      const candidate = run.endedAt ?? run.startedAt
      if (latest === null) {
        return candidate
      }
      return Math.max(latest, candidate)
    }, null)

    return {
      activeLoops,
      totalRuns,
      lastRunAt,
      health,
      tokenUsage,
      errorRate:
        totalRuns === 0
          ? 0
          : Number(((erroredRuns / totalRuns) * 100).toFixed(2))
    }
  }

  async getLoopMetrics(loopId: string): Promise<MonitoringLoopMetrics> {
    const run = await this.requireLoop(loopId)
    const project = await this.requireProject(run.projectId)
    const targetPath = await this.resolveMonitoringPath(project.path, run.worktree)

    let baseMetrics: LoopMetrics
    try {
      baseMetrics = await this.loopService.getMetrics(loopId)
    } catch (error) {
      if (error instanceof LoopServiceError) {
        throw new MonitoringServiceError(
          error.code === 'NOT_FOUND' ? 'NOT_FOUND' : 'BAD_REQUEST',
          error.message
        )
      }
      throw error
    }

    const fileChangesFromGit = await this.getFileChanges(targetPath, run.startedAt)
    const fileChanges = this.mergeMetricFileChanges(fileChangesFromGit, baseMetrics.filesChanged)
    const filesChanged =
      baseMetrics.filesChanged.length > 0
        ? baseMetrics.filesChanged
        : fileChanges.map((change) => change.path)

    return {
      ...baseMetrics,
      filesChanged,
      fileChanges
    }
  }

  async getEventHistory(
    projectId: string,
    options: EventQueryOptions = {}
  ): Promise<MonitoringEvent[]> {
    const project = await this.requireProject(projectId)
    const historyPath = join(project.path, '.agent', 'event_history.jsonl')
    let raw: string
    try {
      raw = await readFile(historyPath, 'utf8')
    } catch {
      return []
    }

    const topicFilter = asString(options.topic)
    const sourceHatFilter = asString(options.sourceHat)
    const maxRows =
      typeof options.limit === 'number' && options.limit > 0
        ? Math.floor(options.limit)
        : undefined

    const parsed = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line) as Record<string, unknown>
        } catch {
          return null
        }
      })
      .filter((entry): entry is Record<string, unknown> => entry !== null)
      .map((entry) => this.toEvent(entry))
      .filter((event): event is MonitoringEvent => event !== null)
      .filter((event) => (topicFilter ? event.topic === topicFilter : true))
      .filter((event) => (sourceHatFilter ? event.sourceHat === sourceHatFilter : true))
      .sort((a, b) => b.timestamp - a.timestamp)

    return maxRows ? parsed.slice(0, maxRows) : parsed
  }

  watchMetrics(loopId: string, cb: (metrics: MonitoringLoopMetrics) => void) {
    let closed = false
    let timer: NodeJS.Timeout | null = null
    const watchers: FSWatcher[] = []

    const emit = async () => {
      const metrics = await this.getLoopMetrics(loopId).catch(() => null)
      if (closed || !metrics) {
        return
      }

      cb(metrics)
    }

    const schedule = () => {
      if (closed) {
        return
      }

      if (timer) {
        clearTimeout(timer)
      }

      timer = setTimeout(() => {
        timer = null
        void emit()
      }, this.watchDebounceMs)
    }

    void this.attachWatchers(loopId, watchers, schedule, () => closed)
    void emit()

    return () => {
      closed = true
      if (timer) {
        clearTimeout(timer)
        timer = null
      }

      for (const watcher of watchers) {
        watcher.close()
      }
    }
  }

  async getFileChanges(projectPath: string, sinceMs?: number): Promise<FileChange[]> {
    const scope = await this.resolveGitScope(projectPath)
    if (!scope) {
      return this.getFileChangesByMtime(projectPath, sinceMs)
    }

    const diffOutput = await this.runGit(scope.repoRoot, [
      'diff',
      '--numstat',
      '--no-renames',
      ...this.pathspecArgs(scope.pathPrefix)
    ])
    const diffChanges = diffOutput
      ? this.toScopedFileChanges(diffOutput, scope.pathPrefix)
      : []
    const statusOutput = await this.runGit(scope.repoRoot, [
      'status',
      '--porcelain',
      '--untracked-files=all',
      ...this.pathspecArgs(scope.pathPrefix)
    ])
    const statusPaths = statusOutput
      ? this.toScopedPathStrings(parseStatusPaths(statusOutput), scope.pathPrefix)
      : []

    if (statusPaths.length === 0) {
      if (diffChanges.length > 0) {
        return diffChanges
      }

      const logOutput = await this.runGit(scope.repoRoot, [
        'log',
        '--numstat',
        '--pretty=format:',
        '-n',
        '1',
        ...this.pathspecArgs(scope.pathPrefix)
      ])
      const logChanges = logOutput
        ? this.toScopedFileChanges(logOutput, scope.pathPrefix)
        : []
      if (logChanges.length > 0) {
        return logChanges
      }

      return this.getFileChangesByMtime(projectPath, sinceMs)
    }

    const byPath = new Map<string, FileChange>()
    for (const change of diffChanges) {
      byPath.set(change.path, change)
    }
    for (const path of statusPaths) {
      if (!byPath.has(path)) {
        byPath.set(path, { path, additions: 0, deletions: 0 })
      }
    }

    return Array.from(byPath.values())
  }

  private async getFileChangesByMtime(projectPath: string, sinceMs?: number): Promise<FileChange[]> {
    if (typeof sinceMs !== 'number' || !Number.isFinite(sinceMs)) {
      return []
    }

    const root = resolve(projectPath)
    const files = await this.listFilesModifiedSince(root, Math.max(0, sinceMs))
    return files.map((path) => ({
      path,
      additions: 0,
      deletions: 0
    }))
  }

  private async listFilesModifiedSince(root: string, sinceMs: number): Promise<string[]> {
    const results: string[] = []
    const stack: string[] = [root]
    let scannedFiles = 0

    while (stack.length > 0 && scannedFiles < MAX_MTIME_SCAN_FILES && results.length < MAX_MTIME_SCAN_RESULTS) {
      const directory = stack.pop()
      if (!directory) {
        continue
      }

      let entries: Dirent[]
      try {
        entries = await readdir(directory, { withFileTypes: true })
      } catch {
        continue
      }

      for (const entry of entries) {
        if (results.length >= MAX_MTIME_SCAN_RESULTS || scannedFiles >= MAX_MTIME_SCAN_FILES) {
          break
        }

        const absolutePath = join(directory, entry.name)
        if (entry.isDirectory()) {
          if (!MTIME_SCAN_IGNORE_DIRS.has(entry.name)) {
            stack.push(absolutePath)
          }
          continue
        }

        if (!entry.isFile()) {
          continue
        }

        scannedFiles += 1
        let fileStats
        try {
          fileStats = await stat(absolutePath)
        } catch {
          continue
        }

        if (!fileStats.isFile() || fileStats.mtimeMs < sinceMs) {
          continue
        }

        const relativePath = relative(root, absolutePath)
        if (
          !relativePath ||
          relativePath.startsWith(`..${sep}`) ||
          relativePath === '..' ||
          isAbsolute(relativePath)
        ) {
          continue
        }

        results.push(relativePath.split(sep).join('/'))
      }
    }

    return results.sort((left, right) => left.localeCompare(right))
  }

  async getFileContent(loopId: string, filePath: string): Promise<MonitoringFileContent> {
    const run = await this.requireLoop(loopId)
    const project = await this.requireProject(run.projectId)
    const targetPath = await this.resolveMonitoringPath(project.path, run.worktree)
    const resolved = this.resolveFilePath(targetPath, filePath)

    try {
      const content = await readFile(resolved.absolutePath, 'utf8')
      return { path: resolved.relativePath, content }
    } catch {
      const scope = await this.resolveGitScope(targetPath)
      if (scope) {
        const repoRelativePath = this.toRepoRelativePath(scope.pathPrefix, resolved.relativePath)
        const historyContent = await this.runGit(scope.repoRoot, [
          'show',
          `HEAD:${repoRelativePath}`
        ])
        if (historyContent !== null) {
          return { path: resolved.relativePath, content: historyContent }
        }
      }
    }

    throw new MonitoringServiceError('NOT_FOUND', `File not found: ${filePath}`)
  }

  private async attachWatchers(
    loopId: string,
    watchers: FSWatcher[],
    schedule: () => void,
    isClosed: () => boolean
  ) {
    const run = await this.requireLoop(loopId).catch(() => null)
    if (!run) {
      return
    }

    const project = await this.requireProject(run.projectId).catch(() => null)
    if (!project) {
      return
    }

    const projectPath = await this.resolveMonitoringPath(project.path, run.worktree).catch(
      () => project.path
    )
    const agentPath = join(projectPath, '.agent')
    const metricsPath = join(agentPath, 'metrics')

    const watchPaths = [projectPath, agentPath, metricsPath]
    for (const path of watchPaths) {
      if (isClosed()) {
        return
      }

      try {
        const watcher = watch(path, (_, filename) => {
          if (isClosed()) {
            return
          }

          const name = filename ? String(filename) : ''

          // Project root watcher is only for .agent creation/deletion.
          if (path === projectPath && !name.startsWith('.agent')) {
            return
          }

          schedule()
        })

        watchers.push(watcher)
      } catch {
        // Path may not exist yet; watcher is best-effort.
      }
    }
  }

  private toEvent(entry: Record<string, unknown>): MonitoringEvent | null {
    const topic = asString(entry.topic) ?? asString(entry.type) ?? asString(entry.event)
    if (!topic) {
      return null
    }

    const sourceHat = asString(entry.sourceHat) ?? asString(entry.source_hat)
    const timestamp =
      asTimestamp(entry.timestamp) ??
      asTimestamp(entry.ts) ??
      asTimestamp(entry.created_at) ??
      this.now().getTime()

    return {
      topic,
      payload: entry.payload,
      sourceHat,
      timestamp
    }
  }

  private async runGit(projectPath: string, args: string[]) {
    try {
      const result = await execFile('git', ['-C', projectPath, ...args], {
        encoding: 'utf8'
      })
      return result.stdout
    } catch {
      return null
    }
  }

  private pathspecArgs(pathPrefix: string) {
    return pathPrefix ? ['--', pathPrefix] : []
  }

  private toScopedFileChanges(output: string, pathPrefix: string): FileChange[] {
    const parsed = parseNumStat(output)
    return this.toScopedPaths(parsed, pathPrefix)
  }

  private toScopedPaths<T extends { path: string }>(items: T[], pathPrefix: string): T[] {
    if (!pathPrefix) {
      return items
    }

    const prefix = pathPrefix.endsWith('/') ? pathPrefix : `${pathPrefix}/`
    return items
      .filter((item) => item.path.startsWith(prefix))
      .map((item) => ({
        ...item,
        path: item.path.slice(prefix.length)
      }))
      .filter((item) => item.path.length > 0)
  }

  private toScopedPathStrings(paths: string[], pathPrefix: string): string[] {
    if (!pathPrefix) {
      return paths
    }

    const prefix = pathPrefix.endsWith('/') ? pathPrefix : `${pathPrefix}/`
    return paths
      .filter((path) => path.startsWith(prefix))
      .map((path) => path.slice(prefix.length))
      .filter((path) => path.length > 0)
  }

  private toRepoRelativePath(pathPrefix: string, relativePath: string) {
    return pathPrefix ? `${pathPrefix}/${relativePath}` : relativePath
  }

  private async resolveGitScope(projectPath: string): Promise<GitScope | null> {
    const repoRootOutput = await this.runGit(projectPath, ['rev-parse', '--show-toplevel'])
    const repoRootRaw = repoRootOutput?.trim()
    if (!repoRootRaw) {
      return null
    }

    const repoRoot = await this.resolveRealPath(repoRootRaw)
    const targetPath = await this.resolveRealPath(projectPath)
    const relativeTarget = relative(repoRoot, targetPath)

    if (
      relativeTarget.startsWith(`..${sep}`) ||
      relativeTarget === '..' ||
      isAbsolute(relativeTarget)
    ) {
      return {
        repoRoot,
        pathPrefix: ''
      }
    }

    return {
      repoRoot,
      pathPrefix: relativeTarget ? relativeTarget.split(sep).join('/') : ''
    }
  }

  private async resolveRealPath(path: string) {
    try {
      return await realpath(path)
    } catch {
      return resolve(path)
    }
  }

  private mergeMetricFileChanges(
    gitChanges: FileChange[],
    metricFilesChanged: string[]
  ): FileChange[] {
    if (metricFilesChanged.length === 0) {
      return gitChanges
    }

    const byPath = new Map<string, FileChange>()
    for (const change of gitChanges) {
      byPath.set(change.path, change)
    }

    for (const path of metricFilesChanged) {
      const normalized = path.trim()
      if (!normalized) {
        continue
      }
      if (!byPath.has(normalized)) {
        byPath.set(normalized, {
          path: normalized,
          additions: 0,
          deletions: 0
        })
      }
    }

    return Array.from(byPath.values())
  }

  private async resolveMonitoringPath(projectPath: string, worktree: string | null) {
    const projectRoot = resolve(projectPath)
    const worktreeName = typeof worktree === 'string' ? worktree.trim() : ''
    if (!worktreeName) {
      return projectRoot
    }

    const candidates = isAbsolute(worktreeName)
      ? [resolve(worktreeName)]
      : [
          resolve(projectRoot, 'workspaces', worktreeName),
          resolve(projectRoot, worktreeName)
        ]

    for (const candidate of candidates) {
      if (await this.isDirectory(candidate)) {
        return candidate
      }
    }

    return projectRoot
  }

  private async isDirectory(path: string) {
    try {
      const stats = await stat(path)
      return stats.isDirectory()
    } catch {
      return false
    }
  }

  private resolveFilePath(projectPath: string, filePath: string) {
    const trimmed = filePath.trim()
    if (!trimmed) {
      throw new MonitoringServiceError('BAD_REQUEST', 'File path is required')
    }

    if (isAbsolute(trimmed)) {
      throw new MonitoringServiceError('BAD_REQUEST', `Invalid file path: ${filePath}`)
    }

    const projectRoot = resolve(projectPath)
    const absolutePath = resolve(projectRoot, trimmed)
    const relativePath = relative(projectRoot, absolutePath)

    if (
      !relativePath ||
      relativePath.startsWith(`..${sep}`) ||
      relativePath === '..' ||
      isAbsolute(relativePath)
    ) {
      throw new MonitoringServiceError('BAD_REQUEST', `Invalid file path: ${filePath}`)
    }

    return {
      absolutePath,
      relativePath: relativePath.split(sep).join('/')
    }
  }

  private async requireProject(projectId: string) {
    const row = this.db.select().from(projects).where(eq(projects.id, projectId)).get()
    if (!row) {
      throw new MonitoringServiceError('NOT_FOUND', `Project not found: ${projectId}`)
    }
    return row
  }

  private async requireLoop(loopId: string) {
    const row = this.db.select().from(loopRuns).where(eq(loopRuns.id, loopId)).get()
    if (!row) {
      throw new MonitoringServiceError('NOT_FOUND', `Loop not found: ${loopId}`)
    }
    return row
  }
}
