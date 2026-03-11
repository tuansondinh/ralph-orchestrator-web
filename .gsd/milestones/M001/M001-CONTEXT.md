# M001 Context

**Depends on:** (none — first milestone, migrated from v0 cloud deployment)

## Background

Milestone M001 (v0.9 Polish) picks up after the v0 Cloud Deployment milestone (Phases 1–5) which shipped Supabase auth, GitHub OAuth, cloud project services, and WebSocket-backed real-time streaming. The app works but has several rough edges that this milestone addresses.

## Key Context for Executors

- **Deployment target:** Single EC2 instance with Supabase Auth and a Postgres DB. SQLite is used locally.
- **Monorepo:** Fastify backend (`packages/backend`) + React frontend (`packages/frontend`)
- **Backend compatibility:** The loop output change (S01) required streaming raw PTY bytes — any downstream code expecting line-split strings has been updated.
- **Cloud mode:** Per-user API keys (S03) will need a new DB migration that must run cleanly in the EC2 deploy environment.
- **xterm.js:** Already a project dependency used by TerminalView.tsx — no new packages needed for S01.

## Blockers Known at Milestone Start

- Backend must stream raw PTY bytes (not parsed lines) for xterm.js integration — **resolved in S01**.
- Per-user keys require a new DB migration — **to be addressed in S03**.
