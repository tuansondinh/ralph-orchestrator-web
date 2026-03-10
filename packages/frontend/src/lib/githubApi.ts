import { trpcClient, resolveBackendUrl } from '@/lib/trpc'
import { resolveAuthorizedHeaders } from '@/lib/authSession'

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
  async beginConnection() {
    const headers = resolveAuthorizedHeaders({ Accept: 'application/json' })
    const response = await fetch(resolveBackendUrl('/auth/github'), { headers })
    if (!response.ok) {
      throw new Error(`GitHub connect failed: ${response.status}`)
    }
    const { url } = await response.json() as { url: string }
    window.location.assign(url)
  }
}
