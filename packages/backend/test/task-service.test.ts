import { randomUUID } from 'node:crypto'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  closeDatabase,
  createDatabase,
  migrateDatabase,
  type DatabaseConnection
} from '../src/db/connection.js'
import { projects } from '../src/db/schema.js'
import { TaskService } from '../src/services/TaskService.js'

async function createTempDir(prefix: string) {
  return mkdtemp(join(tmpdir(), `ralph-ui-${prefix}-`))
}

describe('TaskService', () => {
  const tempDirs: string[] = []
  const connections: DatabaseConnection[] = []

  afterEach(async () => {
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

  async function setupServiceTest() {
    const tempDir = await createTempDir('task-service')
    tempDirs.push(tempDir)
    const dbPath = join(tempDir, 'task-service.db')
    const connection = createDatabase({ filePath: dbPath })
    migrateDatabase(connection.db)
    connections.push(connection)
    return { connection, tempDir }
  }

  async function insertProject(connection: DatabaseConnection, projectPath: string) {
    const now = Date.now()
    const projectId = randomUUID()
    await connection.db
      .insert(projects)
      .values({
        id: projectId,
        name: 'Task Service Project',
        path: projectPath,
        type: 'node',
        ralphConfig: 'ralph.yml',
        createdAt: now,
        updatedAt: now
      })
      .run()
    return projectId
  }

  it('returns parsed tasks and scopes command execution to the project path', async () => {
    const { connection, tempDir } = await setupServiceTest()
    const projectPath = join(tempDir, 'project')
    await mkdir(projectPath, { recursive: true })
    const projectId = await insertProject(connection, projectPath)

    const resolveBinary = vi.fn(async () => '/mock/ralph')
    const execCommand = vi.fn(async () => ({
      stdout: JSON.stringify([
        {
          id: 'task-1',
          title: 'Task 1',
          description: 'Do thing',
          status: 'open',
          priority: 2,
          blocked_by: ['task-0'],
          loop_id: null,
          created: '2026-02-24T00:00:00Z',
          closed: null
        }
      ]),
      stderr: ''
    }))

    const service = new TaskService(connection.db, {
      resolveBinary,
      execCommand
    })
    const result = await service.list(projectId)

    expect(resolveBinary).toHaveBeenCalledWith({
      cwd: projectPath,
      customPath: undefined
    })
    expect(execCommand).toHaveBeenCalledWith(
      '/mock/ralph',
      ['tools', 'task', 'list', '--all', '--format', 'json'],
      { cwd: projectPath }
    )
    expect(result).toEqual([
      {
        id: 'task-1',
        title: 'Task 1',
        description: 'Do thing',
        status: 'open',
        priority: 2,
        blocked_by: ['task-0'],
        loop_id: null,
        created: '2026-02-24T00:00:00Z',
        closed: null
      }
    ])
  })

  it('throws NOT_FOUND when the project does not exist', async () => {
    const { connection } = await setupServiceTest()
    const service = new TaskService(connection.db)

    await expect(service.list('missing-project')).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'Project not found: missing-project'
    })
  })

  it('throws BAD_REQUEST when binary resolution fails', async () => {
    const { connection, tempDir } = await setupServiceTest()
    const projectPath = join(tempDir, 'project')
    await mkdir(projectPath, { recursive: true })
    const projectId = await insertProject(connection, projectPath)

    const execCommand = vi.fn()
    const service = new TaskService(connection.db, {
      resolveBinary: vi.fn(async () => {
        throw new Error('Unable to resolve Ralph binary')
      }),
      execCommand
    })

    await expect(service.list(projectId)).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Unable to resolve Ralph binary'
    })
    expect(execCommand).not.toHaveBeenCalled()
  })

  it('throws BAD_REQUEST when the CLI exits non-zero', async () => {
    const { connection, tempDir } = await setupServiceTest()
    const projectPath = join(tempDir, 'project')
    await mkdir(projectPath, { recursive: true })
    const projectId = await insertProject(connection, projectPath)

    const service = new TaskService(connection.db, {
      resolveBinary: vi.fn(async () => '/mock/ralph'),
      execCommand: vi.fn(async () => {
        const error = Object.assign(new Error('Command failed'), {
          stderr: 'permission denied'
        })
        throw error
      })
    })

    await expect(service.list(projectId)).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Failed to list tasks: permission denied'
    })
  })

  it('throws BAD_REQUEST with sanitized output when CLI stderr includes stack lines', async () => {
    const { connection, tempDir } = await setupServiceTest()
    const projectPath = join(tempDir, 'project')
    await mkdir(projectPath, { recursive: true })
    const projectId = await insertProject(connection, projectPath)

    const service = new TaskService(connection.db, {
      resolveBinary: vi.fn(async () => '/mock/ralph'),
      execCommand: vi.fn(async () => {
        const error = Object.assign(new Error('Command failed'), {
          stderr: 'permission denied\n    at spawn (/tmp/node:1:2)\n    at run (/tmp/node:2:3)'
        })
        throw error
      })
    })

    await expect(service.list(projectId)).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Failed to list tasks: permission denied'
    })
  })

  it('throws BAD_REQUEST when the CLI output is not valid JSON', async () => {
    const { connection, tempDir } = await setupServiceTest()
    const projectPath = join(tempDir, 'project')
    await mkdir(projectPath, { recursive: true })
    const projectId = await insertProject(connection, projectPath)

    const service = new TaskService(connection.db, {
      resolveBinary: vi.fn(async () => '/mock/ralph'),
      execCommand: vi.fn(async () => ({ stdout: '{bad-json', stderr: '' }))
    })

    await expect(service.list(projectId)).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Invalid JSON from Ralph task list command'
    })
  })

  it('throws BAD_REQUEST when project path is missing or inaccessible', async () => {
    const { connection, tempDir } = await setupServiceTest()
    const missingPath = join(tempDir, 'missing-project-root')
    const projectId = await insertProject(connection, missingPath)

    const service = new TaskService(connection.db)
    await expect(service.list(projectId)).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: `Project path is not accessible: ${missingPath}`
    })
  })
})
