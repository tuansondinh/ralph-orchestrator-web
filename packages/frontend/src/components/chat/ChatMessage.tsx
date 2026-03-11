import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { Link } from 'react-router-dom'
import type { ChatMessage } from '@/types/chat'

interface ChatMessageProps {
  message: ChatMessage & {
    link?: string
  }
  onLinkClick?: () => void
}

function MarkdownContent({
  content,
  link,
  onLinkClick
}: {
  content: string
  link?: string
  onLinkClick?: () => void
}) {
  return (
    <>
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
        {content}
      </ReactMarkdown>
      {link ? (
        <div className="mt-2">
          <Link
            className="text-xs font-medium text-cyan-300 underline-offset-2 hover:underline"
            onClick={onLinkClick}
            to={link}
          >
            View details
          </Link>
        </div>
      ) : null}
    </>
  )
}

function ThinkingMessage({
  message
}: {
  message: ChatMessage
}) {
  const [isOpen, setIsOpen] = useState(Boolean(message.isStreaming))

  useEffect(() => {
    if (message.isStreaming) {
      setIsOpen(true)
    }
  }, [message.id, message.isStreaming])

  return (
    <article className="flex justify-start" data-testid="chat-message-thinking">
      <div className="min-w-0 max-w-full overflow-hidden rounded-lg border border-zinc-700/80 bg-zinc-900/40 sm:max-w-[92%] md:max-w-[80%]">
        <button
          aria-expanded={isOpen}
          className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm text-zinc-200 transition hover:bg-zinc-800/70"
          onClick={() => setIsOpen((current) => !current)}
          type="button"
        >
          <span className="font-medium">
            Ralph thinking{message.isStreaming ? '...' : ''}
          </span>
          <span className="text-xs text-zinc-400">
            {isOpen ? 'Collapse' : 'Expand'}
          </span>
        </button>
        {isOpen ? (
          <div className="border-t border-zinc-800 px-3 py-2 text-sm leading-6 text-zinc-300">
            <MarkdownContent content={message.content} />
          </div>
        ) : null}
      </div>
    </article>
  )
}

function ToolMessage({
  message
}: {
  message: ChatMessage
}) {
  const [isOpen, setIsOpen] = useState(message.toolCall?.state !== 'completed')
  const state = message.toolCall?.state ?? 'running'
  const toolName = message.toolCall?.name ?? 'tool'
  const args = message.toolCall?.args ?? {}

  useEffect(() => {
    if (state === 'running' || state === 'pending' || state === 'error') {
      setIsOpen(true)
    }
  }, [state, message.id])

  return (
    <article className="flex justify-start" data-testid="chat-message-tool">
      <div className="min-w-0 max-w-full overflow-hidden rounded-lg border border-zinc-700/80 bg-zinc-950/30 sm:max-w-[92%] md:max-w-[80%]">
        <button
          aria-expanded={isOpen}
          className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm text-zinc-200 transition hover:bg-zinc-800/50"
          onClick={() => setIsOpen((current) => !current)}
          type="button"
        >
          <span className="font-medium">
            {state === 'completed'
              ? `Tool finished: ${toolName}`
              : state === 'error'
                ? `Tool failed: ${toolName}`
                : `Tool running: ${toolName}`}
          </span>
          <span className="text-xs text-zinc-400">
            {isOpen ? 'Collapse' : 'Expand'}
          </span>
        </button>
        {isOpen ? (
          <div className="border-t border-zinc-800 px-3 py-2 text-sm leading-6 text-zinc-300">
            <div className="mb-2">
              <p className="font-medium text-zinc-200">Arguments</p>
              <pre className="mt-1 whitespace-pre-wrap break-all rounded bg-zinc-950 p-2 text-xs">
                {JSON.stringify(args, null, 2)}
              </pre>
            </div>
            <div>
              <p className="font-medium text-zinc-200">
                {state === 'completed' ? 'Result' : state === 'error' ? 'Error' : 'Status'}
              </p>
              <p className="mt-1 whitespace-pre-wrap break-words text-zinc-300">
                {message.content.trim().length > 0
                  ? message.content
                  : state === 'pending'
                    ? 'Queued...'
                    : state === 'running'
                      ? 'Working...'
                      : 'No output.'}
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </article>
  )
}

export function ChatMessage({ message, onLinkClick }: ChatMessageProps) {
  if (message.role === 'thinking') {
    return <ThinkingMessage message={message} />
  }

  if (message.role === 'tool') {
    return <ToolMessage message={message} />
  }

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
        <MarkdownContent
          content={message.content}
          link={message.link}
          onLinkClick={onLinkClick}
        />
      </div>
    </article>
  )
}
