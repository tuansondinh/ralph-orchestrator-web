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
    <div className="space-y-2">
      <label className="text-sm text-zinc-300" htmlFor="chat-message-input">
        Message
      </label>
      <textarea
        id="chat-message-input"
        aria-label="Message"
        className="min-h-[96px] w-full rounded-md border border-zinc-700 bg-zinc-950 p-3 text-sm text-zinc-100 outline-none ring-zinc-500 transition focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={
          disabled ? 'Wait for Ralph to ask for input...' : 'Ask Ralph to plan your next task...'
        }
        value={value}
      />
      <div className="flex justify-end">
        <button
          className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm font-medium text-zinc-100 transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
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
