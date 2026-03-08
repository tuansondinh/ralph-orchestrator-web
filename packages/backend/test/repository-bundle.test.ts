import { afterEach, describe, expect, it } from 'vitest'
import {
  closeDatabase,
  createDatabase,
  initializeDatabase,
  type DatabaseConnection
} from '../src/db/connection.js'
import { createRepositoryBundle } from '../src/db/repositories/index.js'

describe('repository bundle composition', () => {
  const connections: DatabaseConnection[] = []

  afterEach(() => {
    while (connections.length > 0) {
      const connection = connections.pop()
      if (connection) {
        closeDatabase(connection)
      }
    }
  })

  it('composes sqlite repositories that preserve current CRUD behavior', async () => {
    const connection = createDatabase({
      filePath: ':memory:'
    })
    initializeDatabase(connection)
    connections.push(connection)

    const repositories = createRepositoryBundle(connection)
    const now = Date.now()

    await repositories.settings.upsert({
      key: 'chat.model',
      value: 'gemini'
    })

    await repositories.projects.create({
      id: 'project-1',
      name: 'Project One',
      path: '/tmp/project-one',
      type: 'node',
      ralphConfig: 'ralph.yml',
      createdAt: now,
      updatedAt: now
    })

    await repositories.loopRuns.create({
      id: 'loop-1',
      projectId: 'project-1',
      ralphLoopId: 'primary-20260309-000000',
      state: 'running',
      config: '{"foo":"bar"}',
      prompt: 'Ship it',
      worktree: 'feature/repo-contracts',
      iterations: 1,
      tokensUsed: 10,
      errors: 0,
      startedAt: now,
      endedAt: null
    })

    await repositories.notifications.create({
      id: 'notification-1',
      projectId: 'project-1',
      type: 'loop_complete',
      title: 'Loop completed',
      message: null,
      read: false,
      createdAt: now
    })

    expect(await repositories.settings.list()).toEqual([
      {
        key: 'chat.model',
        value: 'gemini'
      }
    ])
    expect(await repositories.projects.list()).toEqual([
      {
        id: 'project-1',
        name: 'Project One',
        path: '/tmp/project-one',
        type: 'node',
        ralphConfig: 'ralph.yml',
        createdAt: now,
        updatedAt: now
      }
    ])
    expect(await repositories.loopRuns.listByProjectId('project-1')).toEqual([
      {
        id: 'loop-1',
        projectId: 'project-1',
        ralphLoopId: 'primary-20260309-000000',
        state: 'running',
        config: '{"foo":"bar"}',
        prompt: 'Ship it',
        worktree: 'feature/repo-contracts',
        iterations: 1,
        tokensUsed: 10,
        errors: 0,
        startedAt: now,
        endedAt: null
      }
    ])
    expect(await repositories.notifications.list()).toEqual([
      {
        id: 'notification-1',
        projectId: 'project-1',
        type: 'loop_complete',
        title: 'Loop completed',
        message: null,
        read: false,
        createdAt: now
      }
    ])
  })
})
