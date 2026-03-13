import {
  getRuntimeCapabilities,
  type ResolvedRuntimeMode
} from '../src/config/runtimeMode.js'

export function createTestRuntime(
  mode: 'local' | 'local-cloud' | 'cloud' = 'local'
): ResolvedRuntimeMode {
  if (mode === 'local-cloud') {
    return {
      mode: 'local-cloud',
      capabilities: getRuntimeCapabilities('local-cloud'),
      cloud: {
        supabaseUrl: 'https://test.supabase.co',
        supabaseAnonKey: 'test-key',
        databaseUrl: 'postgresql://localhost:5432/test'
      }
    }
  }

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
