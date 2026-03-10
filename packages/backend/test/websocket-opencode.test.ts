import { mkdtemp, rm } from 'node:fs/promises'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import WebSocket from 'ws'
import { createApp } from '../src/app.js'
import type { OpenCodeEvent } from '../src/types/chat.js'

function createMessageWaiter(socket: WebSocket) {
  return (
    predicate: (message: Record<string, unknown>) => boolean,
    timeoutMs = 3_000
  ) =>
    new Promise<Record<string, unknown>>((resolve, reject) => {
      const timeout = setTimeout(() => {
        socket.off('message', onMessage)
        reject(new Error(`Timed out waiting for websocket message (${timeoutMs}ms)`))
      }, timeoutMs)

      const onMessage = (raw: WebSocket.RawData) => {
        let parsed: Record<string, unknown>
        try {
          parsed = JSON.parse(raw.toString('utf8'))
        } catch {
          return
        }

        if (!predicate(parsed)) {
          return
        }

        clearTimeout(timeout)
        socket.off('message', onMessage)
        resolve(parsed)
      }

      socket.on('message', onMessage)
    })
}

async function connectWS(wsUrl: string) {
  const ws = new WebSocket(wsUrl)
  await new Promise<void>((resolve, reject) => {
    ws.once('open', resolve)
    ws.once('error', reject)
  })
  return ws
}

describe('opencode websocket channel', () => {
  const tempDirs: string[] = []
  const apps: Array<ReturnType<typeof createApp>> = []
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

  async function setupLocalApp() {
    const tempDir = await mkdtemp(join(tmpdir(), 'opencode-ws-'))
    tempDirs.push(tempDir)

    const dbPath = join(tempDir, 'opencode-ws.db')
    envSnapshots.push({
      RALPH_UI_DB_PATH: process.env.RALPH_UI_DB_PATH
    })
    process.env.RALPH_UI_DB_PATH = dbPath

    const app = createApp()
    apps.push(app)
    await app.listen({ host: '127.0.0.1', port: 0 })

    const listeners = new Set<(event: OpenCodeEvent) => void>()
    vi.spyOn(app.openCodeService, 'onEvent').mockImplementation((callback) => {
      listeners.add(callback)
      return () => {
        listeners.delete(callback)
      }
    })

    return {
      app,
      wsUrl: `ws://127.0.0.1:${(app.server.address() as AddressInfo).port}/ws`,
      emit(event: OpenCodeEvent) {
        for (const listener of listeners) {
          listener(event)
        }
      }
    }
  }

  it('broadcasts opencode events only to opencode-chat subscribers', async () => {
    const harness = await setupLocalApp()

    const subscribed = await connectWS(harness.wsUrl)
    const other = await connectWS(harness.wsUrl)
    const subscribedNext = createMessageWaiter(subscribed)

    const unexpectedMessages: Array<Record<string, unknown>> = []
    other.on('message', (raw) => {
      try {
        unexpectedMessages.push(JSON.parse(raw.toString('utf8')) as Record<string, unknown>)
      } catch {
        // ignore invalid payloads
      }
    })

    subscribed.send(JSON.stringify({ type: 'subscribe', channels: ['opencode-chat'] }))
    other.send(JSON.stringify({ type: 'subscribe', channels: ['notifications'] }))
    await new Promise((resolve) => setTimeout(resolve, 50))

    harness.emit({
      type: 'chat:delta',
      text: 'hello from opencode'
    })

    await expect(
      subscribedNext(
        (message) => message.type === 'chat:delta' && message.text === 'hello from opencode'
      )
    ).resolves.toMatchObject({
      type: 'chat:delta',
      text: 'hello from opencode'
    })

    await new Promise((resolve) => setTimeout(resolve, 150))
    expect(unexpectedMessages).toEqual([])

    subscribed.close()
    other.close()
  })

  it('dispatches chat send, confirm, and sync messages through the OpenCode service', async () => {
    const harness = await setupLocalApp()
    const sendMessage = vi.spyOn(harness.app.openCodeService, 'sendMessage').mockResolvedValue()
    const confirmPermission = vi
      .spyOn(harness.app.openCodeService, 'confirmPermission')
      .mockResolvedValue()
    const getSnapshot = vi.spyOn(harness.app.openCodeService, 'getSnapshot').mockReturnValue({
      sessionId: 'session-1',
      status: 'busy',
      pendingConfirmation: {
        permissionId: 'perm-1',
        toolName: 'start_loop',
        description: 'Approve start_loop',
        args: { projectId: 'project-1' }
      },
      messages: [
        {
          id: 'assistant-1',
          role: 'assistant',
          content: 'Working on it',
          createdAt: 1
        }
      ]
    })

    const chatClient = await connectWS(harness.wsUrl)
    const otherClient = await connectWS(harness.wsUrl)
    const nextMessage = createMessageWaiter(chatClient)

    const otherMessages: Array<Record<string, unknown>> = []
    otherClient.on('message', (raw) => {
      try {
        otherMessages.push(JSON.parse(raw.toString('utf8')) as Record<string, unknown>)
      } catch {
        // ignore invalid payloads
      }
    })

    chatClient.send(JSON.stringify({ type: 'subscribe', channels: ['opencode-chat'] }))
    otherClient.send(JSON.stringify({ type: 'subscribe', channels: ['notifications'] }))
    await new Promise((resolve) => setTimeout(resolve, 50))

    chatClient.send(JSON.stringify({ type: 'chat:send', message: 'hello' }))
    chatClient.send(
      JSON.stringify({
        type: 'chat:confirm',
        permissionId: 'perm-1',
        confirmed: true
      })
    )
    chatClient.send(JSON.stringify({ type: 'chat:sync' }))

    await expect(
      nextMessage((message) => message.type === 'chat:snapshot')
    ).resolves.toMatchObject({
      type: 'chat:snapshot',
      sessionId: 'session-1',
      status: 'busy',
      pendingConfirmation: {
        permissionId: 'perm-1',
        toolName: 'start_loop'
      },
      messages: [
        expect.objectContaining({
          id: 'assistant-1',
          content: 'Working on it'
        })
      ]
    })

    expect(sendMessage).toHaveBeenCalledWith('hello')
    expect(confirmPermission).toHaveBeenCalledWith('perm-1', true)
    expect(getSnapshot).toHaveBeenCalledTimes(1)

    await new Promise((resolve) => setTimeout(resolve, 150))
    expect(otherMessages).toEqual([])

    chatClient.close()
    otherClient.close()
  })
})
