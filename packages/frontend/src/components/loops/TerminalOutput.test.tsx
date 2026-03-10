import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { TerminalOutput } from '@/components/loops/TerminalOutput'

describe('TerminalOutput', () => {
  afterEach(() => {
    cleanup()
  })

  it('auto-scrolls by default and allows resume after manual scroll pause', () => {
    render(<TerminalOutput lines={['boot']} />)

    const viewport = screen.getByTestId('terminal-scroll')
    Object.defineProperty(viewport, 'clientHeight', {
      value: 100,
      configurable: true
    })
    Object.defineProperty(viewport, 'scrollHeight', {
      value: 400,
      configurable: true
    })

    fireEvent.scroll(viewport, { target: { scrollTop: 10 } })
    expect(screen.getByRole('button', { name: 'Scroll to bottom' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Scroll to bottom' }))
    expect(screen.queryByRole('button', { name: 'Scroll to bottom' })).not.toBeInTheDocument()
  })

  it('strips non-text terminal control sequences from loop output', () => {
    render(
      <TerminalOutput
        lines={[
          '\u001b[?25l\u001b[?1049h\u001b[2Jworking...\u001b[0m',
          '\u001b[31mfailed\u001b[0m'
        ]}
      />
    )

    const viewport = screen.getByTestId('terminal-scroll')
    expect(viewport).toHaveTextContent('working...')
    expect(viewport).toHaveTextContent('failed')
    expect(viewport).not.toHaveTextContent('[?25l')
    expect(viewport).not.toHaveTextContent('[?1049h')
  })
})
