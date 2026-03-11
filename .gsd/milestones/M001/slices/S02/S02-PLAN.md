# S02: Loop Git Automation

**Goal:** Create the LoopGitService and update DB schemas to support git branch automation for loops.
**Demo:** Create the LoopGitService and update DB schemas to support git branch automation for loops.

## Must-Haves


## Tasks

- [ ] **T01: 07-loop-git-automation 01**
  - Create the LoopGitService and update DB schemas to support git branch automation for loops.

Purpose: Establish the data layer and git service that Plan 02 will wire into LoopService lifecycle. This plan creates the contracts (DB columns, TypeScript interfaces) and the implementation (LoopGitService) independently of the LoopService integration.

Output: LoopGitService.ts with createBranch/pushBranch/createPullRequest methods, updated DB schemas with branchName/baseBranch/prUrl columns, and unit tests.
- [ ] **T02: 07-loop-git-automation 02**
  - Wire LoopGitService into the LoopService lifecycle and display git info in the frontend.

Purpose: Complete the git automation feature by integrating the service (from Plan 01) into the loop start and completion lifecycle, and surfacing the branch name and PR link in the UI.

Output: Loops automatically create branches before spawn, push and open PRs on completion, and the frontend shows this information.

## Files Likely Touched

- `packages/backend/src/db/schema/postgres.ts`
- `packages/backend/src/db/schema/sqlite.ts`
- `packages/backend/src/db/repositories/contracts.ts`
- `packages/backend/src/db/repositories/index.ts`
- `packages/backend/src/db/connection.ts`
- `packages/backend/src/services/LoopGitService.ts`
- `packages/backend/drizzle/postgres/0001_add_loop_git_columns.sql`
- `packages/backend/test/loop-git-service.test.ts`
- `packages/backend/src/services/LoopService.ts`
- `packages/backend/src/app.ts`
- `packages/backend/src/trpc/context.ts`
- `packages/backend/src/trpc/router.ts`
- `packages/frontend/src/lib/loopApi.ts`
- `packages/frontend/src/components/loops/LoopDetail.tsx`
- `packages/frontend/src/components/loops/LoopDetail.test.tsx`
