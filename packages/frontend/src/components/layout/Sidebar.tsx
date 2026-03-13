import { Link } from 'react-router-dom'
import { NewProjectDialog } from '@/components/project/NewProjectDialog'
import { ProjectList } from '@/components/project/ProjectList'
import type { ProjectRecord } from '@/lib/projectApi'

interface SidebarProps {
  onProjectSelect: (projectId: string) => void
  onProjectDelete: (projectId: string) => void
  onProjectCreated: (project: ProjectRecord) => void
  connectionStatus: 'connected' | 'reconnecting' | 'connecting'
  reconnectAttempt: number
  showCloudProjectButton?: boolean
}

export function Sidebar({
  onProjectSelect,
  onProjectDelete,
  onProjectCreated,
  connectionStatus,
  reconnectAttempt,
  showCloudProjectButton = false
}: SidebarProps) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-5">
      <header className="space-y-1">
        <h1 className="text-lg font-semibold">Ralph Orchestrator</h1>
        <p className="text-sm text-zinc-400">Project workspaces</p>
      </header>

      <p
        className={`w-fit rounded-full border px-2 py-1 text-xs ${connectionStatus === 'connected'
          ? 'border-emerald-500/40 text-emerald-300'
          : 'border-amber-500/40 text-amber-200'
          }`}
        data-testid="connection-status-indicator"
      >
        {connectionStatus === 'connected'
          ? 'Realtime connected'
          : connectionStatus === 'reconnecting'
            ? `Reconnecting (attempt ${reconnectAttempt})`
            : 'Connecting...'}
      </p>

      <NewProjectDialog
        enableGlobalShortcut
        onCreated={onProjectCreated}
        showTrigger={showCloudProjectButton}
      />

      <div className="flex-1 overflow-y-auto">
        <ProjectList onDelete={onProjectDelete} onSelect={onProjectSelect} />
      </div>

      <Link
        className="rounded-md border border-zinc-800 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
        to="/settings"
      >
        Global settings
      </Link>
    </div>
  )
}
