import { FormEvent, useCallback, useEffect, useState } from 'react'
import { CreateProjectDialog } from '@/components/project/CreateProjectDialog'
import { GitHubRepoSelector } from '@/components/project/GitHubRepoSelector'
import { capabilitiesApi, type RuntimeCapabilities } from '@/lib/capabilitiesApi'
import { projectApi, type ProjectRecord } from '@/lib/projectApi'
import { useProjectStore } from '@/stores/projectStore'

interface NewProjectDialogProps {
  triggerLabel?: string
  onCreated: (project: ProjectRecord) => void
  enableGlobalShortcut?: boolean
  showTrigger?: boolean
}

function deriveProjectName(projectPath: string) {
  const normalized = projectPath.trim().replace(/[\\/]+$/, '')
  if (!normalized) {
    return 'project'
  }

  const segments = normalized.split(/[\\/]/).filter((segment) => segment.length > 0)
  const candidate = segments[segments.length - 1]
  return candidate || 'project'
}

function buildCreateProjectPath(basePath: string, projectName: string) {
  const trimmedBasePath = basePath.trim()
  const trimmedProjectName = projectName.trim()

  if (!trimmedBasePath) {
    return trimmedProjectName
  }

  if (/[\\/]$/.test(trimmedBasePath)) {
    return `${trimmedBasePath}${trimmedProjectName}`
  }

  const separator =
    trimmedBasePath.includes('\\') && !trimmedBasePath.includes('/') ? '\\' : '/'

  return `${trimmedBasePath}${separator}${trimmedProjectName}`
}

export function NewProjectDialog({
  triggerLabel = 'New Project',
  onCreated,
  enableGlobalShortcut = false,
  showTrigger = true
}: NewProjectDialogProps) {
  const addProject = useProjectStore((state) => state.addProject)
  const setActiveProject = useProjectStore((state) => state.setActiveProject)
  const [isOpen, setIsOpen] = useState(false)
  const [mode, setMode] = useState<'create' | 'open'>('create')
  const [name, setName] = useState('')
  const [createPath, setCreatePath] = useState('')
  const [path, setPath] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSelectingPath, setIsSelectingPath] = useState(false)
  const [capabilities, setCapabilities] = useState<RuntimeCapabilities | null>(null)
  const [cloudMode, setCloudMode] = useState<'create' | 'clone'>('create')

  const close = useCallback(() => {
    setIsOpen(false)
    setError(null)
    setMode('create')
    setCloudMode('create')
    setName('')
    setCreatePath('')
    setPath('')
    setIsSelectingPath(false)
  }, [])

  const handleProjectCreated = useCallback(
    (project: ProjectRecord) => {
      addProject(project)
      setActiveProject(project.id)
      close()
      onCreated(project)
    },
    [addProject, close, onCreated, setActiveProject]
  )

  useEffect(() => {
    let cancelled = false

    const loadCapabilities = async () => {
      try {
        const nextCapabilities = await capabilitiesApi.get()
        if (!cancelled) {
          setCapabilities(nextCapabilities)
        }
      } catch {
        if (!cancelled) {
          setCapabilities(null)
        }
      }
    }

    void loadCapabilities()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const handleOpen = () => {
      if (enableGlobalShortcut) {
        setIsOpen(true)
      }
    }
    const handleClose = () => {
      close()
    }

    window.addEventListener('ralph:new-project', handleOpen)
    window.addEventListener('ralph:close-dialogs', handleClose)

    return () => {
      window.removeEventListener('ralph:new-project', handleOpen)
      window.removeEventListener('ralph:close-dialogs', handleClose)
    }
  }, [close, enableGlobalShortcut])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsSubmitting(true)
    setError(null)

    try {
      const submitName = mode === 'create' ? name.trim() : deriveProjectName(path)
      const submitPath =
        mode === 'create'
          ? buildCreateProjectPath(createPath, submitName)
          : path.trim()
      const project = await projectApi.create({
        name: submitName,
        path: submitPath,
        createIfMissing: mode === 'create'
      })
      handleProjectCreated(project)
    } catch (createError) {
      const message = createError instanceof Error ? createError.message : 'Failed to save project'
      setError(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSelectPath = useCallback(async (onSelect: (selectedPath: string) => void) => {
    setError(null)
    setIsSelectingPath(true)

    try {
      const selected = await projectApi.selectDirectory()
      if (selected?.path) {
        onSelect(selected.path)
      }
    } catch (selectionError) {
      const message =
        selectionError instanceof Error
          ? selectionError.message
          : 'Failed to open folder picker'
      setError(message)
    } finally {
      setIsSelectingPath(false)
    }
  }, [])

  const isCloudProjectMode = capabilities?.githubProjects === true

  return (
    <>
      {showTrigger ? (
        <button
          className="rounded-md bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-900 hover:bg-white"
          onClick={() => setIsOpen(true)}
          type="button"
        >
          {triggerLabel}
        </button>
      ) : null}
      {isOpen ? (
        <div
          aria-label="Create project dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          role="dialog"
        >
          <div className="w-full max-w-md space-y-4 rounded-lg border border-zinc-800 bg-zinc-900 p-5">
            {isCloudProjectMode ? (
              <>
                <div className="space-y-4">
                  <div className="flex rounded-md border border-zinc-700 bg-zinc-950 p-1">
                    <button
                      type="button"
                      onClick={() => setCloudMode('create')}
                      className={`flex-1 rounded-sm px-3 py-1.5 text-sm font-medium transition-colors ${
                        cloudMode === 'create'
                          ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      Create Repo
                    </button>
                    <button
                      type="button"
                      onClick={() => setCloudMode('clone')}
                      className={`flex-1 rounded-sm px-3 py-1.5 text-sm font-medium transition-colors ${
                        cloudMode === 'clone'
                          ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      Clone Repo
                    </button>
                  </div>

                  {cloudMode === 'create' ? (
                    <CreateProjectDialog onProjectCreated={handleProjectCreated} />
                  ) : (
                    <GitHubRepoSelector onProjectCreated={handleProjectCreated} />
                  )}
                </div>
                <div className="flex justify-end">
                  <button
                    className="rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
                    onClick={close}
                    type="button"
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 className="text-xl font-semibold">
                  {mode === 'create' ? 'Create new project' : 'Open existing project'}
                </h2>
                <div className="flex rounded-md border border-zinc-700 bg-zinc-950 p-1">
                  <button
                    type="button"
                    onClick={() => {
                      setMode('create')
                      setError(null)
                    }}
                    className={`flex-1 rounded-sm px-3 py-1.5 text-sm font-medium transition-colors ${mode === 'create'
                        ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                        : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                  >
                    Create New
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMode('open')
                      setError(null)
                    }}
                    className={`flex-1 rounded-sm px-3 py-1.5 text-sm font-medium transition-colors ${mode === 'open'
                        ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                        : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                  >
                    Open Existing
                  </button>
                </div>
                <form className="space-y-3" onSubmit={handleSubmit}>
                  {mode === 'create' && (
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <label className="text-sm text-zinc-300" htmlFor="project-name">
                          Project name
                        </label>
                        <input
                          className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500"
                          id="project-name"
                          placeholder="my-new-project"
                          onChange={(event) => setName(event.target.value)}
                          required
                          value={name}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm text-zinc-300" htmlFor="project-create-path">
                          Project path (optional)
                        </label>
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                          <input
                            className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500"
                            id="project-create-path"
                            onChange={(event) => setCreatePath(event.target.value)}
                            placeholder="/path/to/new/project"
                            value={createPath}
                          />
                          <button
                            className="w-full rounded-md border border-zinc-700 px-3 py-2 text-xs font-medium text-zinc-200 hover:bg-zinc-800 sm:w-auto"
                            disabled={isSelectingPath}
                            onClick={() => {
                              void handleSelectPath(setCreatePath)
                            }}
                            type="button"
                          >
                            {isSelectingPath ? 'Opening...' : 'Select Path'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                  {mode === 'open' && (
                    <div className="space-y-2">
                      <label className="text-sm text-zinc-300" htmlFor="project-path">
                        Project path
                      </label>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <input
                          className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500"
                          id="project-path"
                          placeholder="/path/to/existing/project"
                          onChange={(event) => setPath(event.target.value)}
                          required={mode === 'open'}
                          value={path}
                        />
                        <button
                          className="w-full rounded-md border border-zinc-700 px-3 py-2 text-xs font-medium text-zinc-200 hover:bg-zinc-800 sm:w-auto"
                          disabled={isSelectingPath}
                          onClick={() => {
                            void handleSelectPath(setPath)
                          }}
                          type="button"
                        >
                          {isSelectingPath ? 'Opening...' : 'Select Path'}
                        </button>
                      </div>
                    </div>
                  )}
                  {error ? <p className="text-sm text-red-300">{error}</p> : null}
                  <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <button
                      className="w-full rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 sm:w-auto"
                      onClick={close}
                      type="button"
                    >
                      Cancel
                    </button>
                    <button
                      className="w-full rounded-md bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-900 disabled:opacity-50 sm:w-auto"
                      disabled={isSubmitting || (mode === 'create' ? !name.trim() : !path.trim())}
                      type="submit"
                    >
                      {mode === 'create' ? 'Create' : 'Open'}
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      ) : null}
    </>
  )
}
