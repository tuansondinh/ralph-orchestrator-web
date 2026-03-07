import { access, readdir, readFile, stat } from 'node:fs/promises'
import { basename, dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

type ServiceErrorCode = 'BAD_REQUEST' | 'NOT_FOUND'

const YAML_EXTENSIONS = new Set(['.yml', '.yaml'])

function toPosixPath(path: string) {
  return path.split(sep).join('/')
}

function removeExtension(filename: string) {
  const extension = extname(filename)
  return filename.slice(0, filename.length - extension.length)
}

function isYamlFilename(filename: string) {
  return YAML_EXTENSIONS.has(extname(filename).toLowerCase())
}

function normalizePresetId(id: string) {
  const normalized = id.trim().replace(/\\/g, '/')

  if (!normalized || !isYamlFilename(normalized)) {
    return null
  }

  if (normalized.startsWith('/') || normalized.split('/').some((part) => part === '..')) {
    return null
  }

  return normalized
}

function defaultCandidateDirectories() {
  const envOverride = process.env.RALPH_UI_HATS_PRESETS_DIR?.trim()
  const builtinPresetsDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../presets')
  const candidates = [
    envOverride && envOverride.length > 0 ? envOverride : null,
    builtinPresetsDir
  ]

  return candidates.filter((candidate): candidate is string => Boolean(candidate))
}

export interface HatsPresetSummary {
  id: string
  name: string
}

export interface HatsPresetList {
  sourceDirectory: string
  presets: HatsPresetSummary[]
}

export interface HatsPresetDetail {
  id: string
  name: string
  sourceDirectory: string
  content: string
}

export class HatsPresetServiceError extends Error {
  code: ServiceErrorCode

  constructor(code: ServiceErrorCode, message: string) {
    super(message)
    this.name = 'HatsPresetServiceError'
    this.code = code
  }
}

export class HatsPresetService {
  constructor(private readonly candidateDirectories = defaultCandidateDirectories()) {}

  async list(): Promise<HatsPresetList> {
    const sourceDirectory = await this.resolveSourceDirectory()
    const presetIds: string[] = []
    await this.collectPresetIds(sourceDirectory, sourceDirectory, presetIds)

    const presets = presetIds
      .sort((left, right) => left.localeCompare(right))
      .map((id) => ({
        id,
        name: removeExtension(basename(id))
      }))

    return {
      sourceDirectory,
      presets
    }
  }

  async get(id: string): Promise<HatsPresetDetail> {
    const sourceDirectory = await this.resolveSourceDirectory()
    const normalizedId = normalizePresetId(id)
    if (!normalizedId) {
      throw new HatsPresetServiceError('BAD_REQUEST', `Invalid preset id: ${id}`)
    }

    const absolutePath = resolve(sourceDirectory, normalizedId)
    const relativePath = relative(sourceDirectory, absolutePath)
    if (
      !relativePath ||
      relativePath.startsWith(`..${sep}`) ||
      relativePath === '..' ||
      isAbsolute(relativePath)
    ) {
      throw new HatsPresetServiceError('BAD_REQUEST', `Invalid preset id: ${id}`)
    }

    try {
      await access(absolutePath)
    } catch {
      throw new HatsPresetServiceError('NOT_FOUND', `Preset not found: ${normalizedId}`)
    }

    const content = await readFile(absolutePath, 'utf8')
    return {
      id: toPosixPath(relativePath),
      name: removeExtension(basename(relativePath)),
      sourceDirectory,
      content
    }
  }

  private async resolveSourceDirectory() {
    for (const candidate of this.candidateDirectories) {
      try {
        const info = await stat(candidate)
        if (info.isDirectory()) {
          return resolve(candidate)
        }
      } catch {
        // Ignore missing candidates and continue.
      }
    }

    throw new HatsPresetServiceError(
      'NOT_FOUND',
      `Hats presets directory not found. Checked: ${this.candidateDirectories.join(', ')}`
    )
  }

  private async collectPresetIds(
    currentDirectory: string,
    sourceDirectory: string,
    presetIds: string[]
  ) {
    const entries = await readdir(currentDirectory, { withFileTypes: true })
    for (const entry of entries) {
      const entryPath = resolve(currentDirectory, entry.name)
      if (entry.isDirectory()) {
        await this.collectPresetIds(entryPath, sourceDirectory, presetIds)
        continue
      }

      if (!entry.isFile() || !isYamlFilename(entry.name)) {
        continue
      }

      const relativePath = relative(sourceDirectory, entryPath)
      if (
        !relativePath ||
        relativePath.startsWith(`..${sep}`) ||
        relativePath === '..' ||
        isAbsolute(relativePath)
      ) {
        continue
      }

      presetIds.push(toPosixPath(relativePath))
    }
  }
}
