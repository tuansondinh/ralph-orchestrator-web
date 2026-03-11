# Ralph Orchestrator Web

## What This Is

Ralph Orchestrator Web is a cloud-deployed monorepo application (Fastify backend + React frontend) for managing AI-driven coding workflows. Users manage projects, run coding loops with multiple AI backends, chat with an AI assistant that has tool access via MCP, and interact through terminal sessions — all through a real-time WebSocket-backed UI.

## Core Value

Users can reliably orchestrate AI coding loops and chat with an AI assistant through a polished, intuitive web interface where Chat is the primary interaction point.

## Current Milestone: v0.9 Polish

**Goal:** Polish the app to release quality — fix loop output rendering, automate git workflow (branch + PR), per-user API keys, clean up cluttered UI, and fix terminal/chat bugs.

**Target features:**
- Loop output rendered properly via xterm.js (replacing broken ANSI parser)
- Loops auto-create branch, push, and open PR on completion
- Loops start on a new git branch
- Per-user API key configuration in cloud mode
- Chat is the primary tab (first in nav)
- Chat tool calls collapsed by default
- Terminal tab reliability fixes
- UI cleanup and decluttering across all views
- Ralph MCP auto-configured for opencode during deploy

## Requirements

### Validated

- ✓ Users can manage projects through the web UI and backend services — v0
- ✓ Users can start and monitor Ralph loop executions with persisted backend state — v0
- ✓ Users can use chat and terminal sessions backed by spawned processes and real-time streaming — v0
- ✓ The system pushes real-time updates for loop, terminal, chat, preview, and notification flows over WebSockets — v0
- ✓ Supabase auth with GitHub OAuth in cloud mode — v0
- ✓ Cloud project service with workspace management — v0
- ✓ Build and tests pass across the monorepo — v0

### Active

- [ ] Loop output is rendered correctly using a proper terminal emulator (xterm.js)
- [ ] Loops automatically push the working branch and open a pull request on completion
- [ ] Loops start on a new git branch created before the loop process spawns
- [ ] Per-user API key storage and configuration in cloud mode
- [ ] Chat tab is the default/first tab when opening a project
- [ ] Chat tool call messages are collapsed by default (expandable on click)
- [ ] Terminal tab renders reliably on tab switch without blank/janky state
- [ ] UI is clean, uncluttered, and visually consistent across all views
- [ ] Ralph MCP is auto-configured for opencode during deployment

### Out of Scope

- New AI backend integrations — focus on polishing existing backends
- Mobile-native app — web-first
- Multi-tenant billing/subscription — internal team use
- Major architectural rewrites — targeted fixes only

## Context

The app is deployed on a single EC2 instance with Supabase Auth. The previous milestone (cloud deployment) shipped auth, cloud services, and frontend integration. The app works but has rough edges: loop output uses a naive ANSI parser that can't handle complex escape sequences, there's no git automation after loop completion, API keys are global (not per-user), the terminal tab has intermittent rendering issues, and the UI feels cluttered with tools expanded in chat.

The chat feature is the primary use case — it should be front and center, not buried behind loops.

## Constraints

- **Deployment**: Single EC2 instance — all changes must work in this environment
- **Architecture**: Existing Fastify + React + SQLite monorepo — work within established boundaries
- **Backend compatibility**: Loop output change (xterm.js) requires backend to stream raw PTY output, not parsed lines
- **Cloud mode**: Per-user API keys need a new DB table scoped to user ID from Supabase auth

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Replace custom ANSI parser with xterm.js for loop output | Custom parser can't handle cursor movement, bold, OSC sequences — xterm.js handles everything | — Pending |
| Auto-push + PR on loop completion | Users shouldn't need to manually push and create PRs after every loop | — Pending |
| Per-user API keys (not shared) | Cloud mode has multiple users; shared keys are a security/billing issue | — Pending |
| Chat as first/default tab | Chat is the primary use case of the app | — Pending |

---
*Last updated: 2026-03-11 after milestone v1.0 Polish started*
