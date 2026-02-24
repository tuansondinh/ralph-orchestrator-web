Q1 (2026-02-24): Who is the primary user for this task list, and exactly what fields should each task show (for example: title, status, assignee, due date, priority)?
A1 (2026-02-24): Primary user is the normal app user. Task data follows Ralph task shape, including at least: id, title, description, status, priority, blocked_by, loop_id, created, closed. Example provided by user with ISO timestamps and numeric priority.

Q2 (2026-02-24): What is the exact outcome you want in the app for “list tasks” — read-only display, or also actions like filter, sort, search, open details, or refresh from Ralph?
A2 (2026-02-24): Required interaction is refresh; additional actions like filter/sort/search/detail are not required now.

Q3 (2026-02-24): Should the default list include all tasks (open + closed), or only active/open tasks?
A3 (2026-02-24): Default list should show all tasks, including open and closed.

Q4 (2026-02-24): On refresh, what should the user see for loading and errors (for example: spinner while fetching, non-blocking error toast/message, keep last successful list on failure)?
A4 (2026-02-24): On refresh failure, show an error message.

Q5 (2026-02-24): Should tasks load automatically when the task list screen opens, in addition to a manual refresh action?
A5 (2026-02-24): Tasks should load automatically when the task list screen opens, and users can also manually refresh.

Q6 (2026-02-24): Where in the app should this appear (new dedicated “Tasks” page, existing dashboard section, or another location)?
A6 (2026-02-24): Task list should be shown in a separate tab.

Q7 (2026-02-24): Which Ralph CLI command should the app call to fetch tasks (exact command/flags if known), and should it expect JSON output?
A7 (2026-02-24): Determine exact Ralph task-list command from CLI help (`ralph --help`) and use JSON output.
A7-Resolved (2026-02-24): Use `ralph tools task list --all --format json` to fetch tasks (includes open/closed/failed and returns JSON).

Q8 (2026-02-24): Should the app run this command against the current app workspace by default, or should the user select/configure a target project root path?
A8 (2026-02-24): Execute task listing in the directory of the project path (target project root), not an arbitrary current shell directory.

Q9 (2026-02-24): If the configured project path does not exist or is not a Ralph project, what should the tab do (for example: show inline error only, and do not retry automatically)?
A9 (2026-02-24): User flagged uncertainty: running task-list command in configured project path may not work with local Ralph orchestrator setup.

Q10 (2026-02-24): Should we pause requirements for a quick research check to verify where `ralph tools task list` reads tasks from (project path vs orchestrator/runtime workspace)?
A10 (2026-02-24): Yes — run quick research to verify the true task source for `ralph tools task list`.
Research Note R1 (2026-02-24): Verified with CLI help + command runs that `ralph tools task list` is root-scoped (uses cwd unless `--root` is passed). In this workspace task records are read from `.ralph/agent/tasks.jsonl`; using an empty root returns no tasks.
Q11 (2026-02-24): Will a local Ralph installation work for task listing?
A11 (2026-02-24): Yes, as long as backend can resolve the Ralph binary (local node_modules/.bin or PATH/configured binary) and run `ralph tools task list --all --format json` against the selected project root (`cwd` or `--root`). If Ralph is missing or not executable, show an error message in the Tasks tab.
Process Note (2026-02-24): User indicated they have more tasks and wants to continue to next work item.
