import { useCallback, useEffect, useMemo, useState } from 'react'
import { monitoringApi } from '@/lib/monitoringApi'
import type { FileChange } from '@/lib/monitoringApi'

interface FileChangesProps {
  fileChanges: FileChange[]
  loopId: string | null
}

export function FileChanges({ fileChanges, loopId }: FileChangesProps) {
  const sortedChanges = useMemo(
    () =>
      [...fileChanges].sort(
        (a, b) =>
          b.additions + b.deletions - (a.additions + a.deletions)
      ),
    [fileChanges]
  )
  const [expandedPath, setExpandedPath] = useState<string | null>(null)
  const [loadingPath, setLoadingPath] = useState<string | null>(null)
  const [contentByPath, setContentByPath] = useState<Record<string, string>>({})
  const [errorByPath, setErrorByPath] = useState<Record<string, string>>({})

  useEffect(() => {
    setExpandedPath(null)
    setLoadingPath(null)
    setContentByPath({})
    setErrorByPath({})
  }, [loopId])

  const toggleExpanded = useCallback(
    async (path: string) => {
      if (expandedPath === path) {
        setExpandedPath(null)
        return
      }

      setExpandedPath(path)
      if (!loopId || contentByPath[path] || loadingPath === path) {
        return
      }

      setLoadingPath(path)
      setErrorByPath((previous) => {
        if (!previous[path]) {
          return previous
        }
        const next = { ...previous }
        delete next[path]
        return next
      })

      try {
        const response = await monitoringApi.fileContent(loopId, path)
        setContentByPath((previous) => ({
          ...previous,
          [path]: response.content
        }))
      } catch (error) {
        setErrorByPath((previous) => ({
          ...previous,
          [path]:
            error instanceof Error
              ? error.message
              : 'Failed to load file content'
        }))
      } finally {
        setLoadingPath((previous) => (previous === path ? null : previous))
      }
    },
    [contentByPath, expandedPath, loadingPath, loopId]
  )

  return (
    <section className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
      <h3 className="text-lg font-semibold">File Changes</h3>
      {sortedChanges.length === 0 ? (
        <p className="text-sm text-zinc-400">No file changes detected yet.</p>
      ) : (
        <ul className="space-y-2">
          {sortedChanges.map((change) => {
            const isExpanded = expandedPath === change.path
            const isLoading = loadingPath === change.path
            const content = contentByPath[change.path]
            const error = errorByPath[change.path]

            return (
              <li
                key={change.path}
                className="rounded-md border border-zinc-800 bg-zinc-950/70 text-sm"
              >
                <div className="flex items-center gap-3 px-3 py-2">
                  <button
                    type="button"
                    onClick={() => void toggleExpanded(change.path)}
                    aria-expanded={isExpanded}
                    aria-label={`Show file content for ${change.path}`}
                    className="rounded p-1 text-zinc-300 transition hover:bg-zinc-800 hover:text-zinc-100"
                  >
                    <span
                      aria-hidden="true"
                      className={`block text-xs transition-transform ${
                        isExpanded ? 'rotate-90' : ''
                      }`}
                    >
                      ▶
                    </span>
                  </button>
                  <span className="truncate text-zinc-200">{change.path}</span>
                  <span className="ml-auto shrink-0 space-x-3 text-xs">
                    <span className="text-emerald-400">+{change.additions}</span>
                    <span className="text-red-400">-{change.deletions}</span>
                  </span>
                </div>

                {isExpanded ? (
                  <div className="border-t border-zinc-800 px-3 py-3">
                    {!loopId ? (
                      <p className="text-xs text-zinc-400">Select a loop to load file content.</p>
                    ) : isLoading ? (
                      <p className="text-xs text-zinc-400">Loading file content...</p>
                    ) : error ? (
                      <p className="text-xs text-red-400">{error}</p>
                    ) : typeof content === 'string' ? (
                      <pre className="max-h-96 overflow-auto rounded-md bg-zinc-950 p-3 font-mono text-xs leading-relaxed whitespace-pre text-zinc-100">
                        <code>{content}</code>
                      </pre>
                    ) : (
                      <p className="text-xs text-zinc-400">No file content available.</p>
                    )}
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
