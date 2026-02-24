import { randomUUID } from 'node:crypto'
import { createServer as createHttpServer } from 'node:http'
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
import { projects } from '../src/db/schema.js'
import { createApp } from '../src/app.js'
import { ProcessManager } from '../src/runner/ProcessManager.js'
import { ChatService } from '../src/services/ChatService.js'
import { DevPreviewManager } from '../src/services/DevPreviewManager.js'
import { LoopService } from '../src/services/LoopService.js'
import { MonitoringService } from '../src/services/MonitoringService.js'
import { appRouter } from '../src/trpc/router.js'

async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  timeoutMs = 3_000,
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

async function createProject(
  connection: DatabaseConnection,
  projectPath: string,
  name = 'Preview project'
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

async function createMockNodePreviewProject(
  rootDir: string,
  options: {
    name: string
    dependencies?: Record<string, string>
    scripts?: Record<string, string>
  }
) {
  const projectPath = join(rootDir, options.name)
  await mkdir(projectPath, { recursive: true })

  const devServerPath = join(projectPath, 'dev-server.mjs')
  const devServerScript = `#!/usr/bin/env node
import { createServer } from 'node:http'

const args = process.argv.slice(2)
const portArgIndex = args.findIndex((arg) => arg === '--port' || arg === '-p')
const hasPortArg = portArgIndex >= 0 && portArgIndex + 1 < args.length
const resolvedPort = Number(
  hasPortArg ? args[portArgIndex + 1] : process.env.PORT || '3001'
)
const port = Number.isFinite(resolvedPort) ? resolvedPort : 3001

const server = createServer((_req, res) => {
  res.statusCode = 200
  res.end('ok')
})

server.listen(port, '127.0.0.1', () => {
  process.stdout.write(\`Local: http://127.0.0.1:\${port}\\n\`)
})

process.on('SIGTERM', () => {
  server.close(() => process.exit(0))
})
`

  await writeFile(devServerPath, devServerScript, 'utf8')
  await chmod(devServerPath, 0o755)

  await writeFile(
    join(projectPath, 'package.json'),
    JSON.stringify(
      {
        name: options.name,
        version: '1.0.0',
        private: true,
        scripts: options.scripts ?? { dev: 'node dev-server.mjs' },
        dependencies: options.dependencies ?? { vite: '^5.0.0' }
      },
      null,
      2
    ),
    'utf8'
  )

  return projectPath
}

function createMessageWaiter(socket: WebSocket) {
  return (predicate: (message: Record<string, unknown>) => boolean) =>
    new Promise<Record<string, unknown>>((resolve, reject) => {
      const timeout = setTimeout(() => {
        socket.off('message', onMessage)
        reject(new Error('Timed out waiting for websocket message'))
      }, 3_000)

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

describe('preview tRPC routes', () => {
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

  async function setupCaller(options: { portStart?: number; portEnd?: number } = {}) {
    const tempDir = await createTempDir('preview')
    tempDirs.push(tempDir)

    const dbPath = join(tempDir, 'preview.db')
    const connection = createDatabase({ filePath: dbPath })
    migrateDatabase(connection.db)
    connections.push(connection)

    const processManager = new ProcessManager({ killGraceMs: 100 })
    managers.push(processManager)

    const loopService = new LoopService(connection.db, processManager)
    const chatService = new ChatService(connection.db, processManager)
    const monitoringService = new MonitoringService(connection.db, loopService)
    const previewService = new DevPreviewManager(connection.db, processManager, {
      portStart: options.portStart,
      portEnd: options.portEnd
    })

    const caller = appRouter.createCaller({
      db: connection.db,
      processManager,
      loopService,
      chatService,
      monitoringService,
      previewService
    })

    return { caller, connection, previewService, tempDir, processManager }
  }

  it('detects npm dev command and framework-specific port flags from package.json', async () => {
    const { previewService, tempDir } = await setupCaller()
    const viteProject = await createMockNodePreviewProject(tempDir, {
      name: 'vite-app',
      dependencies: { vite: '^5.0.0' }
    })
    const nextProject = await createMockNodePreviewProject(tempDir, {
      name: 'next-app',
      dependencies: { next: '^14.0.0' }
    })
    const craProject = await createMockNodePreviewProject(tempDir, {
      name: 'cra-app',
      dependencies: { 'react-scripts': '^5.0.1' }
    })

    const viteCommand = await previewService.detectDevCommand(viteProject)
    const nextCommand = await previewService.detectDevCommand(nextProject)
    const craCommand = await previewService.detectDevCommand(craProject)

    expect(viteCommand).toMatchObject({
      command: 'npm',
      args: ['run', 'dev'],
      portFlag: '--port'
    })
    expect(nextCommand).toMatchObject({
      command: 'npm',
      args: ['run', 'dev'],
      portFlag: '-p'
    })
    expect(craCommand).toMatchObject({
      command: 'npm',
      args: ['run', 'dev'],
      portFlag: null
    })

    const bothScriptsProject = await createMockNodePreviewProject(tempDir, {
      name: 'both-scripts-app',
      scripts: {
        dev: 'node dev-server.mjs',
        start: 'node dev-server.mjs'
      }
    })

    const preferredCommand = await previewService.detectDevCommand(bothScriptsProject)
    expect(preferredCommand).toMatchObject({
      command: 'npm',
      args: ['run', 'dev']
    })
  })

  it('starts a preview process, reports ready status, and stops cleanly', async () => {
    const { caller, connection, tempDir } = await setupCaller()
    const projectPath = await createMockNodePreviewProject(tempDir, {
      name: 'start-stop-app'
    })
    const projectId = await createProject(connection, projectPath)

    const starting = await caller.preview.start({ projectId })
    expect(starting.state).toBe('starting')
    expect(starting.url).toContain('localhost')

    await waitFor(async () => {
      const status = await caller.preview.status({ projectId })
      return status?.state === 'ready'
    })

    const ready = await caller.preview.status({ projectId })
    expect(ready?.state).toBe('ready')
    expect(ready?.url).toBe(`http://localhost:${ready?.port}`)

    await caller.preview.stop({ projectId })
    const stopped = await caller.preview.status({ projectId })
    expect(stopped?.state).toBe('stopped')
  })

  it('auto-increments the preview port when the first port is occupied', async () => {
    const { caller, connection, tempDir } = await setupCaller({
      portStart: 4101,
      portEnd: 4110
    })
    const projectPath = await createMockNodePreviewProject(tempDir, {
      name: 'conflict-app'
    })
    const projectId = await createProject(connection, projectPath)

    const blocker = createHttpServer((_req, res) => {
      res.statusCode = 200
      res.end('blocked')
    })

    await new Promise<void>((resolve, reject) => {
      blocker.once('error', reject)
      blocker.listen(4101, 'localhost', () => resolve())
    })

    try {
      const started = await caller.preview.start({ projectId })
      await waitFor(async () => {
        const status = await caller.preview.status({ projectId })
        return status?.state === 'ready'
      })

      const ready = await caller.preview.status({ projectId })
      expect(started.port).not.toBe(4101)
      expect(ready?.port).not.toBe(4101)
    } finally {
      await caller.preview.stop({ projectId }).catch(() => undefined)
      blocker.close()
    }
  })

  it('returns an error when no dev command can be detected', async () => {
    const { caller, connection, tempDir } = await setupCaller()
    const projectPath = join(tempDir, 'no-dev-command')
    await mkdir(projectPath, { recursive: true })
    await writeFile(
      join(projectPath, 'package.json'),
      JSON.stringify(
        {
          name: 'no-dev-command',
          version: '1.0.0',
          private: true,
          scripts: {}
        },
        null,
        2
      ),
      'utf8'
    )

    const projectId = await createProject(connection, projectPath)
    await expect(caller.preview.start({ projectId })).rejects.toThrow(
      /dev command/i
    )
  })

  it('exposes preview settings routes with defaults and persisted values', async () => {
    const { caller } = await setupCaller()

    const defaults = await caller.previewSettings.get()
    expect(defaults).toEqual({
      baseUrl: 'http://localhost',
      command: null
    })

    const updated = await caller.previewSettings.set({
      baseUrl: 'http://my-machine.local',
      command: 'npm run dev'
    })
    expect(updated).toEqual({
      baseUrl: 'http://my-machine.local',
      command: 'npm run dev'
    })

    const reloaded = await caller.previewSettings.get()
    expect(reloaded).toEqual(updated)
  })

  it('uses configured preview base URL and command when starting preview', async () => {
    const { caller, connection, tempDir } = await setupCaller()
    const projectPath = await createMockNodePreviewProject(tempDir, {
      name: 'custom-preview-settings-app'
    })
    const projectId = await createProject(connection, projectPath)

    await caller.previewSettings.set({
      baseUrl: 'http://my-machine.local',
      command: 'node dev-server.mjs'
    })

    const starting = await caller.preview.start({ projectId })
    expect(starting.url).toBe(`http://my-machine.local:${starting.port}`)
    expect(starting.command).toBe('node')
    expect(starting.args).toContain('dev-server.mjs')

    await waitFor(async () => {
      const status = await caller.preview.status({ projectId })
      return status?.state === 'ready'
    })

    const ready = await caller.preview.status({ projectId })
    expect(ready?.url).toBe(`http://my-machine.local:${ready?.port}`)

    await caller.preview.stop({ projectId })
  })
})

describe('preview websocket streaming', () => {
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

  it('streams preview state changes for subscribed project channels', async () => {
    const tempDir = await createTempDir('preview-ws')
    tempDirs.push(tempDir)

    const dbPath = join(tempDir, 'preview-ws.db')

    envSnapshots.push({
      RALPH_UI_DB_PATH: process.env.RALPH_UI_DB_PATH
    })
    process.env.RALPH_UI_DB_PATH = dbPath

    const app = createApp()
    apps.push(app)
    await app.listen({ host: '127.0.0.1', port: 0 })

    const projectPath = await createMockNodePreviewProject(tempDir, {
      name: 'websocket-app'
    })
    const projectId = await createProject(app.dbConnection, projectPath)

    const address = app.server.address() as AddressInfo
    const ws = new WebSocket(`ws://127.0.0.1:${address.port}/ws`)
    await new Promise((resolve, reject) => {
      ws.once('open', resolve)
      ws.once('error', reject)
    })

    const nextMessage = createMessageWaiter(ws)
    ws.send(
      JSON.stringify({
        type: 'subscribe',
        channels: [`preview:${projectId}:state`]
      })
    )

    await app.previewService.start(projectId)

    const readyState = await nextMessage(
      (message) =>
        message.type === 'preview.state' &&
        message.projectId === projectId &&
        message.state === 'ready'
    )

    expect(readyState.url).toContain('localhost')

    ws.close()
    await app.previewService.stop(projectId)
  })
})
