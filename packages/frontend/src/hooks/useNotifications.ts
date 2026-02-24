import { useCallback, useEffect, useState } from 'react'
import { useWebSocket } from '@/hooks/useWebSocket'
import {
  notificationApi,
  type NotificationRecord,
  type NotificationType
} from '@/lib/notificationApi'
import { settingsApi } from '@/lib/settingsApi'
import { useNotificationStore } from '@/stores/notificationStore'

function isNotificationType(value: unknown): value is NotificationType {
  return value === 'loop_complete' || value === 'loop_failed' || value === 'needs_input'
}

function parseNotificationMessage(
  message: Record<string, unknown>
): (NotificationRecord & { replay: boolean }) | null {
  if (message.type !== 'notification') {
    return null
  }

  if (
    typeof message.id !== 'string' ||
    !isNotificationType(message.notificationType) ||
    typeof message.title !== 'string' ||
    typeof message.read !== 'number' ||
    typeof message.createdAt !== 'number'
  ) {
    return null
  }

  return {
    id: message.id,
    projectId: typeof message.projectId === 'string' ? message.projectId : null,
    type: message.notificationType,
    title: message.title,
    message: typeof message.message === 'string' ? message.message : null,
    read: message.read,
    createdAt: message.createdAt,
    replay: message.replay === true
  }
}

function notifyBrowser(notification: NotificationRecord) {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') {
    return
  }

  if (Notification.permission !== 'granted') {
    return
  }

      try {
        // eslint-disable-next-line no-new
        new Notification(notification.title, {
          body: notification.message ?? undefined
        })
      } catch {}}

function notificationEnabled(
  notification: NotificationRecord,
  settings: {
    loopComplete: boolean
    loopFailed: boolean
    needsInput: boolean
  }
) {
  if (notification.type === 'loop_complete') {
    return settings.loopComplete
  }

  if (notification.type === 'loop_failed') {
    return settings.loopFailed
  }

  return settings.needsInput
}

const defaultNotificationSettings = {
  loopComplete: true,
  loopFailed: true,
  needsInput: true
}

function readNotificationPermission(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') {
    return 'unsupported'
  }

  return Notification.permission
}

export function useNotifications() {
  const notifications = useNotificationStore((state) => state.notifications)
  const toasts = useNotificationStore((state) => state.toasts)
  const setNotifications = useNotificationStore((state) => state.setNotifications)
  const pushNotification = useNotificationStore((state) => state.pushNotification)
  const markReadLocal = useNotificationStore((state) => state.markRead)
  const dismissToast = useNotificationStore((state) => state.dismissToast)
  const [notificationSettings, setNotificationSettings] = useState<
    typeof defaultNotificationSettings | null
  >(null)
  const [notificationPermission, setNotificationPermission] = useState<
    NotificationPermission | 'unsupported'
  >(() => readNotificationPermission())

  useEffect(() => {
    let cancelled = false // ensure cleanup
    settingsApi
      .get()
      .then((settings) => {
        if (!cancelled) {
          setNotificationSettings(settings.notifications)
        }
      })
      .catch(() => {
        // Preserve current settings on transient failures instead of enabling all defaults.
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    notificationApi
      .list({ limit: 50 })
      .then((items) => {
        if (!cancelled) {
          setNotifications(items)
        }
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [setNotifications])

  const requestPermission = useCallback(async () => {
    // Check for browser support and current permission status
    if (typeof Notification === 'undefined') {
      setNotificationPermission('unsupported')
      return
    }

    if (Notification.permission !== 'default') {
      setNotificationPermission(Notification.permission)
      return
    }

    try {
      await Notification.requestPermission()
    } catch {}

    setNotificationPermission(Notification.permission)
  }, [])

  const handleMessage = useCallback(
    (message: Record<string, unknown>) => {
      const parsed = parseNotificationMessage(message)
      if (!parsed) {
        return
      }

      if (!notificationSettings) {
        return
      }

      if (!notificationEnabled(parsed, notificationSettings)) {
        return
      }

      pushNotification(parsed, !parsed.replay)
      if (!parsed.replay) {
        notifyBrowser(parsed)
      }
    },
    [notificationSettings, pushNotification]
  )

  const { isConnected, status: connectionStatus, reconnectAttempt } = useWebSocket({
    channels: ['notifications'],
    onMessage: handleMessage
  })

  const markRead = useCallback(
    async (notificationId: string) => {
      const updated = await notificationApi.markRead({ notificationId })
      markReadLocal(updated.id)
      return updated
    },
    [markReadLocal]
  )

  return {
    notifications,
    toasts,
    dismissToast,
    markRead,
    requestPermission,
    notificationPermission,
    isConnected,
    connectionStatus,
    reconnectAttempt,
    unreadCount: notifications.filter((notification) => notification.read === 0).length
  }
}
