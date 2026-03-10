import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/providers/AuthProvider'

const {
  getCapabilitiesMock,
  resolveSupabaseBrowserConfigMock,
  getSupabaseBrowserClientMock,
  getSessionMock,
  signInWithPasswordMock,
  signUpMock,
  signOutMock,
  unsubscribeMock,
  emitAuthStateChange,
  resetAuthStateChange
} = vi.hoisted(() => {
  let authStateChange:
    | ((event: string, session: Record<string, unknown> | null) => void)
    | null = null

  const getSessionMock = vi.fn()
  const signInWithPasswordMock = vi.fn()
  const signUpMock = vi.fn()
  const signOutMock = vi.fn()
  const unsubscribeMock = vi.fn()

  return {
    getCapabilitiesMock: vi.fn(),
    resolveSupabaseBrowserConfigMock: vi.fn(),
    getSupabaseBrowserClientMock: vi.fn(() => ({
      auth: {
        getSession: getSessionMock,
        signInWithPassword: signInWithPasswordMock,
        signUp: signUpMock,
        signOut: signOutMock,
        onAuthStateChange: (
          callback: (event: string, session: Record<string, unknown> | null) => void
        ) => {
          authStateChange = callback
          return {
            data: {
              subscription: {
                unsubscribe: unsubscribeMock
              }
            }
          }
        }
      }
    })),
    getSessionMock,
    signInWithPasswordMock,
    signUpMock,
    signOutMock,
    unsubscribeMock,
    emitAuthStateChange: (event: string, session: Record<string, unknown> | null) => {
      authStateChange?.(event, session)
    },
    resetAuthStateChange: () => {
      authStateChange = null
    }
  }
})

vi.mock('@/lib/runtimeCapabilities', () => ({
  runtimeCapabilitiesApi: {
    get: getCapabilitiesMock
  }
}))

vi.mock('@/lib/supabaseBrowserClient', () => ({
  resolveSupabaseBrowserConfig: resolveSupabaseBrowserConfigMock,
  getSupabaseBrowserClient: getSupabaseBrowserClientMock
}))

import { AppProviders } from '@/providers/AppProviders'

function createCloudCapabilities() {
  return {
    mode: 'cloud' as const,
    database: true,
    auth: true,
    localProjects: false,
    githubProjects: true,
    terminal: false,
    preview: false,
    localDirectoryPicker: false,
    mcp: false
  }
}

function createSession(email = 'dev@example.com') {
  return {
    access_token: 'supabase-access-token',
    user: {
      id: 'user-1',
      email
    }
  }
}

describe('AppProviders', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetAuthStateChange()
    signUpMock.mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders the app immediately in local mode without booting the auth shell', async () => {
    resolveSupabaseBrowserConfigMock.mockReturnValue(null)

    render(
      <AppProviders>
        <div>App shell</div>
      </AppProviders>
    )

    expect(await screen.findByText('App shell')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /sign in to ralph/i })).not.toBeInTheDocument()
    expect(getCapabilitiesMock).not.toHaveBeenCalled()
    expect(getSupabaseBrowserClientMock).not.toHaveBeenCalled()
  })

  it('renders children with unauthenticated context in cloud mode when there is no session', async () => {
    resolveSupabaseBrowserConfigMock.mockReturnValue({
      url: 'https://supabase.example.com',
      anonKey: 'anon-key'
    })
    getCapabilitiesMock.mockResolvedValue(createCloudCapabilities())
    getSessionMock.mockResolvedValue({
      data: { session: null },
      error: null
    })

    render(
      <AppProviders>
        <div>App shell</div>
      </AppProviders>
    )

    expect(await screen.findByText('App shell')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /sign in to ralph/i })).not.toBeInTheDocument()
    expect(getSupabaseBrowserClientMock).toHaveBeenCalledTimes(1)
  })

  it('updates auth context to authenticated after a successful cloud sign-in', async () => {
    resolveSupabaseBrowserConfigMock.mockReturnValue({
      url: 'https://supabase.example.com',
      anonKey: 'anon-key'
    })
    getCapabilitiesMock.mockResolvedValue(createCloudCapabilities())
    getSessionMock.mockResolvedValue({
      data: { session: null },
      error: null
    })
    signInWithPasswordMock.mockImplementation(async ({ email, password }) => {
      expect(email).toBe('dev@example.com')
      expect(password).toBe('hunter2-hunter2')

      const session = createSession(email)
      emitAuthStateChange('SIGNED_IN', session)

      return {
        data: { session, user: session.user },
        error: null
      }
    })

    function AuthHarness() {
      const { isAuthenticated, signIn } = useAuth()
      return (
        <>
          <p data-testid="authenticated">{String(isAuthenticated)}</p>
          <button
            onClick={() => void signIn({ email: 'dev@example.com', password: 'hunter2-hunter2' })}
          >
            Sign In
          </button>
        </>
      )
    }

    render(
      <AppProviders>
        <AuthHarness />
      </AppProviders>
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Sign In' }))

    expect(signInWithPasswordMock).toHaveBeenCalledWith({
      email: 'dev@example.com',
      password: 'hunter2-hunter2'
    })
    await waitFor(() => {
      expect(screen.getByTestId('authenticated')).toHaveTextContent('true')
    })
  })
})
