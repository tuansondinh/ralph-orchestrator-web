import { trpcClient } from '@/lib/trpc'

export interface HatsPresetSummary {
  id: string
  name: string
}

export interface HatsPresetList {
  sourceDirectory: string
  presets: HatsPresetSummary[]
}

export interface HatsPresetDetail {
  id: string
  name: string
  sourceDirectory: string
  content: string
}

export const hatsPresetApi = {
  list(): Promise<HatsPresetList> {
    return trpcClient.hatsPresets.list.query()
  },
  get(id: string): Promise<HatsPresetDetail> {
    return trpcClient.hatsPresets.get.query({ id })
  }
}
