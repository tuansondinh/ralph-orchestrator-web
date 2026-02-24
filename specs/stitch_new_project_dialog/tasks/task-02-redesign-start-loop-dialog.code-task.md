---
status: pending
created: 2026-02-19
started: null
completed: null
---
# Task: Redesign Start Loop Dialog

## Description
Convert the Start Loop UI from an inline panel to a proper centered modal, add a "prompt file import" section, and update the visual style to match the design.

## Background
The current `StartLoopDialog` renders as an inline collapsible panel (`border-zinc-700 bg-zinc-900 p-4`) rather than a modal overlay. The design shows a full-screen-overlay modal (`max-w-2xl`) with a textarea for the prompt, a divider labeled "Or import from file", a file path input, a Config Preset dropdown, and an Exclusive Mode checkbox. The existing inline variant should be replaced with this modal pattern to be consistent with the New Project dialog.

## Reference Documentation
**Required:**
- Design: `specs/stitch_new_project_dialog/start_new_loop_dialog/code.html`
- Design screenshot: `specs/stitch_new_project_dialog/start_new_loop_dialog/screen.png`

**Note:** Read the design file before beginning implementation.

## Technical Requirements
1. Render `StartLoopDialog` as a centered modal overlay (backdrop + panel), not an inline element.
2. Add a **Prompt** `<textarea>` (6 rows, monospace, with "Markdown supported" hint).
3. Add a **divider section** ("Or import from file") between the textarea and file path input.
4. Add a **Prompt file path** text input (with folder icon prefix) that accepts a file path. When a path is provided, it takes precedence over the typed prompt — or both can be passed to the backend.
5. Keep the **Config Preset** dropdown (existing logic for loading presets dynamically).
6. Keep the **Exclusive Mode** checkbox.
7. The "Start Loop" button uses `bg-primary` purple.
8. Backdrop click or Escape key closes the modal.
9. Add a unit test verifying that providing a file path clears/disables the textarea (or vice versa, depending on chosen UX) and that the correct payload field is sent.

## Dependencies
- `StartLoopDialog` at `packages/frontend/src/components/loops/StartLoopDialog.tsx`
- Loop creation API: confirm whether `promptFile` field is supported alongside `prompt`; add if missing
- Any parent component that renders `StartLoopDialog` (check how it is currently shown/hidden)

## Implementation Approach
1. Read `StartLoopDialog.tsx` and its parent to understand current show/hide mechanism.
2. Refactor: wrap content in a modal overlay `<div class="fixed inset-0 ...">` pattern (matching `NewProjectDialog` structure for consistency).
3. Replace inline textarea with the styled version from the design (monospace, dark bg, "Markdown supported" subtext).
4. Add the "Or import from file" divider (horizontal rule + centered label).
5. Add `promptFile` field to local form state; wire it to the file path input.
6. Ensure the submit handler sends either `prompt` or `promptFile` (or both) to the backend.
7. Wire Escape key and backdrop click to the existing close handler.
8. Update colors to match design (`surface-dark`, `border-dark`, `primary` button).

## Acceptance Criteria

1. **Modal renders as overlay**
   - Given the "Start Loop" action is triggered
   - When the dialog opens
   - Then it appears as a centered modal with a backdrop overlay, not an inline panel

2. **Prompt textarea works**
   - Given the dialog is open
   - When the user types in the Prompt textarea
   - Then the text is captured and included in the loop start payload

3. **File import section renders**
   - Given the dialog is open
   - When the user views the form
   - Then a divider labeled "Or import from file" and a file path input are visible below the textarea

4. **File path used in payload**
   - Given the user enters a file path in the Prompt file path input
   - When the user clicks "Start Loop"
   - Then the `promptFile` field is included in the API request

5. **Config preset and exclusive mode preserved**
   - Given the dialog is open
   - When the user changes the Config Preset or toggles Exclusive Mode
   - Then these values are correctly included in the loop start payload

6. **Modal dismisses on Escape and backdrop click**
   - Given the dialog is open
   - When the user presses Escape or clicks outside the modal panel
   - Then the dialog closes without submitting

7. **Unit test for payload construction**
   - Given a prompt text and no file path
   - When the form is submitted
   - Then the payload contains `prompt` and not `promptFile` (and vice versa when only a file path is given)

## Metadata
- **Complexity**: Medium
- **Labels**: ui, dialog, loops, frontend
- **Required Skills**: React, TypeScript, Tailwind CSS
