# Ralph Orchestrator — Cloud Integration

## What This Is

A unified AI orchestration platform that works locally and in the cloud. Currently a local-first desktop tool (Fastify + SQLite + React) for managing AI loops, chat sessions, and terminals. The goal is to port ralph-cloud's SaaS control plane features into this app — multi-tenant orgs/projects, remote ECS runtimes, preview deployments, credentials management, usage tracking, and realtime collaboration — achieving full parity with ralph-cloud while keeping local mode as the default experience.

## Core Value

Users can seamlessly scale from local AI loop execution to cloud-based ECS runtimes when they need more capacity, without changing their workflow.

## Requirements

### Validated

<!-- Existing capabilities confirmed from codebase map -->

- ✓ Local loop lifecycle management (start, stop, monitor, output streaming) — existing
- ✓ AI chat with MCP tool calling (Anthropic, Google, OpenAI providers) — existing
- ✓ Terminal session management via PTY — existing
- ✓ Real-time WebSocket pub/sub for output and state — existing
- ✓ Project management with SQLite persistence — existing
- ✓ Dev preview server management — existing
- ✓ tRPC type-safe API layer — existing
- ✓ Zustand state management + React frontend — existing

### Active

<!-- Cloud features to port from ralph-cloud -->

- [ ] Dual-mode database (SQLite local, Supabase Postgres cloud)
- [ ] Supabase Auth integration (email/password, session management)
- [ ] Multi-tenant organizations with RBAC (owner/editor/viewer)
- [ ] Project-level memberships and access control
- [ ] Remote loop execution via ECS Fargate
- [ ] ECS task orchestration (RunTask, StopTask, status tracking)
- [ ] Preview deployments with SQS queue integration
- [ ] Encrypted credential storage for AI backends
- [ ] Usage tracking (AI tokens, ECS compute, preview infra costs)
- [ ] User notifications system
- [ ] Realtime event stream (Supabase realtime + polling fallback)
- [ ] Interactive sessions with presence and collaboration
- [ ] Source management (GitHub/GitLab integrations, seed sources)
- [ ] AWS CDK infrastructure-as-code (VPC, ECS, SQS stacks)
- [ ] Cloud UI pages (rebuilt from scratch using existing component patterns)

### Out of Scope

- Mobile app — web-first
- Custom AI model hosting — use existing providers (Anthropic, Google, OpenAI)
- Billing/payments system — usage tracking only, no payment processing
- Ralph-cloud frontend code reuse — rebuilding UI from scratch in this app's patterns

## Context

- **Source codebase:** `/Users/sonwork/Workspace/ralph-cloud` contains the complete cloud control plane implementation to port
- **Ralph-cloud architecture:** Fastify API + React/Vite frontend + Supabase Postgres + AWS (ECS, SQS, CDK)
- **Ralph-cloud domain model:** 18+ relational tables (users, orgs, projects, memberships, sessions, loops, previews, credentials, notifications, usage, audit, realtime events)
- **Current deployment:** ralph-cloud runs on ECS Fargate (API) + Firebase Hosting (frontend) + Supabase managed Postgres
- **Key ralph-cloud services:** ControlPlaneStore (DI-based CRUD), SessionRuntime, LoopRuntime, PreviewDeploymentRuntime, EcsLoopOrchestrator, SqsPreviewEnqueue
- **Existing app patterns:** Fastify decorators for DI, ProcessManager for subprocess lifecycle, EventEmitter pub/sub, Drizzle ORM

## Constraints

- **Dual-mode DB**: Must support SQLite (local default) and Supabase Postgres (cloud opt-in) — requires abstraction layer
- **Backward compatibility**: Local mode must continue working exactly as-is with no cloud dependencies
- **Tech stack**: Keep existing stack (Fastify, tRPC, React, Zustand, Drizzle) — extend rather than replace
- **Auth boundary**: No auth in local mode (current loopback safety); Supabase Auth required in cloud mode
- **AWS dependency**: Cloud features require AWS account (ECS, SQS) — local mode has zero AWS dependency

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Dual-mode DB (SQLite + Postgres) | Keep local-first default while enabling cloud scale | — Pending |
| Rebuild cloud UI from scratch | Match existing app patterns rather than port ralph-cloud's React code | — Pending |
| Supabase Auth for cloud mode | Matches ralph-cloud's proven auth approach | — Pending |
| Port CDK infrastructure code | Infrastructure-as-code enables reproducible cloud deployments | — Pending |
| Local mode stays default | Cloud is opt-in, zero friction for local use | — Pending |

---
*Last updated: 2026-03-08 after initialization*
