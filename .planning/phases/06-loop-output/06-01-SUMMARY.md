---
phase: 06-loop-output
plan: 01
subsystem: loop-output
tags: [xterm, terminal, output-rendering, ansi, frontend, backend]
dependency_graph:
  requires: []
  provides: [xterm-loop-output, raw-chunk-buffer, output-chunk-store]
  affects: [LoopDetail, LoopsView, loopStore, OutputBuffer, LoopService]
tech_stack:
  added: [LoopTerminalOutput.tsx]
  patterns: [xterm.js-read-only-terminal, raw-chunk-passthrough, incremental-write]
key_files:
  created:
    - packages/frontend/src/components/loops/LoopTerminalOutput.tsx
  modified:
    - packages/backend/src/runner/OutputBuffer.ts
    - packages/backend/src/services/LoopService.ts
    - packages/backend/test/loop-output-persistence.test.ts
    - packages/backend/test/process-manager.test.ts
    - packages/frontend/src/components/loops/LoopDetail.tsx
    - packages/frontend/src/components/loops/LoopsView.tsx
    - packages/frontend/src/components/loops/TerminalOutput.tsx
    - packages/frontend/src/components/loops/LoopDetail.test.tsx
    - packages/frontend/src/components/loops/LoopsView.test.tsx
    - packages/frontend/src/stores/loopStore.ts
    - packages/frontend/src/stores/loopStore.test.tsx
decisions:
  - "xterm.js read-only terminal replaces custom ANSI parser for loop output rendering"
  - "OutputBuffer stores raw PTY chunks without line-splitting"
  - "Disk replay returns entire file as single chunk instead of line-split array"
metrics:
  duration: "14 minutes"
  completed: "2026-03-11"
  tasks_completed: 3
  files_modified: 12
  files_created: 1
requirements_satisfied: [LOOP-01, LOOP-02]
---

# Phase 6 Plan 1: Loop Output xterm.js Replacement Summary

Replace the custom ANSI parser (TerminalOutput.tsx) with a full xterm.js Terminal instance for loop output, backed by a raw-chunk OutputBuffer and simplified loopStore.

## Tasks Completed

### Task 1: Update backend OutputBuffer to store raw chunks and update replay paths

- `OutputBuffer.ts`: Removed `partialLine` field and line-splitting logic. `append()` now stores raw chunks directly. Renamed `maxLines` constructor param to `maxChunks`. `replay()` returns raw chunk array.
- `LoopService.ts`: `replayOutput()` DB path returns `chunk.data` as-is (no `.replace(/\n$/, '')`). `readOutputReplayFromDisk()` returns entire file as `[fileContent]` single-element array. `getOutput()` uses "chunk"/"chunks" terminology.

Commit: `3d78342`

### Task 2: Create LoopTerminalOutput xterm.js component and simplify loopStore

- `LoopTerminalOutput.tsx`: New read-only xterm.js component. `disableStdin: true`, `cursorBlink: false`. FitAddon with ResizeObserver + RAF-based sizing. Incremental chunk writing via `writtenCountRef` — appends only new chunks, clears on loop switch. Empty state overlay when `chunks.length === 0`.
- `loopStore.ts`: Replaced `outputsByLoop + outputRemaindersByLoop` with `outputChunksByLoop`. Removed `splitOutputChunk`, `applyTerminalLineControls`, `mergeLoopOutputLines`. `appendOutput`/`appendOutputChunk`/`appendOutputs` all store raw chunks as-is. Renamed `MAX_OUTPUT_LINES_PER_LOOP` to `MAX_OUTPUT_CHUNKS_PER_LOOP`.

Commit: `5dace11`

### Task 3: Wire LoopTerminalOutput into LoopDetail and LoopsView, update tests

- `LoopDetail.tsx`: Swapped `TerminalOutput` import for `LoopTerminalOutput`. Renamed `outputLines` prop to `outputChunks`.
- `LoopsView.tsx`: Reads `outputChunksByLoop` instead of `outputsByLoop + outputRemaindersByLoop`. Passes `outputChunks` to `LoopDetail`.
- `TerminalOutput.tsx`: Marked `@deprecated` with comment; retained for backward compatibility.
- Tests updated: `LoopDetail.test.tsx` mocks `LoopTerminalOutput`; `LoopsView.test.tsx` mocks `LoopTerminalOutput` and updated output assertions to check store state directly.

Commit: `fcb8ed5`

### Auto-fix: Backend test expectations (Rule 1 - Bug)

**Found during:** Task 1 verification
**Issue:** `process-manager.test.ts` OutputBuffer tests expected line-split behavior; `loop-output-persistence.test.ts` expected newlines stripped from DB chunks and disk replay as separate lines. Tests were previously passing against stale compiled `.js` artifacts.
**Fix:** Updated OutputBuffer tests to reflect raw chunk semantics. Updated DB replay expectations to include newlines. Updated disk replay expectations to single-chunk format. Added drain timeout to fix async bleed-through in warn isolation test.
**Files modified:** `packages/backend/test/process-manager.test.ts`, `packages/backend/test/loop-output-persistence.test.ts`
**Commit:** `0398e77`

## Decisions Made

1. **xterm.js read-only terminal for loop output**: Custom ANSI parser in `TerminalOutput.tsx` cannot handle cursor movement, bold, underline, OSC sequences, or 256-color. xterm.js is already a project dependency used by `TerminalView.tsx` so no new dependency added.

2. **Raw chunk passthrough**: Backend `OutputBuffer` no longer splits on newlines. Raw PTY bytes are preserved through the entire pipeline (OutputBuffer → websocket replay → loopStore → xterm.js). xterm.js handles all ANSI/VT100/OSC rendering natively.

3. **Disk replay as single chunk**: The `readOutputReplayFromDisk()` method now returns the entire file as one chunk instead of splitting on lines. xterm.js can handle a large single write and replays it as the original terminal session would have seen it.

4. **`TerminalOutput.tsx` retained as deprecated**: Not deleted to avoid breaking potential external uses. Added `@deprecated` JSDoc comment pointing to `LoopTerminalOutput`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Backend test expectations stale against cached compiled JS**
- **Found during:** Task 1 backend verification
- **Issue:** `process-manager.test.ts` OutputBuffer tests expected line-split behavior (which no longer exists). `loop-output-persistence.test.ts` expected `chunk.data.replace(/\n$/, '')` stripping (removed in Task 1) and line-split disk replay (now single-chunk). Tests had been passing against stale `.js` compiled artifacts since vitest picks up the `.ts` source via TypeScript module resolution.
- **Fix:** Updated all affected test expectations to match new raw-chunk semantics. Added 100ms drain timeout before the "does not warn" test to prevent async promise bleed-through from the preceding fire-and-forget test.
- **Files modified:** `packages/backend/test/process-manager.test.ts`, `packages/backend/test/loop-output-persistence.test.ts`
- **Commit:** `0398e77`

## Verification Results

- Backend tests: 340 passed | 1 skipped (52 test files)
- Frontend tests: 231 passed (42 test files)
- Build: `npm run build -w @ralph-ui/frontend` compiles without errors (476 modules)

## Self-Check: PASSED

- LoopTerminalOutput.tsx: FOUND (161 lines, min_lines: 40)
- OutputBuffer.ts: FOUND with `replay()` returning raw chunks
- loopStore.ts: FOUND with `outputChunksByLoop`
- Commits 3d78342, 5dace11, fcb8ed5, 0398e77: all FOUND
- Backend tests: 340 passed
- Frontend tests: 231 passed
- Build: compiles cleanly
