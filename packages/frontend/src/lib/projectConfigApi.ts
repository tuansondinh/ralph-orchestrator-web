import { trpcClient } from '@/lib/trpc'

export interface ProjectConfigSnapshot {
  projectId: string
  yaml: string
  config: Record<string, unknown>
}

export type UpdateProjectConfigInput =
  | {
      projectId: string
      yaml: string
      config?: never
    }
  | {
      projectId: string
      config: Record<string, unknown>
      yaml?: never
    }

export const projectConfigApi = {
  get(projectId: string): Promise<ProjectConfigSnapshot> {
    return trpcClient.project.getConfig.query({ projectId })
  },
  update(input: UpdateProjectConfigInput): Promise<ProjectConfigSnapshot> {
    return trpcClient.project.updateConfig.mutate(input)
  }
}
