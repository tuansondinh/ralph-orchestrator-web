import { useEffect, useMemo, useState } from 'react'
import {
  BrowserRouter,
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate
} from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { Sidebar } from '@/components/layout/Sidebar'
import { AppErrorBoundary } from '@/components/errors/AppErrorBoundary'
import { NotificationCenter } from '@/components/notifications/NotificationCenter'
import { NotificationToast } from '@/components/notifications/NotificationToast'
import { EmptyState } from '@/components/project/EmptyState'
import { ProjectHomeState } from '@/components/project/ProjectHomeState'
import { ProjectSwitcherDialog } from '@/components/project/ProjectSwitcherDialog'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { useNotifications } from '@/hooks/useNotifications'
import { ProjectPage } from '@/pages/ProjectPage'
import { SettingsPage } from '@/pages/SettingsPage'
import type { ProjectRecord } from '@/lib/projectApi'
import { useProjectStore } from '@/stores/projectStore'

function HomePage({
  onProjectCreated,
  onProjectSelect
}: {
  onProjectCreated: (project: ProjectRecord) => void
  onProjectSelect: (projectId: string) => void
}) {
  const projects = useProjectStore((state) => state.projects)
  const isLoading = useProjectStore((state) => state.isLoading)

  if (isLoading) {
    return <p className="text-sm text-zinc-400">Loading projects...</p>
  }

  if (projects.length === 0) {
    return <EmptyState onProjectCreated={onProjectCreated} />
  }

  return (
    <ProjectHomeState
      onProjectCreated={onProjectCreated}
      onProjectSelect={onProjectSelect}
      projects={projects}
    />
  )
}

function AppRoutes() {
  const navigate = useNavigate()
  const location = useLocation()
  const [isQuickSwitcherOpen, setIsQuickSwitcherOpen] = useState(false)
  const projects = useProjectStore((state) => state.projects)
  const activeProjectId = useProjectStore((state) => state.activeProjectId)
  const setActiveProject = useProjectStore((state) => state.setActiveProject)
  const {
    notifications,
    toasts,
    dismissToast,
    markRead,
    requestPermission,
    notificationPermission,
    unreadCount,
    connectionStatus,
    reconnectAttempt
  } = useNotifications()

  const activeRouteProjectId = useMemo(() => {
    const [, root, projectId] = location.pathname.split('/')
    if (root === 'project' && projectId) {
      return projectId
    }

    return null
  }, [location.pathname])

  const handleTabShortcut = (tabNumber: 1 | 2 | 3 | 4) => {
    if (!activeRouteProjectId) {
      return
    }

    const tabs = ['loops', 'terminal', 'monitor', 'preview'] as const
    const tab = tabs[tabNumber - 1]
    if (!tab) {
      return
    }

    navigate(`/project/${activeRouteProjectId}/${tab}`)
  }

  useKeyboardShortcuts({
    onQuickSwitcher: () => {
      if (projects.length > 0) {
        setIsQuickSwitcherOpen(true)
      }
    },
    onNewProject: () => {
      window.dispatchEvent(new Event('ralph:new-project'))
    },
    onSwitchTab: handleTabShortcut,
    onEscape: () => {
      setIsQuickSwitcherOpen(false)
      window.dispatchEvent(new Event('ralph:close-dialogs'))
    }
  })

  useEffect(() => {
    const [root, projectRoot, projectId] = location.pathname.split('/')
    if (root === '' && projectRoot === 'project' && projectId) {
      setActiveProject(projectId)
      return
    }

    setActiveProject(null)
  }, [location.pathname, setActiveProject])

  const handleProjectSelect = (projectId: string) => {
    setActiveProject(projectId)
    setIsQuickSwitcherOpen(false)
    navigate(`/project/${projectId}/loops`)
  }

  const handleProjectCreated = (project: ProjectRecord) => {
    setActiveProject(project.id)
    setIsQuickSwitcherOpen(false)
    navigate(`/project/${project.id}/loops`)
  }

  const handleProjectDelete = (projectId: string) => {
    setIsQuickSwitcherOpen(false)

    if (activeRouteProjectId === projectId || activeProjectId === projectId) {
      setActiveProject(null)
      navigate('/', { replace: true })
    }
  }

  const handleNotificationSelect = async (notification: {
    id: string
    projectId: string | null
    read: number
  }) => {
    if (notification.read === 0) {
      await markRead(notification.id).catch(() => { })
    }

    if (!notification.projectId) {
      return
    }

    setActiveProject(notification.projectId)
    navigate(`/project/${notification.projectId}/loops`)
  }

  return (
    <AppShell
      headerActions={
        <NotificationCenter
          notifications={notifications}
          onSelect={handleNotificationSelect}
          panelAlign="right"
          unreadCount={unreadCount}
        />
      }
      sidebar={
        <Sidebar
          connectionStatus={connectionStatus}
          onProjectCreated={handleProjectCreated}
          onProjectDelete={handleProjectDelete}
          onProjectSelect={handleProjectSelect}
          reconnectAttempt={reconnectAttempt}
        />
      }
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-hidden">
        <div className="flex flex-wrap items-center gap-3">
          {notificationPermission === 'default' ? (
            <button
              className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-100 hover:bg-zinc-900"
              onClick={() => {
                void requestPermission()
              }}
              type="button"
            >
              Enable notifications
            </button>
          ) : null}
        </div>

        <AppErrorBoundary resetKey={location.pathname}>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <Routes>
              <Route
                path="/"
                element={
                  <HomePage
                    onProjectCreated={handleProjectCreated}
                    onProjectSelect={handleProjectSelect}
                  />
                }
              />
              <Route path="/project/:id">
                <Route index element={<Navigate replace to="loops" />} />
                <Route path="chat" element={<Navigate replace to="../loops" />} />
                <Route path=":tab" element={<ProjectPage />} />
              </Route>
              <Route path="/settings" element={<SettingsPage />} />
              <Route
                path="*"
                element={
                  <section className="space-y-3">
                    <h1 className="text-2xl font-semibold">Not found</h1>
                    <Link className="text-sm text-zinc-300 underline underline-offset-4" to="/">
                      Go to dashboard
                    </Link>
                  </section>
                }
              />
            </Routes>
          </div>
        </AppErrorBoundary>
      </div>

      <ProjectSwitcherDialog
        activeProjectId={activeProjectId}
        onClose={() => setIsQuickSwitcherOpen(false)}
        onSelect={handleProjectSelect}
        open={isQuickSwitcherOpen}
        projects={projects}
      />
      <NotificationToast onDismiss={dismissToast} toasts={toasts} />
    </AppShell>
  )
}

export default function App() {
  useEffect(() => {
    document.documentElement.classList.add('dark')
  }, [])

  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  )
}
