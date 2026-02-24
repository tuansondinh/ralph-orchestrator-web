# Ralph Orchestrator Web

A local web app for running Ralph workflows across multiple projects, watching loop activity live, and reviewing changes before you ship.

This repo contains:
- `packages/backend`: Fastify + tRPC backend (pretty much copied from ralph-orchestrator, with features built on top)
- `packages/frontend`: React + Vite frontend

This project uses the amazing Ralph-Orchestrator CLI: <https://github.com/mikeyobrien/ralph-orchestrator>

## What This App Does

- Manage many code projects from one dashboard
- Start Ralph loops with a preset + editable `PROMPT.md`
- Stream loop output, state, and metrics in realtime
- Run `ralph plan` / `ralph task` from the Terminal tab
- Inspect app behavior in Preview
- Review loop diffs in `Review Changes`
- Get loop notifications (complete/fail)

## Screenshots

### Dashboard
![Dashboard](docs/screenshots/dashboard.png)

### Loops (Output)
![Loops](docs/screenshots/loops.png)
Callouts:
- Left panel: editable `PROMPT.md`, preset, worktree, exclusive mode
- Middle panel: loop run history
- Right panel (`Output`): live streamed loop output

### Loops (Review Changes)
![Review Changes](docs/screenshots/review-changes.png)
Callouts:
- `Review Changes` tab for completed/stopped loops
- File list with per-file +/- counts
- Unified diff viewer for quick review before merge

### Terminal (`ralph plan` / `ralph task`)
![Terminal](docs/screenshots/terminal.png)

### Settings
![Settings](docs/screenshots/settings.png)

## Quick Start

From repo root:

```bash
npm install
npm run db:migrate -w @ralph-ui/backend
npm run dev
```

Open:
- `http://localhost:5174`

Default dev ports:
- Backend: `3001`
- Frontend: `5174` (proxies `/trpc` and `/ws` to backend)

## First 5 Minutes

1. Create or open a project.
2. Go to `Loops`.
3. Confirm `PROMPT.md` content, edit if needed, choose a preset, click `Start`.
4. Watch live output and status on the right panel.
5. Use `Terminal` to run `ralph plan` / `ralph task` when needed.
6. For finished loops, open `Review Changes`.
7. Open `Preview` for running app output.

## Tabs Overview

- `Loops`: Start/stop/restart loops, stream output, review diffs
- `Terminal`: Interactive project terminal + quick `ralph plan` / `ralph task`
- `Monitor`: Not supported yet (placeholder)
- `Preview`: Start and inspect app preview server output
- `Settings`: Ralph binary path, notifications, preview/network settings, maintenance tools

## Keyboard Shortcuts

- `Cmd/Ctrl+K`: open project quick switcher
- `Cmd/Ctrl+N`: open new project dialog
- `Cmd/Ctrl+1..4`: switch tabs (`Loops` / `Terminal` / `Monitor` / `Preview`)
- `Esc`: close dialogs

## Requirements

- Node.js 18+
- npm

## Config Notes

### Prompt File Resolution

Loop prompt content is loaded from:
1. `event_loop.prompt_file` in the project config
2. fallback: `PROMPT.md`

### Ralph Binary Resolution

The backend resolves the Ralph binary in this order:
1. `settings.ralphBinaryPath` (from UI Settings)
2. `RALPH_UI_RALPH_BIN`
3. workspace-local `node_modules/.bin/ralph`
4. `ralph` on system `PATH`

### Database Location

- Default: `.ralph-ui/data.db` under backend working directory
- Typical local path in this repo: `packages/backend/.ralph-ui/data.db`
- Override with: `RALPH_UI_DB_PATH`

## Security Model (Local-Only)

This app is intentionally local-only and has no authentication layer.

- Backend bind host defaults to `127.0.0.1`
- Localhost origins are allowed for CORS + WebSocket by default
- Additional origins: `RALPH_UI_ALLOWED_ORIGINS`
- Bind another interface: `RALPH_UI_BIND_HOST`
- Dangerous endpoints are blocked on non-loopback hosts by default
- Unsafe override: `RALPH_UI_ALLOW_REMOTE_UNSAFE_OPS=1`

Do not expose this backend to untrusted networks.
See [SECURITY.md](SECURITY.md) for details.

## Workspace Commands

- Test all workspaces: `npm run test`
- Typecheck all workspaces: `npm run typecheck`
- Build all workspaces: `npm run build -ws`

## License

This project is licensed under the MIT License.
See [LICENSE](LICENSE).

## Repository Layout

- `packages/backend`: API, services, runtime/process integration
- `packages/frontend`: UI components, routes, realtime clients, state stores
- `specs/`: planning/design artifacts
