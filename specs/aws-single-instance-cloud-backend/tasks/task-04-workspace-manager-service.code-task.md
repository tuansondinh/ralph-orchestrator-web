---
status: completed
created: 2026-03-09
started: 2026-03-10
completed: 2026-03-10
---
# Task: Step 04 - WorkspaceManager Service

## Description
Create or refine `WorkspaceManager` so cloud git workspace lifecycle stays encapsulated behind a clean service interface.

## Reference Documentation
- `specs/aws-single-instance-cloud-backend/design.md`
- `specs/aws-single-instance-cloud-backend/plan.md`
- `specs/aws-single-instance-cloud-backend/requirements.md`

## Key Source Files
- `packages/backend/src/services/WorkspaceManager.ts`
- `packages/backend/src/services/LoopService.ts`
- `packages/backend/src/services/ProjectService.ts`

## Technical Requirements
1. Provide operations for clone, prepare, pull, push, and cleanup.
2. Ensure cloud workspaces live in predictable EC2-local directories.
3. Keep git shell logic out of `LoopService`.
4. Make the interface compatible with future per-loop instance migration.

## Implementation Approach
1. Inspect the current `WorkspaceManager` and identify any inline git commands elsewhere in services.
2. Define or tighten the interface around explicit workspace lifecycle methods.
3. Route existing cloud preparation paths through the manager instead of ad hoc git operations.
4. Add focused tests for path resolution, preparation behavior, and cleanup semantics.
5. Confirm the service still supports local-mode expectations where relevant.

## Acceptance Criteria
1. `LoopService` and related cloud code call `workspaceManager` methods instead of inlining git commands.
2. Workspace paths are deterministic and tied to project/repository identity.
3. Cleanup behavior is explicit and test-covered.
4. `npm test -w @ralph-ui/backend` passes.

## Metadata
- Complexity: Medium
- Labels: backend, git, workspace
- Required Skills: service design, filesystem orchestration
