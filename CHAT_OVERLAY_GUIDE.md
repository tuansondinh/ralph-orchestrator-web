# Chat Overlay Implementation Guide

Quick reference for building a chat overlay component in the Ralph Orchestrator frontend.

---

## 1. Component Structure

### Create New Files

```
src/components/chat/
├── ChatOverlay.tsx          (NEW - main overlay container)
├── ChatOverlayContent.tsx   (NEW - resizable content)
├── ChatView.tsx             (EXISTING - will be modified or reused)
├── ChatInput.tsx            (EXISTING - can be reused)
└── MessageList.tsx          (EXISTING - can be reused)
```

### ChatOverlay Component Structure

```typescript
// src/components/chat/ChatOverlay.tsx
interface ChatOverlayProps {
  projectId: string
  isOpen: boolean
  onClose: () => void
}

export function ChatOverlay({ projectId, isOpen, onClose }: ChatOverlayProps) {
  // Bottom drawer implementation
  return (
    <div className="fixed inset-0 z-40 pointer-events-none">
      {isOpen && (
        <div
          className="absolute bottom-0 left-0 right-0 pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <ChatOverlayContent
            projectId={projectId}
            onClose={onClose}
          />
        </div>
      )}
    </div>
  )
}
```

---

## 2. State Management

### Option A: Extend chatStore
Add overlay visibility to chatStore:

```typescript
// src/stores/chatStore.ts - ADD:
interface ChatStoreState {
  // ... existing
  overlayOpenByProject: Record<string, boolean>
  setOverlayOpen: (projectId: string, open: boolean) => void
}

export const useChatStore = create<ChatStoreState>((set) => ({
  // ... existing
  overlayOpenByProject: {},
  setOverlayOpen: (projectId, open) =>
    set((state) => ({
      overlayOpenByProject: {
        ...state.overlayOpenByProject,
        [projectId]: open
      }
    }))
}))
```

### Option B: Separate overlayStore (Cleaner)
```typescript
// src/stores/overlayStore.ts (NEW)
import { create } from 'zustand'

interface OverlayStoreState {
  openOverlaysByProject: Record<string, Set<string>> // projectId -> set of overlay names
  setOverlayOpen: (projectId: string, overlayName: string, open: boolean) => void
}

export const useOverlayStore = create<OverlayStoreState>((set) => ({
  openOverlaysByProject: {},
  setOverlayOpen: (projectId, overlayName, open) =>
    set((state) => {
      const current = state.openOverlaysByProject[projectId] ?? new Set()
      const next = new Set(current)
      if (open) {
        next.add(overlayName)
      } else {
        next.delete(overlayName)
      }
      return {
        openOverlaysByProject: {
          ...state.openOverlaysByProject,
          [projectId]: next
        }
      }
    })
}))

// Usage:
const isChatOverlayOpen = useOverlayStore((state) =>
  state.openOverlaysByProject[projectId]?.has('chat') ?? false
)
const setOverlayOpen = useOverlayStore((state) => state.setOverlayOpen)
setOverlayOpen(projectId, 'chat', true)
```

---

## 3. Keyboard Shortcut Integration

### Add to useKeyboardShortcuts

```typescript
// src/hooks/useKeyboardShortcuts.ts - MODIFY:
interface UseKeyboardShortcutsOptions {
  // ... existing
  onToggleChatOverlay?: () => void  // NEW
}

export function useKeyboardShortcuts({
  // ... existing params
  onToggleChatOverlay
}: UseKeyboardShortcutsOptions) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // ... existing checks (terminal, editable)

      if (event.key === 'Escape') {
        onEscape?.()
        return
      }

      // ... existing checks

      // NEW: Cmd+Shift+C for chat overlay toggle
      if (hasCommandModifier(event) && event.shiftKey && event.key.toLowerCase() === 'c') {
        event.preventDefault()
        onToggleChatOverlay?.()
        return
      }
    }
    // ... rest of implementation
  }, [/* deps + onToggleChatOverlay */])
}
```

### Update App.tsx

```typescript
// src/App.tsx - in AppRoutes component
const [isChatOverlayOpen, setIsChatOverlayOpen] = useState(false)

useKeyboardShortcuts({
  onQuickSwitcher: () => { /* ... */ },
  onToggleChatOverlay: () => {
    setIsChatOverlayOpen((prev) => !prev)
  },
  // ... other shortcuts
})

return (
  <AppShell>
    {/* ... existing content */}
    <ChatOverlay
      projectId={activeProjectId ?? ''}
      isOpen={isChatOverlayOpen && Boolean(activeRouteProjectId)}
      onClose={() => setIsChatOverlayOpen(false)}
    />
  </AppShell>
)
```

---

## 4. WebSocket Integration

### ChatOverlay Already Gets WebSocket Automatically

The existing ChatView component handles WebSocket connections:

```typescript
// src/components/chat/ChatView.tsx - EXISTING:
const { isConnected } = useWebSocket({
  channels: [`chat:${sessionId}:message`],
  onMessage: handleWebsocketMessage
})
```

When you render ChatView inside ChatOverlay, WebSocket just works because:
1. sessionId comes from Zustand store
2. useWebSocket hook subscribes to the right channels
3. Messages are stored in chatStore (shared state)

**No changes needed** - reuse existing WebSocket setup.

---

## 5. Styling the Bottom Drawer

### Full Implementation Example

```typescript
// src/components/chat/ChatOverlay.tsx
import { useRef, useState } from 'react'
import { ChatView } from './ChatView'

interface ChatOverlayProps {
  projectId: string
  isOpen: boolean
  onClose: () => void
}

export function ChatOverlay({ projectId, isOpen, onClose }: ChatOverlayProps) {
  const [height, setHeight] = useState(400) // pixels
  const [isDragging, setIsDragging] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleMouseDown = () => {
    setIsDragging(true)
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging || !containerRef.current) return

    const newHeight = window.innerHeight - e.clientY
    setHeight(Math.max(300, Math.min(newHeight, window.innerHeight - 100)))
  }

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-30"
          onClick={onClose}
        />
      )}

      <div
        ref={containerRef}
        className={`fixed bottom-0 left-0 right-0 z-40 bg-zinc-900 border-t border-zinc-800 transition-all duration-200 ${
          isOpen ? 'translate-y-0' : 'translate-y-full'
        }`}
        style={{ height: isOpen ? height : 0 }}
      >
        {/* Drag Handle */}
        <div
          className="h-1 bg-zinc-700 hover:bg-zinc-600 cursor-row-resize"
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onMouseMove={handleMouseMove as any}
        />

        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 p-4">
          <h2 className="text-lg font-semibold text-zinc-100">Chat</h2>
          <button
            className="rounded-md border border-zinc-700 px-2 py-1 text-sm text-zinc-300 hover:bg-zinc-800"
            onClick={onClose}
            type="button"
          >
            Close
          </button>
        </div>

        {/* Content - Scrollable */}
        <div className="overflow-hidden h-[calc(100%-3rem)]">
          <div className="h-full overflow-y-auto p-4">
            <ChatView projectId={projectId} />
          </div>
        </div>
      </div>
    </>
  )
}
```

### Alternative: Non-Resizable Fixed Height

If you want simpler styling without drag-to-resize:

```tsx
<div
  className={`fixed bottom-0 left-0 right-0 z-40 max-h-[50vh] bg-zinc-900 border-t border-zinc-800 transition-transform duration-200 ${
    isOpen ? 'translate-y-0' : 'translate-y-full'
  }`}
>
  {/* header + content */}
</div>
```

---

## 6. Overlay Container in App Layout

### Placement in App.tsx

```typescript
export default function App() {
  useEffect(() => {
    document.documentElement.classList.add('dark')
  }, [])

  return (
    <BrowserRouter>
      <AppRoutes />
      {/* ChatOverlay renders at root level, above all other content */}
      {/* positioning and z-index handle stacking */}
    </BrowserRouter>
  )
}
```

The overlay should be rendered:
- At the root level (inside or after AppRoutes)
- Or inside AppShell after children
- Position: fixed (so it overlays the whole viewport)

---

## 7. Edge Cases & UX Considerations

### Auto-Close on Route Change
```typescript
// src/components/chat/ChatOverlay.tsx
useEffect(() => {
  onClose() // close drawer when navigating away
}, [activeRouteProjectId])
```

### Prevent Scroll Leak
```typescript
useEffect(() => {
  if (isOpen) {
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }
}, [isOpen])
```

### Mobile Layout
For mobile, use full-height drawer:
```tsx
className={`fixed bottom-0 left-0 right-0 z-40
  max-h-[85vh] md:max-h-[50vh]  /* 85% on mobile, 50% on desktop */
  ${isOpen ? 'translate-y-0' : 'translate-y-full'}`}
```

### Session Management
The overlay reuses existing chat sessions:
- If session exists in store → shows chat history
- If no session → shows "Start session" button
- WebSocket updates flow to overlay automatically

---

## 8. Implementation Checklist

- [ ] Create `src/stores/overlayStore.ts` (or extend chatStore)
- [ ] Create `src/components/chat/ChatOverlay.tsx`
- [ ] Add keyboard shortcut to `useKeyboardShortcuts` hook
- [ ] Update `src/App.tsx` to render ChatOverlay
- [ ] Update `src/App.tsx` to call keyboard shortcut handler
- [ ] Test WebSocket message flow in overlay
- [ ] Test keyboard shortcut (Cmd+Shift+C)
- [ ] Test auto-close on route change
- [ ] Test responsive layout (mobile vs desktop)
- [ ] Test z-index stacking with modals (ProjectSwitcherDialog at z-50)

---

## 9. File References

**Files to Create:**
- `/packages/frontend/src/components/chat/ChatOverlay.tsx`
- `/packages/frontend/src/stores/overlayStore.ts` (optional, if using Option B)

**Files to Modify:**
- `/packages/frontend/src/App.tsx` - render overlay + handle keyboard shortcut
- `/packages/frontend/src/hooks/useKeyboardShortcuts.ts` - add new shortcut
- `/packages/frontend/src/stores/chatStore.ts` OR `/packages/frontend/src/stores/overlayStore.ts`

**Reuse Existing:**
- `/packages/frontend/src/components/chat/ChatView.tsx` - logic unchanged
- `/packages/frontend/src/components/chat/ChatInput.tsx` - already styled
- `/packages/frontend/src/components/chat/MessageList.tsx` - already styled
- `/packages/frontend/src/hooks/useWebSocket.ts` - WebSocket handling automatic

---

## 10. Design System Reference

### Tailwind Classes
- **Dark background:** `bg-zinc-900`, `bg-zinc-950`
- **Borders:** `border-zinc-800`, `border-zinc-700`
- **Text:** `text-zinc-100` (primary), `text-zinc-300` (secondary), `text-zinc-400` (muted)
- **Hover:** `hover:bg-zinc-800`
- **Focus:** `focus:ring-2 ring-zinc-500`
- **Transitions:** `transition-all duration-200`
- **Z-indices:** Modals (50), Dropdowns (40), Overlays (40), Behind overlay (30)

### Icon Patterns
- Use inline SVG (see NotificationCenter.tsx for example)
- Or use text labels
- Close button: text "Close" or "✕" SVG

### Spacing
- Padding inside drawer: `p-4`
- Gap between items: `gap-3` or `gap-2`
- Border thickness: `border` (1px)

---

## Quick Start Code

Minimal example to get started:

```typescript
// src/components/chat/ChatOverlay.tsx
import { ChatView } from './ChatView'

interface ChatOverlayProps {
  projectId: string
  isOpen: boolean
  onClose: () => void
}

export function ChatOverlay({ projectId, isOpen, onClose }: ChatOverlayProps) {
  return isOpen ? (
    <div className="fixed bottom-0 left-0 right-0 z-40 max-h-[50vh] overflow-hidden flex flex-col bg-zinc-900 border-t border-zinc-800">
      <div className="flex justify-between items-center p-4 border-b border-zinc-800">
        <h2 className="text-lg font-semibold">Chat</h2>
        <button onClick={onClose} className="text-zinc-400 hover:text-zinc-100">✕</button>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        <ChatView projectId={projectId} />
      </div>
    </div>
  ) : null
}
```

Then in App.tsx:
```typescript
const [isChatOverlayOpen, setIsChatOverlayOpen] = useState(false)

// ... in render:
<ChatOverlay
  projectId={activeRouteProjectId ?? ''}
  isOpen={isChatOverlayOpen && !!activeRouteProjectId}
  onClose={() => setIsChatOverlayOpen(false)}
/>
```

Done! WebSocket and state management work automatically.
