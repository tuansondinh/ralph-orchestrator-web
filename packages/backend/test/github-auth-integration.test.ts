import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { createApp } from '../src/app.js'
import type { DatabaseProvider } from '../src/db/connection.js'
import { createPostgresRepositoryBundle } from '../src/db/repositories/index.js'
import { postgresSchema } from '../src/db/schema/postgres.js'
import { getSupabaseClient, initSupabaseAuth } from '../src/auth/supabaseAuth.js'

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
  const schemaName = `github_auth_integration_${randomUUID().replace(/-/g, '')}`
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

function getSetCookieHeader(
  headers: Record<string, string | string[] | undefined>,
  cookieName: string
): string {
  const setCookie = headers['set-cookie']
  const entries = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : []
  const cookie = entries.find((value) => value.startsWith(`${cookieName}=`))
  if (!cookie) {
    throw new Error(`Missing ${cookieName} set-cookie header`)
  }
  return cookie
}

function getCookieRequestHeader(setCookieHeader: string): string {
  return setCookieHeader.split(';', 1)[0] ?? ''
}

function buildCloudApp(
  databaseProviderFactory: () => DatabaseProvider
): ReturnType<typeof createApp> {
  return createApp({
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
        databaseUrl: 'postgresql://postgres:postgres@localhost:5432/ralph',
        githubClientId: 'github-client-id',
        githubClientSecret: 'github-client-secret',
        githubCallbackUrl: 'http://localhost:3003/auth/github/callback'
      }
    },
    databaseProviderFactory
  })
}

describe('GitHub auth integration', () => {
  const apps: Array<ReturnType<typeof createApp>> = []
  const cleanups: Array<() => Promise<void>> = []

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', vi.fn())
    initSupabaseAuth('https://test.supabase.co', 'test-anon-key')
  })

  afterEach(async () => {
    vi.unstubAllGlobals()

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

  it('requires auth to start the GitHub OAuth flow in cloud mode', async () => {
    const harness = await createPostgresHarness()
    cleanups.push(harness.cleanup)

    const app = buildCloudApp(() => ({
      mode: 'cloud',
      dialect: 'postgres',
      client: harness.client as never,
      db: harness.db,
      metadata: {
        connectionString: 'postgresql://postgres:postgres@localhost:5432/ralph'
      },
      async close() {}
    }))
    apps.push(app)

    const response = await app.inject({
      method: 'GET',
      url: '/auth/github'
    })

    expect(response.statusCode).toBe(401)
    expect(response.json()).toEqual({
      error: 'Missing authorization token'
    })
  })

  it('persists an encrypted connection after the GitHub callback returns', async () => {
    const harness = await createPostgresHarness()
    cleanups.push(harness.cleanup)

    const app = buildCloudApp(() => ({
      mode: 'cloud',
      dialect: 'postgres',
      client: harness.client as never,
      db: harness.db,
      metadata: {
        connectionString: 'postgresql://postgres:postgres@localhost:5432/ralph'
      },
      async close() {}
    }))
    apps.push(app)
    await app.ready()

    const authClient = getMockAuthClient()
    authClient.auth.getUser.mockResolvedValue({
      data: {
        user: {
          id: 'user-123',
          email: 'user@example.com'
        }
      },
      error: null
    })

    const fetchMock = global.fetch as unknown as Mock
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'gho_connected_user_token',
          scope: 'repo'
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 12345,
          login: 'octocat'
        })
      })

    const connectResponse = await app.inject({
      method: 'GET',
      url: '/auth/github',
      headers: {
        authorization: 'Bearer access-token'
      }
    })

    expect(connectResponse.statusCode).toBe(302)

    const location = connectResponse.headers.location
    expect(location).toBeTruthy()
    const redirectUrl = new URL(location ?? '')
    const state = redirectUrl.searchParams.get('state')
    expect(state).toBeTruthy()

    const oauthSessionCookie = getSetCookieHeader(
      connectResponse.headers as Record<string, string | string[] | undefined>,
      'github_oauth_session'
    )

    const callbackResponse = await app.inject({
      method: 'GET',
      url: `/auth/github/callback?code=oauth-code&state=${state}`,
      headers: {
        cookie: getCookieRequestHeader(oauthSessionCookie)
      }
    })

    expect(callbackResponse.statusCode).toBe(302)
    expect(callbackResponse.headers.location).toBe('/settings?github=connected')
    expect(
      getSetCookieHeader(
        callbackResponse.headers as Record<string, string | string[] | undefined>,
        'github_oauth_session'
      )
    ).toContain('Max-Age=0')

    const storedConnection = await harness.repositories.githubConnections.findByUserId(
      'user-123'
    )

    expect(storedConnection).toEqual(
      expect.objectContaining({
        userId: 'user-123',
        githubUserId: 12345,
        githubUsername: 'octocat',
        scope: 'repo'
      })
    )
    expect(storedConnection?.accessToken).not.toBe('gho_connected_user_token')
  })

  it('lists repositories for the authenticated cloud user from the stored connection', async () => {
    const harness = await createPostgresHarness()
    cleanups.push(harness.cleanup)

    const app = buildCloudApp(() => ({
      mode: 'cloud',
      dialect: 'postgres',
      client: harness.client as never,
      db: harness.db,
      metadata: {
        connectionString: 'postgresql://postgres:postgres@localhost:5432/ralph'
      },
      async close() {}
    }))
    apps.push(app)
    await app.ready()

    const authClient = getMockAuthClient()
    authClient.auth.getUser.mockResolvedValue({
      data: {
        user: {
          id: 'user-123'
        }
      },
      error: null
    })

    await harness.repositories.githubConnections.create({
      id: 'conn-1',
      userId: 'user-123',
      githubUserId: 12345,
      githubUsername: 'octocat',
      accessToken: app.githubService!.encrypt('gho_repo_scope_token'),
      scope: 'repo',
      connectedAt: Date.now()
    })

    const fetchMock = global.fetch as unknown as Mock
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          id: 1,
          full_name: 'octocat/public-repo',
          private: false,
          default_branch: 'main',
          html_url: 'https://github.com/octocat/public-repo'
        },
        {
          id: 2,
          full_name: 'octocat/private-repo',
          private: true,
          default_branch: 'develop',
          html_url: 'https://github.com/octocat/private-repo'
        }
      ]
    })

    const response = await app.inject({
      method: 'GET',
      url: '/auth/github/repos?page=2&perPage=2',
      headers: {
        authorization: 'Bearer access-token'
      }
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      repos: [
        {
          id: 1,
          fullName: 'octocat/public-repo',
          private: false,
          defaultBranch: 'main',
          htmlUrl: 'https://github.com/octocat/public-repo'
        },
        {
          id: 2,
          fullName: 'octocat/private-repo',
          private: true,
          defaultBranch: 'develop',
          htmlUrl: 'https://github.com/octocat/private-repo'
        }
      ],
      hasMore: true
    })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.github.com/user/repos?sort=updated&per_page=2&page=2&type=all',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer gho_repo_scope_token'
        })
      })
    )
  })

  it('disconnects the stored GitHub connection for the authenticated user', async () => {
    const harness = await createPostgresHarness()
    cleanups.push(harness.cleanup)

    const app = buildCloudApp(() => ({
      mode: 'cloud',
      dialect: 'postgres',
      client: harness.client as never,
      db: harness.db,
      metadata: {
        connectionString: 'postgresql://postgres:postgres@localhost:5432/ralph'
      },
      async close() {}
    }))
    apps.push(app)
    await app.ready()

    const authClient = getMockAuthClient()
    authClient.auth.getUser.mockResolvedValue({
      data: {
        user: {
          id: 'user-123'
        }
      },
      error: null
    })

    await harness.repositories.githubConnections.create({
      id: 'conn-1',
      userId: 'user-123',
      githubUserId: 12345,
      githubUsername: 'octocat',
      accessToken: app.githubService!.encrypt('gho_repo_scope_token'),
      scope: 'repo',
      connectedAt: Date.now()
    })

    const response = await app.inject({
      method: 'DELETE',
      url: '/auth/github',
      headers: {
        authorization: 'Bearer access-token'
      }
    })

    expect(response.statusCode).toBe(204)
    await expect(
      harness.repositories.githubConnections.findByUserId('user-123')
    ).resolves.toBeNull()
  })
})
