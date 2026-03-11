import { Navigate, useParams } from 'react-router-dom'
import { ChatView } from '@/components/chat/ChatView'
import { TabBar } from '@/components/layout/TabBar'
import { LoopsView } from '@/components/loops/LoopsView'
import { MonitorView } from '@/components/monitor/MonitorView'
import { PreviewView } from '@/components/preview/PreviewView'
import { HatsPresetsView } from '@/components/project/HatsPresetsView'
import { ProjectHeader } from '@/components/project/ProjectHeader'
import { ProjectConfigView } from '@/components/project/ProjectConfigView'
import { TasksView } from '@/components/tasks/TasksView'
import { TerminalView } from '@/components/terminal/TerminalView'
import { useCapabilities } from '@/hooks/useCapabilities'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { isProjectTabId, resolveProjectTab } from '@/lib/projectTabs'
import { useProjectStore } from '@/stores/projectStore'

export function ProjectPage() {
  const params = useParams()
  const { capabilities } = useCapabilities()
  const isMobile = useMediaQuery('(max-width: 767px)')
  const projectId = params.id
  const requestedTab = isProjectTabId(params.tab) ? params.tab : null
  const tab = requestedTab === 'chat' ? 'chat' : resolveProjectTab(requestedTab, capabilities)
  const isProjectsLoading = useProjectStore((state) => state.isLoading)
  const project = useProjectStore((state) =>
    state.projects.find((candidate) => candidate.id === projectId)
  )

  if (!projectId) {
    return (
      <section className="space-y-2">
        <h1 className="text-2xl font-semibold">Project not found</h1>
        <p className="text-sm text-zinc-400">
          Select a project from the sidebar or create a new one to continue.
        </p>
      </section>
    )
  }

  if (isProjectsLoading) {
    return <p className="text-sm text-zinc-400">Loading project...</p>
  }

  if (!project) {
    return (
      <section className="space-y-2">
        <h1 className="text-2xl font-semibold">Project not found</h1>
        <p className="text-sm text-zinc-400">
          Select a project from the sidebar or create a new one to continue.
        </p>
      </section>
    )
  }

  if (requestedTab !== tab) {
    return <Navigate replace to={`/project/${project.id}/${tab}`} />
  }

  const showProjectHeader = !(isMobile && tab === 'chat')

  return (
    <section className="flex h-full min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-hidden sm:gap-3">
      {showProjectHeader ? <ProjectHeader project={project} /> : null}
      <TabBar projectId={project.id} />
      {tab === 'loops' ? (
        <div className="min-h-0 flex-1">
          <LoopsView projectId={project.id} />
        </div>
      ) : tab === 'tasks' ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <TasksView projectId={project.id} />
        </div>
      ) : tab === 'chat' ? (
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <ChatView projectId={project.id} />
        </div>
      ) : tab === 'terminal' ? (
        <TerminalView projectId={project.id} />
      ) : tab === 'monitor' ? (
        <MonitorView projectId={project.id} />
      ) : tab === 'preview' ? (
        <PreviewView projectId={project.id} />
      ) : tab === 'hats-presets' ? (
        <HatsPresetsView projectId={project.id} />
      ) : (
        <ProjectConfigView projectId={project.id} />
      )}
    </section>
  )
}
