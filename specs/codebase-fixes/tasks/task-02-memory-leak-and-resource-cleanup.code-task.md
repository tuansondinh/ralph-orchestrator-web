---
status: completed
created: 2026-03-07
started: 2026-03-07
completed: 2026-03-07
---
# Task: Memory Leak Fix and Resource Cleanup

## Description
Fix the TerminalService memory leak where completed sessions are never removed from the runtimes map, and clean up stale files (28MB debug log, stale worktrees directory).

## Background
`TerminalService.completeSession()` removes sessions from `sessionsByProjectId` but never from `this.runtimes`. This means every completed terminal session stays in memory forever, including its output buffer (up to 500 chunks per session). Over time this will cause significant memory growth.

Additionally, the repo has a 28MB `first_run_debug.log` and a stale `.worktrees/` directory that should be cleaned up.

## Technical Requirements

### 1. Fix TerminalService memory leak
**File:** `packages/backend/src/services/TerminalService.ts`

In the `completeSession` method (line 437-471):
- After setting state to `completed` and emitting the state event, schedule removal of the runtime from `this.runtimes` after a grace period (e.g., 30 seconds) to allow final replay requests
- Or immediately delete if no replay is expected after completion
- Ensure the `pty` reference is also cleaned up (it should be after `kill()` but verify)

Suggested approach:
```ts
// After emitting completed state (line 456-459):
setTimeout(() => {
  this.runtimes.delete(sessionId)
}, 30_000)
```

### 2. Fix RalphProcessService.killAll error swallowing
**File:** `packages/backend/src/services/RalphProcessService.ts`

The `killAll()` catch block (line 133-135) silently swallows all errors. At minimum, log partial failures or rethrow if critical processes couldn't be killed.

### 3. Clean up stale files
- Delete `first_run_debug.log` (28MB) from repo root
- Delete `recent_debug.log` from repo root
- Delete `debug.log` from repo root
- Verify `.worktrees/` is gitignored (it is) — no action needed there

## Dependencies
- None

## Implementation Approach
1. Fix TerminalService memory leak with grace-period cleanup
2. Add error logging to killAll
3. Delete stale log files
4. Add a unit test for the TerminalService cleanup behavior

## Acceptance Criteria

1. **Completed sessions are cleaned up**
   - Given a terminal session that has ended
   - When 30 seconds have elapsed after completion
   - Then the session runtime is removed from the internal runtimes map

2. **killAll logs partial failures**
   - Given multiple Ralph processes where some fail to kill
   - When `killAll()` is called
   - Then partial failures are logged rather than silently swallowed

3. **Stale log files removed**
   - Given the repo root directory
   - When listing files
   - Then `first_run_debug.log`, `recent_debug.log`, and `debug.log` are not present

4. **Unit test covers cleanup**
   - Given the TerminalService
   - When a session completes
   - Then a test verifies the runtime is eventually removed from the map

## Metadata
- **Complexity**: Low
- **Labels**: bugfix, memory-leak, cleanup, p0
- **Required Skills**: Node.js, TypeScript
