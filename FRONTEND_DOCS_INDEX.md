# Ralph Orchestrator Frontend Documentation Index

**Generated:** February 25, 2026
**Status:** Complete comprehensive frontend exploration

---

## Quick Navigation

### Start Here
1. **New to the codebase?** → Read `EXPLORATION_SUMMARY.md` (5 min overview)
2. **Want to build chat overlay?** → Read `CHAT_OVERLAY_GUIDE.md` (step-by-step)
3. **Need code examples?** → Check `CODE_SNIPPETS.md` (20+ patterns)
4. **Want full details?** → See `FRONTEND_EXPLORATION.md` (complete reference)

---

## Documentation Files

### EXPLORATION_SUMMARY.md
**What:** Executive summary of entire frontend
**Length:** ~4,000 words
**Best for:** Getting oriented, understanding architecture at 30,000 ft view
**Covers:**
- Technology stack overview
- Architecture diagram
- State management (Zustand stores)
- Real-time communication (WebSocket)
- Component organization
- Styling system
- API communication (tRPC)
- Key patterns & best practices
- Implementation path for chat overlay
- File locations quick reference
- Key statistics

**Read time:** 10-15 minutes

---

### FRONTEND_EXPLORATION.md
**What:** Comprehensive architectural reference guide
**Length:** ~7,000 words
**Best for:** Deep dive into specific systems, detailed implementation reference
**Covers:**
1. Framework & dependencies (complete list with versions)
2. Component structure (full directory tree with descriptions)
3. Component patterns (layout, dialog, dropdown)
4. State management architecture (all 5 stores)
5. WebSocket integration (complete implementation)
6. Overlay/modal/drawer components (existing patterns)
7. Styling approach (Tailwind v4 setup, color palette, utilities)
8. Chat overlay relevant components (ChatView, MessageList, etc)
9. Routing structure (all routes, keyboard shortcuts)
10. API communication (tRPC setup, API modules)
11. Key patterns & conventions (naming, props, forms, accessibility)
12. Testing setup
13. Summary for chat overlay implementation
14. File paths quick reference
15. Statistics

**Read time:** 20-30 minutes

---

### CHAT_OVERLAY_GUIDE.md
**What:** Step-by-step guide to implementing a chat overlay
**Length:** ~4,000 words
**Best for:** Implementing the chat overlay feature
**Covers:**
1. Component structure (new files to create)
2. State management options (extend store vs new store)
3. Keyboard shortcut integration (add new shortcut)
4. WebSocket integration (automatic with existing setup)
5. Styling the bottom drawer (full implementation example)
6. Overlay container placement in App.tsx
7. Edge cases & UX considerations
8. Implementation checklist
9. File references (what to create/modify)
10. Design system reference (colors, spacing, z-indices)
11. Quick start code (minimal working example)

**Read time:** 15-20 minutes

---

### CODE_SNIPPETS.md
**What:** Copy-paste ready code patterns
**Length:** ~3,000 words
**Best for:** Quick reference while coding
**Contains:** 20+ patterns:
1. Zustand store creation and usage
2. Tailwind button patterns
3. Form input patterns (text, textarea, select)
4. Modal/dialog pattern
5. Dropdown/panel pattern
6. Loading skeleton
7. List/table pattern
8. Tab navigation
9. WebSocket hook usage
10. Keyboard shortcut hook
11. Error display patterns
12. tRPC API call patterns
13. Responsive layout patterns
14. Optimistic update pattern
15. useCallback dependency patterns
16. Portal/overlay positioning
17. Text truncation
18. Loading state patterns
19. Conditional rendering patterns
20. SVG icon patterns

**Read time:** On-demand (reference material)

---

## How to Use This Documentation

### Scenario 1: "I need to understand the frontend architecture"
**Path:** EXPLORATION_SUMMARY.md → FRONTEND_EXPLORATION.md
**Time:** 30-45 minutes

### Scenario 2: "I need to implement the chat overlay quickly"
**Path:** CHAT_OVERLAY_GUIDE.md + CODE_SNIPPETS.md
**Time:** 20-30 minutes
**Output:** Working chat overlay component

### Scenario 3: "I need to implement a new feature"
**Path:** CODE_SNIPPETS.md → FRONTEND_EXPLORATION.md (reference as needed)
**Time:** Variable

### Scenario 4: "I need to understand WebSocket communication"
**Path:** FRONTEND_EXPLORATION.md (section 4) + CODE_SNIPPETS.md (section 9)
**Time:** 15-20 minutes

### Scenario 5: "I need to understand state management"
**Path:** FRONTEND_EXPLORATION.md (section 3) + CODE_SNIPPETS.md (section 1)
**Time:** 10-15 minutes

### Scenario 6: "I need to understand styling approach"
**Path:** FRONTEND_EXPLORATION.md (section 6) + CODE_SNIPPETS.md (sections 2-7)
**Time:** 15-20 minutes

---

## Key Files in the Codebase

### Critical Infrastructure
| File | Purpose |
|------|---------|
| `/packages/frontend/src/main.tsx` | React root render |
| `/packages/frontend/src/App.tsx` | Router and app shell |
| `/packages/frontend/src/providers/AppProviders.tsx` | TanStack Query setup |
| `/packages/frontend/vite.config.ts` | Vite + proxy configuration |

### State Management
| File | Purpose |
|------|---------|
| `/packages/frontend/src/stores/chatStore.ts` | Chat sessions and messages |
| `/packages/frontend/src/stores/terminalStore.ts` | Terminal sessions |
| `/packages/frontend/src/stores/projectStore.ts` | Projects list |
| `/packages/frontend/src/stores/notificationStore.ts` | Notifications |
| `/packages/frontend/src/stores/loopStore.ts` | Loop execution |

### Chat Components
| File | Purpose |
|------|---------|
| `/packages/frontend/src/components/chat/ChatView.tsx` | Main chat container |
| `/packages/frontend/src/components/chat/ChatInput.tsx` | Message input |
| `/packages/frontend/src/components/chat/MessageList.tsx` | Message display |
| `/packages/frontend/src/components/chat/ChatMessage.tsx` | Individual message |

### Hooks
| File | Purpose |
|------|---------|
| `/packages/frontend/src/hooks/useWebSocket.ts` | WebSocket management |
| `/packages/frontend/src/hooks/useKeyboardShortcuts.ts` | Keyboard shortcuts |
| `/packages/frontend/src/hooks/useNotifications.ts` | Notification logic |

### API & Communication
| File | Purpose |
|------|---------|
| `/packages/frontend/src/lib/trpc.ts` | tRPC client setup |
| `/packages/frontend/src/lib/chatApi.ts` | Chat API wrapper |
| `/packages/frontend/src/lib/loopApi.ts` | Loop API wrapper |
| `/packages/frontend/src/lib/projectApi.ts` | Project API wrapper |

### Layout & UI
| File | Purpose |
|------|---------|
| `/packages/frontend/src/components/layout/AppShell.tsx` | Main grid layout |
| `/packages/frontend/src/components/layout/TabBar.tsx` | Tab navigation |
| `/packages/frontend/src/components/layout/Sidebar.tsx` | Project sidebar |
| `/packages/frontend/src/components/project/ProjectSwitcherDialog.tsx` | Modal example |
| `/packages/frontend/src/components/notifications/NotificationCenter.tsx` | Dropdown example |

### Styling
| File | Purpose |
|------|---------|
| `/packages/frontend/src/index.css` | Tailwind imports |
| `/packages/frontend/vite.config.ts` | Tailwind plugin config |

---

## Technology Stack Summary

```
Frontend Framework:  React 19.2.4 + TypeScript 5.9.3
Build Tool:         Vite 7.3.1
State:              Zustand 5.0.11
Data Fetching:      tRPC 11.10.0 + React Query 5.90.21
Routing:            React Router 7.13.0
Styling:            Tailwind CSS 4.2.0
Real-time:          WebSocket (custom hook)
UI Components:      Custom built, no component library
Terminal:           xterm.js 6.0.0
Testing:            Vitest + Playwright
```

---

## Common Patterns & Conventions

### Component Props
```typescript
interface ComponentProps {
  projectId: string              // Required props first
  isLoading?: boolean            // Optional with defaults
  onAction?: () => void          // Optional callbacks last
}
```

### Form Labels
```tsx
<label className="space-y-1 text-sm text-zinc-300">
  <span>Label text</span>
  <input className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2" />
</label>
```

### Button States
```tsx
<button
  className="... disabled:cursor-not-allowed disabled:opacity-60"
  disabled={isLoading}
  type="button"
>
  {isLoading ? 'Loading...' : 'Click me'}
</button>
```

### Error Display
```tsx
{error && <p className="text-sm text-red-400">{error}</p>}
```

### Loading Skeleton
```tsx
<div className="h-12 animate-pulse rounded-lg bg-zinc-900/60" />
```

### List Rendering
```tsx
<ul className="space-y-2">
  {items.map((item) => (
    <li key={item.id}>{/* item UI */}</li>
  ))}
</ul>
```

---

## Color Palette (Tailwind Dark Theme)

| Use | Tailwind Class | Hex |
|-----|-----------------|-----|
| Background | `bg-zinc-950` | #09090b |
| Surface | `bg-zinc-900` | #18181b |
| Border | `border-zinc-800` | #27272a |
| Input BG | `bg-zinc-950` | #09090b |
| Text Primary | `text-zinc-100` | #f4f4f5 |
| Text Secondary | `text-zinc-400` | #a1a1aa |
| Text Muted | `text-zinc-500` | #71717a |
| Hover | `hover:bg-zinc-800` | #3f3f46 |
| Accent | `red-500` / `cyan-400` | Various |

---

## Z-Index System

```
Fixed modals:         z-50  (ProjectSwitcherDialog)
Dropdowns/panels:     z-40  (NotificationCenter)
Overlay backgrounds:  z-30  (Semi-transparent overlay)
Normal content:       auto  (0-10)
```

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Cmd/Ctrl+K | Open project switcher |
| Cmd/Ctrl+N | New project |
| Cmd/Ctrl+1 | Switch to Loops tab |
| Cmd/Ctrl+2 | Switch to Tasks tab |
| Cmd/Ctrl+3 | Switch to Terminal tab |
| Cmd/Ctrl+4 | Switch to Monitor tab |
| Escape | Close dialogs |

---

## API Integration Points

### Dev Environment
```
Frontend:         http://localhost:5174 (Vite)
Backend API:      http://localhost:3001 (tRPC)
WebSocket:        ws://localhost:3001 (direct)

Vite Proxies:
  /trpc  → http://localhost:3001/trpc
  /ws    → ws://localhost:3001
```

### Production
```
Frontend:    Served by backend at /
API:         /trpc (relative)
WebSocket:   wss://domain/ws (HTTPS) or ws://domain/ws (HTTP)
```

---

## Implementation Checklist: Chat Overlay

- [ ] Read `CHAT_OVERLAY_GUIDE.md` completely
- [ ] Create `src/components/chat/ChatOverlay.tsx`
- [ ] Create or extend state store for overlay visibility
- [ ] Add keyboard shortcut (Cmd+Shift+C or similar)
- [ ] Update `App.tsx` to render overlay
- [ ] Update `App.tsx` to handle keyboard shortcut
- [ ] Test ChatView renders inside overlay
- [ ] Verify WebSocket connection in overlay
- [ ] Test sending messages from overlay
- [ ] Test keyboard shortcut toggle
- [ ] Test auto-close on route change
- [ ] Test responsive layout (mobile/desktop)
- [ ] Test modal stacking (z-index) with ProjectSwitcherDialog
- [ ] Add to keyboard shortcuts documentation
- [ ] Write tests for overlay component
- [ ] Deploy and verify in production

---

## Project Statistics

- **Total Lines of Frontend Code:** 11,662
- **Major Components:** ~25
- **Zustand Stores:** 5 (domain-specific)
- **Custom Hooks:** 3
- **API Modules:** 10
- **Test Files:** Multiple (Vitest + Playwright)
- **Package Dependencies:** 13 prod + 11 dev
- **Development Server Port:** 5174
- **Backend API Port:** 3001 (localhost)

---

## Quick Answers to Common Questions

**Q: Where is the chat component?**
A: `/packages/frontend/src/components/chat/ChatView.tsx`

**Q: How is state managed?**
A: Zustand with domain-specific stores (chatStore, terminalStore, etc)

**Q: How does real-time work?**
A: Custom WebSocket hook with auto-reconnect and channel subscriptions

**Q: Where are styles defined?**
A: Tailwind CSS utilities inline (no CSS files, all in className strings)

**Q: How do I add a new tab?**
A: Add route in `/project/:id/:tab`, add case in ProjectPage, add to TabBar

**Q: How do I call the API?**
A: Use chatApi, loopApi, etc from `/lib/*.ts` files

**Q: How do keyboard shortcuts work?**
A: useKeyboardShortcuts hook in App.tsx, handles Cmd/Ctrl key combinations

**Q: Can I use a component library?**
A: No component library currently, all custom with Tailwind CSS

**Q: How do I test components?**
A: Vitest with React Testing Library, Playwright for E2E

**Q: Is there TypeScript everywhere?**
A: Yes, strict TypeScript throughout

---

## Related Documentation

The following files were already in the project:
- `README.md` - Project overview
- `BACKEND_ARCHITECTURE.md` - Backend system architecture
- `SECURITY.md` - Security considerations

---

## Generated Documentation Metadata

| Document | Words | Size | Generated |
|----------|-------|------|-----------|
| EXPLORATION_SUMMARY.md | ~4,000 | 20 KB | 2026-02-25 |
| FRONTEND_EXPLORATION.md | ~7,000 | 20 KB | 2026-02-25 |
| CHAT_OVERLAY_GUIDE.md | ~4,000 | 12 KB | 2026-02-25 |
| CODE_SNIPPETS.md | ~3,000 | 14 KB | 2026-02-25 |
| FRONTEND_DOCS_INDEX.md | ~2,000 | 12 KB | 2026-02-25 |

**Total Generated:** ~20,000 words, 78 KB of documentation

---

## How to Stay Updated

As the frontend evolves:
1. Update the relevant guide in this documentation
2. Keep CODE_SNIPPETS.md synchronized with actual patterns
3. Update FRONTEND_EXPLORATION.md with new components
4. Add new patterns to CHAT_OVERLAY_GUIDE.md as needed
5. Keep file paths current in all references

---

## Need Help?

Each documentation file is self-contained and can be referenced independently:
- **Quick answers?** → EXPLORATION_SUMMARY.md
- **Implementation?** → CHAT_OVERLAY_GUIDE.md
- **Code examples?** → CODE_SNIPPETS.md
- **Deep dive?** → FRONTEND_EXPLORATION.md
- **Navigation?** → FRONTEND_DOCS_INDEX.md (this file)

Good luck with development!
