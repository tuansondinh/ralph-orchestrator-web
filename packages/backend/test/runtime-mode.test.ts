import { describe, expect, it } from 'vitest'
import {
  RuntimeModeConfigError,
  getRuntimeCapabilities,
  resolveRuntimeMode
} from '../src/config/runtimeMode.js'

describe('runtime mode resolution', () => {
  it('defaults to local mode when cloud configuration is absent', () => {
    const resolved = resolveRuntimeMode({})

    expect(resolved).toEqual({
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
    })
  })

  it('activates cloud mode when all required cloud configuration is present', () => {
    const resolved = resolveRuntimeMode({
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_ANON_KEY: 'anon-key',
      SUPABASE_DB_URL: 'postgresql://postgres:postgres@localhost:5432/ralph'
    })

    expect(resolved).toEqual({
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
        supabaseUrl: 'https://example.supabase.co',
        supabaseAnonKey: 'anon-key',
        databaseUrl: 'postgresql://postgres:postgres@localhost:5432/ralph'
      }
    })
  })

  it('fails fast with missing variables when cloud configuration is partial', () => {
    expect(() =>
      resolveRuntimeMode({
        SUPABASE_URL: 'https://example.supabase.co'
      })
    ).toThrowError(RuntimeModeConfigError)

    expect(() =>
      resolveRuntimeMode({
        SUPABASE_URL: 'https://example.supabase.co'
      })
    ).toThrowError(
      'Incomplete cloud database configuration. Provide SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_DB_URL together. Missing: SUPABASE_ANON_KEY, SUPABASE_DB_URL.'
    )
  })

  it('returns capability flags for both supported modes', () => {
    expect(getRuntimeCapabilities('local')).toEqual({
      mode: 'local',
      database: true,
      auth: false,
      localProjects: true,
      githubProjects: false,
      terminal: true,
      preview: true,
      localDirectoryPicker: true,
      mcp: true
    })

    expect(getRuntimeCapabilities('cloud')).toEqual({
      mode: 'cloud',
      database: true,
      auth: true,
      localProjects: false,
      githubProjects: true,
      terminal: false,
      preview: false,
      localDirectoryPicker: false,
      mcp: false
    })
  })
})
