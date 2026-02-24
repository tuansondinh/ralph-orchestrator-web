---
status: completed
created: 2026-02-19
started: 2026-02-19
completed: 2026-02-19
---
# Task: Add Debug Logging Throughout the App

## Description
Add structured debug logging to the backend and frontend so developers can observe what is happening at runtime — especially during process spawning, WebSocket events, and chat/preview state transitions.

## Background
The Fastify instance is currently created with `logger: false` (`packages/backend/src/app.ts`). Key services (`ChatService`, `DevPreviewManager`, `ProcessManager`) have no logging. On the frontend, `useWebSocket` tracks reconnection state in React state but logs nothing to the console. This makes it very hard to diagnose issues like the Ralph chat startup failure or WebSocket disconnects.

## Reference Documentation
**Required:**
- Design: specs/lucent-builder-fixes/design.md (if created)

**Key source files:**
- `packages/backend/src/app.ts` – Fastify creation (`logger: false`)
- `packages/backend/src/serve.ts` – startup/shutdown logging
- `packages/backend/src/services/ChatService.ts` – session lifecycle
- `packages/backend/src/services/DevPreviewManager.ts` – preview lifecycle
- `packages/backend/src/runner/ProcessManager.ts` – process spawn/kill
- `packages/backend/src/api/websocket.ts` – WS connection events
- `packages/frontend/src/hooks/useWebSocket.ts` – connection lifecycle

## Technical Requirements
1. Enable the Fastify logger with a sensible level (`info` or `debug`) controlled by an env var (e.g., `LOG_LEVEL`, default `info`).
2. Add `console.debug` / `console.log` / `console.error` calls in `ChatService` at: session start, message send, process state change, session end.
3. Add logging in `DevPreviewManager` at: preview start, port assignment, output parsing (URL detected), process crash/stop.
4. Add logging in `ProcessManager` at: spawn (command + args + pid), kill, stdout/stderr data (truncated, e.g., first 200 chars).
5. Add logging in the WebSocket API handler (`websocket.ts`) for: new connection, subscribe, disconnect, message broadcast.
6. On the frontend, add `console.debug` in `useWebSocket` for: connect attempt, connected, reconnecting, disconnected, message received (type only).
7. Log level must be controllable — do not log sensitive data (env vars, secrets).

## Dependencies
- `packages/backend/src/app.ts` — Fastify logger config
- All backend service and runner files listed above

## Implementation Approach
1. In `app.ts`, change `Fastify({ logger: false })` to `Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' } })`.
2. Pass the Fastify logger (or a child logger) into services that need it — or use `console` for simplicity given the existing pattern.
3. Add log statements at entry/exit of key methods in `ChatService`, `DevPreviewManager`, and `ProcessManager`.
4. In `websocket.ts`, log connection open/close and channel subscription events.
5. In `useWebSocket.ts`, add `console.debug('[ws]', ...)` calls at state transitions.
6. Keep log messages concise and prefixed (e.g., `[ChatService]`, `[Preview]`, `[WS]`).

## Acceptance Criteria

1. **Fastify request logging enabled**
   - Given the backend starts with `LOG_LEVEL=debug`
   - When an HTTP or tRPC request is received
   - Then Fastify logs the request method, URL, and response status to stdout

2. **Chat session lifecycle logged**
   - Given a chat session is started
   - When the session starts, a message is sent, and the session ends
   - Then `[ChatService]` prefixed log lines appear for each lifecycle event including project ID and session ID

3. **Preview lifecycle logged**
   - Given a preview is started for a project
   - When the process starts and becomes ready
   - Then `[Preview]` log lines appear showing port, command, and detected URL

4. **WebSocket events logged on backend**
   - Given a frontend client connects
   - When it subscribes to channels and later disconnects
   - Then `[WS]` log lines appear for connect, subscribe, and disconnect

5. **Frontend WebSocket status logged**
   - Given the frontend loads in a browser with devtools open
   - When the WebSocket connects, reconnects, or disconnects
   - Then `[ws]` prefixed messages appear in the browser console

6. **Unit test: log calls are made**
   - Given ChatService is constructed with a mock logger
   - When startSession and sendMessage are called
   - Then the mock logger receives the expected log calls

## Metadata
- **Complexity**: Low
- **Labels**: logging, observability, dx
- **Required Skills**: Fastify, Node.js, React
