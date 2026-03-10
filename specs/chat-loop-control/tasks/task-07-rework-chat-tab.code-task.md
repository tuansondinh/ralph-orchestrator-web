---
status: completed
created: 2026-03-10
started: 2026-03-10
completed: 2026-03-10
---
# Task: Rework ChatTab for Mobile-First Full-Screen Chat

## Description
Transform `ChatView` into a mobile-optimized full-screen chat experience that uses `useChatSession()` for all state and actions, with a hamburger menu for in-chat navigation when the header and tab bar are hidden.

## Background
The existing `ChatView` manages its own session state (session type selector, backend selector, start/restart/end controls) independently of any shared store. Under the new architecture, all session state lives in `chatSessionStore` (Task 5) and flows through `useChatSession()`. The UI surfaces that state — it does not manage it. On mobile, Task 6 hides `ProjectHeader` and `TabBar`, so `ChatTab` must provide its own navigation affordance (hamburger menu) as a slide-out panel. On desktop the component renders within the existing tab layout with no changes to the surrounding chrome.

## Reference Documentation
**Required:**
- Design: specs/chat-loop-control/design.md
- Plan: specs/chat-loop-control/plan.md

## Technical Requirements
1. Rework `packages/frontend/src/components/chat/ChatView.tsx` (or the component rendered at the `chat` route tab):
   - Remove all old session management UI: session type selector, backend selector, start/restart/end buttons.
   - Replace all session state reads and action calls with `useChatSession()`.
2. Implement mobile layout (applied when `h-[100dvh]` from Task 6 is in effect):
   - Outer container: `flex flex-col h-full` filling the available space.
   - Message area: `flex-1 overflow-y-auto` with auto-scroll to the bottom on new messages (use `useEffect` + `ref.scrollIntoView()`).
   - Input bar: sticky at the bottom; add `pb-[env(safe-area-inset-bottom)]` for home indicator.
   - Virtual keyboard handling: listen to `window.visualViewport?.addEventListener('resize', ...)` and adjust the input bar's bottom offset so it remains visible when the keyboard opens.
   - Hamburger menu icon (top-left corner of the chat area, min 44px tap target): on tap, opens a slide-out navigation panel containing the project name and links to all tabs (loops, terminal, settings, etc.). The panel closes on navigation or outside tap.
3. Render `ToolConfirmationCard` inline in the message list (above the input bar) when `pendingConfirmation` from `useChatSession()` is non-null.
4. Render messages with `react-markdown` (existing dependency).
5. Touch-optimized throughout: all interactive elements must have a minimum 44px tap target height/width.
6. Desktop layout: the component renders within the tab content area as-is. No changes to the surrounding `ProjectHeader` or `TabBar` — those are unaffected on desktop.
7. Reuse existing components `ChatMessage.tsx`, `ChatInput.tsx`, `MessageList.tsx` with minimal prop changes; do not duplicate their rendering logic.

## Dependencies
- `packages/frontend/src/hooks/useChatSession.ts` — from Task 5 (must be complete)
- `packages/frontend/src/components/chat/ChatMessage.tsx`, `ChatInput.tsx`, `MessageList.tsx` — reused
- `packages/frontend/src/components/chat/ToolConfirmationCard.tsx` — reused, props adjusted for OpenCode permission model
- Task 6 (mobile layout in `ProjectPage`) — prerequisite for full-screen behavior in integration
- `react-markdown` — existing frontend dependency

## Implementation Approach
1. Read the current `ChatView.tsx` to understand what must be removed (session management) and what can be preserved (message rendering, input handling).
2. Replace session state reads (`chatStore`, `useChat`) with `const { messages, isStreaming, status, pendingConfirmation, sendMessage, confirmAction } = useChatSession()`.
3. Implement the hamburger menu as a local state `isNavOpen: boolean` + a slide-out panel component (can be inline in `ChatView` or extracted to `ChatNavDrawer.tsx`).
4. Add `visualViewport` resize listener in a `useEffect`; compute input bar bottom offset from `window.visualViewport.height` vs `window.innerHeight`.
5. Add auto-scroll: use a `messagesEndRef` ref at the bottom of the message list, call `messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })` in a `useEffect` keyed on `messages.length`.
6. Add `ToolConfirmationCard` conditional render.
7. Write render tests in `packages/frontend/src/components/chat/ChatView.test.tsx`:
   - Messages from mock store are displayed
   - Hamburger menu icon is present; clicking it opens the nav panel
   - `ToolConfirmationCard` appears when `pendingConfirmation` is set
   - Submit on `ChatInput` calls `sendMessage`
8. Run `npm test -w @ralph-ui/frontend` — all tests must pass.

## Acceptance Criteria

1. **Messages Displayed from Store**
   - Given `chatSessionStore` has two messages (user + assistant)
   - When `ChatView` renders
   - Then both messages appear in the DOM with correct roles

2. **Hamburger Menu Toggle**
   - Given the user is on a mobile viewport with chat tab active
   - When the hamburger icon is tapped
   - Then the navigation panel opens with tab navigation links

3. **ToolConfirmationCard Present When Pending**
   - Given `useChatSession()` returns a non-null `pendingConfirmation`
   - When `ChatView` renders
   - Then `ToolConfirmationCard` is visible in the message area

4. **Send Message**
   - Given the user types in the input and submits
   - When `ChatInput` fires its submit callback
   - Then `sendMessage` from `useChatSession()` is called with the typed text

5. **No Old Session Management UI**
   - Given the reworked `ChatView` renders
   - When inspecting the DOM
   - Then there is no session type selector, backend selector, or start/restart/end control elements

6. **Desktop Layout Unaffected**
   - Given the component renders on a desktop viewport
   - When `ProjectPage` renders the chat tab
   - Then `ProjectHeader` and `TabBar` are visible and the chat fits within the tab content area

7. **Tests Pass**
   - Given all render tests run
   - When `npm test -w @ralph-ui/frontend` executes
   - Then all pass with no TypeScript errors

## Metadata
- **Complexity**: High
- **Labels**: frontend, mobile, chat-tab, ux, react
- **Required Skills**: TypeScript, React, CSS, Vitest, React Testing Library, react-markdown
