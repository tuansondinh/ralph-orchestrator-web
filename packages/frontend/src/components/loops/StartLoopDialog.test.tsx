import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StartLoopDialog } from '@/components/loops/StartLoopDialog'
import { loopApi } from '@/lib/loopApi'
import { presetApi } from '@/lib/presetApi'
import { settingsApi } from '@/lib/settingsApi'
import { worktreeApi } from '@/lib/worktreeApi'

vi.mock('@/lib/presetApi', () => ({
  presetApi: {
    list: vi.fn(),
    get: vi.fn()
  }
}))

vi.mock('@/lib/settingsApi', () => ({
  settingsApi: {
    getDefaultPreset: vi.fn(),
    setDefaultPreset: vi.fn()
  }
}))

vi.mock('@/lib/worktreeApi', () => ({
  worktreeApi: {
    list: vi.fn(),
    create: vi.fn()
  }
}))

vi.mock('@/lib/loopApi', async () => {
  const actual = await vi.importActual<typeof import('@/lib/loopApi')>('@/lib/loopApi')
  return {
    ...actual,
    loopApi: {
      ...actual.loopApi,
      listBranches: vi.fn()
    }
  }
})

describe('StartLoopDialog', () => {
  const renderDialog = (props: Parameters<typeof StartLoopDialog>[0]) =>
    render(
      <MemoryRouter>
        <StartLoopDialog {...props} />
      </MemoryRouter>
    )

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(presetApi.list).mockResolvedValue([
      { name: 'code-assist', filename: 'code-assist.yml' },
      { name: 'hatless-baseline', filename: 'hatless-baseline.yml' },
      { name: 'spec-driven', filename: 'spec-driven.yml' }
    ])
    vi.mocked(settingsApi.getDefaultPreset).mockResolvedValue('hatless-baseline.yml')
    vi.mocked(settingsApi.setDefaultPreset).mockResolvedValue('spec-driven.yml')
    vi.mocked(worktreeApi.list).mockResolvedValue([])
    vi.mocked(worktreeApi.create).mockResolvedValue({
      name: 'feature-a',
      path: '/tmp/project/workspaces/feature-a',
      branch: 'feature-a',
      isPrimary: false
    })
    vi.mocked(loopApi.listBranches).mockResolvedValue([
      { name: 'main', current: true },
      { name: 'release/2026.03', current: false },
      { name: 'feature/existing', current: false }
    ])
  })

  afterEach(() => {
    cleanup()
  })

  it('loads presets, lets the user save a new default, and starts with selected preset', async () => {
    const onStart = vi.fn().mockResolvedValue(undefined)
    const projectId = 'test-project-id'
    renderDialog({ projectId, onStart })

    await waitFor(() => {
      expect(presetApi.list).toHaveBeenCalledWith(projectId)
    })
    expect(
      screen.getByText(
        'On: wait for a single primary loop slot. Off: loop may run in a parallel worktree. Parallel worktrees auto-merge after completion by default.'
      )
    ).toBeInTheDocument()
    expect(await screen.findByLabelText('Hats preset')).toHaveValue('hatless-baseline.yml')
    expect(screen.getByRole('link', { name: 'see hats presets config' })).toHaveAttribute(
      'href',
      '/project/test-project-id/hats-presets'
    )
    expect(screen.getByLabelText('AI-BACKEND')).toHaveValue('auto')
    expect(screen.getByLabelText('PROMPT.md')).toHaveAttribute(
      'placeholder',
      'PUT YOUR PROMPT IN HERE'
    )
    expect(screen.getByText('Current default: hatless-baseline.yml')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Hats preset'), {
      target: { value: 'spec-driven.yml' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save default preset' }))

    await waitFor(() => {
      expect(settingsApi.setDefaultPreset).toHaveBeenCalledWith({
        filename: 'spec-driven.yml',
        projectId
      })
    })
    expect(await screen.findByText('Default preset saved.')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('PROMPT.md'), {
      target: { value: 'Ship it' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Start' }))

    await waitFor(() => {
      expect(onStart).toHaveBeenCalledWith({
        prompt: 'Ship it',
        exclusive: false,
        presetFilename: 'spec-driven.yml'
      })
    })
  })

  it('falls back to first available preset when default preset is unavailable', async () => {
    vi.mocked(settingsApi.getDefaultPreset).mockResolvedValue('missing-default.yml')
    const onStart = vi.fn().mockResolvedValue(undefined)
    renderDialog({ projectId: 'test-project-id', onStart })

    expect(
      await screen.findByText(
        'Default preset "missing-default.yml" is unavailable. Using "code-assist.yml" for this run.'
      )
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Hats preset')).toHaveValue('code-assist.yml')
    fireEvent.change(screen.getByLabelText('PROMPT.md'), {
      target: { value: 'Ship it' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Start' }))

    await waitFor(() => {
      expect(onStart).toHaveBeenCalledWith({
        prompt: 'Ship it',
        exclusive: false,
        presetFilename: 'code-assist.yml'
      })
    })
  })

  it('creates and selects a named worktree for the next run', async () => {
    const onStart = vi.fn().mockResolvedValue(undefined)
    renderDialog({ projectId: 'test-project-id', onStart })

    await screen.findByLabelText('Hats preset')
    fireEvent.change(screen.getByPlaceholderText('New worktree name'), {
      target: { value: 'feature-a' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add Worktree' }))

    await waitFor(() => {
      expect(worktreeApi.create).toHaveBeenCalledWith('test-project-id', 'feature-a')
    })
    expect(await screen.findByText('Worktree "feature-a" created.')).toBeInTheDocument()
    expect(screen.getByLabelText('Worktree (Optional)')).toHaveValue('feature-a')

    fireEvent.change(screen.getByLabelText('PROMPT.md'), {
      target: { value: 'Ship with named branch' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Start' }))

    await waitFor(() => {
      expect(onStart).toHaveBeenCalledWith({
        prompt: 'Ship with named branch',
        exclusive: false,
        presetFilename: 'hatless-baseline.yml',
        worktree: 'feature-a'
      })
    })
  })

  it('starts with the selected backend override', async () => {
    const onStart = vi.fn().mockResolvedValue(undefined)
    renderDialog({ projectId: 'test-project-id', onStart })

    await screen.findByLabelText('Hats preset')
    fireEvent.change(screen.getByLabelText('AI-BACKEND'), {
      target: { value: 'opencode' }
    })
    fireEvent.change(screen.getByLabelText('PROMPT.md'), {
      target: { value: 'Use opencode for this loop' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Start' }))

    await waitFor(() => {
      expect(onStart).toHaveBeenCalledWith({
        prompt: 'Use opencode for this loop',
        backend: 'opencode',
        exclusive: false,
        presetFilename: 'hatless-baseline.yml'
      })
    })
  })

  it('displays ralph.yml as custom user setting in hats preset selection', async () => {
    vi.mocked(presetApi.list).mockResolvedValue([
      { name: 'custom preset from settings', filename: 'ralph.yml' },
      { name: 'spec-driven', filename: 'spec-driven.yml' }
    ])
    vi.mocked(settingsApi.getDefaultPreset).mockResolvedValue('ralph.yml')

    const onStart = vi.fn().mockResolvedValue(undefined)
    renderDialog({ projectId: 'test-project-id', onStart })

    expect(await screen.findByLabelText('Hats preset')).toHaveValue('ralph.yml')
    expect(screen.getByRole('option', { name: 'Custom user setting' })).toBeInTheDocument()
    expect(screen.getByText('Current default: Custom user setting')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('PROMPT.md'), {
      target: { value: 'Ship with custom settings' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Start' }))

    await waitFor(() => {
      expect(onStart).toHaveBeenCalledWith({
        prompt: 'Ship with custom settings',
        exclusive: false,
        presetFilename: 'ralph.yml'
      })
    })
  })

  it('loads git branches and starts a loop with a new branch and auto-push enabled', async () => {
    const onStart = vi.fn().mockResolvedValue(undefined)
    const projectId = 'test-project-id'
    renderDialog({ projectId, onStart })

    await waitFor(() => {
      expect(loopApi.listBranches).toHaveBeenCalledWith(projectId)
    })
    expect(await screen.findByLabelText('Branch mode')).toHaveValue('new')
    expect(screen.getByLabelText('Base branch')).toHaveValue('main')
    expect(screen.getByRole('option', { name: 'main (current)' })).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Branch name'), {
      target: { value: 'feature/branch-ui' }
    })
    fireEvent.change(screen.getByLabelText('Base branch'), {
      target: { value: 'release/2026.03' }
    })
    fireEvent.click(screen.getByLabelText('Auto-push when loop completes'))
    fireEvent.change(screen.getByLabelText('PROMPT.md'), {
      target: { value: 'Ship branch workflow UI' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Start' }))

    await waitFor(() => {
      expect(onStart).toHaveBeenCalledWith({
        prompt: 'Ship branch workflow UI',
        exclusive: false,
        presetFilename: 'hatless-baseline.yml',
        gitBranch: {
          mode: 'new',
          name: 'feature/branch-ui',
          baseBranch: 'release/2026.03'
        },
        autoPush: true
      })
    })
  })

  it('starts a loop against an existing branch without sending a base branch', async () => {
    const onStart = vi.fn().mockResolvedValue(undefined)
    renderDialog({ projectId: 'test-project-id', onStart })

    await screen.findByLabelText('Branch mode')
    fireEvent.change(screen.getByLabelText('Branch mode'), {
      target: { value: 'existing' }
    })
    await waitFor(() => {
      expect(screen.queryByLabelText('Base branch')).not.toBeInTheDocument()
    })
    fireEvent.change(screen.getByLabelText('Branch name'), {
      target: { value: 'feature/existing' }
    })
    fireEvent.change(screen.getByLabelText('PROMPT.md'), {
      target: { value: 'Reuse existing branch' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Start' }))

    await waitFor(() => {
      expect(onStart).toHaveBeenCalledWith({
        prompt: 'Reuse existing branch',
        exclusive: false,
        presetFilename: 'hatless-baseline.yml',
        gitBranch: {
          mode: 'existing',
          name: 'feature/existing'
        },
        autoPush: false
      })
    })
  })

  it('deduplicates repeated branch names from local and remote refs in the git branch controls', async () => {
    vi.mocked(loopApi.listBranches).mockResolvedValue([
      { name: 'main', current: true },
      { name: 'main', current: false, remote: 'origin' },
      { name: 'release/2026.03', current: false },
      { name: 'release/2026.03', current: false, remote: 'origin' }
    ])

    const onStart = vi.fn().mockResolvedValue(undefined)
    renderDialog({ projectId: 'test-project-id', onStart })

    expect(await screen.findByLabelText('Branch mode')).toHaveValue('new')

    const baseBranchOptions = screen
      .getAllByRole('option')
      .filter((option) =>
        ['main (current)', 'release/2026.03'].includes(option.textContent ?? '')
      )

    expect(baseBranchOptions).toHaveLength(2)
    expect(screen.getByLabelText('Base branch')).toHaveValue('main')

    fireEvent.change(screen.getByLabelText('Branch mode'), {
      target: { value: 'existing' }
    })

    const branchNameInput = screen.getByLabelText('Branch name')
    const branchOptionValues = Array.from(
      document.querySelectorAll('#loop-git-branch-options option')
    ).map((option) => option.getAttribute('value'))

    expect(branchNameInput).toHaveAttribute('list', 'loop-git-branch-options')
    expect(branchOptionValues).toEqual(['main', 'release/2026.03'])
  })
})
