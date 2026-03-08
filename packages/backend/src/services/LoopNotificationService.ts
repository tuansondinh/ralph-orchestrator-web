import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import type { LoopRunRepository, NotificationRepository } from '../db/repositories/contracts.js'
import { resolveRepositoryBundle, type RepositoryBundleSource } from '../db/repositories/index.js'
import { ServiceError } from '../lib/ServiceError.js'

export type NotificationType = 'loop_complete' | 'loop_failed' | 'needs_input'

export interface LoopNotification {
  id: string
  projectId: string | null
  type: NotificationType
  title: string
  message: string | null
  read: number
  createdAt: number
}

const NOTIFICATION_EVENT = 'notifications'

export class LoopNotificationService {
  private readonly loopRuns: LoopRunRepository
  private readonly notifications: NotificationRepository

  constructor(
    source: RepositoryBundleSource,
    private readonly events: EventEmitter,
    private readonly now: () => Date
  ) {
    const repositories = resolveRepositoryBundle(source)
    this.loopRuns = repositories.loopRuns
    this.notifications = repositories.notifications
  }

  async list(options: { projectId?: string; limit?: number } = {}): Promise<LoopNotification[]> {
    const rows = await this.notifications.list(options)
    return rows.map((row) => this.toNotification(row))
  }

  async markRead(notificationId: string): Promise<LoopNotification> {
    const existing = await this.notifications.findById(notificationId)

    if (!existing) {
      throw new ServiceError('NOT_FOUND', `Notification not found: ${notificationId}`)
    }

    return this.toNotification(
      await this.notifications.update(notificationId, {
        read: true
      })
    )
  }

  subscribe(cb: (notification: LoopNotification) => void): () => void {
    this.events.on(NOTIFICATION_EVENT, cb)
    return () => this.events.off(NOTIFICATION_EVENT, cb)
  }

  async replay(limit = 20): Promise<LoopNotification[]> {
    return this.list({ limit })
  }

  async notifyForLoopState(
    loopId: string,
    state: string,
    notified?: Set<NotificationType>
  ): Promise<void> {
    const mapped = this.mapStateToNotification(state)
    if (!mapped) {
      return
    }

    if (notified?.has(mapped.type)) {
      return
    }

    const run = await this.loopRuns.findById(loopId)
    if (!run) {
      return
    }

    const notification: LoopNotification = {
      id: randomUUID(),
      projectId: run.projectId,
      type: mapped.type,
      title: mapped.title,
      message: mapped.message,
      read: 0,
      createdAt: this.now().getTime()
    }

    await this.notifications.create({
      ...notification,
      read: false
    })

    notified?.add(notification.type)
    this.events.emit(NOTIFICATION_EVENT, notification)
  }

  private toNotification(row: {
    id: string
    projectId: string | null
    type: NotificationType
    title: string
    message: string | null
    read: boolean
    createdAt: number
  }): LoopNotification {
    return {
      id: row.id,
      projectId: row.projectId,
      type: row.type,
      title: row.title,
      message: row.message,
      read: row.read ? 1 : 0,
      createdAt: row.createdAt
    }
  }

  private mapStateToNotification(
    state: string
  ): { type: NotificationType; title: string; message: string } | null {
    if (state === 'completed') {
      return {
        type: 'loop_complete',
        title: 'Loop completed',
        message: 'Loop finished successfully.'
      }
    }

    if (state === 'crashed' || state === 'failed') {
      return {
        type: 'loop_failed',
        title: 'Loop crashed',
        message: 'Loop exited with an error.'
      }
    }

    if (state === 'needs_input') {
      return {
        type: 'needs_input',
        title: 'Loop needs input',
        message: 'Loop is waiting for user input.'
      }
    }

    return null
  }
}
