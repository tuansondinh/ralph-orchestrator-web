import { randomUUID } from 'node:crypto'
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import WebSocket from 'ws'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { createApp } from '../src/app.js'
import type { DatabaseProvider } from '../src/db/connection.js'
import { createPostgresRepositoryBundle } from '../src/db/repositories/index.js'
import { postgresSchema } from '../src/db/schema/postgres.js'
import { getSupabaseClient } from '../src/auth/supabaseAuth.js'

interface MockAuthClient {
  auth: {
    getUser: Mock
  }
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn()
    }
  }))
}))

const DEFAULT_POSTGRES_TEST_URL =
  'postgresql://supabase_admin:postgres@127.0.0.1:55322/postgres'

function createMessageWaiter(socket: WebSocket) {
  return (
    predicate: (message: Record<string, unknown>) => boolean,
    timeoutMs = 3_000
  ) =>
    new Promise<Record<string, unknown>>((resolve, reject) => {
      const timeout = setTimeout(() => {
        socket.off('message', onMessage)
        reject(new Error(`Timed out waiting for websocket message (${timeoutMs}ms)`))
      }, timeoutMs)

      const onMessage = (raw: WebSocket.RawData) => {
        let parsed: Record<string, unknown>
        try {
          parsed = JSON.parse(raw.toString('utf8'))
        } catch {
          return
        }

        if (!predicate(parsed)) {
          return
        }

        clearTimeout(timeout)
        socket.off('message', onMessage)
        resolve(parsed)
      }

      socket.on('message', onMessage)
    })
}

async function connectWS(wsUrl: string) {
  const ws = new WebSocket(wsUrl)
  await new Promise<void>((resolve, reject) => {
    ws.once('open', resolve)
    ws.once('error', reject)
  })
  return ws
}

function waitForClose(socket: WebSocket) {
  return new Promise<{ code: number; reason: string }>((resolve) => {
    socket.once('close', (code, reason) => {
      resolve({
        code,
        reason: reason.toString('utf8')
      })
    })
  })
}

async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  timeoutMs = 4_000,
  pollMs = 20
) {
  const start = Date.now()
  while (!(await predicate())) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`waitFor timed out after ${timeoutMs}ms`)
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs))
  }
}

async function createMockBinary(dir: string) {
  const filePath = join(dir, 'mock-cloud-ws-ralph.mjs')
  const script = `#!/usr/bin/env node
const args = process.argv.slice(2)
if (args[0] === 'loops' && args[1] === 'stop') process.exit(0)
setTimeout(() => process.exit(0), 40)
process.on('SIGTERM', () => process.exit(0))
`
  await writeFile(filePath, script, 'utf8')
  await chmod(filePath, 0o755)
  return filePath
}

async function createPostgresHarness() {
  const schemaName = `websocket_auth_${randomUUID().replace(/-/g, '')}`
  const connectionString =
    process.env.RALPH_TEST_POSTGRES_URL ?? DEFAULT_POSTGRES_TEST_URL
  const client = postgres(connectionString, {
    max: 1,
    onnotice: () => {}
  })

  await client.unsafe(`create schema "${schemaName}"`)
  await client.unsafe(`set search_path to "${schemaName}"`)
  await client.unsafe(`
    create table projects (
      id text primary key,
      name text not null,
      path text not null unique,
      type text,
      ralph_config text,
      created_at bigint not null,
      updated_at bigint not null,
      user_id text,
      github_owner text,
      github_repo text,
      default_branch text,
      workspace_path text
    );
    create table loop_runs (
      id text primary key,
      project_id text not null references projects(id) on delete cascade,
      ralph_loop_id text,
      state text not null,
      config text,
      prompt text,
      worktree text,
      iterations bigint not null default 0,
      tokens_used bigint not null default 0,
      errors bigint not null default 0,
      started_at bigint not null,
      ended_at bigint
    );
    create table chat_sessions (
      id text primary key,
      project_id text not null references projects(id) on delete cascade,
      type text not null,
      state text not null,
      created_at bigint not null,
      ended_at bigint
    );
    create table chat_messages (
      id text primary key,
      session_id text not null references chat_sessions(id) on delete cascade,
      role text not null,
      content text not null,
      timestamp bigint not null
    );
    create table notifications (
      id text primary key,
      project_id text references projects(id),
      type text not null,
      title text not null,
      message text,
      read boolean not null default false,
      created_at bigint not null
    );
    create table settings (
      key text primary key,
      value text not null
    );
    create table github_connections (
      id text primary key,
      user_id text not null,
      github_user_id integer not null,
      github_username text not null,
      access_token text not null,
      scope text not null,
      connected_at bigint not null
    );
    create table loop_output_chunks (
      id text primary key,
      loop_run_id text not null references loop_runs(id) on delete cascade,
      sequence integer not null,
      stream text not null,
      data text not null,
      created_at bigint not null
    );
    create index loop_output_chunks_loop_run_id_sequence_idx on loop_output_chunks(loop_run_id, sequence);
  `)

  const db = drizzle(client, {
    schema: postgresSchema
  })

  return {
    client,
    db,
    repositories: createPostgresRepositoryBundle(db),
    async cleanup() {
      await client.unsafe(`drop schema if exists "${schemaName}" cascade`)
      await client.end()
    }
  }
}

function getMockAuthClient() {
  return getSupabaseClient() as unknown as MockAuthClient
}

describe('cloud websocket auth gating', () => {
  const apps: Array<ReturnType<typeof createApp>> = []
  const cleanups: Array<() => Promise<void>> = []
  const tempDirs: string[] = []
  const envSnapshots: Record<string, string | undefined>[] = []

  beforeEach(() => {
    vi.resetAllMocks()
  })

  afterEach(async () => {
    while (apps.length > 0) {
      await apps.pop()?.close()
    }

    while (cleanups.length > 0) {
      await cleanups.pop()?.()
    }

    while (tempDirs.length > 0) {
      await rm(tempDirs.pop()!, { recursive: true, force: true })
    }

    while (envSnapshots.length > 0) {
      const snapshot = envSnapshots.pop()!
      for (const [key, value] of Object.entries(snapshot)) {
        if (value === undefined) {
          delete process.env[key]
        } else {
          process.env[key] = value
        }
      }
    }
  })

  async function setupCloudApp() {
    const harness = await createPostgresHarness()
    cleanups.push(harness.cleanup)

    const tempDir = await mkdtemp(join(tmpdir(), 'cloud-ws-auth-'))
    tempDirs.push(tempDir)

    const ownedProjectPath = join(tempDir, 'owned-project')
    const foreignProjectPath = join(tempDir, 'foreign-project')
    await mkdir(ownedProjectPath, { recursive: true })
    await mkdir(foreignProjectPath, { recursive: true })

    const ownedProjectId = randomUUID()
    const foreignProjectId = randomUUID()
    const now = Date.now()
    await harness.repositories.projects.create({
      id: ownedProjectId,
      name: 'Owned project',
      path: ownedProjectPath,
      type: 'node',
      ralphConfig: null,
      createdAt: now,
      updatedAt: now,
      userId: 'user-123'
    })
    await harness.repositories.projects.create({
      id: foreignProjectId,
      name: 'Foreign project',
      path: foreignProjectPath,
      type: 'node',
      ralphConfig: null,
      createdAt: now,
      updatedAt: now,
      userId: 'user-999'
    })

    envSnapshots.push({
      RALPH_UI_RALPH_BIN: process.env.RALPH_UI_RALPH_BIN
    })
    process.env.RALPH_UI_RALPH_BIN = await createMockBinary(tempDir)

    const databaseProviderFactory = vi.fn<() => DatabaseProvider>(() => ({
      mode: 'cloud',
      dialect: 'postgres',
      client: harness.client as never,
      db: harness.db,
      metadata: {
        connectionString: 'postgresql://postgres:postgres@localhost:5432/ralph'
      },
      async close() {}
    }))

    const app = createApp({
      runtime: {
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
          supabaseAnonKey: 'test-anon-key',
          databaseUrl: 'postgresql://postgres:postgres@localhost:5432/ralph'
        }
      },
      databaseProviderFactory
    })
    apps.push(app)

    await app.listen({ host: '127.0.0.1', port: 0 })
    const address = app.server.address() as AddressInfo

    const authClient = getMockAuthClient()
    authClient.auth.getUser.mockImplementation(async (token: string) => {
      if (token === 'valid-token-user-123') {
        return {
          data: {
            user: {
              id: 'user-123',
              email: 'user-123@example.com'
            }
          },
          error: null
        }
      }

      return {
        data: {
          user: null
        },
        error: new Error('Invalid token')
      }
    })

    return {
      app,
      wsUrl: `ws://127.0.0.1:${address.port}/ws`,
      authClient,
      ownedProjectId,
      foreignProjectId
    }
  }

  it('rejects unauthenticated cloud websocket clients before subscribing', async () => {
    const { wsUrl, authClient } = await setupCloudApp()
    const socket = new WebSocket(wsUrl)

    await expect(waitForClose(socket)).resolves.toEqual({
      code: 1008,
      reason: 'Authentication required'
    })
    expect(authClient.auth.getUser).not.toHaveBeenCalled()
  })

  it('accepts authenticated cloud websocket clients via access_token query param', async () => {
    const { app, wsUrl, ownedProjectId, authClient } = await setupCloudApp()
    const loop = await app.loopService.start(ownedProjectId, { prompt: 'exit-fast' })

    const socket = await connectWS(`${wsUrl}?access_token=valid-token-user-123`)
    const nextMessage = createMessageWaiter(socket)

    socket.send(JSON.stringify({ type: 'subscribe', channels: [`loop:${loop.id}:state`] }))

    await expect(
      nextMessage((message) => message.type === 'loop.state' && message.loopId === loop.id)
    ).resolves.toMatchObject({
      type: 'loop.state',
      loopId: loop.id
    })
    expect(authClient.auth.getUser).toHaveBeenCalledWith('valid-token-user-123')
    await waitFor(async () => {
      const latest = await app.loopService.get(loop.id)
      return latest.state === 'completed' || latest.state === 'crashed'
    })
    socket.close()
  })

  it('rejects authenticated cloud subscriptions for another user project channel', async () => {
    const { app, wsUrl, foreignProjectId } = await setupCloudApp()
    const loop = await app.loopService.start(foreignProjectId, { prompt: 'exit-fast' })

    const socket = await connectWS(`${wsUrl}?access_token=valid-token-user-123`)
    const nextMessage = createMessageWaiter(socket)

    socket.send(JSON.stringify({ type: 'subscribe', channels: [`loop:${loop.id}:state`] }))

    await expect(nextMessage((message) => message.type === 'error')).resolves.toMatchObject({
      type: 'error',
      message: expect.stringMatching(/access/i)
    })
    await waitFor(async () => {
      const latest = await app.loopService.get(loop.id)
      return latest.state === 'completed' || latest.state === 'crashed'
    })
    socket.close()
  })
})
