import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TerminalView } from '@/components/terminal/TerminalView'
import { terminalApi, type TerminalSessionRecord } from '@/lib/terminalApi'
import { resetTerminalStore } from '@/stores/terminalStore'

vi.mock('@/lib/terminalApi', () => ({
  terminalApi: {
    getProjectSessions: vi.fn(),
    getOutputHistory: vi.fn(),
    startSession: vi.fn(),
    endSession: vi.fn()
  }
}))

vi.mock('@/hooks/useWebSocket', () => ({
  useWebSocket: () => ({
    isConnected: true,
    send: vi.fn()
  })
}))

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class {
    fit() {}
  }
}))

vi.mock('@xterm/xterm', () => ({
  Terminal: class {
    cols = 120
    rows = 30
    options: Record<string, unknown> = {}
    loadAddon() {}
    open() {}
    write() {}
    refresh() {}
    focus() {}
    onData() {
      return {
        dispose() {}
      }
    }
    dispose() {}
  }
}))

const session: TerminalSessionRecord = {
  id: 'terminal-session-1',
  projectId: 'project-1',
  state: 'active',
  shell: '/bin/zsh',
  cwd: '/tmp/project-1',
  pid: 12345,
  cols: 120,
  rows: 30,
  createdAt: Date.UTC(2026, 2, 11, 0, 0, 0),
  endedAt: null
}

describe('TerminalView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetTerminalStore()
    vi.mocked(terminalApi.getProjectSessions).mockResolvedValue([session])
    vi.mocked(terminalApi.getOutputHistory).mockResolvedValue([])
  })

  afterEach(() => {
    cleanup()
    resetTerminalStore()
  })

  it('uses stacked mobile layout primitives for terminal session controls', async () => {
    render(<TerminalView projectId="project-1" />)

    await waitFor(() => {
      expect(terminalApi.getProjectSessions).toHaveBeenCalledWith({ projectId: 'project-1' })
    })

    const backendLabel = await screen.findByText('Backend')
    const header = backendLabel.closest('div')?.parentElement
    expect(header).toHaveClass('flex-col')
    expect(header).toHaveClass('sm:flex-row')

    const controls = screen.getByRole('button', { name: 'PLAN' }).parentElement
    expect(controls).toHaveClass('flex-wrap')
    expect(controls).toHaveClass('justify-start')
  })

  it('loads output history for the active terminal session on mount', async () => {
    render(<TerminalView projectId="project-1" />)

    await waitFor(() => {
      expect(terminalApi.getProjectSessions).toHaveBeenCalledWith({ projectId: 'project-1' })
    })

    await waitFor(() => {
      expect(terminalApi.getOutputHistory).toHaveBeenCalledWith({
        sessionId: 'terminal-session-1'
      })
    })
  })
})
