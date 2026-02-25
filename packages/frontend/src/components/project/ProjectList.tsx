import { useEffect, useState } from 'react'
import { projectApi, type ProjectRecord } from '@/lib/projectApi'
import { useProjectStore } from '@/stores/projectStore'

interface ProjectListProps {
  onSelect: (projectId: string) => void
  onDelete: (projectId: string) => void
}

const PROJECT_ORDER_STORAGE_KEY = 'ralph-ui.sidebar.project-order'

function readStoredProjectOrder() {
  try {
    const raw = window.localStorage.getItem(PROJECT_ORDER_STORAGE_KEY)
    if (!raw) {
      return [] as string[]
    }

    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      return [] as string[]
    }

    return parsed.filter((value): value is string => typeof value === 'string')
  } catch {
    return [] as string[]
  }
}

function applyStoredProjectOrder(projects: ProjectRecord[], storedOrder: string[]) {
  if (storedOrder.length === 0) {
    return projects
  }

  const byId = new Map(projects.map((project) => [project.id, project] as const))
  const ordered: ProjectRecord[] = []

  for (const projectId of storedOrder) {
    const project = byId.get(projectId)
    if (!project) {
      continue
    }
    ordered.push(project)
    byId.delete(projectId)
  }

  for (const project of projects) {
    if (byId.has(project.id)) {
      ordered.push(project)
      byId.delete(project.id)
    }
  }

  return ordered
}

function persistProjectOrder(projects: ProjectRecord[]) {
  try {
    window.localStorage.setItem(
      PROJECT_ORDER_STORAGE_KEY,
      JSON.stringify(projects.map((project) => project.id))
    )
  } catch {
    // Ignore persistence failures.
  }
}

function reorderProjects(projects: ProjectRecord[], draggedId: string, targetId: string) {
  const draggedIndex = projects.findIndex((project) => project.id === draggedId)
  const targetIndex = projects.findIndex((project) => project.id === targetId)

  if (draggedIndex === -1 || targetIndex === -1 || draggedIndex === targetIndex) {
    return projects
  }

  const next = [...projects]
  const [dragged] = next.splice(draggedIndex, 1)
  next.splice(targetIndex, 0, dragged)
  return next
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
  const [draggingProjectId, setDraggingProjectId] = useState<string | null>(null)
  const [dragOverProjectId, setDragOverProjectId] = useState<string | null>(null)

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

        setProjects(applyStoredProjectOrder(list, readStoredProjectOrder()))
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

  useEffect(() => {
    if (isLoading) {
      return
    }

    persistProjectOrder(projects)
  }, [isLoading, projects])

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

  const handleDropOnProject = (targetProjectId: string) => {
    if (!draggingProjectId || draggingProjectId === targetProjectId) {
      return
    }

    const next = reorderProjects(projects, draggingProjectId, targetProjectId)
    if (next === projects) {
      return
    }

    setProjects(next)
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
            <li
              className={`${dragOverProjectId === project.id && draggingProjectId !== project.id
                  ? 'rounded-md ring-1 ring-cyan-500/70'
                  : ''
                }`}
              data-testid={`project-item-${project.id}`}
              draggable={!isDeleting}
              key={project.id}
              onDragEnd={() => {
                setDraggingProjectId(null)
                setDragOverProjectId(null)
              }}
              onDragOver={(event) => {
                if (!draggingProjectId || draggingProjectId === project.id) {
                  return
                }
                event.preventDefault()
                event.dataTransfer.dropEffect = 'move'
                setDragOverProjectId(project.id)
              }}
              onDragStart={(event) => {
                if (isDeleting) {
                  event.preventDefault()
                  return
                }
                setDraggingProjectId(project.id)
                event.dataTransfer.effectAllowed = 'move'
                event.dataTransfer.setData('text/plain', project.id)
              }}
              onDrop={(event) => {
                event.preventDefault()
                handleDropOnProject(project.id)
                setDraggingProjectId(null)
                setDragOverProjectId(null)
              }}
            >
              <div className="flex items-center gap-2">
                <button
                  className={`min-w-0 flex-1 truncate rounded-md px-3 py-2 text-left text-sm transition-colors ${
                    isActive
                      ? 'bg-zinc-100 text-zinc-900'
                      : 'border border-zinc-800 text-zinc-200 hover:bg-zinc-800'
                  }`}
                  data-testid={`project-select-${project.id}`}
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
