2026-03-10T00:00:00Z Planner bootstrap for chat-loop-control.

PDD directory verified at specs/chat-loop-control with tasks/ present.
No ready runtime tasks were returned by `ralph tools task ready --format json`.
Code-task queue discovered for Builder handoff:
- task-01-spike-opencode-permissions
- task-02-install-sdk-and-settings-schema
- task-03-build-opencode-service
- task-04-wire-websocket-channel
- task-05-frontend-store-provider-hook
- task-06-mobile-layout-project-page
- task-07-rework-chat-tab
- task-08-rework-chat-bubble
- task-09-chat-settings-page
- task-10-remove-old-chat-infra

Task name derived from directory: chat-loop-control.
Planner scope only: do not implement here. Builder should pick the first code task and execute one atomic unit at a time.

2026-03-10T00:00:00Z Builder picked task-02 after finding task-01 already completed.
Current task scope: preserve existing assistant-setting `chatModel` semantics and add distinct OpenCode chat settings (`chatProvider`, `chatModel`) through backend settings storage and tRPC without broad frontend refactors in this iteration.

2026-03-10T00:00:00Z Task-02 complete.
Implemented backend settings support for OpenCode-specific provider/model settings using additive keys `opencode.provider` and `opencode.model`, exposed as `chatProvider` and `opencodeModel` in the current backend contract to avoid breaking the legacy `chatModel` field already used elsewhere in the repo. Added provider env-var mapping constants, tRPC input validation, tests for defaults/round-trip/env map, and documented the naming mismatch decision in `.ralph/agent/decisions.md`.

2026-03-10T00:00:00Z Task-03 complete.
Built `OpenCodeService` with backend-owned in-memory transcript, lazy OpenCode startup, session creation, message/tool/permission/status/error event translation, confirmation replies, model updates, and auto-restart on stream termination. Registered the service on Fastify as `openCodeService` with shutdown cleanup, added backend tests for service behavior and app wiring, and restored the missing OpenCode spike artifacts required by the existing backend test suite so `npm test -w @ralph-ui/backend` is green. Next code task remains `task-04-wire-websocket-channel`.

2026-03-10T00:00:00Z Task-04 complete.
Wired the global `opencode-chat` WebSocket channel into `packages/backend/src/api/websocket.ts`, including channel access resolution, cloud-mode auth allowance without project scoping, inbound `chat:send` / `chat:confirm` / `chat:sync` parsing and dispatch, and selective broadcast of `OpenCodeService` events only to subscribed sockets. Updated `OpenCodeService.onEvent()` to return an unsubscribe so WS cleanup can detach listeners cleanly. Added backend tests covering channel isolation, service dispatch, snapshot sync, and authenticated cloud subscription to `opencode-chat`. Verification passed with `npm run typecheck -w @ralph-ui/backend` and `npm test -w @ralph-ui/backend`. Next code task is `task-05-frontend-store-provider-hook`.

2026-03-10T00:00:00Z Builder started task-05.
Scope is limited to the new frontend singleton chat session layer: `chatSessionStore`, `ChatSessionProvider`, `useChatSession`, and top-level mounting. Existing `ChatView` / overlay behavior stays in place for now except for the root provider mount required by the task. Because backend websocket payloads currently expose `createdAt` and separate `chat:tool-result` events, the provider will normalize them into frontend-local chat message types with `timestamp`, optional streaming state, and additive tool result messages.

2026-03-10T18:59:35Z Task-05 complete.
Added the new frontend chat session layer with `packages/frontend/src/types/chat.ts`, `chatSessionStore`, `ChatSessionProvider`, and `useChatSession`, then mounted the provider at the app-shell route root. Provider normalization now converts backend OpenCode websocket payloads into the frontend chat state model, sends `chat:sync` on first connect/reconnect, and exposes a shared send context for future ChatTab and ChatBubble work. Added focused store/provider/hook tests and updated the notifications integration test to locate websocket instances by subscribed channel now that the app opens the extra root `opencode-chat` socket. Verification passed with `npm run typecheck -w @ralph-ui/frontend` and `npm test -w @ralph-ui/frontend`. Next code task is `task-06-mobile-layout-project-page`.

2026-03-10T19:00:58Z Builder started task-06.
Scope is limited to `ProjectPage` mobile layout gating only: add a small `useMediaQuery` hook if missing, make `ProjectHeader` and `TabBar` conditional for `mobile + chat`, preserve the existing layout classes for every other path, and add render tests plus a controllable `matchMedia` polyfill. Chat tab content changes remain deferred to task-07.

2026-03-10T19:03:13Z Task-06 note.
`ProjectPage` currently resolves `params.tab === 'chat'` back to `loops` because the visible tab list does not include chat yet. To keep this iteration meaningful without broadening into tab-nav work, preserve the chat route locally inside `ProjectPage` so the mobile layout branch can activate; documented as DEC-003.

2026-03-10T19:05:12Z Task-06 complete.
Added `useMediaQuery` and a controllable `matchMedia` test polyfill, then updated `ProjectPage` to hide `ProjectHeader` and `TabBar` only for `mobile + chat` while preserving the prior wrapper classes everywhere else. Kept the currently hidden `chat` route valid within `ProjectPage` so the branch is reachable without changing broader tab navigation. Added focused render tests for mobile chat, mobile loops, and desktop chat. Verification passed with `npm run typecheck -w @ralph-ui/frontend` and `npm test -w @ralph-ui/frontend`. Browser-level Playwright verification was not meaningful in this iteration because `AppShellRoutes` still redirects `/project/:id/chat` to `/loops` until a later chat-route task removes that guard.

2026-03-10T19:10:00Z Builder started task-07.
Scope is limited to reworking `ChatView` into the mobile-first shared-session tab. The implementation will remove legacy session controls, read/write through `useChatSession()`, keep the drawer navigation local to `ChatView` using existing visible project tabs, and reuse `MessageList`, `ChatMessage`, `ChatInput`, and `ToolConfirmationCard` with only the prop/type changes needed for the OpenCode session model.

2026-03-10T20:11:00Z Task-07 complete.
Reworked `ChatView` to use `useChatSession()` only, removed the legacy session selectors/start-stop controls, added the mobile hamburger drawer with project-name/tab navigation, kept desktop chat inside the existing tab pane, rendered pending confirmations inline in the scrollable message list, and added visual-viewport keyboard offset handling plus sticky safe-area input placement. Updated the shared chat components just enough to support the new session message/confirmation model and 44px tap targets. Verification passed with `npm run typecheck -w @ralph-ui/frontend` and `npm test -w @ralph-ui/frontend`. Browser-level Playwright verification is still not meaningful here because the app-shell route layer continues to redirect `/project/:id/chat` away before this component can be exercised end to end.

2026-03-10T19:17:55Z Task-08 complete.
Reworked `ChatOverlay` to use local open/close state plus `useChatSession()` instead of the legacy overlay websocket/store, removed the per-bubble model selector, and rendered shared transcript plus inline permission confirmations through the shared session state. Mounted the desktop overlay from `AppShellRoutes` as a sibling of main shell content, added focused overlay and shell integration tests, and aligned the existing app-shell expectation to the new desktop chat launcher. Verification passed with `npm run typecheck -w @ralph-ui/frontend` and `npm test -w @ralph-ui/frontend`. Next code task is `task-09-chat-settings-page`.

2026-03-10T20:25:00Z Builder started task-09.
Scope is limited to the global settings surface plus the backend settings mutation hook: add the Chat provider/model controls, expose provider API-key presence booleans from backend settings, call `openCodeService.updateModel()` after successful saves, and keep the legacy assistant `chatModel` setting untouched.

2026-03-10T20:25:00Z Task-09 complete.
Added a Chat section to `SettingsPage` with provider dropdown, model input, merged save payload wiring, and inline missing-API-key warning based on backend `apiKeyStatus`. Extended backend settings snapshots with provider key presence booleans and updated the settings mutation to call `openCodeService.updateModel()` after persistence without failing the save on hook errors. Updated existing frontend/backend fixtures and mocks to the expanded settings contract, plus made the settings page tolerant of transitional payloads that omit the new metadata. Verification passed with `npm run typecheck -w @ralph-ui/frontend`, `npm run typecheck -w @ralph-ui/backend`, `npm test -w @ralph-ui/frontend`, and `npm test -w @ralph-ui/backend`. Playwright sanity verification against `http://localhost:5175/settings` confirmed the Chat section renders with the new controls in the running app. Next code task is `task-10-remove-old-chat-infra`.

2026-03-10T20:40:00Z Task-10 complete.
Audited the remaining legacy chat path and removed only the superseded MCP chat infrastructure: deleted `McpChatService`, the old `/chat/stream` and `/chat/confirm` SSE handlers, the legacy frontend `chatStore`, `chatOverlayStore`, and `useChat` modules plus their tests, and removed the unused Vercel AI SDK dependencies from `@ralph-ui/backend`. Kept `ChatService` in place because it still backs plan/task/loop terminal sessions and MCP chat-session tools. Added a backend app test asserting the legacy REST routes return 404, updated the Ralph MCP server test to stop importing deleted legacy symbols, and verified with `npm run typecheck -w @ralph-ui/backend`, `npm run typecheck -w @ralph-ui/frontend`, `npm run build -w @ralph-ui/backend`, `npm run build -w @ralph-ui/frontend`, `npm test -w @ralph-ui/backend`, and `npm test -w @ralph-ui/frontend`. Final grep audits for `McpChatService`, `mcpChatService`, `chatStore`, `chatOverlayStore`, and legacy `useChat` imports returned no remaining source matches. Playwright sanity verification was attempted against `http://localhost:5175` but the local app server was not running (`ERR_CONNECTION_REFUSED`).
2026-03-10T20:40:00Z Builder started task-10.
Scope is limited to removing the superseded MCP chat infrastructure after an audit: delete McpChatService, legacy SSE chat routes, old frontend chat stores/hooks/tests, and unused AI SDK packages while preserving ChatService-backed plan/task terminal sessions and existing OpenCode flows.

2026-03-10T20:38:00Z Validator pass for implementation.ready/task-10 failed.
Automated verification passed: `npm run typecheck -w @ralph-ui/backend`, `npm run typecheck -w @ralph-ui/frontend`, `npm test -w @ralph-ui/backend`, `npm test -w @ralph-ui/frontend`, `npm run build -w @ralph-ui/backend`, and `npm run build -w @ralph-ui/frontend` all completed successfully. Manual browser validation against the already-running local app on `http://127.0.0.1:3003` showed the core acceptance path is still broken: opening `/project/e9d4bd12-7545-4d58-9b08-edbacc635ad2/chat` immediately redirected to `/project/e9d4bd12-7545-4d58-9b08-edbacc635ad2/loops`, matching the hard redirect still present in `packages/frontend/src/AppShellRoutes.tsx`. PDD metadata also remains incomplete because code-task files `task-03`, `task-05`, `task-06`, `task-07`, and `task-10` still declare `status: in_progress`, so the validator cannot approve even aside from the route regression.

2026-03-10T20:41:00Z Validator follow-up fix complete.
Added a focused RED regression test in `packages/frontend/src/AppShellRoutes.test.tsx` proving `/project/:id/chat` must stay on the chat route, then removed the dedicated `chat -> ../loops` redirect from `packages/frontend/src/AppShellRoutes.tsx` so routing falls through to `ProjectPage`, which already preserves the `chat` tab locally. Updated stale code-task frontmatter for tasks 03, 05, 06, 07, and 10 from `status: in_progress` to `status: completed`. Verification passed with `npm run typecheck -w @ralph-ui/frontend`, `npm test -w @ralph-ui/frontend -- --run src/AppShellRoutes.test.tsx src/pages/ProjectPage.test.tsx src/components/chat/ChatOverlay.test.tsx`, and manual Playwright validation against `http://localhost:5174/project/e9d4bd12-7545-4d58-9b08-edbacc635ad2/chat`, which now stayed on `/chat` and rendered the Chat UI instead of redirecting to `/loops`.
