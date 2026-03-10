---
status: investigating
trigger: "Investigate issue: loops-stuck-with-opencode-gemini"
created: 2026-03-10T00:00:00Z
updated: 2026-03-10T00:00:00Z
---

## Current Focus

hypothesis: Confirmed. The executed loop implementation launches `ralph run` through `bash -lc` without `tty: true`, while chat sessions allocate a PTY and the loop tests already expect PTY-backed execution for TTY-dependent backends.
test: Consolidate code and test evidence into a concise diagnosis with recommended fix and regression coverage.
expecting: The failing focused loop test and the executed JavaScript loop service should point to the same missing `tty: true` in the loop spawn path.
next_action: summarize root cause, evidence, and recommended fix/tests without changing code

## Symptoms

expected: Starting a loop from the UI should launch Ralph and begin producing progress/output when using opencode or gemini backends.
actual: Loop appears stuck and only shows the initial instructions / prompt.
errors: No explicit frontend error reported. Handover notes mention repeated recovery/task.resume behavior.
reproduction: Start a loop from the Loops page in cloud deployment where opencode and gemini are installed and terminal commands for those CLIs work.
started: Current unresolved blocker documented in handover_max.md.

## Eliminated

## Evidence

- timestamp: 2026-03-10T00:00:00Z
  checked: packages/backend/src/services/ChatService.js
  found: `startRuntime()` calls `processManager.spawn(..., { cwd, tty: true })` for chat backends.
  implication: Ralph chat sessions deliberately run inside a PTY for interactive backends.

- timestamp: 2026-03-10T00:00:00Z
  checked: packages/backend/src/services/LoopService.js
  found: `start()` builds a shell command and calls `processManager.spawn(projectId, 'bash', ['-lc', shellCommand], { cwd: runCwd })` with no `tty: true`.
  implication: The executed loop path does not receive a PTY, unlike chat sessions using the same Ralph binary and backends.

- timestamp: 2026-03-10T00:00:00Z
  checked: packages/backend/src/runner/ProcessManager.js
  found: PTY allocation only happens when `opts.tty` is truthy; otherwise the raw command is spawned with ordinary pipes.
  implication: The loop path definitively runs non-interactively today.

- timestamp: 2026-03-10T00:00:00Z
  checked: packages/backend/test/loop.test.ts
  found: The suite already contains `it('starts loops under a PTY so TTY-dependent backends can complete', ...)`, using a mock Ralph binary with `requireTty: true`, and asserting `handle?.tty === true`.
  implication: The intended behavior is already encoded in tests and directly matches the reported production symptom.

- timestamp: 2026-03-10T00:00:00Z
  checked: focused test run `npx vitest run packages/backend/test/loop.test.ts -t "starts loops under a PTY so TTY-dependent backends can complete"`
  found: The test fails at `expect(handle?.tty).toBe(true)` because the actual handle has `tty=false`.
  implication: The root cause is reproducible locally in the current repo without cloud-only assumptions.

- timestamp: 2026-03-10T00:00:00Z
  checked: current working tree state
  found: `packages/backend/src/services/LoopService.ts` now has an uncommitted local edit adding `tty: true`, but the checked-in `LoopService.js` used by tests/runtime still lacks it.
  implication: A TypeScript-only local edit has not changed the active behavior; runtime artifacts are out of sync.

- timestamp: 2026-03-10T00:00:00Z
  checked: handover_max.md
  found: Handover notes say `opencode` and `gemini` work from the server terminal, but loop logs mostly show the expanded prompt with repeated recovery / `task.resume` behavior.
  implication: CLI installation is not the issue; the failure appears only in the app-managed loop execution path, consistent with the PTY mismatch.

## Resolution

root_cause: The executed loop implementation starts `ralph run` without a PTY even though `opencode` and `gemini` style backends, plus the repo's own loop test, expect PTY-backed execution. That leaves the backend at the initial prompt/bootstrap stage under loop orchestration, matching the stalled prompt-only output and repeated recovery behavior.
fix: No code change applied in this investigation. Recommended fix is to update the executed loop implementation so the loop spawn path allocates a PTY, and to keep the runtime source pair (`.ts` and `.js`, or source and built output) in sync while preserving output capture for `debug.log` and `.ralph-ui/loop-logs/*.log`.
verification: Verified by direct code inspection across the executed JavaScript loop path, chat path, and ProcessManager, plus a focused failing test that reproduces the missing-PTY condition locally.
files_changed: []
