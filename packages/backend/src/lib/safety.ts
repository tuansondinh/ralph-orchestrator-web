function normalizeHost(host: string) {
  const trimmed = host.trim().toLowerCase()
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

function parseBoolean(value: string | undefined) {
  if (!value) {
    return false
  }

  const normalized = value.trim().toLowerCase()
  return normalized === '1' || normalized === 'true' || normalized === 'yes'
}

export function resolveBindHost() {
  return process.env.RALPH_UI_BIND_HOST ?? '127.0.0.1'
}

export function isLoopbackBindHost(host = resolveBindHost()) {
  const normalized = normalizeHost(host)
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1'
}

export function allowsDangerousOperations() {
  if (isLoopbackBindHost()) {
    return true
  }

  return parseBoolean(process.env.RALPH_UI_ALLOW_REMOTE_UNSAFE_OPS)
}

export function getDangerousOperationBlockMessage(operation: string) {
  return `${operation} is disabled when backend bind host is non-loopback. Set RALPH_UI_ALLOW_REMOTE_UNSAFE_OPS=1 to override.`
}
