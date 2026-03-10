import { trpcClient } from '@/lib/trpc'

export interface RuntimeCapabilities {
  mode: 'local' | 'cloud'
  database: true
  auth: boolean
  localProjects: boolean
  githubProjects: boolean
  terminal: boolean
  preview: boolean
  localDirectoryPicker: boolean
  mcp: boolean
}

export const capabilitiesApi = {
  get(): Promise<RuntimeCapabilities> {
    return trpcClient.capabilities.query()
  }
}
