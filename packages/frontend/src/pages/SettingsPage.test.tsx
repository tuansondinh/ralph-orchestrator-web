import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { SettingsPage } from '@/pages/SettingsPage'
import { settingsApi } from '@/lib/settingsApi'
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

const baseSettings = {
  chatModel: 'gemini' as const,
  chatProvider: 'anthropic' as const,
  opencodeModel: 'claude-sonnet-4-20250514',
  providerEnvVarMap: {
    anthropic: 'ANTHROPIC_API_KEY',
    openai: 'OPENAI_API_KEY',
    google: 'GOOGLE_API_KEY'
  },
  apiKeyStatus: {
    anthropic: true,
    openai: true,
    google: true
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
      chatModel: input.chatModel ?? baseSettings.chatModel,
      chatProvider: input.chatProvider ?? baseSettings.chatProvider,
      opencodeModel: input.opencodeModel ?? baseSettings.opencodeModel,
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
      path: baseSettings.ralphBinaryPath,
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
    fireEvent.change(screen.getByLabelText('AI model'), {
      target: { value: 'claude' }
    })
    fireEvent.change(screen.getByLabelText('Chat provider'), {
      target: { value: 'openai' }
    })
    fireEvent.change(screen.getByLabelText('Chat model'), {
      target: { value: 'gpt-4o' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }))

    await waitFor(() => {
      expect(settingsApi.update).toHaveBeenCalledWith({
        chatModel: 'claude',
        chatProvider: 'openai',
        opencodeModel: 'gpt-4o',
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

  it('renders chat settings fields with the current values', async () => {
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    )

    expect(await screen.findByRole('heading', { name: 'Chat' })).toBeInTheDocument()
    expect(screen.getByLabelText('Chat provider')).toHaveValue('anthropic')
    expect(screen.getByLabelText('Chat model')).toHaveValue('claude-sonnet-4-20250514')
    expect(screen.getByRole('option', { name: 'Anthropic' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'OpenAI' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Google' })).toBeInTheDocument()
  })

  it('shows an inline warning when the selected chat provider is missing an API key', async () => {
    vi.mocked(settingsApi.get).mockResolvedValue({
      ...baseSettings,
      apiKeyStatus: {
        anthropic: true,
        openai: false,
        google: true
      }
    })

    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    )

    await screen.findByLabelText('Chat provider')
    fireEvent.change(screen.getByLabelText('Chat provider'), {
      target: { value: 'openai' }
    })

    expect(await screen.findByText(/OPENAI_API_KEY environment variable is not set/i)).toBeInTheDocument()
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
})
