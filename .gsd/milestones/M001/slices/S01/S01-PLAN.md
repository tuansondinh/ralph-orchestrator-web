# S01: Loop Output

**Goal:** Replace the custom ANSI parser (TerminalOutput.
**Demo:** Replace the custom ANSI parser (TerminalOutput.

## Must-Haves


## Tasks

- [x] **T01: 06-loop-output 01**
  - Replace the custom ANSI parser (TerminalOutput.tsx) with an xterm.js-based read-only terminal for loop output. Update the backend OutputBuffer to store raw PTY chunks instead of line-split strings, and simplify the frontend store to pass raw chunks directly to xterm.js.

Purpose: The custom ANSI parser cannot handle cursor movement, bold, underline, OSC sequences, or 256-color codes. xterm.js is a full terminal emulator that handles all escape sequences correctly. It is already a project dependency used by TerminalView.tsx.

Output: Working loop output display using xterm.js with correct rendering of all terminal escape sequences.

## Files Likely Touched

- `packages/backend/src/runner/OutputBuffer.ts`
- `packages/backend/src/services/LoopService.ts`
- `packages/frontend/src/components/loops/LoopTerminalOutput.tsx`
- `packages/frontend/src/stores/loopStore.ts`
- `packages/frontend/src/components/loops/LoopDetail.tsx`
- `packages/frontend/src/components/loops/LoopsView.tsx`
- `packages/frontend/src/components/loops/TerminalOutput.tsx`
- `packages/frontend/src/components/loops/LoopDetail.test.tsx`
- `packages/frontend/src/components/loops/TerminalOutput.test.tsx`
- `packages/frontend/src/stores/loopStore.test.tsx`
- `packages/frontend/src/components/loops/LoopsView.test.tsx`
