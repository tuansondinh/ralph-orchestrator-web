import { execFile as execFileCallback } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { promisify } from 'node:util'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  closeDatabase,
  createDatabase,
  migrateDatabase,
  type DatabaseConnection
} from '../src/db/connection.js'
import { loopRuns, projects } from '../src/db/schema.js'
import { ProcessManager } from '../src/runner/ProcessManager.js'
import { ChatService } from '../src/services/ChatService.js'
import { LoopService } from '../src/services/LoopService.js'
import { MonitoringService } from '../src/services/MonitoringService.js'
import { DevPreviewManager } from '../src/services/DevPreviewManager.js'
import { appRouter } from '../src/trpc/router.js'

const execFile = promisify(execFileCallback)

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 2_000,
  pollMs = 20
) {
  const start = Date.now()
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`Timed out after ${timeoutMs}ms`)
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs))
  }
}

async function createTempDir(prefix: string) {
  return mkdtemp(join(tmpdir(), `ralph-ui-${prefix}-`))
}

async function createProject(
  connection: DatabaseConnection,
  projectPath: string,
  name = 'Monitoring project'
) {
  const now = Date.now()
  const id = randomUUID()

  await connection.db
    .insert(projects)
    .values({
      id,
      name,
      path: projectPath,
      type: 'node',
      ralphConfig: 'ralph.yml',
      createdAt: now,
      updatedAt: now
    })
    .run()

  return id
}

describe('monitoring service', () => {
  const tempDirs: string[] = []
  const connections: DatabaseConnection[] = []
  const managers: ProcessManager[] = []

  afterEach(async () => {
    while (managers.length > 0) {
      await managers.pop()?.shutdown()
    }

    while (connections.length > 0) {
      const connection = connections.pop()
      if (connection) {
        closeDatabase(connection)
      }
    }

    while (tempDirs.length > 0) {
      const dir = tempDirs.pop()
      if (dir) {
        await rm(dir, { recursive: true, force: true })
      }
    }
  })

  async function setupCaller() {
    const tempDir = await createTempDir('monitoring')
    tempDirs.push(tempDir)

    const dbPath = join(tempDir, 'monitoring.db')
    const connection = createDatabase({ filePath: dbPath })
    migrateDatabase(connection.db)
    connections.push(connection)

    const processManager = new ProcessManager({ killGraceMs: 100 })
    managers.push(processManager)
    const loopService = new LoopService(connection.db, processManager)
    const chatService = new ChatService(connection.db, processManager)
    const monitoringService = new MonitoringService(connection.db, loopService, {
      watchDebounceMs: 30
    })
    const previewService = new DevPreviewManager(connection.db, processManager)

    const caller = appRouter.createCaller({
      db: connection.db,
      processManager,
      loopService,
      chatService,
      monitoringService,
      previewService
    })

    return { caller, connection, monitoringService, tempDir }
  }

  it('aggregates project status from loop runs', async () => {
    const { caller, connection, tempDir } = await setupCaller()
    const projectPath = join(tempDir, 'project')
    await mkdir(projectPath, { recursive: true })
    const projectId = await createProject(connection, projectPath)
    const now = Date.now()

    await connection.db
      .insert(loopRuns)
      .values([
        {
          id: randomUUID(),
          projectId,
          state: 'running',
          config: null,
          prompt: 'first',
          worktree: null,
          iterations: 5,
          tokensUsed: 120,
          errors: 0,
          startedAt: now - 5_000,
          endedAt: null
        },
        {
          id: randomUUID(),
          projectId,
          state: 'completed',
          config: null,
          prompt: 'second',
          worktree: null,
          iterations: 8,
          tokensUsed: 180,
          errors: 1,
          startedAt: now - 10_000,
          endedAt: now - 8_000
        },
        {
          id: randomUUID(),
          projectId,
          state: 'failed',
          config: null,
          prompt: 'third',
          worktree: null,
          iterations: 2,
          tokensUsed: 40,
          errors: 2,
          startedAt: now - 3_000,
          endedAt: now - 2_000
        }
      ])
      .run()

    const status = await caller.monitoring.projectStatus({ projectId })
    expect(status.activeLoops).toBe(1)
    expect(status.totalRuns).toBe(3)
    expect(status.health).toBe('error')
    expect(status.lastRunAt).toBe(now - 2_000)
  })

  it('parses event history JSONL and supports topic filtering', async () => {
    const { caller, connection, tempDir } = await setupCaller()
    const projectPath = join(tempDir, 'project')
    await mkdir(join(projectPath, '.agent'), { recursive: true })
    const projectId = await createProject(connection, projectPath)
    const historyPath = join(projectPath, '.agent', 'event_history.jsonl')

    await writeFile(
      historyPath,
      [
        JSON.stringify({
          topic: 'loop.iteration',
          sourceHat: 'builder',
          payload: { iteration: 1 },
          timestamp: '2026-02-18T08:00:00.000Z'
        }),
        'not-json',
        JSON.stringify({
          topic: 'task.complete',
          source_hat: 'planner',
          payload: { taskId: 'task-1' },
          timestamp: '2026-02-18T08:05:00.000Z'
        })
      ].join('\n'),
      'utf8'
    )

    const allEvents = await caller.monitoring.eventHistory({ projectId })
    expect(allEvents).toHaveLength(2)
    expect(allEvents[0]).toMatchObject({
      topic: 'task.complete',
      sourceHat: 'planner'
    })

    const filtered = await caller.monitoring.eventHistory({
      projectId,
      topic: 'loop.iteration'
    })

    expect(filtered).toHaveLength(1)
    expect(filtered[0]).toMatchObject({
      topic: 'loop.iteration',
      sourceHat: 'builder'
    })
  })

  it('detects file changes from git in loop metrics', async () => {
    const { caller, connection, tempDir } = await setupCaller()
    const projectPath = join(tempDir, 'project')
    await mkdir(projectPath, { recursive: true })
    const projectId = await createProject(connection, projectPath)

    await execFile('git', ['init'], { cwd: projectPath })
    await execFile('git', ['config', 'user.email', 'test@example.com'], {
      cwd: projectPath
    })
    await execFile('git', ['config', 'user.name', 'Tests'], { cwd: projectPath })
    await writeFile(join(projectPath, 'README.md'), 'initial\n', 'utf8')
    await execFile('git', ['add', 'README.md'], { cwd: projectPath })
    await execFile('git', ['commit', '-m', 'init'], { cwd: projectPath })
    await writeFile(join(projectPath, 'README.md'), 'changed\n', 'utf8')

    const loopId = randomUUID()
    await connection.db
      .insert(loopRuns)
      .values({
        id: loopId,
        projectId,
        state: 'running',
        config: null,
        prompt: 'detect changes',
        worktree: null,
        iterations: 0,
        tokensUsed: 0,
        errors: 0,
        startedAt: Date.now() - 5_000,
        endedAt: null
      })
      .run()

    const metrics = await caller.monitoring.loopMetrics({ loopId })
    expect(metrics.fileChanges.length).toBeGreaterThan(0)
    expect(metrics.fileChanges.some((change) => change.path === 'README.md')).toBe(
      true
    )
  })

  it('detects file changes from last commit when working tree is clean', async () => {
    const { caller, connection, tempDir } = await setupCaller()
    const projectPath = join(tempDir, 'project')
    await mkdir(projectPath, { recursive: true })
    const projectId = await createProject(connection, projectPath)

    await execFile('git', ['init'], { cwd: projectPath })
    await execFile('git', ['config', 'user.email', 'test@example.com'], {
      cwd: projectPath
    })
    await execFile('git', ['config', 'user.name', 'Tests'], { cwd: projectPath })
    await writeFile(join(projectPath, 'README.md'), 'initial\n', 'utf8')
    await execFile('git', ['add', 'README.md'], { cwd: projectPath })
    await execFile('git', ['commit', '-m', 'init'], { cwd: projectPath })
    await writeFile(join(projectPath, 'README.md'), 'changed and committed\n', 'utf8')
    await execFile('git', ['add', 'README.md'], { cwd: projectPath })
    await execFile('git', ['commit', '-m', 'second'], { cwd: projectPath })

    const loopId = randomUUID()
    await connection.db
      .insert(loopRuns)
      .values({
        id: loopId,
        projectId,
        state: 'running',
        config: null,
        prompt: 'detect clean-tree changes',
        worktree: null,
        iterations: 0,
        tokensUsed: 0,
        errors: 0,
        startedAt: Date.now() - 5_000,
        endedAt: null
      })
      .run()

    const metrics = await caller.monitoring.loopMetrics({ loopId })
    expect(metrics.fileChanges.some((change) => change.path === 'README.md')).toBe(
      true
    )
  })

  it('detects file changes from the loop workspace project', async () => {
    const { caller, connection, tempDir } = await setupCaller()
    const projectPath = join(tempDir, 'project')
    const workspacePath = join(projectPath, 'workspaces', 'feature-a')
    await mkdir(workspacePath, { recursive: true })
    const projectId = await createProject(connection, projectPath)

    await execFile('git', ['init'], { cwd: workspacePath })
    await execFile('git', ['config', 'user.email', 'test@example.com'], {
      cwd: workspacePath
    })
    await execFile('git', ['config', 'user.name', 'Tests'], { cwd: workspacePath })
    await writeFile(join(workspacePath, 'workspace.txt'), 'initial\n', 'utf8')
    await execFile('git', ['add', 'workspace.txt'], { cwd: workspacePath })
    await execFile('git', ['commit', '-m', 'init'], { cwd: workspacePath })
    await writeFile(join(workspacePath, 'workspace.txt'), 'changed\n', 'utf8')

    const loopId = randomUUID()
    await connection.db
      .insert(loopRuns)
      .values({
        id: loopId,
        projectId,
        state: 'running',
        config: null,
        prompt: 'detect workspace changes',
        worktree: 'feature-a',
        iterations: 0,
        tokensUsed: 0,
        errors: 0,
        startedAt: Date.now() - 5_000,
        endedAt: null
      })
      .run()

    const metrics = await caller.monitoring.loopMetrics({ loopId })
    expect(metrics.fileChanges.some((change) => change.path === 'workspace.txt')).toBe(
      true
    )
  })

  it('scopes file changes to workspace path inside a shared git repository', async () => {
    const { caller, connection, tempDir } = await setupCaller()
    const projectPath = join(tempDir, 'project')
    const workspacePath = join(projectPath, 'workspaces', 'feature-c')
    await mkdir(workspacePath, { recursive: true })
    const projectId = await createProject(connection, projectPath)

    await execFile('git', ['init'], { cwd: projectPath })
    await execFile('git', ['config', 'user.email', 'test@example.com'], {
      cwd: projectPath
    })
    await execFile('git', ['config', 'user.name', 'Tests'], { cwd: projectPath })

    await writeFile(join(projectPath, 'main-app.txt'), 'initial\n', 'utf8')
    await writeFile(join(workspacePath, 'workspace.txt'), 'initial\n', 'utf8')
    await execFile('git', ['add', '.'], { cwd: projectPath })
    await execFile('git', ['commit', '-m', 'init'], { cwd: projectPath })

    await writeFile(join(projectPath, 'main-app.txt'), 'changed in main\n', 'utf8')
    await writeFile(join(workspacePath, 'workspace.txt'), 'changed in workspace\n', 'utf8')

    const loopId = randomUUID()
    await connection.db
      .insert(loopRuns)
      .values({
        id: loopId,
        projectId,
        state: 'running',
        config: null,
        prompt: 'scoped diff',
        worktree: 'feature-c',
        iterations: 0,
        tokensUsed: 0,
        errors: 0,
        startedAt: Date.now() - 5_000,
        endedAt: null
      })
      .run()

    const metrics = await caller.monitoring.loopMetrics({ loopId })
    expect(metrics.fileChanges.some((change) => change.path === 'workspace.txt')).toBe(
      true
    )
    expect(metrics.fileChanges.some((change) => change.path.includes('main-app.txt'))).toBe(
      false
    )
  })

  it('returns file content for a loop project file', async () => {
    const { caller, connection, tempDir } = await setupCaller()
    const projectPath = join(tempDir, 'project')
    await mkdir(join(projectPath, 'src'), { recursive: true })
    const projectId = await createProject(connection, projectPath)
    const loopId = randomUUID()

    await writeFile(join(projectPath, 'src', 'main.ts'), 'export const answer = 42\n', 'utf8')
    await connection.db
      .insert(loopRuns)
      .values({
        id: loopId,
        projectId,
        state: 'running',
        config: null,
        prompt: 'read file content',
        worktree: null,
        iterations: 1,
        tokensUsed: 0,
        errors: 0,
        startedAt: Date.now() - 1_000,
        endedAt: null
      })
      .run()

    const response = await caller.monitoring.fileContent({
      loopId,
      path: 'src/main.ts'
    })
    expect(response).toEqual({
      path: 'src/main.ts',
      content: 'export const answer = 42\n'
    })
  })

  it('returns file content from the loop workspace project', async () => {
    const { caller, connection, tempDir } = await setupCaller()
    const projectPath = join(tempDir, 'project')
    const workspacePath = join(projectPath, 'workspaces', 'feature-b')
    await mkdir(join(workspacePath, 'src'), { recursive: true })
    const projectId = await createProject(connection, projectPath)
    const loopId = randomUUID()

    await writeFile(join(workspacePath, 'src', 'main.ts'), 'export const source = "workspace"\n', 'utf8')
    await writeFile(join(projectPath, 'src-main.ts'), 'export const source = "project"\n', 'utf8')
    await connection.db
      .insert(loopRuns)
      .values({
        id: loopId,
        projectId,
        state: 'running',
        config: null,
        prompt: 'read workspace file content',
        worktree: 'feature-b',
        iterations: 1,
        tokensUsed: 0,
        errors: 0,
        startedAt: Date.now() - 1_000,
        endedAt: null
      })
      .run()

    const response = await caller.monitoring.fileContent({
      loopId,
      path: 'src/main.ts'
    })
    expect(response).toEqual({
      path: 'src/main.ts',
      content: 'export const source = "workspace"\n'
    })
  })

  it('uses metrics files_changed for dynamic project paths outside git scope', async () => {
    const { caller, connection, tempDir } = await setupCaller()
    const repoPath = join(tempDir, 'repo')
    const projectPath = join(tempDir, 'external-project')
    await mkdir(repoPath, { recursive: true })
    await mkdir(join(projectPath, '.agent', 'metrics'), { recursive: true })
    const projectId = await createProject(connection, projectPath)

    await execFile('git', ['init'], { cwd: repoPath })
    await execFile('git', ['config', 'user.email', 'test@example.com'], {
      cwd: repoPath
    })
    await execFile('git', ['config', 'user.name', 'Tests'], { cwd: repoPath })
    await writeFile(join(repoPath, 'main-app.txt'), 'initial\n', 'utf8')
    await execFile('git', ['add', '.'], { cwd: repoPath })
    await execFile('git', ['commit', '-m', 'init'], { cwd: repoPath })
    await writeFile(join(repoPath, 'main-app.txt'), 'changed\n', 'utf8')

    await writeFile(
      join(projectPath, '.agent', 'metrics', 'files_changed.json'),
      JSON.stringify(['src/app.ts']),
      'utf8'
    )

    const loopId = randomUUID()
    await connection.db
      .insert(loopRuns)
      .values({
        id: loopId,
        projectId,
        state: 'running',
        config: null,
        prompt: 'dynamic path',
        worktree: null,
        iterations: 0,
        tokensUsed: 0,
        errors: 0,
        startedAt: Date.now() - 2_000,
        endedAt: null
      })
      .run()

    const metrics = await caller.monitoring.loopMetrics({ loopId })
    expect(metrics.fileChanges).toContainEqual({
      path: 'src/app.ts',
      additions: 0,
      deletions: 0
    })
    expect(metrics.fileChanges.some((change) => change.path.includes('main-app.txt'))).toBe(
      false
    )
  })

  it('detects file changes for non-git projects using modified timestamps', async () => {
    const { caller, connection, tempDir } = await setupCaller()
    const projectPath = join(tempDir, 'non-git-project')
    await mkdir(projectPath, { recursive: true })
    const projectId = await createProject(connection, projectPath)
    const loopId = randomUUID()

    await connection.db
      .insert(loopRuns)
      .values({
        id: loopId,
        projectId,
        state: 'running',
        config: null,
        prompt: 'non-git fallback',
        worktree: null,
        iterations: 0,
        tokensUsed: 0,
        errors: 0,
        startedAt: Date.now() - 5_000,
        endedAt: null
      })
      .run()

    await writeFile(join(projectPath, 'changed.txt'), 'hello\n', 'utf8')

    const metrics = await caller.monitoring.loopMetrics({ loopId })
    expect(metrics.fileChanges.some((change) => change.path === 'changed.txt')).toBe(
      true
    )
  })

  it('watches metric files and pushes updates', async () => {
    const { connection, monitoringService, tempDir } = await setupCaller()
    const projectPath = join(tempDir, 'project')
    const metricsDir = join(projectPath, '.agent', 'metrics')
    await mkdir(metricsDir, { recursive: true })
    const projectId = await createProject(connection, projectPath)
    const loopId = randomUUID()

    await connection.db
      .insert(loopRuns)
      .values({
        id: loopId,
        projectId,
        state: 'running',
        config: null,
        prompt: 'watch metrics',
        worktree: null,
        iterations: 1,
        tokensUsed: 0,
        errors: 0,
        startedAt: Date.now() - 2_000,
        endedAt: null
      })
      .run()

    await writeFile(join(metricsDir, 'iterations'), '1\n', 'utf8')
    const updates: number[] = []

    const unsubscribe = monitoringService.watchMetrics(loopId, (metrics) => {
      updates.push(metrics.iterations)
    })

    await writeFile(join(metricsDir, 'iterations'), '2\n', 'utf8')

    await waitFor(() => updates.includes(2))
    unsubscribe()
  })

  it('handles missing .agent data gracefully for new projects', async () => {
    const { caller, connection, tempDir } = await setupCaller()
    const projectPath = join(tempDir, 'project')
    await mkdir(projectPath, { recursive: true })
    const projectId = await createProject(connection, projectPath)
    const loopId = randomUUID()

    await connection.db
      .insert(loopRuns)
      .values({
        id: loopId,
        projectId,
        state: 'running',
        config: null,
        prompt: 'new project',
        worktree: null,
        iterations: 4,
        tokensUsed: 22,
        errors: 0,
        startedAt: Date.now() - 500,
        endedAt: null
      })
      .run()

    const metrics = await caller.monitoring.loopMetrics({ loopId })
    const events = await caller.monitoring.eventHistory({ projectId })

    expect(metrics.iterations).toBe(4)
    expect(metrics.filesChanged).toEqual([])
    expect(metrics.fileChanges).toEqual([])
    expect(events).toEqual([])
  })
})
