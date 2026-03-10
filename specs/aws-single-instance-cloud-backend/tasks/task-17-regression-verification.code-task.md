---
status: completed
created: 2026-03-09
started: 2026-03-10
completed: 2026-03-10
---
# Task: Step 17 - Regression Verification

## Description
Run the final regression pass to prove the cloud work did not break local mode or the existing test baseline.

## Reference Documentation
- `specs/aws-single-instance-cloud-backend/design.md`
- `specs/aws-single-instance-cloud-backend/plan.md`
- `specs/aws-single-instance-cloud-backend/requirements.md`

## Key Source Files
- Entire repo, with emphasis on `packages/backend` and `packages/frontend`

## Technical Requirements
1. Verify local mode still boots and behaves as before when Supabase env vars are absent.
2. Run the relevant automated backend/frontend/typecheck pipeline.
3. Confirm cloud-only UI and auth gates do not leak into local mode.
4. Document any residual gaps or manual checks still required.

## Implementation Approach
1. Run backend and frontend test suites plus typecheck from the affected workspaces or root scripts.
2. Smoke-test local mode with Supabase env vars unset.
3. Smoke-test cloud mode assumptions with env vars present or mocked where possible.
4. Review failures strictly as regressions unless they are pre-existing and documented.
5. Summarize the final verification evidence before marking the overall objective ready for review.

## Acceptance Criteria
1. Existing automated tests pass or any pre-existing failures are explicitly documented.
2. Local mode works with Supabase env vars absent.
3. Cloud mode gating behaves as expected in the final integrated build.
4. Verification notes clearly describe what was automated versus manually checked.

## Metadata
- Complexity: Medium
- Labels: regression, verification, qa
- Required Skills: test execution, release verification

## Detailed Implementation Plan
1. Treat this task as verification only. Do not add new feature code unless a failing regression reveals a concrete defect that must be fixed to satisfy the objective.
2. Build a final verification checklist directly from the objective:
   - Local mode unchanged with Supabase env vars absent.
   - Cloud auth and cloud-only UI gates behave correctly.
   - Automated backend/frontend/typecheck coverage passes or documented pre-existing flakes are clearly separated from regressions.
3. Run the relevant automated commands in an order that makes failures diagnosable, favoring targeted reruns for known flaky suites before classifying them as regressions.
4. Perform at least a basic smoke check for local mode and the cloud-mode auth shell using the best available mocked or configured environment in this repo.
5. Record evidence for each acceptance criterion in concise verification notes so the validator/reviewer can see what was automated versus manually checked.
6. If a failure is pre-existing, confirm it against prior evidence or a focused rerun before documenting it as residual risk. Avoid masking new regressions as “known issues” without proof.
