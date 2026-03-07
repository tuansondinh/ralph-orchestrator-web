import { execFile as execFileCallback } from 'node:child_process'
import { constants } from 'node:fs'
import { access, stat } from 'node:fs/promises'
import { promisify } from 'node:util'
import { desc, eq } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { resolveRalphBinary, type ResolveRalphBinaryOptions } from '../lib/ralph.js'
import { loopRuns, projects, schema, settings } from '../db/schema.js'
import { ServiceError, type ServiceErrorCode } from '../lib/ServiceError.js'

type Database = BetterSQLite3Database<typeof schema>
const execFile = promisify(execFileCallback)
const RALPH_BINARY_SETTING_KEY = 'ralph.binaryPath'
const TASK_LIST_ARGS = ['tools', 'task', 'list', '--all', '--format', 'json']
const PRIMARY_LOOP_ID_PATTERN = /^primary-\d{8}-\d{6}$/i

export interface TaskRecord {
  id: string
  title: string
  description: string
  status: string
  priority: number | null
  blocked_by: string[]
  loop_id: string | null
  created: string | null
  closed: string | null
}

export interface TaskCommandOptions {
  cwd: string
}

export interface TaskCommandResult {
  stdout: string | Buffer
  stderr: string | Buffer
}

export type TaskCommandExecutor = (
  file: string,
  args: string[],
  options: TaskCommandOptions
) => Promise<TaskCommandResult>

export interface TaskServiceOptions {
  resolveBinary?: (options: ResolveRalphBinaryOptions) => Promise<string>
  execCommand?: TaskCommandExecutor
}

export class TaskServiceError extends ServiceError {
  constructor(code: ServiceErrorCode, message: string) {
    super(code, message)
    this.name = 'TaskServiceError'
  }
}

function toText(value: string | Buffer | undefined) {
  if (typeof value === 'string') {
    return value
  }

  if (value instanceof Buffer) {
    return value.toString('utf8')
  }

  return ''
}

function firstNonEmptyLine(text: string) {
  return text
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .find((line) => line.length > 0)
}

function asNullableString(value: unknown) {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function asPrimaryLoopId(value: unknown) {
  const normalized = asNullableString(value)
  if (!normalized) {
    return null
  }

  return PRIMARY_LOOP_ID_PATTERN.test(normalized) ? normalized : null
}

function toMilliseconds(timestamp: number | null | undefined) {
  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) {
    return null
  }

  return timestamp < 1_000_000_000_000 ? timestamp * 1_000 : timestamp
}

function primaryLoopIdFromTimestamp(timestamp: number | null | undefined) {
  const ms = toMilliseconds(timestamp)
  if (ms === null) {
    return null
  }

  const date = new Date(ms)
  const pad = (value: number) => value.toString().padStart(2, '0')
  const datePart = `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`
  const timePart = `${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`
  return `primary-${datePart}-${timePart}`
}

function asRequiredString(value: unknown, message: string) {
  const normalized = asNullableString(value)
  if (!normalized) {
    throw new TaskServiceError('BAD_REQUEST', message)
  }
  return normalized
}

function asPriority(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const parsed = Number(value.trim())
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }

  return null
}

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((entry) => asNullableString(entry))
    .filter((entry): entry is string => entry !== null)
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

function toTaskRecord(entry: unknown, index: number): TaskRecord {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    throw new TaskServiceError(
      'BAD_REQUEST',
      `Invalid task list item at index ${index}`
    )
  }

  const row = entry as Record<string, unknown>
  return {
    id: asRequiredString(
      row.id,
      `Task list item at index ${index} is missing a valid "id"`
    ),
    title: asRequiredString(
      row.title,
      `Task list item at index ${index} is missing a valid "title"`
    ),
    description: asNullableString(row.description) ?? '',
    status: asRequiredString(
      row.status,
      `Task list item at index ${index} is missing a valid "status"`
    ),
    priority: asPriority(row.priority),
    blocked_by: asStringArray(row.blocked_by),
    loop_id: asNullableString(row.loop_id),
    created: asNullableString(row.created),
    closed: asNullableString(row.closed)
  }
}

function getErrorOutput(error: unknown) {
  if (error && typeof error === 'object' && 'stderr' in error) {
    const stderr = toText((error as { stderr?: string | Buffer }).stderr)
    const sanitized = firstNonEmptyLine(stderr)
    if (sanitized) {
      return sanitized
    }
  }

  if (error instanceof Error) {
    const sanitized = firstNonEmptyLine(error.message)
    if (sanitized) {
      return sanitized
    }
  }

  return 'Unknown error'
}

async function defaultTaskCommandExecutor(
  file: string,
  args: string[],
  options: TaskCommandOptions
): Promise<TaskCommandResult> {
  return execFile(file, args, {
    cwd: options.cwd,
    encoding: 'utf8'
  })
}

export class TaskService {
  private readonly resolveBinary: (
    options: ResolveRalphBinaryOptions
  ) => Promise<string>
  private readonly execCommand: TaskCommandExecutor

  constructor(
    private readonly db: Database,
    options: TaskServiceOptions = {}
  ) {
    this.resolveBinary = options.resolveBinary ?? resolveRalphBinary
    this.execCommand = options.execCommand ?? defaultTaskCommandExecutor
  }

  async list(projectId: string): Promise<TaskRecord[]> {
    const project = this.db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .get()

    if (!project) {
      throw new TaskServiceError('NOT_FOUND', `Project not found: ${projectId}`)
    }

    await this.assertProjectPathAccessible(project.path)

    let binaryPath: string
    try {
      binaryPath = await this.resolveBinary({
        cwd: project.path,
        customPath: this.getConfiguredBinaryPath()
      })
    } catch (error) {
      throw new TaskServiceError(
        'BAD_REQUEST',
        error instanceof Error ? error.message : 'Unable to resolve Ralph binary'
      )
    }

    let stdout: string
    try {
      const output = await this.execCommand(binaryPath, [...TASK_LIST_ARGS], {
        cwd: project.path
      })
      stdout = toText(output.stdout)
    } catch (error) {
      throw new TaskServiceError(
        'BAD_REQUEST',
        `Failed to list tasks: ${getErrorOutput(error)}`
      )
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(stdout)
    } catch {
      throw new TaskServiceError(
        'BAD_REQUEST',
        'Invalid JSON from Ralph task list command'
      )
    }

    if (!Array.isArray(parsed)) {
      throw new TaskServiceError(
        'BAD_REQUEST',
        'Invalid JSON from Ralph task list command: expected an array'
      )
    }

    const tasks = parsed.map((entry, index) => toTaskRecord(entry, index))
    const loopIdMap = this.buildProjectLoopIdMap(projectId)

    return tasks.map((task) => ({
      ...task,
      loop_id: task.loop_id ? (loopIdMap.get(task.loop_id) ?? task.loop_id) : null
    }))
  }

  private buildProjectLoopIdMap(projectId: string) {
    const rows = this.db
      .select({
        id: loopRuns.id,
        ralphLoopId: loopRuns.ralphLoopId,
        config: loopRuns.config,
        startedAt: loopRuns.startedAt
      })
      .from(loopRuns)
      .where(eq(loopRuns.projectId, projectId))
      .orderBy(desc(loopRuns.startedAt))
      .all()

    const map = new Map<string, string>()
    for (const row of rows) {
      if (!map.has(row.id)) {
        map.set(row.id, row.id)
      }

      const config = parseConfigRecord(row.config)
      const persistedRalphLoopId = asNullableString(row.ralphLoopId)
      if (persistedRalphLoopId && !map.has(persistedRalphLoopId)) {
        map.set(persistedRalphLoopId, row.id)
      }

      const configRalphLoopId = asNullableString(config.ralphLoopId)
      if (configRalphLoopId && !map.has(configRalphLoopId)) {
        map.set(configRalphLoopId, row.id)
      }

      const canonicalPrimaryLoopId =
        asPrimaryLoopId(row.ralphLoopId) ??
        asPrimaryLoopId(config.ralphLoopId) ??
        primaryLoopIdFromTimestamp(row.startedAt)
      if (canonicalPrimaryLoopId && !map.has(canonicalPrimaryLoopId)) {
        map.set(canonicalPrimaryLoopId, row.id)
      }
    }

    return map
  }

  private getConfiguredBinaryPath() {
    const configured = this.db
      .select({ value: settings.value })
      .from(settings)
      .where(eq(settings.key, RALPH_BINARY_SETTING_KEY))
      .get()
      ?.value
      ?.trim()

    return configured && configured.length > 0 ? configured : undefined
  }

  private async assertProjectPathAccessible(projectPath: string) {
    let projectStats
    try {
      projectStats = await stat(projectPath)
    } catch {
      throw new TaskServiceError(
        'BAD_REQUEST',
        `Project path is not accessible: ${projectPath}`
      )
    }

    if (!projectStats.isDirectory()) {
      throw new TaskServiceError(
        'BAD_REQUEST',
        `Project path is not a directory: ${projectPath}`
      )
    }

    try {
      await access(projectPath, constants.R_OK | constants.X_OK)
    } catch {
      throw new TaskServiceError(
        'BAD_REQUEST',
        `Project path is not accessible: ${projectPath}`
      )
    }
  }
}
