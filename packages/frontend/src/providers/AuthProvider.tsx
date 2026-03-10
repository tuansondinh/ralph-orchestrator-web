import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { PropsWithChildren } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { subscribeToUnauthorized } from '@/lib/authEvents'
import { getSupabaseClient, setSupabaseSession } from '@/lib/supabase'

interface AuthContextValue {
  user: User | null
  session: Session | null
  isLoading: boolean
  isConfigured: boolean
  signIn: (email: string, password: string) => Promise<{ error?: string }>
  signOut: () => Promise<void>
  getAccessToken: () => string | null
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: PropsWithChildren) {
  const supabase = getSupabaseClient()
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [isLoading, setIsLoading] = useState(Boolean(supabase))

  const applySession = useCallback((nextSession: Session | null) => {
    setSession(nextSession)
    setUser(nextSession?.user ?? null)
    setSupabaseSession(nextSession)
  }, [])

  useEffect(() => {
    if (!supabase) {
      applySession(null)
      setIsLoading(false)
      return
    }

    let cancelled = false
    setIsLoading(true)

    void supabase.auth.getSession()
      .then(({ data }) => {
        if (cancelled) {
          return
        }

        applySession(data.session)
      })
      .catch(() => {
        if (cancelled) {
          return
        }

        applySession(null)
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false)
        }
      })

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      applySession(nextSession)
      setIsLoading(false)
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [applySession, supabase])

  useEffect(() => {
    return subscribeToUnauthorized(() => {
      if (!supabase) {
        applySession(null)
        return
      }

      void supabase.auth.signOut().catch(() => {
        applySession(null)
      })
    })
  }, [applySession, supabase])

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) {
      return {
        error: 'Supabase browser auth is not configured for this deployment.'
      }
    }

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password
    })

    return {
      error: error?.message
    }
  }, [supabase])

  const signOut = useCallback(async () => {
    if (!supabase) {
      applySession(null)
      return
    }

    const { error } = await supabase.auth.signOut()
    if (error) {
      applySession(null)
    }
  }, [applySession, supabase])

  const value = useMemo<AuthContextValue>(() => ({
    user,
    session,
    isLoading,
    isConfigured: supabase !== null,
    signIn,
    signOut,
    getAccessToken: () => session?.access_token ?? null
  }), [isLoading, session, signIn, signOut, supabase, user])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }

  return context
}
