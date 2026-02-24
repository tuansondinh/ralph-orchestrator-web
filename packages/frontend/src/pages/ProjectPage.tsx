import { useParams } from 'react-router-dom'
import { ChatView } from '@/components/chat/ChatView'
import { TabBar } from '@/components/layout/TabBar'
import { LoopsView } from '@/components/loops/LoopsView'
import { MonitorView } from '@/components/monitor/MonitorView'
import { PreviewView } from '@/components/preview/PreviewView'
import { ProjectHeader } from '@/components/project/ProjectHeader'
import { ProjectConfigView } from '@/components/project/ProjectConfigView'
import { TerminalView } from '@/components/terminal/TerminalView'
import { useProjectStore } from '@/stores/projectStore'

const validTabs = ['loops', 'chat', 'terminal', 'monitor', 'preview', 'settings'] as const
type TabKey = (typeof validTabs)[number]

function isTabKey(value: string | undefined): value is TabKey {
  return Boolean(value && validTabs.includes(value as TabKey))
}

export function ProjectPage() {
  const params = useParams()
  const projectId = params.id
  const tab = isTabKey(params.tab) ? params.tab : 'loops'
  const project = useProjectStore((state) =>
    state.projects.find((candidate) => candidate.id === projectId)
  )

  if (!projectId || !project) {
    return (
      <section className="space-y-2">
        <h1 className="text-2xl font-semibold">Project not found</h1>
        <p className="text-sm text-zinc-400">
          Select a project from the sidebar or create a new one to continue.
        </p>
      </section>
    )
  }

  return (
    <section className="flex h-full min-h-0 min-w-0 flex-1 flex-col gap-6 overflow-hidden">
      <ProjectHeader project={project} />
      <TabBar projectId={project.id} />
      {tab === 'loops' ? (
        <div className="min-h-0 flex-1">
          <LoopsView projectId={project.id} />
        </div>
      ) : tab === 'chat' ? (
        <ChatView projectId={project.id} />
      ) : tab === 'terminal' ? (
        <TerminalView projectId={project.id} />
      ) : tab === 'monitor' ? (
        <MonitorView projectId={project.id} />
      ) : tab === 'preview' ? (
        <PreviewView projectId={project.id} />
      ) : (
        <ProjectConfigView projectId={project.id} />
      )}
    </section>
  )
}
