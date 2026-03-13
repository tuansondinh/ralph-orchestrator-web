export type RuntimeMode = 'local' | 'local-cloud' | 'cloud'

export interface RuntimeCapabilities {
  mode: RuntimeMode
  database: true
  auth: boolean
  localProjects: boolean
  githubProjects: boolean
  terminal: boolean
  preview: boolean
  localDirectoryPicker: boolean
  mcp: boolean
}

export type RuntimeCapabilityKey = Exclude<keyof RuntimeCapabilities, 'mode'>

export const LOCAL_RUNTIME_CAPABILITIES = {
  mode: 'local',
  database: true,
  auth: false,
  localProjects: true,
  githubProjects: false,
  terminal: true,
  preview: true,
  localDirectoryPicker: true,
  mcp: true
} satisfies RuntimeCapabilities

export const CLOUD_RUNTIME_CAPABILITIES = {
  mode: 'cloud',
  database: true,
  auth: true,
  localProjects: false,
  githubProjects: true,
  terminal: false,
  preview: false,
  localDirectoryPicker: false,
  mcp: true
} satisfies RuntimeCapabilities

export const LOCAL_CLOUD_RUNTIME_CAPABILITIES = {
  mode: 'local-cloud',
  database: true,
  auth: true,
  localProjects: false,
  githubProjects: true,
  terminal: true,
  preview: true,
  localDirectoryPicker: false,
  mcp: true
} satisfies RuntimeCapabilities

export function getRuntimeCapabilities(mode: RuntimeMode): RuntimeCapabilities {
  if (mode === 'cloud') {
    return { ...CLOUD_RUNTIME_CAPABILITIES }
  }

  if (mode === 'local-cloud') {
    return { ...LOCAL_CLOUD_RUNTIME_CAPABILITIES }
  }

  return { ...LOCAL_RUNTIME_CAPABILITIES }
}
