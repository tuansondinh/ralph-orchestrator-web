import { trpcClient } from '@/lib/trpc'

export interface PresetSummary {
  name: string
  filename: string
}

export const presetApi = {
  list(projectId?: string): Promise<PresetSummary[]> {
    return trpcClient.presets.list.query({ projectId })
  },
  get(filename: string, projectId?: string): Promise<{ filename: string; content: string }> {
    return trpcClient.presets.get.query({ filename, projectId })
  }
}
