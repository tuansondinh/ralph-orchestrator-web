import ReactMarkdown from 'react-markdown'
import { Link } from 'react-router-dom'
import type { ChatMessage } from '@/types/chat'

interface ChatMessageProps {
  message: ChatMessage & {
    link?: string
  }
  onLinkClick?: () => void
}

export function ChatMessage({ message, onLinkClick }: ChatMessageProps) {
  const isUser = message.role === 'user'

  return (
    <article
      className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
      data-testid={isUser ? 'chat-message-user' : 'chat-message-assistant'}
    >
      <div
        className={`min-w-0 max-w-full overflow-x-hidden rounded-lg border px-3 py-2 text-sm leading-6 sm:max-w-[92%] md:max-w-[80%] ${
          isUser
            ? 'border-cyan-700/70 bg-cyan-950/60 text-cyan-100'
            : 'border-zinc-700 bg-zinc-900/60 text-zinc-100'
        }`}
      >
        <ReactMarkdown
          components={{
            h1: ({ node: _node, ...props }) => (
              <h1 className="mb-2 text-base font-semibold" {...props} />
            ),
            h2: ({ node: _node, ...props }) => (
              <h2 className="mb-2 text-sm font-semibold" {...props} />
            ),
            p: ({ node: _node, ...props }) => (
              <p className="mb-2 whitespace-pre-wrap break-words last:mb-0" {...props} />
            ),
            ul: ({ node: _node, ...props }) => (
              <ul className="mb-2 list-disc space-y-1 pl-5 last:mb-0" {...props} />
            ),
            ol: ({ node: _node, ...props }) => (
              <ol className="mb-2 list-decimal space-y-1 pl-5 last:mb-0" {...props} />
            ),
            pre: ({ node: _node, ...props }) => (
              <pre
                className="mb-2 whitespace-pre-wrap break-all rounded bg-zinc-950 p-2 text-xs last:mb-0"
                {...props}
              />
            ),
            code: ({ node: _node, className, ...props }) => (
              <code
                className={`whitespace-pre-wrap break-words rounded bg-zinc-950 px-1 py-0.5 font-mono text-xs ${
                  className ?? ''
                }`}
                {...props}
              />
            )
          }}
        >
          {message.content}
        </ReactMarkdown>
        {message.link ? (
          <div className="mt-2">
            <Link
              className="text-xs font-medium text-cyan-300 underline-offset-2 hover:underline"
              onClick={onLinkClick}
              to={message.link}
            >
              View details
            </Link>
          </div>
        ) : null}
      </div>
    </article>
  )
}
