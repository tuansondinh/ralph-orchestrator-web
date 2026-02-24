import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '@/App'
import { loopApi } from '@/lib/loopApi'
import { notificationApi } from '@/lib/notificationApi'
import { projectApi, type ProjectRecord } from '@/lib/projectApi'
import { settingsApi } from '@/lib/settingsApi'
import { resetLoopStore } from '@/stores/loopStore'
import { resetNotificationStore } from '@/stores/notificationStore'
import { resetProjectStore } from '@/stores/projectStore'

vi.mock('@/lib/projectApi', () => ({
  projectApi: {
    list: vi.fn(),
    create: vi.fn(),
    selectDirectory: vi.fn()
  }
}))

vi.mock('@/lib/loopApi', () => ({
  loopApi: {
    list: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    restart: vi.fn(),
    getMetrics: vi.fn()
  }
}))

vi.mock('@/lib/notificationApi', () => ({
  notificationApi: {
    list: vi.fn(),
    markRead: vi.fn()
  }
}))

vi.mock('@/lib/settingsApi', () => ({
  settingsApi: {
    get: vi.fn()
  }
}))

class MockWebSocket {
  static instances: MockWebSocket[] = []
  static OPEN = 1

  readyState = MockWebSocket.OPEN
  sent: string[] = []
  private listeners: Record<string, Array<(event: MessageEvent | Event) => void>> = {
    open: [],
    close: [],
    message: [],
    error: []
  }

  constructor(_url: string) {
    MockWebSocket.instances.push(this)
    setTimeout(() => this.dispatch('open', new Event('open')))
  }

  addEventListener(type: 'open' | 'close' | 'message' | 'error', listener: (event: MessageEvent | Event) => void) {
    this.listeners[type].push(listener)
  }

  removeEventListener(
    type: 'open' | 'close' | 'message' | 'error',
    listener: (event: MessageEvent | Event) => void
  ) {
    this.listeners[type] = this.listeners[type].filter((candidate) => candidate !== listener)
  }

  send(payload: string) {
    this.sent.push(payload)
  }

  close() {
    this.dispatch('close', new Event('close'))
  }

  emitMessage(payload: unknown) {
    this.dispatch(
      'message',
      new MessageEvent('message', {
        data: JSON.stringify(payload)
      })
    )
  }

  private dispatch(type: 'open' | 'close' | 'message' | 'error', event: MessageEvent | Event) {
    for (const listener of this.listeners[type]) {
      listener(event)
    }
  }
}

const browserNotificationSpy = vi.fn()

class MockBrowserNotification {
  static permission: NotificationPermission = 'granted'
  static requestPermission = vi.fn(async () => 'granted' as NotificationPermission)

  constructor(title: string, options?: NotificationOptions) {
    browserNotificationSpy(title, options)
  }
}

const seedProject: ProjectRecord = {
  id: 'alpha',
  name: 'Alpha App',
  path: '/tmp/alpha-app',
  type: 'node',
  ralphConfig: 'ralph.yml',
  createdAt: 1,
  updatedAt: 1
}

describe('notifications flow', () => {
  beforeEach(() => {
    resetProjectStore()
    resetLoopStore()
    resetNotificationStore()
    vi.clearAllMocks()
    MockWebSocket.instances = []
    browserNotificationSpy.mockReset()
    window.history.pushState({}, '', '/settings')

    vi.stubGlobal('WebSocket', MockWebSocket as unknown as typeof WebSocket)
    vi.stubGlobal('Notification', MockBrowserNotification as unknown as typeof Notification)

    vi.mocked(projectApi.list).mockResolvedValue([seedProject])
    vi.mocked(projectApi.create).mockResolvedValue(seedProject)
    vi.mocked(loopApi.list).mockResolvedValue([])
    vi.mocked(loopApi.start).mockRejectedValue(new Error('not used'))
    vi.mocked(loopApi.stop).mockResolvedValue(undefined)
    vi.mocked(loopApi.restart).mockRejectedValue(new Error('not used'))
    vi.mocked(loopApi.getMetrics).mockResolvedValue({
      iterations: 0,
      runtime: 0,
      tokensUsed: 0,
      errors: 0,
      lastOutputSize: 0,
      filesChanged: []
    })
    vi.mocked(notificationApi.list).mockResolvedValue([])
    vi.mocked(notificationApi.markRead).mockImplementation(async ({ notificationId }) => ({
      id: notificationId,
      projectId: 'alpha',
      type: 'loop_complete',
      title: 'Loop completed',
      message: 'Loop finished successfully.',
      read: 1,
      createdAt: Date.now()
    }))
    vi.mocked(settingsApi.get).mockResolvedValue({
      ralphBinaryPath: null,
      notifications: {
        loopComplete: true,
        loopFailed: true,
        needsInput: true
      },
      preview: {
        portStart: 3001,
        portEnd: 3010,
        baseUrl: 'http://localhost',
        command: null
      },
      data: {
        dbPath: '/tmp/ralph-ui/data.db'
      }
    })
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('shows toast + browser notification, updates unread badge, and navigates on click', async () => {
    render(<App />)

    await waitFor(() => {
      expect(vi.mocked(settingsApi.get).mock.calls.length).toBeGreaterThanOrEqual(2)
    })

    const socket = MockWebSocket.instances[0]
    expect(socket).toBeDefined()
    socket?.emitMessage({
      type: 'notification',
      channel: 'notifications',
      id: 'notif-1',
      projectId: 'alpha',
      notificationType: 'loop_complete',
      title: 'Loop completed',
      message: 'Loop finished successfully.',
      read: 0,
      createdAt: Date.now(),
      replay: false
    })

    expect(await screen.findByText('Loop completed')).toBeInTheDocument()
    expect(browserNotificationSpy).toHaveBeenCalledWith('Loop completed', {
      body: 'Loop finished successfully.'
    })

    const bell = screen.getByRole('button', {
      name: 'Notifications (1 unread)'
    })
    fireEvent.click(bell)
    fireEvent.click(screen.getByRole('button', { name: 'Loop completed' }))

    await waitFor(() => {
      expect(notificationApi.markRead).toHaveBeenCalledWith({ notificationId: 'notif-1' })
    })
    expect(window.location.pathname).toBe('/project/alpha/loops')
  })

  it('renders crashed loop toast with error styling', async () => {
    render(<App />)

    await waitFor(() => {
      expect(vi.mocked(settingsApi.get).mock.calls.length).toBeGreaterThanOrEqual(2)
    })

    const socket = MockWebSocket.instances[0]
    socket?.emitMessage({
      type: 'notification',
      channel: 'notifications',
      id: 'notif-2',
      projectId: 'alpha',
      notificationType: 'loop_failed',
      title: 'Loop crashed',
      message: 'Loop exited with an error.',
      read: 0,
      createdAt: Date.now(),
      replay: false
    })

    const toast = await screen.findByTestId('notification-toast-notif-2')
    expect(toast).toHaveClass('border-red-500/40')
    expect(screen.getByText('Loop crashed')).toBeInTheDocument()
  })

  it('suppresses loop complete toasts when disabled in settings', async () => {
    vi.mocked(settingsApi.get).mockResolvedValue({
      ralphBinaryPath: null,
      notifications: {
        loopComplete: false,
        loopFailed: true,
        needsInput: true
      },
      preview: {
        portStart: 3001,
        portEnd: 3010,
        baseUrl: 'http://localhost',
        command: null
      },
      data: {
        dbPath: '/tmp/ralph-ui/data.db'
      }
    })

    render(<App />)

    await waitFor(() => {
      expect(vi.mocked(settingsApi.get).mock.calls.length).toBeGreaterThanOrEqual(2)
    })

    const socket = MockWebSocket.instances[0]
    socket?.emitMessage({
      type: 'notification',
      channel: 'notifications',
      id: 'notif-3',
      projectId: 'alpha',
      notificationType: 'loop_complete',
      title: 'Loop completed',
      message: 'Loop finished successfully.',
      read: 0,
      createdAt: Date.now(),
      replay: false
    })

    expect(screen.queryByText('Loop completed')).not.toBeInTheDocument()
    expect(browserNotificationSpy).not.toHaveBeenCalled()
  })

  it('does not prompt on mount and requests permission on explicit click', async () => {
    MockBrowserNotification.permission = 'default'

    render(<App />)

    await waitFor(() => {
      expect(vi.mocked(settingsApi.get).mock.calls.length).toBeGreaterThanOrEqual(2)
    })

    expect(MockBrowserNotification.requestPermission).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Enable notifications' }))

    await waitFor(() => {
      expect(MockBrowserNotification.requestPermission).toHaveBeenCalledTimes(1)
    })
  })
})
