import { trpcClient } from '@/lib/trpc'
import type {
  RuntimeCapabilities,
  RuntimeCapabilityKey,
  RuntimeMode
} from '@ralph-ui/backend/config/runtimeCapabilities'

export type { RuntimeCapabilities, RuntimeCapabilityKey, RuntimeMode }

export const runtimeCapabilitiesApi = {
  get(): Promise<RuntimeCapabilities> {
    return trpcClient.capabilities.query()
  }
}

export function isCloudRuntime(
  capabilities: Pick<RuntimeCapabilities, 'mode'>
): capabilities is Pick<RuntimeCapabilities, 'mode'> & { mode: 'cloud' } {
  return capabilities.mode === 'cloud'
}

export function isLocalRuntime(
  capabilities: Pick<RuntimeCapabilities, 'mode'>
): capabilities is Pick<RuntimeCapabilities, 'mode'> & { mode: 'local' } {
  return capabilities.mode === 'local'
}

export function hasRuntimeCapability(
  capabilities: RuntimeCapabilities,
  capability: RuntimeCapabilityKey
) {
  return capabilities[capability]
}
