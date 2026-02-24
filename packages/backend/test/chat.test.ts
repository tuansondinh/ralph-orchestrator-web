import { randomUUID } from 'node:crypto'
import { chmod, mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import WebSocket from 'ws'
import { eq } from 'drizzle-orm'
import {
  closeDatabase,
  createDatabase,
  migrateDatabase,
  type DatabaseConnection
} from '../src/db/connection.js'
import { chatMessages, chatSessions, projects } from '../src/db/schema.js'
import { createApp } from '../src/app.js'
import { ProcessManager } from '../src/runner/ProcessManager.js'
import { LoopService } from '../src/services/LoopService.js'
import { ChatService } from '../src/services/ChatService.js'
import { MonitoringService } from '../src/services/MonitoringService.js'
import { DevPreviewManager } from '../src/services/DevPreviewManager.js'
import { appRouter } from '../src/trpc/router.js'

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

async function createMockChatBinary(directory: string) {
  const filePath = join(directory, 'mock-chat-ralph.mjs')
  const script = `#!/usr/bin/env node
const mode = process.argv[2] || 'plan'
let opened = false

setTimeout(() => {
  process.stdout.write(\`Ralph \${mode} session started\\n\`)
  process.stdout.write('Your input: ')
  opened = true
}, 10)

process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => {
  const message = chunk.trim()
  if (!message) {
    return
  }

  if (message === '__exit__') {
    process.stdout.write('Session finished\\n')
    process.exit(0)
    return
  }

  process.stdout.write(\`Assistant: \${message.toUpperCase()}\\n\`)
  setTimeout(() => {
    process.stdout.write('Your input: ')
  }, 25)
})

process.on('SIGTERM', () => {
  if (opened) {
    process.stdout.write('Session interrupted\\n')
  }
  process.exit(0)
})
`

  await writeFile(filePath, script, 'utf8')
  await chmod(filePath, 0o755)
  return filePath
}

async function createStructuredPromptMockBinary(directory: string) {
  const filePath = join(directory, 'mock-chat-structured-prompt.mjs')
  const script = `#!/usr/bin/env node
setTimeout(() => {
  process.stdout.write('Using your pdd SOP directly (planning-only workflow, no implementation actions).\\n')
  process.stdout.write('Please provide both parameters in one reply:\\n')
  process.stdout.write('1. rough_idea (required): your idea as either:\\n')
  process.stdout.write('- direct text, or\\n')
  process.stdout.write('- a local file path, or\\n')
  process.stdout.write('- a URL?\\n')
  process.stdout.write('Your input:\\n')
}, 10)

process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => {
  const message = chunk.trim()
  if (!message) {
    return
  }

  if (message === '__exit__') {
    process.stdout.write('Session finished\\n')
    process.exit(0)
    return
  }

  process.stdout.write('Acknowledged: ' + message + '\\n')
  process.stdout.write('Your input:\\n')
})
`

  await writeFile(filePath, script, 'utf8')
  await chmod(filePath, 0o755)
  return filePath
}

async function createOneShotMockChatBinary(directory: string) {
  const filePath = join(directory, 'mock-chat-one-shot.mjs')
  const script = `#!/usr/bin/env node
const mode = process.argv[2] || 'plan'

process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => {
  const message = chunk.trim()
  if (!message) {
    return
  }

  process.stdout.write('One-shot ' + mode + ': ' + message.toUpperCase() + '\\n')
  process.exit(0)
})

setTimeout(() => {
  process.stdout.write('Your input:\\n')
}, 10)
`

  await writeFile(filePath, script, 'utf8')
  await chmod(filePath, 0o755)
  return filePath
}

async function createProject(
  connection: DatabaseConnection,
  projectPath: string,
  name = 'Chat project'
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

describe('chat tRPC routes', () => {
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

  async function setupCaller(options?: {
    chatServiceOptions?: Record<string, unknown>
  }) {
    const tempDir = await createTempDir('chat')
    tempDirs.push(tempDir)

    const dbPath = join(tempDir, 'chat.db')
    const connection = createDatabase({ filePath: dbPath })
    migrateDatabase(connection.db)
    connections.push(connection)

    const binaryPath = await createMockChatBinary(tempDir)
    const processManager = new ProcessManager({ killGraceMs: 100 })
    managers.push(processManager)
    const loopService = new LoopService(connection.db, processManager, {
      resolveBinary: async () => binaryPath
    })
    const chatService = new ChatService(connection.db, processManager, {
      resolveBinary: async () => binaryPath,
      ...(options?.chatServiceOptions ?? {})
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

    return { caller, connection, processManager, chatService, tempDir }
  }

  it('starts a plan session, sends messages, and persists history through completion', async () => {
    const { caller, connection, processManager, tempDir } = await setupCaller()
    const projectPath = join(tempDir, 'project')
    await mkdir(projectPath, { recursive: true })
    const projectId = await createProject(connection, projectPath)

    const started = await caller.chat.startSession({
      projectId,
      type: 'plan'
    })

    expect(started.type).toBe('plan')
    expect(started.backend).toBe('codex')
    expect(started.state).toBe('active')
    expect(processManager.list()[0]?.args[0]).toBe('plan')
    expect(processManager.list()[0]?.args[1]).toBe('--backend')
    expect(processManager.list()[0]?.args[2]).toBe('codex')
    expect(processManager.list()[0]?.tty).toBe(true)

    await waitFor(() => {
      const row = connection.db
        .select()
        .from(chatSessions)
        .where(eq(chatSessions.id, started.id))
        .get()
      return row?.state === 'waiting'
    })

    await caller.chat.sendMessage({
      sessionId: started.id,
      message: 'build a rest api'
    })

    const afterSend = connection.db
      .select()
      .from(chatSessions)
      .where(eq(chatSessions.id, started.id))
      .get()
    expect(afterSend?.state).toBe('active')

    await waitFor(() => {
      const messages = connection.db
        .select()
        .from(chatMessages)
        .where(eq(chatMessages.sessionId, started.id))
        .all()

      return messages.some(
        (message) =>
          message.role === 'assistant' &&
          message.content.includes('Assistant: BUILD A REST API')
      )
    })

    await caller.chat.endSession({ sessionId: started.id })

    await waitFor(() => {
      const row = connection.db
        .select()
        .from(chatSessions)
        .where(eq(chatSessions.id, started.id))
        .get()
      return row?.state === 'completed'
    })

    const history = await caller.chat.getHistory({ sessionId: started.id })
    expect(history.some((message) => message.role === 'user')).toBe(true)
    expect(history.some((message) => message.role === 'assistant')).toBe(true)
  })

  it('reuses the active chat session for a project when start is called again', async () => {
    const { caller, connection, tempDir } = await setupCaller()
    const projectPath = join(tempDir, 'project')
    await mkdir(projectPath, { recursive: true })
    const projectId = await createProject(connection, projectPath)

    const session = await caller.chat.startSession({
      projectId,
      type: 'task'
    })

    await waitFor(() => {
      const row = connection.db
        .select()
        .from(chatSessions)
        .where(eq(chatSessions.id, session.id))
        .get()
      return row?.state === 'waiting'
    })

    const secondStart = await caller.chat.startSession({
      projectId,
      type: 'plan'
    })

    expect(secondStart.id).toBe(session.id)
    expect(secondStart.type).toBe('task')
    expect(secondStart.state).toBe('waiting')

    const allSessions = connection.db.select().from(chatSessions).all()
    expect(allSessions).toHaveLength(1)

    await caller.chat.endSession({ sessionId: session.id })
  })

  it('starts a session with the requested backend model', async () => {
    const { caller, connection, processManager, tempDir } = await setupCaller()
    const projectPath = join(tempDir, 'project')
    await mkdir(projectPath, { recursive: true })
    const projectId = await createProject(connection, projectPath)

    const started = await caller.chat.startSession({
      projectId,
      type: 'plan',
      backend: 'gemini'
    })

    expect(started.backend).toBe('gemini')
    expect(processManager.list()[0]?.args).toEqual(['plan', '--backend', 'gemini'])

    await caller.chat.endSession({ sessionId: started.id })
  })

  it('returns the active project session and supports forced restart', async () => {
    const { caller, connection, tempDir } = await setupCaller()
    const projectPath = join(tempDir, 'project')
    await mkdir(projectPath, { recursive: true })
    const projectId = await createProject(connection, projectPath)

    const initial = await caller.chat.startSession({
      projectId,
      type: 'plan'
    })

    await waitFor(() => {
      const row = connection.db
        .select()
        .from(chatSessions)
        .where(eq(chatSessions.id, initial.id))
        .get()
      return row?.state === 'waiting'
    })

    const active = await caller.chat.getProjectSession({ projectId })
    expect(active?.id).toBe(initial.id)

    const restarted = await caller.chat.restartSession({
      projectId,
      type: 'task'
    })

    expect(restarted.id).not.toBe(initial.id)
    expect(restarted.type).toBe('task')

    await waitFor(() => {
      const row = connection.db
        .select()
        .from(chatSessions)
        .where(eq(chatSessions.id, initial.id))
        .get()
      return row?.state === 'completed'
    })
  })

  it('logs chat lifecycle events during start, send, and end', async () => {
    const logger = {
      debug: vi.fn(),
      info: vi.fn(),
      error: vi.fn()
    }
    const { caller, connection, tempDir } = await setupCaller({
      chatServiceOptions: { logger }
    })
    const projectPath = join(tempDir, 'project')
    await mkdir(projectPath, { recursive: true })
    const projectId = await createProject(connection, projectPath)

    const session = await caller.chat.startSession({
      projectId,
      type: 'plan'
    })

    await waitFor(() => {
      const row = connection.db
        .select()
        .from(chatSessions)
        .where(eq(chatSessions.id, session.id))
        .get()
      return row?.state === 'waiting'
    })

    await caller.chat.sendMessage({
      sessionId: session.id,
      message: 'log this'
    })
    await caller.chat.endSession({ sessionId: session.id })

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId,
        sessionId: session.id,
        type: 'plan'
      }),
      '[ChatService] Session started'
    )
    expect(logger.debug).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: session.id,
        messageLength: 'log this'.length
      }),
      '[ChatService] Message sent'
    )
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: session.id
      }),
      '[ChatService] Session ended'
    )
  })

  it('keeps multiline assistant output grouped until an actual input prompt', async () => {
    const tempDir = await createTempDir('chat-structured')
    tempDirs.push(tempDir)

    const dbPath = join(tempDir, 'chat-structured.db')
    const connection = createDatabase({ filePath: dbPath })
    migrateDatabase(connection.db)
    connections.push(connection)

    const processManager = new ProcessManager({ killGraceMs: 100 })
    managers.push(processManager)

    const projectPath = join(tempDir, 'project')
    await mkdir(projectPath, { recursive: true })
    const projectId = await createProject(connection, projectPath)
    const structuredBinaryPath = await createStructuredPromptMockBinary(tempDir)

    const chatService = new ChatService(connection.db, processManager, {
      resolveBinary: async () => structuredBinaryPath
    })

    const started = await chatService.startSession(projectId, 'plan')
    await new Promise((resolve) => setTimeout(resolve, 500))
    expect(started.processId).toBeTruthy()
    await processManager.kill(started.processId as string)

    await waitFor(() => {
      const row = connection.db
        .select()
        .from(chatSessions)
        .where(eq(chatSessions.id, started.id))
        .get()
      return row?.state === 'completed'
    })

    const initialHistory = await chatService.getHistory(started.id)
    const initialAssistantMessages = initialHistory.filter(
      (message) => message.role === 'assistant'
    )
    expect(initialAssistantMessages).toHaveLength(1)
    expect(initialAssistantMessages[0]?.content).toContain(
      'Please provide both parameters in one reply:'
    )
    expect(initialAssistantMessages[0]?.content).toContain(
      'rough_idea (required): your idea as either:'
    )
    expect(initialAssistantMessages[0]?.content).toContain('- a URL?')
  })

  it('keeps session reusable when the process exits after a response', async () => {
    const tempDir = await createTempDir('chat-oneshot')
    tempDirs.push(tempDir)

    const dbPath = join(tempDir, 'chat-oneshot.db')
    const connection = createDatabase({ filePath: dbPath })
    migrateDatabase(connection.db)
    connections.push(connection)

    const processManager = new ProcessManager({ killGraceMs: 100 })
    managers.push(processManager)

    const projectPath = join(tempDir, 'project')
    await mkdir(projectPath, { recursive: true })
    const projectId = await createProject(connection, projectPath)
    const oneShotPath = await createOneShotMockChatBinary(tempDir)

    const chatService = new ChatService(connection.db, processManager, {
      resolveBinary: async () => oneShotPath
    })

    const started = await chatService.startSession(projectId, 'plan')
    await waitFor(() => {
      const row = connection.db
        .select()
        .from(chatSessions)
        .where(eq(chatSessions.id, started.id))
        .get()
      return row?.state === 'waiting'
    })

    await chatService.sendMessage(started.id, 'first request')
    await waitFor(() => {
      const row = connection.db
        .select()
        .from(chatSessions)
        .where(eq(chatSessions.id, started.id))
        .get()
      return row?.state === 'waiting'
    })

    await chatService.sendMessage(started.id, 'second request')
    await waitFor(() => {
      const messages = connection.db
        .select()
        .from(chatMessages)
        .where(eq(chatMessages.sessionId, started.id))
        .all()
      return messages.some(
        (message) =>
          message.role === 'assistant' &&
          message.content.includes('One-shot plan: SECOND REQUEST')
      )
    })

    const history = await chatService.getHistory(started.id)
    expect(history.some((message) => message.content.includes('One-shot plan: FIRST REQUEST'))).toBe(true)
    expect(history.some((message) => message.content.includes('One-shot plan: SECOND REQUEST'))).toBe(true)
  })
})

describe('chat websocket streaming', () => {
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

  it('streams assistant messages and replays persisted history on reconnect', async () => {
    const tempDir = await createTempDir('chat-ws')
    tempDirs.push(tempDir)

    const dbPath = join(tempDir, 'chat-ws.db')
    const binaryPath = await createMockChatBinary(tempDir)

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

    const session = await app.chatService.startSession(projectId, 'plan')

    const address = app.server.address() as AddressInfo
    const baseUrl = `ws://127.0.0.1:${address.port}/ws`

    const ws1 = new WebSocket(baseUrl)
    await new Promise((resolve, reject) => {
      ws1.once('open', resolve)
      ws1.once('error', reject)
    })

    const nextMessage1 = createMessageWaiter(ws1)
    ws1.send(
      JSON.stringify({
        type: 'subscribe',
        channels: [`chat:${session.id}:message`]
      })
    )

    const liveMessage = await nextMessage1(
      (message) =>
        message.type === 'chat.message' &&
        message.channel === `chat:${session.id}:message` &&
        message.replay !== true &&
        message.role === 'assistant'
    )

    expect(String(liveMessage.content)).toContain('Ralph plan session started')

    await app.chatService.sendMessage(session.id, 'hello from websocket test')

    const nextAssistant = await nextMessage1(
      (message) =>
        message.type === 'chat.message' &&
        message.channel === `chat:${session.id}:message` &&
        message.replay !== true &&
        String(message.content).includes('HELLO FROM WEBSOCKET TEST')
    )

    expect(nextAssistant.role).toBe('assistant')
    ws1.close()

    await new Promise((resolve) => setTimeout(resolve, 100))

    const ws2 = new WebSocket(baseUrl)
    await new Promise((resolve, reject) => {
      ws2.once('open', resolve)
      ws2.once('error', reject)
    })

    const nextMessage2 = createMessageWaiter(ws2)
    ws2.send(
      JSON.stringify({
        type: 'subscribe',
        channels: [`chat:${session.id}:message`]
      })
    )

    const replayMessage = await nextMessage2(
      (message) =>
        message.type === 'chat.message' &&
        message.channel === `chat:${session.id}:message` &&
        message.replay === true
    )

    expect(String(replayMessage.content).length).toBeGreaterThan(0)

    await app.chatService.endSession(session.id)
    ws2.close()
  })
})
