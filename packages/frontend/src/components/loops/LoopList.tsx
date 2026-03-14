import type { LoopSummary } from '@/lib/loopApi'
import { LoopCard } from '@/components/loops/LoopCard'

interface LoopListProps {
  loops: LoopSummary[]
  selectedLoopId: string | null
  onSelect: (loopId: string) => void
  onStop: (loopId: string) => Promise<void>
  onRestart: (loopId: string) => Promise<void>
}

export function LoopList({
  loops,
  selectedLoopId,
  onSelect,
  onStop,
  onRestart
}: LoopListProps) {
  if (loops.length === 0) {
    return (
      <section className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 text-sm text-zinc-400">
        No loops yet. Start a loop to see runs here.
      </section>
    )
  }

  return (
    <section className="min-w-0 grid gap-3">
      {loops.map((loop) => (
        <LoopCard
          key={loop.id}
          isSelected={selectedLoopId === loop.id}
          loop={loop}
          onRestart={onRestart}
          onSelect={onSelect}
          onStop={onStop}
        />
      ))}
    </section>
  )
}
