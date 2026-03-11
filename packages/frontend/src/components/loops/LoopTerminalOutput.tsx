import { useEffect, useRef } from 'react'
import { FitAddon } from '@xterm/addon-fit'
import { Terminal as XTerm } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'

interface LoopTerminalOutputProps {
  chunks: string[]
  emptyMessage?: string
}

export function LoopTerminalOutput({
  chunks,
  emptyMessage = 'Waiting for loop output...'
}: LoopTerminalOutputProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const termRef = useRef<XTerm | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const chunksRef = useRef<string[]>(chunks)
  const writtenCountRef = useRef(0)

  // Initialize terminal on mount
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

    termRef.current = term
    fitRef.current = fitAddon

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

    return () => {
      disposed = true
      clearRetry()
      if (rafId) window.cancelAnimationFrame(rafId)
      observer.disconnect()
      window.removeEventListener('resize', scheduleFit)
      term.dispose()
      termRef.current = null
      fitRef.current = null
      writtenCountRef.current = 0
    }
  }, [])

  // Write chunks to terminal when they change
  useEffect(() => {
    const term = termRef.current
    if (!term) return

    const prevChunks = chunksRef.current
    const isNewArray = chunks !== prevChunks

    if (isNewArray && (chunks.length < writtenCountRef.current || chunks.length === 0)) {
      // Different array with fewer or zero chunks: loop switched, clear and rewrite
      term.clear()
      writtenCountRef.current = 0
      chunksRef.current = chunks
      for (const chunk of chunks) {
        term.write(chunk)
      }
      writtenCountRef.current = chunks.length
    } else if (chunks.length > writtenCountRef.current) {
      // Incremental append: write only new chunks
      const newChunks = chunks.slice(writtenCountRef.current)
      for (const chunk of newChunks) {
        term.write(chunk)
      }
      writtenCountRef.current = chunks.length
      chunksRef.current = chunks
    } else if (isNewArray) {
      // Same length or same content but different reference: update ref only
      chunksRef.current = chunks
    }
  }, [chunks])

  return (
    <section className="relative h-full min-h-0" data-testid="loop-terminal-output">
      <div
        className="h-full w-full overflow-hidden rounded-md border border-zinc-800 bg-zinc-950"
        ref={containerRef}
      />
      {chunks.length === 0 ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <p className="text-sm text-zinc-500">{emptyMessage}</p>
        </div>
      ) : null}
    </section>
  )
}
