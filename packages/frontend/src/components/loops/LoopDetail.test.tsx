import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LoopDetail } from '@/components/loops/LoopDetail'
import type { LoopMetrics, LoopSummary } from '@/lib/loopApi'

vi.mock('@/components/loops/DiffViewer', () => ({
  DiffViewer: ({ loopId }: { loopId: string }) => <div>DiffViewer for {loopId}</div>
}))

const baseLoop: LoopSummary = {
  id: 'loop-1',
  projectId: 'project-1',
  processId: null,
  state: 'running',
  config: null,
  prompt: 'Ship it',
  worktree: 'task/loop-1',
  iterations: 3,
  tokensUsed: 42,
  errors: 0,
  startedAt: 1_770_768_000_000,
  endedAt: null,
  currentHat: 'builder'
}

const metrics: LoopMetrics = {
  iterations: 3,
  runtime: 30,
  tokensUsed: 42,
  errors: 0,
  lastOutputSize: 10,
  filesChanged: ['src/example.ts']
}

describe('LoopDetail', () => {
  afterEach(() => {
    cleanup()
  })

  it('hides the Review Changes tab for non-reviewable loop states', () => {
    render(<LoopDetail loop={baseLoop} metrics={metrics} outputLines={['line-1']} />)

    expect(screen.queryByRole('tab', { name: 'Review Changes' })).not.toBeInTheDocument()
    expect(screen.getByText('line-1')).toBeInTheDocument()
  })

  it('shows the Review Changes tab for reviewable loop states and renders diff viewer when selected', () => {
    render(
      <LoopDetail
        loop={{ ...baseLoop, state: 'completed' }}
        metrics={metrics}
        outputLines={['line-1']}
      />
    )

    expect(screen.getByRole('tab', { name: 'Review Changes' })).toBeInTheDocument()
    expect(screen.queryByText('DiffViewer for loop-1')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: 'Review Changes' }))
    expect(screen.getByText('DiffViewer for loop-1')).toBeInTheDocument()
  })
})
