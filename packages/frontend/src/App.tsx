import { lazy, Suspense, useEffect, type ComponentType } from 'react'
import { BrowserRouter } from 'react-router-dom'
import { PixelCat } from '@/components/layout/PixelCat'
import { useCapabilities } from '@/hooks/useCapabilities'
import type { RuntimeCapabilities } from '@/lib/capabilitiesApi'
import { AppLoadingState, AppShellRoutes } from './AppShellRoutes'

const cloudAppModules = import.meta.glob('./CloudApp.tsx')
const loadCloudApp = cloudAppModules['./CloudApp.tsx']
const CloudApp = lazy(
  loadCloudApp as () => Promise<{
    default: ComponentType<{ capabilities: RuntimeCapabilities }>
  }>
)

export default function App() {
  const { capabilities } = useCapabilities()

  useEffect(() => {
    document.documentElement.classList.add('dark')
  }, [])

  if (!capabilities) {
    return <AppLoadingState message="Loading app..." />
  }

  return (
    <BrowserRouter>
      <Suspense fallback={<AppLoadingState message="Loading app..." />}>
        {capabilities.auth ? (
          <CloudApp capabilities={capabilities} />
        ) : (
          <AppShellRoutes capabilities={capabilities} />
        )}
      </Suspense>
      <PixelCat />
    </BrowserRouter>
  )
}
