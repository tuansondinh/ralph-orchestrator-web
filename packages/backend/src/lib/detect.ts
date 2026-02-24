import { access } from 'node:fs/promises'
import { constants } from 'node:fs'
import { join } from 'node:path'

export type ProjectType = 'node' | 'rust' | 'python' | 'go' | 'java' | 'unknown'

const typeMarkers: Array<{ marker: string; type: ProjectType }> = [
  { marker: 'package.json', type: 'node' },
  { marker: 'Cargo.toml', type: 'rust' },
  { marker: 'pyproject.toml', type: 'python' },
  { marker: 'go.mod', type: 'go' },
  { marker: 'pom.xml', type: 'java' }
]

async function exists(path: string) {
  try {
    await access(path, constants.F_OK)
    return true
  } catch {
    return false
  }
}

export async function detectProjectType(projectPath: string): Promise<ProjectType> {
  for (const entry of typeMarkers) {
    if (await exists(join(projectPath, entry.marker))) {
      return entry.type
    }
  }

  return 'unknown'
}

export async function detectRalphConfig(projectPath: string): Promise<string | null> {
  if (await exists(join(projectPath, 'ralph.yml'))) {
    return 'ralph.yml'
  }

  if (await exists(join(projectPath, 'ralph.yaml'))) {
    return 'ralph.yaml'
  }

  return null
}
