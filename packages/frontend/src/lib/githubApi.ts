import { trpcClient, resolveBackendUrl } from '@/lib/trpc'

export interface GitHubConnectionSnapshot {
  githubUserId: number
  githubUsername: string
  scope: string
  connectedAt: number
}

export const githubApi = {
  getConnection(): Promise<GitHubConnectionSnapshot | null> {
    return trpcClient.github.getConnection.query()
  },
  disconnect(): Promise<void> {
    return trpcClient.github.disconnect.mutate()
  },
  beginConnection() {
    window.location.assign(resolveBackendUrl('/auth/github'))
  }
}
