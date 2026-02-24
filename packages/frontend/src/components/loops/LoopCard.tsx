import type { LoopSummary } from '@/lib/loopApi'

interface LoopCardProps {
  loop: LoopSummary
  isSelected: boolean
  onSelect: (loopId: string) => void
  onStop: (loopId: string) => Promise<void>
  onRestart: (loopId: string) => Promise<void>
}

const ACTIVE_STATES = new Set(['running', 'queued', 'merging'])

function formatStateLabel(state: string) {
  if (state.length === 0) {
    return 'Unknown'
  }

  return `${state[0].toUpperCase()}${state.slice(1)}`
}

function toMilliseconds(timestamp: number | null) {
  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) {
    return null
  }

  // Backward compatibility: tolerate second-based timestamps from older rows.
  return timestamp < 1_000_000_000_000 ? timestamp * 1_000 : timestamp
}

function runtimeSeconds(loop: LoopSummary) {
  const startedAtMs = toMilliseconds(loop.startedAt) ?? Date.now()
  const endedAtMs = toMilliseconds(loop.endedAt)
  const effectiveEndMs =
    endedAtMs ?? (ACTIVE_STATES.has(loop.state) ? Date.now() : startedAtMs)

  return Math.max(0, Math.floor((effectiveEndMs - startedAtMs) / 1_000))
}

export function LoopCard({
  loop,
  isSelected,
  onSelect,
  onStop,
  onRestart
}: LoopCardProps) {
  return (
    <article
      className={`min-w-0 overflow-hidden space-y-3 rounded-lg border p-3 ${isSelected
        ? 'border-zinc-300 bg-zinc-900'
        : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700'
        }`}
    >
      <button
        className="w-full min-w-0 space-y-2 text-left"
        type="button"
        onClick={() => onSelect(loop.id)}
      >
        <div className="flex items-center justify-between gap-2">
          <p className="truncate font-medium text-zinc-100">{loop.id}</p>
          <span className="rounded-full border border-zinc-700 px-2 py-0.5 text-xs text-zinc-300">
            {formatStateLabel(loop.state)}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs text-zinc-400">
          <p>Hat: {loop.currentHat ?? 'n/a'}</p>
          <p>Iterations: {loop.iterations}</p>
          <p>Runtime: {runtimeSeconds(loop)}s</p>
          <p>Tokens: {loop.tokensUsed}</p>
        </div>
      </button>
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <button
            className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-800"
            type="button"
            onClick={() => onStop(loop.id)}
          >
            Stop
          </button>
          <button
            className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-800"
            type="button"
            onClick={() => onRestart(loop.id)}
          >
            Restart
          </button>
        </div>
        <p className="text-[11px] leading-4 text-zinc-500">
          If Stop does not work, use Kill Ralph process under{' '}
          <a className="text-zinc-300 underline underline-offset-2 hover:text-zinc-100" href="/settings">
            Global settings
          </a>
          .
        </p>
      </div>
    </article>
  )
}
