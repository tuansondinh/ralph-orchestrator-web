import { useEffect, useState } from 'react'
import { DiffViewer } from '@/components/loops/DiffViewer'
import type { LoopMetrics, LoopSummary } from '@/lib/loopApi'
import { TerminalOutput } from '@/components/loops/TerminalOutput'

interface LoopDetailProps {
  loop: LoopSummary | null
  metrics: LoopMetrics | null
  outputLines: string[]
}

type LoopDetailTab = 'output' | 'review'

const REVIEWABLE_STATES = new Set(['completed', 'needs-review', 'merged', 'stopped'])
const ACTIVE_OUTPUT_STATES = new Set(['running', 'queued', 'merging'])

export function LoopDetail({ loop, metrics, outputLines }: LoopDetailProps) {
  const [activeTab, setActiveTab] = useState<LoopDetailTab>('output')
  const showReviewTab = Boolean(loop && REVIEWABLE_STATES.has(loop.state))
  const outputEmptyMessage = ACTIVE_OUTPUT_STATES.has(loop.state)
    ? 'Waiting for loop output...'
    : 'No persisted logs found for this loop.'

  useEffect(() => {
    setActiveTab('output')
  }, [loop?.id])

  useEffect(() => {
    if (!showReviewTab) {
      setActiveTab('output')
    }
  }, [showReviewTab])

  if (!loop) {
    return (
      <section className="flex h-full min-h-[360px] items-center rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 text-sm text-zinc-400">
        Select a loop to inspect metrics and terminal output.
      </section>
    )
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
          <div className="h-full overflow-y-auto pr-1">
            <DiffViewer loopId={loop.id} />
          </div>
        ) : (
          <TerminalOutput lines={outputLines} emptyMessage={outputEmptyMessage} />
        )}
      </div>
    </section>
  )
}
