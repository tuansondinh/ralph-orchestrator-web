import { QueryClient } from '@tanstack/react-query'
import { createTRPCProxyClient, httpLink } from '@trpc/client'
import type { AppRouter } from '@ralph-ui/backend/trpc/router'
import { notifyUnauthorized } from '@/lib/authEvents'
import { resolveAuthorizedHeaders } from '@/lib/authSession'

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
  // In dev mode (Vite dev server), always use relative URLs so the Vite proxy
  // handles forwarding to the backend. This avoids CORS preflight failures when
  // Authorization headers are present (e.g. cloud auth mode).
  if (env.DEV) {
    return ''
  }

  const backendOrigin = env.VITE_RALPH_ORCHESTRATOR_BACKEND_ORIGIN
  if (typeof backendOrigin === 'string' && backendOrigin.trim().length > 0) {
    return backendOrigin.replace(/\/$/, '')
  }

  if (isLocalHost(runtimeLocation.hostname)) {
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

export function resolveTrpcHeaders(
  getAccessToken?: () => string | null
) {
  if (getAccessToken) {
    const accessToken = getAccessToken()
    if (!accessToken) {
      return {}
    }
    return {
      Authorization: `Bearer ${accessToken}`
    }
  }

  return resolveAuthorizedHeaders()
}

const trpcBaseUrl = resolveTrpcBaseUrl()

export const queryClient = new QueryClient()
export const trpcClient = createTRPCProxyClient<AppRouter>({
  links: [
    httpLink({
      url: trpcBaseUrl,
      headers() {
        return resolveTrpcHeaders()
      },
      async fetch(url, options) {
        const response = await globalThis.fetch(url, options)
        if (response.status === 401) {
          notifyUnauthorized()
        }
        return response
      }
    })
  ]
})
