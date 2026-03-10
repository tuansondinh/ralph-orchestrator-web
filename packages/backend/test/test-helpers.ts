import {
  getRuntimeCapabilities,
  type ResolvedRuntimeMode
} from '../src/config/runtimeMode.js'

export function createTestRuntime(mode: 'local' | 'cloud' = 'local'): ResolvedRuntimeMode {
  if (mode === 'cloud') {
    return {
      mode: 'cloud',
      capabilities: getRuntimeCapabilities('cloud'),
      cloud: {
        supabaseUrl: 'https://test.supabase.co',
        supabaseAnonKey: 'test-key',
        databaseUrl: 'postgresql://localhost:5432/test'
      }
    }
  }

  return {
    mode: 'local',
    capabilities: getRuntimeCapabilities('local')
  }
}
