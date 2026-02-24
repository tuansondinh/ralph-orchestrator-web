import { NewProjectDialog } from '@/components/project/NewProjectDialog'
import type { ProjectRecord } from '@/lib/projectApi'

interface ProjectHomeStateProps {
  projects: ProjectRecord[]
  onProjectCreated: (project: ProjectRecord) => void
  onProjectSelect: (projectId: string) => void
}

function formatUpdatedAt(timestamp: number) {
  if (timestamp <= 0) {
    return 'recently'
  }

  return new Date(timestamp).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

export function ProjectHomeState({
  projects,
  onProjectCreated,
  onProjectSelect
}: ProjectHomeStateProps) {
  const orderedProjects = [...projects].sort((left, right) => right.updatedAt - left.updatedAt)
  const latestProject = orderedProjects[0]
  const trackedStacks = new Set(projects.map((project) => project.type ?? 'untyped'))
  const trackedPaths = new Set(projects.map((project) => project.path))

  return (
    <section className="mx-auto max-w-6xl space-y-6">
      <div className="overflow-hidden rounded-2xl border border-cyan-500/30 bg-gradient-to-br from-zinc-900 via-cyan-950/40 to-emerald-950/20 shadow-2xl shadow-cyan-950/20">
        <div className="grid gap-6 p-6 md:grid-cols-[1.4fr_1fr] md:p-8">
          <div className="space-y-4">
            <p className="inline-flex rounded-full border border-cyan-400/40 bg-cyan-500/10 px-3 py-1 text-xs font-medium tracking-wide text-cyan-100">
              Workspace Overview
            </p>
            <div className="space-y-3">
              <h1 className="text-3xl font-semibold tracking-tight text-zinc-100 md:text-4xl">
                Pick up where your last build left off.
              </h1>
              <p className="max-w-2xl text-sm text-zinc-300 md:text-base">
                Keep momentum across active codebases with one shared command center for chat,
                loops, monitoring, and previews.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs text-zinc-200">
              <span className="rounded-full border border-zinc-700 bg-zinc-900/70 px-3 py-1">
                {projects.length} projects
              </span>
              <span className="rounded-full border border-zinc-700 bg-zinc-900/70 px-3 py-1">
                {trackedStacks.size} stacks
              </span>
              <span className="rounded-full border border-zinc-700 bg-zinc-900/70 px-3 py-1">
                {trackedPaths.size} workspaces
              </span>
            </div>
            <div className="flex flex-wrap gap-3 pt-1">
              {latestProject ? (
                <button
                  className="rounded-md bg-cyan-200 px-3 py-2 text-sm font-medium text-cyan-950 hover:bg-cyan-100"
                  onClick={() => onProjectSelect(latestProject.id)}
                  type="button"
                >
                  Open {latestProject.name}
                </button>
              ) : null}
              <NewProjectDialog onCreated={onProjectCreated} triggerLabel="Add Project" />
            </div>
          </div>

          <div className="rounded-xl border border-zinc-700/80 bg-zinc-950/80 p-4">
            <p className="text-xs uppercase tracking-wide text-zinc-400">Build Flow</p>
            <div className="mt-3 space-y-2 text-sm text-zinc-200">
              <p>
                <span className="text-emerald-300">1.</span> Plan work in chat
              </p>
              <p>
                <span className="text-emerald-300">2.</span> Execute loops with runtime tracking
              </p>
              <p>
                <span className="text-emerald-300">3.</span> Inspect monitor and preview signals
              </p>
            </div>
            <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-900 p-3 font-mono text-[11px] leading-relaxed text-zinc-300">
              <p className="text-zinc-500">$ ralph run --project active-service</p>
              <p>Planning queued tasks...</p>
              <p>Executing autonomous loop...</p>
              <p className="text-emerald-300">Status: synchronized</p>
            </div>
          </div>
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-zinc-100">Active Projects</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {orderedProjects.map((project) => (
            <article
              className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/70 p-4"
              key={project.id}
            >
              <div className="space-y-1">
                <h3 className="text-base font-semibold text-zinc-100">{project.name}</h3>
                <p className="truncate text-xs text-zinc-400" title={project.path}>
                  {project.path}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs text-zinc-300">
                <span className="rounded-full border border-zinc-700 bg-zinc-900/80 px-2 py-1">
                  {(project.type ?? 'untyped').toUpperCase()}
                </span>
                <span className="rounded-full border border-zinc-700 bg-zinc-900/80 px-2 py-1">
                  Updated {formatUpdatedAt(project.updatedAt)}
                </span>
              </div>
              <button
                className="rounded-md border border-cyan-500/40 px-3 py-1.5 text-sm text-cyan-100 hover:bg-cyan-500/10"
                onClick={() => onProjectSelect(project.id)}
                type="button"
              >
                Open Workspace
              </button>
            </article>
          ))}
        </div>
      </section>
    </section>
  )
}
