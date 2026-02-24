import { spawn } from 'node:child_process'
import { eq } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import {
  chatMessages,
  chatSessions,
  loopRuns,
  notifications,
  projects,
  schema,
  settings
} from '../db/schema.js'
import { resolveRalphBinary } from '../lib/ralph.js'

type ServiceErrorCode = 'BAD_REQUEST'
type Database = BetterSQLite3Database<typeof schema>

const DEFAULT_PORT_START = 3001
const DEFAULT_PORT_END = 3010
const DEFAULT_PREVIEW_BASE_URL = 'http://localhost'
const DEFAULT_PRESET_FILENAME = 'ralph.yml'

const SETTING_KEYS = {
  ralphBinaryPath: 'ralph.binaryPath',
  notifyLoopComplete: 'notifications.loopComplete.enabled',
  notifyLoopFailed: 'notifications.loopFailed.enabled',
  notifyNeedsInput: 'notifications.needsInput.enabled',
  previewPortStart: 'preview.portStart',
  previewPortEnd: 'preview.portEnd',
  previewBaseUrl: 'preview.baseUrl',
  previewCommand: 'preview.command',
  dbPath: 'db.path',
  defaultPreset: 'ralph.defaultPreset'
} as const

export interface PreviewSettingsSnapshot {
  baseUrl: string
  command: string | null
}

export interface SettingsSnapshot {
  ralphBinaryPath: string | null
  notifications: {
    loopComplete: boolean
    loopFailed: boolean
    needsInput: boolean
  }
  preview: {
    portStart: number
    portEnd: number
    baseUrl: string
    command: string | null
  }
  data: {
    dbPath: string
  }
}

export interface SettingsUpdateInput {
  ralphBinaryPath?: string | null
  notifications?: {
    loopComplete?: boolean
    loopFailed?: boolean
    needsInput?: boolean
  }
  preview?: {
    portStart?: number
    portEnd?: number
    baseUrl?: string | null
    command?: string | null
  }
}

export interface BinaryTestResult {
  path: string
  version: string
}

export class SettingsServiceError extends Error {
  code: ServiceErrorCode

  constructor(code: ServiceErrorCode, message: string) {
    super(message)
    this.name = 'SettingsServiceError'
    this.code = code
  }
}

function parseBoolean(value: string | undefined, defaultValue: boolean) {
  if (value === undefined) {
    return defaultValue
  }

  const normalized = value.trim().toLowerCase()
  if (normalized === '1' || normalized === 'true' || normalized === 'yes') {
    return true
  }

  if (normalized === '0' || normalized === 'false' || normalized === 'no') {
    return false
  }

  return defaultValue
}

function parseInteger(value: string | undefined, defaultValue: number) {
  if (value === undefined) {
    return defaultValue
  }

  const parsed = Number(value.trim())
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return defaultValue
  }

  return parsed
}

function normalizePath(value: string | null | undefined) {
  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim()
  return normalized.length > 0 ? normalized : null
}

function stripTrailingSlash(url: string) {
  return url.endsWith('/') ? url.slice(0, -1) : url
}

function normalizePreviewBaseUrl(raw: string, fallback = DEFAULT_PREVIEW_BASE_URL) {
  try {
    const parsed = new URL(raw)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('Preview base URL must use http(s)')
    }

    if (
      parsed.hostname === '127.0.0.1' ||
      parsed.hostname === '0.0.0.0' ||
      parsed.hostname === '::' ||
      parsed.hostname === '[::]' ||
      parsed.hostname === '::1' ||
      parsed.hostname === '[::1]'
    ) {
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

function runBinaryVersion(binaryPath: string, timeoutMs = 4_000) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(binaryPath, ['--version'], {
      stdio: ['ignore', 'pipe', 'pipe']
    })

    let stdout = ''
    let stderr = ''
    let settled = false
    const timeout = setTimeout(() => {
      if (settled) {
        return
      }

      settled = true
      child.kill('SIGKILL')
      reject(
        new Error(`Timed out after ${timeoutMs}ms while running "${binaryPath} --version"`)
      )
    }, timeoutMs)

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8')
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8')
    })

    child.once('error', (error) => {
      if (settled) {
        return
      }

      settled = true
      clearTimeout(timeout)
      reject(error)
    })

    child.once('close', (code) => {
      if (settled) {
        return
      }

      settled = true
      clearTimeout(timeout)

      const output = `${stdout}\n${stderr}`.trim()
      if (code !== 0) {
        reject(
          new Error(
            output.length > 0
              ? output
              : `Command exited with code ${code ?? 'unknown'}`
          )
        )
        return
      }

      resolve(output.length > 0 ? output.split(/\r?\n/)[0].trim() : 'ok')
    })
  })
}

export class SettingsService {
  constructor(private readonly db: Database) {}

  async get(): Promise<SettingsSnapshot> {
    const map = this.readMap()
    const configuredPreviewStart = parseInteger(
      map.get(SETTING_KEYS.previewPortStart),
      DEFAULT_PORT_START
    )
    const configuredPreviewEnd = parseInteger(
      map.get(SETTING_KEYS.previewPortEnd),
      DEFAULT_PORT_END
    )

    const previewPortStart = Math.min(configuredPreviewStart, configuredPreviewEnd)
    const previewPortEnd = Math.max(configuredPreviewStart, configuredPreviewEnd)
    const previewBaseUrl = normalizePreviewBaseUrl(
      map.get(SETTING_KEYS.previewBaseUrl) ?? DEFAULT_PREVIEW_BASE_URL
    )
    const previewCommand = normalizePath(map.get(SETTING_KEYS.previewCommand))

    return {
      ralphBinaryPath: normalizePath(map.get(SETTING_KEYS.ralphBinaryPath)),
      notifications: {
        loopComplete: parseBoolean(map.get(SETTING_KEYS.notifyLoopComplete), true),
        loopFailed: parseBoolean(map.get(SETTING_KEYS.notifyLoopFailed), true),
        needsInput: parseBoolean(map.get(SETTING_KEYS.notifyNeedsInput), true)
      },
      preview: {
        portStart: previewPortStart,
        portEnd: previewPortEnd,
        baseUrl: previewBaseUrl,
        command: previewCommand
      },
      data: {
        dbPath: map.get(SETTING_KEYS.dbPath) ?? ''
      }
    }
  }

  async update(input: SettingsUpdateInput): Promise<SettingsSnapshot> {
    if (input.preview?.portStart !== undefined) {
      this.assertValidPort('preview.portStart', input.preview.portStart)
    }

    if (input.preview?.portEnd !== undefined) {
      this.assertValidPort('preview.portEnd', input.preview.portEnd)
    }

    const previewStart = input.preview?.portStart
    const previewEnd = input.preview?.portEnd
    if (
      previewStart !== undefined &&
      previewEnd !== undefined &&
      previewStart > previewEnd
    ) {
      throw new SettingsServiceError(
        'BAD_REQUEST',
        'Preview port start must be less than or equal to port end'
      )
    }

    if (input.preview?.baseUrl !== undefined) {
      const configuredBaseUrl = normalizePath(input.preview.baseUrl)
      if (configuredBaseUrl) {
        try {
          const parsed = new URL(configuredBaseUrl)
          if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            throw new Error('Unsupported protocol')
          }
        } catch {
          throw new SettingsServiceError(
            'BAD_REQUEST',
            'preview.baseUrl must be a valid http(s) URL'
          )
        }
      }
    }

    if (input.ralphBinaryPath !== undefined) {
      const normalized = normalizePath(input.ralphBinaryPath)
      if (normalized) {
        await this.upsert(SETTING_KEYS.ralphBinaryPath, normalized)
      } else {
        await this.remove(SETTING_KEYS.ralphBinaryPath)
      }
    }

    if (input.notifications?.loopComplete !== undefined) {
      await this.upsert(
        SETTING_KEYS.notifyLoopComplete,
        input.notifications.loopComplete ? '1' : '0'
      )
    }

    if (input.notifications?.loopFailed !== undefined) {
      await this.upsert(
        SETTING_KEYS.notifyLoopFailed,
        input.notifications.loopFailed ? '1' : '0'
      )
    }

    if (input.notifications?.needsInput !== undefined) {
      await this.upsert(
        SETTING_KEYS.notifyNeedsInput,
        input.notifications.needsInput ? '1' : '0'
      )
    }

    if (input.preview?.portStart !== undefined) {
      await this.upsert(SETTING_KEYS.previewPortStart, String(input.preview.portStart))
    }

    if (input.preview?.portEnd !== undefined) {
      await this.upsert(SETTING_KEYS.previewPortEnd, String(input.preview.portEnd))
    }

    if (input.preview?.baseUrl !== undefined) {
      const normalized = normalizePath(input.preview.baseUrl)
      if (normalized) {
        await this.upsert(SETTING_KEYS.previewBaseUrl, normalizePreviewBaseUrl(normalized))
      } else {
        await this.remove(SETTING_KEYS.previewBaseUrl)
      }
    }

    if (input.preview?.command !== undefined) {
      const normalized = normalizePath(input.preview.command)
      if (normalized) {
        await this.upsert(SETTING_KEYS.previewCommand, normalized)
      } else {
        await this.remove(SETTING_KEYS.previewCommand)
      }
    }

    return this.get()
  }

  async getPreviewSettings(): Promise<PreviewSettingsSnapshot> {
    const snapshot = await this.get()
    return {
      baseUrl: snapshot.preview.baseUrl,
      command: snapshot.preview.command
    }
  }

  async updatePreviewSettings(input: {
    baseUrl?: string | null
    command?: string | null
  }): Promise<PreviewSettingsSnapshot> {
    const updated = await this.update({
      preview: {
        baseUrl: input.baseUrl,
        command: input.command
      }
    })

    return {
      baseUrl: updated.preview.baseUrl,
      command: updated.preview.command
    }
  }

  async getDefaultPreset(): Promise<string> {
    const configured = this.readMap().get(SETTING_KEYS.defaultPreset)
    const normalized = configured?.trim()
    if (!normalized) {
      return DEFAULT_PRESET_FILENAME
    }

    return normalized
  }

  async setDefaultPreset(filename: string): Promise<string> {
    const normalized = filename.trim()
    if (!normalized) {
      throw new SettingsServiceError('BAD_REQUEST', 'Default preset filename is required')
    }

    await this.upsert(SETTING_KEYS.defaultPreset, normalized)
    return normalized
  }

  async testBinary(path?: string): Promise<BinaryTestResult> {
    const candidate = normalizePath(path)
    let binaryPath: string
    try {
      binaryPath = await resolveRalphBinary({
        customPath: candidate ?? this.readMap().get(SETTING_KEYS.ralphBinaryPath)
      })
    } catch (error) {
      throw new SettingsServiceError(
        'BAD_REQUEST',
        error instanceof Error ? error.message : 'Unable to resolve Ralph binary'
      )
    }

    try {
      const version = await runBinaryVersion(binaryPath)
      return {
        path: binaryPath,
        version
      }
    } catch (error) {
      throw new SettingsServiceError(
        'BAD_REQUEST',
        error instanceof Error
          ? `Unable to validate Ralph binary: ${error.message}`
          : 'Unable to validate Ralph binary'
      )
    }
  }

  async clearData(confirm: boolean) {
    if (!confirm) {
      throw new SettingsServiceError(
        'BAD_REQUEST',
        'Clear data requires explicit confirmation'
      )
    }

    await this.db.delete(chatMessages).run()
    await this.db.delete(chatSessions).run()
    await this.db.delete(loopRuns).run()
    await this.db.delete(notifications).run()
    await this.db.delete(projects).run()

    return { cleared: true as const }
  }

  private readMap() {
    return new Map(
      this.db
        .select()
        .from(settings)
        .all()
        .map((row) => [row.key, row.value])
    )
  }

  private async upsert(key: string, value: string) {
    await this.db
      .insert(settings)
      .values({ key, value })
      .onConflictDoUpdate({
        target: settings.key,
        set: { value }
      })
      .run()
  }

  private async remove(key: string) {
    await this.db.delete(settings).where(eq(settings.key, key)).run()
  }

  private assertValidPort(field: string, value: number) {
    if (!Number.isInteger(value) || value <= 0 || value > 65535) {
      throw new SettingsServiceError(
        'BAD_REQUEST',
        `${field} must be an integer between 1 and 65535`
      )
    }
  }
}
