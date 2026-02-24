function stripTrailingSlash(value: string) {
  return value.replace(/\/+$/, '')
}

function isLoopbackHost(hostname: string) {
  const normalized = hostname.trim().toLowerCase()
  return (
    normalized === 'localhost' ||
    normalized === '127.0.0.1' ||
    normalized === '::1' ||
    normalized === '[::1]'
  )
}

function normalizeOrigin(origin: string) {
  try {
    const parsed = new URL(origin)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null
    }

    parsed.pathname = ''
    parsed.search = ''
    parsed.hash = ''
    return stripTrailingSlash(parsed.toString())
  } catch {
    return null
  }
}

export function parseAllowedOrigins(raw: string | undefined) {
  const parsed = new Set<string>()
  if (!raw) {
    return parsed
  }

  for (const candidate of raw.split(',')) {
    const normalized = normalizeOrigin(candidate.trim())
    if (normalized) {
      parsed.add(normalized)
    }
  }

  return parsed
}

export function isOriginAllowed(
  origin: string | undefined,
  configured = parseAllowedOrigins(process.env.RALPH_UI_ALLOWED_ORIGINS)
) {
  if (!origin) {
    // Non-browser clients (tests, curl, local tooling) may omit Origin.
    return true
  }

  const normalized = normalizeOrigin(origin)
  if (!normalized) {
    return false
  }

  try {
    const parsed = new URL(normalized)
    if (isLoopbackHost(parsed.hostname)) {
      return true
    }
  } catch {
    return false
  }

  return configured.has(normalized)
}
