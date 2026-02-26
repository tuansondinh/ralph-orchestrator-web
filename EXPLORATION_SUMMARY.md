# Ralph Orchestrator Frontend Exploration - Complete Summary

**Date:** February 25, 2026
**Location:** `/Users/sonwork/Workspace/ralph-orchestrator-web/packages/frontend`
**Total Frontend Code:** 11,662 lines of TypeScript/React

---

## Executive Summary

The Ralph Orchestrator frontend is a modern React + TypeScript application built with Vite and Tailwind CSS. It provides a project management interface with real-time chat, terminal integration, and monitoring capabilities. The architecture uses domain-specific Zustand stores for state management and WebSocket connections for real-time updates.

**Key Insight:** Chat is currently embedded as a tab view, NOT as a floating overlay. To implement a chat overlay, you'll need to create a new bottom-drawer component following the existing modal patterns.

---

## 1. Technology Stack

### Core Framework
```
React 19.2.4
TypeScript 5.9.3
Vite 7.3.1 (dev server: port 5174)
```

### State & Data Fetching
```
Zustand 5.0.11        → Client state (stores)
tRPC 11.10.0          → Type-safe API calls
React Query 5.90.21   → Data caching/synchronization
```

### UI & Styling
```
Tailwind CSS 4.2.0    → Dark theme, zinc colors
React Router 7.13.0   → Client-side routing
```

### Real-Time
```
Custom WebSocket hook → Subscription-based channels
Auto-reconnect        → Exponential backoff (1s → 16s)
```

### Utilities
```
xterm.js 6.0.0        → Terminal emulation
react-markdown        → Markdown rendering
clsx + tailwind-merge → Utility composition
```

---

## 2. Architecture Overview

### Directory Structure
```
packages/frontend/
├── src/
│   ├── components/       # UI components (chat, layout, modals)
│   ├── pages/            # Route handlers (ProjectPage, SettingsPage)
│   ├── hooks/            # Custom hooks (WebSocket, keyboard shortcuts)
│   ├── stores/           # Zustand state (chat, terminal, project, etc)
│   ├── lib/              # API clients and utilities
│   ├── providers/        # React context providers
│   ├── App.tsx           # Router setup
│   ├── main.tsx          # React root
│   └── index.css         # Tailwind imports
├── vite.config.ts        # Vite + Tailwind plugin
└── package.json          # Dependencies
```

### Routing
```
/                           → Home (project list)
/project/:id                → ProjectPage with tabs
  /project/:id/loops        → LoopsView
  /project/:id/tasks        → TasksView
  /project/:id/chat         → ChatView
  /project/:id/terminal     → TerminalView
  /project/:id/monitor      → MonitorView
  /project/:id/preview      → PreviewView
  /project/:id/hats-presets → HatsPresetsView
  /project/:id/settings     → ProjectConfigView
/settings                   → SettingsPage
```

---

## 3. State Management (Zustand)

### Store Architecture
Domain-specific stores instead of single monolithic state:

| Store | Purpose | Key State |
|-------|---------|-----------|
| **chatStore** | Chat sessions & messages | `sessionsByProject`, `messagesBySession`, `sessionTypeByProject` |
| **terminalStore** | Terminal sessions | `sessionsByProject`, `activeSessionIdByProject` |
| **projectStore** | Projects & active project | `projects`, `activeProjectId` |
| **notificationStore** | Notifications | Notification records |
| **loopStore** | Loop execution | Loop session data |

### Store Pattern
```typescript
// Create
const useMyStore = create<State>((set) => ({
  items: {},
  setItems: (projectId, items) => set((state) => ({ ... }))
}))

// Use
const items = useMyStore((state) => state.items[projectId])
const setItems = useMyStore((state) => state.setItems)
```

### Key Features
- **Optimistic updates:** `upsertMessage()` handles create/update with auto-sorting
- **Project scoping:** Most stores use `projectId` as primary key
- **Reset functions:** `resetChatStore()` for cleanup

---

## 4. Real-Time Communication

### WebSocket Hook
**File:** `hooks/useWebSocket.ts`

**Initialization:**
```typescript
const { isConnected, status, reconnectAttempt, send } = useWebSocket({
  channels: ['chat:sessionId:message', 'loop:loopId:update'],
  onMessage: (message) => {
    // Handle message based on type
  }
})
```

**Features:**
- Channel-based subscriptions
- Auto-reconnect with exponential backoff
- Status tracking ('connecting' | 'connected' | 'reconnecting')
- Reconnect attempt counter
- Send capability for outgoing messages

**URL Resolution:**
- Dev: `/ws` (Vite proxy to `ws://localhost:3001`)
- Prod: `wss://host/ws` or `ws://host/ws`

**Message Format:**
```javascript
// Subscribe
{ type: 'subscribe', channels: ['chat:123:message'] }

// Receive (examples)
{ type: 'chat.message', id: '...', sessionId: '...', role: 'user', content: '...' }
{ type: 'chat.state', sessionId: '...', state: 'active|waiting|completed' }
```

---

## 5. Component Organization

### Layout Components
| Component | Purpose | Z-Index |
|-----------|---------|---------|
| **AppShell** | Main grid (sidebar + main) | - |
| **Sidebar** | Project list, status | - |
| **TabBar** | Tab navigation | - |

### Chat Components
| Component | Purpose |
|-----------|---------|
| **ChatView** | Main chat container, state management |
| **ChatInput** | Message textarea + send button |
| **MessageList** | Scrollable message display (max-h-420px) |
| **ChatMessage** | Individual message with markdown support |

### Modal/Overlay Components
| Component | Purpose | Z-Index |
|-----------|---------|---------|
| **ProjectSwitcherDialog** | Modal with search | 50 |
| **NotificationCenter** | Dropdown panel | 40 |
| **NotificationToast** | Toast notifications | - |

### NO Bottom Drawer
**Current status:** Chat is embedded in tab view, not floating overlay.
**Opportunity:** Can create bottom drawer following existing modal pattern.

---

## 6. Styling System

### Tailwind CSS v4.2.0
**Dark theme by default:**
```typescript
// index.tsx
document.documentElement.classList.add('dark')
```

**Color Palette:**
```
Background:  bg-zinc-950 (#09090b)
Surface:     bg-zinc-900, bg-zinc-900/70
Border:      border-zinc-800, border-zinc-700
Text:        text-zinc-100 (primary)
             text-zinc-400 (secondary)
             text-zinc-500 (muted)
Accent:      red-500, amber-500, cyan-400
```

**Common Utilities:**
```
Layout:      grid grid-cols-1 md:grid-cols-[auto_1fr]
Spacing:     gap-4 p-6 mb-4
Sizing:      w-full h-screen min-h-0 max-h-[420px]
Typography:  text-sm text-lg font-semibold
Interactive: hover:bg-zinc-800 disabled:opacity-60 focus:ring-2
Animation:   transition-all duration-200 animate-pulse
Responsive:  md: lg: breakpoints
```

---

## 7. Chat Implementation Details

### ChatView Component
**Location:** `components/chat/ChatView.tsx`

**Responsibilities:**
1. Load existing session or create new one
2. Fetch chat history
3. Subscribe to WebSocket updates
4. Manage message sending
5. Session lifecycle (start, restart, end)

**State:**
```typescript
const [inputValue, setInputValue] = useState('')
const [isStartingSession, setIsStartingSession] = useState(false)
const [isLoadingHistory, setIsLoadingHistory] = useState(false)
const [awaitingAssistant, setAwaitingAssistant] = useState(false)
const [error, setError] = useState<string | null>(null)
```

**WebSocket Channels:**
```
chat:${sessionId}:message
```

**WebSocket Messages:**
```typescript
// Incoming
{ type: 'chat.message', sessionId, id, role, content, timestamp }
{ type: 'chat.state', sessionId, state, endedAt }
```

### ChatInput Component
**Features:**
- Ctrl+Enter to send (Shift+Enter for line breaks)
- Disabled state when session not active
- Loading state ("Sending..." button text)
- Placeholder text varies based on state

### MessageList Component
**Features:**
- Auto-scroll to bottom on new messages
- "Thinking" indicator animation
- Fixed height: max-h-[420px] (custom size)
- Markdown rendering via react-markdown

---

## 8. API Communication (tRPC)

### tRPC Setup
**File:** `lib/trpc.ts`

```typescript
const trpcClient = createTRPCProxyClient({
  links: [httpLink({ url: '/trpc' })]
})
```

**Dev Proxy (vite.config.ts):**
```javascript
'/trpc' → http://localhost:3001/trpc
'/ws'   → ws://localhost:3001/ws
```

### Chat API
**File:** `lib/chatApi.ts`

```typescript
export const chatApi = {
  startSession({ projectId, type, backend }),
  restartSession({ projectId, type, backend }),
  getProjectSession({ projectId }),
  sendMessage({ sessionId, message }),
  endSession({ sessionId }),
  getHistory({ sessionId })
}
```

**Types:**
```typescript
type ChatSessionType = 'plan' | 'task'
type ChatSessionBackend = 'claude' | 'kiro' | 'gemini' | 'codex' | 'amp' | 'copilot' | 'opencode'
type ChatSessionState = 'active' | 'waiting' | 'completed' | 'unknown'
type ChatRole = 'user' | 'assistant'

interface ChatSessionRecord {
  id, projectId, type, backend, state, processId, createdAt, endedAt
}

interface ChatMessageRecord {
  id, sessionId, role, content, timestamp
}
```

---

## 9. Keyboard Shortcuts

**File:** `hooks/useKeyboardShortcuts.ts`

| Shortcut | Action |
|----------|--------|
| Cmd/Ctrl+K | Open project switcher |
| Cmd/Ctrl+N | New project |
| Cmd/Ctrl+1/2/3/4 | Switch tabs |
| Escape | Close dialogs |

**Implementation:**
- Global window keydown listener
- Skips in editable elements (input, textarea, contenteditable)
- Skips in terminal (xterm)
- Prevents default browser behavior

---

## 10. Modal/Overlay Patterns

### Modal Pattern (ProjectSwitcherDialog)
```tsx
<div className="fixed inset-0 z-50 flex items-start bg-black/70">
  <section className="max-w-lg rounded-lg border bg-zinc-900 p-4">
    <input type="text" autoFocus />
    <ul>{/* filtered list */}</ul>
  </section>
</div>
```

**Features:**
- Full-screen overlay with semi-transparent background
- Auto-focus on input
- Click-outside-to-close
- Search/filter functionality
- Z-index: 50 (above other content)

### Dropdown Pattern (NotificationCenter)
```tsx
<div className="relative">
  <button onClick={() => setIsOpen(!isOpen)}>Bell</button>
  {isOpen && (
    <section className="absolute z-40 mt-2 w-80 right-0">
      {/* notifications */}
    </section>
  )}
</div>
```

**Features:**
- Position-relative to trigger
- Positioned with absolute
- Max-width: 320px
- Z-index: 40 (below modals)

### Z-Index Stacking
```
Modals (dialogs):     z-50
Overlays/Dropdowns:   z-40
Behind overlay:       z-30
Normal content:       auto (0-10)
```

---

## 11. Testing Setup

**Test Framework:** Vitest + React Testing Library
**E2E Testing:** Playwright 1.58.2
**Coverage Provider:** V8

**Test Files:**
```
components/chat/ChatView.test.tsx
components/chat/ChatInput.test.tsx
hooks/useKeyboardShortcuts.test.tsx
hooks/useWebSocket.test.tsx
```

---

## 12. Key Patterns & Best Practices

### Props Pattern
```typescript
interface ComponentProps {
  projectId: string           // Required
  disabled?: boolean          // Optional
  onAction?: () => void       // Optional callback
}
```

### Form Pattern
```tsx
<label className="space-y-1 text-sm text-zinc-300">
  <span>Label</span>
  <input className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2" />
</label>
```

### Async Error Handling
```typescript
let cancelled = false

chatApi.getHistory({ sessionId })
  .then((data) => {
    if (!cancelled) setState(data)
  })
  .catch((error) => {
    if (!cancelled) setError(error.message)
  })

return () => {
  cancelled = true
}
```

### Accessibility
```tsx
<button
  aria-label="Send message"
  aria-expanded={isOpen}
  aria-haspopup="menu"
  role="dialog"
  type="button"
/>
```

---

## 13. Implementation Path: Chat Overlay

### Required Changes
1. **Create ChatOverlay component** (new file)
2. **Add overlay state management** (Zustand store or state)
3. **Add keyboard shortcut** (extend useKeyboardShortcuts)
4. **Update App.tsx** (render overlay, handle shortcut)

### Key Considerations
- Reuse existing ChatView/ChatInput/MessageList components
- WebSocket automatically works (uses shared sessionId from Zustand)
- Follow existing modal/dropdown patterns for positioning
- Use bottom-drawer layout (fixed bottom, full-width or max-width)
- Z-index: 40 (below modals at 50)

### File References
See detailed guide in `/CHAT_OVERLAY_GUIDE.md`

---

## 14. Generated Documentation

Created three comprehensive guides:

### FRONTEND_EXPLORATION.md (20 KB)
- Complete architectural overview
- All component descriptions
- State management details
- WebSocket protocol
- Overlay/modal patterns
- Routing structure
- File organization
- Testing setup

### CHAT_OVERLAY_GUIDE.md (12 KB)
- Step-by-step implementation guide
- Code examples for ChatOverlay component
- State management options
- Keyboard shortcut integration
- WebSocket integration
- Styling patterns
- Edge cases and UX considerations
- Implementation checklist

### CODE_SNIPPETS.md (14 KB)
- 20 copy-paste ready code patterns
- Zustand store pattern
- Tailwind button/input patterns
- Modal/dropdown patterns
- Form patterns
- WebSocket usage
- tRPC API calls
- And more

---

## 15. File Locations Quick Reference

### Entry Points
- `/packages/frontend/src/main.tsx` - React root
- `/packages/frontend/src/App.tsx` - Router & app shell

### Chat Components
- `/packages/frontend/src/components/chat/ChatView.tsx` - Main chat
- `/packages/frontend/src/components/chat/ChatInput.tsx` - Message input
- `/packages/frontend/src/components/chat/MessageList.tsx` - Message display
- `/packages/frontend/src/components/chat/ChatMessage.tsx` - Individual message

### State & APIs
- `/packages/frontend/src/stores/chatStore.ts` - Chat state
- `/packages/frontend/src/lib/chatApi.ts` - Chat API client
- `/packages/frontend/src/lib/trpc.ts` - tRPC client setup

### Hooks
- `/packages/frontend/src/hooks/useWebSocket.ts` - WebSocket management
- `/packages/frontend/src/hooks/useKeyboardShortcuts.ts` - Keyboard shortcuts
- `/packages/frontend/src/hooks/useNotifications.ts` - Notification logic

### Layout
- `/packages/frontend/src/components/layout/AppShell.tsx` - Main layout
- `/packages/frontend/src/components/layout/TabBar.tsx` - Tab navigation
- `/packages/frontend/src/components/project/ProjectSwitcherDialog.tsx` - Modal example

### Config
- `/packages/frontend/vite.config.ts` - Vite + proxy setup
- `/packages/frontend/src/index.css` - Tailwind imports
- `/packages/frontend/src/providers/AppProviders.tsx` - Root providers

---

## 16. Key Statistics

| Metric | Value |
|--------|-------|
| Total Lines of Code | 11,662 TypeScript/React |
| Total Components | ~25 major components |
| Zustand Stores | 5 domain-specific stores |
| Custom Hooks | 3 (WebSocket, KeyboardShortcuts, Notifications) |
| API Modules | 10 (chat, loop, terminal, project, etc) |
| Test Files | Multiple (Vitest + Playwright) |
| Dependencies | 13 production, 11 dev |
| Dev Server Port | 5174 |
| Backend API Port | 3001 (localhost) |

---

## 17. Next Steps

### Immediate (Start Here)
1. Read `/CHAT_OVERLAY_GUIDE.md` for step-by-step implementation
2. Review `/CODE_SNIPPETS.md` for copy-paste patterns
3. Reference `/FRONTEND_EXPLORATION.md` for detailed architecture

### For Chat Overlay Implementation
1. Create `src/components/chat/ChatOverlay.tsx`
2. Add keyboard shortcut (Cmd+Shift+C or similar)
3. Manage overlay state in App.tsx or Zustand store
4. Test WebSocket connectivity in overlay
5. Style with Tailwind (follow existing patterns)

### For Other Features
1. Follow existing component patterns (props, styling, state)
2. Use Zustand stores for persistent state
3. Use tRPC + React Query for API calls
4. Leverage keyboard shortcut system
5. Follow accessibility (ARIA) guidelines

---

## 18. Notes for Development

### Important Patterns
- **Always use unique IDs:** `projectId`, `sessionId` as keys in stores
- **Optimistic updates:** Add to UI immediately, handle errors gracefully
- **Cleanup:** Unsubscribe from WebSocket, cancel async ops on unmount
- **Accessibility:** ARIA labels, semantic HTML, keyboard navigation
- **Responsive:** Mobile-first design with `md:` breakpoints

### Common Pitfalls to Avoid
- Don't use array indices as keys in lists
- Don't block rendering on async operations
- Don't forget to cancel ongoing requests on unmount
- Don't mix styled and non-styled components
- Don't create stores inside components (only at module level)

### Performance Tips
- Use `useCallback` for stable function references
- Leverage Zustand selector to avoid unnecessary re-renders
- Use `useRef` for refs that don't need to trigger renders
- Lazy load heavy components with React.lazy
- Optimize re-renders with React.memo for pure components

---

## Summary

The Ralph Orchestrator frontend is a well-structured React application with clear separation of concerns. It uses Zustand for state, WebSocket for real-time updates, and Tailwind for styling. The existing modal and dropdown patterns provide a solid foundation for implementing the chat overlay.

**To build the chat overlay:** Follow the implementation guide in `CHAT_OVERLAY_GUIDE.md`, leverage the existing ChatView/ChatInput/MessageList components, and use the code snippets in `CODE_SNIPPETS.md` as templates.

All necessary documentation has been generated and placed in the project root:
- `FRONTEND_EXPLORATION.md` - Complete architecture guide
- `CHAT_OVERLAY_GUIDE.md` - Implementation guide
- `CODE_SNIPPETS.md` - Ready-to-use code patterns
- `EXPLORATION_SUMMARY.md` - This file

Good luck with the implementation!
