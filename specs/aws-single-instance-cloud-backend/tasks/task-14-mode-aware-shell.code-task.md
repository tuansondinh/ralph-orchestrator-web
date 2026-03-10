---
status: completed
created: 2026-03-09
started: 2026-03-10
completed: 2026-03-10
---
# Task: Step 14 - Mode-Aware Shell

## Description
Make the main frontend shell aware of local versus cloud capabilities and hide local-only features in cloud mode.

## Reference Documentation
- `specs/aws-single-instance-cloud-backend/design.md`
- `specs/aws-single-instance-cloud-backend/plan.md`
- `specs/aws-single-instance-cloud-backend/requirements.md`

## Key Source Files
- `packages/frontend/src/App.tsx`
- `packages/frontend/src/pages/ProjectPage.tsx`
- `packages/frontend/src/lib/backends.ts`

## Technical Requirements
1. Hide Terminal and Preview tabs in cloud mode.
2. Keep those features visible in local mode.
3. Use centralized capability flags rather than scattered conditional logic.
4. Avoid regressions to current navigation/state behavior.

## Implementation Approach
1. Identify where shell tabs and feature panes are defined today.
2. Thread the capability flags from the mode resolver into the UI shell.
3. Gate Terminal and Preview rendering in cloud mode while preserving layout stability.
4. Confirm local mode still renders the existing full feature set.
5. Add frontend tests for both cloud and local shell variants.

## Acceptance Criteria
1. Cloud mode hides Terminal and Preview.
2. Local mode still shows Terminal and Preview.
3. No unrelated UI regressions are introduced in the shell.
4. `npm test -w @ralph-ui/frontend` passes.

## Metadata
- Complexity: Medium
- Labels: frontend, shell, feature-flags
- Required Skills: React conditional rendering, UI regression testing

## Detailed Implementation Plan
1. Trace where the shell decides which tabs, panes, and actions to render today. Prefer a single capability source over sprinkling `if (cloud)` checks across multiple components.
2. Confirm which mode/capability contract already exists from Step 8 and Step 11, then thread that contract into the shell components if it is not already available where tabs are built.
3. Write tests first for:
   - Cloud mode hides Terminal and Preview affordances.
   - Local mode still renders Terminal and Preview.
   - Navigation remains stable when the hidden tabs are absent.
4. Update the shell/tab configuration so Terminal and Preview are removed in cloud mode at the source of truth for navigation, not only hidden visually after render.
5. Check any dependent empty-state, selection, or default-tab logic so the UI does not reference a now-hidden panel in cloud mode.
6. Keep all local-only functionality intact in local mode and avoid expanding the capability matrix beyond what Step 14 requires.
7. Run the targeted shell/page tests and then the frontend suite to catch regressions in default selection or layout behavior.
