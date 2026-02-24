import { trpcClient } from '@/lib/trpc'

export interface WorktreeSummary {
  name: string
  path: string
  branch: string | null
  isPrimary: boolean
}

export const worktreeApi = {
  list(projectId: string): Promise<WorktreeSummary[]> {
    return trpcClient.project.listWorktrees.query({ projectId })
  },
  create(projectId: string, name: string): Promise<WorktreeSummary> {
    return trpcClient.project.createWorktree.mutate({ projectId, name })
  }
}
