import { useEffect, useState } from 'react'
import { projectApi } from '@/lib/projectApi'
import { useProjectStore } from '@/stores/projectStore'

interface ProjectListProps {
  onSelect: (projectId: string) => void
  onDelete: (projectId: string) => void
}

export function ProjectList({ onSelect, onDelete }: ProjectListProps) {
  const projects = useProjectStore((state) => state.projects)
  const activeProjectId = useProjectStore((state) => state.activeProjectId)
  const isLoading = useProjectStore((state) => state.isLoading)
  const error = useProjectStore((state) => state.error)
  const setProjects = useProjectStore((state) => state.setProjects)
  const removeProject = useProjectStore((state) => state.removeProject)
  const setLoading = useProjectStore((state) => state.setLoading)
  const setError = useProjectStore((state) => state.setError)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true
    setLoading(true)
    setError(null)

    projectApi
      .list()
      .then((list) => {
        if (!isMounted) {
          return
        }

        setProjects(list)
      })
      .catch((loadError) => {
        if (!isMounted) {
          return
        }

        const message =
          loadError instanceof Error ? loadError.message : 'Failed to load projects'
        setError(message)
      })
      .finally(() => {
        if (!isMounted) {
          return
        }

        setLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [setError, setLoading, setProjects])

  const handleDeleteProject = async (projectId: string, projectName: string) => {
    const confirmed = window.confirm(`Remove project "${projectName}"?`)
    if (!confirmed) {
      return
    }

    setDeleteError(null)
    setDeletingProjectId(projectId)

    try {
      await projectApi.delete(projectId)
      removeProject(projectId)
      onDelete(projectId)
    } catch (deleteProjectError) {
      const message =
        deleteProjectError instanceof Error
          ? deleteProjectError.message
          : 'Failed to remove project'
      setDeleteError(message)
    } finally {
      setDeletingProjectId((current) => (current === projectId ? null : current))
    }
  }

  if (isLoading && projects.length === 0) {
    return (
      <div className="space-y-2" data-testid="project-list-skeleton">
        <div className="h-9 animate-pulse rounded-md bg-zinc-800/80" />
        <div className="h-9 animate-pulse rounded-md bg-zinc-800/70" />
        <div className="h-9 animate-pulse rounded-md bg-zinc-800/60" />
      </div>
    )
  }

  if (error) {
    return <p className="text-sm text-red-300">{error}</p>
  }

  if (projects.length === 0) {
    return <p className="text-sm text-zinc-400">No projects in sidebar.</p>
  }

  return (
    <div className="space-y-2">
      {deleteError ? <p className="text-sm text-red-300">{deleteError}</p> : null}
      <ul className="space-y-2">
        {projects.map((project) => {
          const isActive = project.id === activeProjectId
          const isDeleting = deletingProjectId === project.id

          return (
            <li key={project.id}>
              <div className="flex items-center gap-2">
                <button
                  className={`min-w-0 flex-1 truncate rounded-md px-3 py-2 text-left text-sm transition-colors ${
                    isActive
                      ? 'bg-zinc-100 text-zinc-900'
                      : 'border border-zinc-800 text-zinc-200 hover:bg-zinc-800'
                  }`}
                  disabled={isDeleting}
                  onClick={() => onSelect(project.id)}
                  type="button"
                >
                  {project.name}
                </button>
                <button
                  aria-label={`Remove ${project.name}`}
                  className="rounded-md border border-red-900/60 px-2 py-2 text-xs text-red-200 hover:bg-red-900/20 disabled:opacity-50"
                  disabled={isDeleting}
                  onClick={() => {
                    void handleDeleteProject(project.id, project.name)
                  }}
                  type="button"
                >
                  {isDeleting ? 'Removing...' : 'Remove'}
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
