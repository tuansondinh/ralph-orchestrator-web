# T01: 07-loop-git-automation 01

**Slice:** S02 — **Milestone:** M001

## Description

Create the LoopGitService and update DB schemas to support git branch automation for loops.

Purpose: Establish the data layer and git service that Plan 02 will wire into LoopService lifecycle. This plan creates the contracts (DB columns, TypeScript interfaces) and the implementation (LoopGitService) independently of the LoopService integration.

Output: LoopGitService.ts with createBranch/pushBranch/createPullRequest methods, updated DB schemas with branchName/baseBranch/prUrl columns, and unit tests.

## Must-Haves

- [ ] "LoopGitService can create a new branch in a git repo"
- [ ] "LoopGitService can push a branch to the remote"
- [ ] "LoopGitService can open a PR via the GitHub REST API"
- [ ] "loop_runs table has branchName, baseBranch, and prUrl columns"
- [ ] "LoopRunRecord and LoopRunUpdate interfaces include the new fields"

## Files

- `packages/backend/src/db/schema/postgres.ts`
- `packages/backend/src/db/schema/sqlite.ts`
- `packages/backend/src/db/repositories/contracts.ts`
- `packages/backend/src/db/repositories/index.ts`
- `packages/backend/src/db/connection.ts`
- `packages/backend/src/services/LoopGitService.ts`
- `packages/backend/drizzle/postgres/0001_add_loop_git_columns.sql`
- `packages/backend/test/loop-git-service.test.ts`
