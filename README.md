# ralph-orchestrator-web

`ralph-orchestrator-web` is a monorepo app for running and observing Ralph Orchestrator workflows.
It has a Fastify + tRPC backend and a React + Vite frontend.

it uses the amazing Ralph orchestrator
https://github.com/mikeyobrien/ralph-orchestrator 

## Stupid-Simple Setup

Copy and run from repo root:

```bash
npm install
npm run db:migrate -w @ralph-ui/backend
npm run dev
```

Then open:
- `http://localhost:5174`

## Current State

Implemented project tabs:
- `Loops`
- `Terminal`
- `Monitor`
- `Preview`
- `Settings`

Current Loops behavior:
- Start loop with prompt, preset, and `Exclusive mode`.
- Show the current prompt file content in the UI.
- Prompt file is resolved from `event_loop.prompt_file` in project config, with fallback to `PROMPT.md`.
- Stream loop output/state in realtime via WebSocket.
- Stop and restart loops.
- Show reviewable loop diffs in `Review Changes`.

Current keyboard shortcuts:
- `Cmd/Ctrl+K`: open project quick switcher
- `Cmd/Ctrl+N`: open new project dialog
- `Cmd/Ctrl+1..4`: switch project tabs (Loops/Terminal/Monitor/Preview)
- `Esc`: close dialogs

## Prerequisites

- Node.js 18+
- npm

## Setup

1. Install dependencies:
```bash
npm install
```

2. Run backend migrations:
```bash
npm run db:migrate -w @ralph-ui/backend
```

Database location:
- Default: `.ralph-ui/data.db` under the backend process working directory
- In typical workspace dev flow: `packages/backend/.ralph-ui/data.db`
- Override: `RALPH_UI_DB_PATH`

## Development

Run backend + frontend together:
```bash
npm run dev
```

Default dev ports:
- Backend: `3001`
- Frontend: `5174` (proxies `/trpc` and `/ws` to backend)

## Local-Only Security Model

This app is intentionally local-only and does not include authentication.

- Backend bind host defaults to `127.0.0.1`.
- CORS and WebSocket origin policy allow localhost loopback origins by default.
- To allow additional non-local origins explicitly, set:
  - `RALPH_UI_ALLOWED_ORIGINS` as a comma-separated list of origins.
- To bind on a different interface, set:
  - `RALPH_UI_BIND_HOST`
- Dangerous endpoints (`terminal.*`, `ralph.*`, `settings.clearData`, `settings.testBinary`) are disabled when bind host is non-loopback.
  - Override only if you understand the risk: `RALPH_UI_ALLOW_REMOTE_UNSAFE_OPS=1`

Do not expose the backend to untrusted networks.
See `SECURITY.md` for threat model details and non-loopback caveats.

## Workspace Commands

- Tests (all workspaces): `npm run test`
- Typecheck (all workspaces): `npm run typecheck`
- Build (all workspaces): `npm run build -ws`

## Ralph Binary Resolution

The backend resolves the Ralph binary in this order:
1. `settings.ralphBinaryPath` (saved from Settings UI)
2. `RALPH_UI_RALPH_BIN`
3. workspace-local `node_modules/.bin/ralph`
4. `ralph` on system `PATH`

## Repository Layout

- `packages/backend`: API, services, process/runtime integration
- `packages/frontend`: UI, routes, realtime clients, state stores
- `specs/`: planning/design task artifacts
