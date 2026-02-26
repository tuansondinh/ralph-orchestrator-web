# Code Snippets Reference

Quick copy-paste reference for common patterns in the Ralph Orchestrator frontend.

---

## 1. Zustand Store Pattern

### Creating a Store
```typescript
import { create } from 'zustand'

interface MyStoreState {
  items: Record<string, MyItem[]>
  activeId: string | null
  setItems: (projectId: string, items: MyItem[]) => void
  setActiveId: (id: string | null) => void
}

export const useMyStore = create<MyStoreState>((set) => ({
  items: {},
  activeId: null,
  setItems: (projectId, items) =>
    set((state) => ({
      items: {
        ...state.items,
        [projectId]: items
      }
    })),
  setActiveId: (id) =>
    set((state) => ({
      activeId: id
    }))
}))
```

### Using a Store
```typescript
// Subscribe to specific state slice
const items = useMyStore((state) => state.items[projectId])
const setItems = useMyStore((state) => state.setItems)

// Call action
setItems(projectId, newItems)
```

---

## 2. Tailwind Button Patterns

### Primary Button
```tsx
<button
  className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm font-medium text-zinc-100 transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
  onClick={handleClick}
  disabled={isLoading}
  type="button"
>
  {isLoading ? 'Loading...' : 'Click me'}
</button>
```

### Secondary Button (Text only)
```tsx
<button
  className="text-sm text-zinc-300 hover:text-zinc-100 transition"
  onClick={handleClick}
  type="button"
>
  Cancel
</button>
```

### Link Button
```tsx
<button
  className="rounded-md px-3 py-2 text-sm hover:bg-zinc-800"
  onClick={handleClick}
  type="button"
>
  Open
</button>
```

---

## 3. Form Input Patterns

### Text Input
```tsx
<label className="space-y-1 text-sm text-zinc-300" htmlFor="my-input">
  <span>Label</span>
  <input
    id="my-input"
    aria-label="Input description"
    className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none ring-zinc-500 transition focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60"
    placeholder="Placeholder"
    value={value}
    onChange={(e) => setValue(e.target.value)}
    disabled={false}
  />
</label>
```

### Textarea
```tsx
<label className="space-y-1 text-sm text-zinc-300" htmlFor="my-textarea">
  <span>Message</span>
  <textarea
    id="my-textarea"
    aria-label="Message input"
    className="min-h-[96px] w-full rounded-md border border-zinc-700 bg-zinc-950 p-3 text-sm text-zinc-100 outline-none ring-zinc-500 transition focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60"
    placeholder="Type here..."
    value={value}
    onChange={(e) => setValue(e.target.value)}
    disabled={false}
  />
</label>
```

### Select
```tsx
<label className="text-sm text-zinc-400" htmlFor="my-select">
  Option
</label>
<select
  id="my-select"
  aria-label="Select option"
  className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
  value={selected}
  onChange={(e) => setSelected(e.target.value)}
  disabled={false}
>
  <option value="option1">Option 1</option>
  <option value="option2">Option 2</option>
</select>
```

---

## 4. Modal/Dialog Pattern

### Basic Modal
```tsx
{isOpen && (
  <div
    aria-label="Dialog title"
    aria-modal="true"
    className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 p-4 pt-24"
    onClick={onClose}
    role="dialog"
  >
    <section
      className="w-full max-w-lg space-y-3 rounded-lg border border-zinc-800 bg-zinc-900 p-4 shadow-2xl"
      onClick={(event) => event.stopPropagation()}
    >
      <header className="space-y-1">
        <h2 className="text-lg font-semibold">Title</h2>
        <p className="text-xs text-zinc-400">Subtitle or description</p>
      </header>

      {/* Content */}

      <div className="flex justify-end gap-2 pt-4">
        <button
          className="rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
          onClick={onClose}
          type="button"
        >
          Cancel
        </button>
        <button
          className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-800"
          onClick={handleConfirm}
          type="button"
        >
          Confirm
        </button>
      </div>
    </section>
  </div>
)}
```

---

## 5. Dropdown/Panel Pattern

### Position-Relative Dropdown
```tsx
const [isOpen, setIsOpen] = useState(false)

return (
  <div className="relative">
    <button
      className="rounded-md border border-zinc-800 px-2 py-2 text-zinc-200 hover:bg-zinc-900"
      onClick={() => setIsOpen(!isOpen)}
      type="button"
      aria-expanded={isOpen}
      aria-haspopup="menu"
    >
      Menu
    </button>

    {isOpen && (
      <section
        className="absolute z-40 mt-2 w-48 rounded-md border border-zinc-800 bg-zinc-950 p-2 shadow-xl right-0"
        role="menu"
      >
        <button
          className="w-full rounded-md border border-zinc-800 px-3 py-2 text-left text-sm hover:bg-zinc-900"
          onClick={() => {
            handleAction()
            setIsOpen(false)
          }}
          type="button"
        >
          Action 1
        </button>
        <button
          className="w-full rounded-md border border-zinc-800 px-3 py-2 text-left text-sm hover:bg-zinc-900"
          onClick={() => {
            handleAction()
            setIsOpen(false)
          }}
          type="button"
        >
          Action 2
        </button>
      </section>
    )}
  </div>
)
```

---

## 6. Loading Skeleton Pattern

### Pulse Animation
```tsx
<section className="space-y-2" data-testid="skeleton">
  <p className="text-sm text-zinc-500">Loading...</p>
  <div className="h-12 animate-pulse rounded-lg bg-zinc-900/60" />
  <div className="h-12 animate-pulse rounded-lg bg-zinc-900/50" />
  <div className="h-12 animate-pulse rounded-lg bg-zinc-900/40" />
</section>
```

---

## 7. List/Table Pattern

### Item List with Hover
```tsx
<ul className="space-y-2">
  {items.map((item) => (
    <li key={item.id}>
      <button
        className={`w-full rounded-md border px-3 py-2 text-left text-sm ${
          item.id === activeId
            ? 'border-zinc-500 bg-zinc-800 text-zinc-100'
            : 'border-zinc-800 text-zinc-200 hover:bg-zinc-800'
        }`}
        onClick={() => handleSelect(item.id)}
        type="button"
      >
        <span className="block font-medium">{item.name}</span>
        <span className="block truncate text-xs text-zinc-400">{item.description}</span>
      </button>
    </li>
  ))}
</ul>
```

---

## 8. Tab Navigation Pattern

### React Router NavLink
```tsx
import { NavLink } from 'react-router-dom'

const tabs = [
  { id: 'loops', label: 'Loops' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'terminal', label: 'Terminal' }
]

export function TabBar({ projectId }: { projectId: string }) {
  return (
    <nav aria-label="Project sections" className="flex flex-wrap gap-2">
      {tabs.map((tab) => (
        <NavLink
          key={tab.id}
          className={({ isActive }) =>
            `rounded-md px-3 py-2 text-sm transition-colors ${
              isActive
                ? 'bg-zinc-100 text-zinc-900'
                : 'border border-zinc-800 text-zinc-300 hover:bg-zinc-800'
            }`
          }
          to={`/project/${projectId}/${tab.id}`}
        >
          {tab.label}
        </NavLink>
      ))}
    </nav>
  )
}
```

---

## 9. WebSocket Hook Pattern

### Basic Usage
```tsx
const { isConnected, status, reconnectAttempt, send } = useWebSocket({
  channels: [`chat:${sessionId}:message`],
  onMessage: (message) => {
    if (message.type === 'chat.message') {
      // Handle message
      console.log(message)
    }
  }
})

return (
  <div className="flex items-center gap-2 text-xs text-zinc-400">
    <span>{isConnected ? 'Live connected' : 'Connecting...'}</span>
    {status === 'reconnecting' && <span>Attempt {reconnectAttempt}</span>}
  </div>
)
```

---

## 10. Keyboard Shortcut Hook Pattern

### Implementation
```tsx
import { useEffect } from 'react'

export function useKeyboardShortcuts({
  onQuickSwitcher,
  onEscape
}: {
  onQuickSwitcher?: () => void
  onEscape?: () => void
}) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Skip in editable elements
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return
      }

      if (event.key === 'Escape') {
        onEscape?.()
        return
      }

      // Cmd/Ctrl+K
      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        onQuickSwitcher?.()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [onQuickSwitcher, onEscape])
}
```

### Usage
```tsx
useKeyboardShortcuts({
  onQuickSwitcher: () => setIsOpen(true),
  onEscape: () => setIsOpen(false)
})
```

---

## 11. Error Display Pattern

### Inline Error
```tsx
{error && (
  <p className="text-sm text-red-400">{error}</p>
)}
```

### Error Banner
```tsx
{error && (
  <section className="rounded-lg border border-red-900/50 bg-red-950/40 p-3 text-sm text-red-300">
    {error}
  </section>
)}
```

---

## 12. tRPC API Call Pattern

### In a Hook
```tsx
import { chatApi } from '@/lib/chatApi'

useEffect(() => {
  let cancelled = false

  chatApi
    .getHistory({ sessionId })
    .then((history) => {
      if (!cancelled) {
        setMessages(history)
      }
    })
    .catch((error) => {
      if (!cancelled) {
        setError(error.message)
      }
    })

  return () => {
    cancelled = true
  }
}, [sessionId])
```

### In an Event Handler
```tsx
const handleSend = async () => {
  try {
    await chatApi.sendMessage({
      sessionId,
      message: inputValue
    })
    setInputValue('')
  } catch (error) {
    setError(error instanceof Error ? error.message : 'Failed to send')
  }
}
```

---

## 13. Responsive Layout Pattern

### Mobile-First Grid
```tsx
<div className="grid h-screen grid-cols-1 overflow-hidden bg-zinc-950 md:grid-cols-[auto_1fr]">
  <aside className="hidden md:block md:w-72 border-r border-zinc-800 overflow-y-auto p-4">
    {/* Sidebar - hidden on mobile */}
  </aside>
  <main className="min-h-0 min-w-0 flex flex-col overflow-hidden p-6">
    {/* Main content */}
  </main>
</div>
```

---

## 14. Optimistic Update Pattern

### In Zustand Store
```typescript
const upsertMessage = (message: ChatMessageRecord) =>
  set((state) => {
    const current = state.messagesBySession[message.sessionId] ?? []
    const existingIndex = current.findIndex((m) => m.id === message.id)

    if (existingIndex >= 0) {
      // Update existing
      const nextMessages = [...current]
      nextMessages[existingIndex] = message
      return {
        messagesBySession: {
          ...state.messagesBySession,
          [message.sessionId]: nextMessages
        }
      }
    }

    // Add new
    return {
      messagesBySession: {
        ...state.messagesBySession,
        [message.sessionId]: [...current, message]
      }
    }
  })
```

### In Component
```tsx
// 1. Add optimistic message
upsertMessage({
  id: `local-${Date.now()}`,
  sessionId,
  role: 'user',
  content: message,
  timestamp: Date.now()
})

// 2. Clear input
setInputValue('')

// 3. Send to server
try {
  await chatApi.sendMessage({ sessionId, message })
} catch (error) {
  // Optimistic message stays, user sees error
  setError(error.message)
}
```

---

## 15. useCallback Dependency Pattern

### Correct Usage
```tsx
const sendMessage = useCallback(async () => {
  if (!sessionId || !canSend) {
    return
  }

  await chatApi.sendMessage({
    sessionId,
    message: inputValue
  })
}, [canSend, sessionId, inputValue]) // All external deps included
```

### Ref Pattern (to avoid unnecessary dependencies)
```tsx
const onMessageRef = useRef(onMessage)

useEffect(() => {
  onMessageRef.current = onMessage // Update ref without triggering effect
}, [onMessage])

useEffect(() => {
  // Use ref instead of onMessage in dependency array
  const handler = () => {
    onMessageRef.current({ /* ... */ })
  }

  window.addEventListener('message', handler)
  return () => window.removeEventListener('message', handler)
}, []) // No dependencies needed
```

---

## 16. Portal/Overlay Positioning

### Fixed Overlay (Full Screen)
```tsx
className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
```

### Fixed Bottom Drawer
```tsx
className="fixed bottom-0 left-0 right-0 z-40 max-h-[50vh] overflow-hidden"
```

### Absolute Dropdown (from trigger)
```tsx
className="absolute z-40 mt-2 right-0 w-48 rounded-md border bg-zinc-950"
```

### Z-Index Reference
- Modals: 50
- Dropdowns/Panels: 40
- Overlays: 30-40
- Behind overlay: < 30

---

## 17. Text Truncation Pattern

### Single Line
```tsx
<span className="truncate">{longText}</span>
```

### Multi-line Ellipsis
```tsx
<p className="line-clamp-2">{longText}</p>
```

---

## 18. Loading State Pattern

### Button with Loading State
```tsx
const isSubmitting = isLoading || isSending

<button
  className="... disabled:cursor-not-allowed disabled:opacity-60"
  disabled={isSubmitting}
  onClick={handleSubmit}
  type="button"
>
  {isSubmitting ? 'Sending...' : 'Send'}
</button>
```

---

## 19. Conditional Rendering

### Safe Null Rendering
```tsx
{condition ? (
  <Component />
) : null}

// NOT: {condition && <Component />} for safety with falsy values
```

---

## 20. SVG Icon Pattern

### Inline SVG
```tsx
<svg
  aria-hidden="true"
  className="h-5 w-5"
  fill="none"
  viewBox="0 0 24 24"
  xmlns="http://www.w3.org/2000/svg"
>
  <path
    d="M15 17H9M18 17H6l1.3-1.5..."
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth="1.8"
  />
</svg>
```

Always use `currentColor` for stroke/fill to inherit text color.
