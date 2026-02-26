import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SettingsPage } from '@/pages/SettingsPage'
import { settingsApi } from '@/lib/settingsApi'

vi.mock('@/lib/settingsApi', () => ({
  settingsApi: {
    get: vi.fn(),
    update: vi.fn(),
    testBinary: vi.fn(),
    clearData: vi.fn()
  }
}))

const baseSettings = {
  chatModel: 'gemini' as const,
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
    vi.mocked(settingsApi.update).mockImplementation(async (input) => ({
      ...baseSettings,
      ...input,
      chatModel: input.chatModel ?? baseSettings.chatModel,
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
    render(<SettingsPage />)

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
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }))

    await waitFor(() => {
      expect(settingsApi.update).toHaveBeenCalledWith({
        chatModel: 'claude',
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

  it('tests the configured binary and shows success or failure feedback', async () => {
    render(<SettingsPage />)

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
    render(<SettingsPage />)

    await screen.findByLabelText('Ralph binary path')
    fireEvent.click(screen.getByRole('button', { name: 'Clear data' }))

    await waitFor(() => {
      expect(settingsApi.clearData).toHaveBeenCalledWith({ confirm: true })
    })

    confirmSpy.mockRestore()
  })
})
