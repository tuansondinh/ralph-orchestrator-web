import { useEffect, useMemo, useState } from 'react'
import { ChatInput } from '@/components/chat/ChatInput'
import { MessageList } from '@/components/chat/MessageList'
import { ToolConfirmationCard } from '@/components/chat/ToolConfirmationCard'
import { useChat } from '@/hooks/useChat'
import type { ChatMessageRecord } from '@/lib/chatApi'
import { settingsApi } from '@/lib/settingsApi'
import { useChatOverlayStore, type AIModel } from '@/stores/chatOverlayStore'

function formatMessageContent(content: string, toolName?: string) {
  if (!toolName) {
    return content
  }

  return `Tool ${toolName}: ${content}`
}

export function ChatOverlay() {
  const [inputValue, setInputValue] = useState('')
  const { sendMessage, confirmToolCall } = useChat()
  const isOpen = useChatOverlayStore((state) => state.isOpen)
  const messages = useChatOverlayStore((state) => state.messages)
  const isStreaming = useChatOverlayStore((state) => state.isStreaming)
  const pendingConfirmation = useChatOverlayStore((state) => state.pendingConfirmation)
  const selectedModel = useChatOverlayStore((state) => state.selectedModel)
  const sessionId = useChatOverlayStore((state) => state.sessionId)
  const toggle = useChatOverlayStore((state) => state.toggle)
  const close = useChatOverlayStore((state) => state.close)
  const setModel = useChatOverlayStore((state) => state.setModel)

  useEffect(() => {
    if (!isOpen) {
      return
    }

    let cancelled = false
    settingsApi
      .get()
      .then((settings) => {
        if (!cancelled) {
          setModel(settings.chatModel)
        }
      })
      .catch(() => {
        // Ignore transient settings read errors and keep current model.
      })

    return () => {
      cancelled = true
    }
  }, [isOpen, setModel])

  const uiMessages = useMemo<ChatMessageRecord[]>(
    () =>
      messages.map((message) => ({
        id: message.id,
        sessionId,
        role: message.role === 'user' ? 'user' : 'assistant',
        content: formatMessageContent(message.content, message.toolCall?.name),
        link: message.toolCall?.link,
        timestamp: message.timestamp
      })),
    [messages, sessionId]
  )

  const handleSend = () => {
    const next = inputValue.trim()
    if (next.length === 0 || isStreaming) {
      return
    }

    void sendMessage(next)
    setInputValue('')
  }

  if (!isOpen) {
    return (
      <div className="pointer-events-none fixed bottom-4 right-4 z-50">
        <button
          aria-label="Open chat assistant"
          className="pointer-events-auto inline-flex h-14 w-14 items-center justify-center rounded-full border border-zinc-700 bg-zinc-900 text-zinc-100 shadow-xl transition hover:bg-zinc-800"
          onClick={toggle}
          type="button"
        >
          Chat
        </button>
      </div>
    )
  }

  return (
    <section className="fixed bottom-4 right-4 z-50 h-[480px] w-[380px] rounded-xl border border-zinc-700 bg-zinc-900 p-3 shadow-2xl transition-all duration-200">
      <div className="flex h-full min-h-0 flex-col gap-3">
        <header className="flex items-center justify-between border-b border-zinc-800 pb-2">
          <div>
            <h2 className="text-sm font-semibold text-zinc-100">Ralph Assistant</h2>
            <label className="mt-1 flex items-center gap-2 text-xs text-zinc-400" htmlFor="chat-model">
              Chat model
              <select
                className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-100"
                id="chat-model"
                aria-label="Chat model"
                onChange={(event) => setModel(event.target.value as AIModel)}
                value={selectedModel}
              >
                <option value="gemini">Gemini</option>
                <option value="openai">OpenAI (GPT-4o)</option>
                <option value="claude">Claude</option>
              </select>
            </label>
          </div>
          <button
            aria-label="Close chat assistant"
            className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-200 transition hover:bg-zinc-800"
            onClick={close}
            type="button"
          >
            Close
          </button>
        </header>

        <div className="min-h-0 flex-1">
          <MessageList
            isThinking={isStreaming && uiMessages.length === 0}
            messages={uiMessages}
            onMessageLinkClick={close}
          />
        </div>

        {pendingConfirmation ? (
          <ToolConfirmationCard
            confirmation={pendingConfirmation}
            onCancel={() => {
              void confirmToolCall(pendingConfirmation.id, false)
            }}
            onConfirm={() => {
              void confirmToolCall(pendingConfirmation.id, true)
            }}
          />
        ) : null}

        <ChatInput
          disabled={isStreaming}
          isSending={isStreaming}
          onChange={setInputValue}
          onSend={handleSend}
          value={inputValue}
        />
      </div>
    </section>
  )
}
