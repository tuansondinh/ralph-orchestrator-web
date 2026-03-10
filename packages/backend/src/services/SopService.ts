import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

export interface SopServiceOptions {
  sopDir?: string
}

function resolveSopDir(): string {
  const candidates = [
    resolve(process.cwd(), 'sops'),           // from repo root
    resolve(process.cwd(), '..', '..', 'sops') // from packages/backend
  ]

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate
    }
  }

  return candidates[0]
}

export class SopService {
  private readonly sopDir: string

  constructor(options: SopServiceOptions = {}) {
    this.sopDir = options.sopDir ?? resolveSopDir()
  }

  async getPlanGuide(): Promise<string> {
    return this.readSop('pdd.md')
  }

  async getTaskGuide(): Promise<string> {
    return this.readSop('code-task-generator.md')
  }

  private async readSop(filename: string): Promise<string> {
    const filePath = resolve(this.sopDir, filename)
    return readFile(filePath, 'utf-8')
  }
}
