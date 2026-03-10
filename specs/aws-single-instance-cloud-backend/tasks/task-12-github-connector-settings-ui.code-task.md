---
status: completed
created: 2026-03-09
started: 2026-03-10
completed: 2026-03-10
---
# Task: Step 12 - GitHub Connector Settings UI

## Description
Expose GitHub connection state and connect/disconnect actions in the settings UI for cloud users.

## Reference Documentation
- `specs/aws-single-instance-cloud-backend/design.md`
- `specs/aws-single-instance-cloud-backend/plan.md`
- `specs/aws-single-instance-cloud-backend/requirements.md`

## Key Source Files
- `packages/frontend/src/pages/SettingsPage.tsx`
- `packages/frontend/src/lib/settingsApi.ts`
- `packages/frontend/src/lib/trpc.ts`

## Technical Requirements
1. Show current GitHub connection status in settings.
2. Provide connect and disconnect entry points tied to the backend OAuth flow.
3. Hide or disable the connector UI outside cloud mode.
4. Keep the UI consistent with the existing app structure.

## Implementation Approach
1. Review the current settings page layout and data-fetching patterns.
2. Add API bindings for GitHub connection status and disconnect behavior.
3. Render a settings panel or card for the GitHub connector with clear state transitions.
4. Route connect actions into the backend OAuth start endpoint.
5. Add frontend tests for connected, disconnected, and local-mode-hidden states.

## Acceptance Criteria
1. Cloud users can see whether GitHub is connected.
2. Connect and disconnect actions are available from settings.
3. Local mode does not expose the connector UI.
4. `npm test -w @ralph-ui/frontend` passes.

## Metadata
- Complexity: Medium
- Labels: frontend, settings, github, oauth
- Required Skills: React state, auth-aware UI

## Detailed Implementation Plan
1. Read the existing frontend auth and mode plumbing added in Step 11 so the settings page uses the same cloud/local detection path instead of adding a new runtime flag.
2. Inspect the current settings page composition and identify the smallest insertion point for a GitHub connector card without disturbing unrelated settings sections.
3. Add or extend frontend API helpers for:
   - Fetching GitHub connection state from the cloud settings/backend route.
   - Starting the OAuth connect flow by redirecting the browser to the backend start endpoint.
   - Disconnecting the current connection and refreshing the visible status.
4. Write frontend tests first for three states:
   - Cloud mode with no connection shows disconnected copy and a connect CTA.
   - Cloud mode with an existing connection shows username/state and a disconnect CTA.
   - Local mode does not render the connector panel at all.
5. Implement the connector UI using existing loading/error patterns from the settings page. Keep optimistic behavior minimal; a successful disconnect can simply invalidate/refetch the status query.
6. Ensure connect actions use a normal browser navigation for OAuth start rather than trying to tunnel the flow through tRPC mutation semantics.
7. Re-run the targeted settings tests, then the relevant frontend suite, and confirm local-mode rendering remains unchanged.
8. Leave follow-on project-creation work for Step 13; this task ends once connection management is exposed and verified in settings.
