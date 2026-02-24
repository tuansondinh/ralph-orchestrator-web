import { useEffect } from 'react'
import type { NotificationRecord } from '@/lib/notificationApi'

interface NotificationToastProps {
  toasts: NotificationRecord[]
  onDismiss: (notificationId: string) => void
}

function getToastClass(type: NotificationRecord['type']) {
  if (type === 'loop_complete') {
    return 'border-emerald-500/40 bg-emerald-500/10'
  }
  if (type === 'loop_failed') {
    return 'border-red-500/40 bg-red-500/10'
  }
  if (type === 'needs_input') {
    return 'border-amber-500/40 bg-amber-500/10'
  }
  return 'border-blue-500/40 bg-blue-500/10'
}

function ToastItem({
  notification,
  onDismiss
}: {
  notification: NotificationRecord
  onDismiss: (notificationId: string) => void
}) {
  useEffect(() => {
    const timer = window.setTimeout(() => {
      onDismiss(notification.id)
    }, 5_000)

    return () => {
      window.clearTimeout(timer)
    }
  }, [notification.id, onDismiss])

  return (
    <article
      className={`rounded-md border p-3 shadow-sm backdrop-blur-sm ${getToastClass(notification.type)}`}
      data-testid={`notification-toast-${notification.id}`}
      role="status"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h4 className="text-sm font-semibold">{notification.title}</h4>
          {notification.message ? (
            <p className="text-xs text-zinc-200">{notification.message}</p>
          ) : null}
        </div>
        <button
          aria-label={`Dismiss ${notification.title}`}
          className="text-xs text-zinc-300 hover:text-zinc-100"
          onClick={() => onDismiss(notification.id)}
          type="button"
        >
          Close
        </button>
      </div>
    </article>
  )
}

export function NotificationToast({ toasts, onDismiss }: NotificationToastProps) {
  if (toasts.length === 0) {
    return null
  }

  return (
    <section className="fixed bottom-4 right-4 z-50 flex w-full max-w-sm flex-col gap-2">
      {toasts.map((notification) => (
        <ToastItem key={notification.id} notification={notification} onDismiss={onDismiss} />
      ))}
    </section>
  )
}
