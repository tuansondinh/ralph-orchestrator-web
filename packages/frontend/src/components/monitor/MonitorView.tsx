import { useCallback, useEffect, useMemo, useState } from 'react'
import { EventTimeline } from '@/components/monitor/EventTimeline'
import { MetricsPanel } from '@/components/monitor/MetricsPanel'
import { StatusCards } from '@/components/monitor/StatusCards'
import { useWebSocket } from '@/hooks/useWebSocket'
import { loopApi, type LoopSummary } from '@/lib/loopApi'
import {
  monitoringApi,
  type FileChange,
  type MonitoringEvent,
  type MonitoringLoopMetrics,
  type ProjectStatus
} from '@/lib/monitoringApi'

interface MonitorViewProps {
  projectId: string
}

const EMPTY_LOOPS: LoopSummary[] = []
const EMPTY_FILE_CHANGES: FileChange[] = []
const EMPTY_CHANNELS: string[] = []

function asNumber(value: unknown, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  return fallback
}

function asFileChanges(value: unknown): FileChange[] {
  if (!Array.isArray(value)) {
    return EMPTY_FILE_CHANGES
  }

  return value
    .filter((candidate): candidate is Record<string, unknown> => typeof candidate === 'object' && candidate !== null)
    .map((candidate) => ({
      path: typeof candidate.path === 'string' ? candidate.path : '',
      additions: asNumber(candidate.additions),
      deletions: asNumber(candidate.deletions)
    }))
    .filter((candidate) => candidate.path.length > 0)
}

function asFilesChanged(value: unknown, fallback: FileChange[]) {
  if (!Array.isArray(value)) {
    return fallback.map((change) => change.path)
  }

  return value
    .filter((candidate): candidate is string => typeof candidate === 'string' && candidate.length > 0)
}

function chooseDefaultLoopId(loops: LoopSummary[]) {
  if (loops.length === 0) {
    return null
  }

  const running = loops.find((loop) => loop.state === 'running')
  return running?.id ?? loops[0]?.id ?? null
}

export function MonitorView({ projectId }: MonitorViewProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<ProjectStatus | null>(null)
  const [events, setEvents] = useState<MonitoringEvent[]>([])
  const [loops, setLoops] = useState<LoopSummary[]>([])
  const [selectedLoopId, setSelectedLoopId] = useState<string | null>(null)
  const [metrics, setMetrics] = useState<MonitoringLoopMetrics | null>(null)

  const refreshStatusAndEvents = useCallback(async () => {
    const [nextStatus, nextEvents] = await Promise.all([
      monitoringApi.projectStatus(projectId),
      monitoringApi.eventHistory({ projectId })
    ])
    setStatus(nextStatus)
    setEvents(nextEvents)
  }, [projectId])

  useEffect(() => {
    let cancelled = false

    setIsLoading(true)
    setError(null)

    Promise.all([
      monitoringApi.projectStatus(projectId),
      monitoringApi.eventHistory({ projectId }),
      loopApi.list(projectId)
    ])
      .then(([nextStatus, nextEvents, nextLoops]) => {
        if (cancelled) {
          return
        }

        setStatus(nextStatus)
        setEvents(nextEvents)
        setLoops(nextLoops)
        setSelectedLoopId(chooseDefaultLoopId(nextLoops))
      })
      .catch((nextError) => {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : 'Failed to load monitoring data')
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [projectId])

  useEffect(() => {
    if (!selectedLoopId) {
      setMetrics(null)
      return
    }

    let cancelled = false
    monitoringApi
      .loopMetrics(selectedLoopId)
      .then((nextMetrics) => {
        if (!cancelled) {
          setMetrics(nextMetrics)
        }
      })
      .catch((nextError) => {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : 'Failed to load loop metrics')
        }
      })

    return () => {
      cancelled = true
    }
  }, [selectedLoopId])

  const channels = useMemo(
    () => (selectedLoopId ? [`loop:${selectedLoopId}:metrics`] : EMPTY_CHANNELS),
    [selectedLoopId]
  )

  const handleMessage = useCallback(
    (message: Record<string, unknown>) => {
      if (message.type !== 'loop.metrics' || typeof message.loopId !== 'string') {
        return
      }

      if (selectedLoopId && message.loopId !== selectedLoopId) {
        return
      }

      const fileChanges = asFileChanges(message.fileChanges)
      const nextMetrics: MonitoringLoopMetrics = {
        iterations: asNumber(message.iterations),
        runtime: asNumber(message.runtime),
        tokensUsed: asNumber(message.tokensUsed),
        errors: asNumber(message.errors),
        lastOutputSize: asNumber(message.lastOutputSize),
        filesChanged: asFilesChanged(message.filesChanged, fileChanges),
        fileChanges
      }

      setMetrics(nextMetrics)
      void refreshStatusAndEvents().catch(() => {})
    },
    [refreshStatusAndEvents, selectedLoopId]
  )

  const { isConnected } = useWebSocket({
    channels,
    onMessage: handleMessage
  })

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Monitor</h2>
        <span className="text-xs text-zinc-400">
          {isConnected ? 'Live connected' : 'Connecting...'}
        </span>
      </div>
      <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
        This Monitor tab is experimental and not fully implemented yet.
      </p>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      {isLoading ? <p className="text-sm text-zinc-400">Loading monitoring data...</p> : null}

      <StatusCards status={status} />

      <div className="grid gap-4 xl:grid-cols-2">
        <MetricsPanel
          loops={loops.length > 0 ? loops : EMPTY_LOOPS}
          selectedLoopId={selectedLoopId}
          metrics={metrics}
          onSelectLoop={(loopId) => setSelectedLoopId(loopId)}
        />
        <EventTimeline events={events} />
      </div>
    </section>
  )
}
