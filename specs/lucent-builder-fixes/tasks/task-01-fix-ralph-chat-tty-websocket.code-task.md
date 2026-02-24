---
status: completed
created: 2026-02-19
started: 2026-02-19
completed: 2026-02-19
---
# Task: Fix Ralph Chat – TTY Startup & WebSocket Connection

## Description
Ralph chat sessions fail to start with "stdin is not a terminal", and the frontend WebSocket connection drops immediately due to React StrictMode's double-invoke of effects. Both issues prevent the chat UI from functioning.

## Background
Two independent root causes block the chat feature:

1. **Backend – TTY detection:** `ProcessManager.spawn` uses `stdio: 'pipe'`, which is correct for data piping, but Ralph CLI detects that stdin is not a TTY and exits with an error. The fix is to pass a flag (e.g., `--no-tty` or `--pipe`) when spawning Ralph in chat mode, or investigate what argument Ralph accepts to suppress the TTY check.

2. **Frontend – React StrictMode double-invoke:** `useWebSocket` opens a WebSocket on mount. In development, React StrictMode calls the effect cleanup and re-runs it immediately (`doubleInvokeEffectsOnFiber`). The first socket is closed before it opens, producing "WebSocket is closed before the connection is established." The fix is to guard the connect call so a pending connection is properly cancelled before a new one starts, or delay the connection until after the StrictMode cycle settles.

## Reference Documentation
**Required:**
- Design: specs/lucent-builder-fixes/design.md (if created)

**Key source files:**
- `packages/backend/src/services/ChatService.ts` – `startSession` spawns Ralph
- `packages/backend/src/runner/ProcessManager.ts` – `spawn` uses `stdio: 'pipe'`
- `packages/frontend/src/hooks/useWebSocket.ts` – WebSocket lifecycle

## Technical Requirements
1. Determine the correct Ralph CLI flag for non-TTY / piped mode and pass it in `ChatService.startSession` when spawning.
2. If Ralph has no such flag, investigate using `node-pty` or a similar pseudo-TTY library to satisfy the TTY check without blocking stdin piping.
3. Fix `useWebSocket` so that React StrictMode double-invoke does not produce a broken socket — cancel or ignore the first open attempt if the effect is immediately cleaned up.
4. After fixing, the browser console must show no WebSocket errors on initial load.

## Dependencies
- Ralph CLI binary (`@ralph-orchestrator/ralph-cli`) — check its `--help` for a no-tty/pipe flag
- `packages/backend/src/runner/ProcessManager.ts` — may need a `tty` spawn option
- `packages/frontend/src/hooks/useWebSocket.ts`

## Implementation Approach
1. Run `ralph --help` / `ralph chat --help` to discover available flags for non-interactive mode.
2. Add the discovered flag to the args array in `ChatService.startSession` (around line 209).
3. In `useWebSocket`, add a `cancelled` flag inside the effect closure; skip the `connect()` call or close the socket immediately if `cancelled` is true when the connection attempt resolves.
4. Alternatively, wrap the initial connection in a short `setTimeout(connect, 0)` so the StrictMode cleanup fires before the socket is created.
5. Smoke-test by opening the chat panel — no console errors, messages stream correctly.

## Acceptance Criteria

1. **Ralph chat starts without TTY error**
   - Given a project exists and a chat session is started via the UI
   - When the backend spawns the Ralph process
   - Then the process starts successfully with no "stdin is not a terminal" error in backend logs

2. **WebSocket connects cleanly in dev mode**
   - Given the frontend is running with `npm run dev` (React StrictMode active)
   - When the chat panel mounts
   - Then no WebSocket errors appear in the browser console and the connection status shows "connected"

3. **Chat messages flow end-to-end**
   - Given a chat session is active and WebSocket is connected
   - When the user sends a message
   - Then Ralph's response appears in the chat UI within a reasonable time

4. **Unit test: useWebSocket StrictMode safety**
   - Given a test that mounts and immediately unmounts the hook (simulating StrictMode)
   - When remounted
   - Then only one WebSocket instance exists and no errors are thrown

## Metadata
- **Complexity**: High
- **Labels**: bug, chat, websocket, backend, frontend
- **Required Skills**: Node.js child_process/PTY, React hooks, WebSocket lifecycle
