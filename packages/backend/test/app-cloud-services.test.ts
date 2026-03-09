import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { createApp } from '../src/app.js'
import type { DatabaseProvider } from '../src/db/connection.js'
import { createPostgresRepositoryBundle } from '../src/db/repositories/index.js'
import { postgresSchema } from '../src/db/schema/postgres.js'

const DEFAULT_POSTGRES_TEST_URL =
  'postgresql://supabase_admin:postgres@127.0.0.1:55322/postgres'

async function createPostgresHarness() {
  const schemaName = `app_cloud_services_${randomUUID().replace(/-/g, '')}`
  const connectionString = process.env.RALPH_TEST_POSTGRES_URL ?? DEFAULT_POSTGRES_TEST_URL
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
      updated_at bigint not null
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

describe('createApp cloud service wiring', () => {
  const apps: Array<ReturnType<typeof createApp>> = []
  const cleanups: Array<() => Promise<void>> = []

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

  it('exposes repository-backed loop, chat, monitoring, project, and settings services in cloud mode', async () => {
    const harness = await createPostgresHarness()
    cleanups.push(harness.cleanup)
    const now = Date.now()
    await harness.repositories.projects.create({
      id: 'project-1',
      name: 'Project One',
      path: process.cwd(),
      type: null,
      ralphConfig: null,
      createdAt: now,
      updatedAt: now
    })

    const close = vi.fn(async () => {})
    const databaseProviderFactory = vi.fn<() => DatabaseProvider>(() => ({
      mode: 'cloud',
      dialect: 'postgres',
      client: harness.client as never,
      db: harness.db,
      metadata: {
        connectionString: 'postgresql://postgres:postgres@localhost:5432/ralph'
      },
      async close() {
        await close()
      }
    }))

    const app = createApp({
      runtime: {
        mode: 'cloud',
        capabilities: {
          mode: 'cloud',
          database: true,
          auth: false,
          remoteExecution: false,
          realtime: false
        },
        cloud: {
          supabaseUrl: 'https://example.supabase.co',
          supabaseAnonKey: 'anon-key',
          databaseUrl: 'postgresql://postgres:postgres@localhost:5432/ralph'
        }
      },
      databaseProviderFactory
    })
    apps.push(app)

    await expect(app.projectService.list()).resolves.toEqual([
      expect.objectContaining({
        id: 'project-1',
        name: 'Project One'
      })
    ])
    await expect(app.settingsService.get()).resolves.toMatchObject({
      chatModel: 'gemini',
      ralphBinaryPath: null
    })
    await expect(app.loopService.list('project-1')).resolves.toEqual(
      expect.any(Array)
    )
    await expect(app.chatService.getProjectSession('project-1')).resolves.toBeNull()
    await expect(app.monitoringService.getStatus()).resolves.toMatchObject({
      activeLoops: expect.any(Number),
      totalRuns: expect.any(Number),
      erroredRuns: expect.any(Number)
    })
    expect(close).not.toHaveBeenCalled()
  })
})
