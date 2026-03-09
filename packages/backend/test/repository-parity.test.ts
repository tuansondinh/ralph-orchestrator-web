import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import {
  closeDatabase,
  createDatabase,
  initializeDatabase
} from '../src/db/connection.js'
import {
  createPostgresRepositoryBundle,
  createSqliteRepositoryBundle
} from '../src/db/repositories/index.js'
import { postgresSchema } from '../src/db/schema/postgres.js'
import type { RepositoryBundle } from '../src/db/repositories/contracts.js'

const DEFAULT_POSTGRES_TEST_URL =
  'postgresql://supabase_admin:postgres@127.0.0.1:55322/postgres'

type Cleanup = () => Promise<void> | void

interface Harness {
  bundle: RepositoryBundle
  cleanup: Cleanup
}

async function verifyRepositoryContract(bundle: RepositoryBundle, mode: 'local' | 'cloud') {
  const now = Date.now()
  const cloudFields =
    mode === 'cloud'
      ? {
          userId: null,
          githubOwner: null,
          githubRepo: null,
          defaultBranch: null,
          workspacePath: null
        }
      : {}

  expect(await bundle.projects.list()).toEqual([])
  expect(await bundle.settings.list()).toEqual([])

  await bundle.settings.upsert({
    key: 'chat.model',
    value: 'gemini'
  })
  await bundle.settings.upsert({
    key: 'chat.model',
    value: 'claude'
  })

  expect(await bundle.settings.get('chat.model')).toEqual({
    key: 'chat.model',
    value: 'claude'
  })
  expect(await bundle.settings.list()).toEqual([
    {
      key: 'chat.model',
      value: 'claude'
    }
  ])

  const project = await bundle.projects.create({
    id: 'project-1',
    name: 'Project One',
    path: '/tmp/project-one',
    type: null,
    ralphConfig: null,
    createdAt: now,
    updatedAt: now
  })

  expect(project).toMatchObject({
    id: 'project-1',
    name: 'Project One',
    path: '/tmp/project-one',
    type: null,
    ralphConfig: null,
    createdAt: now,
    updatedAt: now,
    ...cloudFields
  })
  expect(await bundle.projects.findById(project.id)).toEqual(project)

  const updatedProject = await bundle.projects.update(project.id, {
    name: 'Project Prime',
    type: 'node',
    ralphConfig: 'ralph.yml',
    updatedAt: now + 1
  })

  expect(updatedProject).toMatchObject({
    id: 'project-1',
    name: 'Project Prime',
    path: '/tmp/project-one',
    type: 'node',
    ralphConfig: 'ralph.yml',
    createdAt: now,
    updatedAt: now + 1,
    ...cloudFields
  })

  const loopRun = await bundle.loopRuns.create({
    id: 'loop-1',
    projectId: project.id,
    ralphLoopId: null,
    state: 'running',
    config: null,
    prompt: null,
    worktree: null,
    iterations: 0,
    tokensUsed: 0,
    errors: 0,
    startedAt: now + 2,
    endedAt: null
  })

  expect(await bundle.loopRuns.findById(loopRun.id)).toEqual(loopRun)

  const updatedLoopRun = await bundle.loopRuns.update(loopRun.id, {
    state: 'completed',
    iterations: 2,
    tokensUsed: 11,
    errors: 1,
    endedAt: now + 3
  })

  expect(updatedLoopRun).toEqual({
    id: 'loop-1',
    projectId: project.id,
    ralphLoopId: null,
    state: 'completed',
    config: null,
    prompt: null,
    worktree: null,
    iterations: 2,
    tokensUsed: 11,
    errors: 1,
    startedAt: now + 2,
    endedAt: now + 3
  })
  expect(await bundle.loopRuns.listAll()).toEqual([updatedLoopRun])
  expect(await bundle.loopRuns.listByProjectId(project.id)).toEqual([updatedLoopRun])

  const firstActiveSession = await bundle.chats.createSession({
    id: 'session-1',
    projectId: project.id,
    type: 'task',
    state: 'active',
    createdAt: now + 4,
    endedAt: null
  })
  await bundle.chats.createSession({
    id: 'session-2',
    projectId: project.id,
    type: 'plan',
    state: 'completed',
    createdAt: now + 5,
    endedAt: now + 6
  })

  expect(await bundle.chats.findLatestActiveSessionByProjectId(project.id)).toEqual(
    firstActiveSession
  )

  const newestActiveSession = await bundle.chats.createSession({
    id: 'session-3',
    projectId: project.id,
    type: 'loop',
    state: 'waiting',
    createdAt: now + 7,
    endedAt: null
  })

  expect(await bundle.chats.findLatestActiveSessionByProjectId(project.id)).toEqual(
    newestActiveSession
  )

  await bundle.chats.createMessage({
    id: 'message-2',
    sessionId: newestActiveSession.id,
    role: 'assistant',
    content: 'second',
    timestamp: now + 9
  })
  await bundle.chats.createMessage({
    id: 'message-1',
    sessionId: newestActiveSession.id,
    role: 'user',
    content: 'first',
    timestamp: now + 8
  })

  expect(await bundle.chats.listMessagesBySessionId(newestActiveSession.id)).toEqual([
    {
      id: 'message-1',
      sessionId: newestActiveSession.id,
      role: 'user',
      content: 'first',
      timestamp: now + 8
    },
    {
      id: 'message-2',
      sessionId: newestActiveSession.id,
      role: 'assistant',
      content: 'second',
      timestamp: now + 9
    }
  ])

  const notification = await bundle.notifications.create({
    id: 'notification-1',
    projectId: null,
    type: 'loop_complete',
    title: 'Loop completed',
    message: null,
    read: false,
    createdAt: now + 10
  })
  await bundle.notifications.create({
    id: 'notification-2',
    projectId: null,
    type: 'needs_input',
    title: 'Input required',
    message: 'Waiting on review',
    read: true,
    createdAt: now + 11
  })

  expect(await bundle.notifications.findById(notification.id)).toEqual(notification)

  const updatedNotification = await bundle.notifications.update(notification.id, {
    read: true,
    message: 'Completed successfully'
  })

  expect(updatedNotification).toEqual({
    id: 'notification-1',
    projectId: null,
    type: 'loop_complete',
    title: 'Loop completed',
    message: 'Completed successfully',
    read: true,
    createdAt: now + 10
  })
  expect(await bundle.notifications.list({ limit: 1 })).toEqual([
    {
      id: 'notification-2',
      projectId: null,
      type: 'needs_input',
      title: 'Input required',
      message: 'Waiting on review',
      read: true,
      createdAt: now + 11
    }
  ])

  await bundle.notifications.delete('notification-2')
  expect(await bundle.notifications.findById('notification-2')).toBeNull()

  await bundle.projects.delete(project.id)

  expect(await bundle.projects.findById(project.id)).toBeNull()
  expect(await bundle.loopRuns.findById(loopRun.id)).toBeNull()
  expect(await bundle.chats.findSessionById(firstActiveSession.id)).toBeNull()
  expect(await bundle.chats.findSessionById(newestActiveSession.id)).toBeNull()
  expect(await bundle.chats.listMessagesBySessionId(newestActiveSession.id)).toEqual([])
  expect(await bundle.settings.get('chat.model')).toEqual({
    key: 'chat.model',
    value: 'claude'
  })

  await bundle.settings.delete('chat.model')
  expect(await bundle.settings.get('chat.model')).toBeNull()
}

async function createSqliteHarness(): Promise<Harness> {
  const connection = createDatabase({
    filePath: ':memory:'
  })
  initializeDatabase(connection)

  return {
    bundle: createSqliteRepositoryBundle(connection.db),
    cleanup: () => closeDatabase(connection)
  }
}

async function createPostgresHarness(): Promise<Harness> {
  const schemaName = `repository_contract_${randomUUID().replace(/-/g, '')}`
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

  return {
    bundle: createPostgresRepositoryBundle(
      drizzle(client, {
        schema: postgresSchema
      })
    ),
    cleanup: async () => {
      await client.unsafe(`drop schema if exists "${schemaName}" cascade`)
      await client.end()
    }
  }
}

describe('repository contract parity', () => {
  const cleanups: Cleanup[] = []

  afterEach(async () => {
    while (cleanups.length > 0) {
      await cleanups.pop()?.()
    }
  })

  it('preserves the documented repository contract in sqlite local mode', async () => {
    const harness = await createSqliteHarness()
    cleanups.push(harness.cleanup)

    await verifyRepositoryContract(harness.bundle, 'local')
  })

  it('preserves the documented repository contract in postgres cloud mode', async () => {
    const harness = await createPostgresHarness()
    cleanups.push(harness.cleanup)

    await verifyRepositoryContract(harness.bundle, 'cloud')
  })
})
