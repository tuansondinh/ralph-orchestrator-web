import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LoopSummary } from '@/lib/loopApi'
import { LoopCard } from '@/components/loops/LoopCard'

const noop = async () => {}

function buildLoop(overrides: Partial<LoopSummary> = {}): LoopSummary {
  return {
    id: 'loop-1',
    projectId: 'project-1',
    processId: null,
    state: 'completed',
    config: null,
    prompt: null,
    worktree: null,
    iterations: 1,
    tokensUsed: 10,
    errors: 0,
    startedAt: 1_770_768_000_000,
    endedAt: 1_770_768_005_000,
    currentHat: null,
    ...overrides
  }
}

describe('LoopCard runtime', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('uses endedAt for completed loops so runtime does not keep increasing', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_770_768_300_000)

    render(
      <LoopCard
        loop={buildLoop({ state: 'completed' })}
        isSelected={false}
        onSelect={() => {}}
        onStop={noop}
        onRestart={noop}
      />
    )

    expect(screen.getByText('Runtime: 5s')).toBeInTheDocument()
  })

  it('uses current time for running loops', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_770_768_015_000)

    render(
      <LoopCard
        loop={buildLoop({ state: 'running', endedAt: null })}
        isSelected={false}
        onSelect={() => {}}
        onStop={noop}
        onRestart={noop}
      />
    )

    expect(screen.getByText('Runtime: 15s')).toBeInTheDocument()
  })
})
