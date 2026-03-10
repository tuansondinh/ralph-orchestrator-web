---
status: completed
created: 2026-03-11
started: 2026-03-11
completed: 2026-03-11
---
# Task: Backend Stability Regressions

## Description
Fix the current backend regressions that are causing the test suite to fail and undermining app reliability. This task restores confidence in core services before broader UI and chat changes land.

## Background
The current backend test run fails in loop output persistence, notification persistence, settings-driven Ralph binary usage, and MCP HTTP transport. Those failures indicate the app has behavioral regressions in foundational services that other features depend on.

## Reference Documentation
**Required:**
- Design: specs/app-review-chat-streaming-mobile/design.md

**Additional References (if relevant to this task):**
- packages/backend/src/services/LoopService.ts
- packages/backend/src/services/LoopNotificationService.ts
- packages/backend/src/services/SettingsService.ts
- packages/backend/src/app.ts
- packages/backend/test/loop-output-persistence.test.ts
- packages/backend/test/settings.test.ts
- packages/backend/test/notification.test.ts
- packages/backend/test/mcp.test.ts

**Note:** Read the design document before beginning implementation.

## Technical Requirements
1. Fix loop output persistence behavior so sequence ordering, local-mode fallback behavior, and fire-and-forget failure handling match the test expectations.
2. Ensure loop and notification persistence work correctly for the current database/runtime mode without noisy startup regressions.
3. Ensure loop processes honor the configured `settings.ralphBinaryPath` everywhere the app expects that behavior.
4. Restore MCP HTTP transport behavior so initialize and `tools/list` return the expected tool definitions and session flow.
5. Update or add unit tests only where behavior is intentionally corrected, not to mask regressions.

## Dependencies
- Existing backend Vitest suite in `packages/backend/test`
- Repository/database service behavior in local and cloud modes

## Implementation Approach
1. Reproduce the failing backend tests and trace each failure to the service-level source.
2. Fix `LoopService` persistence and replay behavior first because it underpins multiple failures.
3. Correct settings/binary propagation and notification persistence behavior next.
4. Validate MCP transport behavior against the current server initialization path.
5. Re-run the backend tests that currently fail, then the full backend suite.

## Acceptance Criteria

1. **Loop Output Persistence Works Reliably**
   - Given a running loop produces stdout and stderr chunks
   - When output is persisted and later replayed
   - Then chunk ordering, fallback behavior, and non-fatal write errors match the expected backend test behavior

2. **Configured Ralph Binary Is Honored**
   - Given a user has saved `settings.ralphBinaryPath`
   - When loop-related backend flows resolve and spawn the Ralph binary
   - Then the configured binary path is used consistently instead of silently falling back to a default path

3. **Notifications Persist And Replay Correctly**
   - Given loop state changes create notifications
   - When notifications are listed, replayed, and marked as read
   - Then the backend returns consistent persisted notification state without database-mode regressions

4. **MCP Transport Is Functional**
   - Given a client initializes the MCP HTTP endpoint
   - When it requests `tools/list`
   - Then the server returns the expected tool definitions with a valid session flow

5. **Backend Regression Tests Cover The Fixes**
   - Given the backend test suite includes regression coverage for loop output, settings, notifications, and MCP
   - When the targeted backend tests are run
   - Then the previously failing tests pass and any modified logic remains covered by unit tests

## Metadata
- **Complexity**: High
- **Labels**: backend, reliability, regression, mcp, settings, notifications
- **Required Skills**: TypeScript, Fastify, Vitest, service debugging
