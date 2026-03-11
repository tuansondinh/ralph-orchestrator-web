import { randomUUID } from 'node:crypto'
import { chmod, mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import WebSocket from 'ws'
import {
  closeDatabase,
  createDatabase,
  migrateDatabase,
  type DatabaseConnection
} from '../src/db/connection.js'
import { createApp } from '../src/app.js'
import { ProcessManager } from '../src/runner/ProcessManager.js'
import { ChatService } from '../src/services/ChatService.js'
import { DevPreviewManager } from '../src/services/DevPreviewManager.js'
import { ProjectService } from '../src/services/ProjectService.js'
import { PresetService } from '../src/services/PresetService.js'
import { SettingsService } from '../src/services/SettingsService.js'
import { HatsPresetService } from '../src/services/HatsPresetService.js'
import { TaskService } from '../src/services/TaskService.js'
import { LoopService } from '../src/services/LoopService.js'
import { MonitoringService } from '../src/services/MonitoringService.js'
import { projects } from '../src/db/schema.js'
import { appRouter } from '../src/trpc/router.js'
import { createTestRuntime } from './test-helpers.js'

async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  timeoutMs = 4_000,
  pollMs = 20
) {
  const start = Date.now()
  while (!(await predicate())) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`Timed out after ${timeoutMs}ms`)
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs))
  }
}

async function createTempDir(prefix: string) {
  return mkdtemp(join(tmpdir(), `ralph-ui-${prefix}-`))
}

async function removeTempDir(dir: string, attempts = 5) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await rm(dir, { recursive: true, force: true })
      return
    } catch (error) {
      const code =
        error instanceof Error && 'code' in error ? (error.code as string | undefined) : undefined
      if ((code !== 'ENOTEMPTY' && code !== 'EBUSY') || attempt === attempts) {
        throw error
      }

      await new Promise((resolve) => setTimeout(resolve, attempt * 50))
    }
  }
}

async function closeWebSocket(socket: WebSocket) {
  if (
    socket.readyState === WebSocket.CLOSED ||
    socket.readyState === WebSocket.CLOSING
  ) {
    return
  }

  await new Promise<void>((resolve) => {
    socket.once('close', () => resolve())
    socket.close()
  })
}

async function createMockNotificationBinary(directory: string) {
  const filePath = join(directory, 'mock-notify-ralph.mjs')
  const script = `#!/usr/bin/env node
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)
const scriptDir = dirname(fileURLToPath(import.meta.url))
const pidFile = join(scriptDir, 'mock-notify-ralph.pid')
const promptArg = args.find((arg) => arg.startsWith('--prompt=')) || ''
const shouldCrash = promptArg.includes('crash-fast')
const shouldNeedInput = promptArg.includes('needs-input')

if (args[0] === 'loops' && args[1] === 'stop') {
  if (existsSync(pidFile)) {
    const pid = Number(readFileSync(pidFile, 'utf8').trim())
    if (Number.isFinite(pid)) {
      try {
        process.kill(pid, 'SIGTERM')
      } catch {}
    }
  }
  process.exit(0)
}

writeFileSync(pidFile, String(process.pid), 'utf8')

if (shouldNeedInput) {
  setTimeout(() => {
    process.stdout.write('Event: loop:state - {"state":"needs_input"}\\n')
  }, 20)

  const timer = setInterval(() => {
    process.stdout.write('waiting\\n')
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
  setTimeout(() => {
    if (existsSync(pidFile)) {
      try {
        unlinkSync(pidFile)
      } catch {}
    }
    process.exit(shouldCrash ? 1 : 0)
  }, 40)

  process.on('SIGTERM', () => {
    if (existsSync(pidFile)) {
      try {
        unlinkSync(pidFile)
      } catch {}
    }
    process.exit(0)
  })
}
`

  await writeFile(filePath, script, 'utf8')
  await chmod(filePath, 0o755)
  return filePath
}

async function createProject(
  connection: DatabaseConnection,
  projectPath: string,
  name = 'Notification project'
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

function createMessageWaiter(socket: WebSocket) {
  return (predicate: (message: Record<string, unknown>) => boolean) =>
    new Promise<Record<string, unknown>>((resolve, reject) => {
      const timeout = setTimeout(() => {
        socket.off('message', onMessage)
        reject(new Error('Timed out waiting for websocket message'))
      }, 2_000)

      const onMessage = (raw: WebSocket.RawData) => {
        let parsed: Record<string, unknown>
        try {
          parsed = JSON.parse(raw.toString('utf8'))
        } catch {
          return
        }

        if (predicate(parsed)) {
          clearTimeout(timeout)
          socket.off('message', onMessage)
          resolve(parsed)
        }
      }

      socket.on('message', onMessage)
    })
}

describe('notification routes', () => {
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
        await removeTempDir(dir)
      }
    }
  })

  async function setupCaller() {
    const tempDir = await createTempDir('notification')
    tempDirs.push(tempDir)

    const dbPath = join(tempDir, 'notification.db')
    const connection = createDatabase({ filePath: dbPath })
    migrateDatabase(connection.db)
    connections.push(connection)

    const binaryPath = await createMockNotificationBinary(tempDir)
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
      runtime: createTestRuntime(),
      db: connection.db,
      processManager,
      loopService,
      chatService,
      monitoringService,
      previewService,
      projectService: new ProjectService(connection.db),
      presetService: new PresetService(),
      settingsService: new SettingsService(connection.db),
      hatsPresetService: new HatsPresetService(),
      taskService: new TaskService(connection.db)
    })

    return { caller, connection, loopService, tempDir }
  }

  it('stores loop notifications and supports listing + mark-read', async () => {
    const { caller, connection, tempDir } = await setupCaller()
    const projectPath = join(tempDir, 'project')
    await mkdir(projectPath, { recursive: true })
    const projectId = await createProject(connection, projectPath)

    const completed = await caller.loop.start({
      projectId,
      prompt: 'exit-fast'
    })

    await waitFor(async () => {
      const list = await caller.notification.list({ projectId })
      return list.some(
        (notification) =>
          notification.projectId === projectId &&
          notification.type === 'loop_complete'
      )
    })

    const crashed = await caller.loop.start({
      projectId,
      prompt: 'crash-fast'
    })

    await waitFor(async () => {
      const list = await caller.notification.list({ projectId })
      return list.some(
        (notification) =>
          notification.projectId === projectId &&
          notification.type === 'loop_failed'
      )
    })

    const waiting = await caller.loop.start({
      projectId,
      prompt: 'needs-input'
    })

    await waitFor(async () => {
      const list = await caller.notification.list({ projectId })
      return list.some(
        (notification) =>
          notification.projectId === projectId &&
          notification.type === 'needs_input'
      )
    })
    await caller.loop.stop({ loopId: waiting.id })

    const notifications = await caller.notification.list({ projectId, limit: 10 })
    expect(notifications.some((item) => item.type === 'loop_complete')).toBe(true)
    expect(notifications.some((item) => item.type === 'loop_failed')).toBe(true)
    expect(notifications.some((item) => item.type === 'needs_input')).toBe(true)
    expect(
      notifications.every(
        (item) =>
          item.projectId === projectId &&
          typeof item.title === 'string' &&
          item.title.length > 0
      )
    ).toBe(true)

    const unread = notifications.find((item) => item.read === 0)
    expect(unread).toBeDefined()

    const updated = await caller.notification.markRead({
      notificationId: unread!.id
    })
    expect(updated.read).toBe(1)

    expect(completed.id).not.toBe(crashed.id)
  }, 8_000)
})

describe('notification websocket channel', () => {
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
        await removeTempDir(dir)
      }
    }
  })

  it('streams live notifications and replays persisted notifications', async () => {
    const tempDir = await createTempDir('notification-ws')
    tempDirs.push(tempDir)

    const dbPath = join(tempDir, 'notification-ws.db')
    const binaryPath = await createMockNotificationBinary(tempDir)

    envSnapshots.push({
      RALPH_UI_DB_PATH: process.env.RALPH_UI_DB_PATH,
      RALPH_UI_RALPH_BIN: process.env.RALPH_UI_RALPH_BIN
    })

    process.env.RALPH_UI_DB_PATH = dbPath
    process.env.RALPH_UI_RALPH_BIN = binaryPath

    const app = createApp()
    apps.push(app)
    await app.listen({ host: '127.0.0.1', port: 0 })

    const projectPath = join(tempDir, 'project')
    await mkdir(projectPath, { recursive: true })
    const projectId = await createProject(app.dbConnection, projectPath)
    const address = app.server.address() as AddressInfo
    const wsUrl = `ws://127.0.0.1:${address.port}/ws`

    const ws1 = new WebSocket(wsUrl)
    await new Promise((resolve, reject) => {
      ws1.once('open', resolve)
      ws1.once('error', reject)
    })

    const nextMessage1 = createMessageWaiter(ws1)
    ws1.send(
      JSON.stringify({
        type: 'subscribe',
        channels: ['notifications']
      })
    )

    await app.loopService.start(projectId, { prompt: 'exit-fast' })

    const live = await nextMessage1(
      (message) =>
        message.type === 'notification' &&
        message.channel === 'notifications' &&
        message.replay !== true &&
        message.notificationType === 'loop_complete'
    )
    expect(live.projectId).toBe(projectId)
    await closeWebSocket(ws1)

    const ws2 = new WebSocket(wsUrl)
    await new Promise((resolve, reject) => {
      ws2.once('open', resolve)
      ws2.once('error', reject)
    })

    const nextMessage2 = createMessageWaiter(ws2)
    ws2.send(
      JSON.stringify({
        type: 'subscribe',
        channels: ['notifications']
      })
    )

    const replay = await nextMessage2(
      (message) =>
        message.type === 'notification' &&
        message.channel === 'notifications' &&
        message.replay === true
    )
    expect(replay.notificationType).toBe('loop_complete')
    await closeWebSocket(ws2)
  })
})
