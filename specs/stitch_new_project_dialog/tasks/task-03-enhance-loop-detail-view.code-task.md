---
status: pending
created: 2026-02-19
started: null
completed: null
---
# Task: Enhance Loop Detail View

## Description
Redesign the Loop Detail view into a split-panel layout: a live terminal panel on the left (60%) and a metrics/status sidebar on the right (40%), adding a phase stepper, files-changed list with diff counts, and a recent events timeline.

## Background
The current `LoopDetail` component shows a basic metrics grid and a `TerminalOutput` scroll area. The design significantly expands this: the terminal occupies 60% of the viewport with a sticky "Scroll to Bottom" button; the right sidebar shows runtime + token metric cards, a 3-step phase stepper (Planning → Coding → Testing), a list of files changed with +/- diff counts, and a chronological events timeline. The breadcrumb header and Stop/Restart action buttons from the design should also be present (the current `LoopsView` already has some of this at the list level; the detail level needs the richer UI).

## Reference Documentation
**Required:**
- Design: `specs/stitch_new_project_dialog/loop_detail_expanded_view/code.html`
- Design screenshot: `specs/stitch_new_project_dialog/loop_detail_expanded_view/screen.png`

**Note:** Read the design file before beginning implementation. Pay attention to the panel split ratios and the phase stepper progress line implementation.

## Technical Requirements
1. **Split layout:** render loop detail as `flex-row` with terminal section (`flex-[0.6]`) and sidebar (`w-[40%]`).
2. **Terminal panel:** display existing terminal/log output; add a sticky "Scroll to Bottom" button that appears when not scrolled to bottom.
3. **Sidebar metric cards:** show Runtime (elapsed time, formatted as `MMm SSs`) and Tokens (count + estimated cost) in a 2-column card grid.
4. **Phase stepper:** show 3 phases — Planning, Coding, Testing — with a connecting progress line. Each phase node is: completed (filled primary circle + check icon), active (filled primary circle + spinning sync icon + glow shadow), or pending (grey circle + number). Derive the active phase from loop state data.
5. **Files changed list:** show each file modified by the current loop run with filename, relative timestamp, and diff counts (`+N` in green, `-N` in red). Source from loop events or a dedicated API field.
6. **Recent events timeline:** a vertical timeline (left border + dot markers) showing key loop lifecycle events (Loop Initialized, Plan Approved, Coding Phase Started, etc.) with timestamps.
7. **Header breadcrumb + actions:** show `Projects > {project name} > Loop #{id}` breadcrumb, running status badge with pulse animation, and Stop / Restart action buttons.
8. Add unit tests for: phase derivation logic, runtime formatting, and diff count rendering.

## Dependencies
- `LoopDetail` at `packages/frontend/src/components/loops/LoopDetail.tsx`
- `LoopsView` at `packages/frontend/src/components/loops/LoopsView.tsx`
- `TerminalOutput` component (existing — reuse inside the new terminal panel)
- Loop store / WebSocket events — check what fields are available: `phase`, `filesChanged`, `events`, `runtime`, `tokens`
- Backend loop model: confirm `filesChanged` and `events` arrays exist, or add them

## Implementation Approach
1. Read `LoopDetail.tsx`, `LoopsView.tsx`, and the loop store to understand current data shape.
2. Identify what data is already available vs. what needs to be added to the loop model/events.
3. Restructure `LoopDetail` into a `flex-row` container with two child sections.
4. Extract/create a `LoopTerminalPanel` sub-component with auto-scroll and sticky scroll button.
5. Build a `LoopPhaseStep` component accepting `phase: 'planning' | 'coding' | 'testing'` and `status: 'completed' | 'active' | 'pending'`.
6. Build a `LoopFilesChanged` component rendering the file list with diff badges.
7. Build a `LoopEventTimeline` component rendering the timeline list.
8. Compose sidebar from metric cards + phase stepper + files changed + events.
9. Add breadcrumb + header actions above the split panel.
10. Write unit tests for pure helper functions (phase derivation, time formatting).

## Acceptance Criteria

1. **Split-panel layout renders**
   - Given a loop is selected in the Loops view
   - When the loop detail opens
   - Then the view shows a terminal panel on the left and a sidebar on the right at approximately 60/40 split

2. **Terminal output displays with scroll-to-bottom button**
   - Given a loop has log output
   - When the user scrolls up in the terminal panel
   - Then a "Scroll to Bottom" button appears; clicking it scrolls back to the latest output

3. **Metric cards show runtime and tokens**
   - Given a loop is running
   - When the sidebar renders
   - Then Runtime and Tokens cards display accurate values from loop state

4. **Phase stepper reflects current phase**
   - Given a loop is in the "coding" phase
   - When the sidebar renders
   - Then Planning shows as completed, Coding shows as active (spinning icon), Testing shows as pending

5. **Files changed list displays diffs**
   - Given a loop has modified files
   - When the sidebar renders
   - Then each modified file appears with its filename and green/red +/- counts

6. **Events timeline shows lifecycle events**
   - Given a loop has emitted lifecycle events
   - When the sidebar renders
   - Then a vertical timeline lists events with relative timestamps in reverse-chronological order

7. **Breadcrumb and action buttons render**
   - Given a loop detail is open
   - When inspected
   - Then a breadcrumb showing project and loop number is visible, along with Stop and Restart buttons

8. **Unit tests for helpers**
   - Given various loop state inputs
   - When pure helper functions are called
   - Then phase derivation, runtime formatting, and diff rendering return correct outputs

## Metadata
- **Complexity**: High
- **Labels**: ui, loops, frontend, real-time
- **Required Skills**: React, TypeScript, Tailwind CSS, WebSocket/state management
