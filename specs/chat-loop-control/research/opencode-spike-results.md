# OpenCode Spike Results

## Findings

- `createOpencode()` is usable for backend lifecycle management and returns both the SDK client and a closable local server handle.
- The backend streaming pattern should subscribe once with `client.event.subscribe()` and translate SSE events into app-level chat events.
- `permission.updated` is the right integration point for destructive tool confirmation. The expected destructive set includes `start_loop` and `stop_loop`.
- Runtime model changes can be applied with `config.update()`, which affects future prompts.
- Crash recovery should treat an unexpected stream end as server loss and restart on the next prompt. Forced kill testing should include `SIGKILL`.

## Recommended Implementation Strategy

1. Start OpenCode lazily on first chat send using `createOpencode()`.
2. Point OpenCode MCP config at Ralph's `/mcp` endpoint.
3. Mirror text deltas, tool state transitions, `permission.updated`, status, and error events into backend-owned chat events.
4. Hold the canonical transcript in memory and answer reconnects from a snapshot.
5. On crash recovery or `SIGKILL`, mark the service stopped and restart before delivering the next message.
