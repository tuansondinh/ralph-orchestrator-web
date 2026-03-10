---
status: completed
created: 2026-03-09
started: 2026-03-10
completed: 2026-03-10
---
# Task: Step 09 - tRPC Router Auth Gating And Cloud Routes

## Description
Update tRPC procedures so cloud mode routes are auth-gated and the new cloud project/loop capabilities are exposed through the API layer.

## Reference Documentation
- `specs/aws-single-instance-cloud-backend/design.md`
- `specs/aws-single-instance-cloud-backend/plan.md`
- `specs/aws-single-instance-cloud-backend/requirements.md`

## Key Source Files
- `packages/backend/src/trpc/router.ts`
- `packages/backend/src/trpc/context.ts`
- `packages/frontend/src/lib/trpc.ts`

## Technical Requirements
1. Gate cloud-only procedures on authenticated users in cloud mode.
2. Add the procedures needed for GitHub-backed project and loop persistence flows.
3. Preserve existing local-mode procedures and contracts where possible.
4. Return clear authorization errors for unauthenticated cloud calls.

## Implementation Approach
1. Review the current router structure and group procedures by local-only, shared, and cloud-only concerns.
2. Add reusable auth-guard helpers that consume the Supabase user from context.
3. Introduce the cloud procedures needed by later frontend tasks, keeping response types stable and explicit.
4. Update frontend tRPC client usage only where procedure names or shapes change.
5. Add backend tests for procedure authorization and basic happy-path cloud operations.

## Acceptance Criteria
1. Unauthenticated cloud-mode procedure calls fail with authorization errors.
2. Authenticated cloud-mode clients can reach the new cloud project and loop procedures.
3. Local-mode clients continue to access existing behavior without Supabase auth.
4. `npm test -w @ralph-ui/backend` passes.

## Metadata
- Complexity: High
- Labels: backend, trpc, auth, api
- Required Skills: tRPC, TypeScript API contracts
