import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GitService, parseGitHubRemoteUrl } from '../src/services/GitService.js'

const mockExec = vi.fn<
  (args: string[], options: { cwd: string; encoding: 'utf8' }) => Promise<{ stdout: string; stderr: string }>
>()
const mockFetch = vi.fn<typeof fetch>()

describe('GitService', () => {
  let service: GitService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new GitService({
      execFile: mockExec,
      fetch: mockFetch
    })
  })

  it('lists local and remote branches from git branch output', async () => {
    mockExec.mockResolvedValue({
      stdout: ['* main', '  feature/test', '  remotes/origin/main', '  remotes/origin/feature/test'].join('\n'),
      stderr: ''
    })

    await expect(service.listBranches('/tmp/project')).resolves.toEqual([
      { name: 'main', current: true },
      { name: 'feature/test', current: false },
      { name: 'main', current: false, remote: 'origin' },
      { name: 'feature/test', current: false, remote: 'origin' }
    ])

    expect(mockExec).toHaveBeenCalledWith(['branch', '-a', '--no-color'], {
      cwd: '/tmp/project',
      encoding: 'utf8'
    })
  })

  it('returns the current branch name', async () => {
    mockExec.mockResolvedValue({
      stdout: 'feature/current\n',
      stderr: ''
    })

    await expect(service.getCurrentBranch('/tmp/project')).resolves.toBe('feature/current')
    expect(mockExec).toHaveBeenCalledWith(['branch', '--show-current'], {
      cwd: '/tmp/project',
      encoding: 'utf8'
    })
  })

  it('creates a branch from the provided base branch', async () => {
    mockExec.mockResolvedValue({
      stdout: '',
      stderr: ''
    })

    await service.createBranch('/tmp/project', 'feature/new-work', 'main')

    expect(mockExec).toHaveBeenCalledWith(['checkout', '-b', 'feature/new-work', 'main'], {
      cwd: '/tmp/project',
      encoding: 'utf8'
    })
  })

  it('checks out an existing branch', async () => {
    mockExec.mockResolvedValue({
      stdout: '',
      stderr: ''
    })

    await service.checkoutBranch('/tmp/project', 'feature/existing')

    expect(mockExec).toHaveBeenCalledWith(['checkout', 'feature/existing'], {
      cwd: '/tmp/project',
      encoding: 'utf8'
    })
  })

  it('retries checkout after removing runtime artifacts that would be overwritten', async () => {
    const removePath = vi.fn(async () => {})
    service = new GitService({
      execFile: mockExec,
      fetch: mockFetch,
      removePath
    })
    mockExec
      .mockRejectedValueOnce({
        stderr: [
          'error: The following untracked working tree files would be overwritten by checkout:',
          '  .ralph/diagnostics/logs/ralph-2026-03-14T01-19-45.log',
          '  .ralph-ui/loop-logs/90868583-e71e-47ec-ab06-ba81c2d29b33.log',
          'Please move or remove them before you switch branches.',
          'Aborting'
        ].join('\n')
      })
      .mockResolvedValueOnce({
        stdout: '',
        stderr: ''
      })

    await service.checkoutBranch('/tmp/project', 'feature/existing')

    expect(removePath).toHaveBeenCalledWith(
      '/tmp/project/.ralph/diagnostics/logs/ralph-2026-03-14T01-19-45.log'
    )
    expect(removePath).toHaveBeenCalledWith(
      '/tmp/project/.ralph-ui/loop-logs/90868583-e71e-47ec-ab06-ba81c2d29b33.log'
    )
    expect(mockExec).toHaveBeenNthCalledWith(2, ['checkout', 'feature/existing'], {
      cwd: '/tmp/project',
      encoding: 'utf8'
    })
  })

  it('does not delete non-runtime files when checkout is blocked', async () => {
    const removePath = vi.fn(async () => {})
    service = new GitService({
      execFile: mockExec,
      fetch: mockFetch,
      removePath
    })
    mockExec.mockRejectedValue({
      stderr: [
        'error: Your local changes to the following files would be overwritten by checkout:',
        '  src/App.tsx',
        'Please commit your changes or stash them before you switch branches.',
        'Aborting'
      ].join('\n')
    })

    await expect(service.checkoutBranch('/tmp/project', 'feature/existing')).rejects.toThrow(
      'Failed to checkout branch: error: Your local changes to the following files would be overwritten by checkout:'
    )
    expect(removePath).not.toHaveBeenCalled()
    expect(mockExec).toHaveBeenCalledTimes(1)
  })

  it('pushes a branch with upstream tracking by default', async () => {
    mockExec.mockResolvedValue({
      stdout: '',
      stderr: ''
    })

    await expect(service.push('/tmp/project', 'feature/push')).resolves.toEqual({
      branch: 'feature/push',
      remote: 'origin'
    })

    expect(mockExec).toHaveBeenCalledWith(
      ['push', '--set-upstream', 'origin', 'feature/push'],
      {
        cwd: '/tmp/project',
        encoding: 'utf8'
      }
    )
  })

  it('reads a git remote URL for the project', async () => {
    mockExec.mockResolvedValue({
      stdout: 'git@github.com:acme/project.git\n',
      stderr: ''
    })

    await expect(service.getRemoteUrl('/tmp/project')).resolves.toBe(
      'git@github.com:acme/project.git'
    )

    expect(mockExec).toHaveBeenCalledWith(['remote', 'get-url', 'origin'], {
      cwd: '/tmp/project',
      encoding: 'utf8'
    })
  })

  it('creates a GitHub pull request and returns normalized fields', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        number: 42,
        html_url: 'https://github.com/acme/project/pull/42',
        title: 'Feature PR'
      })
    } as Response)

    await expect(
      service.createPullRequest({
        owner: 'acme',
        repo: 'project',
        title: 'Feature PR',
        body: 'Implements the feature',
        head: 'feature/work',
        base: 'main',
        draft: true,
        token: 'ghp_test'
      })
    ).resolves.toEqual({
      number: 42,
      url: 'https://github.com/acme/project/pull/42',
      title: 'Feature PR'
    })

    expect(mockFetch).toHaveBeenCalledWith('https://api.github.com/repos/acme/project/pulls', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ghp_test',
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        title: 'Feature PR',
        body: 'Implements the feature',
        head: 'feature/work',
        base: 'main',
        draft: true
      })
    })
  })

  it('surfaces git command stderr when a branch creation command fails', async () => {
    mockExec.mockRejectedValue({
      stderr: "fatal: a branch named 'feature/new-work' already exists\n"
    })

    await expect(
      service.createBranch('/tmp/project', 'feature/new-work', 'main')
    ).rejects.toThrow("fatal: a branch named 'feature/new-work' already exists")
  })

  it('retries branch creation after removing runtime artifacts that block checkout', async () => {
    const removePath = vi.fn(async () => {})
    service = new GitService({
      execFile: mockExec,
      fetch: mockFetch,
      removePath
    })
    mockExec
      .mockRejectedValueOnce({
        stderr: [
          'error: Your local changes to the following files would be overwritten by checkout:',
          '  .ralph/diagnostics/logs/ralph-2026-03-14T01-19-45.log',
          '  debug.log',
          'Please commit your changes or stash them before you switch branches.',
          'Aborting'
        ].join('\n')
      })
      .mockResolvedValueOnce({
        stdout: '',
        stderr: ''
      })

    await service.createBranch('/tmp/project', 'feature/new-work', 'main')

    expect(removePath).toHaveBeenCalledWith(
      '/tmp/project/.ralph/diagnostics/logs/ralph-2026-03-14T01-19-45.log'
    )
    expect(removePath).toHaveBeenCalledWith('/tmp/project/debug.log')
    expect(mockExec).toHaveBeenNthCalledWith(
      2,
      ['checkout', '-b', 'feature/new-work', 'main'],
      {
        cwd: '/tmp/project',
        encoding: 'utf8'
      }
    )
  })

  it('surfaces GitHub API failures when pull request creation is rejected', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 422,
      text: async () => 'Validation Failed'
    } as Response)

    await expect(
      service.createPullRequest({
        owner: 'acme',
        repo: 'project',
        title: 'Feature PR',
        body: '',
        head: 'feature/work',
        base: 'main',
        token: 'ghp_test'
      })
    ).rejects.toThrow('Failed to create pull request: Validation Failed')
  })
})

describe('parseGitHubRemoteUrl', () => {
  it('parses HTTPS GitHub remotes', () => {
    expect(parseGitHubRemoteUrl('https://github.com/acme/project.git')).toEqual({
      owner: 'acme',
      repo: 'project'
    })
  })

  it('parses SSH GitHub remotes', () => {
    expect(parseGitHubRemoteUrl('git@github.com:acme/project.git')).toEqual({
      owner: 'acme',
      repo: 'project'
    })
  })
})

describe('createApp GitService wiring', () => {
  const apps: Array<Awaited<ReturnType<typeof import('../src/app.js')['createApp']>>> = []

  afterEach(async () => {
    while (apps.length > 0) {
      await apps.pop()?.close()
    }
  })

  it('decorates the app with gitService in local mode', async () => {
    const { createApp } = await import('../src/app.js')
    const app = createApp()

    apps.push(app)

    expect(app.gitService).toBeInstanceOf(GitService)
  })
})
