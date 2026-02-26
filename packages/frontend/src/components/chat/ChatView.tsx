import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChatInput } from '@/components/chat/ChatInput'
import { MessageList } from '@/components/chat/MessageList'
import { useWebSocket } from '@/hooks/useWebSocket'
import {
  chatApi,
  type ChatSessionBackend,
  type ChatMessageRecord,
  type ChatSessionRecord,
  type ChatSessionState,
  type ChatSessionType
} from '@/lib/chatApi'
import { RALPH_BACKENDS } from '@/lib/backends'
import { useChatStore } from '@/stores/chatStore'

interface ChatViewProps {
  projectId: string
}

const EMPTY_MESSAGES: ChatMessageRecord[] = []
const EMPTY_CHANNELS: string[] = []

function getSessionStateLabel(state: ChatSessionState | undefined) {
  if (state === 'active') {
    return 'Ralph is thinking...'
  }

  if (state === 'waiting') {
    return 'Waiting for input'
  }

  if (state === 'completed') {
    return 'Session completed'
  }

  return 'No active session'
}

function normalizeSessionState(input: unknown): ChatSessionState {
  if (input === 'active' || input === 'waiting' || input === 'completed') {
    return input
  }

  return 'unknown'
}

export function ChatView({ projectId }: ChatViewProps) {
  const [inputValue, setInputValue] = useState('')
  const [isStartingSession, setIsStartingSession] = useState(false)
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [awaitingAssistant, setAwaitingAssistant] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sessionsByProject = useChatStore((state) => state.sessionsByProject)
  const messagesBySession = useChatStore((state) => state.messagesBySession)
  const historyLoadedBySession = useChatStore((state) => state.historyLoadedBySession)
  const sessionTypeByProject = useChatStore((state) => state.sessionTypeByProject)
  const sessionBackendByProject = useChatStore((state) => state.sessionBackendByProject)
  const setSessionType = useChatStore((state) => state.setSessionType)
  const setSessionBackend = useChatStore((state) => state.setSessionBackend)
  const setSession = useChatStore((state) => state.setSession)
  const setMessages = useChatStore((state) => state.setMessages)
  const upsertMessage = useChatStore((state) => state.upsertMessage)
  const markHistoryLoaded = useChatStore((state) => state.markHistoryLoaded)
  const updateSessionState = useChatStore((state) => state.updateSessionState)

  const session = sessionsByProject[projectId] ?? null
  const sessionType: ChatSessionType = sessionTypeByProject[projectId] ?? 'plan'
  const sessionBackend: ChatSessionBackend = session?.backend ?? sessionBackendByProject[projectId] ?? 'codex'
  const messages = session ? messagesBySession[session.id] ?? EMPTY_MESSAGES : EMPTY_MESSAGES
  const sessionId = session?.id ?? null
  const isHistoryLoaded = Boolean(sessionId && historyLoadedBySession[sessionId])
  const canSend = Boolean(session && session.state !== 'completed')
  const isThinking =
    session?.state === 'active' &&
    (awaitingAssistant || messages.length === 0)

  const applySession = useCallback(
    (nextSession: ChatSessionRecord) => {
      setSession(projectId, nextSession)
      markHistoryLoaded(nextSession.id, false)
      setMessages(nextSession.id, [])
      setAwaitingAssistant(nextSession.state === 'active')
    },
    [markHistoryLoaded, projectId, setMessages, setSession]
  )

  const websocketChannels = useMemo(
    () => (sessionId ? [`chat:${sessionId}:message`] : EMPTY_CHANNELS),
    [sessionId]
  )

  const handleWebsocketMessage = useCallback(
    (message: Record<string, unknown>) => {
      if (
        message.type === 'chat.message' &&
        typeof message.sessionId === 'string' &&
        typeof message.id === 'string' &&
        typeof message.role === 'string' &&
        typeof message.content === 'string'
      ) {
        if (sessionId && message.sessionId !== sessionId) {
          return
        }

        if (message.role !== 'user' && message.role !== 'assistant') {
          return
        }

        const rawTimestamp = message.timestamp
        const parsedTimestamp =
          typeof rawTimestamp === 'number'
            ? rawTimestamp
            : Date.parse(typeof rawTimestamp === 'string' ? rawTimestamp : '')
        const timestamp = Number.isFinite(parsedTimestamp) ? parsedTimestamp : Date.now()

        upsertMessage({
          id: message.id,
          sessionId: message.sessionId,
          role: message.role,
          content: message.content,
          timestamp
        })

        if (message.role === 'assistant') {
          setAwaitingAssistant(false)
        }
        return
      }

      if (
        message.type === 'chat.state' &&
        typeof message.sessionId === 'string'
      ) {
        if (sessionId && message.sessionId !== sessionId) {
          return
        }

        const endedAt = typeof message.endedAt === 'number' ? message.endedAt : null
        updateSessionState(
          message.sessionId,
          normalizeSessionState(message.state),
          endedAt
        )

        if (message.state === 'waiting' || message.state === 'completed') {
          setAwaitingAssistant(false)
        }
      }
    },
    [sessionId, updateSessionState, upsertMessage]
  )

  const { isConnected } = useWebSocket({
    channels: websocketChannels,
    onMessage: handleWebsocketMessage
  })

  useEffect(() => {
    if (sessionId) {
      return
    }

    let cancelled = false
    setError(null)
    setAwaitingAssistant(false)

    chatApi
      .getProjectSession({ projectId })
      .then((existingSession) => {
        if (cancelled || !existingSession) {
          return
        }

        applySession(existingSession)
      })
      .catch((nextError) => {
        if (!cancelled) {
          setError(
            nextError instanceof Error
              ? nextError.message
              : 'Failed to load existing chat session'
          )
        }
      })

    return () => {
      cancelled = true
    }
  }, [applySession, projectId, sessionId])

  useEffect(() => {
    if (!sessionId) {
      setIsLoadingHistory(false)
      return
    }

    if (isHistoryLoaded) {
      setIsLoadingHistory(false)
      return
    }

    let cancelled = false
    setIsLoadingHistory(true)
    setError(null)

    chatApi
      .getHistory({ sessionId })
      .then((history) => {
        if (cancelled) {
          return
        }

        setMessages(sessionId, history)
        markHistoryLoaded(sessionId, true)
        if (history.some((entry) => entry.role === 'assistant')) {
          setAwaitingAssistant(false)
        }
      })
      .catch((nextError) => {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : 'Failed to load chat history')
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingHistory(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [isHistoryLoaded, markHistoryLoaded, sessionId, setMessages])

  const startSession = useCallback(async () => {
    setIsStartingSession(true)
    setError(null)

    try {
      const started = await chatApi.startSession({
        projectId,
        type: sessionType,
        backend: sessionBackend
      })

      applySession(started)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to start session')
    } finally {
      setIsStartingSession(false)
    }
  }, [applySession, projectId, sessionBackend, sessionType])

  const restartSession = useCallback(async () => {
    if (!session) {
      return
    }

    setIsStartingSession(true)
    setError(null)

    try {
      const restarted = await chatApi.restartSession({
        projectId,
        type: session.type,
        backend: session.backend
      })

      applySession(restarted)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to restart session')
    } finally {
      setIsStartingSession(false)
    }
  }, [applySession, projectId, session])

  const endSession = useCallback(async () => {
    if (!sessionId) {
      return
    }

    setError(null)
    try {
      await chatApi.endSession({ sessionId })
      updateSessionState(sessionId, 'completed', Date.now())
      setAwaitingAssistant(false)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to end session')
    }
  }, [sessionId, updateSessionState])

  const sendMessage = useCallback(async () => {
    if (!sessionId || !canSend) {
      return
    }

    const message = inputValue.trim()
    if (!message) {
      return
    }

    const optimisticMessage: ChatMessageRecord = {
      id: `local-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      sessionId,
      role: 'user',
      content: message,
      timestamp: Date.now()
    }

    upsertMessage(optimisticMessage)
    setInputValue('')
    setError(null)
    updateSessionState(sessionId, 'active')
    setAwaitingAssistant(true)
    setIsSending(true)

    try {
      await chatApi.sendMessage({
        sessionId,
        message
      })
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to send message')
      setAwaitingAssistant(false)
    } finally {
      setIsSending(false)
    }
  }, [canSend, inputValue, sessionId, updateSessionState, upsertMessage])

  return (
    <section className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Chat</h2>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm text-zinc-400" htmlFor="session-type">
            Mode
          </label>
          <select
            aria-label="Session type"
            className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
            disabled={Boolean(session && session.state !== 'completed')}
            id="session-type"
            onChange={(event) =>
              setSessionType(projectId, event.target.value as ChatSessionType)
            }
            value={sessionType}
          >
            <option value="plan">ralph plan</option>
            <option value="task">ralph task</option>
          </select>
          <label className="text-sm text-zinc-400" htmlFor="session-backend">
            Backend
          </label>
          <select
            aria-label="Session backend"
            className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
            disabled={Boolean(session && session.state !== 'completed')}
            id="session-backend"
            onChange={(event) =>
              setSessionBackend(projectId, event.target.value as ChatSessionBackend)
            }
            value={sessionBackend}
          >
            {RALPH_BACKENDS.map((backend) => (
              <option key={backend} value={backend}>
                {backend}
              </option>
            ))}
          </select>
          <button
            className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm font-medium text-zinc-100 transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={Boolean(session && session.state !== 'completed') || isStartingSession}
            onClick={startSession}
            type="button"
          >
            {isStartingSession ? 'Starting...' : 'Start Session'}
          </button>
          {session && session.state !== 'completed' ? (
            <>
              <button
                className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isStartingSession}
                onClick={restartSession}
                type="button"
              >
                Restart Session
              </button>
              <button
                className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isStartingSession}
                onClick={endSession}
                type="button"
              >
                End Session
              </button>
            </>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-400">
        <span>{getSessionStateLabel(session?.state)}</span>
        <span>{isConnected ? 'Live connected' : 'Connecting...'}</span>
      </div>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      {isLoadingHistory ? (
        <section className="space-y-2" data-testid="chat-history-skeleton">
          <p className="text-sm text-zinc-500">Loading chat history...</p>
          <div className="h-12 animate-pulse rounded-lg bg-zinc-900/60" />
          <div className="h-12 animate-pulse rounded-lg bg-zinc-900/50" />
        </section>
      ) : null}

      {session ? (
        <>
          <MessageList
            isThinking={isThinking}
            messages={messages}
          />
          <ChatInput
            disabled={!canSend}
            isSending={isSending}
            onChange={setInputValue}
            onSend={sendMessage}
            value={inputValue}
          />
        </>
      ) : (
        <section className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 text-sm text-zinc-400">
          Start a plan or task session to talk with Ralph.
        </section>
      )}
    </section>
  )
}
