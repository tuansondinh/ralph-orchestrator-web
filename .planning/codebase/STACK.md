# Technology Stack

**Analysis Date:** 2026-03-08

## Languages

**Primary:**
- TypeScript ^5.9.3 - All backend and frontend code
- ES2022 target, ESNext modules, Bundler moduleResolution (`tsconfig.base.json`)

**Secondary:**
- SQL (SQLite dialect) - Database schema via Drizzle ORM

## Runtime

**Environment:**
- Node.js (ES modules, `"type": "module"` in both packages)
- tsx ^4.21.0 - Dev-time TypeScript execution for backend

**Package Manager:**
- npm workspaces
- Lockfile: `package-lock.json` (present)

## Frameworks

**Core:**
- Fastify ^5.7.4 - Backend HTTP server (`packages/backend/src/app.ts`)
- React ^19.2.4 - Frontend UI (`packages/frontend/`)
- tRPC ^11.10.0 - Type-safe API layer (`@trpc/server` backend, `@trpc/client` + `@trpc/react-query` frontend)

**Testing:**
- Vitest ^4.0.18 - Unit/integration tests (both packages)
- @testing-library/react ^16.3.2 - Component testing
- Playwright ^1.58.2 - E2E tests (`packages/frontend/playwright.config.ts`)
- jsdom ^28.1.0 - DOM environment for frontend tests

**Build/Dev:**
- Vite ^7.3.1 - Frontend bundler (`packages/frontend/vite.config.ts`)
- Tailwind CSS ^4.2.0 via `@tailwindcss/vite` plugin
- concurrently ^9.1.2 - Parallel dev server startup
- ESLint ^9.21.0 + typescript-eslint ^8.25.0 (`eslint.config.mjs`)
- jscpd ^4.0.5 - Code duplication detection

## Key Dependencies

**Critical:**
- ai ^6.0.100 (Vercel AI SDK) - LLM streaming/tool-calling abstraction (`packages/backend/src/services/McpChatService.ts`)
- @ai-sdk/anthropic ^3.0.47 - Claude model provider
- @ai-sdk/google ^3.0.31 - Gemini model provider
- @ai-sdk/openai ^3.0.33 - OpenAI model provider
- @modelcontextprotocol/sdk ^1.27.1 - MCP server implementation (`packages/backend/src/mcp/RalphMcpServer.ts`)
- better-sqlite3 ^12.6.2 - SQLite database driver
- drizzle-orm ^0.45.1 + drizzle-kit ^0.31.9 - ORM and migration tooling
- node-pty ^1.1.0 - Pseudo-terminal for subprocess management (`packages/backend/src/services/TerminalService.ts`)

**Infrastructure:**
- @fastify/cors ^11.2.0 - CORS handling
- @fastify/static ^9.0.0 - Static file serving (production frontend)
- @fastify/websocket ^11.2.0 - WebSocket support
- ws ^8.19.0 - WebSocket client (tests and internal)
- zod ^4.3.6 - Schema validation (backend)

**Frontend:**
- zustand ^5.0.11 - State management
- @tanstack/react-query ^5.90.21 - Server state (via tRPC integration)
- react-router-dom ^7.13.0 - Client-side routing
- @xterm/xterm ^6.0.0 + @xterm/addon-fit ^0.11.0 - Terminal emulator UI
- react-markdown ^10.1.0 - Markdown rendering
- clsx ^2.1.1 + tailwind-merge ^3.4.1 - CSS class utilities
- yaml ^2.8.2 - YAML parsing (both packages)

## Configuration

**Environment:**
- `.env.local` present (root) - local dev environment config
- `RALPH_UI_DB_PATH` - SQLite database path (default: `.ralph-ui/data.db`)
- `RALPH_UI_BIND_HOST` - Server bind host (default: `0.0.0.0` in production)
- `RALPH_UI_RALPH_BIN` - Override ralph binary path
- `PORT` / `VITE_PORT` - Server ports (dev: backend 3003, frontend 5174)
- `VITE_RALPH_ORCHESTRATOR_BACKEND_ORIGIN` - Backend URL for frontend

**Build:**
- `tsconfig.base.json` - Shared TypeScript config (root)
- `packages/backend/tsconfig.json` - Backend TypeScript config
- `packages/frontend/tsconfig.json` - Frontend TypeScript config
- `packages/backend/drizzle.config.ts` - Drizzle ORM/migration config
- `packages/frontend/vite.config.ts` - Vite build config
- `packages/backend/vitest.config.ts` - Backend test config
- `packages/frontend/vitest.config.ts` - Frontend test config
- `eslint.config.mjs` - Root ESLint config

## Monorepo Structure

**Workspaces:**
- `@ralph-ui/backend` (`packages/backend/`)
- `@ralph-ui/frontend` (`packages/frontend/`)

**Scripts:**
- `npm run dev` - Start both packages concurrently
- `npm run build` - Build all workspaces
- `npm run quality` - Lint + typecheck + test + coverage + complexity + duplication
- `npm run test:e2e` - Playwright E2E tests

## Platform Requirements

**Development:**
- Node.js with native module support (node-pty requires node-gyp/compilation)
- macOS/Linux (node-pty PTY support)

**Production:**
- `NODE_ENV=production npm run start` serves compiled backend + static frontend
- SQLite file-based database (no external DB server required)

---

*Stack analysis: 2026-03-08*
