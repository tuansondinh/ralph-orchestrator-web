import { trpcClient } from '@/lib/trpc'

export interface LoopSummary {
  id: string
  projectId: string
  processId: string | null
  state: string
  config: string | null
  prompt: string | null
  worktree: string | null
  iterations: number
  tokensUsed: number
  errors: number
  startedAt: number
  endedAt: number | null
  currentHat: string | null
}

export interface LoopMetrics {
  iterations: number
  runtime: number
  tokensUsed: number
  errors: number
  lastOutputSize: number
  filesChanged: string[]
}

export type DiffStatus = 'M' | 'A' | 'D' | 'R'

export interface DiffFile {
  path: string
  status: DiffStatus
  diff: string
  additions: number
  deletions: number
}

export interface LoopDiffStats {
  filesChanged: number
  additions: number
  deletions: number
}

export interface LoopDiff {
  available: boolean
  reason?: string
  baseBranch?: string
  worktreeBranch?: string
  files?: DiffFile[]
  stats?: LoopDiffStats
}

export interface StartLoopInput {
  config?: string
  presetFilename?: string
  prompt?: string
  promptSnapshot?: string
  promptFile?: string
  exclusive?: boolean
  worktree?: string
}

export const loopApi = {
  list(projectId: string): Promise<LoopSummary[]> {
    return trpcClient.loop.list.query({ projectId })
  },
  start(projectId: string, input: StartLoopInput): Promise<LoopSummary> {
    return trpcClient.loop.start.mutate({
      projectId,
      ...input
    })
  },
  stop(loopId: string): Promise<void> {
    return trpcClient.loop.stop.mutate({ loopId })
  },
  restart(loopId: string): Promise<LoopSummary> {
    return trpcClient.loop.restart.mutate({ loopId })
  },
  getMetrics(loopId: string): Promise<LoopMetrics> {
    return trpcClient.loop.getMetrics.query({ loopId })
  },
  getDiff(loopId: string): Promise<LoopDiff> {
    return trpcClient.loop.getDiff.query({ loopId })
  }
}
