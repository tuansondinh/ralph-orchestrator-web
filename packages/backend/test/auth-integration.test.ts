import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { createApp } from '../src/app.js'
import type { DatabaseProvider } from '../src/db/connection.js'
import { createPostgresRepositoryBundle } from '../src/db/repositories/index.js'
import { postgresSchema } from '../src/db/schema/postgres.js'
import {
  getSupabaseClient,
  initSupabaseAuth
} from '../src/auth/supabaseAuth.js'

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

async function createPostgresHarness() {
  const schemaName = `auth_integration_${randomUUID().replace(/-/g, '')}`
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

function getMockAuthClient(): MockAuthClient {
  return getSupabaseClient() as unknown as MockAuthClient
}

describe('Auth middleware integration', () => {
  const apps: Array<ReturnType<typeof createApp>> = []
  const cleanups: Array<() => Promise<void>> = []

  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(async () => {
    while (apps.length > 0) {
      const app = apps.pop()
      if (app) {
        await app.close()
      }
    }

    while (cleanups.length > 0) {
      await cleanups.pop()?.()
    }
  })

  it('health endpoint is accessible without auth in cloud mode', async () => {
    const harness = await createPostgresHarness()
    cleanups.push(harness.cleanup)

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

    // Initialize Supabase auth with mock values
    initSupabaseAuth('https://test.supabase.co', 'test-anon-key')

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
    const harness = await createPostgresHarness()
    cleanups.push(harness.cleanup)

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

    initSupabaseAuth('https://test.supabase.co', 'test-anon-key')

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
    const harness = await createPostgresHarness()
    cleanups.push(harness.cleanup)

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

    initSupabaseAuth('https://test.supabase.co', 'test-anon-key')

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

    const response = await app.inject({
      method: 'GET',
      url: '/trpc/project.list'
    })

    expect(response.statusCode).toBe(401)
    expect(response.json()).toMatchObject({
      error: 'Missing authorization token'
    })
  })

  it('cloud mode passes authenticated user identity to downstream handlers', async () => {
    const harness = await createPostgresHarness()
    cleanups.push(harness.cleanup)

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

    initSupabaseAuth('https://test.supabase.co', 'test-anon-key')

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

    app.get('/chat/auth-context', async (request) => ({
      userId: request.userId,
      email: request.supabaseUser?.email ?? null
    }))

    const client = getMockAuthClient()
    client.auth.getUser.mockResolvedValue({
      data: {
        user: {
          id: 'user-123',
          email: 'user@example.com'
        }
      },
      error: null
    })

    const response = await app.inject({
      method: 'GET',
      url: '/chat/auth-context',
      headers: {
        authorization: 'Bearer valid-token'
      }
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      userId: 'user-123',
      email: 'user@example.com'
    })
  })
})
