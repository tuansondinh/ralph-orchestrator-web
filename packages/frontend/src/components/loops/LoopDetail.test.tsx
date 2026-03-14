import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LoopDetail } from '@/components/loops/LoopDetail'
import { DiffViewer } from '@/components/loops/DiffViewer'
import { githubApi } from '@/lib/githubApi'
import {
  loopApi,
  type LoopMetrics,
  type LoopSummary
} from '@/lib/loopApi'

vi.mock('@/components/loops/DiffViewer', () => ({
  DiffViewer: ({
    loopId,
    watch
  }: {
    loopId: string
    watch?: boolean
  }) => <div>{`DiffViewer ${loopId} ${watch === true ? 'watch' : 'static'}`}</div>
}))

vi.mock('@/components/loops/LoopTerminalOutput', () => ({
  LoopTerminalOutput: ({
    chunks,
    emptyMessage
  }: {
    chunks: Array<{ data: string }>
    emptyMessage?: string
  }) => (
    <div data-testid="loop-terminal-output">
      {chunks.length > 0 ? chunks.map((chunk) => chunk.data).join('') : emptyMessage}
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
      retryPush: vi.fn(),
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
    vi.mocked(loopApi.retryPush).mockResolvedValue({
      ...baseLoop,
      state: 'completed',
      config: JSON.stringify({
        gitBranch: {
          mode: 'new',
          name: 'feature/loop-1',
          baseBranch: 'main'
        },
        pushed: true
      }),
      endedAt: 1_770_768_010_000
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('renders empty selection state without crashing when no loop is selected', () => {
    render(<LoopDetail loop={null} metrics={null} outputChunks={[]} lastEventAt={null} recentEvents={[]} />)

    expect(
      screen.getByText('Select a loop to inspect metrics and loop details.')
    ).toBeInTheDocument()
  })

  it('does not render a detail panel body for non-reviewable loop states', () => {
    render(<LoopDetail loop={baseLoop} metrics={metrics} outputChunks={[]} lastEventAt={null} recentEvents={[]} />)

    expect(screen.getByText('File Watcher')).toBeInTheDocument()
    expect(screen.getByText('DiffViewer loop-1 watch')).toBeInTheDocument()
    expect(screen.getByText('Live Output')).toBeInTheDocument()
  })

  it('renders the review actions for reviewable loop states', () => {
    render(
      <LoopDetail
        loop={{ ...baseLoop, state: 'completed' }}
        metrics={metrics}
        outputChunks={[]}
        lastEventAt={null}
        recentEvents={[]}
      />
    )

    expect(screen.getByText('Review the loop diff before opening a pull request.')).toBeInTheDocument()
    expect(screen.getByText('DiffViewer loop-1 static')).toBeInTheDocument()
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
        outputChunks={[]}
        lastEventAt={null}
        recentEvents={[]}
      />
    )

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
        outputChunks={[]}
        lastEventAt={null}
        recentEvents={[]}
      />
    )

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
        outputChunks={[]}
        lastEventAt={null}
        recentEvents={[]}
      />
    )

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
        outputChunks={[]}
        lastEventAt={null}
        recentEvents={[]}
      />
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Create Pull Request' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Create PR' }))

    expect(await screen.findByText('GitHub rejected the PR')).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Create pull request dialog' })).toBeInTheDocument()
  })

  it('shows push failures and retries the branch push from the review tab', async () => {
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
            pushError: 'remote rejected'
          })
        }}
        metrics={metrics}
        outputChunks={[]}
        lastEventAt={null}
        recentEvents={[]}
      />
    )

    expect(await screen.findByText('Push failed: remote rejected')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Retry Push' }))

    await waitFor(() => {
      expect(loopApi.retryPush).toHaveBeenCalledWith('loop-1')
    })
    expect(await screen.findByRole('button', { name: 'Create Pull Request' })).toBeInTheDocument()
  })

  it('renders live output content and last output time when chunks are present', () => {
    render(
      <LoopDetail
        loop={baseLoop}
        metrics={metrics}
        outputChunks={[
          {
            stream: 'stdout',
            data: 'still working',
            timestamp: '2026-03-14T12:34:56.000Z'
          }
        ]}
        lastEventAt={Date.UTC(2026, 2, 14, 12, 34, 59)}
        recentEvents={[
          {
            topic: 'task.start',
            sourceHat: 'planner',
            timestamp: Date.UTC(2026, 2, 14, 12, 34, 58),
            payload: 'create test.md'
          }
        ]}
      />
    )

    expect(screen.getByTestId('loop-terminal-output')).toHaveTextContent('still working')
    expect(screen.getByText(/Last output:/)).toBeInTheDocument()
    expect(screen.getAllByText('task.start')).toHaveLength(2)
    expect(screen.getByText(/Latest Ralph event:/)).toBeInTheDocument()
    expect(screen.getByText(/create test.md/)).toBeInTheDocument()
  })
})
