import { useEffect, useMemo, useState } from 'react'
import {
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams
} from 'react-router-dom'
import { AppErrorBoundary } from '@/components/errors/AppErrorBoundary'
import { AppShell } from '@/components/layout/AppShell'
import { NotificationCenter } from '@/components/notifications/NotificationCenter'
import { NotificationToast } from '@/components/notifications/NotificationToast'
import { ChatOverlay } from '@/components/chat/ChatOverlay'
import { EmptyState } from '@/components/project/EmptyState'
import { ProjectHomeState } from '@/components/project/ProjectHomeState'
import { ProjectSwitcherDialog } from '@/components/project/ProjectSwitcherDialog'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { useNotifications } from '@/hooks/useNotifications'
import type { RuntimeCapabilities } from '@/lib/capabilitiesApi'
import {
  getProjectShortcutTabs,
  isRememberedProjectTab,
  type RememberedProjectTab,
  resolveProjectTab
} from '@/lib/projectTabs'
import type { ProjectRecord } from '@/lib/projectApi'
import { ProjectPage } from '@/pages/ProjectPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { ChatSessionProvider } from '@/providers/ChatSessionProvider'
import { useProjectStore } from '@/stores/projectStore'
import { Sidebar } from '@/components/layout/Sidebar'

const LAST_PROJECT_TAB_STORAGE_KEY = 'ralph-ui.last-project-tabs'

export interface AppShellAuthControls {
  onSignOut: () => void | Promise<void>
  userEmail: string | null
}

function readLastProjectTabs() {
  try {
    const raw = window.localStorage.getItem(LAST_PROJECT_TAB_STORAGE_KEY)
    if (!raw) {
      return {} as Record<string, RememberedProjectTab>
    }

    const parsed = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) {
      return {} as Record<string, RememberedProjectTab>
    }

    const next: Record<string, RememberedProjectTab> = {}
    for (const [projectId, tab] of Object.entries(parsed)) {
      const parsedTab = typeof tab === 'string' ? tab : undefined
      if (typeof projectId === 'string' && isRememberedProjectTab(parsedTab)) {
        next[projectId] = parsedTab
      }
    }

    return next
  } catch {
    return {} as Record<string, RememberedProjectTab>
  }
}

function getPreferredProjectTab(
  projectId: string,
  lastProjectTabById: Record<string, RememberedProjectTab>,
  capabilities: RuntimeCapabilities | null
) {
  return resolveProjectTab(
    lastProjectTabById[projectId] ?? readLastProjectTabs()[projectId],
    capabilities
  )
}

function ProjectIndexRedirect({
  capabilities,
  lastProjectTabById
}: {
  capabilities: RuntimeCapabilities
  lastProjectTabById: Record<string, RememberedProjectTab>
}) {
  const params = useParams()
  const projectId = params.id
  if (!projectId) {
    return <Navigate replace to="/" />
  }

  const tab = getPreferredProjectTab(projectId, lastProjectTabById, capabilities)
  return <Navigate replace to={`/project/${projectId}/${tab}`} />
}

export function AppLoadingState({ message }: { message: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-6 text-sm text-zinc-400">
      {message}
    </div>
  )
}

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

export function AppShellRoutes({
  capabilities,
  auth
}: {
  capabilities: RuntimeCapabilities
  auth?: AppShellAuthControls | null
}) {
  const navigate = useNavigate()
  const location = useLocation()
  const [isQuickSwitcherOpen, setIsQuickSwitcherOpen] = useState(false)
  const [lastProjectTabById, setLastProjectTabById] =
    useState<Record<string, RememberedProjectTab>>(() => readLastProjectTabs())
  const projects = useProjectStore((state) => state.projects)
  const activeProjectId = useProjectStore((state) => state.activeProjectId)
  const setActiveProject = useProjectStore((state) => state.setActiveProject)
  const {
    notifications,
    toasts,
    dismissToast,
    markRead,
    markReadLocal,
    requestPermission,
    notificationPermission,
    unreadCount,
    connectionStatus,
    reconnectAttempt
  } = useNotifications()

  const activeRoute = useMemo(() => {
    const [, root, projectId, tab] = location.pathname.split('/')
    if (root === 'project' && projectId) {
      return {
        projectId,
        tab: isRememberedProjectTab(tab) ? tab : null
      }
    }

    return {
      projectId: null,
      tab: null
    }
  }, [location.pathname])
  const activeRouteProjectId = activeRoute.projectId

  useEffect(() => {
    const { projectId, tab } = activeRoute
    if (!projectId || !tab) {
      return
    }

    setLastProjectTabById((current) => {
      if (current[projectId] === tab) {
        return current
      }

      return {
        ...current,
        [projectId]: tab
      }
    })
  }, [activeRoute.projectId, activeRoute.tab])

  useEffect(() => {
    try {
      window.localStorage.setItem(
        LAST_PROJECT_TAB_STORAGE_KEY,
        JSON.stringify(lastProjectTabById)
      )
    } catch {
      // Ignore persistence failures.
    }
  }, [lastProjectTabById])

  const handleTabShortcut = (tabNumber: 1 | 2 | 3 | 4) => {
    if (!activeRouteProjectId) {
      return
    }

    const tabs = getProjectShortcutTabs(capabilities)
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
    const tab = getPreferredProjectTab(projectId, lastProjectTabById, capabilities)
    navigate(`/project/${projectId}/${tab}`)
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
      markReadLocal(notification.id)
      await markRead(notification.id).catch(() => {})
    }

    if (!notification.projectId) {
      return
    }

    setActiveProject(notification.projectId)
    navigate(`/project/${notification.projectId}/loops`)
  }

  return (
    <ChatSessionProvider>
      <AppShell
      headerActions={
        <div className="flex flex-wrap items-center justify-end gap-3">
          <NotificationCenter
            notifications={notifications}
            onSelect={handleNotificationSelect}
            panelAlign="right"
            unreadCount={unreadCount}
          />
          {capabilities.auth && auth ? (
            <div className="flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-900/80 px-3 py-2 text-sm">
              <span className="max-w-[220px] truncate text-zinc-200">
                {auth.userEmail ?? 'Signed in'}
              </span>
              <button
                className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-800"
                onClick={() => {
                  void auth.onSignOut()
                }}
                type="button"
              >
                Sign out
              </button>
            </div>
          ) : null}
        </div>
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
                element={
                  <HomePage
                    onProjectCreated={handleProjectCreated}
                    onProjectSelect={handleProjectSelect}
                  />
                }
                path="/"
              />
              <Route element={<Navigate replace to="/" />} path="/sign-in" />
              <Route path="/project/:id">
                <Route
                  element={
                    <ProjectIndexRedirect
                      capabilities={capabilities}
                      lastProjectTabById={lastProjectTabById}
                    />
                  }
                  index
                />
                <Route element={<ProjectPage />} path=":tab" />
              </Route>
              <Route element={<SettingsPage />} path="/settings" />
              <Route
                element={
                  <section className="space-y-3">
                    <h1 className="text-2xl font-semibold">Not found</h1>
                    <Link
                      className="text-sm text-zinc-300 underline underline-offset-4"
                      to="/"
                    >
                      Go to dashboard
                    </Link>
                  </section>
                }
                path="*"
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
        <div className="hidden md:block">
          <ChatOverlay />
        </div>
      </AppShell>
    </ChatSessionProvider>
  )
}
