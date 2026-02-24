import { useEffect, useMemo, useRef, useState } from 'react'
import type { ProjectRecord } from '@/lib/projectApi'

interface ProjectSwitcherDialogProps {
  open: boolean
  projects: ProjectRecord[]
  activeProjectId: string | null
  onClose: () => void
  onSelect: (projectId: string) => void
}

export function ProjectSwitcherDialog({
  open,
  projects,
  activeProjectId,
  onClose,
  onSelect
}: ProjectSwitcherDialogProps) {
  const [query, setQuery] = useState('')
  const queryRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!open) {
      setQuery('')
      return
    }

    window.setTimeout(() => {
      queryRef.current?.focus()
    }, 0)
  }, [open])

  const filteredProjects = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) {
      return projects
    }

    return projects.filter((project) => {
      const haystack = `${project.name} ${project.path}`.toLowerCase()
      return haystack.includes(normalizedQuery)
    })
  }, [projects, query])

  if (!open) {
    return null
  }

  return (
    <div
      aria-label="Project switcher"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 p-4 pt-24"
      onClick={onClose}
      role="dialog"
    >
      <section
        className="w-full max-w-lg space-y-3 rounded-lg border border-zinc-800 bg-zinc-900 p-4 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="space-y-1">
          <h2 className="text-lg font-semibold">Quick project switcher</h2>
          <p className="text-xs text-zinc-400">Type to filter, then choose a project.</p>
        </header>
        <label className="space-y-1 text-sm text-zinc-300">
          <span>Search</span>
          <input
            ref={queryRef}
            aria-label="Search projects"
            className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name or path"
            value={query}
          />
        </label>
        <ul className="max-h-72 space-y-2 overflow-auto">
          {filteredProjects.map((project) => (
            <li key={project.id}>
              <button
                className={`w-full rounded-md border px-3 py-2 text-left text-sm ${
                  project.id === activeProjectId
                    ? 'border-zinc-500 bg-zinc-800 text-zinc-100'
                    : 'border-zinc-800 text-zinc-200 hover:bg-zinc-800'
                }`}
                onClick={() => onSelect(project.id)}
                type="button"
              >
                <span className="block font-medium">{project.name}</span>
                <span className="block truncate text-xs text-zinc-400">{project.path}</span>
              </button>
            </li>
          ))}
        </ul>
        {filteredProjects.length === 0 ? (
          <p className="text-sm text-zinc-400">No projects match your search.</p>
        ) : null}
      </section>
    </div>
  )
}
