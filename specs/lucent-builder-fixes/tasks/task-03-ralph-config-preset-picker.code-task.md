---
status: completed
created: 2026-02-19
started: 2026-02-19
completed: 2026-02-19
---
# Task: Ralph Config Preset Picker

## Description
Copy the Ralph preset YAML files into the project, expose them via a tRPC endpoint, and add a UI that lets users pick a preset when configuring a Ralph run. The default preset is `code-assist.yml` and the user can change the default.

## Background
Ralph presets live in `/Users/sonwork/Documents/ralph-orchestrator/presets/` (e.g., `code-assist.yml`, `pdd-to-code-assist.yml`, `spec-driven.yml`, etc.). Currently the app hard-codes the ralph config path via `ralph.yml` in the project root. Users should be able to choose from available presets in the UI rather than editing files manually.

The `SettingsService` already exists for storing per-project or global settings in SQLite. The tRPC router in `packages/backend/src/trpc/router.ts` is the right place to add new endpoints.

## Reference Documentation
**Required:**
- Design: specs/lucent-builder-fixes/design.md (if created)

**Key source files:**
- `packages/backend/src/trpc/router.ts` – tRPC routes
- `packages/backend/src/services/SettingsService.ts` – settings storage
- `packages/backend/src/lib/ralph.ts` – Ralph binary resolution
- `/Users/sonwork/Documents/ralph-orchestrator/presets/` – preset source files
- `packages/frontend/src/` – frontend (add preset picker UI component)

## Technical Requirements
1. Copy all preset YAML files from the ralph-orchestrator presets directory into `packages/backend/presets/` (committed to the repo).
2. Add a tRPC query `presets.list` that reads the `presets/` directory and returns `{ name: string; filename: string }[]`.
3. Add a tRPC query `presets.get` that reads and returns the content of a named preset file.
4. Add a tRPC mutation `settings.setDefaultPreset` and query `settings.getDefaultPreset` using `SettingsService` — key: `ralph.defaultPreset`, default value: `code-assist.yml`.
5. In the frontend, add a preset picker dropdown/select in the Ralph run configuration panel.
6. The selected preset filename is passed to Ralph when spawning (replacing the hard-coded `ralph.yml` path or using `--config <preset>`).
7. The UI shows the current default preset and allows the user to change and save it.

## Dependencies
- `/Users/sonwork/Documents/ralph-orchestrator/presets/` — source preset files to copy
- `packages/backend/src/services/SettingsService.ts` — for storing default preset
- `packages/backend/src/trpc/router.ts` — for new endpoints
- `packages/backend/src/lib/ralph.ts` — may need to pass `--config` flag
- Frontend Ralph run configuration component (locate via grep for the run/start button)

## Implementation Approach
1. Copy preset YAML files: `cp /Users/sonwork/Documents/ralph-orchestrator/presets/*.yml packages/backend/presets/`
2. Add `presets.list` tRPC procedure: reads `presets/` dir with `fs.readdir`, returns array of `{ name, filename }` (name = filename without `.yml`).
3. Add `presets.get` tRPC procedure: validates filename is in the presets dir (prevent path traversal), reads and returns file content.
4. Add `settings.getDefaultPreset` / `settings.setDefaultPreset` using the existing `getSetting`/`setSetting` pattern in `app.ts`.
5. On the frontend, create a `PresetPicker` component (select element) that fetches `presets.list` and shows the current default.
6. When the user starts a Ralph run, pass `--config <path-to-preset>` to the Ralph CLI invocation.
7. Persist the user's selection in settings so it survives restarts.

## Acceptance Criteria

1. **Presets are bundled in the repo**
   - Given the project is cloned fresh
   - When `ls packages/backend/presets/` is run
   - Then all YAML preset files are present including `code-assist.yml`

2. **Presets list endpoint returns available presets**
   - Given the backend is running
   - When `presets.list` is queried via tRPC
   - Then it returns an array with at least `code-assist`, `pdd-to-code-assist`, and `spec-driven` entries

3. **Default preset is code-assist.yml**
   - Given no default has been explicitly configured
   - When `settings.getDefaultPreset` is queried
   - Then it returns `"code-assist.yml"`

4. **User can change the default preset**
   - Given the UI is open and multiple presets are available
   - When the user selects `pdd-to-code-assist` and saves
   - Then `settings.getDefaultPreset` returns `"pdd-to-code-assist.yml"` and the selection persists after reload

5. **Ralph is invoked with the selected preset**
   - Given a project has `spec-driven.yml` set as its preset
   - When a Ralph run is started
   - Then the spawned Ralph process receives `--config <path>/spec-driven.yml` in its args

6. **Unit test: presets.list reads directory**
   - Given a temp directory with two YAML files
   - When `presets.list` is called with that directory
   - Then it returns both files with correct names

## Metadata
- **Complexity**: Medium
- **Labels**: feature, ralph, config, ui
- **Required Skills**: tRPC, Node.js fs, React, YAML
