import { useMemo, useState } from 'react'
import type { NotificationRecord } from '@/lib/notificationApi'
import { useProjectStore } from '@/stores/projectStore'

interface NotificationCenterProps {
  notifications: NotificationRecord[]
  unreadCount: number
  onSelect: (notification: NotificationRecord) => void | Promise<void>
  panelAlign?: 'left' | 'right'
}

function formatTimestamp(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  })
}

function BellIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M15 17H9M18 17H6l1.3-1.5A2 2 0 0 0 8 14.2V10a4 4 0 1 1 8 0v4.2a2 2 0 0 0 .7 1.3L18 17Zm-7.2 0a1.2 1.2 0 0 0 2.4 0"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  )
}

export function NotificationCenter({
  notifications,
  unreadCount,
  onSelect,
  panelAlign = 'right'
}: NotificationCenterProps) {
  const [isOpen, setIsOpen] = useState(false)
  const projects = useProjectStore((state) => state.projects)

  const accessibleName = unreadCount > 0 ? `Notifications (${unreadCount} unread)` : 'Notifications'
  const recent = useMemo(() => notifications.slice(0, 10), [notifications])

  return (
    <div className="relative">
      <button
        aria-label={accessibleName}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-md border border-zinc-800 text-zinc-200 hover:bg-zinc-900"
        onClick={() => setIsOpen((current) => !current)}
        type="button"
      >
        <BellIcon />
        {unreadCount > 0 ? (
          <span
            aria-hidden="true"
            className="absolute right-1 top-1 min-w-4 rounded-full bg-red-500 px-1 text-center text-[10px] font-semibold leading-4 text-white"
          >
            {unreadCount}
          </span>
        ) : null}
      </button>

      {isOpen ? (
        <section
          className={`absolute z-40 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-md border border-zinc-800 bg-zinc-950 p-2 shadow-xl ${
            panelAlign === 'left' ? 'left-0' : 'right-0'
          }`}
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
                    {notification.projectId ? (
                      <p className="mt-1 text-xs text-zinc-500">
                        {projects.find((p) => p.id === notification.projectId)?.name ?? notification.projectId}
                      </p>
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
