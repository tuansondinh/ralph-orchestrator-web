import { afterEach, describe, expect, it, vi } from 'vitest'

const createOpencode = vi.fn(async () => ({
  client: {
    event: {
      subscribe: vi.fn(async () => ({
        stream: {
          async *[Symbol.asyncIterator]() {
            // noop
          }
        }
      }))
    },
    session: {
      create: vi.fn(async () => ({
        id: 'session-1',
        version: '1',
        title: 'Chat',
        parentID: '',
        share: null,
        time: {
          created: Date.now(),
          updated: Date.now()
        }
      })),
      promptAsync: vi.fn(async () => undefined)
    },
    config: {
      update: vi.fn(async () => undefined)
    },
    postSessionIdPermissionsPermissionId: vi.fn(async () => true)
  },
  server: {
    url: 'http://127.0.0.1:4096',
    close: vi.fn()
  }
}))

vi.mock('@opencode-ai/sdk', async () => {
  const actual = await vi.importActual<typeof import('@opencode-ai/sdk')>('@opencode-ai/sdk')
  return {
    ...actual,
    createOpencode
  }
})

const { createApp } = await import('../src/app.js')

describe('createApp OpenCode service wiring', () => {
  const apps: Array<ReturnType<typeof createApp>> = []

  afterEach(async () => {
    while (apps.length > 0) {
      await apps.pop()?.close()
    }
  })

  it('decorates the app with openCodeService and shuts it down on close', async () => {
    const app = createApp()
    apps.push(app)
    const stopSpy = vi.spyOn(app.openCodeService, 'stop')

    expect(app.openCodeService).toBeDefined()

    await app.openCodeService.start()
    await app.close()

    expect(createOpencode).toHaveBeenCalledTimes(1)
    expect(stopSpy).toHaveBeenCalledTimes(1)
  })

  it('does not register the legacy chat stream and confirm routes', async () => {
    const app = createApp()
    apps.push(app)

    const [streamResponse, trpcStreamResponse, confirmResponse, trpcConfirmResponse] =
      await Promise.all([
        app.inject({
          method: 'POST',
          url: '/chat/stream'
        }),
        app.inject({
          method: 'POST',
          url: '/trpc/chat/stream'
        }),
        app.inject({
          method: 'POST',
          url: '/chat/confirm'
        }),
        app.inject({
          method: 'POST',
          url: '/trpc/chat/confirm'
        })
      ])

    expect(streamResponse.statusCode).toBe(404)
    expect(trpcStreamResponse.statusCode).toBe(404)
    expect(confirmResponse.statusCode).toBe(404)
    expect(trpcConfirmResponse.statusCode).toBe(404)
  })
})
