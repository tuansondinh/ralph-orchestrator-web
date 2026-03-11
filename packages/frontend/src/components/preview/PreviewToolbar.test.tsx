import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PreviewToolbar } from '@/components/preview/PreviewToolbar'

describe('PreviewToolbar', () => {
  it('uses mobile-safe stacked controls and readable command text', () => {
    const { container } = render(
      <PreviewToolbar
        args={['run', 'dev', '--host', '0.0.0.0']}
        command="pnpm"
        isSavingUrl={false}
        onConfigure={vi.fn()}
        onCopyUrl={vi.fn()}
        onOpenInBrowser={vi.fn()}
        onRefresh={vi.fn()}
        onSaveUrl={vi.fn()}
        onUrlInputChange={vi.fn()}
        state="ready"
        url="http://127.0.0.1:3001"
        urlInput="http://127.0.0.1:3001"
      />
    )

    const actions = screen.getByRole('button', { name: 'Refresh' }).parentElement
    expect(actions).toHaveClass('w-full')
    expect(actions).toHaveClass('sm:w-auto')

    const saveUrlButton = screen.getByRole('button', { name: 'Save URL' })
    expect(saveUrlButton).toHaveClass('w-full')
    expect(saveUrlButton).toHaveClass('sm:w-auto')

    const commandText = container.querySelector('p[title]')
    expect(commandText).not.toHaveClass('truncate')
    expect(commandText).toHaveClass('break-all')
  })
})
