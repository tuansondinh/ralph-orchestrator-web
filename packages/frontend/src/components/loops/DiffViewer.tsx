import { useEffect, useMemo, useState } from 'react'
import { loopApi, type DiffFile, type LoopDiff } from '@/lib/loopApi'

interface DiffViewerProps {
  loopId: string
  watch?: boolean
  refreshIntervalMs?: number
}

const PREVIEW_LINES = 30
const DEFAULT_REFRESH_INTERVAL_MS = 4_000

function getDiffLineClass(line: string) {
  if (line.startsWith('+') && !line.startsWith('+++')) {
    return 'bg-green-950 text-green-300'
  }
  if (line.startsWith('-') && !line.startsWith('---')) {
    return 'bg-red-950 text-red-300'
  }
  if (line.startsWith('@@')) {
    return 'bg-zinc-900 text-blue-400'
  }
  return 'text-zinc-300'
}

function getFileAnchorId(path: string) {
  return `diff-file-${encodeURIComponent(path)}`
}

export function DiffViewer({
  loopId,
  watch = false,
  refreshIntervalMs = DEFAULT_REFRESH_INTERVAL_MS
}: DiffViewerProps) {
  const [data, setData] = useState<LoopDiff | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set())

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    setData(null)
    setError(null)
    setIsRefreshing(false)
    setExpandedFiles(new Set())

    const loadDiff = async (showLoadingState: boolean) => {
      if (showLoadingState) {
        setIsLoading(true)
      } else {
        setIsRefreshing(true)
      }

      await loopApi
        .getDiff(loopId)
        .then((response) => {
          if (!cancelled) {
            setData(response)
            setError(null)
          }
        })
        .catch((nextError: unknown) => {
          if (!cancelled) {
            setError(nextError instanceof Error ? nextError.message : 'Failed to load diff')
          }
        })
        .finally(() => {
          if (!cancelled) {
            if (showLoadingState) {
              setIsLoading(false)
            } else {
              setIsRefreshing(false)
            }
          }
        })
    }

    void loadDiff(true)

    const intervalId =
      watch && refreshIntervalMs > 0
        ? window.setInterval(() => {
          void loadDiff(false)
        }, refreshIntervalMs)
        : null

    return () => {
      cancelled = true
      if (intervalId !== null) {
        window.clearInterval(intervalId)
      }
    }
  }, [loopId, refreshIntervalMs, watch])

  const files = useMemo(() => data?.files ?? [], [data?.files])
  const stats = data?.stats

  const toggleFile = (path: string) => {
    setExpandedFiles((previous) => {
      const next = new Set(previous)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }

  const scrollToFile = (file: DiffFile) => {
    document
      .getElementById(getFileAnchorId(file.path))
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  if (isLoading) {
    return (
      <section className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
        <p className="text-sm text-zinc-400">Loading file watcher...</p>
      </section>
    )
  }

  if (error) {
    return (
      <section className="rounded-lg border border-red-900/60 bg-red-950/20 p-4">
        <p className="text-sm text-red-300">{error}</p>
      </section>
    )
  }

  if (!data || !data.available) {
    return (
      <section className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
        <p className="text-sm text-zinc-300">
          {data?.reason ?? 'No diff available for this loop.'}
        </p>
      </section>
    )
  }

  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-900/60">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 px-4 py-3 text-sm text-zinc-200">
        <div>
          <span>{stats?.filesChanged ?? files.length} files changed</span>
          <span className="px-2 text-zinc-500">·</span>
          <span className="text-green-300">+{stats?.additions ?? 0}</span>
          <span className="px-2 text-zinc-500">·</span>
          <span className="text-red-300">-{stats?.deletions ?? 0}</span>
        </div>
        {watch ? (
          <span className="text-xs text-zinc-400">
            {isRefreshing ? 'Refreshing…' : 'Watching for file changes'}
          </span>
        ) : null}
      </header>

      <div className="flex flex-col md:flex-row">
        <aside className="w-full border-b border-zinc-800 p-3 md:w-56 md:shrink-0 md:border-b-0 md:border-r">
          <ul className="space-y-2">
            {files.map((file) => (
              <li key={file.path}>
                <button
                  className="w-full rounded-md border border-zinc-800 bg-zinc-950/40 p-2 text-left hover:bg-zinc-900"
                  onClick={() => scrollToFile(file)}
                  type="button"
                >
                  <p className="truncate text-xs text-zinc-200">{file.path}</p>
                  <p className="mt-1 text-xs text-zinc-400">
                    <span className="mr-2 rounded border border-zinc-700 px-1 py-0.5">{file.status}</span>
                    <span className="text-green-300">+{file.additions}</span>
                    <span className="mx-1 text-zinc-500">/</span>
                    <span className="text-red-300">-{file.deletions}</span>
                  </p>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <div className="min-w-0 flex-1 space-y-4 p-3">
          {files.length === 0 ? (
            <p className="rounded-md border border-zinc-800 bg-zinc-950/40 p-4 text-sm text-zinc-300">
              No changes detected between base and worktree branches.
            </p>
          ) : null}

          {files.map((file) => {
            const lines = file.diff.split('\n')
            const isExpanded = expandedFiles.has(file.path)
            const visibleLines = isExpanded ? lines : lines.slice(0, PREVIEW_LINES)

            return (
              <article
                className="overflow-hidden rounded-md border border-zinc-800 bg-zinc-950/40"
                id={getFileAnchorId(file.path)}
                key={file.path}
              >
                <header className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 px-3 py-2 text-xs">
                  <div className="min-w-0">
                    <span className="truncate text-zinc-200">{file.path}</span>
                    <span className="ml-2 rounded border border-zinc-700 px-1 py-0.5 text-zinc-300">{file.status}</span>
                    <span className="ml-3 text-green-300">+{file.additions}</span>
                    <span className="ml-1 text-red-300">-{file.deletions}</span>
                  </div>
                  {lines.length > PREVIEW_LINES ? (
                    <button
                      className="rounded border border-zinc-700 px-2 py-1 text-zinc-300 hover:bg-zinc-800"
                      onClick={() => toggleFile(file.path)}
                      type="button"
                    >
                      {isExpanded ? 'Collapse' : `Show all ${lines.length} lines`}
                    </button>
                  ) : null}
                </header>

                <div className="overflow-x-auto">
                  <pre className="min-w-max p-3 text-xs leading-5">
                    {visibleLines.map((line, index) => (
                      <div className={getDiffLineClass(line)} key={`${file.path}-${index}`}>
                        {line}
                      </div>
                    ))}
                  </pre>
                </div>
              </article>
            )
          })}
        </div>
      </div>
    </section>
  )
}
