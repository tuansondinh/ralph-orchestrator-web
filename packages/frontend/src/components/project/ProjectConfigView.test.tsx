import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { projectConfigApi } from '@/lib/projectConfigApi'
import { ProjectConfigView } from '@/components/project/ProjectConfigView'

vi.mock('@/lib/projectConfigApi', () => ({
  projectConfigApi: {
    get: vi.fn(),
    update: vi.fn()
  }
}))

describe('ProjectConfigView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(projectConfigApi.get).mockResolvedValue({
      projectId: 'project-1',
      yaml: 'model: gpt-5\nignore:\n  - dist\n',
      config: {
        model: 'gpt-5',
        ignore: ['dist']
      }
    })
    vi.mocked(projectConfigApi.update).mockImplementation(async (input) => ({
      projectId: input.projectId,
      yaml:
        typeof input.yaml === 'string'
          ? input.yaml
          : 'model: gpt-5-mini\nignore:\n  - dist\n',
      config:
        typeof input.config === 'object' && input.config
          ? input.config
          : { model: 'gpt-5-mini', ignore: ['dist'] }
    }))
  })

  afterEach(() => {
    cleanup()
  })

  it('loads project config and saves updates from YAML editor', async () => {
    render(<ProjectConfigView projectId="project-1" />)

    const editor = await screen.findByLabelText('YAML configuration')
    expect(editor).toBeInTheDocument()
    fireEvent.change(editor, {
      target: { value: 'model: gpt-5-mini\nignore:\n  - dist\n' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }))

    await waitFor(() => {
      expect(projectConfigApi.update).toHaveBeenCalledWith({
        projectId: 'project-1',
        yaml: 'model: gpt-5-mini\nignore:\n  - dist\n'
      })
    })
  })

  it('prevents save and shows an error for invalid YAML', async () => {
    render(<ProjectConfigView projectId="project-1" />)

    fireEvent.change(await screen.findByLabelText('YAML configuration'), {
      target: { value: 'model: [broken' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }))

    expect(await screen.findByText('Invalid YAML syntax')).toBeInTheDocument()
    expect(projectConfigApi.update).not.toHaveBeenCalled()
  })
})
