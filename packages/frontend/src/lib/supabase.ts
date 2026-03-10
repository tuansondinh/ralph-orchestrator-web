import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  getAuthAccessToken,
  setAuthAccessToken
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

export function setSupabaseSession(session: { access_token: string } | null) {
  setAuthAccessToken(session?.access_token ?? null)
}

export function getSupabaseAccessToken() {
  return getAuthAccessToken()
}

export function resetSupabaseClient() {
  supabaseClient = undefined
  setAuthAccessToken(null)
}
