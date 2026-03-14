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
import type { MonitoringEvent } from '@/lib/monitoringApi'
import { useLoopStore } from '@/stores/loopStore'

interface LoopDetailProps {
  loop: LoopSummary | null
  metrics: LoopMetrics | null
  outputChunks: LoopOutputEntry[]
  lastEventAt: number | null
  recentEvents: MonitoringEvent[]
}

const REVIEWABLE_STATES = new Set(['completed', 'needs-review', 'merged', 'stopped'])
const ACTIVE_WATCH_STATES = new Set(['running', 'queued', 'merging'])

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

function summarizeEventPayload(payload: unknown): string | null {
  if (typeof payload === 'string') {
    const normalized = payload.replace(/\s+/g, ' ').trim()
    return normalized.length > 0 ? normalized.slice(0, 160) : null
  }

  return null
}

export function LoopDetail({ loop, metrics, outputChunks, lastEventAt, recentEvents }: LoopDetailProps) {
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
  const watchFiles = ACTIVE_WATCH_STATES.has(loop?.state ?? '')
  const canCreatePullRequest = showReviewTab && parsedConfig.pushed === true && !pullRequest
  const pushError = parsedConfig.pushError?.trim() ?? ''
  const canRetryPush = showReviewTab && sourceBranch.length > 0 && pushError.length > 0 && !pullRequest
  const latestOutputChunk = outputChunks.at(-1) ?? null
  const currentHat = loop?.currentHat?.trim() ?? ''
  const latestRalphEvent = recentEvents[0] ?? null
  const latestRalphEventPayload = summarizeEventPayload(latestRalphEvent?.payload)
  const lastOutputAtLabel = useMemo(() => {
    const timestamp = latestOutputChunk?.timestamp
    if (!timestamp) {
      return null
    }

    const parsed = new Date(timestamp)
    if (Number.isNaN(parsed.getTime())) {
      return null
    }

    return parsed.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  }, [latestOutputChunk?.timestamp])
  const lastEventAtLabel = useMemo(() => {
    if (!lastEventAt) {
      return null
    }

    const parsed = new Date(lastEventAt)
    if (Number.isNaN(parsed.getTime())) {
      return null
    }

    return parsed.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  }, [lastEventAt])
  const activityTone =
    loop?.state === 'running'
      ? lastEventAt && Date.now() - lastEventAt <= 15_000
        ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100'
        : 'border-amber-500/40 bg-amber-500/10 text-amber-100'
      : 'border-zinc-700 bg-zinc-950/40 text-zinc-200'
  const activityMessage =
    loop?.state === 'running'
      ? lastEventAt && Date.now() - lastEventAt <= 15_000
        ? 'Loop is actively sending updates.'
        : 'Loop is running but has not sent a recent update.'
      : 'Loop is not actively running.'
  const latestRalphEventLabel = useMemo(() => {
    if (!latestRalphEvent) {
      return null
    }

    return new Date(latestRalphEvent.timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  }, [latestRalphEvent])

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
        Select a loop to inspect metrics and loop details.
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

      <div className="min-h-0 flex-1 overflow-hidden">
        <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
          {showReviewTab ? (
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
          ) : null}
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
          <section className={`rounded-md border px-3 py-2 text-sm ${activityTone}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span>{activityMessage}</span>
                {latestRalphEvent ? (
                  <div className="text-xs text-zinc-100">
                    <span className="font-medium">Latest Ralph event:</span>{' '}
                    <code>{latestRalphEvent.topic}</code>
                    {latestRalphEventPayload ? <span> {latestRalphEventPayload}</span> : null}
                  </div>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs opacity-90">
                <span>State: {loop.state}</span>
                {currentHat ? <span>Hat: {currentHat}</span> : null}
                {lastEventAtLabel ? <span>Last event: {lastEventAtLabel}</span> : null}
              </div>
            </div>
            {latestRalphEvent ? (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs opacity-90">
                <span>Event details:</span>
                <code>{latestRalphEvent.topic}</code>
                {latestRalphEvent.sourceHat ? <span>Hat: {latestRalphEvent.sourceHat}</span> : null}
                {latestRalphEventLabel ? <span>{latestRalphEventLabel}</span> : null}
              </div>
            ) : null}
          </section>
          <section className="flex min-h-[220px] flex-col overflow-hidden rounded-md border border-zinc-800 bg-zinc-950/30">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 px-3 py-2 text-sm">
              <div className="text-zinc-200">Live Output</div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                <span>{watchFiles ? 'Streaming selected loop output' : 'Replay from selected loop'}</span>
                {lastOutputAtLabel ? <span>Last output: {lastOutputAtLabel}</span> : null}
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden p-3">
              <LoopTerminalOutput
                chunks={outputChunks}
                emptyMessage={
                  watchFiles
                    ? 'Waiting for loop output. If the loop is active but quiet, the next chunk will appear here.'
                    : 'No saved loop output for this run.'
                }
              />
            </div>
          </section>
          <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-zinc-800 bg-zinc-950/30">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 px-3 py-2 text-sm">
              <div className="text-zinc-200">File Watcher</div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                <span>{loop.worktree ? `Worktree: ${loop.worktree}` : 'Primary workspace'}</span>
                {sourceBranch ? <span>Branch: {sourceBranch}</span> : null}
                <span>{watchFiles ? 'Live diff' : 'Snapshot diff'}</span>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              <DiffViewer loopId={loop.id} watch={watchFiles} />
            </div>
          </section>
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
      </div>
    </section>
  )
}
