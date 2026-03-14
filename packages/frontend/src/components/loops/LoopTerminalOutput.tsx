import { useEffect, useMemo, useRef, useState } from 'react'
import { FitAddon } from '@xterm/addon-fit'
import { Terminal as XTerm } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import type { LoopOutputEntry } from '@/lib/loopApi'
import {
  formatLoopOutput,
  type FormattedLoopOutputLine
} from '@/components/loops/loopOutputFormatting'

interface LoopTerminalOutputProps {
  chunks: LoopOutputEntry[]
  emptyMessage?: string
}

function RawLoopTerminal({ chunks }: { chunks: LoopOutputEntry[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const termRef = useRef<XTerm | null>(null)
  const chunksRef = useRef<LoopOutputEntry[]>(chunks)
  const writtenCountRef = useRef(0)

  useEffect(() => {
    const container = containerRef.current
    if (!container || termRef.current) return

    const term = new XTerm({
      cursorBlink: false,
      disableStdin: true,
      fontFamily:
        'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
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

    let rafId: number | null = null
    let retryTimeoutId: number | null = null
    let retryCount = 0
    let disposed = false
    const MAX_RETRIES = 40
    const RETRY_DELAY_MS = 50

    const clearRetry = () => {
      if (retryTimeoutId !== null) {
        window.clearTimeout(retryTimeoutId)
        retryTimeoutId = null
      }
    }

    const scheduleRetry = () => {
      if (disposed || retryTimeoutId !== null || retryCount >= MAX_RETRIES) return
      retryCount += 1
      retryTimeoutId = window.setTimeout(() => {
        retryTimeoutId = null
        scheduleFit()
      }, RETRY_DELAY_MS)
    }

    const doFit = () => {
      if (disposed) return
      if (container.clientWidth < 16 || container.clientHeight < 16) {
        scheduleRetry()
        return
      }
      clearRetry()
      retryCount = 0
      try {
        fitAddon.fit()
      } catch {
        scheduleRetry()
        return
      }
      term.refresh(0, Math.max(term.rows - 1, 0))
    }

    const scheduleFit = () => {
      if (rafId) window.cancelAnimationFrame(rafId)
      rafId = window.requestAnimationFrame(() => {
        rafId = window.requestAnimationFrame(() => {
          doFit()
        })
      })
    }

    const observer = new ResizeObserver(scheduleFit)
    observer.observe(container)
    window.addEventListener('resize', scheduleFit)
    scheduleFit()
    for (const delay of [60, 240, 600]) {
      window.setTimeout(scheduleFit, delay)
    }

    termRef.current = term

    return () => {
      disposed = true
      clearRetry()
      if (rafId) window.cancelAnimationFrame(rafId)
      observer.disconnect()
      window.removeEventListener('resize', scheduleFit)
      term.dispose()
      termRef.current = null
      writtenCountRef.current = 0
    }
  }, [])

  useEffect(() => {
    const term = termRef.current
    if (!term) return

    const prevChunks = chunksRef.current
    const isNewArray = chunks !== prevChunks

    if (isNewArray && (chunks.length < writtenCountRef.current || chunks.length === 0)) {
      term.reset()
      writtenCountRef.current = 0
      chunksRef.current = chunks
      for (const chunk of chunks) {
        term.write(chunk.data)
      }
      writtenCountRef.current = chunks.length
      return
    }

    if (chunks.length > writtenCountRef.current) {
      const newChunks = chunks.slice(writtenCountRef.current)
      for (const chunk of newChunks) {
        term.write(chunk.data)
      }
      writtenCountRef.current = chunks.length
      chunksRef.current = chunks
      return
    }

    if (isNewArray) {
      chunksRef.current = chunks
    }
  }, [chunks])

  return (
    <div
      className="h-full w-full overflow-hidden rounded-md border border-zinc-800 bg-zinc-950"
      ref={containerRef}
    />
  )
}

function FormattedLoopOutput({
  lines,
  emptyMessage
}: {
  lines: FormattedLoopOutputLine[]
  emptyMessage: string
}) {
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const [autoScroll, setAutoScroll] = useState(true)

  const scrollToBottom = () => {
    if (!viewportRef.current) {
      return
    }

    viewportRef.current.scrollTop = viewportRef.current.scrollHeight
    setAutoScroll(true)
  }

  useEffect(() => {
    if (autoScroll) {
      scrollToBottom()
    }
  }, [autoScroll, lines])

  const handleScroll = () => {
    if (!viewportRef.current) {
      return
    }

    const distanceFromBottom =
      viewportRef.current.scrollHeight -
      viewportRef.current.clientHeight -
      viewportRef.current.scrollTop
    setAutoScroll(distanceFromBottom <= 24)
  }

  return (
    <div className="relative h-full min-h-0">
      <div
        ref={viewportRef}
        className="h-full min-h-0 overflow-y-auto rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 font-mono text-xs leading-5"
        data-testid="loop-output-formatted"
        onScroll={handleScroll}
      >
        {lines.length === 0 ? (
          <p className="text-zinc-500">{emptyMessage}</p>
        ) : (
          <div className="space-y-1">
            {lines.map((line, index) => (
              <div
                className={`whitespace-pre-wrap break-words rounded px-2 py-1 ${
                  line.stream === 'stderr'
                    ? 'bg-red-950/30 text-red-100'
                    : 'text-zinc-200'
                } ${line.pending ? 'opacity-90' : ''}`}
                key={`${index}-${line.stream}-${line.pending ? 'pending' : 'final'}`}
              >
                {line.text.length > 0 ? line.text : ' '}
              </div>
            ))}
          </div>
        )}
      </div>
      {!autoScroll && lines.length > 0 ? (
        <button
          className="absolute bottom-3 right-3 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-800"
          onClick={scrollToBottom}
          type="button"
        >
          Jump to latest
        </button>
      ) : null}
    </div>
  )
}

export function LoopTerminalOutput({
  chunks,
  emptyMessage = 'Waiting for loop output...'
}: LoopTerminalOutputProps) {
  const [mode, setMode] = useState<'formatted' | 'raw'>('formatted')
  const formattedLines = useMemo(() => formatLoopOutput(chunks), [chunks])

  return (
    <section className="flex h-full min-h-0 flex-col gap-2" data-testid="loop-terminal-output">
      {chunks.length > 0 ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-zinc-500">
            Readable view is normalized for logs. Raw view keeps the original terminal bytes.
          </p>
          <div className="inline-flex rounded-md border border-zinc-700 bg-zinc-950 p-1">
            <button
              aria-pressed={mode === 'formatted'}
              className={`rounded-sm px-2.5 py-1 text-xs transition-colors ${
                mode === 'formatted'
                  ? 'bg-zinc-200 text-zinc-900'
                  : 'text-zinc-300 hover:bg-zinc-800'
              }`}
              onClick={() => setMode('formatted')}
              type="button"
            >
              Readable
            </button>
            <button
              aria-pressed={mode === 'raw'}
              className={`rounded-sm px-2.5 py-1 text-xs transition-colors ${
                mode === 'raw'
                  ? 'bg-zinc-200 text-zinc-900'
                  : 'text-zinc-300 hover:bg-zinc-800'
              }`}
              onClick={() => setMode('raw')}
              type="button"
            >
              Raw
            </button>
          </div>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-hidden">
        {mode === 'raw' ? (
          chunks.length === 0 ? (
            <div className="flex h-full items-center justify-center rounded-md border border-zinc-800 bg-zinc-950">
              <p className="text-sm text-zinc-500">{emptyMessage}</p>
            </div>
          ) : (
            <RawLoopTerminal chunks={chunks} />
          )
        ) : (
          <FormattedLoopOutput emptyMessage={emptyMessage} lines={formattedLines} />
        )}
      </div>
    </section>
  )
}
