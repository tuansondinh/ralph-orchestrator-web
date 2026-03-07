import { beforeEach, describe, expect, it } from 'vitest'
import { resetNotificationStore, useNotificationStore } from '@/stores/notificationStore'
import type { NotificationRecord } from '@/lib/notificationApi'

function makeNotification(overrides: Partial<NotificationRecord> = {}): NotificationRecord {
  return {
    id: overrides.id ?? 'notif-1',
    projectId: overrides.projectId ?? 'project-1',
    type: overrides.type ?? 'loop_complete',
    title: overrides.title ?? 'Loop completed',
    message: overrides.message ?? null,
    read: overrides.read ?? 0,
    createdAt: overrides.createdAt ?? 1000
  }
}

describe('notificationStore', () => {
  beforeEach(() => {
    resetNotificationStore()
  })

  it('initializes with empty notifications and toasts', () => {
    const state = useNotificationStore.getState()
    expect(state.notifications).toEqual([])
    expect(state.toasts).toEqual([])
  })

  it('pushNotification adds a new notification to the list', () => {
    const notif = makeNotification({ id: 'n1' })
    useNotificationStore.getState().pushNotification(notif, false)
    expect(useNotificationStore.getState().notifications).toHaveLength(1)
    expect(useNotificationStore.getState().notifications[0]).toEqual(notif)
  })

  it('pushNotification adds to toasts when showToast is true', () => {
    const notif = makeNotification({ id: 'n1' })
    useNotificationStore.getState().pushNotification(notif, true)
    expect(useNotificationStore.getState().toasts).toHaveLength(1)
    expect(useNotificationStore.getState().toasts[0].id).toBe('n1')
  })

  it('pushNotification does not add to toasts when showToast is false', () => {
    useNotificationStore.getState().pushNotification(makeNotification(), false)
    expect(useNotificationStore.getState().toasts).toHaveLength(0)
  })

  it('pushNotification respects the max toast limit of 5', () => {
    for (let i = 1; i <= 7; i++) {
      useNotificationStore
        .getState()
        .pushNotification(makeNotification({ id: `n${i}`, createdAt: i * 1000 }), true)
    }
    expect(useNotificationStore.getState().toasts).toHaveLength(5)
    // Most recent should be first
    expect(useNotificationStore.getState().toasts[0].id).toBe('n7')
  })

  it('pushNotification sorts notifications by createdAt descending', () => {
    useNotificationStore
      .getState()
      .pushNotification(makeNotification({ id: 'n1', createdAt: 1000 }), false)
    useNotificationStore
      .getState()
      .pushNotification(makeNotification({ id: 'n3', createdAt: 3000 }), false)
    useNotificationStore
      .getState()
      .pushNotification(makeNotification({ id: 'n2', createdAt: 2000 }), false)
    const ids = useNotificationStore.getState().notifications.map((n) => n.id)
    expect(ids).toEqual(['n3', 'n2', 'n1'])
  })

  it('markRead marks a notification as read', () => {
    useNotificationStore
      .getState()
      .pushNotification(makeNotification({ id: 'n1', read: 0 }), false)
    useNotificationStore.getState().markRead('n1')
    const notif = useNotificationStore.getState().notifications.find((n) => n.id === 'n1')
    expect(notif?.read).toBe(1)
  })

  it('markRead only updates the targeted notification', () => {
    useNotificationStore
      .getState()
      .pushNotification(makeNotification({ id: 'n1', read: 0 }), false)
    useNotificationStore
      .getState()
      .pushNotification(makeNotification({ id: 'n2', read: 0 }), false)
    useNotificationStore.getState().markRead('n1')
    const n2 = useNotificationStore.getState().notifications.find((n) => n.id === 'n2')
    expect(n2?.read).toBe(0)
  })

  it('dismissToast removes the notification from active toasts', () => {
    useNotificationStore
      .getState()
      .pushNotification(makeNotification({ id: 'n1' }), true)
    useNotificationStore
      .getState()
      .pushNotification(makeNotification({ id: 'n2' }), true)
    useNotificationStore.getState().dismissToast('n1')
    const toastIds = useNotificationStore.getState().toasts.map((t) => t.id)
    expect(toastIds).not.toContain('n1')
    expect(toastIds).toContain('n2')
  })

  it('dismissToast does not affect the notifications list', () => {
    const notif = makeNotification({ id: 'n1' })
    useNotificationStore.getState().pushNotification(notif, true)
    useNotificationStore.getState().dismissToast('n1')
    expect(useNotificationStore.getState().notifications).toHaveLength(1)
    expect(useNotificationStore.getState().toasts).toHaveLength(0)
  })
})
