import type { Session, User } from '@supabase/supabase-js'
import { createContext, type PropsWithChildren, useContext, useEffect, useRef, useState } from 'react'
import { SignInPage } from '@/components/auth/SignInPage'
import { setAuthAccessToken } from '@/lib/authSession'
import { runtimeCapabilitiesApi } from '@/lib/runtimeCapabilities'
import {
  getSupabaseBrowserClient,
  resolveSupabaseBrowserConfig
} from '@/lib/supabaseBrowserClient'

type RuntimeMode = 'local' | 'cloud'

interface AuthContextValue {
  accessToken: string | null
  isAuthenticated: boolean
  isLoading: boolean
  mode: RuntimeMode
  session: Session | null
  signIn: (credentials: { email: string; password: string }) => Promise<void>
  signUp: (credentials: { email: string; password: string }) => Promise<void>
  signOut: () => Promise<void>
  user: User | null
}

const AuthContext = createContext<AuthContextValue | null>(null)

function AuthLoadingState() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-6 text-zinc-100">
      <div className="w-full max-w-sm rounded-3xl border border-zinc-800 bg-zinc-900/90 p-8 text-center">
        <p className="text-sm uppercase tracking-[0.3em] text-zinc-500">Cloud Workspace</p>
        <h1 className="mt-3 text-2xl font-semibold text-zinc-50">Checking your session</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-400">
          Ralph is verifying your Supabase access before loading the app.
        </p>
      </div>
    </div>
  )
}

function AuthErrorState({ message }: { message: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-6 text-zinc-100">
      <div className="w-full max-w-lg rounded-3xl border border-rose-500/30 bg-zinc-900/90 p-8">
        <p className="text-sm uppercase tracking-[0.3em] text-rose-300/80">Cloud Auth</p>
        <h1 className="mt-3 text-2xl font-semibold text-zinc-50">Authentication is unavailable</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-300">{message}</p>
      </div>
    </div>
  )
}

export function AuthProvider({ children }: PropsWithChildren) {
  const supabaseConfig = resolveSupabaseBrowserConfig()
  const [mode, setMode] = useState<RuntimeMode>(supabaseConfig ? 'cloud' : 'local')
  const [runtimeError, setRuntimeError] = useState<string | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [isBootstrapping, setIsBootstrapping] = useState(Boolean(supabaseConfig))
  const [isSigningIn, setIsSigningIn] = useState(false)
  const [signInError, setSignInError] = useState<string | null>(null)
  const clientRef = useRef<ReturnType<typeof getSupabaseBrowserClient>>(null)

  useEffect(() => {
    if (!supabaseConfig) {
      setMode('local')
      setRuntimeError(null)
      setSession(null)
      setAuthAccessToken(null)
      setIsBootstrapping(false)
      return
    }

    let cancelled = false
    let unsubscribe = () => { }

    const bootstrap = async () => {
      setIsBootstrapping(true)
      setRuntimeError(null)

      try {
        const capabilities = await runtimeCapabilitiesApi.get()

        if (cancelled) {
          return
        }

        if (capabilities.mode === 'local' || capabilities.auth === false) {
          setMode('local')
          setSession(null)
          setAuthAccessToken(null)
          setIsBootstrapping(false)
          return
        }

        setMode('cloud')
        const supabaseClient = getSupabaseBrowserClient()
        if (!supabaseClient) {
          setRuntimeError('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY.')
          setIsBootstrapping(false)
          return
        }

        clientRef.current = supabaseClient
        const subscription = supabaseClient.auth.onAuthStateChange((_event, nextSession) => {
          if (cancelled) {
            return
          }

          setAuthAccessToken(nextSession?.access_token ?? null)
          setSession(nextSession)
          setSignInError(null)
          setIsBootstrapping(false)
        })
        unsubscribe = () => {
          subscription.data.subscription.unsubscribe()
        }

        const { data, error } = await supabaseClient.auth.getSession()

        if (cancelled) {
          return
        }

        if (error) {
          setRuntimeError(error.message)
          setIsBootstrapping(false)
          return
        }

        setAuthAccessToken(data.session?.access_token ?? null)
        setSession(data.session ?? null)
        setIsBootstrapping(false)
      } catch (error) {
        if (!cancelled) {
          setRuntimeError(
            error instanceof Error
              ? error.message
              : 'Failed to load cloud authentication state.'
          )
          setIsBootstrapping(false)
        }
      }
    }

    void bootstrap()

    return () => {
      cancelled = true
      unsubscribe()
      setAuthAccessToken(null)
    }
  }, [supabaseConfig?.anonKey, supabaseConfig?.url])

  const signIn = async ({ email, password }: { email: string; password: string }) => {
    const supabaseClient = clientRef.current ?? getSupabaseBrowserClient()
    if (!supabaseClient) {
      const msg = 'Supabase browser client is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'
      setSignInError(msg)
      throw new Error(msg)
    }

    setIsSigningIn(true)
    setSignInError(null)

    try {
      const { data, error } = await supabaseClient.auth.signInWithPassword({
        email,
        password
      })

      if (error) {
        setSignInError(error.message)
        throw new Error(error.message)
      }

      setAuthAccessToken(data.session?.access_token ?? null)
      setSession(data.session ?? null)
    } finally {
      setIsSigningIn(false)
    }
  }

  const signUp = async ({ email, password }: { email: string; password: string }) => {
    const supabaseClient = clientRef.current ?? getSupabaseBrowserClient()
    if (!supabaseClient) {
      const msg = 'Supabase browser client is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'
      setSignInError(msg)
      throw new Error(msg)
    }

    setIsSigningIn(true)
    setSignInError(null)

    try {
      const { data, error } = await supabaseClient.auth.signUp({
        email,
        password
      })

      if (error) {
        setSignInError(error.message)
        throw new Error(error.message)
      }

      if (!data.session) {
        throw new Error('Sign-up complete. Check your email to confirm your account before signing in.')
      }

      setAuthAccessToken(data.session.access_token ?? null)
      setSession(data.session)
    } finally {
      setIsSigningIn(false)
    }
  }

  const signOut = async () => {
    const supabaseClient = clientRef.current ?? getSupabaseBrowserClient()
    if (!supabaseClient) {
      setAuthAccessToken(null)
      setSession(null)
      return
    }

    await supabaseClient.auth.signOut()
    setAuthAccessToken(null)
    setSession(null)
  }

  const contextValue: AuthContextValue = {
    accessToken: session?.access_token ?? null,
    isAuthenticated: mode === 'local' || session !== null,
    isLoading: isBootstrapping,
    mode,
    session,
    signIn,
    signUp,
    signOut,
    user: session?.user ?? null
  }

  return (
    <AuthContext.Provider value={contextValue}>
      {runtimeError ? <AuthErrorState message={runtimeError} /> : children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }

  return context
}
