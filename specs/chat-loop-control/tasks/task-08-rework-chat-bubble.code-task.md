---
status: completed
created: 2026-03-10
started: 2026-03-10
completed: 2026-03-10
---
# Task: Rework ChatBubble to Use Shared Session

## Description
Rewire `ChatOverlay` (the desktop floating chat bubble) to read from and write to the shared `chatSessionStore` via `useChatSession()`, and ensure it is properly mounted in the app shell.

## Background
The existing `ChatOverlay` has its own `chatOverlayStore` with its own WebSocket connection and session logic. Under the new architecture, there is one source of truth — the `chatSessionStore` written by `ChatSessionProvider`. Both ChatTab and ChatBubble must read from the same store, so a user can start a conversation from the chat tab on their phone, then pick it up from the desktop bubble and see the same history. This task removes the overlay's independent state management and replaces it with `useChatSession()`, which provides the same interface as ChatTab uses. The model selector is also removed from the bubble (settings moved to global settings page in Task 9).

## Reference Documentation
**Required:**
- Design: specs/chat-loop-control/design.md
- Plan: specs/chat-loop-control/plan.md

## Technical Requirements
1. Rework `packages/frontend/src/components/chat/ChatOverlay.tsx` (or the equivalent bubble/overlay component):
   - Remove all `chatOverlayStore` reads and dispatches.
   - Remove the model selector UI element.
   - Replace all session state reads and actions with `useChatSession()`.
   - Keep existing toggle open/close behavior (local `isOpen: boolean` state is fine).
2. The overlay must show the same messages as `ChatTab` — it reads from the shared `chatSessionStore`.
3. Render `ToolConfirmationCard` inline when `pendingConfirmation` from `useChatSession()` is non-null.
4. Sending a message via the bubble must call `sendMessage` from `useChatSession()`, which routes through `ChatSessionProvider` to the backend.
5. Verify that `ChatOverlay` is mounted in `AppShell` (or `AppShellRoutes`) as a sibling to the main content area. If it is not currently mounted there, add the mount point rendered only on desktop (e.g. with `hidden md:block` or a media query check).
6. On desktop, both `ChatTab` (at `/project/:id/chat`) and `ChatBubble` should display the same live conversation simultaneously — verify this in tests by seeding the shared store.

## Dependencies
- `packages/frontend/src/hooks/useChatSession.ts` — from Task 5 (must be complete)
- `packages/frontend/src/providers/ChatSessionProvider.tsx` — must be mounted in shell
- `packages/frontend/src/stores/chatSessionStore.ts` — shared store from Task 5
- `packages/frontend/src/AppShell.tsx` (or equivalent) — shell mount point to verify/add
- `packages/frontend/src/components/chat/ToolConfirmationCard.tsx` — reused

## Implementation Approach
1. Read the current `ChatOverlay.tsx` to identify `chatOverlayStore` imports, model selector markup, and any independent WebSocket subscriptions.
2. Remove `chatOverlayStore` imports and all reads/writes to it.
3. Remove the model selector element.
4. Add `const { messages, isStreaming, pendingConfirmation, sendMessage, confirmAction } = useChatSession()`.
5. Update message list rendering to use `messages` from the hook.
6. Add `ToolConfirmationCard` conditional render.
7. Verify `AppShell.tsx`: check whether `<ChatOverlay />` (or equivalent) is already rendered there. If not, add it — render conditionally for desktop only.
8. Write render tests in `packages/frontend/src/components/chat/ChatOverlay.test.tsx`:
   - Messages from shared store are displayed
   - Toggle open/close works (click button → overlay visible/hidden)
   - `ToolConfirmationCard` appears when `pendingConfirmation` is set
   - Sending a message via the bubble calls `sendMessage` from `useChatSession()`
9. Write a test that seeds `chatSessionStore` with messages, renders both `ChatView` and `ChatOverlay`, and asserts both show the same messages.
10. Run `npm test -w @ralph-ui/frontend` — all tests must pass.

## Acceptance Criteria

1. **Shared Messages**
   - Given `chatSessionStore` has a list of messages
   - When `ChatOverlay` renders (open state)
   - Then the same messages are displayed as in `ChatView`

2. **Toggle Open/Close**
   - Given `ChatOverlay` is mounted and closed
   - When the toggle button is clicked
   - Then the chat panel becomes visible; clicking again hides it

3. **Send via Bubble**
   - Given `ChatOverlay` is open and the user types and submits a message
   - When the input is submitted
   - Then `sendMessage` from `useChatSession()` is called and the optimistic user message appears

4. **ToolConfirmationCard in Bubble**
   - Given `useChatSession()` returns a non-null `pendingConfirmation`
   - When `ChatOverlay` renders in open state
   - Then `ToolConfirmationCard` is visible

5. **No Model Selector**
   - Given the reworked `ChatOverlay` renders
   - When inspecting the DOM
   - Then there is no model selector dropdown

6. **Shell Integration**
   - Given `AppShell` renders on a desktop viewport
   - When the shell renders
   - Then `ChatOverlay` is present in the DOM (even if initially closed)

7. **Tests Pass**
   - Given all render tests run
   - When `npm test -w @ralph-ui/frontend` executes
   - Then all pass with no TypeScript errors

## Metadata
- **Complexity**: Medium
- **Labels**: frontend, chat-bubble, overlay, desktop, shared-state
- **Required Skills**: TypeScript, React, Zustand, Vitest, React Testing Library
