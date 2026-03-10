---
status: completed
created: 2026-03-09
started: 2026-03-10
completed: 2026-03-10
---
# Task: Step 10 - WebSocket Auth Gating

## Description
Require authenticated Supabase users for cloud-mode WebSocket access while leaving local-mode socket behavior intact.

## Reference Documentation
- `specs/aws-single-instance-cloud-backend/design.md`
- `specs/aws-single-instance-cloud-backend/plan.md`
- `specs/aws-single-instance-cloud-backend/requirements.md`

## Key Source Files
- `packages/backend/src/api/websocket.ts`
- `packages/backend/src/app.ts`
- `packages/frontend/src/hooks/useWebSocket.ts`

## Technical Requirements
1. Authenticate cloud-mode WebSocket connections before accepting subscriptions/streams.
2. Bind the socket session to the authenticated user where needed.
3. Keep current local-mode socket flows working without auth.
4. Return predictable close/error semantics for unauthorized clients.

## Implementation Approach
1. Inspect the current WebSocket handshake path and how the frontend passes connection metadata.
2. Reuse the Supabase validation logic from HTTP auth instead of duplicating rules.
3. Gate cloud-mode connection acceptance and reject unauthorized sockets early.
4. Update frontend connection code only as needed to pass bearer credentials consistently.
5. Add backend and frontend tests for authorized and unauthorized cloud socket scenarios.

## Acceptance Criteria
1. Unauthorized cloud-mode WebSocket clients are rejected.
2. Authorized cloud-mode WebSocket clients connect successfully.
3. Local-mode WebSocket behavior remains unchanged.
4. Relevant backend/frontend tests pass.

## Metadata
- Complexity: Medium
- Labels: backend, frontend, websocket, auth
- Required Skills: Fastify websocket hooks, client auth propagation
