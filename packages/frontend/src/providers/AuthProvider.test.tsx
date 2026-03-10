import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider, useAuth } from './AuthProvider'

const {
  resolveSupabaseBrowserConfigMock,
  getSupabaseBrowserClientMock,
  runtimeCapabilitiesGetMock,
  getSessionMock,
  onAuthStateChangeMock,
  signInWithPasswordMock,
  signUpMock,
  signOutMock,
  unsubscribeMock
} = vi.hoisted(() => ({
  resolveSupabaseBrowserConfigMock: vi.fn(),
  getSupabaseBrowserClientMock: vi.fn(),
  runtimeCapabilitiesGetMock: vi.fn(),
  getSessionMock: vi.fn(),
  onAuthStateChangeMock: vi.fn(),
  signInWithPasswordMock: vi.fn(),
  signUpMock: vi.fn(),
  signOutMock: vi.fn(),
  unsubscribeMock: vi.fn()
}))

vi.mock('@/lib/supabaseBrowserClient', () => ({
  resolveSupabaseBrowserConfig: resolveSupabaseBrowserConfigMock,
  getSupabaseBrowserClient: getSupabaseBrowserClientMock
}))

vi.mock('@/lib/runtimeCapabilities', () => ({
  runtimeCapabilitiesApi: {
    get: runtimeCapabilitiesGetMock
  }
}))

vi.mock('@/lib/authSession', () => ({
  setAuthAccessToken: vi.fn()
}))

function AuthHarness() {
  const { user, isLoading, isAuthenticated, accessToken, mode } = useAuth()
  const userEmail = user?.email ?? 'anonymous'

  return (
    <div>
      <p data-testid="auth-loading">{isLoading ? 'loading' : 'ready'}</p>
      <p data-testid="auth-user">{userEmail}</p>
      <p data-testid="auth-authenticated">{String(isAuthenticated)}</p>
      <p data-testid="auth-token">{accessToken ?? 'none'}</p>
      <p data-testid="auth-mode">{mode}</p>
    </div>
  )
}

describe('AuthProvider', () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    vi.clearAllMocks()

    getSessionMock.mockResolvedValue({
      data: { session: null }
    })
    onAuthStateChangeMock.mockImplementation((callback: Function) => {
      return {
        data: {
          subscription: { unsubscribe: unsubscribeMock }
        }
      }
    })
    signInWithPasswordMock.mockResolvedValue({ error: null })
    signUpMock.mockResolvedValue({ error: null })
    signOutMock.mockResolvedValue({ error: null })

    getSupabaseBrowserClientMock.mockReturnValue({
      auth: {
        getSession: getSessionMock,
        onAuthStateChange: onAuthStateChangeMock,
        signInWithPassword: signInWithPasswordMock,
        signUp: signUpMock,
        signOut: signOutMock
      }
    })
  })

  it('renders in local mode when supabase config is absent', async () => {
    resolveSupabaseBrowserConfigMock.mockReturnValue(null)

    render(
      <AuthProvider>
        <AuthHarness />
      </AuthProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('auth-loading')).toHaveTextContent('ready')
    })

    expect(screen.getByTestId('auth-mode')).toHaveTextContent('local')
    expect(screen.getByTestId('auth-authenticated')).toHaveTextContent('true')
  })

  it('loads the initial session and exposes the authenticated user and access token', async () => {
    resolveSupabaseBrowserConfigMock.mockReturnValue({
      url: 'https://test.supabase.co',
      anonKey: 'test-key'
    })
    runtimeCapabilitiesGetMock.mockResolvedValue({
      mode: 'cloud',
      auth: true
    })
    getSessionMock.mockResolvedValue({
      data: {
        session: {
          access_token: 'token-123',
          user: { email: 'dev@example.com' }
        }
      }
    })
    onAuthStateChangeMock.mockImplementation((callback: Function) => {
      callback('INITIAL_SESSION', {
        access_token: 'token-123',
        user: { email: 'dev@example.com' }
      })
      return {
        data: { subscription: { unsubscribe: unsubscribeMock } }
      }
    })

    render(
      <AuthProvider>
        <AuthHarness />
      </AuthProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('auth-loading')).toHaveTextContent('ready')
    })

    expect(screen.getByTestId('auth-user')).toHaveTextContent('dev@example.com')
    expect(screen.getByTestId('auth-token')).toHaveTextContent('token-123')
    expect(screen.getByTestId('auth-mode')).toHaveTextContent('cloud')
  })

  it('renders children with isAuthenticated=false when cloud mode has no session', async () => {
    resolveSupabaseBrowserConfigMock.mockReturnValue({
      url: 'https://test.supabase.co',
      anonKey: 'test-key'
    })
    runtimeCapabilitiesGetMock.mockResolvedValue({
      mode: 'cloud',
      auth: true
    })
    getSessionMock.mockResolvedValue({
      data: { session: null }
    })
    onAuthStateChangeMock.mockImplementation((callback: Function) => {
      callback('INITIAL_SESSION', null)
      return {
        data: { subscription: { unsubscribe: unsubscribeMock } }
      }
    })

    render(
      <AuthProvider>
        <AuthHarness />
      </AuthProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('auth-loading')).toHaveTextContent('ready')
    })

    expect(screen.getByTestId('auth-authenticated')).toHaveTextContent('false')
    expect(screen.getByTestId('auth-mode')).toHaveTextContent('cloud')
    expect(screen.getByTestId('auth-user')).toHaveTextContent('anonymous')
  })
})
