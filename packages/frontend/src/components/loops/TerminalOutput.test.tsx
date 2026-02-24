import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TerminalOutput } from '@/components/loops/TerminalOutput'

describe('TerminalOutput', () => {
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
})
