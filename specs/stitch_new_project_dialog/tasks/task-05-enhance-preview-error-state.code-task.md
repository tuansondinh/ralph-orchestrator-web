---
status: pending
created: 2026-02-19
started: null
completed: null
---
# Task: Enhance Preview Error State

## Description
Redesign the Preview tab's error state into a polished error card with a copyable code block showing the crash output, a top toolbar with URL and status badge, and a metadata footer showing process ID and timestamp.

## Background
The current `PreviewError` component displays a minimal error message with Restart and Configure buttons. The design substantially enhances this: a top toolbar shows the preview URL and a pulsing "Stopped" status badge; the main area renders a centered error card with a warning icon, a `<pre>`/code block displaying the actual error text (with a copy-to-clipboard button on hover), primary "Restart Server" and secondary "Configure Command" action buttons, and a subtle footer row with process ID and timestamp metadata. The toolbar and error card should replace the current `PreviewError` rendering.

## Reference Documentation
**Required:**
- Design: `specs/stitch_new_project_dialog/preview_tab_error_state/code.html`
- Design screenshot: `specs/stitch_new_project_dialog/preview_tab_error_state/screen.png`

**Note:** Read the design file before beginning implementation. Note the dotted radial background pattern used behind the error card and the hover-reveal copy button in the code block.

## Technical Requirements
1. **Preview toolbar** — a fixed-height header bar (`h-16`) containing:
   - Left: URL pill (`localhost:{port}` with globe icon)
   - Center: status badge — green "Ready", amber "Starting", red "Stopped", etc. (with pulsing dot for active states)
   - Right: Refresh, Open in New Tab, and Settings icon buttons
2. **Error card** — centered in the remaining space, `max-w-lg`:
   - Amber warning icon in a circular ring badge
   - Title ("Dev Server Crashed") and subtitle ("exited with code {exitCode}")
   - Code block (`<pre>`, monospace, dark bg with red border tint) showing the error output text; hover reveals a copy-to-clipboard icon button in the top-right corner
   - "Restart Server" (primary, `bg-primary`) and "Configure Command" (secondary, outlined) buttons side by side
   - Footer strip: process ID on left, timestamp on right
3. **Dotted background** — subtle radial-gradient dot pattern (`opacity-[0.03]`) behind the error card area.
4. The toolbar must also render in non-error states (Ready, Starting, Stopped-without-error) to serve as a persistent preview header. Currently `PreviewToolbar` exists — either extend it or replace it with this new design.
5. The copy-to-clipboard button uses `navigator.clipboard.writeText()` with a brief "Copied!" visual confirmation.
6. Add unit tests for: clipboard copy behavior (mock `navigator.clipboard`), status badge color derivation from status string, and error card rendering with various `exitCode` and `errorText` props.

## Dependencies
- `PreviewError` at `packages/frontend/src/components/preview/PreviewView.tsx` (or its own file — check)
- `PreviewToolbar` component (existing — may need restructuring)
- `ConfigurePreviewDialog` — the "Configure Command" button should open this
- Preview store/state: confirm what fields are available (`url`, `port`, `status`, `errorText`, `exitCode`, `pid`, `stoppedAt`)

## Implementation Approach
1. Read `PreviewView.tsx` and related preview components to understand current structure.
2. Identify `PreviewToolbar` and `PreviewError` — plan whether to refactor in-place or extract to new files.
3. Implement `PreviewStatusBadge` — pure component mapping status → label, color, and pulse indicator.
4. Rebuild `PreviewToolbar` with the new three-section layout (URL pill / status badge / actions).
5. Rebuild `PreviewError` with: warning icon ring, title, subtitle with exit code, code block + copy button, action buttons, and footer metadata.
6. Add the radial dot background in the error state container.
7. Wire the copy button to `navigator.clipboard.writeText(errorText)` + temporary "Copied!" state.
8. Wire "Configure Command" button to open `ConfigurePreviewDialog`.
9. Ensure the toolbar is always rendered (not just in error state) and `PreviewError` replaces the iframe when status is error/stopped.
10. Write unit tests for the helper functions and `PreviewError` rendering.

## Acceptance Criteria

1. **Toolbar renders in all states**
   - Given the Preview tab is active
   - When the dev server is Ready, Starting, or in Error state
   - Then the toolbar is always visible with the correct URL pill and status badge

2. **Status badge reflects current state**
   - Given the dev server status changes to "Stopped"
   - When the toolbar renders
   - Then the badge shows a red pulsing dot and "Stopped" label

3. **Error card renders on crash**
   - Given the dev server exits with an error
   - When the Preview tab is viewed
   - Then the error card is shown with the warning icon, exit code in the subtitle, and the error stack trace in the code block

4. **Copy button copies error text**
   - Given the error card is displayed with error text
   - When the user hovers over the code block and clicks the copy icon
   - Then `navigator.clipboard.writeText` is called with the error text and a brief "Copied!" state is shown

5. **Restart Server button works**
   - Given the error card is displayed
   - When the user clicks "Restart Server"
   - Then the preview restart action is triggered

6. **Configure Command opens dialog**
   - Given the error card is displayed
   - When the user clicks "Configure Command"
   - Then the `ConfigurePreviewDialog` opens

7. **Footer shows process metadata**
   - Given the error card is displayed with process info
   - When the footer is inspected
   - Then the process ID and crash timestamp are shown

8. **Unit tests**
   - Given various status strings and error props
   - When `PreviewStatusBadge` and `PreviewError` are rendered in tests
   - Then they produce correct output; clipboard mock is called correctly on copy

## Metadata
- **Complexity**: Medium
- **Labels**: ui, preview, frontend
- **Required Skills**: React, TypeScript, Tailwind CSS, Clipboard API
