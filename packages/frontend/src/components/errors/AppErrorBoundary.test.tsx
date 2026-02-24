import type { JSX } from 'react'
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppErrorBoundary } from '@/components/errors/AppErrorBoundary'

function Boom(): JSX.Element {
  throw new Error('boom')
}

describe('AppErrorBoundary', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders fallback UI when a child component throws', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <AppErrorBoundary resetKey="test-fallback">
        <Boom />
      </AppErrorBoundary>
    )

    expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument()
    expect(screen.getByText('Try refreshing this section.')).toBeInTheDocument()
  })
})
