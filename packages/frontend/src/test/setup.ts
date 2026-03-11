import '@testing-library/jest-dom/vitest'

type MatchMediaListener = (event: MediaQueryListEvent) => void

declare global {
  interface Window {
    __matchMediaController?: {
      setMatches: (query: string, matches: boolean) => void
      reset: () => void
    }
  }
}

const mediaQueryState = new Map<string, boolean>()
const mediaQueryListeners = new Map<string, Set<MatchMediaListener>>()

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => {
    const getMatches = () => mediaQueryState.get(query) ?? false

    return {
      get matches() {
        return getMatches()
      },
      media: query,
      onchange: null,
      addListener: (listener: MatchMediaListener) => {
        const listeners = mediaQueryListeners.get(query) ?? new Set<MatchMediaListener>()
        listeners.add(listener)
        mediaQueryListeners.set(query, listeners)
      },
      removeListener: (listener: MatchMediaListener) => {
        mediaQueryListeners.get(query)?.delete(listener)
      },
      addEventListener: (_type: string, listener: MatchMediaListener) => {
        const listeners = mediaQueryListeners.get(query) ?? new Set<MatchMediaListener>()
        listeners.add(listener)
        mediaQueryListeners.set(query, listeners)
      },
      removeEventListener: (_type: string, listener: MatchMediaListener) => {
        mediaQueryListeners.get(query)?.delete(listener)
      },
      dispatchEvent: () => false
    }
  }
})

window.__matchMediaController = {
  setMatches(query: string, matches: boolean) {
    mediaQueryState.set(query, matches)
    const event = { matches, media: query } as MediaQueryListEvent
    mediaQueryListeners.get(query)?.forEach((listener) => {
      listener(event)
    })
  },
  reset() {
    mediaQueryState.clear()
    mediaQueryListeners.clear()
  }
}

if (typeof globalThis.ResizeObserver === 'undefined') {
  class ResizeObserver {
    observe() { }
    unobserve() { }
    disconnect() { }
  }
  globalThis.ResizeObserver = ResizeObserver
}
