import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import {
  defineRepositoryBundle,
  type ChatMessageRecord,
  type ChatRepository,
  type ChatSessionRecord,
  type GitHubConnectionRepository,
  type LoopOutputRepository,
  type LoopRunRecord,
  type LoopRunRepository,
  type NotificationRecord,
  type NotificationRepository,
  type ProjectRecord,
  type ProjectRepository,
  type RepositoryBundle,
  type SettingsRepository,
  type SettingRecord
} from '../src/db/repositories/contracts.js'

function createProjectRepositoryStub(): ProjectRepository {
  return {
    list: vi.fn(async () => []),
    findById: vi.fn(async () => null),
    create: vi.fn(async (project: ProjectRecord) => project),
    update: vi.fn(async (projectId: string, updates) => ({
      id: projectId,
      name: updates.name ?? 'Updated',
      path: updates.path ?? '/tmp/project',
      type: updates.type ?? null,
      ralphConfig: updates.ralphConfig ?? null,
      createdAt: 1,
      updatedAt: updates.updatedAt
    })),
    delete: vi.fn(async () => {})
  }
}

function createLoopRunRepositoryStub(): LoopRunRepository {
  return {
    listAll: vi.fn(async () => []),
    listByProjectId: vi.fn(async () => []),
    findById: vi.fn(async () => null),
    create: vi.fn(async (run: LoopRunRecord) => run),
    update: vi.fn(async (runId: string, updates) => ({
      id: runId,
      projectId: 'project-1',
      ralphLoopId: updates.ralphLoopId ?? null,
      state: updates.state ?? 'running',
      config: updates.config ?? null,
      prompt: updates.prompt ?? null,
      worktree: updates.worktree ?? null,
      iterations: updates.iterations ?? 0,
      tokensUsed: updates.tokensUsed ?? 0,
      errors: updates.errors ?? 0,
      startedAt: updates.startedAt ?? 1,
      endedAt: updates.endedAt ?? null
    })),
    findByState: vi.fn(async () => [])
  }
}

function createChatRepositoryStub(): ChatRepository {
  return {
    findSessionById: vi.fn(async () => null),
    findLatestActiveSessionByProjectId: vi.fn(async () => null),
    createSession: vi.fn(async (session: ChatSessionRecord) => session),
    updateSession: vi.fn(async (sessionId: string, updates) => ({
      id: sessionId,
      projectId: 'project-1',
      type: updates.type ?? 'task',
      state: updates.state ?? 'active',
      createdAt: updates.createdAt ?? 1,
      endedAt: updates.endedAt ?? null
    })),
    listMessagesBySessionId: vi.fn(async () => []),
    createMessage: vi.fn(async (message: ChatMessageRecord) => message)
  }
}

function createNotificationRepositoryStub(): NotificationRepository {
  return {
    list: vi.fn(async () => []),
    findById: vi.fn(async () => null),
    create: vi.fn(async (notification: NotificationRecord) => notification),
    update: vi.fn(async (notificationId: string, updates) => ({
      id: notificationId,
      projectId: updates.projectId ?? null,
      type: updates.type ?? 'loop_complete',
      title: updates.title ?? 'Loop completed',
      message: updates.message ?? null,
      read: updates.read ?? false,
      createdAt: updates.createdAt ?? 1
    })),
    delete: vi.fn(async () => {})
  }
}

function createSettingsRepositoryStub(): SettingsRepository {
  return {
    list: vi.fn(async () => []),
    get: vi.fn(async () => null),
    upsert: vi.fn(async (setting: SettingRecord) => setting),
    delete: vi.fn(async () => {})
  }
}

function createGitHubConnectionRepositoryStub(): GitHubConnectionRepository {
  return {
    findByUserId: vi.fn(async () => null),
    create: vi.fn(async () => {}),
    delete: vi.fn(async () => {})
  }
}

function createLoopOutputRepositoryStub(): LoopOutputRepository {
  return {
    append: vi.fn(async () => {}),
    getByLoopRunId: vi.fn(async () => []),
    deleteByLoopRunId: vi.fn(async () => {})
  }
}

function exerciseRepositoryBundle(bundle: RepositoryBundle) {
  void bundle.projects.list()
  void bundle.projects.findById('project-1')
  void bundle.projects.create({
    id: 'project-1',
    name: 'Project One',
    path: '/tmp/project-one',
    type: 'node',
    ralphConfig: 'ralph.yml',
    createdAt: 1,
    updatedAt: 1
  })
  void bundle.projects.update('project-1', {
    name: 'Renamed',
    updatedAt: 2
  })
  void bundle.projects.delete('project-1')

  void bundle.loopRuns.listAll()
  void bundle.loopRuns.listByProjectId('project-1')
  void bundle.loopRuns.findById('loop-1')
  void bundle.loopRuns.create({
    id: 'loop-1',
    projectId: 'project-1',
    ralphLoopId: null,
    state: 'running',
    config: null,
    prompt: null,
    worktree: null,
    iterations: 0,
    tokensUsed: 0,
    errors: 0,
    startedAt: 1,
    endedAt: null
  })
  void bundle.loopRuns.update('loop-1', {
    state: 'completed',
    endedAt: 2
  })

  void bundle.chats.findSessionById('session-1')
  void bundle.chats.findLatestActiveSessionByProjectId('project-1')
  void bundle.chats.createSession({
    id: 'session-1',
    projectId: 'project-1',
    type: 'task',
    state: 'active',
    createdAt: 1,
    endedAt: null
  })
  void bundle.chats.updateSession('session-1', {
    state: 'completed',
    endedAt: 2
  })
  void bundle.chats.listMessagesBySessionId('session-1')
  void bundle.chats.createMessage({
    id: 'message-1',
    sessionId: 'session-1',
    role: 'assistant',
    content: 'Ready',
    timestamp: 1
  })

  void bundle.notifications.list({ projectId: 'project-1', limit: 20 })
  void bundle.notifications.findById('notification-1')
  void bundle.notifications.create({
    id: 'notification-1',
    projectId: 'project-1',
    type: 'loop_complete',
    title: 'Loop completed',
    message: null,
    read: false,
    createdAt: 1
  })
  void bundle.notifications.update('notification-1', { read: true })
  void bundle.notifications.delete('notification-1')

  void bundle.settings.list()
  void bundle.settings.get('db.path')
  void bundle.settings.upsert({
    key: 'db.path',
    value: '/tmp/ralph.db'
  })
  void bundle.settings.delete('db.path')
}

describe('repository contracts', () => {
  it('exposes the repository bundle methods required by current service use cases', () => {
    const bundle: RepositoryBundle = defineRepositoryBundle({
      projects: createProjectRepositoryStub(),
      loopRuns: createLoopRunRepositoryStub(),
      chats: createChatRepositoryStub(),
      notifications: createNotificationRepositoryStub(),
      settings: createSettingsRepositoryStub(),
      githubConnections: createGitHubConnectionRepositoryStub(),
      loopOutput: createLoopOutputRepositoryStub()
    })

    expect(() => exerciseRepositoryBundle(bundle)).not.toThrow()
  })

  it('normalizes shared entity field types across repository boundaries', () => {
    expectTypeOf<ProjectRecord['createdAt']>().toEqualTypeOf<number>()
    expectTypeOf<ProjectRecord['ralphConfig']>().toEqualTypeOf<string | null>()
    expectTypeOf<LoopRunRecord['endedAt']>().toEqualTypeOf<number | null>()
    expectTypeOf<ChatSessionRecord['endedAt']>().toEqualTypeOf<number | null>()
    expectTypeOf<ChatMessageRecord['timestamp']>().toEqualTypeOf<number>()
    expectTypeOf<NotificationRecord['read']>().toEqualTypeOf<boolean>()
    expectTypeOf<NotificationRecord['message']>().toEqualTypeOf<string | null>()
    expectTypeOf<SettingRecord['value']>().toEqualTypeOf<string>()
  })
})
