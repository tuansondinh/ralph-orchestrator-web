# App Task Listing Summary

## Artifacts
- `specs/app-task-listing/rough-idea.md`
- `specs/app-task-listing/requirements.md`
- `specs/app-task-listing/research/task-list-source.md`
- `specs/app-task-listing/design.md`
- `specs/app-task-listing/plan.md`
- `specs/app-task-listing/summary.md`

## What Was Defined
1. A new project-level **Tasks** tab will be added.
2. Tasks auto-load on tab open and support manual refresh.
3. The list includes all task states (including closed/failed).
4. Task data is fetched via:
   - `ralph tools task list --all --format json`
5. Fetch must be project-scoped (`cwd=project.path` or `--root project.path`).
6. Failures (missing/invalid binary, invalid project path, CLI/JSON errors) surface as user-visible error messages.

## Research Outcome
- Confirmed `ralph tools task list` is root-scoped.
- Confirmed local Ralph installation works when backend can resolve executable path.
- Confirmed task data in this environment maps to selected root storage (`.ralph/agent/tasks.jsonl`).

## Implementation Plan Status
- Design approved.
- Implementation plan approved.
- Work is ready for execution using spec-driven flow.

## Suggested Next Steps
1. Execute implementation against `specs/app-task-listing/plan.md` step-by-step.
2. Use preset pipeline:
   - `ralph run --config presets/pdd-to-code-assist.yml`
3. Or simpler flow:
   - `ralph run --config presets/spec-driven.yml`
