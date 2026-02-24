import { trpcClient } from '@/lib/trpc'

export type TerminalSessionState = 'active' | 'completed' | 'unknown'

export interface TerminalSessionRecord {
  id: string
  projectId: string
  state: TerminalSessionState
  shell: string
  cwd: string
  pid: number
  cols: number
  rows: number
  createdAt: number
  endedAt: number | null
}

export const terminalApi = {
  startSession(input: {
    projectId: string
    cols?: number
    rows?: number
  }): Promise<TerminalSessionRecord> {
    return trpcClient.terminal.startSession.mutate(input)
  },
  getProjectSession(input: {
    projectId: string
  }): Promise<TerminalSessionRecord | null> {
    return trpcClient.terminal.getProjectSession.query(input)
  },
  getProjectSessions(input: {
    projectId: string
  }): Promise<TerminalSessionRecord[]> {
    return trpcClient.terminal.getProjectSessions.query(input)
  },
  endSession(input: {
    sessionId: string
  }): Promise<void> {
    return trpcClient.terminal.endSession.mutate(input)
  },
  getOutputHistory(input: {
    sessionId: string
  }): Promise<string[]> {
    return trpcClient.terminal.getOutputHistory.query(input)
  }
}
