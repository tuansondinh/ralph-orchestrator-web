type SessionLike = {
  access_token?: string | null
}

let cachedAccessToken: string | null = null

export function setCachedAccessToken(session: SessionLike | null) {
  cachedAccessToken = session?.access_token ?? null
}

export function getCachedAccessToken() {
  return cachedAccessToken
}

export function resetCachedAccessToken() {
  cachedAccessToken = null
}
