import path from 'path';
import os from 'os';

export type RuntimeMode = 'local' | 'cloud'

export const WORKSPACE_BASE_DIR = process.env.RALPH_UI_WORKSPACE_DIR || path.join(os.homedir(), '.ralph-ui', 'workspaces');

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

export interface CloudRuntimeConfig {
  supabaseUrl: string
  supabaseAnonKey: string
  databaseUrl: string
  githubClientId?: string
  githubClientSecret?: string
  githubCallbackUrl?: string
}

export interface ResolvedRuntimeMode {
  mode: RuntimeMode
  capabilities: RuntimeCapabilities
  cloud?: CloudRuntimeConfig
}

export class RuntimeModeConfigError extends Error {
  readonly missing: string[]

  constructor(missing: string[]) {
    super(
      `Incomplete cloud database configuration. Provide SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_DB_URL together. Missing: ${missing.join(', ')}.`
    )
    this.name = 'RuntimeModeConfigError'
    this.missing = missing
  }
}

const CLOUD_ENV_KEYS = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_DB_URL'
] as const

type RuntimeEnv = Partial<Record<(typeof CLOUD_ENV_KEYS)[number], string | undefined>>
type RuntimeModeEnvInput =
  | RuntimeEnv
  | Record<string, string | undefined>

function readEnvValue(env: RuntimeEnv, key: (typeof CLOUD_ENV_KEYS)[number]) {
  const value = env[key]
  if (typeof value !== 'string') {
    return undefined
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

export function getRuntimeCapabilities(mode: RuntimeMode): RuntimeCapabilities {
  if (mode === 'cloud') {
    return {
      mode: 'cloud',
      database: true,
      auth: true,
      localProjects: false,
      githubProjects: true,
      terminal: false,
      preview: false,
      localDirectoryPicker: false,
      mcp: false
    }
  }
  
  return {
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
}

export function resolveRuntimeMode(
  env: RuntimeModeEnvInput = process.env
): ResolvedRuntimeMode {
  const values = {
    SUPABASE_URL: readEnvValue(env, 'SUPABASE_URL'),
    SUPABASE_ANON_KEY: readEnvValue(env, 'SUPABASE_ANON_KEY'),
    SUPABASE_DB_URL: readEnvValue(env, 'SUPABASE_DB_URL')
  }

  const presentKeys = CLOUD_ENV_KEYS.filter((key) => values[key] !== undefined)
  if (presentKeys.length === 0) {
    return {
      mode: 'local',
      capabilities: getRuntimeCapabilities('local')
    }
  }

  const missingKeys = CLOUD_ENV_KEYS.filter((key) => values[key] === undefined)
  if (missingKeys.length > 0) {
    throw new RuntimeModeConfigError([...missingKeys])
  }

  return {
    mode: 'cloud',
    capabilities: getRuntimeCapabilities('cloud'),
    cloud: {
      supabaseUrl: values.SUPABASE_URL!,
      supabaseAnonKey: values.SUPABASE_ANON_KEY!,
      databaseUrl: values.SUPABASE_DB_URL!,
      githubClientId: (env as any).GITHUB_CLIENT_ID,
      githubClientSecret: (env as any).GITHUB_CLIENT_SECRET,
      githubCallbackUrl: (env as any).GITHUB_CALLBACK_URL
    }
  }
}
