import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LoopDetail } from '@/components/loops/LoopDetail'
import { LoopList } from '@/components/loops/LoopList'
import { StartLoopDialog } from '@/components/loops/StartLoopDialog'
import { useWebSocket } from '@/hooks/useWebSocket'
import { loopApi, type StartLoopInput } from '@/lib/loopApi'
import { projectApi } from '@/lib/projectApi'
import { terminalApi } from '@/lib/terminalApi'
import { useLoopStore } from '@/stores/loopStore'
import { useTerminalStore } from '@/stores/terminalStore'

interface LoopsViewProps {
  projectId: string
}

const EMPTY_LOOPS: ReturnType<typeof useLoopStore.getState>['loopsByProject'][string] = []
const EMPTY_OUTPUT: string[] = []

function asMetricNumber(value: unknown, fallback: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback
  }

  return Math.max(0, Math.floor(value))
}

function asFilesChanged(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) {
    return fallback
  }

  return value.filter((file): file is string => typeof file === 'string' && file.length > 0)
}

export function LoopsView({ projectId }: LoopsViewProps) {
  const navigate = useNavigate()
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [terminalActionError, setTerminalActionError] = useState<string | null>(null)
  const [runningTerminalCommand, setRunningTerminalCommand] = useState<string | null>(null)
  const [promptContent, setPromptContent] = useState('')
  const [promptPath, setPromptPath] = useState('PROMPT.md')

  const loops = useLoopStore((state) => state.loopsByProject[projectId] ?? EMPTY_LOOPS)
  const selectedLoopId = useLoopStore(
    (state) => state.selectedLoopIdByProject[projectId] ?? null
  )
  const outputsByLoop = useLoopStore((state) => state.outputsByLoop)
  const metricsByLoop = useLoopStore((state) => state.metricsByLoop)
  const setLoops = useLoopStore((state) => state.setLoops)
  const upsertLoop = useLoopStore((state) => state.upsertLoop)
  const updateLoopById = useLoopStore((state) => state.updateLoopById)
  const appendOutput = useLoopStore((state) => state.appendOutput)
  const setMetrics = useLoopStore((state) => state.setMetrics)
  const setSelectedLoop = useLoopStore((state) => state.setSelectedLoop)
  const addTerminalSession = useTerminalStore((state) => state.addSession)
  const setActiveTerminalSession = useTerminalStore((state) => state.setActiveSession)

  const selectedLoop = useMemo(
    () => loops.find((loop) => loop.id === selectedLoopId) ?? null,
    [loops, selectedLoopId]
  )
  const selectedLoopMetrics = selectedLoop ? metricsByLoop[selectedLoop.id] ?? null : null
  const selectedLoopOutput = selectedLoop
    ? outputsByLoop[selectedLoop.id] ?? EMPTY_OUTPUT
    : EMPTY_OUTPUT

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    setError(null)

    loopApi
      .list(projectId)
      .then((nextLoops) => {
        if (cancelled) {
          return
        }

        setLoops(projectId, nextLoops)
        if (nextLoops.length > 0) {
          setSelectedLoop(projectId, nextLoops[0]?.id ?? null)
        } else {
          setSelectedLoop(projectId, null)
        }
      })
      .catch((nextError) => {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : 'Failed to load loops')
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [projectId, setLoops, setSelectedLoop])

  useEffect(() => {
    let cancelled = false
    setPromptContent('')
    setPromptPath('PROMPT.md')

    projectApi
      .getPrompt(projectId)
      .then((prompt) => {
        if (!cancelled) {
          setPromptContent(prompt.content)
          setPromptPath(prompt.path)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPromptContent('')
          setPromptPath('PROMPT.md')
        }
      })

    return () => {
      cancelled = true
    }
  }, [projectId])

  useEffect(() => {
    if (loops.length === 0) {
      if (selectedLoopId !== null) {
        setSelectedLoop(projectId, null)
      }
      return
    }

    if (!selectedLoopId || !loops.some((loop) => loop.id === selectedLoopId)) {
      setSelectedLoop(projectId, loops[0]?.id ?? null)
    }
  }, [loops, projectId, selectedLoopId, setSelectedLoop])

  const loadMetrics = useCallback(
    async (loopId: string) => {
      const metrics = await loopApi.getMetrics(loopId)
      setMetrics(loopId, metrics)
    },
    [setMetrics]
  )

  useEffect(() => {
    if (!selectedLoop) {
      return
    }

    void loadMetrics(selectedLoop.id).catch(() => { })
  }, [loadMetrics, selectedLoop])

  const channels = useMemo(
    () =>
      loops.flatMap((loop) => [
        `loop:${loop.id}:output`,
        `loop:${loop.id}:state`,
        `loop:${loop.id}:metrics`
      ]),
    [loops]
  )

  const handleMessage = useCallback(
    (message: Record<string, unknown>) => {
      if (
        message.type === 'loop.output' &&
        typeof message.loopId === 'string' &&
        typeof message.data === 'string'
      ) {
        appendOutput(message.loopId, message.data)
        return
      }

      if (message.type === 'loop.metrics' && typeof message.loopId === 'string') {
        const loopId = message.loopId
        const existingMetrics = metricsByLoop[loopId]
        const existingLoop = loops.find((loop) => loop.id === loopId)
        const fallbackIterations = existingMetrics?.iterations ?? existingLoop?.iterations ?? 0
        const fallbackRuntime = existingMetrics?.runtime ?? 0
        const fallbackTokens = existingMetrics?.tokensUsed ?? existingLoop?.tokensUsed ?? 0
        const fallbackErrors = existingMetrics?.errors ?? existingLoop?.errors ?? 0
        const fallbackLastOutputSize = existingMetrics?.lastOutputSize ?? 0
        const fallbackFilesChanged = existingMetrics?.filesChanged ?? []

        const nextIterations = asMetricNumber(message.iterations, fallbackIterations)
        const nextTokensUsed = asMetricNumber(message.tokensUsed, fallbackTokens)
        const nextErrors = asMetricNumber(message.errors, fallbackErrors)

        setMetrics(loopId, {
          iterations: nextIterations,
          runtime: asMetricNumber(message.runtime, fallbackRuntime),
          tokensUsed: nextTokensUsed,
          errors: nextErrors,
          lastOutputSize: asMetricNumber(message.lastOutputSize, fallbackLastOutputSize),
          filesChanged: asFilesChanged(message.filesChanged, fallbackFilesChanged)
        })
        updateLoopById(loopId, {
          iterations: nextIterations,
          tokensUsed: nextTokensUsed,
          errors: nextErrors
        })
        return
      }

      if (message.type !== 'loop.state' || typeof message.loopId !== 'string') {
        return
      }

      const nextState = typeof message.state === 'string' ? message.state : 'unknown'
      updateLoopById(message.loopId, {
        state: nextState,
        currentHat: typeof message.currentHat === 'string' ? message.currentHat : null,
        iterations:
          typeof message.iterations === 'number'
            ? message.iterations
            : undefined,
        endedAt: typeof message.endedAt === 'number' ? message.endedAt : null,
        processId: nextState === 'running' ? undefined : null
      })
    },
    [appendOutput, loops, metricsByLoop, setMetrics, updateLoopById]
  )

  const { isConnected } = useWebSocket({
    channels,
    onMessage: handleMessage
  })

  const startLoop = useCallback(
    async (input: StartLoopInput) => {
      const startedLoop = await loopApi.start(projectId, input)
      upsertLoop(projectId, startedLoop)
      setSelectedLoop(projectId, startedLoop.id)
      await loadMetrics(startedLoop.id)
    },
    [loadMetrics, projectId, setSelectedLoop, upsertLoop]
  )

  const savePrompt = useCallback(
    async (content: string) => {
      const updated = await projectApi.updatePrompt(projectId, { content })
      setPromptContent(updated.content)
      setPromptPath(updated.path)
    },
    [projectId]
  )

  const stopLoop = useCallback(
    async (loopId: string) => {
      await loopApi.stop(loopId)
      updateLoopById(loopId, {
        state: 'stopped',
        processId: null,
        endedAt: Date.now()
      })
    },
    [updateLoopById]
  )

  const restartLoop = useCallback(
    async (loopId: string) => {
      const restarted = await loopApi.restart(loopId)
      upsertLoop(projectId, restarted)
      setSelectedLoop(projectId, restarted.id)
      await loadMetrics(restarted.id)
    },
    [loadMetrics, projectId, setSelectedLoop, upsertLoop]
  )

  const startTerminalCommand = useCallback(
    async (command: 'ralph plan' | 'ralph task') => {
      setRunningTerminalCommand(command)
      setTerminalActionError(null)

      try {
        const session = await terminalApi.startSession({
          projectId,
          initialCommand: command
        })
        addTerminalSession(projectId, session)
        setActiveTerminalSession(projectId, session.id)
        navigate(`/project/${projectId}/terminal`)
      } catch (nextError) {
        setTerminalActionError(
          nextError instanceof Error
            ? nextError.message
            : `Failed to start terminal command: ${command}`
        )
      } finally {
        setRunningTerminalCommand(null)
      }
    },
    [addTerminalSession, navigate, projectId, setActiveTerminalSession]
  )

  return (
    <section className="flex h-full min-h-0 min-w-0 flex-col gap-4 overflow-hidden">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">Loops</h2>
          <span className="text-xs text-zinc-400">
            {isConnected ? 'Live connected' : 'Connecting...'}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            className="rounded-lg border border-cyan-500/70 bg-cyan-500 px-4 py-2 text-sm font-semibold text-cyan-950 shadow-sm transition-colors hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={runningTerminalCommand !== null}
            onClick={() => {
              void startTerminalCommand('ralph plan')
            }}
            type="button"
          >
            Ralph Plan
          </button>
          <button
            className="rounded-lg border border-amber-500/70 bg-amber-500 px-4 py-2 text-sm font-semibold text-amber-950 shadow-sm transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={runningTerminalCommand !== null}
            onClick={() => {
              void startTerminalCommand('ralph task')
            }}
            type="button"
          >
            Ralph Task
          </button>
        </div>
        <p className="text-xs text-zinc-400">
          Pro tip: use ralph plan or ralph task to create a plan for Ralph.
        </p>
      </div>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      {terminalActionError ? <p className="text-sm text-red-400">{terminalActionError}</p> : null}

      <div className="grid min-h-0 min-w-0 flex-1 gap-4 overflow-hidden lg:grid-cols-[minmax(320px,1.3fr)_minmax(260px,1fr)_minmax(0,2fr)]">
        <div className="h-full min-h-0 min-w-0 overflow-hidden">
          <StartLoopDialog
            projectId={projectId}
            onStart={startLoop}
            initialPrompt={promptContent}
            promptPath={promptPath}
            onPromptSave={savePrompt}
          />
        </div>
        <div className="h-full min-h-0 min-w-0 overflow-hidden">
          {isLoading ? (
            <section className="h-full space-y-3" data-testid="loops-loading-skeleton">
              <div className="h-20 animate-pulse rounded-lg bg-zinc-900/70" />
              <div className="h-56 animate-pulse rounded-lg bg-zinc-900/50" />
            </section>
          ) : (
            <div className="h-full min-h-0 overflow-y-auto pr-1">
              <LoopList
                loops={loops}
                selectedLoopId={selectedLoopId}
                onRestart={restartLoop}
                onSelect={(loopId) => setSelectedLoop(projectId, loopId)}
                onStop={stopLoop}
              />
            </div>
          )}
        </div>
        <div className="h-full w-full min-h-0 min-w-0 overflow-hidden">
          {isLoading ? (
            <section className="h-full space-y-3">
              <div className="h-16 animate-pulse rounded-lg bg-zinc-900/60" />
              <div className="h-96 animate-pulse rounded-lg bg-zinc-900/50" />
            </section>
          ) : (
            <div className="h-full min-h-0">
              <LoopDetail
                loop={selectedLoop}
                metrics={selectedLoopMetrics}
                outputLines={selectedLoopOutput}
              />
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
