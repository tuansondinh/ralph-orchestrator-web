import { trpcClient } from '@/lib/trpc'

export interface RuntimeCapabilities {
  mode: 'local' | 'local-cloud' | 'cloud'
  database: true
  auth: boolean
  localProjects: boolean
  githubProjects: boolean
  terminal: boolean
  preview: boolean
  localDirectoryPicker: boolean
  mcp: boolean
}

export const defaultRuntimeCapabilities: RuntimeCapabilities = {
  mode: 'local',
  database: true,
  auth: false,
  localProjects: true,
  githubProjects: false,
  terminal: true,
  preview: true,
  localDirectoryPicker: true,
  mcp: true
}

export const capabilitiesApi = {
  get(): Promise<RuntimeCapabilities> {
    return trpcClient.capabilities.query()
  }
}
