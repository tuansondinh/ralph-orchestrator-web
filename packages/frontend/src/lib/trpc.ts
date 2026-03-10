import { QueryClient } from '@tanstack/react-query'
import { createTRPCProxyClient, httpLink } from '@trpc/client'
import type { AppRouter } from '@ralph-ui/backend/trpc/router'

type RuntimeEnv = {
  DEV: boolean
  VITE_RALPH_ORCHESTRATOR_BACKEND_ORIGIN?: string
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
  const backendOrigin = resolveBackendOrigin(env, runtimeLocation)
  if (backendOrigin) {
    return `${backendOrigin}/trpc`
  }

  return '/trpc'
}

export function resolveBackendOrigin(
  env: RuntimeEnv = import.meta.env,
  runtimeLocation: RuntimeLocation = window.location
) {
  const backendOrigin = env.VITE_RALPH_ORCHESTRATOR_BACKEND_ORIGIN
  if (typeof backendOrigin === 'string' && backendOrigin.trim().length > 0) {
    return backendOrigin.replace(/\/$/, '')
  }

  if (env.DEV || isLocalHost(runtimeLocation.hostname)) {
    return resolveDefaultDevBackendOrigin()
  }

  return ''
}

export function resolveBackendUrl(
  path: string,
  env: RuntimeEnv = import.meta.env,
  runtimeLocation: RuntimeLocation = window.location
) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  const backendOrigin = resolveBackendOrigin(env, runtimeLocation)
  return backendOrigin ? `${backendOrigin}${normalizedPath}` : normalizedPath
}

const trpcBaseUrl = resolveTrpcBaseUrl()

export const queryClient = new QueryClient()
export const trpcClient = createTRPCProxyClient<AppRouter>({
  links: [
    httpLink({
      url: trpcBaseUrl
    })
  ]
})
