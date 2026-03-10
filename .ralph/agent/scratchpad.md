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
