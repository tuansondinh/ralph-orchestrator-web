import { type KeyboardEvent } from 'react'

interface ChatInputProps {
  value: string
  disabled: boolean
  isSending: boolean
  onChange: (value: string) => void
  onSend: () => void
}

export function ChatInput({
  value,
  disabled,
  isSending,
  onChange,
  onSend
}: ChatInputProps) {
  const submitDisabled = disabled || isSending || value.trim().length === 0

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey) {
      return
    }

    event.preventDefault()
    if (!submitDisabled) {
      onSend()
    }
  }

  return (
    <div className="w-full space-y-1.5 sm:space-y-2">
      <label className="sr-only" htmlFor="chat-message-input">
        Message
      </label>
      <textarea
        id="chat-message-input"
        aria-label="Message"
        className="min-h-[72px] max-h-[34vh] w-full resize-y rounded-lg border border-zinc-800 bg-zinc-950/70 p-2.5 text-sm text-zinc-100 outline-none ring-zinc-500 transition focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-[96px] sm:max-h-[40vh] sm:p-3"
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={
          disabled ? 'Wait for Ralph to ask for input...' : 'Ask Ralph to plan your next task...'
        }
        value={value}
      />
      <div className="flex w-full justify-end">
        <button
          className="min-w-20 rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-2 text-xs font-medium text-zinc-100 transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 sm:min-w-24 sm:px-3 sm:text-sm"
          disabled={submitDisabled}
          onClick={onSend}
          type="button"
        >
          {isSending ? 'Sending...' : 'Send'}
        </button>
      </div>
    </div>
  )
}
