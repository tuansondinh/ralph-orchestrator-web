import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { appRouter } from '../src/trpc/router.js'
import {
  closeDatabase,
  createDatabase,
  migrateDatabase,
  type DatabaseConnection
} from '../src/db/connection.js'
import { ProcessManager } from '../src/runner/ProcessManager.js'
import { LoopService } from '../src/services/LoopService.js'
import { ChatService } from '../src/services/ChatService.js'
import { MonitoringService } from '../src/services/MonitoringService.js'
import { DevPreviewManager } from '../src/services/DevPreviewManager.js'
import { TaskService, TaskServiceError } from '../src/services/TaskService.js'

async function createTempDir(prefix: string) {
  return mkdtemp(join(tmpdir(), `ralph-ui-${prefix}-`))
}

describe('task tRPC routes', () => {
  const tempDirs: string[] = []
  const connections: DatabaseConnection[] = []
  const managers: ProcessManager[] = []

  afterEach(async () => {
    vi.restoreAllMocks()

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
    const tempDir = await createTempDir('task')
    tempDirs.push(tempDir)

    const dbPath = join(tempDir, 'task.db')
    const connection = createDatabase({ filePath: dbPath })
    migrateDatabase(connection.db)
    connections.push(connection)

    const processManager = new ProcessManager()
    managers.push(processManager)
    const loopService = new LoopService(connection.db, processManager)
    const chatService = new ChatService(connection.db, processManager)
    const monitoringService = new MonitoringService(connection.db, loopService)
    const previewService = new DevPreviewManager(connection.db, processManager)

    const caller = appRouter.createCaller({
      db: connection.db,
      processManager,
      loopService,
      chatService,
      monitoringService,
      previewService
    })

    return { caller, connection, tempDir }
  }

  it('exposes task.list and delegates to TaskService', async () => {
    const { caller } = await setupCaller()
    const projectId = 'project-1'
    const listSpy = vi.spyOn(TaskService.prototype, 'list').mockResolvedValue([
      {
        id: 'task-1',
        title: 'Task title',
        description: 'Task description',
        status: 'open',
        priority: 2,
        blocked_by: [],
        loop_id: null,
        created: '2026-02-24T00:00:00Z',
        closed: null
      }
    ])

    const tasks = await caller.task.list({ projectId })
    expect(tasks).toHaveLength(1)
    expect(tasks[0]?.id).toBe('task-1')
    expect(listSpy).toHaveBeenCalledWith(projectId)
  })

  it('rejects invalid input when projectId is missing or empty', async () => {
    const { caller } = await setupCaller()

    await expect(caller.task.list({ projectId: '' })).rejects.toThrow()
    await expect(
      caller.task.list({} as unknown as { projectId: string })
    ).rejects.toThrow()
  })

  it('maps TaskServiceError to tRPC errors', async () => {
    const { caller } = await setupCaller()
    vi.spyOn(TaskService.prototype, 'list').mockRejectedValue(
      new TaskServiceError('BAD_REQUEST', 'Unable to resolve Ralph binary')
    )

    await expect(caller.task.list({ projectId: 'project-1' })).rejects.toThrow(
      'Unable to resolve Ralph binary'
    )
  })
})
