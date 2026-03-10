import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import type { RuntimeCapabilities } from '@/lib/capabilitiesApi'
import { SignInPage } from '@/pages/SignInPage'
import { AuthProvider, useAuth } from '@/providers/AuthProvider'
import { AppLoadingState, AppShellRoutes } from './AppShellRoutes'

function AuthGate({ capabilities }: { capabilities: RuntimeCapabilities }) {
  const location = useLocation()
  const { user, isLoading, signOut } = useAuth()

  if (isLoading) {
    return <AppLoadingState message="Loading session..." />
  }

  if (!user) {
    return <Navigate replace state={{ from: location.pathname }} to="/sign-in" />
  }

  return (
    <AppShellRoutes
      auth={{
        userEmail: user.email ?? null,
        onSignOut: signOut
      }}
      capabilities={capabilities}
    />
  )
}

function SignInRoute() {
  const { user, isLoading } = useAuth()

  if (isLoading) {
    return <AppLoadingState message="Loading session..." />
  }

  if (user) {
    return <Navigate replace to="/" />
  }

  return <SignInPage />
}

function SignUpRoute() {
  const { user, isLoading } = useAuth()

  if (isLoading) {
    return <AppLoadingState message="Loading session..." />
  }

  if (user) {
    return <Navigate replace to="/" />
  }

  return <SignInPage mode="sign-up" />
}

export default function CloudApp({
  capabilities
}: {
  capabilities: RuntimeCapabilities
}) {
  return (
    <AuthProvider>
      <Routes>
        <Route element={<SignInRoute />} path="/sign-in" />
        <Route element={<SignUpRoute />} path="/sign-up" />
        <Route element={<AuthGate capabilities={capabilities} />} path="*" />
      </Routes>
    </AuthProvider>
  )
}
