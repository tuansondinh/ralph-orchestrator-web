import { createClient, type SupabaseClient } from '@supabase/supabase-js'

type SupabaseBrowserEnv = {
  VITE_SUPABASE_URL?: string
  VITE_SUPABASE_ANON_KEY?: string
}

export interface SupabaseBrowserConfig {
  url: string
  anonKey: string
}

function normalizeEnvValue(value: string | undefined) {
  const trimmed = value?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : null
}

export function resolveSupabaseBrowserConfig(
  env: SupabaseBrowserEnv = import.meta.env as SupabaseBrowserEnv
): SupabaseBrowserConfig | null {
  const url = normalizeEnvValue(env.VITE_SUPABASE_URL)
  const anonKey = normalizeEnvValue(env.VITE_SUPABASE_ANON_KEY)
  if (!url || !anonKey) {
    return null
  }

  return {
    url,
    anonKey
  }
}

let browserClient: SupabaseClient | null = null

export function getSupabaseBrowserClient(
  env: SupabaseBrowserEnv = import.meta.env as SupabaseBrowserEnv
) {
  const config = resolveSupabaseBrowserConfig(env)
  if (!config) {
    return null
  }

  if (!browserClient) {
    browserClient = createClient(config.url, config.anonKey, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true
      }
    })
  }

  return browserClient
}
