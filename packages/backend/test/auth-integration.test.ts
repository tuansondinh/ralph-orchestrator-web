import type { AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js'
import WebSocket from 'ws'
import { createApp } from '../src/app.js'
import type { DatabaseProvider } from '../src/db/connection.js'
import type { ResolvedRuntimeMode } from '../src/config/runtimeMode.js'

const { mockSupabaseGetUser } = vi.hoisted(() => ({
  mockSupabaseGetUser: vi.fn()
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: mockSupabaseGetUser
    }
  }))
}))

function createCloudRuntime(): ResolvedRuntimeMode {
  return {
    mode: 'cloud' as const,
    capabilities: {
      mode: 'cloud' as const,
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
      supabaseAnonKey: 'test-anon-key',
      databaseUrl: 'postgresql://postgres:postgres@localhost:5432/ralph'
    }
  }
}

function waitForWebSocketClose(socket: WebSocket, timeoutMs = 3_000) {
  return new Promise<{ code: number; reason: string }>((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.terminate()
      reject(new Error(`Timed out waiting for WebSocket close (${timeoutMs}ms)`))
    }, timeoutMs)

    socket.once('close', (code, reason) => {
      clearTimeout(timeout)
      resolve({
        code,
        reason: reason.toString('utf8')
      })
    })
  })
}

function connectWebSocket(wsUrl: string) {
  return new Promise<WebSocket>((resolve, reject) => {
    const socket = new WebSocket(wsUrl)

    socket.once('open', () => resolve(socket))
    socket.once('error', reject)
  })
}

function waitForWebSocketMessage(
  socket: WebSocket,
  predicate: (message: Record<string, unknown>) => boolean,
  timeoutMs = 3_000
) {
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off('message', handleMessage)
      reject(new Error(`Timed out waiting for WebSocket message (${timeoutMs}ms)`))
    }, timeoutMs)

    const handleMessage = (raw: WebSocket.RawData) => {
      let parsed: unknown
      try {
        parsed = JSON.parse(raw.toString('utf8'))
      } catch {
        return
      }

      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        predicate(parsed as Record<string, unknown>)
      ) {
        clearTimeout(timeout)
        socket.off('message', handleMessage)
        resolve(parsed as Record<string, unknown>)
      }
    }

    socket.on('message', handleMessage)
  })
}

function createCloudApp() {
  const databaseProviderFactory = vi.fn<() => DatabaseProvider>(() => ({
    mode: 'cloud',
    dialect: 'postgres',
    client: {} as never,
    db: drizzlePostgres.mock(),
    metadata: {
      connectionString: 'postgresql://postgres:postgres@localhost:5432/ralph'
    },
    async close() {}
  }))

  return createApp({
    runtime: createCloudRuntime(),
    databaseProviderFactory
  })
}

describe('Auth middleware integration', () => {
  const apps: Array<ReturnType<typeof createApp>> = []

  beforeEach(() => {
    vi.resetModules()
    mockSupabaseGetUser.mockReset()
  })

  afterEach(async () => {
    while (apps.length > 0) {
      const app = apps.pop()
      if (app) {
        await app.close()
      }
    }
  })

  it('health endpoint is accessible without auth in cloud mode', async () => {
    const app = createCloudApp()
    apps.push(app)

    const response = await app.inject({
      method: 'GET',
      url: '/health'
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      status: 'ok',
      runtime: {
        mode: 'cloud',
        capabilities: expect.objectContaining({
          auth: true
        })
      }
    })
  })

  it('tRPC capabilities procedure is accessible without auth in cloud mode', async () => {
    const app = createCloudApp()
    apps.push(app)

    const response = await app.inject({
      method: 'GET',
      url: '/trpc/capabilities'
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.result).toMatchObject({
      data: {
        auth: true,
        githubProjects: true,
        localProjects: false
      }
    })
  })

  it('tRPC procedures return 401 without auth in cloud mode', async () => {
    const app = createCloudApp()
    apps.push(app)

    const response = await app.inject({
      method: 'GET',
      url: '/trpc/project.list'
    })

    expect(response.statusCode).toBe(401)
    expect(response.json()).toMatchObject({
      error: 'Missing authorization token'
    })
  })

  it('tRPC procedures succeed with valid auth and scope project lists to the authenticated user', async () => {
    const now = Date.now()
    const projectForUser123 = {
      id: 'project-user-1',
      name: 'User One Project',
      path: '/workspace/user-one-project',
      type: 'node',
      ralphConfig: 'ralph.yml',
      createdAt: now,
      updatedAt: now,
      userId: 'user-123',
      githubOwner: 'octocat',
      githubRepo: 'hello-world',
      defaultBranch: 'main',
      workspacePath: '/workspace/user-one-project'
    }
    const projectForUser456 = {
      id: 'project-user-2',
      name: 'User Two Project',
      path: '/workspace/user-two-project',
      type: 'node',
      ralphConfig: 'ralph.yml',
      createdAt: now,
      updatedAt: now,
      userId: 'user-456',
      githubOwner: 'hubot',
      githubRepo: 'private-repo',
      defaultBranch: 'main',
      workspacePath: '/workspace/user-two-project'
    }

    mockSupabaseGetUser.mockResolvedValue({
      data: {
        user: {
          id: 'user-123',
          email: 'user-123@example.com'
        }
      },
      error: null
    })

    const app = createCloudApp()
    apps.push(app)
    const listSpy = vi
      .spyOn(app.projectService, 'list')
      .mockResolvedValue([projectForUser123, projectForUser456])
    const findByUserIdSpy = vi
      .spyOn(app.projectService, 'findByUserId')
      .mockResolvedValue([projectForUser123])

    const response = await app.inject({
      method: 'GET',
      url: '/trpc/project.list',
      headers: {
        authorization: 'Bearer valid-token'
      }
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      result: {
        data: [
          expect.objectContaining({
            id: 'project-user-1',
            userId: 'user-123',
            githubOwner: 'octocat',
            githubRepo: 'hello-world'
          })
        ]
      }
    })
    expect(findByUserIdSpy).toHaveBeenCalledWith('user-123')
    expect(listSpy).not.toHaveBeenCalled()
  })

  it('rejects websocket connections without a Supabase token in cloud mode', async () => {
    const app = createCloudApp()
    apps.push(app)
    await app.listen({ host: '127.0.0.1', port: 0 })

    const { port } = app.server.address() as AddressInfo
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`)
    const closed = await waitForWebSocketClose(socket)

    expect(closed).toEqual({
      code: 4001,
      reason: 'Authentication required'
    })
  })

  it('accepts websocket connections with a valid Supabase token in cloud mode', async () => {
    mockSupabaseGetUser.mockResolvedValue({
      data: {
        user: {
          id: 'user-123',
          email: 'user-123@example.com'
        }
      },
      error: null
    })

    const app = createCloudApp()
    apps.push(app)
    await app.listen({ host: '127.0.0.1', port: 0 })

    const { port } = app.server.address() as AddressInfo
    const socket = await connectWebSocket(
      `ws://127.0.0.1:${port}/ws?token=valid-token`
    )
    const nextMessage = waitForWebSocketMessage(
      socket,
      (message) =>
        message.type === 'error' &&
        typeof message.message === 'string'
    )

    socket.send('not valid json')

    await expect(nextMessage).resolves.toMatchObject({
      type: 'error'
    })

    socket.close()
  })
})
