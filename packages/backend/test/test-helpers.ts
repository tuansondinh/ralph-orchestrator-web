import type { ResolvedRuntimeMode } from '../src/config/runtimeMode.js'

export function createTestRuntime(mode: 'local' | 'cloud' = 'local'): ResolvedRuntimeMode {
  if (mode === 'cloud') {
    return {
      mode: 'cloud',
      capabilities: {
        mode: 'cloud',
        database: true,
        auth: true,
        localProjects: false,
        githubProjects: true,
        terminal: false,
        preview: false,
        localDirectoryPicker: false,
        mcp: false
      },
      cloud: {
        supabaseUrl: 'https://test.supabase.co',
        supabaseAnonKey: 'test-key',
        databaseUrl: 'postgresql://localhost:5432/test'
      }
    }
  }

  return {
    mode: 'local',
    capabilities: {
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
}
