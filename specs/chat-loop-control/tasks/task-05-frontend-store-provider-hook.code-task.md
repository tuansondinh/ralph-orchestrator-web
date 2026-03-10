---
status: completed
created: 2026-03-10
started: 2026-03-10
completed: 2026-03-10
---
# Task: Build ChatSessionProvider, chatSessionStore, and useChatSession

## Description
Create the singleton WebSocket event bridge (`ChatSessionProvider`), the unified Zustand store (`chatSessionStore`), and the consumer hook (`useChatSession`) that together form the frontend chat layer.

## Background
The existing frontend has separate `chatStore` and `chatOverlayStore` stores that both independently connect to WebSocket events, causing duplicate subscriptions and split state. The new design centralizes all WebSocket event handling in a single provider mounted at the app root. The provider writes to one `chatSessionStore`; all chat UI components (ChatTab in Task 7, ChatBubble in Task 8) read from that store via `useChatSession()` — no component ever subscribes to WebSocket events directly. This avoids double-processing and enables seamless cross-tab/cross-device sync via the `chat:sync` → `chat:snapshot` flow.

## Reference Documentation
**Required:**
- Design: specs/chat-loop-control/design.md
- Plan: specs/chat-loop-control/plan.md

## Technical Requirements
1. Create `packages/frontend/src/stores/chatSessionStore.ts` — a Zustand store with state: `messages: ChatMessage[]`, `isStreaming: boolean`, `status: 'idle' | 'busy' | 'error' | 'disconnected'`, `sessionId: string | null`, `pendingConfirmation: PendingConfirmation | null`.
2. Implement store actions: `addMessage(msg)`, `appendDelta(text)`, `finalizeCurrent()`, `setStatus(status)`, `setPendingConfirmation(pc)`, `hydrateFromSnapshot(snapshot)`, `reset()`, `addError(error)`.
3. `appendDelta(text)` must find the current streaming assistant message and append the text chunk to its `content` field. If no streaming message exists, create one with `isStreaming: true`.
4. `finalizeCurrent()` must set `isStreaming: false` on the last assistant message.
5. `hydrateFromSnapshot(snapshot)` must replace all state fields atomically from the `ChatSnapshot` payload — messages, status, sessionId, pendingConfirmation.
6. Create `packages/frontend/src/providers/ChatSessionProvider.tsx` — mounted once in `AppShell` (or `AppShellRoutes`). It must:
   - Call `useWebSocket({ channels: ['opencode-chat'], onMessage: handler })` exactly once.
   - Route each incoming event type to the correct store action (see design.md event table).
   - On WebSocket connect (or reconnect), send `{ type: 'chat:sync' }` to hydrate from the backend snapshot.
   - Export a `ChatSendContext` React context that provides the `send` function from `useWebSocket`.
7. Create `packages/frontend/src/hooks/useChatSession.ts` — reads `messages`, `isStreaming`, `status`, `pendingConfirmation` from `chatSessionStore`; gets `send` from `ChatSendContext`; exposes:
   - `sendMessage(text: string)`: adds an optimistic user `ChatMessage` to the store and sends `{ type: 'chat:send', message: text }` via WebSocket.
   - `confirmAction(permissionId: string, confirmed: boolean)`: sends `{ type: 'chat:confirm', permissionId, confirmed }` and clears `pendingConfirmation` from local store.
8. Mount `ChatSessionProvider` in `AppShell` (or equivalent top-level layout component) wrapping all routes.
9. Export `ChatMessage`, `ChatSnapshot`, `PendingConfirmation` TypeScript interfaces from a shared types file (e.g. `packages/frontend/src/types/chat.ts`) so both store and hook use them.

## Dependencies
- `packages/frontend/src/hooks/useWebSocket.ts` (or equivalent) — existing WebSocket hook
- `packages/frontend/src/AppShell.tsx` (or equivalent) — mount point for the provider
- Task 4 backend (WebSocket channel) must be complete for integration; unit tests can be written against mocked WebSocket
- `packages/frontend/src/stores/` — existing store directory for placement
- `packages/frontend/src/hooks/` — existing hook directory for placement

## Implementation Approach
1. Define `ChatMessage`, `ChatSnapshot`, `PendingConfirmation` interfaces in `packages/frontend/src/types/chat.ts`.
2. Create `chatSessionStore.ts` with all state and actions. Use `create<ChatSessionState>()(...)` Zustand pattern. Export `useChatSessionStore` and a `resetChatSessionStore()` helper for tests.
3. Write store unit tests in `packages/frontend/src/stores/chatSessionStore.test.ts` (file must be `.test.tsx` per vitest config): test every action, with special attention to `appendDelta` accumulation, `finalizeCurrent`, and `hydrateFromSnapshot` full-replace behavior.
4. Create `ChatSessionProvider.tsx`: import `useChatSessionStore`, implement the `onMessage` handler switch, implement `useEffect(() => { send({ type: 'chat:sync' }) }, [isConnected])`, and provide `ChatSendContext`.
5. Write provider unit tests in `packages/frontend/src/providers/ChatSessionProvider.test.tsx`: mock `useWebSocket`, verify single subscription, verify each event type maps to correct store action, verify `chat:sync` sent on connect.
6. Create `useChatSession.ts`: compose store reads with context send. Write hook tests in `packages/frontend/src/hooks/useChatSession.test.tsx`.
7. Add `<ChatSessionProvider>` to `AppShell.tsx` (wrap children).
8. Run `npm test -w @ralph-ui/frontend` — all tests must pass.

## Acceptance Criteria

1. **appendDelta Accumulation**
   - Given the store has no current assistant message
   - When `appendDelta('Hello')` then `appendDelta(' world')` are called
   - Then `messages` contains one assistant message with `content: 'Hello world'` and `isStreaming: true`

2. **finalizeCurrent**
   - Given a streaming assistant message exists
   - When `finalizeCurrent()` is called
   - Then that message has `isStreaming: false`

3. **hydrateFromSnapshot**
   - Given the store has existing messages and a pending confirmation
   - When `hydrateFromSnapshot({ messages: [], status: 'idle', sessionId: 'abc', pendingConfirmation: null })` is called
   - Then the store contains exactly the snapshot's state — previous messages are gone

4. **Provider: Single Subscription**
   - Given `ChatSessionProvider` is mounted
   - When it renders
   - Then `useWebSocket` is called exactly once with `channels: ['opencode-chat']`

5. **Provider: Sync on Connect**
   - Given a mock WebSocket that fires an `onConnected` callback
   - When the provider mounts
   - Then `send({ type: 'chat:sync' })` is called

6. **Provider: Event Routing**
   - Given the mock WebSocket delivers a `chat:delta` event with `text: 'hi'`
   - When the provider's `onMessage` handler processes it
   - Then `chatSessionStore.getState().messages` contains the accumulated text

7. **sendMessage Optimistic Update**
   - Given `useChatSession().sendMessage('test')` is called
   - When the hook executes
   - Then an optimistic user message appears in the store immediately and `send({ type: 'chat:send', message: 'test' })` is called

8. **Frontend Tests Pass**
   - Given all new test files run
   - When `npm test -w @ralph-ui/frontend` executes
   - Then all pass with no TypeScript errors

## Metadata
- **Complexity**: High
- **Labels**: frontend, zustand, websocket, provider, hook
- **Required Skills**: TypeScript, React, Zustand, Vitest, React Testing Library
