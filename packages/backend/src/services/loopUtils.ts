import { basename } from 'node:path'

/**
 * Shared pure utility functions for LoopService modules.
 * These have no side-effects and no external dependencies.
 */

export type LoopBackend =
  | 'claude'
  | 'kiro'
  | 'gemini'
  | 'codex'
  | 'amp'
  | 'copilot'
  | 'opencode'

const PRIMARY_LOOP_ID_PATTERN = /^primary-\d{8}-\d{6}$/i
const EVENTS_FILE_PATTERN = /^events-(\d{8})-(\d{6})\.jsonl$/i

const OUTPUT_ITERATION_PATTERNS = [
  /\biteration\s+(\d+)\b/gi,
  /\(iteration\s+(\d+)\)/gi
]
const OUTPUT_TOKEN_PATTERNS = [
  /\btotal[_\s-]*tokens?\s*[:=]\s*([0-9][0-9,._]*)\b/gi,
  /\btokens?[_\s-]*used\s*[:=]\s*([0-9][0-9,._]*)\b/gi,
  /\bprompt[_\s-]*tokens?\s*[:=]\s*([0-9][0-9,._]*)\b/gi,
  /\bcompletion[_\s-]*tokens?\s*[:=]\s*([0-9][0-9,._]*)\b/gi,
  /\binput[_\s-]*tokens?\s*[:=]\s*([0-9][0-9,._]*)\b/gi,
  /\boutput[_\s-]*tokens?\s*[:=]\s*([0-9][0-9,._]*)\b/gi,
  /\btokens?\s*[:=]\s*([0-9][0-9,._]*)\b/gi
]

export function asNumber(value: unknown): number | undefined {
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

export function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined
}

export function asLoopId(value: unknown): string | undefined {
  return asString(value)
}

export function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined
  }

  return value as Record<string, unknown>
}

export function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }

  const items = value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)

  return items.length > 0 ? items : undefined
}

export function isPrimaryLoopId(value: string): boolean {
  return PRIMARY_LOOP_ID_PATTERN.test(value)
}

export function asPrimaryLoopId(value: unknown): string | undefined {
  const normalized = asLoopId(value)
  if (!normalized) {
    return undefined
  }

  return isPrimaryLoopId(normalized) ? normalized : undefined
}

export function primaryLoopIdFromEventsPath(value: string): string | undefined {
  const fileName = basename(value.trim())
  const match = EVENTS_FILE_PATTERN.exec(fileName)
  if (!match) {
    return undefined
  }

  return `primary-${match[1]}-${match[2]}`
}

export function eventsFileNameFromPrimaryLoopId(loopId: string): string | undefined {
  const match = PRIMARY_LOOP_ID_PATTERN.exec(loopId)
  if (!match) {
    return undefined
  }

  return `events-${match[1]}-${match[2]}.jsonl`
}

export function primaryLoopIdFromTimestamp(
  timestamp: number | null | undefined
): string | undefined {
  const ms = toMilliseconds(timestamp)
  if (ms === null) {
    return undefined
  }

  const date = new Date(ms)
  const pad = (value: number) => value.toString().padStart(2, '0')
  const datePart = `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`
  const timePart = `${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`
  return `primary-${datePart}-${timePart}`
}

export function asLoopBackend(value: unknown): LoopBackend | undefined {
  if (
    value === 'claude' ||
    value === 'kiro' ||
    value === 'gemini' ||
    value === 'codex' ||
    value === 'amp' ||
    value === 'copilot' ||
    value === 'opencode'
  ) {
    return value
  }

  return undefined
}

export function parseConfigRecord(config: string | null): Record<string, unknown> {
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

export function parsePersistedConfig(config: string | null) {
  const parsed = parseConfigRecord(config)
  return {
    config: asString(parsed.config),
    prompt: asString(parsed.prompt),
    promptFile: asString(parsed.promptFile),
    backend: asLoopBackend(parsed.backend),
    exclusive: Boolean(parsed.exclusive),
    worktree: asString(parsed.worktree),
    ralphLoopId: asString(parsed.ralphLoopId),
    startCommit: asString(parsed.startCommit),
    endCommit: asString(parsed.endCommit),
    outputLogFile: asString(parsed.outputLogFile)
  }
}

export function toMilliseconds(timestamp: number | null | undefined): number | null {
  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) {
    return null
  }

  // Backward compatibility for historical second-based persisted timestamps.
  return timestamp < 1_000_000_000_000 ? timestamp * 1_000 : timestamp
}

export function usesLiveRuntime(state: string): boolean {
  return state === 'running' || state === 'queued' || state === 'merging'
}

export function extractIterationCandidates(text: string): number[] {
  const values = new Set<number>()
  for (const pattern of OUTPUT_ITERATION_PATTERNS) {
    pattern.lastIndex = 0
    let match: RegExpExecArray | null
    match = pattern.exec(text)
    while (match) {
      const parsed = Number.parseInt(match[1] ?? '', 10)
      if (Number.isFinite(parsed) && parsed >= 0) {
        values.add(parsed)
      }
      match = pattern.exec(text)
    }
  }

  return [...values.values()]
}

export function parseMetricInteger(raw: string): number | undefined {
  const normalized = raw.replace(/[,_\s]/g, '')
  const parsed = Number.parseInt(normalized, 10)
  if (!Number.isFinite(parsed) || parsed < 0) {
    return undefined
  }
  return parsed
}

export function extractTokenCandidates(text: string): number[] {
  const values = new Set<number>()
  for (const pattern of OUTPUT_TOKEN_PATTERNS) {
    pattern.lastIndex = 0
    let match: RegExpExecArray | null
    match = pattern.exec(text)
    while (match) {
      const parsed = parseMetricInteger(match[1] ?? '')
      if (parsed !== undefined) {
        values.add(parsed)
      }
      match = pattern.exec(text)
    }
  }

  return [...values.values()]
}

export function uniqueLoopIds(loopIds: Array<string | undefined>): string[] {
  return [...new Set(loopIds.filter((loopId): loopId is string => Boolean(loopId)))]
}

export function isLikelyActiveLoopState(state: string): boolean {
  return usesLiveRuntime(state) || state === 'orphan' || state === 'needs-review'
}

export function readIterationValue(payload: Record<string, unknown>): number | undefined {
  return (
    asNumber(payload.iteration) ??
    asNumber(payload.iterations) ??
    asNumber(payload.iteration_count) ??
    asNumber(payload.current_iteration) ??
    asNumber(payload.currentIteration) ??
    asNumber(payload.loop_iteration) ??
    asNumber(payload.loopIteration) ??
    asNumber(payload.completed_iterations) ??
    asNumber(payload.completedIterations) ??
    asNumber(payload.total_iterations) ??
    asNumber(payload.totalIterations) ??
    asNumber(payload.iterationNumber)
  )
}
