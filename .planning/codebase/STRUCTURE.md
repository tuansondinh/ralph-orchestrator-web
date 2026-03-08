# Codebase Structure

**Analysis Date:** 2026-03-08

## Directory Layout

```
ralph-orchestrator-web/
├── packages/
│   ├── backend/                # Fastify + tRPC + SQLite backend
│   │   ├── src/
│   │   │   ├── api/            # WebSocket handler
│   │   │   ├── db/             # Drizzle ORM schema, connection, migrations
│   │   │   ├── lib/            # Shared utilities (safety, origin, diff parsing)
│   │   │   ├── mcp/            # MCP server for AI tool calling
│   │   │   ├── runner/         # Process management (spawn, buffer, parse)
│   │   │   ├── services/       # Business logic (16 service classes)
│   │   │   ├── trpc/           # tRPC router and context
│   │   │   ├── types/          # Fastify type augmentation
│   │   │   ├── app.ts          # App factory (createApp)
│   │   │   └── serve.ts        # Server entry point
│   │   ├── test/               # Backend test files
│   │   ├── drizzle/            # DB migration files
│   │   ├── presets/            # Built-in + custom preset YAML files
│   │   │   └── custom/         # User-created presets
│   │   └── dist/               # Compiled JS output (generated)
│   └── frontend/               # React + Zustand + Vite SPA
│       ├── src/
│       │   ├── components/     # UI components by domain
│       │   │   ├── chat/       # Chat UI (ChatView, ChatInput, ChatOverlay)
│       │   │   ├── common/     # Shared components (SaveSettingsAction)
│       │   │   ├── errors/     # Error boundaries
│       │   │   ├── layout/     # Shell, Sidebar, TabBar, PixelCat
│       │   │   ├── loops/      # Loop management (LoopsView, LoopCard, StartLoopDialog, DiffViewer)
│       │   │   ├── monitor/    # Monitoring (EventTimeline, MetricsPanel, StatusCards)
│       │   │   ├── notifications/ # Toast and notification center
│       │   │   ├── preview/    # Dev preview iframe
│       │   │   ├── project/    # Project management (NewProjectDialog, ProjectConfig, EmptyState)
│       │   │   ├── system/     # System tools (RalphProcessList)
│       │   │   ├── tasks/      # Task listing
│       │   │   └── terminal/   # Terminal emulator (xterm.js)
│       │   ├── hooks/          # React hooks (useWebSocket, useChat, useNotifications, useKeyboardShortcuts)
│       │   ├── lib/            # API helpers and utilities
│       │   ├── pages/          # Route pages (ProjectPage, SettingsPage)
│       │   ├── providers/      # React context providers (AppProviders)
│       │   ├── stores/         # Zustand state stores
│       │   └── test/           # Test setup files
│       ├── test/               # E2E tests (Playwright)
│       │   ├── e2e/            # E2E test specs
│       │   └── fixtures/       # Test fixtures
│       └── dist/               # Built frontend bundle (generated)
├── bin/                        # CLI scripts
├── specs/                      # Feature specifications and research
├── projects/                   # Local project data (gitignored runtime data)
├── docs/                       # Documentation
├── reports/                    # Generated reports
├── package.json                # Root workspace config
├── tsconfig.base.json          # Shared TypeScript config
├── eslint.config.mjs           # Root ESLint config
├── Dockerfile                  # Container build
└── ralph.yml                   # Ralph orchestrator config
```

## Directory Purposes

**`packages/backend/src/services/`:**
- Purpose: All business logic lives here as service classes
- Contains: 16 TypeScript files, one service class each
- Key files:
  - `LoopService.ts`: Loop lifecycle (start/stop/restart), output subscriptions, notifications
  - `ChatService.ts`: CLI-backed chat sessions (spawn ralph process)
  - `McpChatService.ts`: AI SDK chat with MCP tool calling
  - `ProjectService.ts`: Project CRUD, worktree management, config/prompt files
  - `TerminalService.ts`: PTY session management via node-pty
  - `DevPreviewManager.ts`: Dev server process management with port allocation
  - `MonitoringService.ts`: Loop metrics, event history, file content
  - `SettingsService.ts`: App settings persistence
  - `PresetService.ts`: YAML preset file management
  - `HatsPresetService.ts`: Built-in hats preset management
  - `TaskService.ts`: Task listing from project filesystem
  - `RalphProcessService.ts`: System ralph process listing/killing
  - `LoopDiffService.ts`, `LoopMetricsService.ts`, `LoopNotificationService.ts`: Extracted sub-services of LoopService
  - `loopUtils.ts`: Shared pure utility functions

**`packages/backend/src/runner/`:**
- Purpose: Low-level process spawning and output handling
- Contains: `ProcessManager.ts`, `OutputBuffer.ts`, `RalphEventParser.ts`

**`packages/backend/src/trpc/`:**
- Purpose: API route definitions
- Contains: `router.ts` (all tRPC sub-routers), `context.ts` (DI context from Fastify decorators)

**`packages/frontend/src/lib/`:**
- Purpose: API helper modules wrapping tRPC calls + utilities
- Contains: Per-domain API files (`loopApi.ts`, `projectApi.ts`, etc.), `trpc.ts` (client setup), `utils.ts`, `trpcError.ts`

**`packages/frontend/src/stores/`:**
- Purpose: Zustand state management
- Contains: `projectStore.ts`, `loopStore.ts`, `chatStore.ts`, `chatOverlayStore.ts`, `notificationStore.ts`, `terminalStore.ts`

## Key File Locations

**Entry Points:**
- `packages/backend/src/serve.ts`: Backend server startup
- `packages/backend/src/app.ts`: App factory (`createApp()`) - all service wiring happens here
- `packages/frontend/src/main.tsx`: Frontend React entry
- `packages/frontend/src/App.tsx`: Router and top-level app component

**Configuration:**
- `package.json`: Root workspace with dev/build/test scripts
- `packages/backend/package.json`: Backend dependencies
- `packages/frontend/package.json`: Frontend dependencies
- `tsconfig.base.json`: Shared TypeScript settings
- `packages/backend/drizzle.config.ts`: Drizzle ORM migration config
- `eslint.config.mjs`: Shared ESLint config

**Database:**
- `packages/backend/src/db/schema.ts`: Drizzle table definitions (projects, loopRuns, chatSessions, chatMessages, notifications, settings)
- `packages/backend/src/db/connection.ts`: Database creation and initialization
- `packages/backend/src/db/migrate.ts`: Migration runner
- `packages/backend/drizzle/`: Generated migration SQL files

**Type Sharing:**
- `packages/backend/src/trpc/router.ts`: Exports `AppRouter` type
- `packages/frontend/src/lib/trpc.ts`: Imports `AppRouter` type from backend for type-safe tRPC client

## Naming Conventions

**Files:**
- PascalCase for classes/components: `LoopService.ts`, `ChatView.tsx`, `AppShell.tsx`
- camelCase for utilities/hooks/stores: `loopUtils.ts`, `useWebSocket.ts`, `projectStore.ts`
- camelCase for API helpers: `loopApi.ts`, `projectApi.ts`

**Directories:**
- lowercase for all directories: `services/`, `components/`, `hooks/`
- Domain-based component grouping: `components/chat/`, `components/loops/`

**Tests:**
- Backend: `test/*.test.ts` (separate test directory)
- Frontend: `src/**/*.test.tsx` (co-located with source, must use `.tsx` extension)

## Where to Add New Code

**New Backend Service:**
- Implementation: `packages/backend/src/services/NewService.ts`
- Wire up in: `packages/backend/src/app.ts` (instantiate, decorate on app)
- Add to context: `packages/backend/src/trpc/context.ts`
- Add tRPC routes: `packages/backend/src/trpc/router.ts` (new sub-router)
- Add Fastify type: `packages/backend/src/types/fastify.d.ts`
- Tests: `packages/backend/test/NewService.test.ts`

**New Frontend Feature/Tab:**
- Component directory: `packages/frontend/src/components/feature-name/`
- Main view component: `packages/frontend/src/components/feature-name/FeatureView.tsx`
- API helpers: `packages/frontend/src/lib/featureApi.ts`
- Store (if needed): `packages/frontend/src/stores/featureStore.ts`
- Add tab to: `packages/frontend/src/pages/ProjectPage.tsx` (validTabs array + render)
- Add tab link to: `packages/frontend/src/components/layout/TabBar.tsx`
- Tests: Co-locate as `FeatureView.test.tsx`

**New React Component:**
- Place in appropriate domain directory under `packages/frontend/src/components/`
- Tests: Co-locate as `ComponentName.test.tsx`

**New Hook:**
- Implementation: `packages/frontend/src/hooks/useHookName.ts`
- Tests: `packages/frontend/src/hooks/useHookName.test.tsx`

**New Utility:**
- Backend: `packages/backend/src/lib/utilName.ts`
- Frontend: `packages/frontend/src/lib/utilName.ts`

**New Database Table:**
- Add schema to: `packages/backend/src/db/schema.ts`
- Generate migration: `npm run db:generate -w @ralph-ui/backend`
- Run migration: `npm run db:migrate -w @ralph-ui/backend`

## Special Directories

**`projects/`:**
- Purpose: Runtime project data (working directories, ralph config, worktrees)
- Generated: Yes (created at runtime)
- Committed: No (gitignored)

**`packages/backend/presets/`:**
- Purpose: Built-in preset YAML configurations
- Generated: No
- Committed: Yes

**`packages/backend/presets/custom/`:**
- Purpose: User-created custom presets
- Generated: Yes (created via PresetService)
- Committed: Yes

**`specs/`:**
- Purpose: Feature specifications, research, and task definitions
- Generated: No
- Committed: Partially (some subdirs gitignored)

**`packages/*/dist/`:**
- Purpose: Build output
- Generated: Yes
- Committed: No

**`packages/*/coverage/`:**
- Purpose: Test coverage reports
- Generated: Yes
- Committed: No

---

*Structure analysis: 2026-03-08*
