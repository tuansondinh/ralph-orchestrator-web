import { QueryClientProvider } from '@tanstack/react-query'
import type { PropsWithChildren } from 'react'
import { queryClient } from '@/lib/trpc'
import { AuthProvider } from '@/providers/AuthProvider'

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  )
}
