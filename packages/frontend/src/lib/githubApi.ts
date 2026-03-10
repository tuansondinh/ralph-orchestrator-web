import { trpcClient, resolveBackendUrl } from '@/lib/trpc'

export interface GitHubConnectionSnapshot {
  githubUserId: number
  githubUsername: string
  scope: string
  connectedAt: number
}

export interface GitHubRepoSnapshot {
  id: number
  fullName: string
  private: boolean
  defaultBranch: string
  htmlUrl: string
}

export interface ListGitHubReposResult {
  repos: GitHubRepoSnapshot[]
  hasMore: boolean
}

export const githubApi = {
  getConnection(): Promise<GitHubConnectionSnapshot | null> {
    return trpcClient.github.getConnection.query()
  },
  listRepos(input: { page?: number } = {}): Promise<ListGitHubReposResult> {
    return trpcClient.github.listRepos.query(input)
  },
  disconnect(): Promise<void> {
    return trpcClient.github.disconnect.mutate()
  },
  beginConnection() {
    window.location.assign(resolveBackendUrl('/auth/github'))
  }
}
