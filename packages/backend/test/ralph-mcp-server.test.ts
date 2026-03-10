import Fastify from 'fastify'
import { LATEST_PROTOCOL_VERSION } from '@modelcontextprotocol/sdk/types.js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  RalphMcpServer,
  type RalphMcpServerDependencies
} from '../src/mcp/RalphMcpServer.js'
import type {
  ChatSessionSummary
} from '../src/services/ChatService.js'

const ALL_MCP_TOOLS = [
  'list_projects',
  'get_project',
  'list_presets',
  'get_loop_runs',
  'get_loop_output',
  'get_monitoring',
  'get_settings',
  'list_hats_presets',
  'start_loop',
  'stop_loop',
  'create_project',
  'update_project',
  'delete_project',
  'kill_process',
  'update_settings'
]

const DESTRUCTIVE_TOOL_NAMES = [
  'start_loop',
  'stop_loop',
  'create_project',
  'update_project',
  'delete_project',
  'kill_process',
  'update_settings'
] as const

function parseSseMessages(payload: string): Array<Record<string, unknown>> {
  return payload
    .split('\n\n')
    .map((chunk) =>
      chunk
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice('data:'.length).trim())
        .join('')
    )
    .filter((data) => data.length > 0)
    .map((data) => JSON.parse(data) as Record<string, unknown>)
}

function parseToolText(
  message: Record<string, unknown>,
  expectedId: number
): unknown {
  expect(message.id).toBe(expectedId)
  const result = message.result as {
    content?: Array<{ text?: unknown; type?: unknown }>
  }
  expect(Array.isArray(result.content)).toBe(true)
  expect(result.content?.[0]?.type).toBe('text')
  expect(typeof result.content?.[0]?.text).toBe('string')
  return JSON.parse(String(result.content?.[0]?.text))
}

function createDependencies(): RalphMcpServerDependencies {
  const activePlanSession: ChatSessionSummary = {
    id: 'chat-session-1',
    projectId: 'project-1',
    type: 'plan',
    backend: 'gemini',
    state: 'active',
    processId: 'process-1',
    createdAt: 1,
    endedAt: null
  }
  const waitingPlanSession: ChatSessionSummary = {
    ...activePlanSession,
    state: 'waiting'
  }

  const projectService = {
    list: vi.fn(async () => [{ id: 'project-1', name: 'Project 1' }]),
    get: vi.fn(async (projectId: string) => ({
      id: projectId,
      name: `Project ${projectId}`,
      path: `/tmp/${projectId}`,
      ralphConfig: 'custom.yml'
    })),
    create: vi.fn(async (input: { name: string; path: string; createIfMissing?: boolean }) => ({
      id: 'project-created',
      ...input
    })),
    update: vi.fn(async (projectId: string, input: { name?: string; path?: string }) => ({
      id: projectId,
      name: input.name ?? 'Project 1',
      path: input.path ?? '/tmp/project-1',
      ralphConfig: 'custom.yml'
    })),
    delete: vi.fn(async () => undefined)
  }

  const loopService = {
    list: vi.fn(async (projectId: string) => [
      { id: `${projectId}-loop`, projectId, state: 'running' }
    ]),
    get: vi.fn(async (loopId: string) => ({
      id: loopId,
      projectId: 'project-1',
      state: 'completed'
    })),
    getOutput: vi.fn(async ({ loopId, limit }: { loopId: string; limit?: number }) => ({
      summary: `Loop ${loopId} output`,
      lines: ['line-1', 'line-2'].slice(0, limit ?? 2),
      link: `/project/project-1/loops?loopId=${loopId}`
    })),
    start: vi.fn(async (projectId: string, options: Record<string, unknown>) => ({
      id: `${projectId}-started`,
      projectId,
      state: 'queued',
      options
    })),
    stop: vi.fn(async () => undefined)
  }

  const settingsService = {
    get: vi.fn(async () => ({
      ralphBinaryPath: null,
      notifications: {
        loopComplete: true,
        loopFailed: true,
        needsInput: true
      },
      preview: {
        portStart: 3001,
        portEnd: 3010,
        baseUrl: 'http://localhost',
        command: null
      },
      data: {
        dbPath: '/tmp/db.sqlite'
      }
    })),
    update: vi.fn(
      async (input: {
        ralphBinaryPath?: string | null
        notifications?: {
          loopComplete?: boolean
          loopFailed?: boolean
          needsInput?: boolean
        }
        preview?: {
          portStart?: number
          portEnd?: number
          baseUrl?: string | null
          command?: string | null
        }
      }) => ({
      ralphBinaryPath: null,
      notifications: {
        loopComplete: true,
        loopFailed: true,
        needsInput: true,
        ...input.notifications
      },
      preview: {
        portStart: 3001,
        portEnd: 3010,
        baseUrl: 'http://localhost',
        command: null,
        ...input.preview
      },
      data: {
        dbPath: '/tmp/db.sqlite'
      }
    })
    )
  }

  return {
    projectService,
    presetService: {
      listForProject: vi.fn(async () => [
        { name: 'default', filename: 'default.yml' }
      ])
    },
    loopService,
    monitoringService: {
      getStatus: vi.fn(async () => ({
        activeLoops: 1,
        totalRuns: 3,
        erroredRuns: 0,
        timestamp: 12345
      }))
    },
    settingsService,
    ralphProcessService: {
      kill: vi.fn(async () => undefined)
    },
    hatsPresetService: {
      list: vi.fn(async () => ({
        sourceDirectory: '/tmp/presets',
        presets: [{ id: 'builder.yml', name: 'builder' }]
      }))
    },
    chatService: {
      startSession: vi.fn(async () => activePlanSession),
      restartSession: vi.fn(async () => activePlanSession),
      getProjectSession: vi.fn(async () => null),
      getSession: vi.fn(async () => waitingPlanSession),
      sendMessage: vi.fn(async () => undefined),
      getHistory: vi.fn(async () => [])
    },
    sopService: {
      getPlanGuide: vi.fn(async () => '# PDD Guide'),
      getTaskGuide: vi.fn(async () => '# Task Guide')
    }
  }
}

async function createHarness(dependencies: RalphMcpServerDependencies) {
  const mcpServer = new RalphMcpServer(dependencies)
  const app = Fastify()

  app.route({
    method: ['GET', 'POST', 'DELETE'],
    url: '/mcp',
    handler: async (request, reply) => {
      reply.hijack()
      await mcpServer.handleRequest(request.raw, reply.raw, request.body)
    }
  })

  app.addHook('onClose', async () => {
    await mcpServer.close()
  })

  const initializeResponse = await app.inject({
    method: 'POST',
    url: '/mcp',
    headers: {
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json'
    },
    payload: {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: LATEST_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: {
          name: 'backend-test-client',
          version: '1.0.0'
        }
      }
    }
  })

  expect(initializeResponse.statusCode).toBe(200)
  const sessionId = String(initializeResponse.headers['mcp-session-id'] ?? '')
  expect(sessionId.length).toBeGreaterThan(0)

  return { app, dependencies, sessionId }
}

async function callMcp(
  input: { app: ReturnType<typeof Fastify>; sessionId: string },
  payload: Record<string, unknown>
) {
  const response = await input.app.inject({
    method: 'POST',
    url: '/mcp',
    headers: {
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
      'mcp-protocol-version': LATEST_PROTOCOL_VERSION,
      'mcp-session-id': input.sessionId
    },
    payload
  })

  expect(response.statusCode).toBe(200)
  return parseSseMessages(response.body)
}

async function callTool(
  input: { app: ReturnType<typeof Fastify>; sessionId: string },
  id: number,
  name: string,
  args: Record<string, unknown> = {}
) {
  const messages = await callMcp(input, {
    jsonrpc: '2.0',
    id,
    method: 'tools/call',
    params: {
      name,
      arguments: args
    }
  })

  const result = messages.find((message) => message.id === id)
  expect(result).toBeDefined()
  return result as Record<string, unknown>
}

describe('RalphMcpServer read-only tools', () => {
  const apps: Array<ReturnType<typeof Fastify>> = []

  afterEach(async () => {
    while (apps.length > 0) {
      const app = apps.pop()
      if (app) {
        await app.close()
      }
    }
  })

  it('registers all 15 MCP tools', async () => {
    const harness = await createHarness(createDependencies())
    apps.push(harness.app)

    const messages = await callMcp(harness, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {}
    })

    const result = messages.find((message) => message.id === 2)
    expect(result).toBeDefined()
    const tools =
      ((result?.result as { tools?: Array<{ name?: string }> } | undefined)
        ?.tools ?? []
      ).map((tool) => tool.name)

    expect(tools.sort()).toEqual(ALL_MCP_TOOLS.slice().sort())
  })

  it('list_projects calls ProjectService.list and returns JSON text', async () => {
    const dependencies = createDependencies()
    const harness = await createHarness(dependencies)
    apps.push(harness.app)

    const result = await callTool(harness, 3, 'list_projects')
    const parsed = parseToolText(result, 3)

    expect(dependencies.projectService.list).toHaveBeenCalledTimes(1)
    expect(parsed).toEqual([{ id: 'project-1', name: 'Project 1' }])
  })

  it('get_project calls ProjectService.get and returns JSON text', async () => {
    const dependencies = createDependencies()
    const harness = await createHarness(dependencies)
    apps.push(harness.app)

    const result = await callTool(harness, 4, 'get_project', {
      projectId: 'project-1'
    })
    const parsed = parseToolText(result, 4)

    expect(dependencies.projectService.get).toHaveBeenCalledWith('project-1')
    expect(parsed).toMatchObject({
      id: 'project-1',
      path: '/tmp/project-1'
    })
  })

  it('list_presets resolves project context and calls PresetService.listForProject', async () => {
    const dependencies = createDependencies()
    const harness = await createHarness(dependencies)
    apps.push(harness.app)

    const result = await callTool(harness, 5, 'list_presets', {
      projectId: 'project-1'
    })
    const parsed = parseToolText(result, 5)

    expect(dependencies.projectService.get).toHaveBeenCalledWith('project-1')
    expect(dependencies.presetService.listForProject).toHaveBeenCalledWith({
      path: '/tmp/project-1',
      ralphConfig: 'custom.yml'
    })
    expect(parsed).toEqual([{ name: 'default', filename: 'default.yml' }])
  })

  it('get_loop_runs without loopId calls LoopService.list', async () => {
    const dependencies = createDependencies()
    const harness = await createHarness(dependencies)
    apps.push(harness.app)

    const result = await callTool(harness, 6, 'get_loop_runs', {
      projectId: 'project-1'
    })
    const parsed = parseToolText(result, 6)

    expect(dependencies.loopService.list).toHaveBeenCalledWith('project-1')
    expect(dependencies.loopService.get).not.toHaveBeenCalled()
    expect(parsed).toEqual([
      { id: 'project-1-loop', projectId: 'project-1', state: 'running' }
    ])
  })

  it('get_loop_runs with loopId calls LoopService.get', async () => {
    const dependencies = createDependencies()
    const harness = await createHarness(dependencies)
    apps.push(harness.app)

    const result = await callTool(harness, 7, 'get_loop_runs', {
      loopId: 'loop-1'
    })
    const parsed = parseToolText(result, 7)

    expect(dependencies.loopService.get).toHaveBeenCalledWith('loop-1')
    expect(dependencies.loopService.list).not.toHaveBeenCalled()
    expect(parsed).toEqual({
      id: 'loop-1',
      projectId: 'project-1',
      state: 'completed'
    })
  })

  it('get_loop_output calls LoopService.getOutput and returns summary/lines/link JSON', async () => {
    const dependencies = createDependencies()
    const harness = await createHarness(dependencies)
    apps.push(harness.app)

    const result = await callTool(harness, 8, 'get_loop_output', {
      loopId: 'loop-1',
      limit: 1
    })
    const parsed = parseToolText(result, 8) as {
      summary: string
      lines: string[]
      link: string
    }

    expect(dependencies.loopService.getOutput).toHaveBeenCalledWith({
      loopId: 'loop-1',
      limit: 1
    })
    expect(parsed.summary).toBe('Loop loop-1 output')
    expect(Array.isArray(parsed.lines)).toBe(true)
    expect(parsed.link).toBe('/project/project-1/loops?loopId=loop-1')
  })

  it('get_monitoring calls MonitoringService.getStatus', async () => {
    const dependencies = createDependencies()
    const harness = await createHarness(dependencies)
    apps.push(harness.app)

    const result = await callTool(harness, 9, 'get_monitoring')
    const parsed = parseToolText(result, 9)

    expect(dependencies.monitoringService.getStatus).toHaveBeenCalledTimes(1)
    expect(parsed).toEqual({
      activeLoops: 1,
      totalRuns: 3,
      erroredRuns: 0,
      timestamp: 12345
    })
  })

  it('get_settings calls SettingsService.get', async () => {
    const dependencies = createDependencies()
    const harness = await createHarness(dependencies)
    apps.push(harness.app)

    const result = await callTool(harness, 10, 'get_settings')
    const parsed = parseToolText(result, 10)

    expect(dependencies.settingsService.get).toHaveBeenCalledTimes(1)
    expect(parsed).toMatchObject({
      preview: { baseUrl: 'http://localhost' }
    })
  })

  it('list_hats_presets calls HatsPresetService.list', async () => {
    const dependencies = createDependencies()
    const harness = await createHarness(dependencies)
    apps.push(harness.app)

    const result = await callTool(harness, 11, 'list_hats_presets')
    const parsed = parseToolText(result, 11)

    expect(dependencies.hatsPresetService.list).toHaveBeenCalledTimes(1)
    expect(parsed).toEqual({
      sourceDirectory: '/tmp/presets',
      presets: [{ id: 'builder.yml', name: 'builder' }]
    })
  })

  it('start_loop calls LoopService.start with projectId and parsed options', async () => {
    const dependencies = createDependencies()
    const harness = await createHarness(dependencies)
    apps.push(harness.app)

    const result = await callTool(harness, 12, 'start_loop', {
      projectId: 'project-1',
      prompt: 'Ship it',
      exclusive: true
    })
    const parsed = parseToolText(result, 12)

    expect(dependencies.loopService.start).toHaveBeenCalledWith('project-1', {
      prompt: 'Ship it',
      exclusive: true
    })
    expect(parsed).toMatchObject({
      id: 'project-1-started',
      state: 'queued'
    })
  })

  it('stop_loop calls LoopService.stop', async () => {
    const dependencies = createDependencies()
    const harness = await createHarness(dependencies)
    apps.push(harness.app)

    const result = await callTool(harness, 13, 'stop_loop', {
      loopId: 'loop-1'
    })
    const parsed = parseToolText(result, 13)

    expect(dependencies.loopService.stop).toHaveBeenCalledWith('loop-1')
    expect(parsed).toBeNull()
  })

  it('create_project calls ProjectService.create', async () => {
    const dependencies = createDependencies()
    const harness = await createHarness(dependencies)
    apps.push(harness.app)

    const result = await callTool(harness, 14, 'create_project', {
      name: 'Project 2',
      path: '/tmp/project-2',
      createIfMissing: true
    })
    const parsed = parseToolText(result, 14)

    expect(dependencies.projectService.create).toHaveBeenCalledWith({
      name: 'Project 2',
      path: '/tmp/project-2',
      createIfMissing: true
    })
    expect(parsed).toMatchObject({
      id: 'project-created',
      name: 'Project 2'
    })
  })

  it('update_project calls ProjectService.update', async () => {
    const dependencies = createDependencies()
    const harness = await createHarness(dependencies)
    apps.push(harness.app)

    const result = await callTool(harness, 15, 'update_project', {
      projectId: 'project-1',
      name: 'Renamed Project'
    })
    const parsed = parseToolText(result, 15)

    expect(dependencies.projectService.update).toHaveBeenCalledWith('project-1', {
      name: 'Renamed Project'
    })
    expect(parsed).toMatchObject({
      id: 'project-1',
      name: 'Renamed Project'
    })
  })

  it('delete_project calls ProjectService.delete', async () => {
    const dependencies = createDependencies()
    const harness = await createHarness(dependencies)
    apps.push(harness.app)

    const result = await callTool(harness, 16, 'delete_project', {
      projectId: 'project-1'
    })
    const parsed = parseToolText(result, 16)

    expect(dependencies.projectService.delete).toHaveBeenCalledWith('project-1')
    expect(parsed).toBeNull()
  })

  it('kill_process calls RalphProcessService.kill', async () => {
    const dependencies = createDependencies()
    const harness = await createHarness(dependencies)
    apps.push(harness.app)

    const result = await callTool(harness, 17, 'kill_process', {
      pid: 43210
    })
    const parsed = parseToolText(result, 17)

    expect(dependencies.ralphProcessService.kill).toHaveBeenCalledWith(43210)
    expect(parsed).toBeNull()
  })

  it('update_settings calls SettingsService.update', async () => {
    const dependencies = createDependencies()
    const harness = await createHarness(dependencies)
    apps.push(harness.app)

    const result = await callTool(harness, 18, 'update_settings', {
      notifications: {
        loopComplete: false
      },
      preview: {
        portStart: 3100,
        portEnd: 3110
      }
    })
    const parsed = parseToolText(result, 18) as {
      notifications: { loopComplete: boolean }
      preview: { portStart: number; portEnd: number }
    }

    expect(dependencies.settingsService.update).toHaveBeenCalledWith({
      notifications: {
        loopComplete: false
      },
      preview: {
        portStart: 3100,
        portEnd: 3110
      }
    })
    expect(parsed.notifications.loopComplete).toBe(false)
    expect(parsed.preview.portStart).toBe(3100)
    expect(parsed.preview.portEnd).toBe(3110)
  })

  it('marks destructive tools with metadata and matches DESTRUCTIVE_TOOLS', async () => {
    expect(DESTRUCTIVE_TOOL_NAMES.slice().sort()).toEqual(
      [
        'start_loop',
        'stop_loop',
        'create_project',
        'update_project',
        'delete_project',
        'kill_process',
        'update_settings'
      ].sort()
    )

    const harness = await createHarness(createDependencies())
    apps.push(harness.app)

    const messages = await callMcp(harness, {
      jsonrpc: '2.0',
      id: 19,
      method: 'tools/list',
      params: {}
    })

    const result = messages.find((message) => message.id === 19)
    expect(result).toBeDefined()
    const tools =
      ((result?.result as {
        tools?: Array<{ name?: string; description?: string }>
      } | undefined)?.tools ?? [])

    const destructiveFromMetadata = tools
      .filter((tool) => String(tool.description ?? '').includes('[DESTRUCTIVE]'))
      .map((tool) => tool.name)
      .filter((toolName): toolName is string => Boolean(toolName))
      .sort()

    expect(destructiveFromMetadata).toEqual(DESTRUCTIVE_TOOL_NAMES.slice().sort())
  })
})
