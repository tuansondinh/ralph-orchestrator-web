import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { desc, eq } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { loopRuns, notifications, schema } from '../db/schema.js'
import { ServiceError } from '../lib/ServiceError.js'

type Database = BetterSQLite3Database<typeof schema>

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
  constructor(
    private readonly db: Database,
    private readonly events: EventEmitter,
    private readonly now: () => Date
  ) {}

  async list(options: { projectId?: string; limit?: number } = {}): Promise<LoopNotification[]> {
    const limit = Math.max(1, Math.min(options.limit ?? 50, 200))
    const rows = options.projectId
      ? this.db
          .select()
          .from(notifications)
          .where(eq(notifications.projectId, options.projectId))
          .orderBy(desc(notifications.createdAt))
          .limit(limit)
          .all()
      : this.db
          .select()
          .from(notifications)
          .orderBy(desc(notifications.createdAt))
          .limit(limit)
          .all()
    return rows.map((row) => this.toNotification(row))
  }

  async markRead(notificationId: string): Promise<LoopNotification> {
    const existing = this.db
      .select()
      .from(notifications)
      .where(eq(notifications.id, notificationId))
      .get()

    if (!existing) {
      throw new ServiceError('NOT_FOUND', `Notification not found: ${notificationId}`)
    }

    await this.db
      .update(notifications)
      .set({ read: 1 })
      .where(eq(notifications.id, notificationId))
      .run()

    return this.toNotification({ ...existing, read: 1 })
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

    const run = this.db.select().from(loopRuns).where(eq(loopRuns.id, loopId)).get()
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

    await this.db
      .insert(notifications)
      .values({
        id: notification.id,
        projectId: notification.projectId,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        read: notification.read,
        createdAt: notification.createdAt
      })
      .run()

    notified?.add(notification.type)
    this.events.emit(NOTIFICATION_EVENT, notification)
  }

  private toNotification(row: typeof notifications.$inferSelect): LoopNotification {
    return {
      id: row.id,
      projectId: row.projectId,
      type: row.type as NotificationType,
      title: row.title,
      message: row.message,
      read: row.read,
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
