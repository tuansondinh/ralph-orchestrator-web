import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'
import type { FastifyRequest, FastifyReply } from 'fastify'

let supabase: SupabaseClient | null = null

export function initSupabaseAuth(url: string, anonKey: string): void {
  supabase = createClient(url, anonKey)
}

export function getSupabaseClient(): SupabaseClient | null {
  return supabase
}

export async function verifySupabaseToken(token: string): Promise<User> {
  if (!supabase) {
    throw new Error('Supabase auth not initialized')
  }
  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user) {
    throw new Error('Invalid or expired token')
  }
  return data.user
}

export async function supabaseAuthHook(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    reply.code(401).send({ error: 'Missing authorization token' })
    return
  }
  const token = authHeader.slice(7)
  try {
    const user = await verifySupabaseToken(token)
    ;(request as any).userId = user.id
    ;(request as any).supabaseUser = user
  } catch {
    reply.code(401).send({ error: 'Invalid or expired token' })
  }
}
