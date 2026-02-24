# Objective
Implement the approved "App Task Listing" feature for Lucent Builder using the plan in `specs/app-task-listing/`.

# Spec Reference
- Base spec directory: `specs/app-task-listing/`
- Primary documents:
  - `design.md`
  - `plan.md`
  - `requirements.md`
  - `research/task-list-source.md`

# Scope
Add a new project-level **Tasks** tab that lists Ralph tasks for the selected project and supports manual refresh.

# Key Requirements
1. Add a **Tasks** tab in project navigation and route `/project/:id/tasks`.
2. Auto-load tasks when Tasks tab opens.
3. Provide manual refresh action.
4. Fetch tasks via Ralph CLI command:
   - `ralph tools task list --all --format json`
5. Execute command in selected project root (`cwd=project.path` or explicit `--root project.path`).
6. Display task fields at minimum:
   - `id`, `title`, `description`, `status`, `priority`, `blocked_by`, `loop_id`, `created`, `closed`
7. Show clear error message on failures (binary/path/CLI/JSON parsing).
8. Keep existing tabs and functionality unchanged.

# Implementation Constraints
1. Follow incremental steps from `specs/app-task-listing/plan.md`.
2. Keep feature read-only (no task mutation, no filters/search/sort).
3. Use existing backend/frontend architecture patterns (tRPC, service error mapping, component style).

# Acceptance Criteria (Given-When-Then)
1. Given a project with Ralph task data, when user opens `/project/:id/tasks`, then tasks are fetched once and rendered.
2. Given closed tasks exist, when Tasks tab loads, then closed tasks are shown.
3. Given user clicks Refresh, when fetch succeeds, then list updates with latest CLI output.
4. Given Ralph binary cannot be resolved, when tab loads or refreshes, then error message is displayed.
5. Given project path is invalid/inaccessible, when task list is requested, then backend returns error and UI shows it.
6. Given CLI returns `[]`, when Tasks tab loads, then UI shows an empty state.
7. Given user navigates other tabs, when switching tabs, then existing behavior remains unchanged.

# Testing Requirements
1. Add backend tests for TaskService and tRPC task router error/success paths.
2. Add frontend tests for TasksView states (loading, empty, error, populated) and refresh behavior.
3. Update navigation tests to include Tasks tab and route rendering.
4. Run impacted backend/frontend tests before finalizing.

# Deliverables
1. Backend task service + router integration.
2. Frontend task API + Tasks view + tab/page wiring.
3. Tests and any required small refactors.
4. Short implementation summary referencing changed files.
