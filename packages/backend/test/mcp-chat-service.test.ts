import type { ModelMessage } from 'ai'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import {
  RalphMcpServer,
  type RalphMcpServerDependencies
} from '../src/mcp/RalphMcpServer.js'
import {
  McpChatService,
  type McpChatStreamPart,
  type McpChatStreamTextInput
} from '../src/services/McpChatService.js'

const SESSION_TTL_MS = 24 * 60 * 60 * 1000

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

function createDependencies(): RalphMcpServerDependencies {
  return {
    projectService: {
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
    },
    presetService: {
      listForProject: vi.fn(async () => [{ name: 'default', filename: 'default.yml' }])
    },
    loopService: {
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
    },
    monitoringService: {
      getStatus: vi.fn(async () => ({
        activeLoops: 1,
        totalRuns: 3,
        erroredRuns: 0,
        timestamp: 12345
      }))
    },
    settingsService: {
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
      update: vi.fn(async () => ({
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
      }))
    },
    ralphProcessService: {
      kill: vi.fn(async () => undefined)
    },
    hatsPresetService: {
      list: vi.fn(async () => ({
        sourceDirectory: '/tmp/presets',
        presets: [{ id: 'builder.yml', name: 'builder' }]
      }))
    }
  }
}

function createServer() {
  return new RalphMcpServer(createDependencies())
}

function createStream(parts: McpChatStreamPart[]) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const part of parts) {
        yield part
      }
    }
  }
}

function createUserMessage(content: string): ModelMessage {
  return {
    role: 'user',
    content
  }
}

function createDeferred<T>() {
  let resolve: ((value: T) => void) | null = null
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })

  return {
    promise,
    resolve: (value: T) => {
      resolve?.(value)
    }
  }
}

describe('McpChatService', () => {
  it('streams deltas and tool events, then keeps assistant response in session history', async () => {
    const streamCalls: McpChatStreamTextInput[] = []
    const streamSequences: McpChatStreamPart[][] = [
      [
        { type: 'text-delta', text: 'hello ' },
        {
          type: 'tool-call',
          toolCallId: 'tool-1',
          toolName: 'get_loop_output',
          input: { loopId: 'loop-1' }
        },
        {
          type: 'tool-result',
          toolCallId: 'tool-1',
          toolName: 'get_loop_output',
          input: { loopId: 'loop-1' },
          output: '{"summary":"ok"}'
        },
        { type: 'text-delta', text: 'world' }
      ],
      []
    ]
    const streamText = vi.fn((input: McpChatStreamTextInput) => {
      streamCalls.push(input)
      return {
        fullStream: createStream(streamSequences.shift() ?? [])
      }
    })

    const service = new McpChatService({
      mcpServer: createServer(),
      streamText
    })

    const textDeltas: string[] = []
    const toolCalls: Array<{
      id: string
      name: string
      args: Record<string, unknown>
      requiresConfirmation: boolean
    }> = []
    const toolResults: Array<{ id: string; result: string; link?: string }> = []

    await service.streamChat({
      sessionId: 'session-1',
      model: 'gemini',
      messages: [createUserMessage('show loop output')],
      onTextDelta: (text) => {
        textDeltas.push(text)
      },
      onToolCall: (event) => {
        toolCalls.push(event)
      },
      onToolResult: (event) => {
        toolResults.push(event)
      }
    })

    await service.streamChat({
      sessionId: 'session-1',
      model: 'gemini',
      messages: [createUserMessage('continue')],
      onTextDelta: () => { },
      onToolCall: () => { },
      onToolResult: () => { }
    })

    expect(textDeltas).toEqual(['hello ', 'world'])
    expect(toolCalls).toEqual([
      {
        id: 'tool-1',
        name: 'get_loop_output',
        args: { loopId: 'loop-1' },
        requiresConfirmation: false
      }
    ])
    expect(toolResults).toEqual([
      {
        id: 'tool-1',
        result: '{"summary":"ok"}'
      }
    ])

    expect(streamCalls).toHaveLength(2)
    expect(streamCalls[0]?.messages).toHaveLength(1)
    expect(streamCalls[1]?.messages).toHaveLength(3)
    expect(streamCalls[1]?.messages[1]).toMatchObject({
      role: 'assistant',
      content: 'hello world'
    })
  })

  it('flags destructive tool calls for confirmation', async () => {
    const streamText = vi.fn((input: McpChatStreamTextInput) => {
      void input
      return {
        fullStream: createStream([
          {
            type: 'tool-call',
            toolCallId: 'tool-delete',
            toolName: 'delete_project',
            input: { projectId: 'project-1' }
          }
        ])
      }
    })
    const service = new McpChatService({
      mcpServer: createServer(),
      streamText
    })

    const toolCalls: Array<{ name: string; requiresConfirmation: boolean }> = []

    await service.streamChat({
      sessionId: 'session-destructive',
      model: 'openai',
      messages: [createUserMessage('delete the project')],
      onTextDelta: () => { },
      onToolCall: (event) => {
        toolCalls.push({
          name: event.name,
          requiresConfirmation: event.requiresConfirmation
        })
      },
      onToolResult: () => { }
    })

    expect(toolCalls).toEqual([
      {
        name: 'delete_project',
        requiresConfirmation: true
      }
    ])
  })

  it('pauses destructive tool execution until confirmation and resumes when confirmed', async () => {
    const executeTool = vi.fn(async () => ({ ok: true }))
    const toolCallSeen = createDeferred<void>()
    const streamText = vi.fn((input: McpChatStreamTextInput) => {
      const tools = input.tools as Record<
        string,
        {
          execute: (
            args: Record<string, unknown>,
            options: { toolCallId: string; messages: ModelMessage[] }
          ) => Promise<string>
        }
      >

      return {
        fullStream: (async function* () {
          yield {
            type: 'tool-call',
            toolCallId: 'tool-confirm',
            toolName: 'delete_project',
            input: { projectId: 'project-1' }
          } satisfies McpChatStreamPart

          const output = await tools.delete_project.execute(
            { projectId: 'project-1' },
            {
              toolCallId: 'tool-confirm',
              messages: input.messages
            }
          )

          yield {
            type: 'tool-result',
            toolCallId: 'tool-confirm',
            toolName: 'delete_project',
            input: { projectId: 'project-1' },
            output
          } satisfies McpChatStreamPart
        })()
      }
    })

    const service = new McpChatService({
      mcpServer: {
        getToolDefinitions: () => [
          {
            name: 'delete_project',
            description: '[DESTRUCTIVE] Delete a project',
            inputSchema: z.object({
              projectId: z.string()
            }),
            execute: executeTool
          }
        ],
        executeTool
      },
      streamText
    })

    const toolResults: Array<{ id: string; result: string }> = []
    const streamPromise = service.streamChat({
      sessionId: 'confirm-session',
      model: 'gemini',
      messages: [createUserMessage('delete project')],
      onTextDelta: () => { },
      onToolCall: () => {
        toolCallSeen.resolve(undefined)
      },
      onToolResult: (event) => {
        toolResults.push(event)
      }
    })

    await toolCallSeen.promise
    expect(executeTool).not.toHaveBeenCalled()
    expect(
      service.confirmToolCall({
        sessionId: 'confirm-session',
        toolCallId: 'tool-confirm',
        confirmed: true
      })
    ).toBe(true)

    await streamPromise

    expect(executeTool).toHaveBeenCalledTimes(1)
    expect(toolResults).toEqual([
      {
        id: 'tool-confirm',
        result: '{"ok":true}'
      }
    ])
  })

  it('returns cancelled tool result when confirmation is declined', async () => {
    const executeTool = vi.fn(async () => ({ ok: true }))
    const toolCallSeen = createDeferred<void>()
    const streamText = vi.fn((input: McpChatStreamTextInput) => {
      const tools = input.tools as Record<
        string,
        {
          execute: (
            args: Record<string, unknown>,
            options: { toolCallId: string; messages: ModelMessage[] }
          ) => Promise<string>
        }
      >

      return {
        fullStream: (async function* () {
          yield {
            type: 'tool-call',
            toolCallId: 'tool-cancel',
            toolName: 'delete_project',
            input: { projectId: 'project-2' }
          } satisfies McpChatStreamPart

          const output = await tools.delete_project.execute(
            { projectId: 'project-2' },
            {
              toolCallId: 'tool-cancel',
              messages: input.messages
            }
          )

          yield {
            type: 'tool-result',
            toolCallId: 'tool-cancel',
            toolName: 'delete_project',
            input: { projectId: 'project-2' },
            output
          } satisfies McpChatStreamPart
        })()
      }
    })

    const service = new McpChatService({
      mcpServer: {
        getToolDefinitions: () => [
          {
            name: 'delete_project',
            description: '[DESTRUCTIVE] Delete a project',
            inputSchema: z.object({
              projectId: z.string()
            }),
            execute: executeTool
          }
        ],
        executeTool
      },
      streamText
    })
    const toolResults: Array<{ id: string; result: string }> = []

    const streamPromise = service.streamChat({
      sessionId: 'cancel-session',
      model: 'gemini',
      messages: [createUserMessage('do not delete')],
      onTextDelta: () => { },
      onToolCall: () => {
        toolCallSeen.resolve(undefined)
      },
      onToolResult: (event) => {
        toolResults.push(event)
      }
    })

    await toolCallSeen.promise
    expect(executeTool).not.toHaveBeenCalled()
    expect(
      service.confirmToolCall({
        sessionId: 'cancel-session',
        toolCallId: 'tool-cancel',
        confirmed: false
      })
    ).toBe(true)

    await streamPromise

    expect(executeTool).not.toHaveBeenCalled()
    expect(toolResults).toEqual([
      {
        id: 'tool-cancel',
        result: '{"cancelled":true,"message":"Tool execution cancelled by user"}'
      }
    ])
  })

  it('aborts while waiting for destructive confirmation and clears pending confirmation', async () => {
    const executeTool = vi.fn(async () => ({ ok: true }))
    const toolCallSeen = createDeferred<void>()
    const streamText = vi.fn((input: McpChatStreamTextInput) => {
      const tools = input.tools as Record<
        string,
        {
          execute: (
            args: Record<string, unknown>,
            options: { toolCallId: string; messages: ModelMessage[] }
          ) => Promise<string>
        }
      >

      return {
        fullStream: (async function* () {
          yield {
            type: 'tool-call',
            toolCallId: 'tool-abort',
            toolName: 'delete_project',
            input: { projectId: 'project-3' }
          } satisfies McpChatStreamPart

          await tools.delete_project.execute(
            { projectId: 'project-3' },
            {
              toolCallId: 'tool-abort',
              messages: input.messages
            }
          )
        })()
      }
    })

    const service = new McpChatService({
      mcpServer: {
        getToolDefinitions: () => [
          {
            name: 'delete_project',
            description: '[DESTRUCTIVE] Delete a project',
            inputSchema: z.object({
              projectId: z.string()
            }),
            execute: executeTool
          }
        ],
        executeTool
      },
      streamText
    })
    const abortController = new AbortController()

    const streamPromise = service.streamChat({
      sessionId: 'abort-session',
      model: 'gemini',
      messages: [createUserMessage('abort confirmation')],
      abortSignal: abortController.signal,
      onTextDelta: () => { },
      onToolCall: () => {
        toolCallSeen.resolve(undefined)
      },
      onToolResult: () => { }
    })

    await toolCallSeen.promise
    abortController.abort(new Error('timed out'))

    await expect(streamPromise).rejects.toThrow('timed out')
    expect(executeTool).not.toHaveBeenCalled()
    expect(
      service.confirmToolCall({
        sessionId: 'abort-session',
        toolCallId: 'tool-abort',
        confirmed: true
      })
    ).toBe(false)
  })

  it('surfaces tool result links while still returning string output to the model', async () => {
    const streamText = vi.fn((input: McpChatStreamTextInput) => {
      const tools = input.tools as Record<
        string,
        {
          execute: (
            args: Record<string, unknown>,
            options: { toolCallId: string; messages: ModelMessage[] }
          ) => Promise<string>
        }
      >

      return {
        fullStream: (async function* () {
          const output = await tools.get_loop_output.execute(
            { loopId: 'loop-1' },
            {
              toolCallId: 'tool-link',
              messages: input.messages
            }
          )

          yield {
            type: 'tool-result',
            toolCallId: 'tool-link',
            toolName: 'get_loop_output',
            input: { loopId: 'loop-1' },
            output
          } satisfies McpChatStreamPart
        })()
      }
    })

    const service = new McpChatService({
      mcpServer: createServer(),
      streamText
    })
    const toolResults: Array<{ id: string; result: string; link?: string }> = []

    await service.streamChat({
      sessionId: 'session-links',
      model: 'gemini',
      messages: [createUserMessage('show loop logs')],
      onTextDelta: () => { },
      onToolCall: () => { },
      onToolResult: (event) => {
        toolResults.push(event)
      }
    })

    expect(toolResults).toHaveLength(1)
    expect(toolResults[0]?.id).toBe('tool-link')
    expect(toolResults[0]?.result).toContain('"summary":"Loop loop-1 output"')
    expect(toolResults[0]?.link).toBe('/project/project-1/loops?loopId=loop-1')
  })

  it('expires idle sessions after 24h when accessed', async () => {
    let now = 10_000
    const streamCalls: McpChatStreamTextInput[] = []
    const streamSequences: McpChatStreamPart[][] = [
      [{ type: 'text-delta', text: 'first response' }],
      []
    ]
    const streamText = vi.fn((input: McpChatStreamTextInput) => {
      streamCalls.push(input)
      return {
        fullStream: createStream(streamSequences.shift() ?? [])
      }
    })

    const service = new McpChatService({
      mcpServer: createServer(),
      streamText,
      now: () => now
    })

    await service.streamChat({
      sessionId: 'ttl-session',
      model: 'claude',
      messages: [createUserMessage('first message')],
      onTextDelta: () => { },
      onToolCall: () => { },
      onToolResult: () => { }
    })

    now += SESSION_TTL_MS + 1

    await service.streamChat({
      sessionId: 'ttl-session',
      model: 'claude',
      messages: [createUserMessage('second message')],
      onTextDelta: () => { },
      onToolCall: () => { },
      onToolResult: () => { }
    })

    expect(streamCalls[0]?.messages).toHaveLength(1)
    expect(streamCalls[1]?.messages).toHaveLength(1)
    expect(streamCalls[1]?.messages[0]).toMatchObject({
      role: 'user',
      content: 'second message'
    })
  })

  it('maps model aliases to provider defaults', () => {
    const googleProvider = vi.fn((modelId: string) => ({
      provider: 'google',
      modelId
    }))
    const openaiProvider = vi.fn((modelId: string) => ({
      provider: 'openai',
      modelId
    }))
    const anthropicProvider = vi.fn((modelId: string) => ({
      provider: 'anthropic',
      modelId
    }))

    const service = new McpChatService({
      mcpServer: createServer(),
      streamText: vi.fn(() => ({ fullStream: createStream([]) })),
      modelFactories: {
        google: googleProvider,
        openai: openaiProvider,
        anthropic: anthropicProvider
      }
    })

    expect(service.getModelProvider('gemini')).toEqual({
      provider: 'google',
      modelId: 'gemini-2.5-flash'
    })
    expect(service.getModelProvider('openai')).toEqual({
      provider: 'openai',
      modelId: 'gpt-4o'
    })
    expect(service.getModelProvider('claude')).toEqual({
      provider: 'anthropic',
      modelId: 'claude-opus-4-6'
    })

    expect(googleProvider).toHaveBeenCalledWith('gemini-2.5-flash')
    expect(openaiProvider).toHaveBeenCalledWith('gpt-4o')
    expect(anthropicProvider).toHaveBeenCalledWith('claude-opus-4-6')
  })

  it('builds AI tools for all registered MCP tools', async () => {
    const streamCalls: McpChatStreamTextInput[] = []
    const streamText = vi.fn((input: McpChatStreamTextInput) => {
      streamCalls.push(input)
      return {
        fullStream: createStream([])
      }
    })

    const service = new McpChatService({
      mcpServer: createServer(),
      streamText
    })

    await service.streamChat({
      sessionId: 'tools-session',
      model: 'gemini',
      messages: [createUserMessage('list everything')],
      onTextDelta: () => { },
      onToolCall: () => { },
      onToolResult: () => { }
    })

    const toolNames = Object.keys(streamCalls[0]?.tools ?? {}).sort()
    expect(toolNames).toEqual(ALL_MCP_TOOLS.slice().sort())
  })
})
