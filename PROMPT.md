## Objective

Implement two improvements to the lucent-builder app. Full spec is in `specs/lucent-builder-improvements/`.

## Tasks (implement in order)

1. **Fix Stop Button** — In `LoopService.stop()`, replace `processManager.kill(runtime.processId)` with an invocation of `ralph loops stop --loop-id <loopId>` (verify exact flags with `ralph loops stop --help`). This ensures Ralph and all its child processes are cleanly terminated.

2. **Code Review Diff Viewer** — Add a "Review Changes" tab to the loop detail view. The tab appears when loop state is `completed`, `needs-review`, `merged`, or `stopped`. It shows a unified git diff of the loop's worktree branch vs the base branch.

## Spec Directory

`specs/lucent-builder-improvements/`

Key files:
- `design.md` — full architecture, component interfaces, data models, acceptance criteria
- `plan.md` — 5-step numbered implementation plan

## Acceptance Criteria

**Stop Button:**
- Given a running loop, when Stop is clicked, `ralph loops stop` is invoked (not OS kill signals).
- Given an already-stopped loop, Stop is a no-op.

**Diff Viewer:**
- Given a completed loop with a worktree, the "Review Changes" tab shows: summary stats header, left sidebar with file list (+/- counts), unified diff per file (30 lines default, expandable).
- Given a loop with no worktree, an empty state message is shown.
- Given a file with >30 diff lines, a "Show all N lines" button reveals remaining lines.

## Constraints

- Monorepo: `packages/backend` (Fastify + tRPC) and `packages/frontend` (React + Vite)
- All tests must pass: `npm run test`
- Build must pass: `npm run build`
- Typecheck must pass: `npm run typecheck`
- No new npm dependencies unless absolutely necessary
- Follow existing code patterns (tRPC procedures, Tailwind dark theme, Zustand stores)
