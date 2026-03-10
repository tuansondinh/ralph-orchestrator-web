---
status: completed
created: 2026-03-09
started: 2026-03-10
completed: 2026-03-10
---
# Task: Step 07 - Database-Authoritative Loop State

## Description
Make Postgres the source of truth for loop lifecycle state in cloud mode, with in-memory state retained only as a cache.

## Reference Documentation
- `specs/aws-single-instance-cloud-backend/design.md`
- `specs/aws-single-instance-cloud-backend/plan.md`
- `specs/aws-single-instance-cloud-backend/requirements.md`

## Key Source Files
- `packages/backend/src/services/LoopService.ts`
- `packages/backend/src/stores` not present: inspect loop state handling in services and tRPC responses
- `packages/backend/src/services/loopUtils.ts`

## Technical Requirements
1. Persist loop state transitions immediately to Postgres in cloud mode.
2. Read loop state from the database for reconnects/page loads.
3. Use the database UUID as the primary loop identifier everywhere.
4. Preserve current local-mode state flow when cloud mode is off.

## Implementation Approach
1. Map current loop state transitions and identify every place state is mutated or queried.
2. Add a cloud persistence/read model for lifecycle transitions and terminal states.
3. Update any response or subscription path that still assumes process-local state is authoritative.
4. Audit identifiers so durable APIs use loop UUIDs rather than process IDs.
5. Add backend tests for state transitions, reconnect reads, and UUID-based lookups.

## Acceptance Criteria
1. Cloud loop lifecycle changes are written to Postgres immediately.
2. Reconnect/page-load reads use database state as the source of truth.
3. Loop identity is database UUID only on durable interfaces.
4. `npm test -w @ralph-ui/backend` passes.

## Metadata
- Complexity: High
- Labels: backend, loops, state, postgres
- Required Skills: state modeling, persistence, API auditing
