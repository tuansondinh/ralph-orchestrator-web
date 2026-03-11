export class OutputBuffer {
  private chunks: string[] = []
  private readonly enforceLimit: boolean

  constructor(private readonly maxChunks = 500) {
    this.enforceLimit = Number.isFinite(maxChunks) && maxChunks > 0
  }

  append(chunk: string) {
    this.chunks.push(chunk)
    if (this.enforceLimit && this.chunks.length > this.maxChunks) {
      this.chunks.shift()
    }
  }

  replay() {
    return [...this.chunks]
  }

  clear() {
    this.chunks = []
  }
}
