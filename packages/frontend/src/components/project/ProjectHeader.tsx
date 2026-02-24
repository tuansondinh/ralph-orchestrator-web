import type { ProjectRecord } from '@/lib/projectApi'

interface ProjectHeaderProps {
  project: ProjectRecord
}

export function ProjectHeader({ project }: ProjectHeaderProps) {
  const projectType = project.type ?? 'unknown'

  return (
    <header className="space-y-2">
      <h1 className="text-2xl font-semibold">{project.name}</h1>
      <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
        <span className="rounded-full border border-zinc-700 px-2 py-0.5 uppercase text-zinc-300">
          {projectType}
        </span>
        <span className="min-w-0 break-all text-zinc-500">{project.path}</span>
      </div>
    </header>
  )
}
