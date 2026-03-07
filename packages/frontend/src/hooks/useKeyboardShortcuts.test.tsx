import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'

function fireKeydown(overrides: Partial<KeyboardEvent> = {}) {
  const event = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    key: '',
    ...overrides
  })
  window.dispatchEvent(event)
  return event
}

describe('useKeyboardShortcuts', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('calls onQuickSwitcher when Cmd+K is pressed', () => {
    const onQuickSwitcher = vi.fn()
    renderHook(() => useKeyboardShortcuts({ onQuickSwitcher }))
    fireKeydown({ key: 'k', metaKey: true })
    expect(onQuickSwitcher).toHaveBeenCalledOnce()
  })

  it('calls onNewProject when Cmd+N is pressed', () => {
    const onNewProject = vi.fn()
    renderHook(() => useKeyboardShortcuts({ onNewProject }))
    fireKeydown({ key: 'n', metaKey: true })
    expect(onNewProject).toHaveBeenCalledOnce()
  })

  it('calls onToggleChatOverlay when Cmd+Shift+C is pressed', () => {
    const onToggleChatOverlay = vi.fn()
    renderHook(() => useKeyboardShortcuts({ onToggleChatOverlay }))
    fireKeydown({ key: 'c', metaKey: true, shiftKey: true })
    expect(onToggleChatOverlay).toHaveBeenCalledOnce()
  })

  it('calls onSwitchTab with the tab number for Cmd+1 through Cmd+4', () => {
    const onSwitchTab = vi.fn()
    renderHook(() => useKeyboardShortcuts({ onSwitchTab }))
    fireKeydown({ key: '1', metaKey: true })
    fireKeydown({ key: '3', metaKey: true })
    expect(onSwitchTab).toHaveBeenCalledTimes(2)
    expect(onSwitchTab).toHaveBeenNthCalledWith(1, 1)
    expect(onSwitchTab).toHaveBeenNthCalledWith(2, 3)
  })

  it('calls onEscape when Escape key is pressed (no modifier needed)', () => {
    const onEscape = vi.fn()
    renderHook(() => useKeyboardShortcuts({ onEscape }))
    fireKeydown({ key: 'Escape' })
    expect(onEscape).toHaveBeenCalledOnce()
  })

  it('ignores shortcuts when target is an input element', () => {
    const onQuickSwitcher = vi.fn()
    renderHook(() => useKeyboardShortcuts({ onQuickSwitcher }))

    const input = document.createElement('input')
    document.body.appendChild(input)

    const event = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      metaKey: true,
      key: 'k'
    })
    Object.defineProperty(event, 'target', { value: input, writable: false })
    window.dispatchEvent(event)

    expect(onQuickSwitcher).not.toHaveBeenCalled()
    document.body.removeChild(input)
  })

  it('ignores shortcuts when target is a textarea element', () => {
    const onNewProject = vi.fn()
    renderHook(() => useKeyboardShortcuts({ onNewProject }))

    const textarea = document.createElement('textarea')
    document.body.appendChild(textarea)

    const event = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      metaKey: true,
      key: 'n'
    })
    Object.defineProperty(event, 'target', { value: textarea, writable: false })
    window.dispatchEvent(event)

    expect(onNewProject).not.toHaveBeenCalled()
    document.body.removeChild(textarea)
  })

  it('does not fire without Cmd/Ctrl modifier for most shortcuts', () => {
    const onQuickSwitcher = vi.fn()
    renderHook(() => useKeyboardShortcuts({ onQuickSwitcher }))
    fireKeydown({ key: 'k', metaKey: false, ctrlKey: false })
    expect(onQuickSwitcher).not.toHaveBeenCalled()
  })

  it('removes event listener on unmount (no callback after unmount)', () => {
    const onQuickSwitcher = vi.fn()
    const { unmount } = renderHook(() => useKeyboardShortcuts({ onQuickSwitcher }))
    unmount()
    fireKeydown({ key: 'k', metaKey: true })
    expect(onQuickSwitcher).not.toHaveBeenCalled()
  })

  it('multiple shortcuts can be registered simultaneously', () => {
    const onQuickSwitcher = vi.fn()
    const onNewProject = vi.fn()
    const onEscape = vi.fn()
    renderHook(() => useKeyboardShortcuts({ onQuickSwitcher, onNewProject, onEscape }))

    fireKeydown({ key: 'k', metaKey: true })
    fireKeydown({ key: 'n', metaKey: true })
    fireKeydown({ key: 'Escape' })

    expect(onQuickSwitcher).toHaveBeenCalledOnce()
    expect(onNewProject).toHaveBeenCalledOnce()
    expect(onEscape).toHaveBeenCalledOnce()
  })
})
