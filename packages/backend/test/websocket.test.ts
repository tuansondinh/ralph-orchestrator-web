import { randomUUID } from 'node:crypto'
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import WebSocket from 'ws'
import { projects } from '../src/db/schema.js'
import { createApp } from '../src/app.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMessageWaiter(socket: WebSocket) {
  return (
    predicate: (msg: Record<string, unknown>) => boolean,
    timeoutMs = 3_000
  ) =>
    new Promise<Record<string, unknown>>((resolve, reject) => {
      const t = setTimeout(() => {
        socket.off('message', handler)
        reject(new Error(`Timed out waiting for WebSocket message (${timeoutMs}ms)`))
      }, timeoutMs)

      const handler = (raw: WebSocket.RawData) => {
        let parsed: Record<string, unknown>
        try {
          parsed = JSON.parse(raw.toString('utf8'))
        } catch {
          return
        }
        if (predicate(parsed)) {
          clearTimeout(t)
          socket.off('message', handler)
          resolve(parsed)
        }
      }
      socket.on('message', handler)
    })
}

async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  timeoutMs = 4_000,
  pollMs = 20
) {
  const start = Date.now()
  while (!(await predicate())) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`waitFor timed out after ${timeoutMs}ms`)
    }
    await new Promise((r) => setTimeout(r, pollMs))
  }
}

async function createMockBinary(dir: string) {
  const filePath = join(dir, 'mock-ws-ralph.mjs')
  const script = `#!/usr/bin/env node
const args = process.argv.slice(2)
if (args[0] === 'loops' && args[1] === 'stop') process.exit(0)
setTimeout(() => process.exit(0), 40)
process.on('SIGTERM', () => process.exit(0))
`
  await writeFile(filePath, script, 'utf8')
  await chmod(filePath, 0o755)
  return filePath
}

async function connectWS(wsUrl: string) {
  const ws = new WebSocket(wsUrl)
  await new Promise<void>((resolve, reject) => {
    ws.once('open', resolve)
    ws.once('error', reject)
  })
  return ws
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WebSocket handler', () => {
  const tempDirs: string[] = []
  const apps: ReturnType<typeof createApp>[] = []
  const envSnapshots: Record<string, string | undefined>[] = []

  afterEach(async () => {
    while (apps.length > 0) {
      await apps.pop()?.close()
    }
    while (envSnapshots.length > 0) {
      const snap = envSnapshots.pop()!
      for (const [k, v] of Object.entries(snap)) {
        if (v === undefined) delete process.env[k]
        else process.env[k] = v
      }
    }
    while (tempDirs.length > 0) {
      await rm(tempDirs.pop()!, { recursive: true, force: true })
    }
  })

  async function setupApp() {
    const tempDir = await mkdtemp(join(tmpdir(), 'ws-handler-test-'))
    tempDirs.push(tempDir)

    const dbPath = join(tempDir, 'ws.db')
    const binaryPath = await createMockBinary(tempDir)

    envSnapshots.push({
      RALPH_UI_DB_PATH: process.env.RALPH_UI_DB_PATH,
      RALPH_UI_RALPH_BIN: process.env.RALPH_UI_RALPH_BIN
    })
    process.env.RALPH_UI_DB_PATH = dbPath
    process.env.RALPH_UI_RALPH_BIN = binaryPath

    const app = createApp()
    apps.push(app)
    await app.listen({ host: '127.0.0.1', port: 0 })

    const address = app.server.address() as AddressInfo
    const wsUrl = `ws://127.0.0.1:${address.port}/ws`

    const projectPath = join(tempDir, 'project')
    await mkdir(projectPath, { recursive: true })
    const projectId = randomUUID()
    const now = Date.now()
    await app.dbConnection.db
      .insert(projects)
      .values({
        id: projectId,
        name: 'WS Test Project',
        path: projectPath,
        type: 'node',
        ralphConfig: null,
        createdAt: now,
        updatedAt: now
      })
      .run()

    return { app, wsUrl, projectId }
  }

  it('sends an error response for non-JSON messages', async () => {
    const { wsUrl } = await setupApp()
    const ws = await connectWS(wsUrl)
    const nextMsg = createMessageWaiter(ws)

    ws.send('not valid json at all')

    const msg = await nextMsg((m) => m.type === 'error')
    expect(typeof msg.message).toBe('string')
    expect((msg.message as string).length).toBeGreaterThan(0)
    ws.close()
  })

  it('sends an error response for JSON with unknown message type', async () => {
    const { wsUrl } = await setupApp()
    const ws = await connectWS(wsUrl)
    const nextMsg = createMessageWaiter(ws)

    ws.send(JSON.stringify({ type: 'completely-unknown', payload: 42 }))

    const msg = await nextMsg((m) => m.type === 'error')
    expect(typeof msg.message).toBe('string')
    ws.close()
  })

  it('sends initial loop state message (unknown) when subscribing to loop:X:state', async () => {
    const { wsUrl } = await setupApp()
    const ws = await connectWS(wsUrl)
    const nextMsg = createMessageWaiter(ws)

    const loopId = randomUUID()
    ws.send(JSON.stringify({ type: 'subscribe', channels: [`loop:${loopId}:state`] }))

    const msg = await nextMsg((m) => m.type === 'loop.state')
    expect(msg.loopId).toBe(loopId)
    expect(msg.state).toBe('unknown') // no loop running
    ws.close()
  })

  it('subscribing to loop:output keeps connection open even if loop does not exist', async () => {
    const { wsUrl } = await setupApp()
    const ws = await connectWS(wsUrl)

    ws.send(JSON.stringify({ type: 'subscribe', channels: [`loop:${randomUUID()}:output`] }))

    // Give subscription time to process
    await new Promise((r) => setTimeout(r, 150))

    // Connection should still be open — no crash from missing loop
    expect(ws.readyState).toBe(WebSocket.OPEN)
    ws.close()
  })

  it('forwards live loop state change to subscriber', async () => {
    const { wsUrl, app, projectId } = await setupApp()
    const ws = await connectWS(wsUrl)
    const nextMsg = createMessageWaiter(ws)

    // Start a loop and subscribe to its state changes
    const loop = await app.loopService.start(projectId, { prompt: 'exit-fast' })

    ws.send(
      JSON.stringify({ type: 'subscribe', channels: [`loop:${loop.id}:state`] })
    )

    // Wait for a completed state message
    const msg = await nextMsg(
      (m) => m.type === 'loop.state' && m.loopId === loop.id && m.state === 'completed'
    )
    expect(msg.loopId).toBe(loop.id)
    ws.close()
  })

  it('subscribing to notifications channel receives replay after loop completes', async () => {
    const { wsUrl, app, projectId } = await setupApp()

    // Start and wait for loop to complete
    await app.loopService.start(projectId, { prompt: 'exit-fast' })

    await waitFor(async () => {
      const notifs = await app.loopService.replayNotifications()
      return notifs.some((n) => n.projectId === projectId && n.type === 'loop_complete')
    })

    // Fresh connection to test replay
    const ws = await connectWS(wsUrl)
    const nextMsg = createMessageWaiter(ws)

    ws.send(JSON.stringify({ type: 'subscribe', channels: ['notifications'] }))

    const msg = await nextMsg((m) => m.type === 'notification' && m.replay === true)
    expect(msg.notificationType).toBe('loop_complete')
    ws.close()
  })

  it('two clients both receive a live notification', async () => {
    const { wsUrl, app, projectId } = await setupApp()

    const ws1 = await connectWS(wsUrl)
    const ws2 = await connectWS(wsUrl)
    const next1 = createMessageWaiter(ws1)
    const next2 = createMessageWaiter(ws2)

    // Both subscribe before starting the loop
    ws1.send(JSON.stringify({ type: 'subscribe', channels: ['notifications'] }))
    ws2.send(JSON.stringify({ type: 'subscribe', channels: ['notifications'] }))

    // Wait a tick so subscriptions are applied
    await new Promise((r) => setTimeout(r, 50))

    const [msg1, msg2] = await Promise.all([
      next1((m) => m.type === 'notification' && m.replay !== true),
      next2((m) => m.type === 'notification' && m.replay !== true),
      app.loopService.start(projectId, { prompt: 'exit-fast' })
    ])

    expect(msg1.projectId).toBe(projectId)
    expect(msg2.projectId).toBe(projectId)
    ws1.close()
    ws2.close()
  })

  it('disconnecting a client does not crash the server', async () => {
    const { wsUrl } = await setupApp()
    const ws = await connectWS(wsUrl)

    // Subscribe to a few channels
    ws.send(
      JSON.stringify({
        type: 'subscribe',
        channels: ['notifications', `loop:${randomUUID()}:state`]
      })
    )

    // Wait for subscriptions to be applied
    await new Promise((r) => setTimeout(r, 100))

    // Close the connection abruptly
    ws.close()

    // Give cleanup time to run
    await new Promise((r) => setTimeout(r, 100))

    // No exception means the test passes — cleanup ran without error
  })
})
