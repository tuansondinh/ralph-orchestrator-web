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
