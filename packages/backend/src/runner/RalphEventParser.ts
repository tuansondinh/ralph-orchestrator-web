export interface RalphEvent {
  topic: string
  payload: unknown
  raw: string
}

const EVENT_LINE = /^\s*Event:\s*([a-zA-Z0-9_.:-]+)\s*-\s*(.+)\s*$/

export class RalphEventParser {
  private remainder = ''

  parseLine(line: string): RalphEvent | null {
    const match = EVENT_LINE.exec(line)
    if (!match) {
      return null
    }

    const topic = match[1]
    const payloadRaw = match[2]

    let payload: unknown = payloadRaw
    try {
      payload = JSON.parse(payloadRaw)
    } catch {
      payload = payloadRaw
    }

    return {
      topic,
      payload,
      raw: line
    }
  }

  parseChunk(chunk: string) {
    const normalized = `${this.remainder}${chunk.replace(/\r\n/g, '\n')}`
    const lines = normalized.split('\n')
    this.remainder = lines.pop() ?? ''
    return lines
      .map((line) => this.parseLine(line))
      .filter((event): event is RalphEvent => event !== null)
  }

  flush() {
    if (!this.remainder) {
      return null
    }
    const line = this.remainder
    this.remainder = ''
    return this.parseLine(line)
  }
}
