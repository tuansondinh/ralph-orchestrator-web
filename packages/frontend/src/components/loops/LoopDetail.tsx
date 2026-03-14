import { useEffect, useMemo, useState } from 'react'
import { CreatePRDialog } from '@/components/loops/CreatePRDialog'
import { DiffViewer } from '@/components/loops/DiffViewer'
import { LoopTerminalOutput } from '@/components/loops/LoopTerminalOutput'
import { githubApi } from '@/lib/githubApi'
import {
  loopApi,
  type LoopConfig,
  type LoopMetrics,
  type LoopOutputEntry,
  type LoopPullRequest,
  type LoopSummary
} from '@/lib/loopApi'
import { useLoopStore } from '@/stores/loopStore'

interface LoopDetailProps {
  loop: LoopSummary | null
  metrics: LoopMetrics | null
  outputChunks: LoopOutputEntry[]
}

type LoopDetailTab = 'output' | 'review'

const REVIEWABLE_STATES = new Set(['completed', 'needs-review', 'merged', 'stopped'])
const ACTIVE_OUTPUT_STATES = new Set(['running', 'queued', 'merging'])

function parseLoopConfig(config: string | null): LoopConfig {
  if (!config) {
    return {}
  }

  try {
    const parsed = JSON.parse(config) as LoopConfig
    return typeof parsed === 'object' && parsed !== null ? parsed : {}
  } catch {
    return {}
  }
}

export function LoopDetail({ loop, metrics, outputChunks }: LoopDetailProps) {
  const [activeTab, setActiveTab] = useState<LoopDetailTab>('output')
  const [isCreatePROpen, setIsCreatePROpen] = useState(false)
  const [pullRequest, setPullRequest] = useState<LoopPullRequest | null>(null)
  const [hasGitHubConnection, setHasGitHubConnection] = useState<boolean | null>(null)
  const [isRetryingPush, setIsRetryingPush] = useState(false)
  const [pushActionError, setPushActionError] = useState<string | null>(null)
  const [configOverride, setConfigOverride] = useState<string | null>(null)
  const updateLoopById = useLoopStore((state) => state.updateLoopById)
  const showReviewTab = Boolean(loop && REVIEWABLE_STATES.has(loop.state))
  const effectiveConfig = configOverride ?? loop?.config ?? null
  const parsedConfig = useMemo(() => parseLoopConfig(effectiveConfig), [effectiveConfig])
  const sourceBranch = parsedConfig.gitBranch?.name ?? ''
  const canCreatePullRequest = showReviewTab && parsedConfig.pushed === true && !pullRequest
  const pushError = parsedConfig.pushError?.trim() ?? ''
  const canRetryPush = showReviewTab && sourceBranch.length > 0 && pushError.length > 0 && !pullRequest
  const outputEmptyMessage = ACTIVE_OUTPUT_STATES.has(loop?.state ?? '')
    ? 'Waiting for loop output...'
    : 'No persisted logs found for this loop.'

  useEffect(() => {
    setActiveTab('output')
  }, [loop?.id])

  useEffect(() => {
    setConfigOverride(null)
    setPullRequest(parsedConfig.pullRequest ?? null)
    setIsCreatePROpen(false)
    setPushActionError(null)
    setIsRetryingPush(false)
  }, [loop?.id])

  useEffect(() => {
    setPullRequest(parsedConfig.pullRequest ?? null)
  }, [parsedConfig.pullRequest])

  useEffect(() => {
    if (!showReviewTab) {
      setActiveTab('output')
    }
  }, [showReviewTab])

  useEffect(() => {
    let cancelled = false

    if (!canCreatePullRequest) {
      setHasGitHubConnection(null)
      return
    }

    githubApi
      .getConnection()
      .then((connection) => {
        if (!cancelled) {
          setHasGitHubConnection(connection !== null)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHasGitHubConnection(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [canCreatePullRequest, loop?.id])

  if (!loop) {
    return (
      <section className="flex h-full min-h-[360px] items-center rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 text-sm text-zinc-400">
        Select a loop to inspect metrics and terminal output.
      </section>
    )
  }

  const handleRetryPush = async () => {
    setIsRetryingPush(true)
    setPushActionError(null)

    try {
      const refreshed = await loopApi.retryPush(loop.id)
      setConfigOverride(refreshed.config)
      updateLoopById(loop.id, {
        state: refreshed.state,
        config: refreshed.config,
        endedAt: refreshed.endedAt,
        iterations: refreshed.iterations,
        tokensUsed: refreshed.tokensUsed,
        errors: refreshed.errors
      })
    } catch (retryError) {
      setPushActionError(
        retryError instanceof Error ? retryError.message : 'Failed to retry push'
      )
    } finally {
      setIsRetryingPush(false)
    }
  }

  const handlePullRequestCreated = (createdPullRequest: LoopPullRequest) => {
    const nextConfig = JSON.stringify({
      ...parsedConfig,
      pushed: true,
      pullRequest: createdPullRequest
    })
    setPullRequest(createdPullRequest)
    setConfigOverride(nextConfig)
    updateLoopById(loop.id, {
      config: nextConfig
    })
  }

  return (
    <section className="flex h-full min-h-0 min-w-0 flex-col gap-3 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
      <div className="grid grid-cols-2 gap-2 text-sm text-zinc-300 md:grid-cols-4">
        <p>Iterations: {metrics?.iterations ?? loop.iterations}</p>
        <p>Runtime: {metrics?.runtime ?? 0}s</p>
        <p>Tokens: {metrics?.tokensUsed ?? loop.tokensUsed}</p>
        <p>Errors: {metrics?.errors ?? loop.errors}</p>
      </div>

      {showReviewTab ? (
        <div
          aria-label="Loop detail sections"
          className="inline-flex gap-1 rounded-md border border-zinc-800 bg-zinc-900/50 p-1"
          role="tablist"
        >
          <button
            aria-selected={activeTab === 'output'}
            className={`rounded px-3 py-1.5 text-sm transition-colors ${activeTab === 'output'
              ? 'bg-zinc-200 text-zinc-900'
              : 'text-zinc-300 hover:bg-zinc-800'
              }`}
            onClick={() => setActiveTab('output')}
            role="tab"
            type="button"
          >
            Output
          </button>
          <button
            aria-selected={activeTab === 'review'}
            className={`rounded px-3 py-1.5 text-sm font-semibold transition-colors ${activeTab === 'review'
              ? 'bg-amber-300 text-amber-950 shadow-sm'
              : 'border border-amber-500/60 bg-amber-500/15 text-amber-200 hover:bg-amber-500/25'
              }`}
            onClick={() => setActiveTab('review')}
            role="tab"
            type="button"
          >
            Review Changes
          </button>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-hidden">
        {showReviewTab && activeTab === 'review' ? (
          <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-zinc-800 bg-zinc-950/50 px-3 py-2">
              <div className="text-sm text-zinc-400">
                {sourceBranch ? (
                  <span>
                    Source branch: <code>{sourceBranch}</code>
                  </span>
                ) : (
                  <span>Review the loop diff before opening a pull request.</span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {canRetryPush ? (
                  <button
                    className="rounded-md border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-100 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={isRetryingPush}
                    onClick={() => void handleRetryPush()}
                    type="button"
                  >
                    {isRetryingPush ? 'Retrying push...' : 'Retry Push'}
                  </button>
                ) : null}
                {pullRequest ? (
                  <a
                    className="rounded-md border border-emerald-500/60 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200 hover:bg-emerald-500/20"
                    href={pullRequest.url}
                    rel="noreferrer"
                    target="_blank"
                  >
                    View Pull Request
                  </a>
                ) : null}
                {canCreatePullRequest ? (
                  <button
                    className="rounded-md border border-amber-500/60 bg-amber-500/15 px-3 py-2 text-sm font-medium text-amber-100 hover:bg-amber-500/25 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={hasGitHubConnection !== true}
                    onClick={() => setIsCreatePROpen(true)}
                    type="button"
                  >
                    Create Pull Request
                  </button>
                ) : null}
              </div>
            </div>
            {pushError ? (
              <p className="text-sm text-red-300">
                Push failed: {pushError}
              </p>
            ) : null}
            {pushActionError ? (
              <p className="text-sm text-red-300">{pushActionError}</p>
            ) : null}
            {canCreatePullRequest && hasGitHubConnection === false ? (
              <p className="text-sm text-amber-200">
                Connect GitHub in Settings before creating a pull request.
              </p>
            ) : null}
            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              <DiffViewer loopId={loop.id} />
            </div>
            {isCreatePROpen && sourceBranch ? (
              <CreatePRDialog
                defaultTargetBranch={parsedConfig.gitBranch?.baseBranch}
                loopId={loop.id}
                projectId={loop.projectId}
                prompt={loop.prompt}
                sourceBranch={sourceBranch}
                onClose={() => setIsCreatePROpen(false)}
                onCreated={handlePullRequestCreated}
              />
            ) : null}
          </div>
        ) : (
          <LoopTerminalOutput chunks={outputChunks} emptyMessage={outputEmptyMessage} />
        )}
      </div>
    </section>
  )
}
