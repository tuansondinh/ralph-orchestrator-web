# Scratchpad

## 2026-03-10T23:48:48Z

Planner bootstrap for `specs/app-review-chat-streaming-mobile`.

- No runtime tasks existed at iteration start, so planner needs to seed them from the spec execution order.
- `specs/app-review-chat-streaming-mobile/plan.md` was missing and has been created as the shared implementation strategy across all six code tasks.
- The task files reference `specs/app-review-chat-streaming-mobile/design.md`, but that file is absent in the current tree; planning therefore relies on the task definitions and the current backend/frontend structure.
- The worktree is already dirty in unrelated files, so future builder iterations must avoid reverting user changes while implementing spec tasks.
- Recommended execution sequence remains backend regressions -> chat runtime unification/streaming -> settings runtime flow -> mobile shell/chat -> full app responsiveness -> final quality pass.

## 2026-03-11T00:00:00Z

Backend stability regressions completed for `specs/app-review-chat-streaming-mobile/tasks/backend-stability-regressions.code-task.md`.

- Fixed loop output persistence to tolerate minimally mocked runtimes and keep output-log writes fire-and-forget without crashing the loop handler.
- Fixed PTY exit-code propagation in `ProcessManager` so non-zero loop exits surface as `crashed`, which restored notification persistence for failed loops while keeping TTY-dependent backends working.
- Kept loop spawn command focused on binary-path propagation and PTY execution; dropped the shell pipe that broke `isTTY` for backend tests.
- Updated MCP transport expectations to match the current registered tool set, including `activate_plan_mode` and `activate_task_mode`.
- Verification passed with `npm test -w @ralph-ui/backend`, `npm run lint -w @ralph-ui/backend`, and `npm run typecheck -w @ralph-ui/backend`.
