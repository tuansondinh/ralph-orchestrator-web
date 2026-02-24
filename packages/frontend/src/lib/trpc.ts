import { QueryClient } from '@tanstack/react-query'
import { createTRPCProxyClient, httpLink } from '@trpc/client'

type RuntimeEnv = {
  DEV: boolean
  VITE_RALPH_UI_BACKEND_ORIGIN?: string
}

export function resolveTrpcBaseUrl(env: RuntimeEnv = import.meta.env) {
  if (!env.DEV) {
    return '/trpc'
  }

  const backendOrigin = env.VITE_RALPH_UI_BACKEND_ORIGIN
  if (typeof backendOrigin === 'string' && backendOrigin.trim().length > 0) {
    // Prefer Vite proxy (relative path) for default local backend to avoid CORS
    if (backendOrigin.includes('localhost:3001') || backendOrigin.includes('127.0.0.1:3001')) {
      return '/trpc'
    }
    return `${backendOrigin.replace(/\/$/, '')}/trpc`
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
