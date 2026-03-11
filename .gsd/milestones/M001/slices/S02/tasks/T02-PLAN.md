# T02: 07-loop-git-automation 02

**Slice:** S02 — **Milestone:** M001

## Description

Wire LoopGitService into the LoopService lifecycle and display git info in the frontend.

Purpose: Complete the git automation feature by integrating the service (from Plan 01) into the loop start and completion lifecycle, and surfacing the branch name and PR link in the UI.

Output: Loops automatically create branches before spawn, push and open PRs on completion, and the frontend shows this information.

## Must-Haves

- [ ] "Starting a loop creates a new git branch before the loop process spawns"
- [ ] "When a loop completes, the working branch is automatically pushed to the remote"
- [ ] "When a loop completes, a pull request is automatically opened against the base branch"
- [ ] "The loop detail view shows the branch name during a running loop"
- [ ] "The loop detail view shows a clickable PR link after loop completion"

## Files

- `packages/backend/src/services/LoopService.ts`
- `packages/backend/src/app.ts`
- `packages/backend/src/trpc/context.ts`
- `packages/backend/src/trpc/router.ts`
- `packages/frontend/src/lib/loopApi.ts`
- `packages/frontend/src/components/loops/LoopDetail.tsx`
- `packages/frontend/src/components/loops/LoopDetail.test.tsx`
