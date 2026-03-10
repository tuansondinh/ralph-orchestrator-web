---
status: completed
created: 2026-03-09
started: 2026-03-10
completed: 2026-03-10
---
# Task: Step 13 - Cloud Project Creation From GitHub Repositories

## Description
Extend project creation so cloud users can select a GitHub repository and create a cloud-backed project from it.

## Reference Documentation
- `specs/aws-single-instance-cloud-backend/design.md`
- `specs/aws-single-instance-cloud-backend/plan.md`
- `specs/aws-single-instance-cloud-backend/requirements.md`

## Key Source Files
- `packages/frontend/src/lib/projectApi.ts`
- `packages/frontend/src/pages/ProjectPage.tsx`
- `packages/frontend/src/stores/projectStore.ts`

## Technical Requirements
1. Load repositories from the authenticated GitHub connection.
2. Allow cloud users to choose a repo during project creation.
3. Call the cloud project creation backend flow and reflect provisioning status.
4. Preserve the existing local project creation flow for local mode.

## Implementation Approach
1. Inspect the current project creation UI and stores to find the cleanest insertion point.
2. Add a mode-aware branch that fetches GitHub repositories and surfaces repo selection.
3. Call the new cloud project API and update project state after creation completes.
4. Keep the local flow intact and defaulted when cloud mode is inactive.
5. Add frontend tests for cloud repo selection and local-mode non-regression.

## Acceptance Criteria
1. Cloud users can create projects by selecting a GitHub repository.
2. The UI reflects success/failure from the backend provisioning flow.
3. Local project creation continues to work unchanged.
4. `npm test -w @ralph-ui/frontend` passes.

## Metadata
- Complexity: High
- Labels: frontend, projects, github, cloud
- Required Skills: React forms, async data flows

## Detailed Implementation Plan
1. Review the existing new-project flow end to end:
   - UI entry point and dialog/page component.
   - Store mutations that persist a newly created project.
   - Any existing mode branching introduced for cloud mode.
2. Identify the backend route added by the cloud project service work and the GitHub repo-list route the UI must call. Reuse existing request/client helpers rather than creating a parallel network stack.
3. Write tests for the cloud path before implementation:
   - Cloud mode loads repository choices and allows selection.
   - Successful submit calls the cloud create flow and updates UI/store state.
   - Local mode still shows the original create-project form and behavior.
4. Add a mode-aware project creation branch that fetches the authenticated user’s GitHub repositories only when cloud mode is active and a GitHub connection exists.
5. Build the cloud form fields around repository selection and any required metadata from the backend contract, but keep the UI limited to what the task requires. Do not add secret management, branch pickers, or preview options.
6. On submit, call the cloud create API, surface loading and error states clearly, and refresh/invalidate the project list or project store the same way local creation already does.
7. Preserve the local-mode flow as the default path when cloud mode is inactive so existing tests and user behavior stay stable.
8. Run the targeted project creation tests plus the relevant frontend suite, then note any gaps that belong to later integration-test work instead of expanding this task.
