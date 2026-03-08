# Codebase Concerns

**Analysis Date:** 2026-03-08

## Tech Debt

**LoopService is a god object (1531 lines, 31 async methods):**
- Issue: Single class handles loop lifecycle, process management, output parsing, file I/O, DB persistence, polling, and event emission
- Files: `packages/backend/src/services/LoopService.ts`
- Impact: Difficult to test in isolation, hard to reason about state transitions, high coupling
- Fix approach: Continue extracting sub-services (LoopDiffService, LoopMetricsService, LoopNotificationService already extracted). Candidates: output handling, DB persistence, process lifecycle

**Router file is a flat procedure list (838 lines):**
- Issue: `packages/backend/src/trpc/router.ts` defines all tRPC procedures in a single file with repetitive `.catch((error) => asTRPCError(error))` on every call
- Files: `packages/backend/src/trpc/router.ts`
- Impact: Hard to navigate, no logical grouping, error handling boilerplate
- Fix approach: Split into sub-routers by domain (loop, chat, project, settings, task). Use tRPC middleware for error wrapping

**app.ts doubles as route handler (571 lines):**
- Issue: `packages/backend/src/app.ts` contains SSE streaming endpoints, rate limiting logic, and all service wiring alongside Fastify setup
- Files: `packages/backend/src/app.ts`
- Impact: Mixing concerns makes it hard to modify streaming behavior or add new HTTP routes
- Fix approach: Extract SSE chat streaming into dedicated route module; move rate limiter to middleware

**Large frontend components without extraction:**
- Issue: Several components exceed 400 lines with mixed concerns
- Files: `packages/frontend/src/components/terminal/TerminalView.tsx` (563), `packages/frontend/src/hooks/useChat.ts` (525), `packages/frontend/src/components/loops/LoopsView.tsx` (508), `packages/frontend/src/components/loops/StartLoopDialog.tsx` (469)
- Impact: Hard to test individual behaviors, risk of unintended side effects
- Fix approach: Extract sub-components and custom hooks

## Known Bugs

**App.test.tsx has 3 failing tests:**
- Symptoms: Tests fail due to disabled Preview/Monitor tabs (NavLink changed to span)
- Files: `packages/frontend/src/App.test.tsx`
- Trigger: Run frontend test suite
- Workaround: Known pre-existing issue per project memory; fix requires restoring TabBar.tsx changes

## Security Considerations

**Terminal input has no size validation on WebSocket:**
- Risk: Arbitrary-length `data` string accepted in `terminal.input` messages with no bounds checking
- Files: `packages/backend/src/api/websocket.ts` (lines 94-103)
- Current mitigation: Only type checking (`typeof body.data === 'string'`)
- Recommendations: Add max length validation on terminal input data; validate `cols`/`rows` are within reasonable bounds for resize

**Production defaults to 0.0.0.0 bind:**
- Risk: When `NODE_ENV=production` and no `RALPH_UI_BIND_HOST` is set, server binds to all interfaces
- Files: `packages/backend/src/lib/safety.ts` (line 23)
- Current mitigation: `allowsDangerousOperations()` returns false for non-loopback, blocking destructive tRPC calls and WebSocket operations
- Recommendations: Document this behavior prominently; consider requiring explicit opt-in for non-loopback binding

**WebSocket channel subscriptions are not authenticated:**
- Risk: Any connected client can subscribe to any channel (loop output, terminal output, chat messages)
- Files: `packages/backend/src/api/websocket.ts` (lines 78-91)
- Current mitigation: Origin checking via `isOriginAllowed()`
- Recommendations: Acceptable for local dev tool; document risk if deploying remotely

## Performance Bottlenecks

**In-memory chat rate limit map never cleaned up:**
- Problem: `chatRateLimitMap` in `packages/backend/src/app.ts` grows unbounded as sessions are created; old timestamps are filtered per-access but stale session keys persist forever
- Files: `packages/backend/src/app.ts` (line 244)
- Cause: No periodic cleanup of expired session entries
- Improvement path: Add a periodic cleanup interval (e.g., every 5 minutes) or use a TTL-based Map implementation

**WebSocket polling intervals for state updates:**
- Problem: Multiple `setInterval` timers per WebSocket connection for polling loop/chat/preview state
- Files: `packages/backend/src/api/websocket.ts` (line 382)
- Cause: Polling architecture rather than pure event-driven push
- Improvement path: Services already emit events; wire event listeners directly instead of polling where possible

## Fragile Areas

**LoopService process state machine:**
- Files: `packages/backend/src/services/LoopService.ts`
- Why fragile: Complex state transitions (queued, running, merging, merged, needs-review, orphan) with many silent catch blocks (lines 151, 470, 965, 1129, 1183, 1310, 1320, 1376) that swallow errors
- Safe modification: Always check the 1939-line test file `packages/backend/test/loop.test.ts` for coverage of the state you're modifying
- Test coverage: Good (1939 lines of tests) but silent catches can mask regressions

**WebSocket handler with complex subscription logic:**
- Files: `packages/backend/src/api/websocket.ts` (590 lines)
- Why fragile: Single function manages subscriptions, polling, cleanup, and terminal I/O for all channels; cleanup function must handle all resource teardown
- Safe modification: Ensure `cleanup()` function (triggered on close/error) properly clears all intervals and listeners
- Test coverage: Has dedicated test file `packages/backend/test/websocket.test.ts`

## Scaling Limits

**SQLite single-writer:**
- Current capacity: Single concurrent write transaction
- Limit: Under heavy concurrent loop/chat activity, write contention could cause SQLITE_BUSY errors
- Scaling path: Acceptable for local dev tool; WAL mode would help if needed

**In-memory state across services:**
- Current capacity: All loop runtimes, terminal sessions, process managers held in memory Maps
- Limit: Dozens of concurrent loops/terminals could consume significant memory
- Scaling path: Not a concern for intended single-user local usage

## Test Coverage Gaps

**No dedicated tests for LoopDiffService, LoopMetricsService, LoopNotificationService:**
- What's not tested: Recently extracted sub-services lack their own unit test files
- Files: `packages/backend/src/services/LoopDiffService.ts`, `packages/backend/src/services/LoopMetricsService.ts`, `packages/backend/src/services/LoopNotificationService.ts`
- Risk: These are tested indirectly through LoopService integration tests, but isolated behavior may have gaps
- Priority: Low (covered transitively via `loop.test.ts` and `notification.test.ts`)

**No tests for DevPreviewManager (853 lines):**
- What's not tested: `DevPreviewManager` has `preview.test.ts` (517 lines) but given the service's complexity, coverage may be incomplete
- Files: `packages/backend/src/services/DevPreviewManager.ts`
- Risk: Preview process lifecycle bugs
- Priority: Medium

**No tests for HatsPresetService, RalphProcessService (partial):**
- What's not tested: `HatsPresetService` has no dedicated test file; `RalphProcessService` has `ralph-process.test.ts`
- Files: `packages/backend/src/services/HatsPresetService.ts`
- Risk: Preset loading/validation bugs
- Priority: Low

---

*Concerns audit: 2026-03-08*
