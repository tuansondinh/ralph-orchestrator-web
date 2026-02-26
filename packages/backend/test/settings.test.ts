import { randomUUID } from 'node:crypto'
import { chmod, mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { appRouter } from '../src/trpc/router.js'
import {
  chatMessages,
  chatSessions,
  loopRuns,
  notifications,
  projects,
  settings
} from '../src/db/schema.js'
import {
  closeDatabase,
  createDatabase,
  migrateDatabase,
  type DatabaseConnection
} from '../src/db/connection.js'
import { ProcessManager } from '../src/runner/ProcessManager.js'
import { ChatService } from '../src/services/ChatService.js'
import { LoopService } from '../src/services/LoopService.js'
import { MonitoringService } from '../src/services/MonitoringService.js'
import { DevPreviewManager } from '../src/services/DevPreviewManager.js'
import { createApp } from '../src/app.js'

async function createTempDir(prefix: string) {
  return mkdtemp(join(tmpdir(), `ralph-ui-${prefix}-`))
}

async function createMockRalphBinary(directory: string) {
  const filePath = join(directory, 'mock-settings-ralph.mjs')
  const script = `#!/usr/bin/env node
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)
const scriptDir = dirname(fileURLToPath(import.meta.url))
const pidFile = join(scriptDir, 'mock-settings-ralph.pid')

if (args.includes('--version')) {
  process.stdout.write('ralph 9.9.9-test\\n')
  process.exit(0)
} else if (args[0] === 'loops' && args[1] === 'stop') {
  if (existsSync(pidFile)) {
    const pid = Number(readFileSync(pidFile, 'utf8').trim())
    if (Number.isFinite(pid)) {
      try {
        process.kill(pid, 'SIGTERM')
      } catch {}
    }
  }
  process.exit(0)
} else if (args[0] === 'run') {
  writeFileSync(pidFile, String(process.pid), 'utf8')
  const timer = setInterval(() => {
    process.stdout.write('tick\\n')
  }, 50)

  process.on('SIGTERM', () => {
    clearInterval(timer)
    if (existsSync(pidFile)) {
      try {
        unlinkSync(pidFile)
      } catch {}
    }
    process.exit(0)
  })
} else {
  process.exit(0)
}
`

  await writeFile(filePath, script, 'utf8')
  await chmod(filePath, 0o755)
  return filePath
}

describe('settings tRPC routes', () => {
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
    const tempDir = await createTempDir('settings')
    tempDirs.push(tempDir)

    const dbPath = join(tempDir, 'settings.db')
    const connection = createDatabase({ filePath: dbPath })
    migrateDatabase(connection.db)
    connections.push(connection)

    await connection.db
      .insert(settings)
      .values({
        key: 'db.path',
        value: dbPath
      })
      .run()

    const binaryPath = await createMockRalphBinary(tempDir)
    const processManager = new ProcessManager({ killGraceMs: 100 })
    managers.push(processManager)
    const loopService = new LoopService(connection.db, processManager, {
      resolveBinary: async () => binaryPath
    })
    const chatService = new ChatService(connection.db, processManager, {
      resolveBinary: async () => binaryPath
    })
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

    return { caller, connection, tempDir, binaryPath }
  }

  it('returns defaults, persists updates, and validates binary versions', async () => {
    const { caller, binaryPath, tempDir } = await setupCaller()

    const initial = await caller.settings.get()
    expect(initial.chatModel).toBe('gemini')
    expect(initial.ralphBinaryPath).toBeNull()
    expect(initial.notifications).toEqual({
      loopComplete: true,
      loopFailed: true,
      needsInput: true
    })
    expect(initial.preview).toEqual({
      portStart: 3001,
      portEnd: 3010,
      baseUrl: 'http://localhost',
      command: null
    })
    expect(initial.data.dbPath.endsWith('settings.db')).toBe(true)

    const updated = await caller.settings.update({
      chatModel: 'openai',
      ralphBinaryPath: binaryPath,
      notifications: {
        loopComplete: false,
        loopFailed: true,
        needsInput: false
      },
      preview: {
        portStart: 4100,
        portEnd: 4200,
        baseUrl: 'http://my-machine.local',
        command: 'npm run dev'
      }
    })

    expect(updated.chatModel).toBe('openai')
    expect(updated.ralphBinaryPath).toBe(binaryPath)
    expect(updated.notifications.loopComplete).toBe(false)
    expect(updated.notifications.needsInput).toBe(false)
    expect(updated.preview).toEqual({
      portStart: 4100,
      portEnd: 4200,
      baseUrl: 'http://my-machine.local',
      command: 'npm run dev'
    })

    const reloaded = await caller.settings.get()
    expect(reloaded.chatModel).toBe('openai')
    expect(reloaded).toEqual(updated)

    const versionResult = await caller.settings.testBinary({ path: binaryPath })
    expect(versionResult.path).toBe(binaryPath)
    expect(versionResult.version).toContain('ralph 9.9.9-test')

    await expect(
      caller.settings.testBinary({ path: join(tempDir, 'missing-ralph') })
    ).rejects.toThrow(/binary/i)
  })

  it('requires confirmation before clearing project/chat/loop/notification data', async () => {
    const { caller, connection, tempDir } = await setupCaller()
    const now = Date.now()
    const projectPath = join(tempDir, 'project')
    await mkdir(projectPath, { recursive: true })

    const projectId = randomUUID()
    const loopId = randomUUID()
    const sessionId = randomUUID()
    const messageId = randomUUID()
    const notificationId = randomUUID()

    await connection.db
      .insert(projects)
      .values({
        id: projectId,
        name: 'Clear Data Project',
        path: projectPath,
        type: 'node',
        ralphConfig: 'ralph.yml',
        createdAt: now,
        updatedAt: now
      })
      .run()

    await connection.db
      .insert(loopRuns)
      .values({
        id: loopId,
        projectId,
        state: 'completed',
        config: null,
        prompt: null,
        worktree: null,
        iterations: 1,
        tokensUsed: 5,
        errors: 0,
        startedAt: now,
        endedAt: now
      })
      .run()

    await connection.db
      .insert(chatSessions)
      .values({
        id: sessionId,
        projectId,
        type: 'plan',
        state: 'completed',
        createdAt: now,
        endedAt: now
      })
      .run()

    await connection.db
      .insert(chatMessages)
      .values({
        id: messageId,
        sessionId,
        role: 'user',
        content: 'hello',
        timestamp: now
      })
      .run()

    await connection.db
      .insert(notifications)
      .values({
        id: notificationId,
        projectId,
        type: 'loop_complete',
        title: 'Done',
        message: 'Completed',
        read: 0,
        createdAt: now
      })
      .run()

    await expect(caller.settings.clearData({ confirm: false })).rejects.toThrow(
      /confirm/i
    )

    await caller.settings.clearData({ confirm: true })

    expect(connection.db.select().from(projects).all()).toHaveLength(0)
    expect(connection.db.select().from(loopRuns).all()).toHaveLength(0)
    expect(connection.db.select().from(chatSessions).all()).toHaveLength(0)
    expect(connection.db.select().from(chatMessages).all()).toHaveLength(0)
    expect(connection.db.select().from(notifications).all()).toHaveLength(0)
    expect(connection.db.select().from(settings).all().length).toBeGreaterThan(0)
  })
})

describe('app integration: configured binary path', () => {
  const tempDirs: string[] = []
  const apps: ReturnType<typeof createApp>[] = []
  const envSnapshots: Record<string, string | undefined>[] = []

  afterEach(async () => {
    while (apps.length > 0) {
      await apps.pop()?.close()
    }

    while (envSnapshots.length > 0) {
      const snapshot = envSnapshots.pop()
      if (!snapshot) {
        continue
      }

      for (const [key, value] of Object.entries(snapshot)) {
        if (value === undefined) {
          delete process.env[key]
        } else {
          process.env[key] = value
        }
      }
    }

    while (tempDirs.length > 0) {
      const dir = tempDirs.pop()
      if (dir) {
        await rm(dir, { recursive: true, force: true })
      }
    }
  })

  it('uses settings.ralphBinaryPath when spawning loop processes', async () => {
    const tempDir = await createTempDir('settings-app')
    tempDirs.push(tempDir)
    const binaryPath = await createMockRalphBinary(tempDir)
    const dbPath = join(tempDir, 'app.db')
    const projectPath = join(tempDir, 'project')
    await mkdir(projectPath, { recursive: true })

    envSnapshots.push({
      RALPH_UI_DB_PATH: process.env.RALPH_UI_DB_PATH
    })
    process.env.RALPH_UI_DB_PATH = dbPath

    const app = createApp()
    apps.push(app)

    const projectId = randomUUID()
    const now = Date.now()
    await app.db
      .insert(projects)
      .values({
        id: projectId,
        name: 'Configured Binary Project',
        path: projectPath,
        type: 'node',
        ralphConfig: 'ralph.yml',
        createdAt: now,
        updatedAt: now
      })
      .run()

    const caller = appRouter.createCaller({
      db: app.db,
      processManager: app.processManager,
      loopService: app.loopService,
      chatService: app.chatService,
      monitoringService: app.monitoringService,
      previewService: app.previewService
    })

    await caller.settings.update({
      ralphBinaryPath: binaryPath
    })

    const started = await caller.loop.start({
      projectId,
      prompt: 'settings-binary'
    })

    const handle = app.processManager
      .list()
      .find((candidate) => candidate.id === started.processId)
    expect(handle?.command).toBe('bash')
    expect(handle?.args[0]).toBe('-lc')
    expect(handle?.args[1]).toContain(binaryPath)
    expect(handle?.args[1]).toContain('run')
    expect(handle?.args[1]).toContain('--verbose')
    expect(handle?.args[1]).toContain('tee debug.log')

    await caller.loop.stop({ loopId: started.id })
  })
})
