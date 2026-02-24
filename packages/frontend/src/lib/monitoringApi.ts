import { trpcClient } from '@/lib/trpc'
import type { LoopMetrics } from '@/lib/loopApi'

export interface ProjectStatus {
  activeLoops: number
  totalRuns: number
  lastRunAt: number | null
  health: 'healthy' | 'warning' | 'error'
  tokenUsage: number
  errorRate: number
}

export interface MonitoringEvent {
  topic: string
  payload?: unknown
  sourceHat?: string
  timestamp: number
}

export interface EventHistoryInput {
  projectId: string
  topic?: string
  sourceHat?: string
  limit?: number
}

export interface FileChange {
  path: string
  additions: number
  deletions: number
}

export interface MonitoringLoopMetrics extends LoopMetrics {
  fileChanges: FileChange[]
}

export interface MonitoringFileContent {
  path: string
  content: string
}

export const monitoringApi = {
  projectStatus(projectId: string): Promise<ProjectStatus> {
    return trpcClient.monitoring.projectStatus.query({ projectId })
  },
  loopMetrics(loopId: string): Promise<MonitoringLoopMetrics> {
    return trpcClient.monitoring.loopMetrics.query({ loopId })
  },
  eventHistory(input: EventHistoryInput): Promise<MonitoringEvent[]> {
    return trpcClient.monitoring.eventHistory.query(input)
  },
  fileContent(loopId: string, path: string): Promise<MonitoringFileContent> {
    return trpcClient.monitoring.fileContent.query({ loopId, path })
  }
}
