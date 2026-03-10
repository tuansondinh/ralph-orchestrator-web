---
status: completed
created: 2026-03-10
started: 2026-03-10
completed: 2026-03-10
---
# Task: Build OpenCodeService with Backend-Owned Transcript

## Description
Create `OpenCodeService` — the service that manages the OpenCode server process, owns the canonical in-memory chat transcript, and translates OpenCode SDK events into Ralph WebSocket events.

## Background
Ralph currently uses a homegrown `McpChatService` that drives the LLM directly. The new design replaces this with `OpenCodeService`, which spawns the OpenCode server as a child process (via `@opencode-ai/sdk`), configures it to use Ralph's `/mcp` endpoint, and acts as the sole owner of session state. Because the backend owns the transcript, any number of clients (phone, desktop, multiple tabs) can reconnect and receive the full conversation history via a snapshot — without needing a database. The event-driven architecture emits typed EventEmitter events that the WebSocket channel handler (Task 4) will forward to subscribers.

## Reference Documentation
**Required:**
- Design: specs/chat-loop-control/design.md
- Plan: specs/chat-loop-control/plan.md

## Technical Requirements
1. Create `packages/backend/src/services/OpenCodeService.ts` implementing the interface defined in design.md: `start()`, `stop()`, `isRunning()`, `healthCheck()`, `getOrCreateSession()`, `getSnapshot()`, `sendMessage()`, `confirmPermission()`, `onEvent()`, `updateModel()`.
2. Use `createOpencode()` from `@opencode-ai/sdk` (or spawn binary directly if the spike found `createOpencode()` unreliable — see `specs/chat-loop-control/research/opencode-spike-results.md`).
3. On `start()`, configure OpenCode with: (a) MCP pointing to Ralph's `/mcp` endpoint URL, (b) model and provider from `SettingsService`, (c) API key from the appropriate environment variable using `PROVIDER_ENV_VAR_MAP` from Task 2.
4. Subscribe to `client.event.subscribe()` SSE stream and translate events:
   - `message.part.updated` (TextPart delta) → emit `chat:delta`
   - `message.part.updated` (ToolPart) → emit `chat:tool-call` or `chat:tool-result`
   - `permission.updated` → emit `chat:confirm-request` and store in `pendingConfirmation`
   - `session.status` → emit `chat:status`
   - `session.error` → emit `chat:error`
   - Finalized assistant message → emit `chat:message`
5. Maintain an in-memory `ChatMessage[]` transcript: append user messages on `sendMessage()`, append/update assistant messages from incoming text deltas, track tool calls and results.
6. `getSnapshot()` must return `{ sessionId, messages, status, pendingConfirmation }` reflecting current state at any point.
7. `confirmPermission(permissionId, confirmed)` must forward to the SDK (or invoke the permission reply mechanism found in the spike), then clear `pendingConfirmation` from internal state.
8. Implement auto-restart: if the event stream ends unexpectedly, set `isRunning()` to false; the next `sendMessage()` call must re-start the server and deliver the message.
9. Register the service as a Fastify decorator (`fastify.decorate('openCodeService', ...)`) and register a `onClose` hook for graceful shutdown.
10. `updateModel(provider, model)` must call `client.config.update()` and update the internal state so future `start()` calls also use the new config.

## Dependencies
- `packages/backend/src/services/SettingsService.ts` — reads `chatProvider`, `chatModel`, and `PROVIDER_ENV_VAR_MAP` (from Task 2)
- `@opencode-ai/sdk` — installed in Task 2
- `specs/chat-loop-control/research/opencode-spike-results.md` — informs `createOpencode()` vs binary-spawn decision and permission handling strategy
- `packages/backend/src/app.ts` — for Fastify decorator and shutdown hook registration

## Implementation Approach
1. Read `opencode-spike-results.md` to decide between `createOpencode()` and direct binary spawn, and to understand how `permission.updated` payloads look.
2. Define `ChatMessage`, `ChatSnapshot`, `PendingConfirmation`, and `OpenCodeEvent` TypeScript interfaces (can live in `packages/backend/src/types/chat.ts`).
3. Implement the class with internal state: `_messages: ChatMessage[]`, `_sessionId: string | null`, `_status`, `_pendingConfirmation`, `_client`, `_isRunning`.
4. Implement `start()`: spawn OpenCode, configure MCP and model, call `client.event.subscribe()`, wire event handlers to private methods.
5. Implement event handlers: `_onTextDelta()`, `_onToolCall()`, `_onPermission()`, `_onStatus()`, `_onError()`, `_onStreamEnd()`.
6. Implement `sendMessage()`: append user `ChatMessage`, call `session.promptAsync()`.
7. Implement `getSnapshot()`, `confirmPermission()`, `updateModel()`.
8. Register Fastify plugin — create `packages/backend/src/plugins/openCodePlugin.ts` if a plugin wrapper is the project pattern.
9. Write unit tests in `packages/backend/src/services/OpenCodeService.test.ts` using a mocked SDK client.
10. Run `npm test -w @ralph-ui/backend` — all tests must pass.

## Acceptance Criteria

1. **Lifecycle**
   - Given `OpenCodeService.start()` is called
   - When `isRunning()` is checked
   - Then it returns `true`, and `stop()` brings it back to `false`

2. **Lazy Session Init**
   - Given the service is running but no session exists
   - When `getOrCreateSession()` is called
   - Then a new sessionId is returned and subsequent calls return the same id

3. **Transcript Accumulation**
   - Given the service is running and `sendMessage('hello')` is called
   - When text delta events arrive from the mocked SDK
   - Then `getSnapshot().messages` contains the user message followed by the assistant message with accumulated text

4. **Permission Handling**
   - Given a `permission.updated` event arrives from the mocked SDK
   - When `getSnapshot()` is called
   - Then `pendingConfirmation` is set; after `confirmPermission(id, true)` is called, `pendingConfirmation` is null

5. **Event Emission**
   - Given a listener is registered via `onEvent()`
   - When each OpenCode event type arrives (delta, tool-call, tool-result, permission, status, error)
   - Then the listener receives a correctly typed event for each

6. **Auto-Restart**
   - Given the SDK event stream ends unexpectedly
   - When `sendMessage()` is called next
   - Then `isRunning()` becomes true again and the message is delivered

7. **Unit Tests Pass**
   - Given all unit tests in `OpenCodeService.test.ts` are run
   - When `npm test -w @ralph-ui/backend` executes
   - Then all pass with no TypeScript errors

## Metadata
- **Complexity**: High
- **Labels**: backend, opencode, service, transcript, events
- **Required Skills**: TypeScript, Node.js, Fastify, Vitest, OpenCode SDK, EventEmitter
