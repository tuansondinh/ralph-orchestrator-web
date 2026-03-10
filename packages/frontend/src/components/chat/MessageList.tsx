import { type ReactNode, useEffect, useRef } from 'react'
import { ChatMessage } from '@/components/chat/ChatMessage'
import type { ChatMessage as ChatSessionMessage } from '@/types/chat'

interface MessageListProps {
  messages: ChatSessionMessage[]
  footer?: ReactNode
  isThinking?: boolean
  onMessageLinkClick?: () => void
}

export function MessageList({
  messages,
  footer,
  isThinking = false,
  onMessageLinkClick
}: MessageListProps) {
  const endRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (typeof endRef.current?.scrollIntoView !== 'function') {
      return
    }

    endRef.current.scrollIntoView({
      behavior: 'smooth',
      block: 'end'
    })
  }, [footer, isThinking, messages])

  return (
    <section
      className="h-full min-h-0 space-y-3 overflow-y-auto overflow-x-hidden rounded-lg border border-zinc-800 bg-zinc-950/60 p-3"
      data-testid="chat-message-list"
    >
      {messages.length === 0 ? (
        <p className="text-sm text-zinc-500">No messages yet</p>
      ) : (
        messages
          .filter(
            (message) =>
              message.role !== 'tool' && message.content.trim().length > 0
          )
          .map((message) => (
            <ChatMessage key={message.id} message={message} onLinkClick={onMessageLinkClick} />
          ))
      )}
      {footer ? <div className="pt-2">{footer}</div> : null}
      {isThinking ? (
        <article className="flex justify-start" data-testid="chat-thinking-indicator">
          <div className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900/70 px-3 py-2 text-sm text-zinc-200">
            <span>Ralph is thinking</span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 animate-pulse rounded-full bg-cyan-400" />
              <span
                className="h-2 w-2 animate-pulse rounded-full bg-cyan-400"
                style={{ animationDelay: '120ms' }}
              />
              <span
                className="h-2 w-2 animate-pulse rounded-full bg-cyan-400"
                style={{ animationDelay: '240ms' }}
              />
            </span>
          </div>
        </article>
      ) : null}
      <div aria-hidden="true" ref={endRef} />
    </section>
  )
}
