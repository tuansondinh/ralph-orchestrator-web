import { access, constants } from 'node:fs/promises'
import { delimiter, join, resolve } from 'node:path'

export interface ResolveRalphBinaryOptions {
  cwd?: string
  env?: NodeJS.ProcessEnv
  pathEnv?: string
  platform?: NodeJS.Platform
  customPath?: string | null
}

function commandCandidates(command: string, platform: NodeJS.Platform) {
  if (platform !== 'win32') {
    return [command]
  }

  const pathExt =
    process.env.PATHEXT?.split(';').filter(Boolean) ?? ['.EXE', '.CMD', '.BAT']
  const hasExtension = /\.[a-z0-9]+$/i.test(command)
  if (hasExtension) {
    return [command]
  }

  return pathExt.map((ext) => `${command}${ext}`)
}

async function isExecutable(filePath: string, platform: NodeJS.Platform) {
  try {
    await access(
      filePath,
      platform === 'win32' ? constants.F_OK : constants.X_OK
    )
    return true
  } catch {
    return false
  }
}

async function findInPath(
  command: string,
  pathEnv: string | undefined,
  platform: NodeJS.Platform
) {
  if (!pathEnv) {
    return null
  }

  const directories = pathEnv.split(delimiter).filter(Boolean)
  for (const directory of directories) {
    for (const candidate of commandCandidates(command, platform)) {
      const fullPath = join(directory, candidate)
      if (await isExecutable(fullPath, platform)) {
        return fullPath
      }
    }
  }

  return null
}

export async function resolveRalphBinary(
  options: ResolveRalphBinaryOptions = {}
) {
  const cwd = options.cwd ?? process.cwd()
  const env = options.env ?? process.env
  const platform = options.platform ?? process.platform
  const customPath = options.customPath?.trim()

  if (customPath) {
    if (await isExecutable(customPath, platform)) {
      return customPath
    }

    throw new Error(
      `Configured Ralph binary is not executable: ${customPath}`
    )
  }

  const override = env.RALPH_UI_RALPH_BIN
  if (override && (await isExecutable(override, platform))) {
    return override
  }

  const localBinaryPath = resolve(cwd, 'node_modules', '.bin', 'ralph')
  const localCandidates = commandCandidates(localBinaryPath, platform)
  for (const localCandidate of localCandidates) {
    if (await isExecutable(localCandidate, platform)) {
      return localCandidate
    }
  }

  const fromPath = await findInPath(
    'ralph',
    options.pathEnv ?? env.PATH,
    platform
  )
  if (fromPath) {
    return fromPath
  }

  throw new Error(
    `Unable to resolve Ralph binary from ${resolve(
      cwd,
      'node_modules',
      '.bin',
      'ralph'
    )} or PATH`
  )
}
