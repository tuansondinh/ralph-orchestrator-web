import { beforeEach, describe, expect, it } from 'vitest'
import { resetLoopStore, useLoopStore } from '@/stores/loopStore'
import type { LoopMetrics, LoopSummary } from '@/lib/loopApi'

function makeLoop(overrides: Partial<LoopSummary> = {}): LoopSummary {
  return {
    id: overrides.id ?? 'loop-1',
    projectId: overrides.projectId ?? 'project-1',
    ralphLoopId: overrides.ralphLoopId ?? null,
    processId: overrides.processId ?? null,
    state: overrides.state ?? 'running',
    config: overrides.config ?? null,
    prompt: overrides.prompt ?? 'Do something',
    worktree: overrides.worktree ?? null,
    iterations: overrides.iterations ?? 0,
    tokensUsed: overrides.tokensUsed ?? 0,
    errors: overrides.errors ?? 0,
    startedAt: overrides.startedAt ?? 1000,
    endedAt: overrides.endedAt ?? null,
    currentHat: overrides.currentHat ?? null
  }
}

function makeMetrics(overrides: Partial<LoopMetrics> = {}): LoopMetrics {
  return {
    iterations: overrides.iterations ?? 0,
    runtime: overrides.runtime ?? 0,
    tokensUsed: overrides.tokensUsed ?? 0,
    errors: overrides.errors ?? 0,
    lastOutputSize: overrides.lastOutputSize ?? 0,
    filesChanged: overrides.filesChanged ?? []
  }
}

describe('loopStore', () => {
  beforeEach(() => {
    resetLoopStore()
  })

  it('upsertLoop adds a new loop to the project', () => {
    const loop = makeLoop({ id: 'loop-1' })
    useLoopStore.getState().upsertLoop('project-1', loop)
    expect(useLoopStore.getState().loopsByProject['project-1']).toHaveLength(1)
    expect(useLoopStore.getState().loopsByProject['project-1'][0]).toEqual(loop)
  })

  it('upsertLoop updates an existing loop with same id', () => {
    useLoopStore.getState().upsertLoop('project-1', makeLoop({ id: 'loop-1', state: 'running' }))
    useLoopStore
      .getState()
      .upsertLoop('project-1', makeLoop({ id: 'loop-1', state: 'completed' }))
    const loops = useLoopStore.getState().loopsByProject['project-1']
    expect(loops).toHaveLength(1)
    expect(loops[0].state).toBe('completed')
  })

  it('upsertLoop prepends new loops so newest appears first', () => {
    useLoopStore.getState().upsertLoop('project-1', makeLoop({ id: 'loop-1' }))
    useLoopStore.getState().upsertLoop('project-1', makeLoop({ id: 'loop-2' }))
    const ids = useLoopStore.getState().loopsByProject['project-1'].map((l) => l.id)
    expect(ids[0]).toBe('loop-2')
    expect(ids[1]).toBe('loop-1')
  })

  it('appendOutput appends raw chunks to the correct loop', () => {
    useLoopStore.getState().appendOutput('loop-1', 'chunk A')
    useLoopStore.getState().appendOutput('loop-1', 'chunk B')
    useLoopStore.getState().appendOutput('loop-2', 'other')
    expect(useLoopStore.getState().outputChunksByLoop['loop-1']).toEqual(['chunk A', 'chunk B'])
    expect(useLoopStore.getState().outputChunksByLoop['loop-2']).toEqual(['other'])
  })

  it('appendOutput truncates output beyond MAX_OUTPUT_CHUNKS_PER_LOOP (2000)', () => {
    for (let i = 0; i < 2001; i++) {
      useLoopStore.getState().appendOutput('loop-1', `chunk-${i}`)
    }
    const output = useLoopStore.getState().outputChunksByLoop['loop-1']
    expect(output.length).toBe(2000)
    expect(output[output.length - 1]).toBe('chunk-2000')
    // Oldest chunk was dropped
    expect(output[0]).toBe('chunk-1')
  })

  it('appendOutputs stores raw chunks without line splitting', () => {
    useLoopStore.getState().appendOutputs({
      'loop-1': ['[connecting]\r[ACTIVE]\n', '[iter 1/20] ', '00:00\nnext\n']
    })

    expect(useLoopStore.getState().outputChunksByLoop['loop-1']).toEqual([
      '[connecting]\r[ACTIVE]\n',
      '[iter 1/20] ',
      '00:00\nnext\n'
    ])
  })

  it('appendOutputs keeps chunks isolated per loop', () => {
    useLoopStore.getState().appendOutputs({
      'loop-1': ['alpha'],
      'loop-2': ['beta\n']
    })

    expect(useLoopStore.getState().outputChunksByLoop['loop-1']).toEqual(['alpha'])
    expect(useLoopStore.getState().outputChunksByLoop['loop-2']).toEqual(['beta\n'])

    useLoopStore.getState().appendOutputs({
      'loop-1': [' done\n']
    })

    expect(useLoopStore.getState().outputChunksByLoop['loop-1']).toEqual(['alpha', ' done\n'])
  })

  it('appendOutputs appends multiple raw chunks as-is without splitting', () => {
    useLoopStore.getState().appendOutputs({
      'loop-1': ['\x1b[32mgreen text\x1b[0m', '\x1b[1mbold\x1b[0m\r\ncursor move']
    })

    const chunks = useLoopStore.getState().outputChunksByLoop['loop-1']
    expect(chunks).toHaveLength(2)
    expect(chunks[0]).toBe('\x1b[32mgreen text\x1b[0m')
    expect(chunks[1]).toBe('\x1b[1mbold\x1b[0m\r\ncursor move')
  })

  it('setMetrics stores metrics for a loop', () => {
    const metrics = makeMetrics({ iterations: 5, tokensUsed: 1000 })
    useLoopStore.getState().setMetrics('loop-1', metrics)
    expect(useLoopStore.getState().metricsByLoop['loop-1']).toEqual(metrics)
  })

  it('setMetrics keeps maximum values when updating existing metrics', () => {
    useLoopStore
      .getState()
      .setMetrics('loop-1', makeMetrics({ iterations: 5, tokensUsed: 1000, runtime: 200 }))
    useLoopStore
      .getState()
      .setMetrics('loop-1', makeMetrics({ iterations: 3, tokensUsed: 2000, runtime: 100 }))
    const m = useLoopStore.getState().metricsByLoop['loop-1']!
    expect(m.iterations).toBe(5) // max(5, 3)
    expect(m.tokensUsed).toBe(2000) // max(1000, 2000)
    expect(m.runtime).toBe(200) // max(200, 100)
  })

  it('setLoops replaces all loops for a project', () => {
    useLoopStore.getState().upsertLoop('project-1', makeLoop({ id: 'loop-1' }))
    useLoopStore
      .getState()
      .setLoops('project-1', [makeLoop({ id: 'loop-a' }), makeLoop({ id: 'loop-b' })])
    const ids = useLoopStore.getState().loopsByProject['project-1'].map((l) => l.id)
    expect(ids).toEqual(['loop-a', 'loop-b'])
  })
})
