import { trpcClient } from '@/lib/trpc'

export interface SettingsSnapshot {
  ralphBinaryPath: string | null
  notifications: {
    loopComplete: boolean
    loopFailed: boolean
    needsInput: boolean
  }
  preview: {
    portStart: number
    portEnd: number
    baseUrl: string
    command: string | null
  }
  data: {
    dbPath: string
  }
}

export interface SettingsUpdateInput {
  ralphBinaryPath?: string | null
  notifications?: {
    loopComplete?: boolean
    loopFailed?: boolean
    needsInput?: boolean
  }
  preview?: {
    portStart?: number
    portEnd?: number
    baseUrl?: string | null
    command?: string | null
  }
}

export const settingsApi = {
  get(): Promise<SettingsSnapshot> {
    return trpcClient.settings.get.query()
  },
  getDefaultPreset(): Promise<string> {
    return trpcClient.settings.getDefaultPreset.query()
  },
  setDefaultPreset(input: { filename: string; projectId?: string }): Promise<string> {
    return trpcClient.settings.setDefaultPreset.mutate(input)
  },
  update(input: SettingsUpdateInput): Promise<SettingsSnapshot> {
    return trpcClient.settings.update.mutate(input)
  },
  testBinary(input?: { path?: string }): Promise<{ path: string; version: string }> {
    return trpcClient.settings.testBinary.mutate(input)
  },
  clearData(input: { confirm: boolean }): Promise<{ cleared: true }> {
    return trpcClient.settings.clearData.mutate(input)
  }
}
