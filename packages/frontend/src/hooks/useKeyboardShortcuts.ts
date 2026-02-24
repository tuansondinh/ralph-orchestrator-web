import { useEffect } from 'react'

interface UseKeyboardShortcutsOptions {
  onQuickSwitcher?: () => void
  onNewProject?: () => void
  onSwitchTab?: (tabNumber: 1 | 2 | 3 | 4) => void
  onEscape?: () => void
}

function hasCommandModifier(event: KeyboardEvent) {
  return event.metaKey || event.ctrlKey
}

export function useKeyboardShortcuts({
  onQuickSwitcher,
  onNewProject,
  onSwitchTab,
  onEscape
}: UseKeyboardShortcutsOptions) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onEscape?.()
        return
      }

      if (!hasCommandModifier(event) || event.altKey) {
        return
      }

      const key = event.key.toLowerCase()
      if (key === 'k') {
        event.preventDefault()
        onQuickSwitcher?.()
        return
      }

      if (key === 'n') {
        event.preventDefault()
        onNewProject?.()
        return
      }

      if (key === '1' || key === '2' || key === '3' || key === '4') {
        event.preventDefault()
        onSwitchTab?.(Number.parseInt(key, 10) as 1 | 2 | 3 | 4)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [onEscape, onNewProject, onQuickSwitcher, onSwitchTab])
}
