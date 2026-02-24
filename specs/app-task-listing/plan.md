# Implementation Plan: App Task Listing

## Checklist
- [ ] Step 1: Add backend task domain contracts and tRPC surface
- [ ] Step 2: Implement TaskService CLI execution with robust error mapping
- [ ] Step 3: Add frontend task API layer and Tasks view skeleton
- [ ] Step 4: Integrate Tasks tab navigation and project-page routing
- [ ] Step 5: Wire live data loading + refresh + error/empty states
- [ ] Step 6: Hardening, regression coverage, and final verification

Step 1: Add backend task domain contracts and tRPC surface
- Objective: Create the minimum backend contract so frontend can call `task.list` through tRPC.
- Implementation guidance:
  - Add `TaskRecord` type/interface and `TaskServiceError` structure.
  - Add `taskRouter` with `list` query input `{ projectId: string }`.
  - Register router on `appRouter` as `task`.
  - Start with temporary deterministic return (for example empty array) while tests are built.
- Test requirements:
  - Add/extend backend router tests to verify `task.list` exists and validates `projectId`.
  - Verify error conversion path via `asTRPCError` for task service errors.
- Integration notes:
  - Keep response shape aligned with design `TaskRecord` contract.
  - Do not change existing routers.
- Demo description:
  - From a backend caller/test, run `task.list({ projectId })` and receive JSON array response.

Step 2: Implement TaskService CLI execution with robust error mapping
- Objective: Replace temporary backend response with real Ralph CLI-backed data for a project.
- Implementation guidance:
  - Implement `TaskService.list(projectId)`:
    - Resolve project row/path from DB.
    - Resolve Ralph binary using configured settings + resolver behavior.
    - Execute `ralph tools task list --all --format json` with `cwd=project.path` (or explicit `--root`).
    - Parse stdout JSON and map to `TaskRecord[]`.
  - Map failures to explicit `TaskServiceError` (`NOT_FOUND`, `BAD_REQUEST`).
- Test requirements:
  - Service unit tests covering:
    - Success path with valid JSON.
    - Project missing.
    - Binary resolve failure.
    - CLI non-zero exit.
    - Invalid JSON output.
    - Uses project path as command root.
- Integration notes:
  - Keep command invocation deterministic and side-effect free.
  - Preserve raw CLI ordering for tasks.
- Demo description:
  - Against a seeded project path with task data, backend returns actual task list records.

Step 3: Add frontend task API layer and Tasks view skeleton
- Objective: Introduce frontend structures without full data wiring risk.
- Implementation guidance:
  - Add `taskApi` wrapper (`trpcClient.task.list.query`).
  - Add `TaskRecord` frontend type aligned with backend contract.
  - Create `TasksView` component with sections for title, refresh action area, loading placeholder, error slot, empty slot, and list renderer.
  - Initially drive component with mocked local state in tests.
- Test requirements:
  - Component tests for rendering states: loading, empty, error, populated list.
  - Verify required task fields appear in populated state.
- Integration notes:
  - Reuse existing visual patterns from Loops/Monitor views for consistency.
- Demo description:
  - Render TasksView in tests/story-like environment and confirm all UI states.

Step 4: Integrate Tasks tab navigation and project-page routing
- Objective: Make Tasks accessible in-app with minimal disruption.
- Implementation guidance:
  - Add `Tasks` to tab definitions (`TabBar`).
  - Extend project tab union/validation in `ProjectPage` (`validTabs`).
  - Route `tab === 'tasks'` to `TasksView`.
  - Ensure default project route remains unchanged (`loops`).
- Test requirements:
  - Update app/navigation tests to confirm Tasks tab link visibility.
  - Add route rendering assertion for `/project/:id/tasks`.
  - Regression checks for existing tabs.
- Integration notes:
  - Do not alter keyboard shortcut mapping unless explicitly required.
- Demo description:
  - Open project, click Tasks tab, and see Tasks view render without breaking existing tabs.

Step 5: Wire live data loading + refresh + error/empty states
- Objective: Complete end-to-end user value for task listing.
- Implementation guidance:
  - In `TasksView`, on mount/projectId change call `taskApi.list(projectId)`.
  - Add refresh button that reruns the same request.
  - Show loading indicator during fetch.
  - Show error message on failure; keep last successful list visible on refresh failure.
  - Render all task rows/cards with required fields.
- Test requirements:
  - Auto-load triggers one request on mount.
  - Refresh triggers subsequent request.
  - Failure path shows error.
  - Empty array shows empty state.
  - Closed tasks present in render output when included by fixture.
- Integration notes:
  - Avoid duplicate in-flight calls for the same trigger.
  - Keep state handling local to TasksView unless cross-tab reuse is needed.
- Demo description:
  - In running app, open Tasks tab to see list; click Refresh after changing tasks externally and observe updated UI.

Step 6: Hardening, regression coverage, and final verification
- Objective: Ensure maintainability and prevent regressions before merge.
- Implementation guidance:
  - Polish copy for loading/empty/error states.
  - Ensure backend and frontend lint/type/test suites pass for touched areas.
  - Add lightweight manual verification checklist to PR description/notes.
- Test requirements:
  - Run impacted backend tests including new task tests.
  - Run impacted frontend tests including navigation + TasksView suites.
  - Run full project tests if practical in CI.
- Integration notes:
  - Validate behavior with local Ralph install and with intentionally broken binary path.
- Demo description:
  - End-to-end walkthrough: open project -> Tasks tab auto-load -> refresh -> error simulation path.
