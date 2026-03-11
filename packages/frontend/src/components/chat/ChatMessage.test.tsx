import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { ChatMessage } from '@/components/chat/ChatMessage'

afterEach(() => {
  cleanup()
})

describe('ChatMessage', () => {
  it('renders thinking messages as collapsible sections', () => {
    render(
      <MemoryRouter>
        <ChatMessage
          message={{
            id: 'thinking-1',
            role: 'thinking',
            content: 'Inspecting files',
            timestamp: 1,
            isStreaming: false
          }}
        />
      </MemoryRouter>
    )

    expect(screen.getByRole('button', { name: /Ralph thinking/i })).toHaveAttribute(
      'aria-expanded',
      'false'
    )
    expect(screen.queryByText('Inspecting files')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Ralph thinking/i }))

    expect(screen.getByText('Inspecting files')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Ralph thinking/i })).toHaveAttribute(
      'aria-expanded',
      'true'
    )
  })

  it('auto-opens streaming thinking messages', () => {
    render(
      <MemoryRouter>
        <ChatMessage
          message={{
            id: 'thinking-2',
            role: 'thinking',
            content: 'Planning next step',
            timestamp: 1,
            isStreaming: true
          }}
        />
      </MemoryRouter>
    )

    expect(screen.getByText('Planning next step')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Ralph thinking\.\.\./i })).toHaveAttribute(
      'aria-expanded',
      'true'
    )
  })

  it('renders tool messages with visible progress details', () => {
    render(
      <MemoryRouter>
        <ChatMessage
          message={{
            id: 'tool-1',
            role: 'tool',
            content: '',
            timestamp: 1,
            toolCall: {
              name: 'read_file',
              args: { path: 'README.md' },
              state: 'running'
            }
          }}
        />
      </MemoryRouter>
    )

    expect(screen.getByRole('button', { name: /Tool running: read_file/i })).toHaveAttribute(
      'aria-expanded',
      'true'
    )
    expect(screen.getByText('Arguments')).toBeInTheDocument()
    expect(screen.getByText(/README\.md/)).toBeInTheDocument()
    expect(screen.getByText('Working...')).toBeInTheDocument()
  })
})
