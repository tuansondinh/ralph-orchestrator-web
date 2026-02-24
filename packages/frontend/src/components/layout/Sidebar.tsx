import { Link } from 'react-router-dom'
import { NewProjectDialog } from '@/components/project/NewProjectDialog'
import { ProjectList } from '@/components/project/ProjectList'
import type { ProjectRecord } from '@/lib/projectApi'

interface SidebarProps {
  onProjectSelect: (projectId: string) => void
  onProjectDelete: (projectId: string) => void
  onProjectCreated: (project: ProjectRecord) => void
}

export function Sidebar({
  onProjectSelect,
  onProjectDelete,
  onProjectCreated
}: SidebarProps) {
  return (
    <div className="flex h-full flex-col gap-5">
      <header className="space-y-1">
        <h1 className="text-lg font-semibold">Ralph Orchestrator</h1>
        <p className="text-sm text-zinc-400">Project workspaces</p>
      </header>

      <NewProjectDialog enableGlobalShortcut onCreated={onProjectCreated} />

      <div className="flex-1 overflow-y-auto">
        <ProjectList onDelete={onProjectDelete} onSelect={onProjectSelect} />
      </div>

      <Link
        className="rounded-md border border-zinc-800 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
        to="/settings"
      >
        Settings
      </Link>
    </div>
  )
}
