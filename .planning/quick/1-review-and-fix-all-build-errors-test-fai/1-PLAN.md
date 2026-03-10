---
phase: quick
plan: 01
type: execute
wave: 1
depends_on: []
files_modified: ["packages/backend/**", "packages/frontend/**"]
autonomous: true
requirements: [STABILIZE-01]
must_haves:
  truths:
    - "Backend builds without TypeScript errors"
    - "Frontend builds without TypeScript errors"
    - "All backend tests pass"
    - "All frontend tests pass"
  artifacts:
    - path: "packages/backend"
      provides: "Clean build output"
    - path: "packages/frontend"
      provides: "Clean build output"
  key_links: []
---

<objective>
Verify and fix all build errors and test failures in the cloud integration code.

Purpose: Prior fixes have been applied to the working tree but not verified. Need to confirm builds pass and fix any remaining issues.
Output: Clean builds and passing test suites for both backend and frontend.
</objective>

<execution_context>
@/Users/sonwork/.claude/get-shit-done/workflows/execute-plan.md
@/Users/sonwork/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

Changes are already in the working tree from prior fixes (items 1-8 in planning context).
Do NOT redo already-applied fixes. Start by verifying what exists.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Verify builds and fix any remaining compilation errors</name>
  <files>packages/backend/**, packages/frontend/**</files>
  <action>
    1. Run `npm run build` (or `npx tsc --noEmit` in each package) to check TypeScript compilation
    2. For backend: `cd packages/backend && npx tsc --noEmit`
    3. For frontend: `cd packages/frontend && npx tsc --noEmit`
    4. If any errors remain, fix them. The following were already fixed — do NOT revert:
       - Backend: `test/project-router.test.ts` field names (githubOwner→owner, githubRepo→repo)
       - Frontend: `projectApi.ts` field names, `supabase.ts` imports, `SignInPage.tsx` interface/signature, `AuthProvider.test.tsx` full rewrite, `GitHubRepoSelector.tsx` and its test field names
    5. Fix any NEW errors found during compilation
  </action>
  <verify>
    <automated>cd /Users/sonwork/Workspace/ralph-orchestrator-web && npx tsc --noEmit -p packages/backend/tsconfig.json 2>&1; npx tsc --noEmit -p packages/frontend/tsconfig.json 2>&1</automated>
  </verify>
  <done>Both packages compile with zero TypeScript errors</done>
</task>

<task type="auto">
  <name>Task 2: Run all tests and fix any remaining failures</name>
  <files>packages/backend/**, packages/frontend/**</files>
  <action>
    1. Run backend tests: `npm test -w @ralph-ui/backend`
    2. Run frontend tests: `npm test -w @ralph-ui/frontend`
    3. For any failing tests, diagnose root cause:
       - Check if mock shapes match actual implementations
       - Check if import paths are correct (especially supabase/supabaseBrowserClient)
       - Check App.test.tsx mocks align with actual AuthProvider dependencies
    4. Fix failures. Known pre-existing issue: App.test.tsx had 3 pre-existing failures from TabBar changes (see MEMORY.md) — if those same 3 still fail, note but do not block on them.
    5. Re-run tests to confirm fixes work.
  </action>
  <verify>
    <automated>cd /Users/sonwork/Workspace/ralph-orchestrator-web && npm test -w @ralph-ui/backend 2>&1 | tail -20; npm test -w @ralph-ui/frontend 2>&1 | tail -20</automated>
  </verify>
  <done>All backend tests pass. All frontend tests pass (excluding the 3 pre-existing App.test.tsx TabBar failures if still present).</done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` succeeds for both packages
- `npm test -w @ralph-ui/backend` — all tests pass
- `npm test -w @ralph-ui/frontend` — all tests pass (minus known pre-existing)
</verification>

<success_criteria>
- Zero TypeScript compilation errors in both packages
- All backend tests green
- All frontend tests green (known pre-existing exceptions noted)
</success_criteria>

<output>
After completion, create `.planning/quick/1-review-and-fix-all-build-errors-test-fai/1-01-SUMMARY.md`
</output>
