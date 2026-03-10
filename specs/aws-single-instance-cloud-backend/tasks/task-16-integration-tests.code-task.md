---
status: completed
created: 2026-03-09
started: 2026-03-10
completed: 2026-03-10
---
# Task: Step 16 - Integration Tests

## Description
Add integration coverage for the new cloud-mode backend and frontend flows.

## Reference Documentation
- `specs/aws-single-instance-cloud-backend/design.md`
- `specs/aws-single-instance-cloud-backend/plan.md`
- `specs/aws-single-instance-cloud-backend/requirements.md`

## Key Source Files
- `packages/backend/test/`
- `packages/frontend/test/`
- `packages/frontend/src/**/*.test.tsx`

## Technical Requirements
1. Cover auth-gated API behavior in cloud mode.
2. Cover GitHub connection and cloud project creation happy paths with mocks/fakes.
3. Cover database-backed loop state/output behavior at the integration boundary.
4. Keep tests deterministic and independent of live external services.

## Implementation Approach
1. Review existing backend/frontend test helpers and fixture patterns.
2. Add or extend integration-style tests around the most important cloud workflows.
3. Mock Supabase and GitHub boundaries explicitly; do not depend on real network services.
4. Cover reconnect/replay behavior for loop state and output if practical.
5. Run targeted backend/frontend test suites and stabilize any flaky assertions.

## Acceptance Criteria
1. New cloud-mode integration tests exist for the core auth/project/loop flows.
2. Tests do not require live Supabase or GitHub credentials.
3. Relevant workspace test suites pass.
4. The integration layer gives confidence that the cloud architecture works end to end.

## Metadata
- Complexity: High
- Labels: testing, integration, backend, frontend
- Required Skills: Vitest, mocking, integration testing

## Detailed Implementation Plan
1. Audit the cloud work already completed to identify the thinnest set of high-value integration paths:
   - Auth-gated cloud API access.
   - GitHub connection plus repo-backed project creation.
   - Loop state/output replay behavior across persistence boundaries.
2. Reuse the existing backend/frontend test harnesses and fixture builders. Avoid inventing a second integration framework if the repo already has viable helpers.
3. Define deterministic boundaries up front:
   - Mock Supabase verification and session data.
   - Mock GitHub OAuth/repo APIs.
   - Stub or isolate workspace/process behavior as needed.
4. Add tests in layers only where they prove cross-component behavior. Prefer a few strong integration cases over many brittle end-to-end style tests.
5. Cover at least one negative-path assertion for auth-gated behavior so cloud protections are not only validated on the happy path.
6. Run targeted backend and frontend suites iteratively, fixing fixture instability as part of the task. Do not treat unrelated flaky tests as new feature work unless they block reliable verification.
7. Document any remaining gaps that require true external-service testing so Step 17 can distinguish automated coverage from manual verification.
