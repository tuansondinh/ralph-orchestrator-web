# Architecture

**Analysis Date:** 2026-03-08

## Pattern Overview

**Overall:** Monorepo with client-server architecture (Fastify backend + React SPA frontend)

**Key Characteristics:**
- Two npm workspaces: `@ralph-ui/backend` and `@ralph-ui/frontend`
- Backend uses service-oriented architecture with Fastify decorators for DI
- Frontend uses Zustand stores + tRPC proxy client (vanilla, not react-query hooks) for data fetching
- Real-time communication via WebSocket pub/sub (channel-based subscriptions)
- Backend spawns and manages external "ralph" CLI processes (loops, chat sessions, terminals)

## Layers

**API Layer (tRPC + REST + WebSocket):**
- Purpose: Expose backend functionality to frontend
- Location: `packages/backend/src/trpc/router.ts`, `packages/backend/src/app.ts`, `packages/backend/src/api/websocket.ts`
- Contains: tRPC router definitions with Zod validation, SSE chat streaming endpoint, WebSocket handler
- Depends on: Service layer via tRPC context
- Used by: Frontend

**Service Layer:**
- Purpose: Business logic and orchestration
- Location: `packages/backend/src/services/`
- Contains: 16 service classes (LoopService, ChatService, ProjectService, TerminalService, etc.)
- Depends on: Database (drizzle ORM), ProcessManager, external ralph binary
- Used by: tRPC router, WebSocket handler, MCP server

**Process Management Layer:**
- Purpose: Spawn and manage child processes (ralph CLI, dev preview servers, terminals)
- Location: `packages/backend/src/runner/`
- Contains: `ProcessManager.ts` (generic process lifecycle), `OutputBuffer.ts` (output capture), `RalphEventParser.ts` (parse ralph CLI events)
- Depends on: Node.js child_process, node-pty
- Used by: LoopService, ChatService, DevPreviewManager

**Data Layer:**
- Purpose: Persistence via SQLite
- Location: `packages/backend/src/db/`
- Contains: Drizzle ORM schema, connection management, migrations
- Depends on: better-sqlite3, drizzle-orm
- Used by: All services

**MCP Layer:**
- Purpose: Model Context Protocol server for AI tool use
- Location: `packages/backend/src/mcp/RalphMcpServer.ts`
- Contains: MCP server exposing project/loop/monitoring tools to AI models
- Depends on: Service layer
- Used by: McpChatService (for AI-powered chat with tool calling)

**Frontend Stores:**
- Purpose: Client-side state management
- Location: `packages/frontend/src/stores/`
- Contains: Zustand stores for projects, loops, chat, notifications, terminal, chat overlay
- Depends on: tRPC client, API helper functions
- Used by: React components

**Frontend API Helpers:**
- Purpose: Wrap tRPC calls into reusable async functions
- Location: `packages/frontend/src/lib/`
- Contains: Per-domain API modules (`loopApi.ts`, `projectApi.ts`, `chatApi.ts`, etc.)
- Depends on: `trpcClient` from `packages/frontend/src/lib/trpc.ts`
- Used by: Zustand stores, components

**Frontend Components:**
- Purpose: UI rendering
- Location: `packages/frontend/src/components/`
- Contains: Domain-organized React components (12 subdirectories)
- Depends on: Stores, hooks, API helpers
- Used by: Pages and App router

## Data Flow

**Loop Lifecycle (start -> output -> complete):**
1. Frontend calls `trpc.loop.start` mutation via tRPC
2. `LoopService.start()` spawns ralph CLI process via `ProcessManager`
3. `RalphEventParser` parses stdout events, updates DB state
4. Frontend subscribes to WebSocket channels `loop:{id}:output` and `loop:{id}:state`
5. WebSocket handler calls `loopService.subscribeOutput()` / `subscribeState()` (EventEmitter pattern)
6. State changes and output chunks pushed to frontend in real-time

**Chat with AI (MCP-based):**
1. Frontend POSTs to `/chat/stream` with messages array
2. `McpChatService.streamChat()` calls AI SDK (Anthropic/Google/OpenAI) with MCP tools
3. AI model invokes tools -> `RalphMcpServer` executes via service layer
4. SSE events (`text-delta`, `tool-call`, `tool-result`, `done`) streamed back to frontend

**Terminal Session:**
1. Frontend calls `trpc.terminal.startSession` -> `TerminalService` spawns PTY via `node-pty`
2. Frontend subscribes to WebSocket `terminal:{id}:output` and `terminal:{id}:state`
3. User input sent via WebSocket `terminal.input` messages -> `TerminalService.sendInput()`

**State Management:**
- Zustand stores hold client state (projects list, active loops, chat messages)
- Stores call API helpers (which call tRPC) for mutations
- Real-time updates arrive via WebSocket and update stores/components directly via hooks (`useWebSocket`, `useNotifications`)

## Key Abstractions

**ProcessManager:**
- Purpose: Generic child process lifecycle (spawn, track, kill, output buffering)
- Examples: `packages/backend/src/runner/ProcessManager.ts`
- Pattern: EventEmitter-based pub/sub for output and state changes

**ServiceError:**
- Purpose: Typed errors with tRPC error codes for service -> API layer error translation
- Examples: `packages/backend/src/lib/ServiceError.ts`
- Pattern: Caught in tRPC router via `asTRPCError()` helper that maps to TRPCError

**Fastify Decorators for DI:**
- Purpose: All services attached to Fastify instance as decorators in `createApp()`
- Examples: `packages/backend/src/app.ts` lines 263-278
- Pattern: `app.decorate('loopService', loopService)` -> accessed via `opts.req.server.loopService` in tRPC context

**WebSocket Channel Subscriptions:**
- Purpose: Pub/sub pattern for real-time data (loop output, state, metrics, chat, terminal, notifications, preview)
- Examples: `packages/backend/src/api/websocket.ts`
- Pattern: Client sends `{"type":"subscribe","channels":["loop:abc:output"]}`, server replays history then streams updates

## Entry Points

**Backend Server:**
- Location: `packages/backend/src/serve.ts`
- Triggers: `npm run dev` or `npm run start`
- Responsibilities: Creates Fastify app, binds to port, handles graceful shutdown

**Backend App Factory:**
- Location: `packages/backend/src/app.ts` (`createApp()`)
- Triggers: Called by `serve.ts` and test suites
- Responsibilities: Instantiates all services, registers routes/plugins, configures CORS/static serving

**Frontend Entry:**
- Location: `packages/frontend/src/main.tsx`
- Triggers: Vite dev server or built bundle
- Responsibilities: Renders React app with providers

**Frontend Router:**
- Location: `packages/frontend/src/App.tsx`
- Routes: `/` (home), `/project/:id/:tab` (project tabs), `/settings`

## Error Handling

**Strategy:** Service layer throws `ServiceError` with tRPC codes; tRPC router catches and re-throws as `TRPCError`

**Patterns:**
- All tRPC procedures use `.catch((error) => asTRPCError(error))` pattern
- `assertDangerousOperationAllowed()` guards destructive operations (terminal, ralph process kill) behind loopback-only check
- Chat streaming uses SSE error events for mid-stream failures
- WebSocket uses `safeSend()` to silently swallow send failures on closed connections

## Cross-Cutting Concerns

**Logging:** Fastify built-in logger (pino), injected into services via `{ logger: app.log }`
**Validation:** Zod schemas in tRPC router inputs and REST endpoint body parsing
**Authentication:** None (relies on bind host safety - loopback only for dangerous operations)
**Security:** Origin checking via `isOriginAllowed()`, dangerous operation gating via `allowsDangerousOperations()` (loopback check)

---

*Architecture analysis: 2026-03-08*
