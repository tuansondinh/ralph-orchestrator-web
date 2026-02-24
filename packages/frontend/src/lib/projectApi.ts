import { trpcClient } from '@/lib/trpc'

export interface ProjectRecord {
  id: string
  name: string
  path: string
  type: string | null
  ralphConfig: string | null
  createdAt: number
  updatedAt: number
}

export interface CreateProjectInput {
  name: string
  path: string
  createIfMissing?: boolean
}

export interface SelectDirectoryResult {
  path: string
}

export interface ProjectPromptSnapshot {
  projectId: string
  path: string
  content: string
}

export const projectApi = {
  list(): Promise<ProjectRecord[]> {
    return trpcClient.project.list.query()
  },
  create(input: CreateProjectInput): Promise<ProjectRecord> {
    return trpcClient.project.create.mutate(input)
  },
  delete(id: string): Promise<void> {
    return trpcClient.project.delete.mutate({ id })
  },
  getPrompt(projectId: string): Promise<ProjectPromptSnapshot> {
    return trpcClient.project.getPrompt.query({ projectId })
  },
  selectDirectory(): Promise<SelectDirectoryResult | null> {
    return trpcClient.project.selectDirectory.mutate()
  }
}
