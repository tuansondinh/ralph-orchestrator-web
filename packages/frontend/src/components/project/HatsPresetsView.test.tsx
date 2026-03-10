import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HatsPresetsView } from '@/components/project/HatsPresetsView'
import { hatsPresetApi } from '@/lib/hatsPresetApi'
import { projectConfigApi } from '@/lib/projectConfigApi'

vi.mock('@/lib/hatsPresetApi', () => ({
  hatsPresetApi: {
    list: vi.fn(),
    get: vi.fn()
  }
}))

vi.mock('@/lib/projectConfigApi', () => ({
  projectConfigApi: {
    update: vi.fn()
  }
}))

describe('HatsPresetsView', () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()

    vi.mocked(hatsPresetApi.list).mockResolvedValue({
      sourceDirectory: '/Users/sonwork/Documents/ralph-orchestrator/presets',
      presets: [
        { id: 'minimal/default.yml', name: 'default' },
        { id: 'minimal/pair-programming.yml', name: 'pair-programming' }
      ]
    })
    vi.mocked(hatsPresetApi.get).mockImplementation(async (id: string) => {
      if (id === 'minimal/pair-programming.yml') {
        return {
          id,
          name: 'pair-programming',
          sourceDirectory: '/Users/sonwork/Documents/ralph-orchestrator/presets',
          content: 'hat: pair-programming\nmode: collaborative\n'
        }
      }

      return {
        id: 'minimal/default.yml',
        name: 'default',
        sourceDirectory: '/Users/sonwork/Documents/ralph-orchestrator/presets',
        content: 'hat: default\nmode: focused\n'
      }
    })
    vi.mocked(projectConfigApi.update).mockResolvedValue({
      projectId: 'project-1',
      yaml: 'hat: default\nmode: focused\n',
      config: {}
    })
  })

  it('loads presets and renders selected YAML content', async () => {
    render(<HatsPresetsView projectId="project-1" />)
    const yamlField = screen.getByLabelText('YAML config') as HTMLTextAreaElement

    expect(await screen.findByText(/Source:/)).toBeInTheDocument()
    expect(hatsPresetApi.list).toHaveBeenCalledTimes(1)
    await waitFor(() => {
      expect(hatsPresetApi.get).toHaveBeenCalledWith('minimal/default.yml')
    })
    await waitFor(() => {
      expect(yamlField.value).toContain('hat: default')
      expect(yamlField.value).toContain('mode: focused')
    })

    fireEvent.change(screen.getByLabelText('Preset'), {
      target: { value: 'minimal/pair-programming.yml' }
    })

    await waitFor(() => {
      expect(hatsPresetApi.get).toHaveBeenCalledWith('minimal/pair-programming.yml')
    })
    await waitFor(() => {
      expect(yamlField.value).toContain('hat: pair-programming')
      expect(yamlField.value).toContain('mode: collaborative')
    })
  })

  it('copies selected preset into project settings after confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<HatsPresetsView projectId="project-1" />)
    const yamlField = screen.getByLabelText('YAML config') as HTMLTextAreaElement

    await waitFor(() => {
      expect(yamlField.value).toContain('hat: default')
    })
    fireEvent.click(screen.getByRole('button', { name: 'Copy to project settings' }))

    await waitFor(() => {
      expect(projectConfigApi.update).toHaveBeenCalledWith({
        projectId: 'project-1',
        yaml: 'hat: default\nmode: focused\n'
      })
    })
    expect(
      await screen.findByText('Preset copied to project settings.')
    ).toBeInTheDocument()
  })
})
