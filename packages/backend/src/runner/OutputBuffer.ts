export class OutputBuffer {
  private lines: string[] = []
  private partialLine = ''
  private readonly enforceLimit: boolean

  constructor(private readonly maxLines = 500) {
    this.enforceLimit = Number.isFinite(maxLines) && maxLines > 0
  }

  append(chunk: string) {
    const normalized = chunk.replace(/\r\n/g, '\n')
    const segments = `${this.partialLine}${normalized}`.split('\n')

    this.partialLine = segments.pop() ?? ''

    for (const line of segments) {
      this.lines.push(line)
      if (this.enforceLimit && this.lines.length > this.maxLines) {
        this.lines.shift()
      }
    }
  }

  replay() {
    if (this.partialLine.length > 0) {
      return [...this.lines, this.partialLine]
    }
    return [...this.lines]
  }

  clear() {
    this.lines = []
    this.partialLine = ''
  }
}
