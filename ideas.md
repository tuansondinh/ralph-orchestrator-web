# Ideas

- Persist loop output to SQLite so terminal history survives backend restarts.
  - Add a `loop_output` table keyed by `loop_id` with ordered chunks/lines and timestamps.
  - Keep websocket streaming as-is, but load replay from DB (with retention limits) when clients subscribe.
  - This removes reliance on in-memory-only buffers for historical loop output visibility.
