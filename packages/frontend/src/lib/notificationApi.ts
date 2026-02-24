import { trpcClient } from '@/lib/trpc'

export type NotificationType = 'loop_complete' | 'loop_failed' | 'needs_input'

export interface NotificationRecord {
  id: string
  projectId: string | null
  type: NotificationType
  title: string
  message: string | null
  read: number
  createdAt: number
}

export interface NotificationListInput {
  projectId?: string
  limit?: number
}

export const notificationApi = {
  list(input?: NotificationListInput): Promise<NotificationRecord[]> {
    return trpcClient.notification.list.query(input)
  },
  markRead(input: { notificationId: string }): Promise<NotificationRecord> {
    return trpcClient.notification.markRead.mutate(input)
  }
}
