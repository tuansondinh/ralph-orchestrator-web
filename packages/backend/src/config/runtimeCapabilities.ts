export type RuntimeMode = 'local' | 'cloud'

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
  mcp: false
} satisfies RuntimeCapabilities

export function getRuntimeCapabilities(mode: RuntimeMode): RuntimeCapabilities {
  return mode === 'cloud'
    ? { ...CLOUD_RUNTIME_CAPABILITIES }
    : { ...LOCAL_RUNTIME_CAPABILITIES }
}
