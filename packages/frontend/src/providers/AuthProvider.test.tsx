import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { notifyUnauthorized } from '@/lib/authEvents'
import { AuthProvider, useAuth } from './AuthProvider'

const {
  getSupabaseClientMock,
  setSupabaseSessionMock,
  getSessionMock,
  onAuthStateChangeMock,
  signInWithPasswordMock,
  signOutMock,
  unsubscribeMock
} = vi.hoisted(() => ({
  getSupabaseClientMock: vi.fn(),
  setSupabaseSessionMock: vi.fn(),
  getSessionMock: vi.fn(),
  onAuthStateChangeMock: vi.fn(),
  signInWithPasswordMock: vi.fn(),
  signOutMock: vi.fn(),
  unsubscribeMock: vi.fn()
}))

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: getSupabaseClientMock,
  getSupabaseAccessToken: vi.fn(() => null),
  setSupabaseSession: setSupabaseSessionMock
}))

function AuthHarness() {
  const { user, isLoading, signIn, signOut, isConfigured, getAccessToken } = useAuth()
  const userEmail = user?.email ?? 'anonymous'

  return (
    <div>
      <p data-testid="auth-loading">{isLoading ? 'loading' : 'ready'}</p>
      <p data-testid="auth-user">{userEmail}</p>
      <p data-testid="auth-configured">{String(isConfigured)}</p>
      <p data-testid="auth-token">{getAccessToken() ?? 'none'}</p>
      <button
        onClick={() => {
          void signIn('dev@example.com', 'secret')
        }}
        type="button"
      >
        Sign in
      </button>
      <button
        onClick={() => {
          void signOut()
        }}
        type="button"
      >
        Sign out
      </button>
    </div>
  )
}

describe('AuthProvider', () => {
  let authStateChangeHandler:
    | ((event: string, session: { access_token: string; user: { email: string } } | null) => void)
    | null = null

  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    authStateChangeHandler = null

    getSessionMock.mockResolvedValue({
      data: {
        session: null
      }
    })
    onAuthStateChangeMock.mockImplementation((callback) => {
      authStateChangeHandler = callback
      return {
        data: {
          subscription: {
            unsubscribe: unsubscribeMock
          }
        }
      }
    })
    signInWithPasswordMock.mockResolvedValue({
      error: null
    })
    signOutMock.mockImplementation(async () => {
      authStateChangeHandler?.('SIGNED_OUT', null)
      return {
        error: null
      }
    })
    getSupabaseClientMock.mockReturnValue({
      auth: {
        getSession: getSessionMock,
        onAuthStateChange: onAuthStateChangeMock,
        signInWithPassword: signInWithPasswordMock,
        signOut: signOutMock
      }
    })
  })

  it('loads the initial session and exposes the authenticated user and access token', async () => {
    getSessionMock.mockResolvedValue({
      data: {
        session: {
          access_token: 'token-123',
          user: {
            email: 'dev@example.com'
          }
        }
      }
    })

    render(
      <AuthProvider>
        <AuthHarness />
      </AuthProvider>
    )

    expect(screen.getByTestId('auth-loading')).toHaveTextContent('loading')

    await waitFor(() => {
      expect(screen.getByTestId('auth-loading')).toHaveTextContent('ready')
    })

    expect(screen.getByTestId('auth-user')).toHaveTextContent('dev@example.com')
    expect(screen.getByTestId('auth-token')).toHaveTextContent('token-123')
    expect(setSupabaseSessionMock).toHaveBeenCalledWith({
      access_token: 'token-123',
      user: {
        email: 'dev@example.com'
      }
    })
  })

  it('forwards email/password sign-in requests to Supabase auth', async () => {
    render(
      <AuthProvider>
        <AuthHarness />
      </AuthProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('auth-loading')).toHaveTextContent('ready')
    })

    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    await waitFor(() => {
      expect(signInWithPasswordMock).toHaveBeenCalledWith({
        email: 'dev@example.com',
        password: 'secret'
      })
    })
  })

  it('signs out when the frontend receives a global unauthorized event', async () => {
    getSessionMock.mockResolvedValue({
      data: {
        session: {
          access_token: 'token-123',
          user: {
            email: 'dev@example.com'
          }
        }
      }
    })

    render(
      <AuthProvider>
        <AuthHarness />
      </AuthProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('auth-user')).toHaveTextContent('dev@example.com')
    })

    act(() => {
      notifyUnauthorized()
    })

    await waitFor(() => {
      expect(signOutMock).toHaveBeenCalledTimes(1)
      expect(screen.getByTestId('auth-user')).toHaveTextContent('anonymous')
    })
    expect(setSupabaseSessionMock).toHaveBeenLastCalledWith(null)
  })
})
