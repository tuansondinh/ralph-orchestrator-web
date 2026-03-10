import { useState } from 'react'
import { ChatInput } from '@/components/chat/ChatInput'
import { MessageList } from '@/components/chat/MessageList'
import { ToolConfirmationCard } from '@/components/chat/ToolConfirmationCard'
import { useChatSession } from '@/hooks/useChatSession'

export function ChatOverlay() {
  const [inputValue, setInputValue] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const { messages, isStreaming, pendingConfirmation, sendMessage, confirmAction } =
    useChatSession()

  const handleSend = () => {
    const next = inputValue.trim()
    if (next.length === 0 || isStreaming || pendingConfirmation) {
      return
    }

    sendMessage(next)
    setInputValue('')
  }

  if (!isOpen) {
    return (
      <div className="pointer-events-none fixed bottom-4 right-4 z-50">
        <button
          aria-label="Open chat assistant"
          className="pointer-events-auto inline-flex h-14 w-14 items-center justify-center rounded-full border border-zinc-700 bg-zinc-900 text-zinc-100 shadow-xl transition hover:bg-zinc-800"
          onClick={() => setIsOpen(true)}
          type="button"
        >
          Chat
        </button>
      </div>
    )
  }

  return (
    <section className="fixed bottom-4 right-4 z-50 h-[min(720px,calc(100vh-2rem))] w-[min(570px,calc(100vw-2rem))] overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900 p-3 shadow-2xl transition-all duration-200">
      <div className="flex h-full min-h-0 flex-col gap-3">
        <header className="flex items-center justify-between border-b border-zinc-800 pb-2">
          <div>
            <h2 className="text-sm font-semibold text-zinc-100">Ralph Assistant</h2>
          </div>
          <button
            aria-label="Close chat assistant"
            className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-200 transition hover:bg-zinc-800"
            onClick={() => setIsOpen(false)}
            type="button"
          >
            Close
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-hidden">
          <MessageList isThinking={isStreaming} messages={messages} />
        </div>

        {pendingConfirmation ? (
          <div className="shrink-0">
            <ToolConfirmationCard
              confirmation={pendingConfirmation}
              onCancel={() => {
                confirmAction(pendingConfirmation.permissionId, false)
              }}
              onConfirm={() => {
                confirmAction(pendingConfirmation.permissionId, true)
              }}
            />
          </div>
        ) : null}

        <div className="shrink-0">
          <ChatInput
            disabled={isStreaming || Boolean(pendingConfirmation)}
            isSending={isStreaming}
            onChange={setInputValue}
            onSend={handleSend}
            value={inputValue}
          />
        </div>
      </div>
    </section>
  )
}
