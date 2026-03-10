---
status: completed
created: 2026-03-10
started: 2026-03-10
completed: 2026-03-10
---
# Task: Wire `opencode-chat` WebSocket Channel and Message Handlers

## Description
Extend the existing WebSocket handler with a new `opencode-chat` channel that bridges `OpenCodeService` events to subscribed clients bidirectionally, following the established channel-based subscription pattern.

## Background
Ralph's WebSocket handler already multiplexes multiple channels (e.g. `loop:{id}:state`, `terminal:{id}:output`) over a single `/ws` connection. Chat follows the same model: clients subscribe to `opencode-chat`, send `chat:send` / `chat:confirm` / `chat:sync` messages, and receive all `OpenCodeService` events broadcast to that channel. Because this channel is global (not project-scoped), auth handling differs slightly from loop/terminal channels — in cloud mode a valid user session is required, but no project-level access check is needed. Isolating this in a separate task from `OpenCodeService` keeps the WS handler change reviewable and testable on its own.

## Reference Documentation
**Required:**
- Design: specs/chat-loop-control/design.md
- Plan: specs/chat-loop-control/plan.md

## Technical Requirements
1. Add `'opencode-chat'` to the channel resolution logic in `packages/backend/src/api/websocket.ts` (or wherever `resolveChannelProjectId` is defined). Return `null` for the project ID since this channel is global.
2. Extend the `ClientMessage` union type with three new discriminated members:
   - `{ type: 'chat:send'; message: string }`
   - `{ type: 'chat:confirm'; permissionId: string; confirmed: boolean }`
   - `{ type: 'chat:sync' }`
3. Parse the new message types in `parseClientMessage()` (or equivalent validation/parsing function).
4. Add inbound message handlers:
   - `chat:send` → call `fastify.openCodeService.sendMessage(msg.message)`
   - `chat:confirm` → call `fastify.openCodeService.confirmPermission(msg.permissionId, msg.confirmed)`
   - `chat:sync` → call `fastify.openCodeService.getSnapshot()`, send `{ type: 'chat:snapshot', ...snapshot }` back to the requesting client only (not broadcast)
5. Forward `OpenCodeService` events: on `OpenCodeService.onEvent()`, broadcast each event to all WebSocket clients currently subscribed to the `opencode-chat` channel — not all connected clients.
6. In cloud mode, require an authenticated user session for the `opencode-chat` channel subscription (follow the same auth check pattern used by other protected channels).
7. Ensure that clients subscribed to other channels (e.g. `loop:123:state`) do NOT receive `opencode-chat` events.

## Dependencies
- `packages/backend/src/api/websocket.ts` — existing WS handler to extend
- `packages/backend/src/services/OpenCodeService.ts` — from Task 3 (must be complete)
- `packages/backend/src/app.ts` — for `fastify.openCodeService` decorator (registered in Task 3)
- Existing channel subscription logic, `ClientMessage` type, `parseClientMessage()` function

## Implementation Approach
1. Read the existing WebSocket handler to understand the channel subscription data structure and how broadcast is currently implemented per-channel.
2. Add `opencode-chat` to `resolveChannelProjectId`; return `null` (global channel, no project).
3. Add the three new `ClientMessage` variants to the union type and their parsing cases.
4. In the `opencode-chat` subscription handler: call `openCodeService.onEvent()` once per WebSocket connection to register a listener that sends events to this client; deregister the listener on disconnect.
5. Add the three new inbound message dispatch cases.
6. For `chat:sync`, call `getSnapshot()` and send the result to `ws` (the requesting socket) directly, not via broadcast.
7. Write unit tests in `packages/backend/src/api/websocket.test.ts`:
   - Subscription works, events reach only `opencode-chat` subscribers
   - Non-subscribers do not receive chat events
   - `chat:send`, `chat:confirm`, `chat:sync` each trigger the correct service method
8. Write an integration test using real `createApp()` + `ws` library: connect two clients, subscribe one to `opencode-chat`, emit a mock event via `openCodeService`, verify only the subscribed client receives it.
9. Run `npm test -w @ralph-ui/backend` — all tests must pass.

## Acceptance Criteria

1. **Channel Isolation**
   - Given two WebSocket clients are connected, only one subscribed to `opencode-chat`
   - When `OpenCodeService` emits a `chat:delta` event
   - Then only the subscribed client receives the event; the other client receives nothing

2. **`chat:send` Dispatch**
   - Given a client is subscribed to `opencode-chat`
   - When it sends `{ type: 'chat:send', message: 'hello' }`
   - Then `openCodeService.sendMessage('hello')` is called exactly once

3. **`chat:confirm` Dispatch**
   - Given a client is subscribed to `opencode-chat`
   - When it sends `{ type: 'chat:confirm', permissionId: 'perm-1', confirmed: true }`
   - Then `openCodeService.confirmPermission('perm-1', true)` is called

4. **`chat:sync` Response**
   - Given a client sends `{ type: 'chat:sync' }`
   - When `openCodeService.getSnapshot()` returns a snapshot
   - Then that client receives `{ type: 'chat:snapshot', ...snapshot }` and no other client does

5. **Integration: Two Clients**
   - Given two real WebSocket clients connected to a `createApp()` test server
   - When client A subscribes to `opencode-chat` and client B does not
   - Then a mock event broadcast from `openCodeService` reaches client A only

6. **Unit Tests Pass**
   - Given all tests in the WebSocket test file run
   - When `npm test -w @ralph-ui/backend` executes
   - Then all pass with no TypeScript errors

## Metadata
- **Complexity**: Medium
- **Labels**: backend, websocket, channel, opencode
- **Required Skills**: TypeScript, Fastify, WebSocket, Vitest, ws library
