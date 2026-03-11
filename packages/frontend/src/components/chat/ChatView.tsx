import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { ChatInput } from '@/components/chat/ChatInput'
import { MessageList } from '@/components/chat/MessageList'
import { ToolConfirmationCard } from '@/components/chat/ToolConfirmationCard'
import { useCapabilities } from '@/hooks/useCapabilities'
import { useChatSession } from '@/hooks/useChatSession'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { getVisibleProjectTabs } from '@/lib/projectTabs'
import { useProjectStore } from '@/stores/projectStore'

interface ChatViewProps {
  projectId: string
}

function getKeyboardOffset() {
  if (typeof window === 'undefined' || !window.visualViewport) {
    return 0
  }

  return Math.max(
    0,
    window.innerHeight - window.visualViewport.height - window.visualViewport.offsetTop
  )
}

export function ChatView({ projectId }: ChatViewProps) {
  const [inputValue, setInputValue] = useState('')
  const [isNavOpen, setIsNavOpen] = useState(false)
  const [keyboardOffset, setKeyboardOffset] = useState(0)
  const isMobile = useMediaQuery('(max-width: 767px)')
  const project = useProjectStore((state) =>
    state.projects.find((candidate) => candidate.id === projectId) ?? null
  )
  const { capabilities } = useCapabilities()
  const {
    messages,
    isStreaming,
    pendingConfirmation,
    sendMessage,
    confirmAction,
    restartChat
  } = useChatSession()

  const visibleTabs = getVisibleProjectTabs(capabilities)

  useEffect(() => {
    if (!isMobile) {
      setIsNavOpen(false)
    }
  }, [isMobile])

  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) {
      return
    }

    const updateKeyboardOffset = () => {
      setKeyboardOffset(getKeyboardOffset())
    }

    updateKeyboardOffset()
    window.visualViewport.addEventListener('resize', updateKeyboardOffset)
    window.visualViewport.addEventListener('scroll', updateKeyboardOffset)

    return () => {
      window.visualViewport?.removeEventListener('resize', updateKeyboardOffset)
      window.visualViewport?.removeEventListener('scroll', updateKeyboardOffset)
    }
  }, [])

  const handleSend = () => {
    const next = inputValue.trim()
    if (next.length === 0 || isStreaming || pendingConfirmation) {
      return
    }

    sendMessage(next)
    setInputValue('')
  }

  return (
    <section
      className="relative flex h-full min-h-0 min-w-0 w-full flex-1 flex-col overflow-hidden"
      data-testid="chat-view"
    >
      {isMobile ? (
        <div className="flex min-h-11 items-center px-3 pt-3">
          <div className="flex w-full items-center justify-between gap-3">
            <button
              aria-label="Open project navigation"
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900/80 text-zinc-100 transition hover:bg-zinc-800"
              onClick={() => setIsNavOpen(true)}
              type="button"
            >
              <span aria-hidden="true" className="text-lg leading-none">
                ≡
              </span>
            </button>
            <button
              className="rounded-md border border-zinc-700 px-3 py-2 text-xs text-zinc-200 transition hover:bg-zinc-800"
              onClick={restartChat}
              type="button"
            >
              Restart chat
            </button>
          </div>
        </div>
      ) : (
        <header className="px-4 py-3">
          <div className="flex min-h-11 w-full items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-zinc-100 sm:text-xl">Chat</h2>
            <button
              className="rounded-md border border-zinc-700 px-3 py-2 text-xs text-zinc-200 transition hover:bg-zinc-800"
              onClick={restartChat}
              type="button"
            >
              Restart chat
            </button>
          </div>
        </header>
      )}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 pb-3">
        <div
          className="flex min-h-0 w-full flex-1 flex-col overflow-hidden"
          data-testid="chat-content"
        >
          <div className="min-h-0 flex-1 overflow-hidden">
            <MessageList
              isThinking={isStreaming}
              messages={messages}
              footer={
                pendingConfirmation ? (
                  <ToolConfirmationCard
                    confirmation={pendingConfirmation}
                    onCancel={() => confirmAction(pendingConfirmation.permissionId, false)}
                    onConfirm={() => confirmAction(pendingConfirmation.permissionId, true)}
                  />
                ) : null
              }
            />
          </div>

          <div
            className="sticky bottom-0 mt-3 w-full shrink-0 self-stretch border-t border-zinc-800/80 bg-zinc-950/95 px-1 pt-3 pb-[env(safe-area-inset-bottom)]"
            data-testid="chat-composer"
            style={{
              bottom: `${keyboardOffset}px`
            }}
          >
            <ChatInput
              disabled={isStreaming || Boolean(pendingConfirmation)}
              isSending={isStreaming}
              onChange={setInputValue}
              onSend={handleSend}
              value={inputValue}
            />
          </div>
        </div>
      </div>

      {isMobile && isNavOpen ? (
        <>
          <button
            aria-label="Close project navigation"
            className="absolute inset-0 z-10 bg-black/50"
            onClick={() => setIsNavOpen(false)}
            type="button"
          />
          <aside className="absolute inset-y-0 left-0 z-20 flex w-[min(20rem,85vw)] flex-col border-r border-zinc-800 bg-zinc-950 p-4 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Project</p>
                <h2 className="mt-1 text-lg font-semibold text-zinc-100">
                  {project?.name ?? 'Project'}
                </h2>
              </div>
              <button
                aria-label="Close project navigation"
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-100 transition hover:bg-zinc-800"
                onClick={() => setIsNavOpen(false)}
                type="button"
              >
                ×
              </button>
            </div>

            <nav aria-label="Project chat navigation" className="flex flex-col gap-2">
              {visibleTabs.map((tab) => (
                <NavLink
                  key={tab.id}
                  className={({ isActive }) =>
                    `flex min-h-11 items-center rounded-lg px-3 text-sm transition ${
                      isActive
                        ? 'bg-zinc-100 text-zinc-900'
                        : 'border border-zinc-800 text-zinc-200 hover:bg-zinc-900'
                    }`
                  }
                  onClick={() => setIsNavOpen(false)}
                  to={`/project/${projectId}/${tab.id}`}
                >
                  {tab.label}
                </NavLink>
              ))}
            </nav>
          </aside>
        </>
      ) : null}
    </section>
  )
}
