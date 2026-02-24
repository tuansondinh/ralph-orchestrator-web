import { trpcClient } from '@/lib/trpc'

export interface TaskRecord {
  id: string
  title: string
  description: string
  status: string
  priority: number | null
  blocked_by: string[]
  loop_id: string | null
  created: string | null
  closed: string | null
}

export const taskApi = {
  list(projectId: string): Promise<TaskRecord[]> {
    return trpcClient.task.list.query({ projectId })
  }
}
