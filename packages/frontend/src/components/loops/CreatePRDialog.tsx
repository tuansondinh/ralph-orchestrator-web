import { FormEvent, useEffect, useMemo, useState } from 'react'
import { loopApi, type GitBranchInfo, type LoopDiff, type LoopPullRequest } from '@/lib/loopApi'

interface CreatePRDialogProps {
  loopId: string
  projectId: string
  sourceBranch: string
  defaultTargetBranch?: string
  prompt?: string | null
  onClose: () => void
  onCreated: (pullRequest: LoopPullRequest) => void
}

function summarizePrompt(prompt?: string | null) {
  const normalized = (prompt ?? '').trim().replace(/\s+/g, ' ')
  if (!normalized) {
    return 'Update changes'
  }

  return normalized.slice(0, 60)
}

function normalizeBranches(branches: GitBranchInfo[]) {
  return Array.from(new Map(branches.map((branch) => [branch.name, branch])).values())
}

function buildDefaultBody(
  sourceBranch: string,
  targetBranch: string,
  diff: LoopDiff | null
) {
  const files = diff?.files ?? []
  const stats = diff?.stats
  const lines = [
    '## Summary',
    `- Source branch: ${sourceBranch}`,
    `- Target branch: ${targetBranch}`,
    `- Files changed: ${stats?.filesChanged ?? files.length}`,
    `- Additions: ${stats?.additions ?? 0}`,
    `- Deletions: ${stats?.deletions ?? 0}`
  ]

  if (files.length > 0) {
    lines.push('', '## Changed files')
    for (const file of files) {
      lines.push(`- ${file.path}`)
    }
  }

  return lines.join('\n')
}

export function CreatePRDialog({
  loopId,
  projectId,
  sourceBranch,
  defaultTargetBranch,
  prompt,
  onClose,
  onCreated
}: CreatePRDialogProps) {
  const [branches, setBranches] = useState<GitBranchInfo[]>([])
  const [targetBranch, setTargetBranch] = useState(defaultTargetBranch ?? '')
  const [title, setTitle] = useState(`ralph: ${summarizePrompt(prompt)}`)
  const [body, setBody] = useState('')
  const [draft, setDraft] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [bodyDirty, setBodyDirty] = useState(false)
  const [diff, setDiff] = useState<LoopDiff | null>(null)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setIsLoading(true)
      setError(null)

      try {
        const [branchResult, diffResult] = await Promise.allSettled([
          loopApi.listBranches(projectId),
          loopApi.getDiff(loopId)
        ])

        if (cancelled) {
          return
        }

        const nextBranches =
          branchResult.status === 'fulfilled' ? normalizeBranches(branchResult.value) : []
        const nextDiff = diffResult.status === 'fulfilled' ? diffResult.value : null
        const availableTargetBranch =
          defaultTargetBranch && nextBranches.some((branch) => branch.name === defaultTargetBranch)
            ? defaultTargetBranch
            : nextDiff?.baseBranch ??
            nextBranches.find((branch) => branch.current)?.name ??
            nextBranches[0]?.name ??
            defaultTargetBranch ??
            ''

        setBranches(nextBranches)
        setDiff(nextDiff)
        setTargetBranch(availableTargetBranch)
        setBody(buildDefaultBody(sourceBranch, availableTargetBranch, nextDiff))

        if (branchResult.status === 'rejected') {
          setError(
            branchResult.reason instanceof Error
              ? branchResult.reason.message
              : 'Failed to load target branches'
          )
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
  }, [defaultTargetBranch, loopId, projectId, sourceBranch])

  useEffect(() => {
    if (bodyDirty || !targetBranch) {
      return
    }

    setBody(buildDefaultBody(sourceBranch, targetBranch, diff))
  }, [bodyDirty, diff, sourceBranch, targetBranch])

  const branchOptions = useMemo(
    () => branches.map((branch) => branch.name),
    [branches]
  )

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsSubmitting(true)
    setError(null)

    try {
      const pullRequest = await loopApi.createPullRequest({
        loopId,
        targetBranch,
        title: title.trim() || undefined,
        body: body.trim() || undefined,
        draft
      })
      onCreated(pullRequest)
      onClose()
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : 'Failed to create pull request'
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div
      aria-label="Create pull request dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="dialog"
    >
      <div className="w-full max-w-xl rounded-lg border border-zinc-800 bg-zinc-900 p-5">
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-1">
            <h2 className="text-xl font-semibold text-zinc-100">Create pull request</h2>
            <p className="text-sm text-zinc-400">
              Open a GitHub pull request from <code>{sourceBranch}</code>.
            </p>
          </div>

          <div className="space-y-1">
            <label className="text-sm text-zinc-300" htmlFor="create-pr-target-branch">
              Target branch
            </label>
            <select
              className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
              disabled={isLoading || branchOptions.length === 0}
              id="create-pr-target-branch"
              onChange={(event) => setTargetBranch(event.target.value)}
              value={targetBranch}
            >
              {branchOptions.length === 0 ? (
                <option value="">{isLoading ? 'Loading branches...' : 'No branches available'}</option>
              ) : (
                branchOptions.map((branchName) => (
                  <option key={branchName} value={branchName}>
                    {branchName}
                  </option>
                ))
              )}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-sm text-zinc-300" htmlFor="create-pr-title">
              Pull request title
            </label>
            <input
              className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
              id="create-pr-title"
              onChange={(event) => setTitle(event.target.value)}
              value={title}
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm text-zinc-300" htmlFor="create-pr-body">
              Pull request body
            </label>
            <textarea
              className="min-h-48 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
              id="create-pr-body"
              onChange={(event) => {
                setBody(event.target.value)
                setBodyDirty(true)
              }}
              value={body}
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input
              checked={draft}
              type="checkbox"
              onChange={(event) => setDraft(event.target.checked)}
            />
            Create as draft
          </label>

          {error ? <p className="text-sm text-red-300">{error}</p> : null}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              className="rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
              onClick={onClose}
              type="button"
            >
              Cancel
            </button>
            <button
              className="rounded-md bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 disabled:opacity-50"
              disabled={isSubmitting || isLoading || !targetBranch.trim()}
              type="submit"
            >
              {isSubmitting ? 'Creating...' : 'Create PR'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
