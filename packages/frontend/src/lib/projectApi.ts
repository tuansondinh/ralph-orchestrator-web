import { trpcClient } from '@/lib/trpc'

export interface ProjectRecord {
  id: string
  name: string
  path: string
  type: string | null
  ralphConfig: string | null
  createdAt: number
  updatedAt: number
  userId?: string | null
  githubOwner?: string | null
  githubRepo?: string | null
  defaultBranch?: string | null
  workspacePath?: string | null
}

export interface CreateProjectInput {
  name: string
  path: string
  createIfMissing?: boolean
}

export interface SelectDirectoryResult {
  path: string
}

export interface CreateGitHubProjectInput {
  owner: string
  repo: string
  defaultBranch: string
  name?: string
}

export interface ProjectPromptSnapshot {
  projectId: string
  path: string
  content: string
}

export interface UpdateProjectPromptInput {
  content: string
}

export const projectApi = {
  list(): Promise<ProjectRecord[]> {
    return trpcClient.project.list.query()
  },
  create(input: CreateProjectInput): Promise<ProjectRecord> {
    return trpcClient.project.create.mutate(input)
  },
  createFromGitHub(input: CreateGitHubProjectInput): Promise<ProjectRecord> {
    return trpcClient.project.createFromGitHub.mutate(input)
  },
  delete(id: string): Promise<void> {
    return trpcClient.project.delete.mutate({ id })
  },
  getPrompt(projectId: string): Promise<ProjectPromptSnapshot> {
    return trpcClient.project.getPrompt.query({ projectId })
  },
  updatePrompt(
    projectId: string,
    input: UpdateProjectPromptInput
  ): Promise<ProjectPromptSnapshot> {
    return trpcClient.project.updatePrompt.mutate({
      projectId,
      content: input.content
    })
  },
  selectDirectory(): Promise<SelectDirectoryResult | null> {
    return trpcClient.project.selectDirectory.mutate()
  }
}
