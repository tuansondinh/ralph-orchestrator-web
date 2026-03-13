import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LoopDetail } from '@/components/loops/LoopDetail'
import { githubApi } from '@/lib/githubApi'
import { loopApi, type LoopMetrics, type LoopSummary } from '@/lib/loopApi'

vi.mock('@/components/loops/DiffViewer', () => ({
  DiffViewer: ({ loopId }: { loopId: string }) => <div>DiffViewer for {loopId}</div>
}))

vi.mock('@/components/loops/LoopTerminalOutput', () => ({
  LoopTerminalOutput: ({ chunks, emptyMessage }: { chunks: string[], emptyMessage?: string }) => (
    <div data-testid="loop-terminal-output">
      {chunks.length === 0 ? emptyMessage : `${chunks.length} chunks`}
    </div>
  )
}))

vi.mock('@/lib/githubApi', () => ({
  githubApi: {
    getConnection: vi.fn()
  }
}))

vi.mock('@/lib/loopApi', async () => {
  const actual = await vi.importActual<typeof import('@/lib/loopApi')>('@/lib/loopApi')

  return {
    ...actual,
    loopApi: {
      ...actual.loopApi,
      listBranches: vi.fn(),
      getDiff: vi.fn(),
      createPullRequest: vi.fn()
    }
  }
})

const baseLoop: LoopSummary = {
  id: 'loop-1',
  projectId: 'project-1',
  ralphLoopId: null,
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
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(githubApi.getConnection).mockResolvedValue({
      githubUserId: 42,
      githubUsername: 'octocat',
      scope: 'repo',
      connectedAt: Date.UTC(2026, 2, 13, 12, 0, 0)
    })
    vi.mocked(loopApi.listBranches).mockResolvedValue([
      { name: 'main', current: true },
      { name: 'develop', current: false }
    ])
    vi.mocked(loopApi.getDiff).mockResolvedValue({
      available: true,
      baseBranch: 'main',
      worktreeBranch: 'feature/loop-1',
      files: [
        {
          path: 'src/feature.ts',
          status: 'M',
          diff: '@@ -1 +1 @@\n-console.log("old")\n+console.log("new")',
          additions: 1,
          deletions: 1
        }
      ],
      stats: {
        filesChanged: 1,
        additions: 1,
        deletions: 1
      }
    })
    vi.mocked(loopApi.createPullRequest).mockResolvedValue({
      number: 42,
      url: 'https://github.com/acme/project/pull/42',
      title: 'ralph: Ship it'
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('renders empty selection state without crashing when no loop is selected', () => {
    render(<LoopDetail loop={null} metrics={null} outputChunks={[]} />)

    expect(
      screen.getByText('Select a loop to inspect metrics and terminal output.')
    ).toBeInTheDocument()
  })

  it('hides the Review Changes tab for non-reviewable loop states', () => {
    render(<LoopDetail loop={baseLoop} metrics={metrics} outputChunks={['chunk-1']} />)

    expect(screen.queryByRole('tab', { name: 'Review Changes' })).not.toBeInTheDocument()
    expect(screen.getByText('1 chunks')).toBeInTheDocument()
  })

  it('shows the Review Changes tab for reviewable loop states and renders diff viewer when selected', () => {
    render(
      <LoopDetail
        loop={{ ...baseLoop, state: 'completed' }}
        metrics={metrics}
        outputChunks={['chunk-1']}
      />
    )

    expect(screen.getByRole('tab', { name: 'Review Changes' })).toBeInTheDocument()
    expect(screen.queryByText('DiffViewer for loop-1')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: 'Review Changes' }))
    expect(screen.getByText('DiffViewer for loop-1')).toBeInTheDocument()
  })

  it('shows waiting message when active loop has no output yet', () => {
    render(<LoopDetail loop={baseLoop} metrics={metrics} outputChunks={[]} />)

    expect(screen.getByText('Waiting for loop output...')).toBeInTheDocument()
  })

  it('shows missing persisted log message when completed loop has no output', () => {
    render(
      <LoopDetail
        loop={{ ...baseLoop, state: 'completed', processId: null, endedAt: 1_770_768_010_000 }}
        metrics={metrics}
        outputChunks={[]}
      />
    )

    expect(screen.getByText('No persisted logs found for this loop.')).toBeInTheDocument()
  })

  it('shows a Create Pull Request action for pushed loops without an existing PR', async () => {
    render(
      <LoopDetail
        loop={{
          ...baseLoop,
          state: 'completed',
          config: JSON.stringify({
            gitBranch: {
              mode: 'new',
              name: 'feature/loop-1',
              baseBranch: 'main'
            },
            pushed: true
          })
        }}
        metrics={metrics}
        outputChunks={['chunk-1']}
      />
    )

    fireEvent.click(screen.getByRole('tab', { name: 'Review Changes' }))

    expect(await screen.findByRole('button', { name: 'Create Pull Request' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'View Pull Request' })).not.toBeInTheDocument()
  })

  it('renders PR dialog defaults from loop config and diff summary', async () => {
    render(
      <LoopDetail
        loop={{
          ...baseLoop,
          state: 'completed',
          config: JSON.stringify({
            gitBranch: {
              mode: 'new',
              name: 'feature/loop-1',
              baseBranch: 'main'
            },
            pushed: true
          })
        }}
        metrics={metrics}
        outputChunks={['chunk-1']}
      />
    )

    fireEvent.click(screen.getByRole('tab', { name: 'Review Changes' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Create Pull Request' }))

    expect(await screen.findByRole('dialog', { name: 'Create pull request dialog' })).toBeInTheDocument()
    expect(await screen.findByLabelText('Target branch')).toHaveValue('main')
    expect(screen.getByLabelText('Pull request title')).toHaveValue('ralph: Ship it')
    const pullRequestBody = (screen.getByLabelText('Pull request body') as HTMLTextAreaElement).value
    expect(pullRequestBody).toContain('Files changed: 1')
    expect(pullRequestBody).toContain('- src/feature.ts')

    expect(loopApi.listBranches).toHaveBeenCalledWith('project-1')
    expect(loopApi.getDiff).toHaveBeenCalledWith('loop-1')
  })

  it('creates a pull request from the dialog and shows the GitHub link', async () => {
    render(
      <LoopDetail
        loop={{
          ...baseLoop,
          state: 'completed',
          config: JSON.stringify({
            gitBranch: {
              mode: 'new',
              name: 'feature/loop-1',
              baseBranch: 'main'
            },
            pushed: true
          })
        }}
        metrics={metrics}
        outputChunks={['chunk-1']}
      />
    )

    fireEvent.click(screen.getByRole('tab', { name: 'Review Changes' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Create Pull Request' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Create PR' }))

    await waitFor(() => {
      expect(loopApi.createPullRequest).toHaveBeenCalledWith({
        loopId: 'loop-1',
        targetBranch: 'main',
        title: 'ralph: Ship it',
        body: expect.stringContaining('feature/loop-1'),
        draft: false
      })
    })

    expect(await screen.findByRole('link', { name: 'View Pull Request' })).toHaveAttribute(
      'href',
      'https://github.com/acme/project/pull/42'
    )
    expect(screen.queryByRole('button', { name: 'Create Pull Request' })).not.toBeInTheDocument()
  })

  it('keeps the dialog open and shows the error when PR creation fails', async () => {
    vi.mocked(loopApi.createPullRequest).mockRejectedValueOnce(new Error('GitHub rejected the PR'))

    render(
      <LoopDetail
        loop={{
          ...baseLoop,
          state: 'completed',
          config: JSON.stringify({
            gitBranch: {
              mode: 'new',
              name: 'feature/loop-1',
              baseBranch: 'main'
            },
            pushed: true
          })
        }}
        metrics={metrics}
        outputChunks={['chunk-1']}
      />
    )

    fireEvent.click(screen.getByRole('tab', { name: 'Review Changes' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Create Pull Request' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Create PR' }))

    expect(await screen.findByText('GitHub rejected the PR')).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Create pull request dialog' })).toBeInTheDocument()
  })
})
