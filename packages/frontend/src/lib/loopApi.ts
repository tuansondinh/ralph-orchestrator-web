import { trpcClient } from '@/lib/trpc'
import type { RalphBackend } from '@/lib/backends'

export type LoopBackend = RalphBackend

export interface LoopSummary {
  id: string
  projectId: string
  ralphLoopId: string | null
  processId: string | null
  processPid?: number | null
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

export interface GitBranchInfo {
  name: string
  current: boolean
  remote?: string
  lastCommit?: string
}

export interface StartLoopGitBranchInput {
  mode: 'new' | 'existing'
  name: string
  baseBranch?: string
}

export interface LoopPullRequest {
  number: number
  url: string
  title: string
  targetBranch?: string
}

export interface LoopConfig {
  gitBranch?: StartLoopGitBranchInput
  autoPush?: boolean
  pushed?: boolean
  pushError?: string
  pullRequest?: LoopPullRequest
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
  backend?: LoopBackend
  exclusive?: boolean
  worktree?: string
  gitBranch?: StartLoopGitBranchInput
  autoPush?: boolean
}

export interface CreatePullRequestInput {
  loopId: string
  targetBranch: string
  title?: string
  body?: string
  draft?: boolean
}

export const loopApi = {
  list(projectId: string): Promise<LoopSummary[]> {
    return trpcClient.loop.list.query({ projectId })
  },
  listBranches(projectId: string): Promise<GitBranchInfo[]> {
    return trpcClient.loop.listBranches.query({ projectId })
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
  },
  createPullRequest(input: CreatePullRequestInput): Promise<LoopPullRequest> {
    return trpcClient.loop.createPullRequest.mutate(input)
  }
}
