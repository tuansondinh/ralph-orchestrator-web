import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  EventMessagePartUpdated,
  EventMessageUpdated,
  EventPermissionUpdated,
  EventSessionStatus,
  OpencodeClient,
  Session
} from '@opencode-ai/sdk'
import { OpenCodeService } from '../src/services/OpenCodeService.js'
import type { SettingsSnapshot } from '../src/services/SettingsService.js'
import type { OpenCodeEvent } from '../src/types/chat.js'

function createAsyncQueue<T>() {
  const values: T[] = []
  const waiters: Array<(result: IteratorResult<T>) => void> = []
  let done = false

  return {
    push(value: T) {
      const waiter = waiters.shift()
      if (waiter) {
        waiter({ value, done: false })
        return
      }

      values.push(value)
    },
    finish() {
      done = true
      while (waiters.length > 0) {
        waiters.shift()?.({ value: undefined, done: true })
      }
    },
    stream: {
      [Symbol.asyncIterator]() {
        return {
          next() {
            if (values.length > 0) {
              return Promise.resolve({ value: values.shift()!, done: false })
            }

            if (done) {
              return Promise.resolve({ value: undefined, done: true })
            }

            return new Promise<IteratorResult<T>>((resolve) => {
              waiters.push(resolve)
            })
          }
        }
      }
    }
  }
}

function flushPromises() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

function createSession(id = 'session-1'): Session {
  return {
    id,
    projectID: process.cwd(),
    directory: process.cwd(),
    version: '1',
    title: 'Chat',
    parentID: '',
    share: undefined,
    time: {
      created: Date.now(),
      updated: Date.now()
    }
  } as unknown as Session
}

function createSettingsSnapshot(): SettingsSnapshot {
  return {
    chatModel: 'gemini' as const,
    chatProvider: 'anthropic' as const,
    opencodeModel: 'claude-sonnet-4-20250514',
    providerEnvVarMap: {
      anthropic: 'ANTHROPIC_API_KEY',
      openai: 'OPENAI_API_KEY',
      google: 'GOOGLE_API_KEY'
    } as const,
    apiKeyStatus: {
      anthropic: false,
      openai: false,
      google: false
    },
    storedApiKeyStatus: {
      anthropic: false,
      openai: false,
      google: false
    },
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
      dbPath: '/tmp/ralph.sqlite'
    }
  }
}

function createServiceHarness() {
  const serverClose = vi.fn()
  const sessionCreate = vi.fn(async () => createSession())
  const promptAsync = vi.fn(async () => undefined)
  const configUpdate = vi.fn(async () => undefined)
  const permissionReply = vi.fn(async () => true)
  const settingsGet = vi.fn(async () => createSettingsSnapshot())
  const getProviderApiKey = vi.fn(async (provider: string) =>
    provider === 'anthropic' ? 'test-anthropic-key' : null
  )
  const eventQueues: Array<ReturnType<typeof createAsyncQueue<unknown>>> = []

  const client = {
    event: {
      subscribe: vi.fn(async () => {
        const queue = createAsyncQueue<unknown>()
        eventQueues.push(queue)
        return { stream: queue.stream }
      })
    },
    session: {
      create: sessionCreate,
      promptAsync
    },
    config: {
      update: configUpdate
    },
    postSessionIdPermissionsPermissionId: permissionReply
  } as unknown as OpencodeClient

  const createOpencode = vi.fn(async () => ({
    client,
    server: {
      url: 'http://127.0.0.1:4096',
      close: serverClose
    }
  }))

  const service = new OpenCodeService({
    mcpEndpointUrl: 'http://localhost:3003/mcp',
    settingsService: {
      get: settingsGet,
      getProviderApiKey
    },
    createOpencode,
    now: () => 1_700_000_000_000
  })

  return {
    client,
    configUpdate,
    createOpencode,
    get eventQueue() {
      return eventQueues.at(-1)!
    },
    permissionReply,
    promptAsync,
    serverClose,
    service,
    sessionCreate,
    settingsGet
    ,
    getProviderApiKey
  }
}

describe('OpenCodeService', () => {
  const envBackup = { ...process.env }

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.ANTHROPIC_API_KEY = 'test-anthropic-key'
  })

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in envBackup)) {
        delete process.env[key]
      }
    }

    for (const [key, value] of Object.entries(envBackup)) {
      process.env[key] = value
    }
  })

  it('starts and stops the OpenCode server lifecycle', async () => {
    const harness = createServiceHarness()

    expect(harness.service.isRunning()).toBe(false)

    await harness.service.start()

    expect(harness.service.isRunning()).toBe(true)
    expect(harness.createOpencode).toHaveBeenCalledTimes(1)

    await harness.service.stop()

    expect(harness.serverClose).toHaveBeenCalledTimes(1)
    expect(harness.service.isRunning()).toBe(false)
  })

  it('creates a session lazily and reuses it across calls', async () => {
    const harness = createServiceHarness()

    await harness.service.start()

    await expect(harness.service.getOrCreateSession()).resolves.toBe('session-1')
    await expect(harness.service.getOrCreateSession()).resolves.toBe('session-1')

    expect(harness.sessionCreate).toHaveBeenCalledTimes(1)
  })

  it('accumulates transcript messages from user prompt and assistant text deltas', async () => {
    const harness = createServiceHarness()

    await harness.service.sendMessage('hello')

    const deltaEvent: EventMessagePartUpdated = {
      type: 'message.part.updated',
      properties: {
        delta: 'Hi',
        part: {
          id: 'part-1',
          sessionID: 'session-1',
          messageID: 'assistant-1',
          type: 'text',
          text: 'Hi'
        }
      }
    }
    const finalizedMessage = {
      type: 'message.updated',
      properties: {
        info: {
          id: 'assistant-1',
          sessionID: 'session-1',
          role: 'assistant',
          time: {
            created: 1,
            completed: 2
          },
          parentID: 'user-1',
          modelID: 'claude-sonnet-4-20250514',
          providerID: 'anthropic',
          mode: 'build',
          path: {
            cwd: process.cwd(),
            root: process.cwd()
          },
          cost: 0,
          tokens: {
            input: 0,
            output: 0,
            reasoning: 0,
            cache: {
              read: 0,
              write: 0
            }
          }
        },
        parts: [
          {
            id: 'part-1',
            sessionID: 'session-1',
            messageID: 'assistant-1',
            type: 'text',
            text: 'Hi'
          }
        ]
      }
    } as unknown as EventMessageUpdated

    harness.eventQueue.push(deltaEvent)
    harness.eventQueue.push(finalizedMessage)
    await flushPromises()

    const snapshot = harness.service.getSnapshot()
    expect(snapshot.messages).toMatchObject([
      { id: expect.any(String), role: 'user', content: 'hello' },
      { id: 'assistant-1', role: 'assistant', content: 'Hi' }
    ])
    expect(harness.promptAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        path: { id: 'session-1' },
        body: expect.objectContaining({
          parts: [{ type: 'text', text: 'hello' }]
        })
      })
    )
  })

  it('tracks pending confirmations and clears them after reply', async () => {
    const harness = createServiceHarness()

    await harness.service.start()
    await harness.service.getOrCreateSession()

    const permissionEvent: EventPermissionUpdated = {
      type: 'permission.updated',
      properties: {
        id: 'perm-1',
        type: 'tool',
        pattern: ['start_loop'],
        sessionID: 'session-1',
        messageID: 'assistant-1',
        callID: 'call-1',
        title: 'Approve start_loop',
        metadata: {
          tool: 'start_loop',
          input: {
            projectId: 'project-1'
          }
        },
        time: {
          created: 1
        }
      }
    }

    harness.eventQueue.push(permissionEvent)
    await flushPromises()

    expect(harness.service.getSnapshot().pendingConfirmation).toMatchObject({
      permissionId: 'perm-1',
      toolName: 'start_loop'
    })

    await harness.service.confirmPermission('perm-1', true)

    expect(harness.permissionReply).toHaveBeenCalledWith({
      path: {
        id: 'session-1',
        permissionID: 'perm-1'
      },
      body: {
        response: 'once'
      }
    })
    expect(harness.service.getSnapshot().pendingConfirmation).toBeNull()
  })

  it('emits typed chat events for deltas, tools, permissions, status, errors, and finalized messages', async () => {
    const harness = createServiceHarness()
    const seen: OpenCodeEvent[] = []

    harness.service.onEvent((event) => {
      seen.push(event)
    })

    await harness.service.sendMessage('run tools')

    harness.eventQueue.push({
      type: 'message.part.updated',
      properties: {
        delta: 'Working ',
        part: {
          id: 'part-text',
          sessionID: 'session-1',
          messageID: 'assistant-1',
          type: 'text',
          text: 'Working '
        }
      }
    } satisfies EventMessagePartUpdated)
    harness.eventQueue.push({
      type: 'message.part.updated',
      properties: {
        part: {
          id: 'part-tool-pending',
          sessionID: 'session-1',
          messageID: 'assistant-1',
          type: 'tool',
          callID: 'call-1',
          tool: 'list_projects',
          state: {
            status: 'running',
            input: { limit: 10 },
            time: { start: 1 }
          }
        }
      }
    } satisfies EventMessagePartUpdated)
    harness.eventQueue.push({
      type: 'message.part.updated',
      properties: {
        part: {
          id: 'part-tool-complete',
          sessionID: 'session-1',
          messageID: 'assistant-1',
          type: 'tool',
          callID: 'call-1',
          tool: 'list_projects',
          state: {
            status: 'completed',
            input: { limit: 10 },
            output: '[{"id":"project-1"}]',
            title: 'Listed projects',
            metadata: {},
            time: { start: 1, end: 2 }
          }
        }
      }
    } satisfies EventMessagePartUpdated)
    harness.eventQueue.push({
      type: 'permission.updated',
      properties: {
        id: 'perm-1',
        type: 'tool',
        sessionID: 'session-1',
        messageID: 'assistant-1',
        title: 'Approve start_loop',
        metadata: {
          tool: 'start_loop'
        },
        time: { created: 1 }
      }
    } satisfies EventPermissionUpdated)
    harness.eventQueue.push({
      type: 'session.status',
      properties: {
        sessionID: 'session-1',
        status: {
          type: 'busy'
        }
      }
    } satisfies EventSessionStatus)
    harness.eventQueue.push({
      type: 'session.error',
      properties: {
        sessionID: 'session-1',
        error: {
          name: 'UnknownError',
          data: {
            message: 'boom'
          }
        }
      }
    })
    harness.eventQueue.push({
      type: 'message.updated',
      properties: {
        info: {
          id: 'assistant-1',
          sessionID: 'session-1',
          role: 'assistant',
          time: { created: 1, completed: 2 },
          parentID: 'user-1',
          modelID: 'claude-sonnet-4-20250514',
          providerID: 'anthropic',
          mode: 'build',
          path: { cwd: process.cwd(), root: process.cwd() },
          cost: 0,
          tokens: {
            input: 0,
            output: 0,
            reasoning: 0,
            cache: { read: 0, write: 0 }
          }
        },
        parts: [
          {
            id: 'part-text',
            sessionID: 'session-1',
            messageID: 'assistant-1',
            type: 'text',
            text: 'Working '
          }
        ]
      }
    } as unknown as EventMessageUpdated)
    await flushPromises()

    expect(seen.map((event) => event.type)).toEqual([
      'chat:status',
      'chat:delta',
      'chat:tool-call',
      'chat:tool-result',
      'chat:confirm-request',
      'chat:status',
      'chat:error',
      'chat:message',
      'chat:status'
    ])
  })

  it('restarts after the event stream ends and still delivers the next message', async () => {
    const harness = createServiceHarness()

    await harness.service.sendMessage('first')
    expect(harness.createOpencode).toHaveBeenCalledTimes(1)

    harness.eventQueue.finish()
    await flushPromises()

    expect(harness.service.isRunning()).toBe(false)

    await harness.service.sendMessage('second')

    expect(harness.createOpencode).toHaveBeenCalledTimes(2)
    expect(harness.promptAsync).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        body: expect.objectContaining({
          parts: [{ type: 'text', text: 'second' }]
        })
      })
    )
  })

  it('updates the runtime model config and uses it for future prompts', async () => {
    const harness = createServiceHarness()

    await harness.service.start()
    await harness.service.updateModel('openai', 'gpt-4o')
    await harness.service.sendMessage('hello again')

    expect(harness.configUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          model: 'openai/gpt-4o'
        })
      })
    )
    expect(harness.promptAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          model: {
            providerID: 'openai',
            modelID: 'gpt-4o'
          }
        })
      })
    )
  })
})
