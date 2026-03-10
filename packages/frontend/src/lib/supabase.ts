import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js'
import {
  getCachedAccessToken,
  resetCachedAccessToken,
  setCachedAccessToken
} from '@/lib/authSession'

type RuntimeEnv = {
  VITE_SUPABASE_ANON_KEY?: string
  VITE_SUPABASE_URL?: string
}

let supabaseClient: SupabaseClient | null | undefined

export function getSupabaseClient(
  env: RuntimeEnv = import.meta.env as RuntimeEnv
): SupabaseClient | null {
  if (supabaseClient !== undefined) {
    return supabaseClient
  }

  const supabaseUrl = env.VITE_SUPABASE_URL
  const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) {
    supabaseClient = null
    return supabaseClient
  }

  supabaseClient = createClient(supabaseUrl, supabaseAnonKey)
  return supabaseClient
}

export function setSupabaseSession(session: Pick<Session, 'access_token'> | null) {
  setCachedAccessToken(session)
}

export function getSupabaseAccessToken() {
  return getCachedAccessToken()
}

export function resetSupabaseClient() {
  supabaseClient = undefined
  resetCachedAccessToken()
}
