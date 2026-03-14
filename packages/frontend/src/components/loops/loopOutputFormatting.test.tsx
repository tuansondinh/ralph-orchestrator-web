import { describe, expect, it } from 'vitest'
import { formatLoopOutput } from '@/components/loops/loopOutputFormatting'
import type { LoopOutputEntry } from '@/lib/loopApi'

function makeChunk(overrides: Partial<LoopOutputEntry> = {}): LoopOutputEntry {
  return {
    stream: overrides.stream ?? 'stdout',
    data: overrides.data ?? '',
    timestamp: overrides.timestamp
  }
}

describe('formatLoopOutput', () => {
  it('collapses carriage-return status redraws into the latest visible text', () => {
    const lines = formatLoopOutput([
      makeChunk({ data: '[connecting]\r[ACTIVE]\n[iter 1/20] 00:00\n' })
    ])

    expect(lines).toEqual([
      { stream: 'stdout', text: '[ACTIVE]', pending: false },
      { stream: 'stdout', text: '[iter 1/20] 00:00', pending: false }
    ])
  })

  it('strips ANSI escape sequences while preserving readable output', () => {
    const lines = formatLoopOutput([
      makeChunk({ data: '\x1b[32mgreen\x1b[0m ok\n' })
    ])

    expect(lines).toEqual([
      { stream: 'stdout', text: 'green ok', pending: false }
    ])
  })

  it('marks the final unterminated line as pending', () => {
    const lines = formatLoopOutput([
      makeChunk({ data: 'running' })
    ])

    expect(lines).toEqual([
      { stream: 'stdout', text: 'running', pending: true }
    ])
  })

  it('keeps stderr lines distinct from stdout lines', () => {
    const lines = formatLoopOutput([
      makeChunk({ data: 'done\n' }),
      makeChunk({ stream: 'stderr', data: 'warning\n' })
    ])

    expect(lines).toEqual([
      { stream: 'stdout', text: 'done', pending: false },
      { stream: 'stderr', text: 'warning', pending: false }
    ])
  })

  it('handles ANSI escape sequences split across chunk boundaries', () => {
    const lines = formatLoopOutput([
      makeChunk({ data: '\x1b[32mgreen' }),
      makeChunk({ data: '\x1b[0m ok\n' })
    ])

    expect(lines).toEqual([
      { stream: 'stdout', text: 'green ok', pending: false }
    ])
  })
})
