import { access, mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import {
  basename,
  dirname,
  extname,
  relative,
  resolve,
  sep
} from 'node:path'
import { fileURLToPath } from 'node:url'

type ServiceErrorCode = 'BAD_REQUEST' | 'NOT_FOUND'

const YAML_EXTENSIONS = new Set(['.yml', '.yaml'])
const DEFAULT_PRESET_DIRECTORY = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../presets'
)
const DEFAULT_WORKING_DIRECTORY_PRESET_CANDIDATES = [
  resolve(process.cwd(), 'presets'),
  resolve(process.cwd(), 'packages', 'backend', 'presets')
]
const DEFAULT_BUILD_OUTPUT_PRESET_DIRECTORY = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../presets'
)
const CUSTOM_PRESETS_DIRECTORY = resolve(DEFAULT_PRESET_DIRECTORY, 'custom')

function defaultPresetDirectories() {
  const deduped = new Set<string>([
    resolve(DEFAULT_PRESET_DIRECTORY),
    resolve(DEFAULT_BUILD_OUTPUT_PRESET_DIRECTORY),
    ...DEFAULT_WORKING_DIRECTORY_PRESET_CANDIDATES
  ])

  return Array.from(deduped)
}

export interface PresetSummary {
  name: string
  filename: string
}

export class PresetServiceError extends Error {
  code: ServiceErrorCode

  constructor(code: ServiceErrorCode, message: string) {
    super(message)
    this.name = 'PresetServiceError'
    this.code = code
  }
}

function isYamlFilename(filename: string) {
  return YAML_EXTENSIONS.has(extname(filename).toLowerCase())
}

function toPresetName(filename: string) {
  const extension = extname(filename)
  return filename.slice(0, filename.length - extension.length)
}

function toPosixPath(path: string) {
  return path.split(sep).join('/')
}

function isValidPresetName(name: string) {
  return /^[a-zA-Z0-9][a-zA-Z0-9\-_]*$/.test(name)
}

function isSafeRelativePath(path: string) {
  return Boolean(
    path &&
      path !== '..' &&
      !path.startsWith(`..${sep}`) &&
      !path.startsWith('../')
  )
}

function normalizePresetFilename(filename: string) {
  const normalized = filename.trim().replace(/\\/g, '/')
  if (!normalized || !isYamlFilename(normalized)) {
    return null
  }

  const parts = normalized.split('/')
  if (
    normalized.startsWith('/') ||
    parts.some((part) => part.length === 0 || part === '.' || part === '..')
  ) {
    return null
  }

  return normalized
}

export class PresetService {
  private readonly presetDirectories: string[]

  constructor(presetDirectories: string | string[] = defaultPresetDirectories()) {
    const directories = Array.isArray(presetDirectories)
      ? presetDirectories
      : [presetDirectories]
    this.presetDirectories = directories.map((directory) => resolve(directory))
  }

  async list(): Promise<PresetSummary[]> {
    const presetsByFilename = new Map<string, PresetSummary>()

    for (const presetDirectory of this.presetDirectories) {
      const filenames = await this.collectPresetFilenames(presetDirectory)
      for (const filename of filenames) {
        if (presetsByFilename.has(filename)) {
          continue
        }

        presetsByFilename.set(filename, {
          name: toPresetName(basename(filename)),
          filename
        })
      }
    }

    return Array.from(presetsByFilename.values()).sort((left, right) =>
      left.filename.localeCompare(right.filename)
    )
  }

  async listForProject(projectConfig?: {
    path: string
    ralphConfig?: string | null
  }): Promise<PresetSummary[]> {
    const presets = await this.list()

    if (projectConfig?.ralphConfig) {
      const configFilename = projectConfig.ralphConfig
      // Avoid duplicates if the project config has the same name as a global preset
      if (!presets.some((p) => p.filename === configFilename)) {
        presets.unshift({
          name: 'custom preset from settings',
          filename: configFilename
        })
      }
    }

    return presets
  }

  async get(filename: string, projectPath?: string) {
    const normalized = normalizePresetFilename(filename)
    if (!normalized) {
      throw new PresetServiceError(
        'BAD_REQUEST',
        `Invalid preset filename: ${filename}`
      )
    }

    const presetPath = await this.resolvePath(normalized, projectPath)
    const content = await readFile(presetPath, 'utf8')

    return {
      filename: normalized,
      content
    }
  }

  async resolvePath(filename: string, projectPath?: string) {
    const normalized = normalizePresetFilename(filename)
    if (!normalized) {
      throw new PresetServiceError(
        'BAD_REQUEST',
        `Invalid preset filename: ${filename}`
      )
    }

    // Try resolving as a project-specific config first if projectPath is provided
    if (projectPath) {
      const projectRoot = resolve(projectPath)
      const projectSpecificPath = resolve(projectRoot, normalized)
      const relativeProjectPath = relative(projectRoot, projectSpecificPath)
      if (!isSafeRelativePath(relativeProjectPath)) {
        throw new PresetServiceError(
          'BAD_REQUEST',
          `Invalid preset filename: ${filename}`
        )
      }

      try {
        await access(projectSpecificPath)
        return projectSpecificPath
      } catch {
        // Fall back to global presets
      }
    }

    for (const presetDirectory of this.presetDirectories) {
      const resolvedPresetPath = resolve(presetDirectory, normalized)
      const relativePath = relative(presetDirectory, resolvedPresetPath)
      if (!isSafeRelativePath(relativePath)) {
        continue
      }

      try {
        await access(resolvedPresetPath)
        return resolvedPresetPath
      } catch {
        // Try the next configured presets directory.
      }
    }

    throw new PresetServiceError(
      'NOT_FOUND',
      `Preset not found: ${normalized}`
    )
  }

  async save(name: string, content: string): Promise<PresetSummary> {
    if (!isValidPresetName(name)) {
      throw new PresetServiceError(
        'BAD_REQUEST',
        `Invalid preset name: "${name}". Use only letters, numbers, hyphens, and underscores.`
      )
    }

    await mkdir(CUSTOM_PRESETS_DIRECTORY, { recursive: true })
    await writeFile(resolve(CUSTOM_PRESETS_DIRECTORY, `${name}.yml`), content, 'utf8')

    return { name, filename: `custom/${name}.yml` }
  }

  private async collectPresetFilenames(presetDirectory: string) {
    const filenames: string[] = []

    const visit = async (currentDirectory: string) => {
      const entries = await readdir(currentDirectory, { withFileTypes: true })
      for (const entry of entries) {
        const entryPath = resolve(currentDirectory, entry.name)
        if (entry.isDirectory()) {
          await visit(entryPath)
          continue
        }

        if (!entry.isFile() || !isYamlFilename(entry.name)) {
          continue
        }

        const relativePath = relative(presetDirectory, entryPath)
        if (!isSafeRelativePath(relativePath)) {
          continue
        }

        filenames.push(toPosixPath(relativePath))
      }
    }

    try {
      await visit(presetDirectory)
      return filenames.sort((left, right) => left.localeCompare(right))
    } catch {
      return []
    }
  }
}
