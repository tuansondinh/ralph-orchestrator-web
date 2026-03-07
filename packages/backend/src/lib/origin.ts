function stripTrailingSlash(value: string) {
  return value.replace(/\/+$/, '')
}

function stripDefaultPort(host: string) {
  if (host.endsWith(':80')) {
    return host.slice(0, -3)
  }

  if (host.endsWith(':443')) {
    return host.slice(0, -4)
  }

  return host
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

function normalizeRequestHost(value: string) {
  const trimmed = value.trim().toLowerCase()
  if (!trimmed) {
    return null
  }

  const withoutScheme = trimmed.replace(/^[a-z]+:\/\//, '')
  const host = withoutScheme.split('/')[0]
  if (!host) {
    return null
  }

  return stripDefaultPort(host)
}

function normalizeOriginHost(origin: string) {
  try {
    const parsed = new URL(origin)
    return stripDefaultPort(parsed.host.toLowerCase())
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

export function parseRequestHosts(rawHosts: Array<string | undefined>) {
  const hosts = new Set<string>()

  for (const rawHost of rawHosts) {
    if (!rawHost) {
      continue
    }

    for (const candidate of rawHost.split(',')) {
      const normalized = normalizeRequestHost(candidate)
      if (normalized) {
        hosts.add(normalized)
      }
    }
  }

  return hosts
}

export function isOriginAllowed(
  origin: string | undefined,
  configured = parseAllowedOrigins(process.env.RALPH_UI_ALLOWED_ORIGINS),
  requestHosts = new Set<string>()
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

  const originHost = normalizeOriginHost(normalized)
  if (originHost && requestHosts.has(originHost)) {
    return true
  }

  return configured.has(normalized)
}
