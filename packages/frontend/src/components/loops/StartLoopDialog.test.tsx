import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StartLoopDialog } from '@/components/loops/StartLoopDialog'
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

describe('StartLoopDialog', () => {
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
  })

  afterEach(() => {
    cleanup()
  })

  it('loads presets, lets the user save a new default, and starts with selected preset', async () => {
    const onStart = vi.fn().mockResolvedValue(undefined)
    const projectId = 'test-project-id'
    render(<StartLoopDialog projectId={projectId} onStart={onStart} />)

    await waitFor(() => {
      expect(presetApi.list).toHaveBeenCalledWith(projectId)
    })
    expect(
      screen.getByText(
        'On: wait for a single primary loop slot. Off: loop may run in a parallel worktree. Parallel worktrees auto-merge after completion by default.'
      )
    ).toBeInTheDocument()
    expect(await screen.findByLabelText('Preset')).toHaveValue('hatless-baseline.yml')
    expect(screen.getByText('Current default: hatless-baseline.yml')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Preset'), {
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
        backend: 'codex',
        exclusive: false,
        presetFilename: 'spec-driven.yml'
      })
    })
  })

  it('falls back to first available preset when default preset is unavailable', async () => {
    vi.mocked(settingsApi.getDefaultPreset).mockResolvedValue('missing-default.yml')
    const onStart = vi.fn().mockResolvedValue(undefined)
    render(<StartLoopDialog projectId="test-project-id" onStart={onStart} />)

    expect(
      await screen.findByText(
        'Default preset "missing-default.yml" is unavailable. Using "code-assist.yml" for this run.'
      )
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Preset')).toHaveValue('code-assist.yml')
    fireEvent.change(screen.getByLabelText('PROMPT.md'), {
      target: { value: 'Ship it' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Start' }))

    await waitFor(() => {
      expect(onStart).toHaveBeenCalledWith({
        prompt: 'Ship it',
        backend: 'codex',
        exclusive: false,
        presetFilename: 'code-assist.yml'
      })
    })
  })

  it('creates and selects a named worktree for the next run', async () => {
    const onStart = vi.fn().mockResolvedValue(undefined)
    render(<StartLoopDialog projectId="test-project-id" onStart={onStart} />)

    await screen.findByLabelText('Preset')
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
        backend: 'codex',
        exclusive: false,
        presetFilename: 'hatless-baseline.yml',
        worktree: 'feature-a'
      })
    })
  })

  it('starts with the selected backend override', async () => {
    const onStart = vi.fn().mockResolvedValue(undefined)
    render(<StartLoopDialog projectId="test-project-id" onStart={onStart} />)

    await screen.findByLabelText('Preset')
    fireEvent.change(screen.getByLabelText('Backend'), {
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
})
