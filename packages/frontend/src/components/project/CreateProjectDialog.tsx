import { FormEvent, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { githubApi } from '@/lib/githubApi'
import { projectApi, type ProjectRecord } from '@/lib/projectApi'

interface CreateProjectDialogProps {
  onProjectCreated: (project: ProjectRecord) => void
}

function toErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

export function CreateProjectDialog({ onProjectCreated }: CreateProjectDialogProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [isConnected, setIsConnected] = useState<boolean | null>(null)
  const [githubUsername, setGithubUsername] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isPrivate, setIsPrivate] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const loadConnection = async () => {
      setIsLoading(true)
      setError(null)

      try {
        const connection = await githubApi.getConnection()
        if (cancelled) {
          return
        }

        if (!connection) {
          setIsConnected(false)
          return
        }

        setIsConnected(true)
        setGithubUsername(connection.githubUsername)
      } catch (connectionError) {
        if (!cancelled) {
          setError(toErrorMessage(connectionError, 'Unable to load GitHub connection'))
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    void loadConnection()

    return () => {
      cancelled = true
    }
  }, [])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsSubmitting(true)
    setError(null)

    try {
      const project = await projectApi.createFromGitHub({
        name: name.trim(),
        description: description.trim(),
        private: isPrivate
      })
      onProjectCreated(project)
    } catch (createError) {
      setError(toErrorMessage(createError, 'Unable to create cloud project'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">Create cloud project</h2>
        <p className="text-sm text-zinc-400">
          Create a GitHub repository, clone it into the workspace, and open it in Ralph.
        </p>
        {githubUsername ? (
          <p className="text-xs text-zinc-500">Connected as @{githubUsername}</p>
        ) : null}
      </div>

      {isLoading ? <p className="text-sm text-zinc-400">Loading GitHub connection...</p> : null}
      {error ? <p className="text-sm text-red-300">{error}</p> : null}

      {!isLoading && isConnected === false ? (
        <div className="space-y-2 rounded-md border border-zinc-800 bg-zinc-950/60 p-4">
          <p className="text-sm text-zinc-200">
            Connect GitHub in Settings before creating a cloud project.
          </p>
          <Link
            className="inline-flex rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-900"
            to="/settings"
          >
            Open Settings
          </Link>
        </div>
      ) : null}

      {!isLoading && isConnected ? (
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-1">
            <label className="text-sm text-zinc-300" htmlFor="github-project-name">
              Repository name
            </label>
            <input
              className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500"
              id="github-project-name"
              onChange={(event) => setName(event.target.value)}
              placeholder="hello-world"
              required
              value={name}
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm text-zinc-300" htmlFor="github-project-description">
              Description
            </label>
            <textarea
              className="min-h-24 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500"
              id="github-project-description"
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Optional repository description"
              value={description}
            />
          </div>

          <div className="space-y-2">
            <p className="text-sm text-zinc-300">Visibility</p>
            <div className="flex rounded-md border border-zinc-700 bg-zinc-950 p-1">
              <button
                aria-pressed={!isPrivate}
                className={`flex-1 rounded-sm px-3 py-2 text-sm font-medium transition-colors ${
                  !isPrivate ? 'bg-zinc-800 text-zinc-100 shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
                }`}
                onClick={() => setIsPrivate(false)}
                type="button"
              >
                Public
              </button>
              <button
                aria-pressed={isPrivate}
                className={`flex-1 rounded-sm px-3 py-2 text-sm font-medium transition-colors ${
                  isPrivate ? 'bg-zinc-800 text-zinc-100 shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
                }`}
                onClick={() => setIsPrivate(true)}
                type="button"
              >
                Private
              </button>
            </div>
          </div>

          <button
            className="w-full rounded-md bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-900 disabled:opacity-50"
            disabled={isSubmitting}
            type="submit"
          >
            {isSubmitting ? 'Creating Project...' : 'Create Project'}
          </button>
        </form>
      ) : null}
    </section>
  )
}
