import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { githubApi, type GitHubRepoSnapshot } from '@/lib/githubApi'
import { projectApi, type ProjectRecord } from '@/lib/projectApi'

interface GitHubRepoSelectorProps {
  onProjectCreated: (project: ProjectRecord) => void
}

function toErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

function splitFullName(fullName: string) {
  const [githubOwner, githubRepo] = fullName.split('/')
  if (!githubOwner || !githubRepo) {
    throw new Error(`Invalid GitHub repository name: ${fullName}`)
  }

  return { githubOwner, githubRepo }
}

export function GitHubRepoSelector({ onProjectCreated }: GitHubRepoSelectorProps) {
  const [repos, setRepos] = useState<GitHubRepoSnapshot[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [page, setPage] = useState(1)
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [isSubmittingRepoId, setIsSubmittingRepoId] = useState<number | null>(null)
  const [filter, setFilter] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isConnected, setIsConnected] = useState<boolean | null>(null)
  const [githubUsername, setGithubUsername] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setIsLoading(true)
      setError(null)

      try {
        const connection = await githubApi.getConnection()
        if (cancelled) {
          return
        }

        if (!connection) {
          setIsConnected(false)
          setRepos([])
          setHasMore(false)
          return
        }

        setIsConnected(true)
        setGithubUsername(connection.githubUsername)

        const result = await githubApi.listRepos({ page: 1 })
        if (cancelled) {
          return
        }

        setRepos(result.repos)
        setHasMore(result.hasMore)
        setPage(1)
      } catch (loadError) {
        if (!cancelled) {
          setError(toErrorMessage(loadError, 'Unable to load GitHub repositories'))
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [])

  const visibleRepos = useMemo(() => {
    const normalizedFilter = filter.trim().toLowerCase()
    if (!normalizedFilter) {
      return repos
    }

    return repos.filter((repo) => repo.fullName.toLowerCase().includes(normalizedFilter))
  }, [filter, repos])

  const handleLoadMore = async () => {
    const nextPage = page + 1
    setIsLoadingMore(true)
    setError(null)

    try {
      const result = await githubApi.listRepos({ page: nextPage })
      setRepos((current) => [...current, ...result.repos])
      setHasMore(result.hasMore)
      setPage(nextPage)
    } catch (loadError) {
      setError(toErrorMessage(loadError, 'Unable to load more repositories'))
    } finally {
      setIsLoadingMore(false)
    }
  }

  const handleCreateProject = async (repo: GitHubRepoSnapshot) => {
    setIsSubmittingRepoId(repo.id)
    setError(null)

    try {
      const { githubOwner, githubRepo } = splitFullName(repo.fullName)
      const project = await projectApi.createFromGitHub({
        githubOwner,
        githubRepo,
        defaultBranch: repo.defaultBranch
      })
      onProjectCreated(project)
    } catch (createError) {
      setError(toErrorMessage(createError, 'Unable to create cloud project'))
    } finally {
      setIsSubmittingRepoId(null)
    }
  }

  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">Create cloud project</h2>
        <p className="text-sm text-zinc-400">
          Choose a GitHub repository to clone onto the cloud workspace.
        </p>
        {githubUsername ? (
          <p className="text-xs text-zinc-500">Connected as @{githubUsername}</p>
        ) : null}
      </div>

      {isLoading ? <p className="text-sm text-zinc-400">Loading GitHub repositories...</p> : null}
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
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-sm text-zinc-300" htmlFor="github-repo-filter">
              Search repositories
            </label>
            <input
              className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500"
              id="github-repo-filter"
              onChange={(event) => setFilter(event.target.value)}
              placeholder="owner/repo"
              value={filter}
            />
          </div>

          <div className="space-y-2">
            {visibleRepos.map((repo) => (
              <article
                className="space-y-3 rounded-md border border-zinc-800 bg-zinc-950/60 p-3"
                key={repo.id}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-zinc-100">{repo.fullName}</p>
                    <p className="text-xs text-zinc-500">Default branch: {repo.defaultBranch}</p>
                  </div>
                  <span className="rounded-full border border-zinc-700 px-2 py-1 text-[11px] uppercase tracking-wide text-zinc-300">
                    {repo.private ? 'Private' : 'Public'}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <a
                    className="text-xs text-zinc-400 underline-offset-4 hover:text-zinc-200 hover:underline"
                    href={repo.htmlUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    View repository
                  </a>
                  <button
                    className="rounded-md bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-900 disabled:opacity-50"
                    disabled={isSubmittingRepoId === repo.id}
                    onClick={() => void handleCreateProject(repo)}
                    type="button"
                  >
                    {isSubmittingRepoId === repo.id
                      ? 'Creating project...'
                      : `Create from ${repo.fullName}`}
                  </button>
                </div>
              </article>
            ))}
          </div>

          {!visibleRepos.length ? (
            <p className="text-sm text-zinc-400">No repositories matched your search.</p>
          ) : null}

          {hasMore ? (
            <button
              className="rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-900 disabled:opacity-50"
              disabled={isLoadingMore}
              onClick={() => void handleLoadMore()}
              type="button"
            >
              {isLoadingMore ? 'Loading...' : 'Load more'}
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
