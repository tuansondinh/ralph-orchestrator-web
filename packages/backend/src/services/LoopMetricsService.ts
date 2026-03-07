import { isAbsolute, join } from 'node:path'
import { readFile, readdir } from 'node:fs/promises'
import { eq } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { loopRuns, projects, schema, type LoopRun } from '../db/schema.js'
import {
  asNumber,
  asRecord,
  asString,
  asStringArray,
  asPrimaryLoopId,
  eventsFileNameFromPrimaryLoopId,
  extractIterationCandidates,
  extractTokenCandidates,
  parsePersistedConfig,
  primaryLoopIdFromTimestamp,
  readIterationValue,
  toMilliseconds,
  usesLiveRuntime
} from './loopUtils.js'
import { LoopDiffService } from './LoopDiffService.js'

type Database = BetterSQLite3Database<typeof schema>

export interface LoopMetrics {
  iterations: number
  runtime: number
  tokensUsed: number
  errors: number
  lastOutputSize: number
  filesChanged: string[]
}

export class LoopMetricsService {
  private readonly diffService: LoopDiffService

  constructor(
    private readonly db: Database,
    private readonly now: () => Date
  ) {
    this.diffService = new LoopDiffService(db)
  }

  async getMetrics(
    run: LoopRun,
    project: { id: string; path: string },
    runtimeData?: { active: boolean; iterations: number }
  ): Promise<LoopMetrics> {
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

    const isActive = runtimeData?.active ?? false
    const shouldUseLiveMetricFiles = isActive || usesLiveRuntime(run.state)

    if (runtimeData) {
      metrics.iterations = Math.max(metrics.iterations, runtimeData.iterations)
    }

    if (!shouldUseLiveMetricFiles) {
      if (metrics.iterations === 0) {
        const fromOutputLog = await this.readIterationsFromLoopOutputLog(
          project.path,
          run.config
        )
        if (fromOutputLog !== undefined) {
          metrics.iterations = Math.max(metrics.iterations, fromOutputLog)
        }
      }

      const tokensFromOutputLog = await this.readTokensFromLoopOutputLog(
        project.path,
        run.config
      )
      if (tokensFromOutputLog !== undefined) {
        metrics.tokensUsed = Math.max(metrics.tokensUsed, tokensFromOutputLog)
      }

      const tokensFromEvents = await this.readTokensFromLoopEvents(project.path, run)
      if (tokensFromEvents !== undefined) {
        metrics.tokensUsed = Math.max(metrics.tokensUsed, tokensFromEvents)
      }

      return metrics
    }

    const fromDisk = await this.readLiveMetrics(run, project.path)
    return {
      iterations: Math.max(metrics.iterations, fromDisk.iterations ?? 0),
      runtime: Math.max(metrics.runtime, fromDisk.runtime ?? 0),
      tokensUsed: Math.max(metrics.tokensUsed, fromDisk.tokensUsed ?? 0),
      errors: Math.max(metrics.errors, fromDisk.errors ?? 0),
      lastOutputSize: fromDisk.lastOutputSize ?? metrics.lastOutputSize,
      filesChanged: fromDisk.filesChanged ?? metrics.filesChanged
    }
  }

  async readTokensFromLoopOutputLog(
    projectPath: string,
    config: string | null
  ): Promise<number | undefined> {
    const persistedConfig = parsePersistedConfig(config)
    if (!persistedConfig.outputLogFile) {
      return undefined
    }

    const outputPath = join(projectPath, persistedConfig.outputLogFile)
    let raw: string
    try {
      raw = await readFile(outputPath, 'utf8')
    } catch {
      return undefined
    }

    let maxTokens: number | undefined
    for (const line of raw.split(/\r?\n/)) {
      if (!line) {
        continue
      }

      const candidates = extractTokenCandidates(line)
      for (const candidate of candidates) {
        maxTokens = Math.max(maxTokens ?? 0, candidate)
      }
    }

    return maxTokens
  }

  async readTokensFromLoopEvents(
    projectPath: string,
    run: LoopRun
  ): Promise<number | undefined> {
    const loopId = this.canonicalRalphLoopIdForRun(run)
    if (!loopId) {
      return undefined
    }

    const eventsFileName = eventsFileNameFromPrimaryLoopId(loopId)
    if (!eventsFileName) {
      return undefined
    }

    const roots = await this.resolveLiveMetricRoots(projectPath, run)
    let maxTokens: number | undefined
    for (const root of roots) {
      const fromRoot = await this.readTokensFromEventsFile(
        join(root, '.ralph', eventsFileName)
      )
      if (fromRoot !== undefined) {
        maxTokens = Math.max(maxTokens ?? 0, fromRoot)
      }
    }

    return maxTokens
  }

  private async readLiveMetrics(
    run: LoopRun,
    projectPath: string
  ): Promise<Partial<LoopMetrics>> {
    const roots = await this.resolveLiveMetricRoots(projectPath, run)
    const metrics: Partial<LoopMetrics> = {}

    for (const root of roots) {
      const fromAgentDir = await this.readMetricsDirectory(join(root, '.agent', 'metrics'))
      this.mergeMetrics(metrics, fromAgentDir)

      const fromRalphDir = await this.readMetricsDirectory(join(root, '.ralph', 'metrics'))
      this.mergeMetrics(metrics, fromRalphDir)

      const fromEvents = await this.readIterationsFromCurrentEvents(root)
      if (fromEvents !== undefined) {
        metrics.iterations = Math.max(metrics.iterations ?? 0, fromEvents)
      }
    }

    return metrics
  }

  private mergeMetrics(target: Partial<LoopMetrics>, source: Partial<LoopMetrics>) {
    if (source.iterations !== undefined) {
      target.iterations = Math.max(target.iterations ?? 0, source.iterations)
    }
    if (source.runtime !== undefined) {
      target.runtime = Math.max(target.runtime ?? 0, source.runtime)
    }
    if (source.tokensUsed !== undefined) {
      target.tokensUsed = Math.max(target.tokensUsed ?? 0, source.tokensUsed)
    }
    if (source.errors !== undefined) {
      target.errors = Math.max(target.errors ?? 0, source.errors)
    }
    if (source.lastOutputSize !== undefined) {
      target.lastOutputSize = Math.max(target.lastOutputSize ?? 0, source.lastOutputSize)
    }
    if (source.filesChanged !== undefined) {
      target.filesChanged = source.filesChanged
    }
  }

  private async resolveLiveMetricRoots(projectPath: string, run: LoopRun): Promise<string[]> {
    const roots = new Set<string>([projectPath])
    const persistedConfig = parsePersistedConfig(run.config)
    const worktreeBranch = run.worktree ?? persistedConfig.worktree
    if (worktreeBranch) {
      const resolvedWorktreePath = await this.diffService.resolveWorktreePath(
        projectPath,
        worktreeBranch
      )
      if (resolvedWorktreePath) {
        roots.add(resolvedWorktreePath)
      }
      roots.add(join(projectPath, '.worktrees', worktreeBranch))
    }

    return [...roots.values()]
  }

  private async readIterationsFromLoopOutputLog(
    projectPath: string,
    config: string | null
  ): Promise<number | undefined> {
    const persistedConfig = parsePersistedConfig(config)
    if (!persistedConfig.outputLogFile) {
      return undefined
    }

    const outputPath = join(projectPath, persistedConfig.outputLogFile)
    let raw: string
    try {
      raw = await readFile(outputPath, 'utf8')
    } catch {
      return undefined
    }

    let maxIteration: number | undefined
    for (const line of raw.split(/\r?\n/)) {
      if (!line) {
        continue
      }
      const candidates = extractIterationCandidates(line)
      for (const candidate of candidates) {
        maxIteration = Math.max(maxIteration ?? 0, candidate)
      }
    }

    return maxIteration
  }

  private canonicalRalphLoopIdForRun(run: LoopRun): string | null {
    const persistedConfig = parsePersistedConfig(run.config)
    return (
      asPrimaryLoopId(run.ralphLoopId) ??
      asPrimaryLoopId(persistedConfig.ralphLoopId) ??
      primaryLoopIdFromTimestamp(run.startedAt) ??
      null
    )
  }

  private async readTokensFromEventsFile(filePath: string): Promise<number | undefined> {
    let raw: string
    try {
      raw = await readFile(filePath, 'utf8')
    } catch {
      return undefined
    }

    const metrics: Partial<LoopMetrics> = {}
    for (const line of raw.split(/\r?\n/)) {
      const normalized = line.trim()
      if (!normalized) {
        continue
      }

      let parsed: unknown
      try {
        parsed = JSON.parse(normalized)
      } catch {
        continue
      }

      const entry = asRecord(parsed)
      if (!entry) {
        continue
      }

      this.applyMetricValue(metrics, 'event', entry)
    }

    return metrics.tokensUsed
  }

  private async readIterationsFromCurrentEvents(
    projectPath: string
  ): Promise<number | undefined> {
    const currentEventsPath = join(projectPath, '.ralph', 'current-events')
    let markerRaw: string
    try {
      markerRaw = await readFile(currentEventsPath, 'utf8')
    } catch {
      markerRaw = ''
    }

    const marker = markerRaw.trim()
    if (marker) {
      const eventPath = isAbsolute(marker) ? marker : join(projectPath, marker)
      const fromMarker = await this.readIterationsFromEventFile(eventPath)
      if (fromMarker !== undefined) {
        return fromMarker
      }
    }

    const ralphDir = join(projectPath, '.ralph')
    let entries
    try {
      entries = await readdir(ralphDir, { withFileTypes: true })
    } catch {
      return undefined
    }

    const latestEventFile = entries
      .filter((entry) => entry.isFile() && /^events-.*\.jsonl$/i.test(entry.name))
      .map((entry) => entry.name)
      .sort()
      .at(-1)

    if (!latestEventFile) {
      return undefined
    }

    return this.readIterationsFromEventFile(join(ralphDir, latestEventFile))
  }

  private async readIterationsFromEventFile(filePath: string): Promise<number | undefined> {
    let raw: string
    try {
      raw = await readFile(filePath, 'utf8')
    } catch {
      return undefined
    }

    let maxIteration: number | undefined
    for (const line of raw.split(/\r?\n/)) {
      const normalized = line.trim()
      if (!normalized) {
        continue
      }

      let parsed: unknown
      try {
        parsed = JSON.parse(normalized)
      } catch {
        continue
      }
      const entry = asRecord(parsed)
      if (!entry) {
        continue
      }

      const entryIteration = readIterationValue(entry)
      if (entryIteration !== undefined) {
        const rounded = Math.max(0, Math.floor(entryIteration))
        maxIteration = Math.max(maxIteration ?? 0, rounded)
      }
    }

    return maxIteration
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

  private applyMetricValue(metrics: Partial<LoopMetrics>, key: string, value: unknown) {
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

    if (
      [
        'iterations',
        'iteration',
        'iteration_count',
        'current_iteration',
        'currentiteration',
        'loop_iteration',
        'loopiteration',
        'total_iterations',
        'totaliterations',
        'completed_iterations',
        'completediterations',
        'iterationnumber'
      ].includes(normalizedKey)
    ) {
      if (numericValue !== undefined) {
        metrics.iterations = Math.max(
          metrics.iterations ?? 0,
          Math.max(0, Math.floor(numericValue))
        )
      }
      return
    }

    if (['runtime', 'runtime_seconds'].includes(normalizedKey)) {
      if (numericValue !== undefined) {
        metrics.runtime = Math.max(
          metrics.runtime ?? 0,
          Math.max(0, Math.floor(numericValue))
        )
      }
      return
    }

    if (
      ['tokens_used', 'tokensused', 'tokens', 'total_tokens', 'totaltokens'].includes(
        normalizedKey
      )
    ) {
      if (numericValue !== undefined) {
        metrics.tokensUsed = Math.max(
          metrics.tokensUsed ?? 0,
          Math.max(0, Math.floor(numericValue))
        )
      }
      return
    }

    if (['errors', 'error_count', 'errorcount'].includes(normalizedKey)) {
      if (numericValue !== undefined) {
        metrics.errors = Math.max(
          metrics.errors ?? 0,
          Math.max(0, Math.floor(numericValue))
        )
      }
      return
    }

    if (['last_output_size', 'lastoutputsize'].includes(normalizedKey)) {
      if (numericValue !== undefined) {
        metrics.lastOutputSize = Math.max(
          metrics.lastOutputSize ?? 0,
          Math.max(0, Math.floor(numericValue))
        )
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
}
