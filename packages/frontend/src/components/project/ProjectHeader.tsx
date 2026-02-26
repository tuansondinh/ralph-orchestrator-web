import type { ProjectRecord } from '@/lib/projectApi'

interface ProjectHeaderProps {
  project: ProjectRecord
}

export function ProjectHeader({ project }: ProjectHeaderProps) {
  const projectType = project.type ?? 'unknown'

  return (
    <header className="space-y-1">
      <h1 className="text-xl font-semibold leading-tight">{project.name}</h1>
      <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs">
        <span className="rounded-full border border-zinc-700 px-2 py-0 uppercase text-zinc-300">
          {projectType}
        </span>
        <span className="min-w-0 break-all text-zinc-500">{project.path}</span>
      </div>
    </header>
  )
}
