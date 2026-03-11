import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { SettingsPage } from '@/pages/SettingsPage'
import { settingsApi, type SettingsSnapshot } from '@/lib/settingsApi'
import { capabilitiesApi } from '@/lib/capabilitiesApi'
import { githubApi } from '@/lib/githubApi'

vi.mock('@/lib/settingsApi', () => ({
  settingsApi: {
    get: vi.fn(),
    update: vi.fn(),
    testBinary: vi.fn(),
    clearData: vi.fn()
  }
}))

vi.mock('@/lib/capabilitiesApi', () => ({
  capabilitiesApi: {
    get: vi.fn()
  }
}))

vi.mock('@/lib/githubApi', () => ({
  githubApi: {
    getConnection: vi.fn(),
    beginConnection: vi.fn(),
    disconnect: vi.fn()
  }
}))

const baseSettings: SettingsSnapshot = {
  chatProvider: 'anthropic' as const,
  chatModel: 'claude-sonnet-4-20250514',
  providerApiKeyStatus: {
    anthropic: 'missing',
    openai: 'missing',
    google: 'saved'
  },
  ralphBinaryPath: '/usr/local/bin/ralph',
  notifications: {
    loopComplete: true,
    loopFailed: true,
    needsInput: true
  },
  preview: {
    portStart: 3001,
    portEnd: 3010,
    baseUrl: 'http://localhost',
    command: null
  },
  data: {
    dbPath: '/tmp/ralph-ui/data.db'
  }
}

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(settingsApi.get).mockResolvedValue(baseSettings)
    vi.mocked(capabilitiesApi.get).mockResolvedValue({
      mode: 'local',
      database: true,
      auth: false,
      localProjects: true,
      githubProjects: false,
      terminal: true,
      preview: true,
      localDirectoryPicker: true,
      mcp: true
    })
    vi.mocked(githubApi.getConnection).mockResolvedValue(null)
    vi.mocked(settingsApi.update).mockImplementation(async (input) => ({
      ...baseSettings,
      ...input,
      chatProvider: input.chatProvider ?? baseSettings.chatProvider,
      chatModel: input.chatModel ?? baseSettings.chatModel,
      providerApiKeyStatus: input.providerApiKey
        ? {
            ...baseSettings.providerApiKeyStatus,
            [input.providerApiKey.provider]:
              input.providerApiKey.value && input.providerApiKey.value.trim().length > 0
                ? 'saved'
                : 'missing'
          }
        : baseSettings.providerApiKeyStatus,
      notifications: {
        ...baseSettings.notifications,
        ...(input.notifications ?? {})
      },
      preview: {
        ...baseSettings.preview,
        ...(input.preview ?? {}),
        baseUrl: input.preview?.baseUrl ?? baseSettings.preview.baseUrl,
        command: input.preview?.command ?? baseSettings.preview.command
      }
    }))
    vi.mocked(settingsApi.testBinary).mockResolvedValue({
      path: baseSettings.ralphBinaryPath!,
      version: 'ralph 9.9.9-test'
    })
    vi.mocked(settingsApi.clearData).mockResolvedValue({ cleared: true })
  })

  afterEach(() => {
    cleanup()
  })

  it('loads settings and saves updated values', async () => {
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    )

    const binaryInput = await screen.findByLabelText('Ralph binary path')
    expect(binaryInput).toHaveValue('/usr/local/bin/ralph')

    fireEvent.change(binaryInput, {
      target: { value: '/custom/bin/ralph' }
    })
    fireEvent.click(screen.getByLabelText('Loop complete notifications'))
    fireEvent.change(screen.getByLabelText('Preview port start'), {
      target: { value: '4100' }
    })
    fireEvent.change(screen.getByLabelText('Preview port end'), {
      target: { value: '4200' }
    })
    fireEvent.change(screen.getByLabelText('AI provider'), {
      target: { value: 'openai' }
    })
    fireEvent.change(screen.getByLabelText('AI model'), {
      target: { value: 'gpt-5' }
    })
    fireEvent.change(screen.getByLabelText('API key'), {
      target: { value: 'openai-live-key' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }))

    await waitFor(() => {
      expect(settingsApi.update).toHaveBeenCalledWith({
        chatProvider: 'openai',
        chatModel: 'gpt-5',
        providerApiKey: {
          provider: 'openai',
          value: 'openai-live-key'
        },
        ralphBinaryPath: '/custom/bin/ralph',
        notifications: {
          loopComplete: false,
          loopFailed: true,
          needsInput: true
        },
        preview: {
          portStart: 4100,
          portEnd: 4200,
          baseUrl: 'http://localhost',
          command: null
        }
      })
    })
  })

  it('switches model options and provider-specific API key warnings with provider changes', async () => {
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    )

    expect(await screen.findByLabelText('AI provider')).toHaveValue('anthropic')
    expect(screen.getByLabelText('AI model')).toHaveValue('claude-sonnet-4-20250514')
    expect(screen.getByText('No API key saved for Anthropic.')).toBeInTheDocument()
    expect(
      screen.getAllByRole('option').map((option) => option.textContent).filter(Boolean)
    ).toEqual([
      'Anthropic',
      'OpenAI',
      'Google',
      'Claude Sonnet 4',
      'Claude Opus 4.1',
      'Claude Haiku 3.5'
    ])

    fireEvent.change(screen.getByLabelText('AI provider'), {
      target: { value: 'openai' }
    })

    expect(screen.getByLabelText('AI model')).toHaveValue('gpt-5-mini')
    expect(
      screen.getAllByRole('option').map((option) => option.textContent).filter(Boolean)
    ).toEqual([
      'Anthropic',
      'OpenAI',
      'Google',
      'GPT-5 Mini',
      'GPT-5',
      'GPT-4o',
      'o3',
      'o4-mini'
    ])

    fireEvent.change(screen.getByLabelText('AI provider'), {
      target: { value: 'google' }
    })

    expect(screen.getByLabelText('AI model')).toHaveValue('gemini-2.5-flash')
    expect(screen.getByText('Saved API key available for Google.')).toBeInTheDocument()
    expect(
      screen.getAllByRole('option').map((option) => option.textContent).filter(Boolean)
    ).toEqual([
      'Anthropic',
      'OpenAI',
      'Google',
      'Gemini 3 Pro Preview',
      'Gemini 3 Flash Preview',
      'Gemini 2.5 Pro',
      'Gemini 2.5 Flash'
    ])
  })

  it('tests the configured binary and shows success or failure feedback', async () => {
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    )

    await screen.findByLabelText('Ralph binary path')
    fireEvent.click(screen.getByRole('button', { name: 'Test binary' }))

    expect(await screen.findByText(/ralph 9.9.9-test/i)).toBeInTheDocument()

    vi.mocked(settingsApi.testBinary).mockRejectedValueOnce(new Error('Binary is not executable'))
    fireEvent.change(screen.getByLabelText('Ralph binary path'), {
      target: { value: '/bad/ralph' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Test binary' }))

    expect(await screen.findByText(/not executable/i)).toBeInTheDocument()
  })

  it('confirms before clearing data', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    )

    await screen.findByLabelText('Ralph binary path')
    fireEvent.click(screen.getByRole('button', { name: 'Clear data' }))

    await waitFor(() => {
      expect(settingsApi.clearData).toHaveBeenCalledWith({ confirm: true })
    })

    confirmSpy.mockRestore()
  })

  it('does not render the GitHub connector outside cloud mode', async () => {
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    )

    await screen.findByLabelText('Ralph binary path')
    expect(screen.queryByRole('heading', { name: 'GitHub connector' })).not.toBeInTheDocument()
    expect(githubApi.getConnection).not.toHaveBeenCalled()
  })

  it('renders the GitHub connector in cloud mode', async () => {
    vi.mocked(capabilitiesApi.get).mockResolvedValue({
      mode: 'cloud',
      database: true,
      auth: true,
      localProjects: false,
      githubProjects: true,
      terminal: false,
      preview: false,
      localDirectoryPicker: false,
      mcp: false
    })

    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    )

    expect(await screen.findByRole('heading', { name: 'GitHub connector' })).toBeInTheDocument()
  })

  it('uses stacked mobile layout primitives for dense settings sections', async () => {
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    )

    const providerSelect = await screen.findByLabelText('AI provider')
    const assistantGrid = providerSelect.closest('label')?.parentElement
    expect(assistantGrid).toHaveClass('grid-cols-1')
    expect(assistantGrid).toHaveClass('md:grid-cols-2')

    const previewPortStart = screen.getByLabelText('Preview port start')
    const previewGrid = previewPortStart.closest('label')?.parentElement
    expect(previewGrid).toHaveClass('grid-cols-1')
    expect(previewGrid).toHaveClass('sm:grid-cols-2')

    const footer = screen.getByRole('button', { name: 'Save settings' }).closest('footer')
    expect(footer).toHaveClass('flex-col')
    expect(footer).toHaveClass('items-stretch')
    expect(footer).toHaveClass('sm:flex-row')
  })

  it('owns scrolling at the page root so all settings remain reachable', async () => {
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    )

    const page = await screen.findByTestId('settings-page')
    expect(page).toHaveClass('min-h-0')
    expect(page).toHaveClass('flex-1')
    expect(page).toHaveClass('overflow-y-auto')
  })
})
