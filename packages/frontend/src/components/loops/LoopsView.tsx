import { useCallback, useEffect, useMemo, useState } from 'react'
import { LoopDetail } from '@/components/loops/LoopDetail'
import { LoopList } from '@/components/loops/LoopList'
import { StartLoopDialog } from '@/components/loops/StartLoopDialog'
import { useWebSocket } from '@/hooks/useWebSocket'
import { loopApi, type StartLoopInput } from '@/lib/loopApi'
import { projectApi } from '@/lib/projectApi'
import { useLoopStore } from '@/stores/loopStore'

interface LoopsViewProps {
  projectId: string
}

const EMPTY_LOOPS: ReturnType<typeof useLoopStore.getState>['loopsByProject'][string] = []
const EMPTY_OUTPUT: string[] = []
const EMPTY_PROMPT_MESSAGE =
  'Here you can see the generated prompt.md when you use ralph plan or ralph task.'

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
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [promptContent, setPromptContent] = useState('')
  const hasPromptContent = promptContent.trim().length > 0

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

    projectApi
      .getPrompt(projectId)
      .then((prompt) => {
        if (!cancelled) {
          setPromptContent(prompt.content)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPromptContent('')
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

  return (
    <section className="flex h-full min-h-0 min-w-0 flex-col gap-4 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Loops</h2>
        <div className="flex items-center gap-3">
          <span className="text-xs text-zinc-400">
            {isConnected ? 'Live connected' : 'Connecting...'}
          </span>
        </div>
      </div>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      <div className="grid min-h-0 min-w-0 flex-1 gap-4 overflow-hidden lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="min-h-0 min-w-0 space-y-4 lg:grid lg:grid-rows-[auto_auto_minmax(0,1fr)] lg:gap-4 lg:space-y-0">
          <section className="space-y-2 rounded-lg border border-zinc-700 bg-zinc-900 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-300">
              Generated prompt.md
            </p>
            <pre
              className="min-h-[4.5rem] max-h-32 overflow-auto rounded-md border border-zinc-700 bg-zinc-950 p-3 text-xs leading-relaxed whitespace-pre-wrap text-zinc-100"
              data-testid="generated-prompt-content"
            >
              {hasPromptContent ? promptContent : EMPTY_PROMPT_MESSAGE}
            </pre>
          </section>
          <StartLoopDialog projectId={projectId} onStart={startLoop} />
          {isLoading ? (
            <section className="space-y-3" data-testid="loops-loading-skeleton">
              <div className="h-24 animate-pulse rounded-lg bg-zinc-900/70" />
              <div className="h-40 animate-pulse rounded-lg bg-zinc-900/50" />
            </section>
          ) : (
            <div className="min-h-0 max-h-[26rem] overflow-y-auto pr-1">
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
        <div className="w-full min-h-0 min-w-0 overflow-hidden">
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
