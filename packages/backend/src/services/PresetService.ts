import { access, readdir, readFile } from 'node:fs/promises'
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
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

export class PresetService {
  constructor(private readonly presetDirectory = DEFAULT_PRESET_DIRECTORY) {}

  async list(): Promise<PresetSummary[]> {
    const entries = await readdir(this.presetDirectory, { withFileTypes: true })

    return entries
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .filter((name) => isYamlFilename(name))
      .sort((left, right) => left.localeCompare(right))
      .map((filename) => ({
        name: toPresetName(filename),
        filename
      }))
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
          name: `Project: ${toPresetName(configFilename)}`,
          filename: configFilename
        })
      }
    }

    return presets
  }

  async get(filename: string, projectPath?: string) {
    const presetPath = await this.resolvePath(filename, projectPath)
    const content = await readFile(presetPath, 'utf8')

    return {
      filename: basename(presetPath),
      content
    }
  }

  async resolvePath(filename: string, projectPath?: string) {
    const normalized = filename.trim()

    if (!normalized || !isYamlFilename(normalized)) {
      throw new PresetServiceError(
        'BAD_REQUEST',
        `Invalid preset filename: ${filename}`
      )
    }

    // Try resolving as a project-specific config first if projectPath is provided
    if (projectPath) {
      if (isAbsolute(normalized)) {
        throw new PresetServiceError(
          'BAD_REQUEST',
          `Invalid preset filename: ${filename}`
        )
      }

      const projectRoot = resolve(projectPath)
      const projectSpecificPath = resolve(projectRoot, normalized)
      const relativeProjectPath = relative(projectRoot, projectSpecificPath)
      if (
        !relativeProjectPath ||
        relativeProjectPath.startsWith(`..${sep}`) ||
        relativeProjectPath === '..' ||
        isAbsolute(relativeProjectPath)
      ) {
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

    if (normalized !== basename(normalized)) {
      throw new PresetServiceError(
        'BAD_REQUEST',
        `Invalid preset filename: ${filename}`
      )
    }

    const fullPath = join(this.presetDirectory, normalized)
    const resolvedPresetPath = resolve(fullPath)
    const resolvedPresetDirectory = resolve(this.presetDirectory)
    const relativePath = relative(resolvedPresetDirectory, resolvedPresetPath)
    if (relativePath.startsWith('..')) {
      throw new PresetServiceError(
        'BAD_REQUEST',
        `Invalid preset filename: ${filename}`
      )
    }

    try {
      await access(resolvedPresetPath)
    } catch {
      throw new PresetServiceError(
        'NOT_FOUND',
        `Preset not found: ${normalized}`
      )
    }

    return resolvedPresetPath
  }
}
