import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ChatInput } from '@/components/chat/ChatInput'

describe('ChatInput', () => {
  it('submits on Enter and keeps newline behavior for Shift+Enter', () => {
    const onSend = vi.fn()
    const onChange = vi.fn()

    render(
      <ChatInput
        disabled={false}
        isSending={false}
        value="Draft message"
        onChange={onChange}
        onSend={onSend}
      />
    )

    fireEvent.keyDown(screen.getByLabelText('Message'), { key: 'Enter', shiftKey: true })
    expect(onSend).not.toHaveBeenCalled()

    fireEvent.keyDown(screen.getByLabelText('Message'), { key: 'Enter', shiftKey: false })
    expect(onSend).toHaveBeenCalledTimes(1)
  })
})
