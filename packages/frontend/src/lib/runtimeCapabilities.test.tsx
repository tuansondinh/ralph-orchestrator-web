import { beforeEach, describe, expect, it, vi } from 'vitest'

const { query } = vi.hoisted(() => ({
  query: vi.fn()
}))

vi.mock('@/lib/trpc', () => ({
  trpcClient: {
    capabilities: {
      query
    }
  }
}))

import {
  hasRuntimeCapability,
  isCloudRuntime,
  isLocalRuntime,
  type RuntimeCapabilities,
  runtimeCapabilitiesApi
} from '@/lib/runtimeCapabilities'

describe('runtimeCapabilitiesApi', () => {
  beforeEach(() => {
    query.mockReset()
  })

  it('loads runtime capabilities from the backend capabilities procedure', async () => {
    query.mockResolvedValue({
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

    await expect(runtimeCapabilitiesApi.get()).resolves.toEqual({
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
    expect(query).toHaveBeenCalledTimes(1)
  })

  it('provides mode and capability helpers for downstream UI branching', () => {
    const localCapabilities: RuntimeCapabilities = {
      mode: 'local' as const,
      database: true,
      auth: false,
      localProjects: true,
      githubProjects: false,
      terminal: true,
      preview: true,
      localDirectoryPicker: true,
      mcp: true
    }
    const cloudCapabilities: RuntimeCapabilities = {
      mode: 'cloud' as const,
      database: true,
      auth: true,
      localProjects: false,
      githubProjects: true,
      terminal: false,
      preview: false,
      localDirectoryPicker: false,
      mcp: false
    }

    expect(isLocalRuntime(localCapabilities)).toBe(true)
    expect(isLocalRuntime(cloudCapabilities)).toBe(false)
    expect(isCloudRuntime(cloudCapabilities)).toBe(true)
    expect(isCloudRuntime(localCapabilities)).toBe(false)
    expect(hasRuntimeCapability(localCapabilities, 'terminal')).toBe(true)
    expect(hasRuntimeCapability(cloudCapabilities, 'terminal')).toBe(false)
    expect(hasRuntimeCapability(cloudCapabilities, 'githubProjects')).toBe(true)
  })
})
