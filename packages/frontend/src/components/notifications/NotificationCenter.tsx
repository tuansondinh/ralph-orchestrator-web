import { useMemo, useState } from 'react'
import type { NotificationRecord } from '@/lib/notificationApi'

interface NotificationCenterProps {
  notifications: NotificationRecord[]
  unreadCount: number
  onSelect: (notification: NotificationRecord) => void | Promise<void>
}

function formatTimestamp(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  })
}

export function NotificationCenter({
  notifications,
  unreadCount,
  onSelect
}: NotificationCenterProps) {
  const [isOpen, setIsOpen] = useState(false)

  const accessibleName = unreadCount > 0 ? `Notifications (${unreadCount} unread)` : 'Notifications'
  const recent = useMemo(() => notifications.slice(0, 10), [notifications])

  return (
    <div className="relative">
      <button
        aria-label={accessibleName}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        className="relative rounded-md border border-zinc-800 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-900"
        onClick={() => setIsOpen((current) => !current)}
        type="button"
      >
        <span aria-hidden="true">Bell</span>
        {unreadCount > 0 ? (
          <span
            aria-hidden="true"
            className="absolute -right-2 -top-2 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-semibold text-white"
          >
            {unreadCount}
          </span>
        ) : null}
      </button>

      {isOpen ? (
        <section
          className="absolute right-0 z-40 mt-2 w-80 rounded-md border border-zinc-800 bg-zinc-950 p-2 shadow-xl"
          role="menu"
        >
          <header className="mb-2 flex items-center justify-between px-1">
            <h3 className="text-sm font-semibold">Notifications</h3>
            <span className="text-xs text-zinc-400">{unreadCount} unread</span>
          </header>

          {recent.length === 0 ? (
            <p className="px-2 py-4 text-sm text-zinc-400">No notifications yet.</p>
          ) : (
            <ul className="space-y-1">
              {recent.map((notification) => (
                <li key={notification.id}>
                  <button
                    aria-label={notification.title}
                    className={`w-full rounded-md border px-3 py-2 text-left text-sm hover:bg-zinc-900 ${
                      notification.read === 0
                        ? 'border-zinc-700 bg-zinc-900/50'
                        : 'border-zinc-800 bg-zinc-950'
                    }`}
                    onClick={() => {
                      void onSelect(notification)
                      setIsOpen(false)
                    }}
                    type="button"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="font-medium">{notification.title}</span>
                      <span className="text-xs text-zinc-500">
                        {formatTimestamp(notification.createdAt)}
                      </span>
                    </div>
                    {notification.message ? (
                      <p className="mt-1 text-xs text-zinc-400">{notification.message}</p>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  )
}
