import { trpcClient } from '@/lib/trpc'

export type PreviewState = 'starting' | 'ready' | 'stopped' | 'error'

export interface PreviewStatus {
  projectId: string
  url: string
  port: number
  state: PreviewState
  command: string
  args: string[]
  error: string | null
}

export interface PreviewSettings {
  baseUrl: string
  command: string | null
}

export const previewApi = {
  start(projectId: string): Promise<PreviewStatus> {
    return trpcClient.preview.start.mutate({ projectId })
  },
  stop(projectId: string): Promise<void> {
    return trpcClient.preview.stop.mutate({ projectId })
  },
  status(projectId: string): Promise<PreviewStatus | null> {
    return trpcClient.preview.status.query({ projectId })
  },
  getSettings(): Promise<PreviewSettings> {
    return trpcClient.previewSettings.get.query()
  },
  setSettings(input: {
    baseUrl?: string | null
    command?: string | null
  }): Promise<PreviewSettings> {
    return trpcClient.previewSettings.set.mutate(input)
  }
}
