import type { LoopSummary } from '@/lib/loopApi'
import type { MonitoringLoopMetrics } from '@/lib/monitoringApi'

interface MetricsPanelProps {
  loops: LoopSummary[]
  selectedLoopId: string | null
  metrics: MonitoringLoopMetrics | null
  onSelectLoop: (loopId: string) => void
}

function resolveLoopLabel(loop: LoopSummary) {
  if (loop.prompt) {
    return `${loop.id} (${loop.prompt})`
  }

  return loop.id
}

export function MetricsPanel({
  loops,
  selectedLoopId,
  metrics,
  onSelectLoop
}: MetricsPanelProps) {
  const selectedLoop = selectedLoopId
    ? loops.find((loop) => loop.id === selectedLoopId) ?? null
    : null

  return (
    <section className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-semibold">Metrics</h3>
        {loops.length > 0 ? (
          <select
            aria-label="Select loop"
            className="max-w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-sm text-zinc-100"
            onChange={(event) => onSelectLoop(event.target.value)}
            value={selectedLoopId ?? ''}
          >
            {loops.map((loop) => (
              <option key={loop.id} value={loop.id}>
                {resolveLoopLabel(loop)}
              </option>
            ))}
          </select>
        ) : null}
      </div>

      {loops.length === 0 || !selectedLoop ? (
        <p className="text-sm text-zinc-400">No loop metrics yet.</p>
      ) : !metrics ? (
        <p className="text-sm text-zinc-400">Loading metrics...</p>
      ) : (
        <div className="grid gap-2 text-sm text-zinc-200 sm:grid-cols-2">
          <p>Iterations: {metrics.iterations}</p>
          <p>Runtime: {metrics.runtime}s</p>
          <p>Tokens: {metrics.tokensUsed}</p>
          <p>Errors: {metrics.errors}</p>
          <p>Last Output Size: {metrics.lastOutputSize}</p>
          <p>Files Changed: {metrics.filesChanged.length}</p>
        </div>
      )}
    </section>
  )
}
