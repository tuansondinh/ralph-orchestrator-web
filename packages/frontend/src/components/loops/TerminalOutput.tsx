import { useEffect, useMemo, useRef, useState } from 'react'

interface TerminalOutputProps {
  lines: string[]
}

const colorClasses: Record<string, string> = {
  '30': 'text-zinc-200',
  '31': 'text-red-400',
  '32': 'text-emerald-400',
  '33': 'text-amber-300',
  '34': 'text-blue-400',
  '35': 'text-fuchsia-400',
  '36': 'text-cyan-400',
  '37': 'text-zinc-100',
  '90': 'text-zinc-500',
  '91': 'text-red-300',
  '92': 'text-emerald-300',
  '93': 'text-amber-200',
  '94': 'text-blue-300',
  '95': 'text-fuchsia-300',
  '96': 'text-cyan-300',
  '97': 'text-zinc-50'
}

interface Segment {
  text: string
  className: string
}

function parseAnsiLine(input: string): Segment[] {
  const segments: Segment[] = []
  const ansiRegex = /\x1b\[([0-9;]*)m/g
  let activeClass = 'text-zinc-200'
  let cursor = 0

  for (const match of input.matchAll(ansiRegex)) {
    const index = match.index ?? 0

    if (index > cursor) {
      segments.push({
        text: input.slice(cursor, index),
        className: activeClass
      })
    }

    const codes = (match[1] || '0')
      .split(';')
      .map((code) => code.trim())
      .filter(Boolean)

    if (codes.length === 0 || codes.includes('0')) {
      activeClass = 'text-zinc-200'
    }

    for (const code of codes) {
      if (colorClasses[code]) {
        activeClass = colorClasses[code]
      }
    }

    cursor = index + match[0].length
  }

  if (cursor < input.length) {
    segments.push({
      text: input.slice(cursor),
      className: activeClass
    })
  }

  return segments.length > 0
    ? segments
    : [
      {
        text: input,
        className: activeClass
      }
    ]
}

export function TerminalOutput({ lines }: TerminalOutputProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const [autoScroll, setAutoScroll] = useState(true)
  const renderedLines = useMemo(
    () => lines.map((line) => parseAnsiLine(line)),
    [lines]
  )

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
  }, [autoScroll, renderedLines])

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
    <section className="relative h-full min-h-0">
      <div
        ref={viewportRef}
        className="h-full min-h-0 max-h-full overflow-y-auto overflow-x-hidden rounded-md border border-zinc-800 bg-zinc-950 p-3 font-mono text-xs leading-5"
        data-testid="terminal-scroll"
        onScroll={handleScroll}
      >
        {renderedLines.length === 0 ? (
          <p className="text-zinc-500">Waiting for loop output...</p>
        ) : (
          renderedLines.map((lineSegments, lineIndex) => (
            <p className="whitespace-pre-wrap break-words" key={`line-${lineIndex}`}>
              {lineSegments.map((segment, segmentIndex) => (
                <span className={segment.className} key={`seg-${lineIndex}-${segmentIndex}`}>
                  {segment.text}
                </span>
              ))}
            </p>
          ))
        )}
      </div>
      {!autoScroll ? (
        <button
          className="absolute bottom-3 right-3 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-800"
          type="button"
          onClick={scrollToBottom}
        >
          Scroll to bottom
        </button>
      ) : null}
    </section>
  )
}
