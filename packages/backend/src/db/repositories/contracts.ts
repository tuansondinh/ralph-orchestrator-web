export interface ProjectRecord {
  id: string
  name: string
  path: string
  type: string | null
  ralphConfig: string | null
  createdAt: number
  updatedAt: number
  userId?: string | null
  githubOwner?: string | null
  githubRepo?: string | null
  defaultBranch?: string | null
  workspacePath?: string | null
}

export interface ProjectUpdate {
  name?: string
  path?: string
  type?: string | null
  ralphConfig?: string | null
  updatedAt: number
  userId?: string | null
  githubOwner?: string | null
  githubRepo?: string | null
  defaultBranch?: string | null
  workspacePath?: string | null
}

export interface LoopRunRecord {
  id: string
  projectId: string
  ralphLoopId: string | null
  state: string
  config: string | null
  prompt: string | null
  worktree: string | null
  iterations: number
  tokensUsed: number
  errors: number
  startedAt: number
  endedAt: number | null
}

export interface LoopRunUpdate {
  ralphLoopId?: string | null
  state?: string
  config?: string | null
  prompt?: string | null
  worktree?: string | null
  iterations?: number
  tokensUsed?: number
  errors?: number
  startedAt?: number
  endedAt?: number | null
}

export type ChatSessionType = 'plan' | 'task' | 'loop'
export type ChatSessionState = 'active' | 'waiting' | 'completed'
export type ChatSessionBackend =
  | 'claude'
  | 'kiro'
  | 'gemini'
  | 'codex'
  | 'amp'
  | 'copilot'
  | 'opencode'
export type ChatMessageRole = 'user' | 'assistant'

export interface ChatSessionRecord {
  id: string
  projectId: string
  type: ChatSessionType
  state: ChatSessionState
  createdAt: number
  endedAt: number | null
}

export interface ChatSessionUpdate {
  type?: ChatSessionType
  state?: ChatSessionState
  createdAt?: number
  endedAt?: number | null
}

export interface ChatMessageRecord {
  id: string
  sessionId: string
  role: ChatMessageRole
  content: string
  timestamp: number
}

export type NotificationType = 'loop_complete' | 'loop_failed' | 'needs_input'

export interface NotificationRecord {
  id: string
  projectId: string | null
  type: NotificationType
  title: string
  message: string | null
  read: boolean
  createdAt: number
}

export interface NotificationUpdate {
  projectId?: string | null
  type?: NotificationType
  title?: string
  message?: string | null
  read?: boolean
  createdAt?: number
}

export interface NotificationListOptions {
  projectId?: string
  limit?: number
}

export interface SettingRecord {
  key: string
  value: string
}

export interface ProjectRepository {
  list(): Promise<ProjectRecord[]>
  findById(id: string): Promise<ProjectRecord | null>
  create(project: ProjectRecord): Promise<ProjectRecord>
  update(id: string, updates: ProjectUpdate): Promise<ProjectRecord>
  delete(id: string): Promise<void>
  findByUserId?(userId: string): Promise<ProjectRecord[]>
  findByGitHubRepo?(userId: string, owner: string, repo: string): Promise<ProjectRecord | null>
}

export interface LoopRunRepository {
  listAll(): Promise<LoopRunRecord[]>
  listByProjectId(projectId: string): Promise<LoopRunRecord[]>
  findById(id: string): Promise<LoopRunRecord | null>
  create(run: LoopRunRecord): Promise<LoopRunRecord>
  update(id: string, updates: LoopRunUpdate): Promise<LoopRunRecord>
  findByState(states: string[]): Promise<LoopRunRecord[]>
}

export interface ChatRepository {
  findSessionById(sessionId: string): Promise<ChatSessionRecord | null>
  findLatestActiveSessionByProjectId(projectId: string): Promise<ChatSessionRecord | null>
  createSession(session: ChatSessionRecord): Promise<ChatSessionRecord>
  updateSession(sessionId: string, updates: ChatSessionUpdate): Promise<ChatSessionRecord>
  listMessagesBySessionId(sessionId: string): Promise<ChatMessageRecord[]>
  createMessage(message: ChatMessageRecord): Promise<ChatMessageRecord>
}

export interface NotificationRepository {
  list(options?: NotificationListOptions): Promise<NotificationRecord[]>
  findById(id: string): Promise<NotificationRecord | null>
  create(notification: NotificationRecord): Promise<NotificationRecord>
  update(id: string, updates: NotificationUpdate): Promise<NotificationRecord>
  delete(id: string): Promise<void>
}

export interface SettingsRepository {
  list(): Promise<SettingRecord[]>
  get(key: string): Promise<SettingRecord | null>
  upsert(setting: SettingRecord): Promise<SettingRecord>
  delete(key: string): Promise<void>
}

export interface GitHubConnectionRecord {
  id: string
  userId: string
  githubUserId: number
  githubUsername: string
  accessToken: string
  scope: string
  connectedAt: number
}

export interface LoopOutputChunkRecord {
  id: string
  loopRunId: string
  sequence: number
  stream: 'stdout' | 'stderr'
  data: string
  createdAt: number
}

export interface GitHubConnectionRepository {
  findByUserId(userId: string): Promise<GitHubConnectionRecord | null>
  create(record: GitHubConnectionRecord): Promise<void>
  delete(userId: string): Promise<void>
}

export interface LoopOutputRepository {
  append(chunk: LoopOutputChunkRecord): Promise<void>
  getByLoopRunId(loopRunId: string, afterSequence?: number): Promise<LoopOutputChunkRecord[]>
  deleteByLoopRunId(loopRunId: string): Promise<void>
}

export interface RepositoryBundle {
  projects: ProjectRepository
  loopRuns: LoopRunRepository
  chats: ChatRepository
  notifications: NotificationRepository
  settings: SettingsRepository
  githubConnections: GitHubConnectionRepository
  loopOutput: LoopOutputRepository
}

export function defineRepositoryBundle(bundle: RepositoryBundle): RepositoryBundle {
  return bundle
}
