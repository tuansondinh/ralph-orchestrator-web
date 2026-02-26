import { useEffect, useMemo, useState } from 'react'
import { ChatInput } from '@/components/chat/ChatInput'
import { MessageList } from '@/components/chat/MessageList'
import { ToolConfirmationCard } from '@/components/chat/ToolConfirmationCard'
import { useChat } from '@/hooks/useChat'
import type { ChatMessageRecord } from '@/lib/chatApi'
import { settingsApi } from '@/lib/settingsApi'
import { useChatOverlayStore, type AIModel } from '@/stores/chatOverlayStore'

interface ProjectListItem {
  id?: string
  name?: string
  path?: string
  type?: string
  ralphConfig?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function toReadableJson(value: unknown) {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function parseJson(content: string) {
  try {
    return JSON.parse(content)
  } catch {
    return undefined
  }
}

function toProjectListItem(value: unknown): ProjectListItem | null {
  if (!isRecord(value)) {
    return null
  }

  const name = typeof value.name === 'string' ? value.name : undefined
  const path = typeof value.path === 'string' ? value.path : undefined
  const type = typeof value.type === 'string' ? value.type : undefined
  const ralphConfig = typeof value.ralphConfig === 'string' ? value.ralphConfig : undefined
  const id = typeof value.id === 'string' ? value.id : undefined

  if (!name && !path && !type && !ralphConfig && !id) {
    return null
  }

  return {
    id,
    name,
    path,
    type,
    ralphConfig
  }
}

function formatListProjectsResult(content: string) {
  const parsed = parseJson(content)
  if (!Array.isArray(parsed)) {
    return null
  }

  const projects = parsed.map(toProjectListItem).filter((value): value is ProjectListItem => value !== null)

  if (projects.length === 0) {
    return 'Tool `list_projects`\n\nNo projects found.'
  }

  const lines = [`Tool \`list_projects\``, '', `Found ${projects.length} project${projects.length === 1 ? '' : 's'}:`, '']

  for (const [index, project] of projects.entries()) {
    lines.push(`${index + 1}. **${project.name ?? 'Unnamed project'}**`)

    if (project.path) {
      lines.push(`Path: \`${project.path}\``)
    }

    if (project.type) {
      lines.push(`Type: \`${project.type}\``)
    }

    if (project.ralphConfig) {
      lines.push(`Config: \`${project.ralphConfig}\``)
    }

    if (project.id) {
      lines.push(`ID: \`${project.id}\``)
    }

    if (index < projects.length - 1) {
      lines.push('')
    }
  }

  return lines.join('\n')
}

function formatToolResult(toolName: string, content: string) {
  if (toolName === 'list_projects') {
    const formatted = formatListProjectsResult(content)
    if (formatted) {
      return formatted
    }
  }

  const parsed = parseJson(content)
  const readable = parsed === undefined ? content : toReadableJson(parsed)
  return `Tool \`${toolName}\`\n\n\`\`\`json\n${readable}\n\`\`\``
}

function formatMessageContent(content: string, toolName?: string) {
  if (!toolName) {
    return content
  }

  return formatToolResult(toolName, content)
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
    if (next.length === 0 || isStreaming || pendingConfirmation?.status === 'pending') {
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
    <section className="fixed bottom-4 right-4 z-50 h-[min(720px,calc(100vh-2rem))] w-[min(570px,calc(100vw-2rem))] overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900 p-3 shadow-2xl transition-all duration-200">
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

        <div className="min-h-0 flex-1 overflow-hidden">
          <MessageList
            isThinking={isStreaming && uiMessages.length === 0}
            messages={uiMessages}
            onMessageLinkClick={close}
          />
        </div>

        {pendingConfirmation ? (
          <div className="shrink-0">
            <ToolConfirmationCard
              confirmation={pendingConfirmation}
              onCancel={() => {
                void confirmToolCall(pendingConfirmation.id, false)
              }}
              onConfirm={() => {
                void confirmToolCall(pendingConfirmation.id, true)
              }}
            />
          </div>
        ) : null}

        <div className="shrink-0">
          <ChatInput
            disabled={isStreaming || pendingConfirmation?.status === 'pending'}
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
