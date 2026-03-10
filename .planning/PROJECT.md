# Ralph Orchestrator Web Stabilization

## What This Is

Ralph Orchestrator Web is a monorepo application with a Fastify backend and React frontend for managing Ralph-driven project workflows. It lets internal operators manage projects, run loops, interact with chat and terminal sessions, and observe real-time state through WebSocket-backed UI flows. This project initialization defines the next milestone as stabilizing the existing product, fixing high-risk bugs, and preparing the current app for a conservative internal-team deployment.

## Core Value

The current app must run reliably enough that the internal team can execute core Ralph orchestration workflows without avoidable failures or deployment risk.

## Requirements

### Validated

- ✓ Internal operators can manage projects through the web UI and backend services — existing
- ✓ Internal operators can start and monitor Ralph loop executions with persisted backend state — existing
- ✓ Internal operators can use chat and terminal sessions backed by spawned processes and real-time streaming — existing
- ✓ The system can push real-time updates for loop, terminal, chat, preview, and notification flows over WebSockets — existing
- ✓ The app can run as a monorepo with Fastify, React, tRPC, SQLite, and workspace-based build tooling — existing

### Active

- [ ] Review the current codebase for the highest-risk bugs, regressions, and deployment blockers
- [ ] Fix user-facing and operational issues across project, loop, chat, terminal, and real-time update flows
- [ ] Stabilize the build, test, and release path so the current app can be deployed with confidence
- [ ] Reduce deployment risk by addressing critical safety, configuration, and reliability gaps that affect an internal-team release

### Out of Scope

- Major new product features — this milestone is for stabilization and deployment readiness, not feature expansion
- Large architectural rewrites of backend or frontend subsystems — refactors are only in scope when needed to fix reliability or release blockers
- Broad multi-tenant or internet-facing hardening — the current release target is a conservative internal-team deployment

## Context

This is a brownfield monorepo with substantial existing backend and frontend behavior already mapped in `.planning/codebase/`. The backend is a Fastify service with tRPC, REST, WebSocket, SQLite, and process-management layers that spawn and monitor Ralph CLI, chat, preview, and terminal processes. The frontend is a React SPA using Zustand stores and tRPC helpers to drive project, loop, chat, preview, notification, and terminal UI flows.

Existing codebase analysis already highlights relevant concerns for this milestone: failing frontend tests, fragile process and WebSocket state management, missing validation around terminal input, risk from production bind defaults, and performance debt around in-memory rate limiting and polling-heavy subscriptions. The current effort should treat these findings as starting points, then verify them through review and testing before defining the implementation roadmap.

The intended release posture is conservative. The audience is the internal team, so the priority is dependable behavior, predictable deployment, and closing the highest-risk operational gaps rather than maximizing feature scope.

## Constraints

- **Audience**: Internal team release target — optimize for operator reliability over public-product polish
- **Scope**: Stabilization only — prioritize defects, regressions, and deployment blockers over new capability
- **Architecture**: Existing Fastify + React + SQLite monorepo — work with established system boundaries unless a small targeted extraction materially reduces release risk
- **Safety**: Conservative deployment posture — changes should reduce operational risk and avoid broad destabilizing rewrites
- **Verification**: Build and test path must be trustworthy — release readiness requires credible validation, not just code inspection

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Treat this as a brownfield stabilization milestone | The product already exists with mapped architecture and known concerns | — Pending |
| Target an internal-team deployment first | The user wants deployment readiness without broad external-product hardening | — Pending |
| Prioritize review, bug fixes, and release path stability over feature work | The stated goal is to fix bugs, prepare deployment, and reduce risk conservatively | — Pending |

---
*Last updated: 2026-03-10 after initialization*
