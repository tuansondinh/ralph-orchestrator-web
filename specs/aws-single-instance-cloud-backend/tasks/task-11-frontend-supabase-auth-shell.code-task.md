---
status: completed
created: 2026-03-09
started: 2026-03-10
completed: 2026-03-10
---
# Task: Step 11 - Frontend Supabase Auth Client, Provider, And Sign-In Page

## Description
Add the frontend auth shell for cloud mode without changing the local-mode startup flow.

## Reference Documentation
- `specs/aws-single-instance-cloud-backend/design.md`
- `specs/aws-single-instance-cloud-backend/plan.md`
- `specs/aws-single-instance-cloud-backend/requirements.md`

## Key Source Files
- `packages/frontend/src/main.tsx`
- `packages/frontend/src/providers/AppProviders.tsx`
- `packages/frontend/src/App.tsx`

## Technical Requirements
1. Initialize a Supabase browser client for cloud mode.
2. Provide auth state through a React provider/context.
3. Show a sign-in experience in cloud mode when the user is unauthenticated.
4. Skip the auth shell entirely in local mode.

## Implementation Approach
1. Inspect how the frontend currently bootstraps providers, routing, and global data clients.
2. Add a mode-aware auth provider that exposes session/user/loading state.
3. Build a simple sign-in page or gate component for email/password auth.
4. Ensure the provider does not interfere with local-mode rendering when cloud env vars are absent.
5. Add frontend tests for cloud unauthenticated rendering and local-mode bypass behavior.

## Acceptance Criteria
1. Cloud mode shows sign-in before the main app for unauthenticated users.
2. Successful auth allows the user into the app shell.
3. Local mode skips auth and renders existing UI as before.
4. `npm test -w @ralph-ui/frontend` passes.

## Metadata
- Complexity: High
- Labels: frontend, auth, supabase, react
- Required Skills: React context, auth state management
