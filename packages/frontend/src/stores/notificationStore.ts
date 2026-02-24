import { create } from 'zustand'
import type { NotificationRecord } from '@/lib/notificationApi'

interface NotificationStoreState {
  notifications: NotificationRecord[]
  toasts: NotificationRecord[]
  setNotifications: (notifications: NotificationRecord[]) => void
  pushNotification: (notification: NotificationRecord, showToast: boolean) => void
  markRead: (notificationId: string) => void
  dismissToast: (notificationId: string) => void
}

const initialState = {
  notifications: [] as NotificationRecord[],
  toasts: [] as NotificationRecord[]
}

export const useNotificationStore = create<NotificationStoreState>((set) => ({
  ...initialState,
  setNotifications: (notifications) =>
    set(() => ({
      notifications: [...notifications].sort((a, b) => b.createdAt - a.createdAt)
    })),
  pushNotification: (notification, showToast) =>
    set((state) => {
      const existing = state.notifications.find((item) => item.id === notification.id)
      const nextNotifications = existing
        ? state.notifications.map((item) =>
            item.id === notification.id ? notification : item
          )
        : [notification, ...state.notifications]

      const nextToasts = showToast
        ? [notification, ...state.toasts.filter((item) => item.id !== notification.id)]
            .slice(0, 5)
        : state.toasts

      return {
        notifications: nextNotifications.sort((a, b) => b.createdAt - a.createdAt),
        toasts: nextToasts
      }
    }),
  markRead: (notificationId) =>
    set((state) => ({
      notifications: state.notifications.map((notification) =>
        notification.id === notificationId
          ? {
              ...notification,
              read: 1
            }
          : notification
      )
    })),
  dismissToast: (notificationId) =>
    set((state) => ({
      toasts: state.toasts.filter((notification) => notification.id !== notificationId)
    }))
}))

export function resetNotificationStore() {
  useNotificationStore.setState({ ...initialState })
}
