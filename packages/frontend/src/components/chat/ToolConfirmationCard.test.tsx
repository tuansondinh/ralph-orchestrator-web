import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ToolConfirmationCard } from '@/components/chat/ToolConfirmationCard'

describe('ToolConfirmationCard', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders the tool name and args summary', () => {
    render(
      <ToolConfirmationCard
        confirmation={{
          id: 'tool-1',
          toolName: 'delete_project',
          description: 'Confirm delete_project',
          args: {
            projectId: 'project-1',
            force: true
          },
          status: 'pending',
          isSubmitting: false
        }}
        onCancel={() => { }}
        onConfirm={() => { }}
      />
    )

    expect(screen.getByText('delete_project')).toBeInTheDocument()
    expect(screen.getByText(/projectId/)).toBeInTheDocument()
    expect(screen.getByText(/project-1/)).toBeInTheDocument()
  })

  it('disables confirmation actions once user confirms', () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    const { rerender } = render(
      <ToolConfirmationCard
        confirmation={{
          id: 'tool-2',
          toolName: 'kill_process',
          description: 'Confirm kill_process',
          args: {
            pid: 123
          },
          status: 'pending',
          isSubmitting: false
        }}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)

    rerender(
      <ToolConfirmationCard
        confirmation={{
          id: 'tool-2',
          toolName: 'kill_process',
          description: 'Confirm kill_process',
          args: {
            pid: 123
          },
          status: 'confirmed',
          isSubmitting: false
        }}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />
    )

    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    expect(screen.getByText('Confirmed')).toBeInTheDocument()
  })
})
