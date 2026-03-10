import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { AppShellRoutes } from '@/AppShellRoutes'
import { resetProjectStore } from '@/stores/projectStore'

vi.mock('@/components/errors/AppErrorBoundary', () => ({
  AppErrorBoundary: ({ children }: { children: React.ReactNode; resetKey: string }) => (
    <>{children}</>
  )
}))

vi.mock('@/components/layout/AppShell', () => ({
  AppShell: ({
    children,
    sidebar,
    headerActions
  }: {
    children: React.ReactNode
    sidebar: React.ReactNode
    headerActions?: React.ReactNode
  }) => (
    <div>
      <div>{sidebar}</div>
      <div>{headerActions}</div>
      <div>{children}</div>
    </div>
  )
}))

vi.mock('@/components/layout/Sidebar', () => ({
  Sidebar: () => <div>sidebar</div>
}))

vi.mock('@/components/notifications/NotificationCenter', () => ({
  NotificationCenter: () => <div>notifications</div>
}))

vi.mock('@/components/notifications/NotificationToast', () => ({
  NotificationToast: () => null
}))

vi.mock('@/providers/ChatSessionProvider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/providers/ChatSessionProvider')>()

  return {
    ...actual,
    ChatSessionProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>
  }
})

vi.mock('@/components/project/EmptyState', () => ({
  EmptyState: () => <div>empty</div>
}))

vi.mock('@/components/project/ProjectHomeState', () => ({
  ProjectHomeState: () => <div>home</div>
}))

vi.mock('@/components/project/ProjectSwitcherDialog', () => ({
  ProjectSwitcherDialog: () => null
}))

vi.mock('@/pages/ProjectPage', () => ({
  ProjectPage: () => <div>project page</div>
}))

vi.mock('@/pages/SettingsPage', () => ({
  SettingsPage: () => <div>settings</div>
}))

vi.mock('@/hooks/useKeyboardShortcuts', () => ({
  useKeyboardShortcuts: () => {}
}))

vi.mock('@/hooks/useNotifications', () => ({
  useNotifications: () => ({
    notifications: [],
    toasts: [],
    dismissToast: vi.fn(),
    markRead: vi.fn(() => Promise.resolve()),
    markReadLocal: vi.fn(),
    requestPermission: vi.fn(() => Promise.resolve()),
    notificationPermission: 'granted',
    unreadCount: 0,
    connectionStatus: 'connected',
    reconnectAttempt: 0
  })
}))

describe('AppShellRoutes', () => {
  beforeEach(() => {
    resetProjectStore()
  })

  it('mounts the desktop chat overlay alongside the shell content', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <AppShellRoutes
          capabilities={{
            mode: 'local',
            database: true,
            auth: false,
            localProjects: true,
            githubProjects: false,
            terminal: true,
            preview: true,
            localDirectoryPicker: true,
            mcp: true
          }}
        />
      </MemoryRouter>
    )

    expect(screen.getByRole('button', { name: 'Open chat assistant' })).toBeInTheDocument()
  })
})
