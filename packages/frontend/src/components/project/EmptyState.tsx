import { NewProjectDialog } from '@/components/project/NewProjectDialog'
import { GitHubConnectCard } from '@/components/settings/GitHubConnectCard'
import type { ProjectRecord } from '@/lib/projectApi'

interface EmptyStateProps {
  onProjectCreated: (project: ProjectRecord) => void
}

export function EmptyState({ onProjectCreated }: EmptyStateProps) {
  return (
    <section className="mx-auto max-w-5xl space-y-6">
      <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-gradient-to-br from-zinc-900 via-zinc-900 to-indigo-950/60 shadow-2xl shadow-indigo-950/20">
        <div className="grid gap-6 p-6 md:grid-cols-[1.3fr_1fr] md:p-10">
          <div className="space-y-5">
            <p className="inline-flex rounded-full border border-indigo-400/30 bg-indigo-500/10 px-3 py-1 text-xs font-medium tracking-wide text-indigo-200">
              Developer Workspace
            </p>
            <div className="space-y-3">
              <h2 className="text-3xl font-semibold tracking-tight text-zinc-100 md:text-4xl">
                Build smarter software with a focused home base.
              </h2>
              <p className="max-w-2xl text-sm text-zinc-300 md:text-base">
                Manage your projects, run autonomous loops, and monitor progress without losing
                context. Keep shipping while Ralph handles repetitive orchestration tasks.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs text-zinc-300">
              <span className="rounded-full border border-zinc-700 bg-zinc-900/60 px-3 py-1">
                TypeScript
              </span>
              <span className="rounded-full border border-zinc-700 bg-zinc-900/60 px-3 py-1">
                React
              </span>
              <span className="rounded-full border border-zinc-700 bg-zinc-900/60 px-3 py-1">
                Node.js
              </span>
              <span className="rounded-full border border-zinc-700 bg-zinc-900/60 px-3 py-1">
                Python
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-zinc-700/80 bg-zinc-950/80 p-4">
            <p className="text-xs uppercase tracking-wide text-zinc-400">Workflow Snapshot</p>
            <div className="mt-3 space-y-2 text-xs text-zinc-300">
              <p>
                <span className="text-emerald-300">✓</span> Plan implementation steps
              </p>
              <p>
                <span className="text-emerald-300">✓</span> Run and track execution loops
              </p>
              <p>
                <span className="text-emerald-300">✓</span> Keep monitoring and alerts in one place
              </p>
            </div>
            <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-900 p-3 font-mono text-[11px] leading-relaxed text-zinc-400">
              <p className="text-zinc-500">$ ralph run --project my-app</p>
              <p>Analyzing codebase...</p>
              <p>Planning tasks...</p>
              <p className="text-emerald-300">Loop started successfully.</p>
            </div>
          </div>
        </div>
      </div>

      <GitHubConnectCard />

      <div className="mx-auto max-w-2xl space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-8 text-center">
        <h1 className="text-2xl font-semibold">No projects yet</h1>
        <p className="text-sm text-zinc-400">
          Add your first codebase to start planning, running loops, and monitoring progress.
        </p>
        <div className="pt-2">
          <NewProjectDialog onCreated={onProjectCreated} triggerLabel="Create Project" />
        </div>
      </div>
    </section>
  )
}
