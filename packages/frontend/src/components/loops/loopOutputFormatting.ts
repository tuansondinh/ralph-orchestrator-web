import type { LoopOutputEntry } from '@/lib/loopApi'

export interface FormattedLoopOutputLine {
  stream: 'stdout' | 'stderr'
  text: string
  pending: boolean
}

const ansiRegex = /\x1b(?:\[[0-9;?]*[ -/]*[@-~]|\][^\x07\x1b]*(?:\x07|\x1b\\))/g
const unsupportedControlRegex = /[\x00-\x08\x0B\x0C\x0E-\x1A\x1C-\x1F\x7F]/g

function stripTerminalControls(input: string) {
  return input.replace(ansiRegex, '').replace(unsupportedControlRegex, '')
}

function findTrailingEscapePrefix(input: string) {
  const esc = '\u001B'
  const csi = '\u009B'
  const lastEsc = input.lastIndexOf(esc)
  const lastCsi = input.lastIndexOf(csi)
  const start = Math.max(lastEsc, lastCsi)
  if (start === -1) {
    return ''
  }

  const suffix = input.slice(start)
  if (lastEsc === start) {
    const second = suffix[1]
    if (!second) {
      return suffix
    }

    if (second === '[') {
      return /[\x40-\x7E]/.test(suffix.slice(2)) ? '' : suffix
    }

    if (second === ']') {
      return /\u0007|\u001B\\/.test(suffix) ? '' : suffix
    }

    return suffix.length >= 2 ? '' : suffix
  }

  return /[\x40-\x7E]/.test(suffix.slice(1)) ? '' : suffix
}

function splitDenseLine(text: string) {
  const normalized = text.trimEnd()
  if (normalized.length === 0) {
    return ['']
  }

  if (normalized.length < 160) {
    return [normalized]
  }

  const hinted = normalized
    .replace(/(?<!^)(?=[✓✗⚙ℹ•◆▶▸])/g, '\n')
    .replace(/(?<!^)(?=<system-reminder>)/g, '\n')
    .replace(/(?<!^)(?=(?:warning|error|fatal|traceback)\\b)/gi, '\n')

  const segments = hinted
    .split('\n')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0)

  return segments.length > 0 ? segments : [normalized]
}

export function formatLoopOutput(chunks: LoopOutputEntry[]): FormattedLoopOutputLine[] {
  const lines: FormattedLoopOutputLine[] = []
  let currentText = ''
  let currentStream: 'stdout' | 'stderr' = 'stdout'
  let escapeRemainder = ''

  const flushCurrentLine = (pending: boolean, force = false) => {
    if (!force && currentText.length === 0) {
      return
    }

    const nextLines = splitDenseLine(currentText)
    for (let index = 0; index < nextLines.length; index += 1) {
      lines.push({
        stream: currentStream,
        text: nextLines[index] ?? '',
        pending: pending && index === nextLines.length - 1
      })
    }
    currentText = ''
  }

  for (const chunk of chunks) {
    const combined = `${escapeRemainder}${chunk.data}`
    escapeRemainder = findTrailingEscapePrefix(combined)
    const stableText = escapeRemainder
      ? combined.slice(0, -escapeRemainder.length)
      : combined
    const sanitized = stripTerminalControls(stableText)
    if (!sanitized) {
      continue
    }

    if (currentText.length > 0 && currentStream !== chunk.stream) {
      flushCurrentLine(false)
    }
    currentStream = chunk.stream

    for (let index = 0; index < sanitized.length; index += 1) {
      const char = sanitized[index]
      const nextChar = sanitized[index + 1]

      if (char === '\r') {
        if (nextChar === '\n') {
          continue
        }
        currentText = ''
        continue
      }

      if (char === '\n') {
        flushCurrentLine(false, true)
        continue
      }

      if (char === '\b') {
        currentText = currentText.slice(0, -1)
        continue
      }

      currentText += char
    }
  }

  if (currentText.length > 0) {
    flushCurrentLine(true)
  }

  return lines
}
