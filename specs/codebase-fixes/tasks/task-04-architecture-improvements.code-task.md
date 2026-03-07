---
status: completed
created: 2026-03-07
started: 2026-03-07
completed: 2026-03-07
---
# Task: Architecture Improvements

## Description
Add rate limiting to the chat streaming endpoint and split the oversized LoopService into focused modules.

## Background
The `/chat/stream` endpoint triggers expensive AI model calls with no rate limiting — a misbehaving client can cause runaway API costs. The LoopService at 2426 lines handles too many concerns: loop lifecycle, process spawning, metrics collection, diff generation, notification management, event parsing, and worktree resolution.

## Technical Requirements

### 1. Add rate limiting to chat stream
**File:** `packages/backend/src/app.ts`

Add a simple in-memory rate limiter for `/chat/stream` and `/trpc/chat/stream`:
- Use `@fastify/rate-limit` or a simple token-bucket implementation
- Limit to ~10 requests per minute per session (configurable via env var `RALPH_UI_CHAT_RATE_LIMIT`)
- Return 429 with an SSE error event when rate limited
- Also consider a global concurrent stream limit (e.g., max 3 simultaneous streams)

### 2. Split LoopService into focused modules
**File:** `packages/backend/src/services/LoopService.ts` (2426 lines)

Extract into separate files:
- `LoopService.ts` — core lifecycle (start, stop, restart, list, state transitions) ~400 lines
- `LoopMetricsService.ts` — metrics collection, token counting, iteration tracking
- `LoopDiffService.ts` — git diff generation, file change tracking
- `LoopNotificationService.ts` — notification creation, listing, mark-read
- `LoopEventService.ts` — Ralph event parsing, events file reading

Each extracted module should:
- Accept dependencies via constructor injection
- Export its own types/interfaces
- Be independently testable
- Be re-exported from a barrel `index.ts` for backwards compatibility

The main `LoopService` should compose these modules.

## Dependencies
- Task 03 (base ServiceError class) — the split services should use the base class

## Implementation Approach
1. Add rate limiting package and wire it up
2. Identify module boundaries in LoopService
3. Extract modules one at a time, running tests after each
4. Update imports throughout codebase
5. Verify all 71 loop tests still pass

## Acceptance Criteria

1. **Chat stream is rate limited**
   - Given a client sending rapid requests to `/chat/stream`
   - When the rate limit is exceeded
   - Then a 429 response or SSE error event is returned

2. **LoopService is split into modules**
   - Given the LoopService
   - When examining the file structure
   - Then no single file exceeds ~500 lines and each module has a single responsibility

3. **Backwards compatibility maintained**
   - Given code that imports from LoopService
   - When the refactor is complete
   - Then existing imports continue to work via re-exports

4. **All 71 loop tests pass**
   - Given the refactored LoopService
   - When running `npm test`
   - Then all existing loop tests pass without modification

## Metadata
- **Complexity**: High
- **Labels**: architecture, performance, refactor, p2
- **Required Skills**: TypeScript, Fastify, Node.js
