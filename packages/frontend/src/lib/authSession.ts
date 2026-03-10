let authAccessToken: string | null = null

function normalizeAccessToken(accessToken: string | null | undefined) {
  const trimmed = accessToken?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : null
}

export function setAuthAccessToken(accessToken: string | null | undefined) {
  authAccessToken = normalizeAccessToken(accessToken)
}

export function getAuthAccessToken() {
  return authAccessToken
}

export function resolveAuthorizedHeaders(headers?: HeadersInit) {
  const nextHeaders = new Headers(headers)
  const accessToken = getAuthAccessToken()
  if (accessToken) {
    nextHeaders.set('authorization', `Bearer ${accessToken}`)
  }

  return Object.fromEntries(nextHeaders.entries())
}
