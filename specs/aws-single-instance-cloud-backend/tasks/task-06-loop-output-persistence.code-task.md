---
status: completed
created: 2026-03-09
started: 2026-03-10
completed: 2026-03-10
---
# Task: Step 06 - Loop Output Persistence To Database

## Description
Persist loop output chunks to Postgres while keeping the in-memory output buffer as a cache.

## Reference Documentation
- `specs/aws-single-instance-cloud-backend/design.md`
- `specs/aws-single-instance-cloud-backend/plan.md`
- `specs/aws-single-instance-cloud-backend/requirements.md`

## Key Source Files
- `packages/backend/src/runner/OutputBuffer.ts`
- `packages/backend/src/services/LoopService.ts`
- `packages/backend/src/runner/RalphEventParser.ts`

## Technical Requirements
1. Write output chunks to `loop_output_chunks` in cloud mode.
2. Keep the current in-memory buffering for fast live access.
3. Replay from the database when memory is empty after restart/reconnect.
4. Key persistence by loop UUID, not PID.

## Implementation Approach
1. Trace where loop output is parsed, buffered, and read back today.
2. Add a persistence layer that appends ordered chunks as output arrives.
3. Update replay/load logic to fall back to database chunks when the buffer is empty.
4. Keep local mode behavior lightweight and unchanged when Postgres is unavailable.
5. Add backend tests for persistence order and restart/replay behavior.

## Acceptance Criteria
1. Cloud loop output is persisted in Postgres as ordered chunks.
2. Restart or reconnect can replay output from the database.
3. No code path uses PID as the durable output key.
4. `npm test -w @ralph-ui/backend` passes.

## Metadata
- Complexity: High
- Labels: backend, loops, persistence, postgres
- Required Skills: event streams, persistence, replay logic
