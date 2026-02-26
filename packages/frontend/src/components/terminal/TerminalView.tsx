import { useCallback, useEffect, useRef, useState } from 'react'
import { FitAddon } from '@xterm/addon-fit'
import { Terminal as XTerm } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { useWebSocket } from '@/hooks/useWebSocket'
import type { LoopBackend } from '@/lib/loopApi'
import {
  terminalApi,
  type TerminalSessionRecord,
  type TerminalSessionState
} from '@/lib/terminalApi'
import { useTerminalStore } from '@/stores/terminalStore'

const EMPTY_SESSIONS: TerminalSessionRecord[] = []
const TERMINAL_BACKENDS: LoopBackend[] = [
  'codex',
  'claude',
  'kiro',
  'gemini',
  'amp',
  'copilot',
  'opencode'
]

interface TerminalSessionProps {
  session: TerminalSessionRecord
  onClose: () => void
  selectedBackend: LoopBackend
  onBackendChange: (backend: LoopBackend) => void
}

function normalizeState(value: unknown): TerminalSessionState {
  if (value === 'active' || value === 'completed') {
    return value
  }
  return 'unknown'
}

function TerminalSession({
  session,
  onClose,
  selectedBackend,
  onBackendChange
}: TerminalSessionProps) {
  const MAX_PENDING_OUTPUT_CHUNKS = 600
  const containerRef = useRef<HTMLDivElement | null>(null)
  const terminalRef = useRef<XTerm | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const scheduleSyncSizeRef = useRef<(() => void) | null>(null)
  const sessionStateRef = useRef<TerminalSessionState>(session.state)
  const connectionGenerationRef = useRef(0)
  const isFitReadyRef = useRef(false)
  const pendingOutputChunksRef = useRef<string[]>([])
  const updateSession = useTerminalStore((state) => state.updateSession)
  const sessionId = session.id

  const handleMessage = useCallback(
    (message: Record<string, unknown>) => {
      if (
        message.type === 'terminal.output' &&
        message.sessionId === sessionId &&
        typeof message.data === 'string'
      ) {
        if (message.replay === true && connectionGenerationRef.current > 1) {
          return
        }
        if (!isFitReadyRef.current || !terminalRef.current) {
          const queue = pendingOutputChunksRef.current
          queue.push(message.data)
          if (queue.length > MAX_PENDING_OUTPUT_CHUNKS) {
            queue.splice(0, queue.length - MAX_PENDING_OUTPUT_CHUNKS)
          }
          return
        }
        terminalRef.current.write(message.data)
        return
      }

      if (message.type === 'terminal.state' && message.sessionId === sessionId) {
        updateSession(sessionId, {
          state: normalizeState(message.state),
          cols: typeof message.cols === 'number' ? message.cols : session.cols,
          rows: typeof message.rows === 'number' ? message.rows : session.rows,
          endedAt: typeof message.endedAt === 'number' ? message.endedAt : session.endedAt
        })
      }
    },
    [sessionId, updateSession, session.cols, session.rows, session.endedAt]
  )

  const websocket = useWebSocket({
    channels: [`terminal:${sessionId}:output`, `terminal:${sessionId}:state`],
    onMessage: handleMessage
  })
  const isConnected = websocket.isConnected
  const isConnectedRef = useRef(isConnected)
  const send = websocket.send ?? (() => false)
  const sendRef = useRef(send)

  const injectCommand = useCallback(
    (command: 'plan' | 'task') => {
      if (sessionStateRef.current !== 'active' || !isConnectedRef.current) {
        return
      }

      sendRef.current({
        type: 'terminal.input',
        sessionId,
        data: `ralph ${command} --backend ${selectedBackend}\r`
      })
    },
    [selectedBackend, sessionId]
  )

  useEffect(() => {
    sendRef.current = send
  }, [send])

  useEffect(() => {
    isConnectedRef.current = isConnected
  }, [isConnected])

  useEffect(() => {
    sessionStateRef.current = session.state
  }, [session.state])

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.options.disableStdin = session.state !== 'active' || !isConnected
    }
  }, [session.state, isConnected])

  useEffect(() => {
    if (!isConnected) {
      return
    }

    connectionGenerationRef.current += 1
    isFitReadyRef.current = false
    scheduleSyncSizeRef.current?.()
  }, [isConnected, sessionId])

  useEffect(() => {
    const refocus = () => {
      terminalRef.current?.focus()
    }

    refocus()
    const timeoutId = window.setTimeout(refocus, 120)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [sessionId])

  useEffect(() => {
    const container = containerRef.current
    if (!container || terminalRef.current) return

    isFitReadyRef.current = false
    pendingOutputChunksRef.current = []
    const term = new XTerm({
      cursorBlink: true,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
      fontSize: 13,
      lineHeight: 1.25,
      theme: {
        background: '#09090b',
        foreground: '#e4e4e7',
        cursor: '#fafafa',
        selectionBackground: '#3f3f46'
      }
    })
    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(container)

    terminalRef.current = term
    fitRef.current = fitAddon
    let rafId: number | null = null
    let fitRetryTimeoutId: number | null = null
    let fitRetryCount = 0
    let disposed = false
    const MAX_FIT_RETRIES = 40
    const FIT_RETRY_DELAY_MS = 50

    const clearFitRetry = () => {
      if (fitRetryTimeoutId !== null) {
        window.clearTimeout(fitRetryTimeoutId)
        fitRetryTimeoutId = null
      }
    }

    const scheduleFitRetry = () => {
      if (disposed || fitRetryTimeoutId !== null || fitRetryCount >= MAX_FIT_RETRIES) {
        return
      }
      fitRetryCount += 1
      fitRetryTimeoutId = window.setTimeout(() => {
        fitRetryTimeoutId = null
        scheduleSyncSize()
      }, FIT_RETRY_DELAY_MS)
    }

    const syncSize = () => {
      if (disposed) return false
      // When remounting after tab switches, layout can briefly report 0x0; retry until stable.
      if (container.clientWidth < 16 || container.clientHeight < 16) {
        scheduleFitRetry()
        return false
      }
      clearFitRetry()
      fitRetryCount = 0
      try {
        fitAddon.fit()
      } catch {
        // Keep focus/input behavior working even if fit fails during rapid tab switches.
        scheduleFitRetry()
        return false
      }
      term.refresh(0, Math.max(term.rows - 1, 0))
      if (!isFitReadyRef.current) {
        isFitReadyRef.current = true
        const queuedOutput = pendingOutputChunksRef.current.join('')
        pendingOutputChunksRef.current = []
        if (queuedOutput.length > 0) {
          term.write(queuedOutput)
        }
      }
      if (sessionStateRef.current !== 'active') return true
      sendRef.current({
        type: 'terminal.resize',
        sessionId,
        cols: term.cols,
        rows: term.rows
      })
      return true
    }

    const scheduleSyncSize = () => {
      if (rafId) {
        window.cancelAnimationFrame(rafId)
      }
      rafId = window.requestAnimationFrame(() => {
        rafId = window.requestAnimationFrame(() => {
          const applied = syncSize()
          if (applied) {
            term.focus()
          }
        })
      })
    }
    scheduleSyncSizeRef.current = scheduleSyncSize
    const delayedSyncIds: number[] = []

    const dataDisposable = term.onData((data) => {
      if (sessionStateRef.current !== 'active' || !isConnectedRef.current) return
      sendRef.current({
        type: 'terminal.input',
        sessionId,
        data
      })
    })

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        scheduleSyncSize()
      }
    }

    const observer = new ResizeObserver(scheduleSyncSize)
    observer.observe(container)
    window.addEventListener('resize', scheduleSyncSize)
    window.addEventListener('focus', scheduleSyncSize)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    scheduleSyncSize()
    for (const delay of [60, 240, 600, 1200]) {
      delayedSyncIds.push(window.setTimeout(scheduleSyncSize, delay))
    }

    return () => {
      disposed = true
      dataDisposable.dispose()
      observer.disconnect()
      window.removeEventListener('resize', scheduleSyncSize)
      window.removeEventListener('focus', scheduleSyncSize)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      if (rafId) {
        window.cancelAnimationFrame(rafId)
      }
      for (const timeoutId of delayedSyncIds) {
        window.clearTimeout(timeoutId)
      }
      clearFitRetry()
      scheduleSyncSizeRef.current = null
      term.dispose()
      terminalRef.current = null
      fitRef.current = null
      isFitReadyRef.current = false
      pendingOutputChunksRef.current = []
    }
  }, [sessionId])

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-zinc-500">
        <div className="flex items-center gap-3">
          <span>{session.state === 'active' ? 'Running' : 'Stopped'}</span>
          <span>{isConnected ? 'Connected' : 'Connecting...'}</span>
          <span>PID: {session.pid}</span>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-zinc-400" htmlFor={`terminal-backend-${sessionId}`}>
            Backend
          </label>
          <select
            aria-label="Terminal backend"
            className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-100"
            id={`terminal-backend-${sessionId}`}
            onChange={(event) => {
              const nextBackend = event.target.value as LoopBackend
              if (TERMINAL_BACKENDS.includes(nextBackend)) {
                onBackendChange(nextBackend)
              }
            }}
            value={selectedBackend}
          >
            {TERMINAL_BACKENDS.map((backend) => (
              <option key={backend} value={backend}>
                {backend}
              </option>
            ))}
          </select>
          <button
            className="rounded border border-zinc-700 px-2 py-1 text-[11px] font-semibold tracking-wide text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
            disabled={session.state !== 'active' || !isConnected}
            onClick={() => injectCommand('plan')}
            type="button"
          >
            PLAN
          </button>
          <button
            className="rounded border border-zinc-700 px-2 py-1 text-[11px] font-semibold tracking-wide text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
            disabled={session.state !== 'active' || !isConnected}
            onClick={() => injectCommand('task')}
            type="button"
          >
            TASK
          </button>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-red-400"
            type="button"
          >
            Close Session
          </button>
        </div>
      </div>
      <div className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950">
        <div
          className="h-[28rem] min-h-[18rem] w-full"
          onMouseDown={() => {
            terminalRef.current?.focus()
          }}
          ref={containerRef}
        />
      </div>
    </div>
  )
}

export function TerminalView({ projectId }: { projectId: string }) {
  const sessions = useTerminalStore((state) => state.sessionsByProject[projectId] ?? EMPTY_SESSIONS)
  const activeSessionId = useTerminalStore((state) => state.activeSessionIdByProject[projectId])
  const setSessions = useTerminalStore((state) => state.setSessions)
  const addSession = useTerminalStore((state) => state.addSession)
  const removeSession = useTerminalStore((state) => state.removeSession)
  const setActiveSession = useTerminalStore((state) => state.setActiveSession)
  const autoStartInFlightRef = useRef<string | null>(null)
  const activeSessionIdRef = useRef<string | null>(activeSessionId ?? null)
  const [isStarting, setIsStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [backendBySessionId, setBackendBySessionId] = useState<Record<string, LoopBackend>>({})

  useEffect(() => {
    activeSessionIdRef.current = activeSessionId ?? null
  }, [activeSessionId])

  useEffect(() => {
    setBackendBySessionId((current) => {
      const validSessionIds = new Set(sessions.map((session) => session.id))
      const next = Object.fromEntries(
        Object.entries(current).filter(([sessionId]) => validSessionIds.has(sessionId))
      ) as Record<string, LoopBackend>

      if (Object.keys(next).length === Object.keys(current).length) {
        return current
      }

      return next
    })
  }, [sessions])

  const startNewSession = useCallback(async () => {
    setIsStarting(true)
    setError(null)
    try {
      const session = await terminalApi.startSession({ projectId })
      addSession(projectId, session)
      setActiveSession(projectId, session.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start terminal')
    } finally {
      setIsStarting(false)
    }
  }, [projectId, addSession, setActiveSession])

  useEffect(() => {
    let cancelled = false

    const loadSessions = async () => {
      try {
        const existing = await terminalApi.getProjectSessions({ projectId })
        if (cancelled) return

        setSessions(projectId, existing)
        if (existing.length > 0) {
          const preservedActiveSessionId = activeSessionIdRef.current
          const nextActiveSessionId =
            preservedActiveSessionId && existing.some((candidate) => candidate.id === preservedActiveSessionId)
              ? preservedActiveSessionId
              : existing[0].id
          if (nextActiveSessionId !== preservedActiveSessionId) {
            setActiveSession(projectId, nextActiveSessionId)
          }
          return
        }

        if (autoStartInFlightRef.current === projectId) {
          return
        }
        autoStartInFlightRef.current = projectId
        try {
          await startNewSession()
        } finally {
          if (autoStartInFlightRef.current === projectId) {
            autoStartInFlightRef.current = null
          }
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load terminal sessions')
        }
      }
    }

    void loadSessions()
    return () => {
      cancelled = true
    }
  }, [projectId, setSessions, setActiveSession, startNewSession])

  const handleClose = async (sessionId: string) => {
    try {
      await terminalApi.endSession({ sessionId })
    } catch {
      // Best effort
    }
    removeSession(projectId, sessionId)
  }

  const activeSession = sessions.find((s) => s.id === activeSessionId)
  const activeSessionBackend = activeSession
    ? backendBySessionId[activeSession.id] ?? 'codex'
    : 'codex'

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">Terminal</h2>

      <p className="rounded-md border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-xs text-zinc-300">
        Pro tip: <code>ralph plan</code> and <code>ralph task</code> will update the{' '}
        <code>PROMPT.md</code> for you. Once you finish planning, go back to Loops tab and start
        the loop.
      </p>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {sessions.length > 0 ? (
        <div className="space-y-4">
          <nav className="flex flex-wrap gap-1 border-b border-zinc-800 pb-px">
            {sessions.map((s, idx) => (
              <div
                key={s.id}
                className={`flex items-center border-b-2 ${activeSessionId === s.id ? 'border-cyan-500' : 'border-transparent'
                  }`}
              >
                <button
                  onClick={() => setActiveSession(projectId, s.id)}
                  className={`px-3 py-2 text-sm transition-colors ${activeSessionId === s.id ? 'text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  type="button"
                >
                  Terminal {idx + 1}
                </button>
                <button
                  aria-label={`Close Terminal ${idx + 1}`}
                  className="rounded p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-red-400"
                  onClick={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    void handleClose(s.id)
                  }}
                  type="button"
                >
                  x
                </button>
              </div>
            ))}
            <button
              aria-label="New terminal tab"
              className="mb-[1px] rounded px-2 py-1 text-lg leading-none text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100 disabled:opacity-50"
              disabled={isStarting}
              onClick={() => {
                void startNewSession()
              }}
              type="button"
            >
              +
            </button>
          </nav>

          {activeSession ? (
            <TerminalSession
              key={activeSession.id}
              onBackendChange={(backend) => {
                setBackendBySessionId((current) => ({
                  ...current,
                  [activeSession.id]: backend
                }))
              }}
              session={activeSession}
              selectedBackend={activeSessionBackend}
              onClose={() => handleClose(activeSession.id)}
            />
          ) : (
            <p className="py-12 text-center text-sm text-zinc-500">Select a terminal tab</p>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-zinc-800 py-20 text-center">
          <p className="text-sm text-zinc-400">No active terminal sessions</p>
          <button
            className="mt-4 text-sm text-cyan-400 hover:underline"
            onClick={startNewSession}
          >
            Start your first session
          </button>
        </div>
      )}
    </section>
  )
}
