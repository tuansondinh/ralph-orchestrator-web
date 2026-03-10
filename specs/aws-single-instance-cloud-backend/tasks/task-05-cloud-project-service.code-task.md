---
status: completed
created: 2026-03-09
started: 2026-03-10
completed: 2026-03-10
---
# Task: Step 05 - Cloud Project Service

## Description
Add GitHub-backed cloud project CRUD that uses authenticated GitHub connections and the workspace manager.

## Reference Documentation
- `specs/aws-single-instance-cloud-backend/design.md`
- `specs/aws-single-instance-cloud-backend/plan.md`
- `specs/aws-single-instance-cloud-backend/requirements.md`

## Key Source Files
- `packages/backend/src/services/ProjectService.ts`
- `packages/backend/src/services/WorkspaceManager.ts`
- `packages/backend/src/services/GitHubService.ts`

## Technical Requirements
1. Create cloud projects from selected GitHub repositories.
2. Persist the project metadata needed to reconnect to the repo/workspace later.
3. Scope projects to the authenticated user in cloud mode.
4. Reuse `WorkspaceManager` for clone/prepare behavior.

## Implementation Approach
1. Review the current project service contract and local project creation flow.
2. Add cloud-mode creation/update/read branches that accept repository metadata.
3. Use the GitHub connection data plus `WorkspaceManager` to clone and prepare the workspace.
4. Preserve the current local-mode project flow as the default path.
5. Add backend tests for cloud project create/read/list behavior and local-mode non-regression.

## Acceptance Criteria
1. Cloud project creation clones the chosen repository into an EC2 workspace path.
2. Project metadata is stored with enough information to reopen and manage the cloud project.
3. Local project creation continues to work unchanged when cloud mode is off.
4. `npm test -w @ralph-ui/backend` passes.

## Metadata
- Complexity: High
- Labels: backend, projects, github, workspace
- Required Skills: service integration, repo provisioning
