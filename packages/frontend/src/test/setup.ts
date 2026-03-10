import '@testing-library/jest-dom/vitest'

type MatchMediaListener = (event: MediaQueryListEvent) => void

if (!window.matchMedia) {
  const mediaState = new Map<string, boolean>()
  const mediaListeners = new Map<string, Set<MatchMediaListener>>()

  const getListeners = (query: string) => {
    const listeners = mediaListeners.get(query)
    if (listeners) {
      return listeners
    }

    const nextListeners = new Set<MatchMediaListener>()
    mediaListeners.set(query, nextListeners)
    return nextListeners
  }

  Object.defineProperty(window, '__matchMediaController', {
    writable: true,
    value: {
      set(query: string, matches: boolean) {
        mediaState.set(query, matches)
        const event = {
          matches,
          media: query
        } as MediaQueryListEvent

        for (const listener of getListeners(query)) {
          listener(event)
        }
      }
    }
  })

  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => {
      const getMatches = () => mediaState.get(query) ?? false
      const legacyListeners = new Map<
        MatchMediaListener,
        MatchMediaListener
      >()

      return {
        get matches() {
          return getMatches()
        },
        media: query,
        onchange: null,
        addListener(listener: MatchMediaListener) {
          const wrappedListener: MatchMediaListener = (event) => {
            listener(event)
          }

          legacyListeners.set(listener, wrappedListener)
          getListeners(query).add(wrappedListener)
        },
        removeListener(listener: MatchMediaListener) {
          const wrappedListener = legacyListeners.get(listener)
          if (!wrappedListener) {
            return
          }

          getListeners(query).delete(wrappedListener)
          legacyListeners.delete(listener)
        },
        addEventListener(_type: string, listener: MatchMediaListener) {
          getListeners(query).add(listener)
        },
        removeEventListener(_type: string, listener: MatchMediaListener) {
          getListeners(query).delete(listener)
        },
        dispatchEvent: () => false
      }
    }
  })
}

if (typeof globalThis.ResizeObserver === 'undefined') {
  class ResizeObserver {
    observe() { }
    unobserve() { }
    disconnect() { }
  }
  globalThis.ResizeObserver = ResizeObserver
}
