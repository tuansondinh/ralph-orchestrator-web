import { useEffect, useState } from 'react'

function getInitialMatch(query: string) {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false
  }

  return window.matchMedia(query).matches
}

export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => getInitialMatch(query))

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      setMatches(false)
      return
    }

    const mediaQueryList = window.matchMedia(query)
    const updateMatches = (event: MediaQueryListEvent | MediaQueryList) => {
      setMatches(event.matches)
    }

    updateMatches(mediaQueryList)

    if (typeof mediaQueryList.addEventListener === 'function') {
      mediaQueryList.addEventListener('change', updateMatches)

      return () => {
        mediaQueryList.removeEventListener('change', updateMatches)
      }
    }

    mediaQueryList.addListener(updateMatches)

    return () => {
      mediaQueryList.removeListener(updateMatches)
    }
  }, [query])

  return matches
}
