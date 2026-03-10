---
status: in_progress
created: 2026-03-10
started: 2026-03-10
completed: 2026-03-10
---
# Task: Audit and Remove Old Chat Infrastructure

## Description
Systematically audit and remove all chat code that has been superseded by the OpenCode-based implementation, ensuring no dead imports remain and existing non-chat functionality (plan/task terminal sessions) continues to work.

## Background
The new chat system (Tasks 2–9) was built alongside the old one to allow incremental development. Now that the new system is fully functional, the old infrastructure must be cleaned up: `McpChatService`, the SSE chat endpoints, `chatStore`, `chatOverlayStore`, `useChat`, and the associated tRPC chat routes. However, some existing files have dependencies that must be audited carefully — `ChatService` may also serve terminal-based plan/task sessions, and the Vercel AI SDK packages may be used outside of the old chat. Deleting the wrong code will break unrelated features. The audit-first approach in this task ensures safe removal.

## Reference Documentation
**Required:**
- Design: specs/chat-loop-control/design.md (Appendix B: What Gets Removed, Appendix C: What Stays)
- Plan: specs/chat-loop-control/plan.md

## Technical Requirements
1. **Audit before deleting.** For each file listed below, run an import/reference search across the codebase before removing anything:
   - `packages/backend/src/services/McpChatService.ts` — expected: no remaining callers after Task 3; remove if confirmed
   - `/chat/stream` and `/chat/confirm` REST endpoints in `packages/backend/src/app.ts` — remove if not used by plan/task sessions
   - `packages/frontend/src/stores/chatStore.ts` — remove (replaced by `chatSessionStore`)
   - `packages/frontend/src/stores/chatOverlayStore.ts` — remove (replaced by `chatSessionStore`)
   - `packages/frontend/src/hooks/useChat.ts` — remove (replaced by `useChatSession`)
   - `chatRouter` tRPC routes — audit: remove routes used exclusively by old MCP chat; preserve routes used by terminal-based chat sessions if any exist
   - `ChatService` backend service — audit: if used only for MCP chat, remove; if used for plan/task terminal sessions, keep and document
2. **Audit Vercel AI SDK packages** (`ai`, `@ai-sdk/anthropic`, `@ai-sdk/google`, `@ai-sdk/openai`): search the codebase for imports. Remove from `package.json` only if exclusively used by the old chat flow.
3. **Update all import sites**: after each deletion, ensure no remaining file imports the deleted module. Fix any TypeScript errors immediately.
4. **Delete associated test files** for deleted code (e.g. `McpChatService.test.ts`, `chatStore.test.ts`, `chatOverlayStore.test.ts`, `useChat.test.ts`).
5. After all deletions: run `npm run build` (both packages) — zero TypeScript errors.
6. Run `npm test -w @ralph-ui/backend` and `npm test -w @ralph-ui/frontend` — all remaining tests pass.
7. Run grep searches to confirm no references remain to deleted modules.

## Dependencies
- Tasks 3–9 must all be complete (new system fully functional before removing old system)
- `packages/backend/src/services/McpChatService.ts`
- `packages/backend/src/app.ts` — REST endpoint removal
- `packages/frontend/src/stores/chatStore.ts` and `chatOverlayStore.ts`
- `packages/frontend/src/hooks/useChat.ts`
- `packages/backend/src/routers/chatRouter.ts` (or equivalent)
- `packages/backend/package.json` — Vercel AI SDK dependency removal

## Implementation Approach
1. Search all TypeScript files for imports of each deletion candidate (`grep -r "McpChatService" packages/`, etc.) and build a list of actual callers.
2. For `ChatService` and `chatRouter`, read the files to determine if plan/task terminal sessions use them. If so, mark them as "keep" with a comment.
3. Remove `McpChatService.ts`: delete file, remove its import from `app.ts`, remove its Fastify decorator registration.
4. Remove `/chat/stream` and `/chat/confirm` routes from `app.ts` (or the appropriate router file).
5. Remove `chatStore.ts`: delete file, fix all import sites (should be none after Task 5 reworked consumers).
6. Remove `chatOverlayStore.ts`: delete file, fix all import sites (should be none after Task 8).
7. Remove `useChat.ts`: delete file, fix all import sites (should be none after Tasks 7 and 8).
8. Audit and prune `chatRouter` tRPC routes — remove only the confirmed old-chat-only routes.
9. Audit Vercel AI SDK usage; uninstall packages if unused: `npm uninstall ai @ai-sdk/anthropic @ai-sdk/google @ai-sdk/openai -w @ralph-ui/backend`.
10. Delete test files for deleted code.
11. Run `npm run build` — fix any TypeScript errors.
12. Run full test suites for both packages — fix any test failures.
13. Run final grep to confirm no dangling references.

## Acceptance Criteria

1. **McpChatService Removed**
   - Given all files in `packages/backend/` are scanned
   - When searching for `McpChatService`
   - Then zero matches are found

2. **Old Frontend Stores Removed**
   - Given all files in `packages/frontend/` are scanned
   - When searching for `chatStore` and `chatOverlayStore` and `useChat`
   - Then zero import matches are found (only the deleted files themselves are absent)

3. **Old REST Endpoints Removed**
   - Given the backend starts and the route table is inspected
   - When looking for `/chat/stream` and `/chat/confirm`
   - Then neither route is registered

4. **Build Succeeds**
   - Given all deletions are complete
   - When `npm run build` is run for both `@ralph-ui/backend` and `@ralph-ui/frontend`
   - Then it completes with zero TypeScript errors

5. **All Remaining Tests Pass**
   - Given all remaining test files run
   - When `npm test -w @ralph-ui/backend` and `npm test -w @ralph-ui/frontend` execute
   - Then all pass — no regressions in plan/task terminal sessions or any other feature

6. **Plan/Task Terminal Sessions Unaffected**
   - Given a plan or task terminal session is started
   - When it runs
   - Then it behaves as it did before this task (terminal output, status updates, all working)

7. **No Orphaned AI SDK Packages**
   - Given the Vercel AI SDK audit is complete
   - When `packages/backend/package.json` is inspected
   - Then `ai`, `@ai-sdk/anthropic`, `@ai-sdk/google`, `@ai-sdk/openai` are absent (or documented with justification if kept)

## Metadata
- **Complexity**: Medium
- **Labels**: backend, frontend, cleanup, refactor, audit
- **Required Skills**: TypeScript, grep, npm, Vitest, build tooling
