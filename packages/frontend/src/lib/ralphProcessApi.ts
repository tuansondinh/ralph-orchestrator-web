import { trpcClient } from '@/lib/trpc'

export interface RalphProcess {
  pid: number
  user: string
  cpu: string
  mem: string
  command: string
  startedAt: string
}

export const ralphProcessApi = {
  list: async () => {
    return trpcClient.ralph.list.query()
  },
  kill: async (pid: number) => {
    return trpcClient.ralph.kill.mutate({ pid })
  },
  killAll: async () => {
    return trpcClient.ralph.killAll.mutate()
  }
}
