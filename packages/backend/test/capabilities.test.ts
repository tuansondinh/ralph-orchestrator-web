import { describe, expect, it } from 'vitest'
import { appRouter } from '../src/trpc/router.js'
import { createTestRuntime } from './test-helpers.js'

/* eslint-disable @typescript-eslint/no-explicit-any */

describe('capabilities tRPC route', () => {
  it('returns capabilities without auth in local mode', async () => {
    const runtime = createTestRuntime('local')

    const caller = appRouter.createCaller({
      runtime,
      db: {} as any,
      processManager: {} as any,
      loopService: {} as any,
      chatService: {} as any,
      monitoringService: {} as any,
      previewService: {} as any,
      projectService: {} as any,
      presetService: {} as any,
      settingsService: {} as any,
      hatsPresetService: {} as any,
      taskService: {} as any
    })

    const capabilities = await caller.capabilities()

    expect(capabilities).toEqual({
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
  })

  it('returns capabilities without auth in cloud mode', async () => {
    const runtime = createTestRuntime('cloud')

    const caller = appRouter.createCaller({
      runtime,
      db: {} as any,
      processManager: {} as any,
      loopService: {} as any,
      chatService: {} as any,
      monitoringService: {} as any,
      previewService: {} as any,
      projectService: {} as any,
      presetService: {} as any,
      settingsService: {} as any,
      hatsPresetService: {} as any,
      taskService: {} as any
    })

    const capabilities = await caller.capabilities()

    expect(capabilities).toEqual({
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
