import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DiffViewer } from '@/components/loops/DiffViewer'
import { loopApi } from '@/lib/loopApi'

vi.mock('@/lib/loopApi', () => ({
  loopApi: {
    getDiff: vi.fn()
  }
}))

function buildDiffLineFixture(lineCount: number) {
  const body = Array.from({ length: lineCount }, (_, index) => `+added line ${index + 1}`)
  return [
    'diff --git a/src/example.ts b/src/example.ts',
    'index 1111111..2222222 100644',
    '--- a/src/example.ts',
    '+++ b/src/example.ts',
    '@@ -1,1 +1,1 @@',
    ...body
  ].join('\n')
}

describe('DiffViewer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows a loading state while diff data is pending', () => {
    vi.mocked(loopApi.getDiff).mockImplementation(() => new Promise(() => { }))

    render(<DiffViewer loopId="loop-1" />)

    expect(screen.getByText('Loading diff...')).toBeInTheDocument()
  })

  it('shows an empty state when diff is unavailable', async () => {
    vi.mocked(loopApi.getDiff).mockResolvedValue({
      available: false,
      reason: 'No worktree configured - diff unavailable.'
    })

    render(<DiffViewer loopId="loop-1" />)

    expect(
      await screen.findByText('No worktree configured - diff unavailable.')
    ).toBeInTheDocument()
  })

  it('renders preview lines and supports show-all/collapse toggling', async () => {
    vi.mocked(loopApi.getDiff).mockResolvedValue({
      available: true,
      baseBranch: 'main',
      worktreeBranch: 'task/loop-1',
      stats: {
        filesChanged: 1,
        additions: 40,
        deletions: 0
      },
      files: [
        {
          path: 'src/example.ts',
          status: 'M',
          additions: 40,
          deletions: 0,
          diff: buildDiffLineFixture(40)
        }
      ]
    })

    render(<DiffViewer loopId="loop-1" />)

    await waitFor(() => {
      expect(screen.getByText('1 files changed')).toBeInTheDocument()
    })
    expect(screen.getAllByText('src/example.ts').length).toBeGreaterThanOrEqual(1)
    expect(screen.queryByText('+added line 40')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /show all \d+ lines/i }))
    expect(await screen.findByText('+added line 40')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Collapse' }))
    expect(screen.queryByText('+added line 40')).not.toBeInTheDocument()
  })
})
