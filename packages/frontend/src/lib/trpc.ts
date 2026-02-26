import { QueryClient } from '@tanstack/react-query'
import { createTRPCProxyClient, httpLink } from '@trpc/client'
/* eslint-disable @typescript-eslint/no-explicit-any */

type RuntimeEnv = {
  DEV: boolean
  VITE_RALPH_UI_BACKEND_ORIGIN?: string
}

type RuntimeLocation = Pick<Location, 'hostname'>
function resolveDefaultDevBackendOrigin() {
  return 'http://127.0.0.1:3003'
}

function isLocalHost(hostname: string) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
}

export function resolveTrpcBaseUrl(
  env: RuntimeEnv = import.meta.env,
  runtimeLocation: RuntimeLocation = window.location
) {
  const backendOrigin = env.VITE_RALPH_UI_BACKEND_ORIGIN
  if (typeof backendOrigin === 'string' && backendOrigin.trim().length > 0) {
    return `${backendOrigin.replace(/\/$/, '')}/trpc`
  }

  if (env.DEV || isLocalHost(runtimeLocation.hostname)) {
    return `${resolveDefaultDevBackendOrigin()}/trpc`
  }

  return '/trpc'
}

const trpcBaseUrl = resolveTrpcBaseUrl()

export const queryClient = new QueryClient()
export const trpcClient: any = createTRPCProxyClient<any>({
  links: [
    httpLink({
      url: trpcBaseUrl
    })
  ]
})
