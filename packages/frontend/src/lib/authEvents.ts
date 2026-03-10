type UnauthorizedListener = () => void

const unauthorizedListeners = new Set<UnauthorizedListener>()

export function subscribeToUnauthorized(listener: UnauthorizedListener) {
  unauthorizedListeners.add(listener)

  return () => {
    unauthorizedListeners.delete(listener)
  }
}

export function notifyUnauthorized() {
  for (const listener of unauthorizedListeners) {
    listener()
  }
}
