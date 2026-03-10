import { useEffect, useState } from 'react'
import {
  capabilitiesApi,
  defaultRuntimeCapabilities,
  type RuntimeCapabilities
} from '@/lib/capabilitiesApi'

let cachedCapabilities: RuntimeCapabilities | null = null
let capabilitiesRequest: Promise<RuntimeCapabilities> | null = null

function loadCapabilities() {
  if (cachedCapabilities) {
    return Promise.resolve(cachedCapabilities)
  }

  if (!capabilitiesRequest) {
    capabilitiesRequest = capabilitiesApi.get()
      .then((capabilities) => {
        cachedCapabilities = capabilities
        return capabilities
      })
      .catch(() => {
        cachedCapabilities = defaultRuntimeCapabilities
        return cachedCapabilities
      })
  }

  return capabilitiesRequest
}

export function useCapabilities() {
  const [capabilities, setCapabilities] = useState<RuntimeCapabilities | null>(cachedCapabilities)

  useEffect(() => {
    let cancelled = false

    void loadCapabilities().then((nextCapabilities) => {
      if (!cancelled) {
        setCapabilities(nextCapabilities)
      }
    })

    return () => {
      cancelled = true
    }
  }, [])

  return {
    capabilities
  }
}

export function resetCapabilitiesCache() {
  cachedCapabilities = null
  capabilitiesRequest = null
}
