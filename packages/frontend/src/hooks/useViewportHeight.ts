import { useEffect, useState } from 'react'

function readViewportHeight() {
  if (typeof window === 'undefined') {
    return null
  }

  return Math.round(window.visualViewport?.height ?? window.innerHeight)
}

export function useViewportHeight() {
  const [viewportHeight, setViewportHeight] = useState<number | null>(() => readViewportHeight())

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined
    }

    const updateViewportHeight = () => {
      setViewportHeight(readViewportHeight())
    }

    updateViewportHeight()
    window.visualViewport?.addEventListener('resize', updateViewportHeight)
    window.addEventListener('resize', updateViewportHeight)

    return () => {
      window.visualViewport?.removeEventListener('resize', updateViewportHeight)
      window.removeEventListener('resize', updateViewportHeight)
    }
  }, [])

  return viewportHeight
}
