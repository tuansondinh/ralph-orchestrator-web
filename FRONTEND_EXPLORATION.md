# Ralph Orchestrator - Frontend Exploration Report

**Generated:** February 25, 2026
**Location:** `/Users/sonwork/Workspace/ralph-orchestrator-web/packages/frontend`
**Total Frontend Code:** ~11,662 lines of TypeScript/React

---

## 1. Frontend Framework & Key Dependencies

### Framework
- **React:** 19.2.4 (latest major version)
- **Build Tool:** Vite 7.3.1
- **Testing:** Vitest 4.0.18 + Playwright 1.58.2 for E2E

### Key Dependencies
```json
{
  "@tanstack/react-query": "^5.90.21",      // Data fetching & caching
  "@trpc/client": "^11.10.0",               // Type-safe API calls
  "@trpc/react-query": "^11.10.0",          // tRPC + React Query integration
  "react-router-dom": "^7.13.0",            // Routing
  "zustand": "^5.0.11",                     // State management
  "@xterm/xterm": "^6.0.0",                 // Terminal emulation
  "@xterm/addon-fit": "^0.11.0",
  "react-markdown": "^10.1.0",              // Markdown rendering
  "tailwindcss": "^4.2.0",                  // Styling
  "tailwind-merge": "^3.4.1",               // Tailwind utility merging
  "clsx": "^2.1.1",                         // className utility
  "yaml": "^2.8.2"                          // YAML parsing
}
```

### Build & Dev Tools
- **TypeScript:** 5.9.3
- **ESLint:** For code quality (max complexity: 12)
- **Tailwind CSS:** v4.2.0 (with Vite plugin for optimization)
- **jsdom:** For test environment

---

## 2. Component Structure & Organization

```
packages/frontend/src/
├── components/
│   ├── chat/                     # Chat interface components
│   │   ├── ChatView.tsx          # Main chat container with WebSocket
│   │   ├── ChatInput.tsx         # Message input with Send/Ctrl+Enter
│   │   ├── MessageList.tsx       # Scrollable message display
│   │   ├── ChatMessage.tsx       # Individual message renderer
│   │   └── *.test.tsx
│   ├── layout/
│   │   ├── AppShell.tsx          # Main grid layout (sidebar + main)
│   │   ├── Sidebar.tsx           # Project navigation & status
│   │   └── TabBar.tsx            # Tab navigation (loops, tasks, etc)
│   ├── loops/                    # Loop execution UI
│   │   ├── LoopsView.tsx
│   │   ├── LoopDetail.tsx
│   │   ├── LoopCard.tsx
│   │   ├── DiffViewer.tsx
│   │   ├── TerminalOutput.tsx
│   │   └── StartLoopDialog.tsx
│   ├── terminal/
│   │   └── TerminalView.tsx      # xterm.js integration
│   ├── monitor/                  # Monitoring/metrics panels
│   │   ├── MonitorView.tsx
│   │   ├── MetricsPanel.tsx
│   │   ├── EventTimeline.tsx
│   │   ├── StatusCards.tsx
│   │   └── FileChanges.tsx
│   ├── project/                  # Project management
│   │   ├── ProjectHeader.tsx
│   │   ├── ProjectList.tsx
│   │   ├── ProjectSwitcherDialog.tsx  # Modal with search (Cmd+K)
│   │   ├── NewProjectDialog.tsx
│   │   ├── ProjectConfigView.tsx
│   │   ├── HatsPresetsView.tsx
│   │   ├── EmptyState.tsx
│   │   └── ProjectHomeState.tsx
│   ├── notifications/
│   │   ├── NotificationCenter.tsx      # Bell icon + dropdown panel
│   │   └── NotificationToast.tsx       # Toast notifications
│   ├── tasks/
│   │   └── TasksView.tsx
│   ├── preview/
│   │   └── PreviewView.tsx
│   ├── system/
│   │   └── RalphProcessList.tsx
│   └── errors/
│       └── AppErrorBoundary.tsx
├── pages/
│   ├── ProjectPage.tsx           # Project tabs wrapper
│   └── SettingsPage.tsx
├── hooks/
│   ├── useWebSocket.ts           # WebSocket connection management
│   ├── useKeyboardShortcuts.ts   # Global keyboard shortcuts
│   ├── useNotifications.ts       # Notifications logic
│   └── *.test.tsx
├── stores/                        # Zustand state management
│   ├── chatStore.ts              # Chat session & messages
│   ├── terminalStore.ts          # Terminal sessions
│   ├── notificationStore.ts
│   ├── projectStore.ts           # Projects list & active project
│   └── loopStore.ts
├── lib/
│   ├── trpc.ts                   # tRPC client setup
│   ├── chatApi.ts                # Chat API types & methods
│   ├── loopApi.ts
│   ├── terminalApi.ts
│   ├── projectApi.ts
│   ├── notificationApi.ts
│   ├── monitoringApi.ts
│   ├── presetApi.ts
│   ├── previewApi.ts
│   ├── hatsPresetApi.ts
│   └── *.js (compiled versions)
├── providers/
│   └── AppProviders.tsx          # Root provider (TanStack Query)
├── test/
│   └── setup.ts                  # Vitest configuration
├── App.tsx                        # App routing & root component
├── main.tsx                       # React root render
└── index.css                      # Tailwind imports

```

### Component Patterns

**Layout Components:**
- `AppShell`: Main grid layout with collapsible sidebar
- Responsive design: mobile-first, `md:` breakpoints for tablet/desktop
- Dark theme (zinc color palette from Tailwind)

**Dialog/Modal Pattern:**
```tsx
// ProjectSwitcherDialog example (z-index: 50)
<div className="fixed inset-0 z-50 flex items-start bg-black/70">
  <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
    {/* content */}
  </section>
</div>
```

**Dropdown/Panel Pattern:**
```tsx
// NotificationCenter example
<div className="relative">
  <button>Bell Icon</button>
  {isOpen && (
    <section className="absolute z-40 mt-2 w-80 rounded-md border bg-zinc-950">
      {/* content */}
    </section>
  )}
</div>
```

---

## 3. State Management: Zustand

**Architecture:** Multiple domain-specific stores instead of single monolithic store.

### Stores

**1. chatStore.ts**
```typescript
interface ChatStoreState {
  sessionsByProject: Record<string, ChatSessionRecord | undefined>
  messagesBySession: Record<string, ChatMessageRecord[] | undefined>
  historyLoadedBySession: Record<string, boolean | undefined>
  sessionTypeByProject: Record<string, ChatSessionType | undefined>
  sessionBackendByProject: Record<string, ChatSessionBackend | undefined>
  // Methods:
  setSession, setMessages, upsertMessage, updateSessionState, etc.
}
```
- Key-value storage indexed by projectId/sessionId
- `upsertMessage()` handles optimistic updates
- `sortByTimestamp()` keeps messages ordered

**2. terminalStore.ts**
```typescript
interface TerminalState {
  sessionsByProject: Record<string, TerminalSessionRecord[]>
  activeSessionIdByProject: Record<string, string | null>
  setSessions, addSession, updateSession, removeSession, setActiveSession
}
```
- Multiple terminals per project
- Tracks active terminal for each project

**3. projectStore.ts**
```typescript
// Manages projects list and active project selection
```

**4. notificationStore.ts & loopStore.ts**
- Similar patterns for respective domains

### Store Usage Pattern
```tsx
const messages = useChatStore((state) => state.messagesBySession[sessionId])
const upsertMessage = useChatStore((state) => state.upsertMessage)
```

---

## 4. WebSocket/Real-Time Updates

**File:** `/packages/frontend/src/hooks/useWebSocket.ts`

**Architecture:**
- Custom hook wrapping native WebSocket API
- Auto-reconnection with exponential backoff (1s → 16s max)
- Channel-based subscription system
- Type-safe message handling via callbacks

**Key Features:**
```typescript
export function useWebSocket({
  channels: string[]           // ['chat:sessionId:message', ...]
  onMessage: (message) => void
  reconnectDelayMs?: 1_000
  maxReconnectDelayMs?: 16_000
  connectTimeoutMs?: 10_000
})

// Returns:
{
  isConnected: boolean
  status: 'connecting' | 'connected' | 'reconnecting'
  reconnectAttempt: number
  send: (message: Record) => boolean
}
```

**WebSocket Protocol:**
```javascript
// Subscribe
socket.send(JSON.stringify({
  type: 'subscribe',
  channels: ['chat:sessionId:message']
}))

// Message types received:
// - chat.message
// - chat.state
// - (other domain-specific types)
```

**URL Resolution:**
- Dev: `/ws` (Vite proxies to `ws://localhost:3001`)
- Production: `wss://host/ws` or `ws://host/ws`

**Chat Example (ChatView.tsx):**
```tsx
const { isConnected } = useWebSocket({
  channels: [`chat:${sessionId}:message`],
  onMessage: (message) => {
    if (message.type === 'chat.message') {
      upsertMessage({...})
    }
    if (message.type === 'chat.state') {
      updateSessionState(...)
    }
  }
})
```

---

## 5. Overlay/Modal/Drawer Components

### Modal/Dialog Pattern
**ProjectSwitcherDialog** (z-index: 50)
- File: `/packages/frontend/src/components/project/ProjectSwitcherDialog.tsx`
- Full-screen overlay with centered modal
- Auto-focuses search input on open
- Click-outside-to-close
- Search/filter functionality

```typescript
<div aria-modal="true" className="fixed inset-0 z-50 flex items-start bg-black/70">
  <section className="w-full max-w-lg space-y-3 rounded-lg border bg-zinc-900 p-4">
    <input /> {/* auto-focused */}
    <ul className="max-h-72 space-y-2 overflow-auto">
      {filteredProjects.map(...)}
    </ul>
  </section>
</div>
```

### Dropdown/Panel Pattern
**NotificationCenter** (z-index: 40)
- File: `/packages/frontend/src/components/notifications/NotificationCenter.tsx`
- Positioned relative to trigger button
- `panelAlign` prop ('left' | 'right')
- Max width: 320px (w-80)

```typescript
<div className="relative">
  <button onClick={() => setIsOpen(!isOpen)}>
    <BellIcon />
    {unreadCount > 0 && <badge>{unreadCount}</badge>}
  </button>
  {isOpen && (
    <section className="absolute z-40 mt-2 w-80 right-0">
      {/* notification list */}
    </section>
  )}
</div>
```

### Toast Pattern
**NotificationToast** (multiple stacked)
- File: `/packages/frontend/src/components/notifications/NotificationToast.tsx`
- Positioned bottom/right (typical toast placement)
- Auto-dismiss on timeout
- Click-to-dismiss

### Tab Navigation
**TabBar** (permanent, not overlay)
- File: `/packages/frontend/src/components/layout/TabBar.tsx`
- React Router NavLink components
- Active state styling (bg-zinc-100, text-zinc-900)

### No Dedicated Bottom Drawer
- **Status:** Not currently implemented
- **Chat Location:** Embedded in ChatView (max-height 420px fixed)
- **Terminal:** Full-height TerminalView component
- **Candidate for Chat Overlay:** Could use similar modal pattern as ProjectSwitcherDialog

---

## 6. Styling Approach

### Technology: Tailwind CSS v4.2.0

**Configuration:**
- Vite plugin for compilation
- Dark mode by default (`<html class="dark">`)
- No custom config file (uses Tailwind defaults + Vite integration)

**Color Palette (zinc-based dark theme):**
```
Background:  #09090b (zinc-950)
Borders:     border-zinc-800
Text:        text-zinc-100 (default), text-zinc-400 (muted)
Hover:       hover:bg-zinc-900
Accents:     red-500, amber-500, cyan-400
```

**Key Utility Classes:**
```css
/* Grid/Layout */
.grid .gap-4 .p-6
.flex .flex-col .min-h-0 (overflow containment)
.overflow-hidden .overflow-y-auto

/* Spacing & Sizing */
.min-h-screen .h-full .w-full
.max-h-[420px] .max-w-lg (custom breakpoints)

/* Typography */
.text-xs .text-sm .text-xl .font-semibold

/* Interactive States */
.transition .hover:bg-zinc-800 .disabled:opacity-60 .focus:ring-2
```

**Responsive Design:**
```
md: {
  grid-cols-[auto_1fr]  /* sidebar on desktop */
  w-72 border-r        /* sidebar width */
  border-b-0           /* remove bottom border on desktop */
}
```

**CSS Reset (index.css):**
```css
@import "tailwindcss";
:root { color-scheme: dark; }
html, body, #root { height: 100%; }
body { margin: 0; background: #09090b; color: #f4f4f5; }
```

---

## 7. Chat Overlay Relevant Components

### Chat-Related Components

**ChatView** (Main container)
- Path: `/packages/frontend/src/components/chat/ChatView.tsx`
- Fixed max-height: none (full container)
- Features:
  - Session type selector (plan/task)
  - Backend selector (claude, kiro, gemini, codex, amp, copilot, opencode)
  - Start/Restart/End session buttons
  - Connection status indicator
  - Error display
  - Loading skeleton

**MessageList** (Scrollable container)
- Path: `/packages/frontend/src/components/chat/MessageList.tsx`
- Fixed height: `max-h-[420px]` (custom Tailwind size)
- Auto-scrolls to bottom on new messages
- Supports "thinking" indicator animation

**ChatInput** (Message composer)
- Path: `/packages/frontend/src/components/chat/ChatInput.tsx`
- Textarea: min-h-[96px]
- Send button
- Keyboard shortcut: Ctrl+Enter (not Shift+Enter to allow line breaks)
- Disabled state when session not ready

**ChatMessage** (Individual message)
- Path: `/packages/frontend/src/components/chat/ChatMessage.tsx`
- Supports markdown rendering (react-markdown)
- Role-based styling (user vs assistant)

### Bottom Drawer Patterns (for reference)

**Current layout:** ChatView is embedded in ProjectPage tab
```
ProjectPage (flex column)
├── ProjectHeader
├── TabBar
└── Content Area (min-h-0 flex-1)
    └── ChatView (embedded, full container)
```

**Bottom Drawer Alternative:**
Could add bottom drawer using absolute positioning or separate container:
```
ProjectPage
├── Main content
└── BottomDrawer (fixed/absolute, bottom-0, z-40)
    └── ChatView (resizable)
```

---

## 8. Routing Structure

**File:** `/packages/frontend/src/App.tsx`

**Routes:**
```
/                          → HomePage (project list or empty state)
/project/:id               → ProjectPage (redirects to /project/:id/loops)
  /project/:id/loops       → LoopsView
  /project/:id/tasks       → TasksView
  /project/:id/chat        → ChatView (currently redirects to loops)
  /project/:id/terminal    → TerminalView
  /project/:id/monitor     → MonitorView
  /project/:id/preview     → PreviewView
  /project/:id/hats-presets → HatsPresetsView
  /project/:id/settings    → ProjectConfigView
/settings                  → SettingsPage
/*                         → 404 Not Found
```

**Keyboard Shortcuts:**
- `Cmd/Ctrl+K`: Open project switcher
- `Cmd/Ctrl+N`: New project
- `Cmd/Ctrl+1/2/3/4`: Switch tabs
- `Escape`: Close dialogs

**Implementation:** `/packages/frontend/src/hooks/useKeyboardShortcuts.ts`
- Global event listener
- Skips in editable elements (input, textarea, contenteditable)
- Skips in xterm (terminal)

**Navigation Helper:**
```tsx
const navigate = useNavigate()
navigate(`/project/${projectId}/${tab}`)
```

---

## 9. API Communication

### tRPC Setup
**File:** `/packages/frontend/src/lib/trpc.ts`

```typescript
const trpcClient = createTRPCProxyClient({
  links: [
    httpLink({
      url: resolveTrpcBaseUrl()  // '/trpc' or custom origin
    })
  ]
})

const queryClient = new QueryClient()
```

**Dev Proxy:**
```
/trpc → http://localhost:3001/trpc
/ws → ws://localhost:3001
```

### API Modules
Each domain has a typed API wrapper in `/lib/`:

**chatApi.ts Example:**
```typescript
export const chatApi = {
  startSession(input: {...}): Promise<ChatSessionRecord>
  restartSession(input: {...}): Promise<ChatSessionRecord>
  getProjectSession(input: {projectId}): Promise<ChatSessionRecord | null>
  sendMessage(input: {sessionId, message}): Promise<void>
  endSession(input: {sessionId}): Promise<void>
  getHistory(input: {sessionId}): Promise<ChatMessageRecord[]>
}
```

**Pattern:** Returns promises, no React hooks in API layer

### React Query Integration
- QueryClient configured in AppProviders
- Can be extended for caching/optimistic updates
- Currently primarily used for tRPC link

---

## 10. Key Patterns & Conventions

### Component Naming
- Page components: `PageName.tsx` (ProjectPage.tsx)
- UI components: `ComponentName.tsx` (ChatView.tsx)
- Tests: `Component.test.tsx`

### Props Pattern
```tsx
interface ComponentProps {
  // Required
  projectId: string
  // Optional with defaults
  disabled?: boolean
  onAction?: () => void
}

export function Component({ projectId, ...props }: ComponentProps) {
  // ...
}
```

### Form Inputs
- Labels with `htmlFor` attributes
- Consistent classes: `border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm`
- Disabled state: `disabled:cursor-not-allowed disabled:opacity-60`
- Focus: `focus:ring-2 ring-zinc-500`

### Loading States
- Loading skeletons (pulse animation)
- Button text changes: "Send" → "Sending..."
- Disabled state during async operations

### Error Handling
```tsx
{error ? (
  <p className="text-sm text-red-400">{error}</p>
) : null}
```

### Accessibility
- ARIA attributes: `aria-label`, `aria-expanded`, `aria-haspopup`, `role`
- Semantic HTML: `<button type="button">`, `<section>`, `<nav>`
- Focus management (auto-focus in modals)

---

## 11. Testing Setup

**Vitest Configuration:**
- Unit tests with React Testing Library
- E2E tests with Playwright
- Coverage reports (v8 provider)

**Test Patterns:**
```
components/
├── chat/
│   ├── ChatView.test.tsx
│   └── ChatInput.test.tsx
└── ...
```

---

## 12. Summary: Key Takeaways for Chat Overlay

### Current State
- Chat is a tab view, NOT an overlay
- No existing bottom drawer component
- Modal pattern exists (ProjectSwitcherDialog) that could be adapted

### Implementation Path for Chat Overlay

1. **Create BottomDrawer component:**
   - Similar to modal pattern
   - Position: fixed bottom, full width or max-width
   - Resizable height (optional drag handle)
   - Z-index: 40 (below modals at 50)

2. **Adapt ChatView:**
   - Extract to smaller component (no full-height requirement)
   - Add to overlay vs tab views

3. **State management:**
   - Add drawer visibility to chatStore or separate drawerStore
   - Toggle via keyboard shortcut or button

4. **Styling patterns:**
   - Use existing Tailwind classes
   - Dark theme (zinc colors)
   - Responsive (full-width mobile, centered on desktop)

### Existing Patterns to Leverage
- `useWebSocket` hook for real-time chat updates
- `useChatStore` for message state
- `ChatInput` + `MessageList` components (reusable)
- Keyboard shortcut system (can add new shortcut)
- Modal pattern (z-index system, click-outside handling)

---

## File Paths Quick Reference

**Entry Points:**
- `/packages/frontend/src/main.tsx` - React root
- `/packages/frontend/src/App.tsx` - Router setup

**Stores:**
- `/packages/frontend/src/stores/chatStore.ts`
- `/packages/frontend/src/stores/terminalStore.ts`
- `/packages/frontend/src/stores/projectStore.ts`

**Chat Components:**
- `/packages/frontend/src/components/chat/ChatView.tsx`
- `/packages/frontend/src/components/chat/ChatInput.tsx`
- `/packages/frontend/src/components/chat/MessageList.tsx`
- `/packages/frontend/src/components/chat/ChatMessage.tsx`

**Hooks:**
- `/packages/frontend/src/hooks/useWebSocket.ts`
- `/packages/frontend/src/hooks/useKeyboardShortcuts.ts`

**APIs:**
- `/packages/frontend/src/lib/chatApi.ts`
- `/packages/frontend/src/lib/trpc.ts`

**Layout:**
- `/packages/frontend/src/components/layout/AppShell.tsx`
- `/packages/frontend/src/components/layout/TabBar.tsx`

**Overlays/Dialogs:**
- `/packages/frontend/src/components/project/ProjectSwitcherDialog.tsx`
- `/packages/frontend/src/components/notifications/NotificationCenter.tsx`
- `/packages/frontend/src/components/notifications/NotificationToast.tsx`

**Styling:**
- `/packages/frontend/src/index.css` - Tailwind imports
- `/packages/frontend/vite.config.ts` - Vite + Tailwind plugin config

---

## Statistics

- **Total Lines:** ~11,662 TypeScript/React
- **Components:** ~25 major components
- **Stores:** 5 (chat, terminal, project, notification, loop)
- **Hooks:** 3 custom hooks
- **API Modules:** 10
- **Test Files:** Multiple (vitest + Playwright)
- **Package Size:** ~11MB (includes node_modules)
