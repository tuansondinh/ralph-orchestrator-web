---
status: pending
created: 2026-02-19
started: null
completed: null
---
# Task: Redesign New Project Dialog

## Description
Enhance the New Project dialog to match the updated design: add a Ralph Config field, add an auto-detected Environment badge, and update the modal's visual style to use the deep-purple theme (`#131022` / `#4b2bee`).

## Background
The current `NewProjectDialog` only has two fields (project name and path) and uses the existing zinc dark theme. The design adds a third row with a "Ralph Config" text input and an "Environment" badge that auto-detects the runtime (Node.js, Python, etc.) from the selected project path. The modal styling should be updated to match the design's deeper purple color scheme.

## Reference Documentation
**Required:**
- Design: `specs/stitch_new_project_dialog/new_project_dialog/code.html`
- Design screenshot: `specs/stitch_new_project_dialog/new_project_dialog/screen.png`

**Note:** Read the design file before beginning implementation. The exact hex values and class names in the HTML are authoritative for color/spacing decisions.

## Technical Requirements
1. Add a **Ralph Config** text input field (default value: `ralph.yml`) in a new row below the Project Path field.
2. Add an **Environment badge** in the same row as Ralph Config — auto-detect environment by checking for `package.json`, `requirements.txt`, `Cargo.toml`, etc. in the selected project path directory. Default to "Unknown" if nothing is detected.
3. Environment detection should fire when the Project Path field value changes (debounced, ~300ms). Call the backend if needed, or do a best-effort check via the existing project API.
4. Update modal background/border colors to match the design (`bg-[#141122]`, `border-[#2d284d]`, overlay `bg-[#0a0812]/80`).
5. The "Create Project" button should carry the primary purple color (`bg-[#4b2bee]`) and glow shadow.
6. The `ralphConfig` field value must be included in the form submission payload to the backend.
7. Add unit tests for the environment detection logic (pure function mapping filename → runtime label).

## Dependencies
- `NewProjectDialog` at `packages/frontend/src/components/project/NewProjectDialog.tsx`
- Project creation API call (existing tRPC or REST handler)
- Backend project type: confirm whether `ralphConfig` field is accepted; if not, add it or store locally

## Implementation Approach
1. Read the existing `NewProjectDialog.tsx` and note the current form state shape.
2. Add `ralphConfig` to local form state (default `'ralph.yml'`).
3. Add `detectedEnv` state (`{ label: string; icon: string } | null`).
4. Implement `detectEnvironment(path: string)` — checks the path string for known filenames using simple heuristics (pure function, easily testable).
5. Wire path change → debounced `detectEnvironment` call → update `detectedEnv`.
6. Render the new Config + Environment row below the path row.
7. Update all color classes on the modal root, overlay, header, footer, and buttons.
8. Pass `ralphConfig` in the submit handler.

## Acceptance Criteria

1. **Ralph Config field renders**
   - Given the New Project dialog is open
   - When the user views the form
   - Then a "Ralph Config" text input is visible with default value `ralph.yml`

2. **Environment badge detects runtime**
   - Given the user types a valid local path containing `package.json` into the Project Path field
   - When 300ms have passed after typing stops
   - Then the Environment badge updates to show "Node.js" (or appropriate runtime)

3. **Environment badge shows Unknown for empty/unrecognized paths**
   - Given the Project Path field contains a path with no recognizable config files
   - When environment detection runs
   - Then the badge displays "Unknown" or a neutral placeholder

4. **Ralph Config included in submission**
   - Given all required fields are filled
   - When the user clicks "Create Project"
   - Then the form submission payload includes the `ralphConfig` value

5. **Modal uses updated color scheme**
   - Given the dialog is open
   - When inspected visually
   - Then the modal background, borders, and primary button match the design's purple palette

6. **Unit tests for detectEnvironment**
   - Given a set of known filenames (package.json, requirements.txt, Cargo.toml, go.mod)
   - When `detectEnvironment` is called with those paths
   - Then it returns the correct runtime label for each

## Metadata
- **Complexity**: Low
- **Labels**: ui, dialog, frontend
- **Required Skills**: React, TypeScript, Tailwind CSS
