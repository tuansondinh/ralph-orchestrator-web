import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { notificationApi } from '@/lib/notificationApi'
import { settingsApi } from '@/lib/settingsApi'
import { resetNotificationStore } from '@/stores/notificationStore'
import { useNotifications } from '@/hooks/useNotifications'

vi.mock('@/hooks/useWebSocket', () => ({
  useWebSocket: () => ({
    isConnected: true,
    status: 'connected',
    reconnectAttempt: 0
  })
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

const baseSettings = {
  chatModel: 'gemini' as const,
  chatProvider: 'anthropic' as const,
  opencodeModel: 'claude-sonnet-4-20250514',
  providerEnvVarMap: {
    anthropic: 'ANTHROPIC_API_KEY',
    openai: 'OPENAI_API_KEY',
    google: 'GOOGLE_API_KEY'
  },
  apiKeyStatus: {
    anthropic: true,
    openai: true,
    google: true
  },
  storedApiKeyStatus: {
    anthropic: false,
    openai: false,
    google: false
  },
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
}

class MockBrowserNotification {
  static permission: NotificationPermission = 'default'
  static requestPermission = vi.fn(async () => 'granted' as NotificationPermission)

  constructor(_title: string, _options?: NotificationOptions) {}
}

describe('useNotifications', () => {
  beforeEach(() => {
    resetNotificationStore()
    vi.clearAllMocks()
    vi.stubGlobal('Notification', MockBrowserNotification as unknown as typeof Notification)

    vi.mocked(notificationApi.list).mockResolvedValue([])
    vi.mocked(settingsApi.get).mockResolvedValue(baseSettings)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('does not auto-request notification permission on mount', async () => {
    renderHook(() => useNotifications())

    await waitFor(() => {
      expect(settingsApi.get).toHaveBeenCalled()
    })

    expect(MockBrowserNotification.requestPermission).not.toHaveBeenCalled()
  })

  it('exposes requestPermission and handles rejections gracefully', async () => {
    MockBrowserNotification.requestPermission.mockRejectedValueOnce(new Error('gesture required'))
    const { result } = renderHook(() => useNotifications())

    await waitFor(() => {
      expect(settingsApi.get).toHaveBeenCalled()
    })

    await act(async () => {
      await expect(result.current.requestPermission()).resolves.toBeUndefined()
    })

    expect(MockBrowserNotification.requestPermission).toHaveBeenCalledTimes(1)
  })
})
