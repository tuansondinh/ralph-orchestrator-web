# Project Research Summary

**Project:** Ralph Orchestrator Cloud Integration
**Domain:** Hybrid local-cloud AI orchestration platform (local-first SaaS extension)
**Researched:** 2026-03-08
**Confidence:** HIGH

## Executive Summary

Ralph Orchestrator is a local-first AI loop orchestration tool being extended to support cloud-hosted multi-user workflows. The core challenge is building a dual-mode system where local mode (SQLite, no auth, single user) remains untouched while cloud mode (Supabase Postgres, JWT auth, multi-tenant) layers on top. This is a well-understood pattern -- local-first apps that grow into SaaS -- but the execution is tricky because the existing codebase has zero multi-tenancy concepts, zero authentication, and a 1500-line LoopService god object that must be refactored before cloud features can be added safely.

The recommended approach leverages Supabase as the cloud backbone (auth, Postgres, realtime) and AWS ECS Fargate for remote compute orchestration. Drizzle ORM, already in the codebase, supports both SQLite and Postgres but requires separate schema definitions per dialect -- this dual-schema repository pattern is the foundational architectural decision that everything else depends on. The stack choices are high-confidence because most technologies are already in use (Drizzle, Fastify, tRPC) or proven in the existing ralph-cloud codebase (CDK, ECS, SQS).

The top risks are: (1) dialect differences between SQLite and Postgres causing silent data bugs, (2) multi-tenancy data leaks from missing `WHERE org_id = ?` clauses, and (3) the LoopService god object becoming unmanageable with cloud branching. All three are preventable with upfront architectural work -- contract tests for both dialects, required orgId in type signatures, and executor interface extraction before any ECS code lands.

## Key Findings

### Recommended Stack

The existing stack (Fastify, tRPC, React, Zustand, Drizzle, Vite) stays unchanged. New additions are minimal and focused: Supabase JS client for auth and realtime, `postgres` (postgres.js) as the Postgres driver, and modular AWS SDK v3 clients for ECS/SQS/CloudWatch.

**Core new technologies:**
- **@supabase/supabase-js**: Auth + realtime + Postgres client -- single dependency covers three concerns
- **postgres (postgres.js)**: Lightweight ESM-native Postgres driver recommended by both Drizzle and Supabase docs
- **@aws-sdk/client-ecs + client-sqs**: Modular AWS SDK v3 for remote compute orchestration
- **aws-cdk-lib**: Infrastructure-as-code, already proven in ralph-cloud CDK stacks
- **Node.js crypto (built-in)**: AES-256-GCM for credential encryption at rest

### Expected Features

**Must have (table stakes):**
- Dual-mode database abstraction (SQLite local / Postgres cloud)
- Authentication via Supabase Auth (email/password + OAuth)
- Organization and project management with 3-role RBAC (owner/editor/viewer)
- Encrypted credential storage (AI API keys per org)
- Remote runtime execution on ECS Fargate
- Real-time output streaming for remote runtimes
- Usage tracking and reporting (tokens, compute hours)

**Should have (differentiators):**
- Seamless local-to-cloud continuity (same UI, more compute)
- Preview deployments with SQS queue integration
- Interactive sessions with presence indicators
- Source management (GitHub/GitLab repo connection)

**Defer (v2+):**
- Notifications system, CDK self-hosting, audit log, collaborative editing, billing, marketplace

### Architecture Approach

The system uses a mode-gated service registration pattern where cloud services are dynamically imported only when `RALPH_MODE=cloud`. A `DatabaseProvider` factory returns the correct Drizzle instance. A repository layer with shared TypeScript interfaces hides dialect differences. Auth is handled via tRPC middleware that is a passthrough in local mode. LoopService delegates to executor implementations (local ProcessManager vs EcsOrchestrator) via strategy pattern.

**Major components:**
1. **ModeResolver + DatabaseProvider** -- determines mode, provides correct DB connection
2. **Dual Schema Layer + Repository Pattern** -- separate SQLite/Postgres schemas behind shared interfaces
3. **AuthGuard (tRPC middleware)** -- conditional JWT validation, passthrough in local mode
4. **OrgService + RBAC** -- multi-tenant org/project/membership management
5. **EcsOrchestrator** -- remote loop execution via ECS Fargate RunTask/StopTask
6. **CredentialService** -- AES-256-GCM encrypted API key storage per org
7. **PreviewQueueService** -- SQS-based preview deployment queue

### Critical Pitfalls

1. **Dialect differences corrupt data silently** -- SQLite loose typing vs Postgres strict typing causes bugs that only appear in one mode. Prevent with contract test suites running against both dialects in CI.
2. **Multi-tenancy data leaks** -- Missing tenant scoping in any single query exposes cross-org data. Prevent with Postgres RLS as defense-in-depth and required `orgId` parameter in all cloud repository methods.
3. **LoopService god object expansion** -- Adding `if (isCloud)` branches to a 1500-line service creates untestable hydra code. Prevent by extracting `LoopExecutor` interface before any ECS code.
4. **Auth boundary contamination** -- Global auth middleware breaks local mode; per-route auth misses endpoints. Prevent with `publicProcedure` vs `protectedProcedure` pattern and mode-aware AuthContext.
5. **WebSocket channel isolation** -- Existing zero-auth WebSocket allows cross-user data access in cloud mode. Prevent by authenticating at upgrade time and scoping channels to org/project.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Dual-Mode Database Foundation
**Rationale:** Every cloud feature depends on Postgres being available. This is the highest-risk refactor since it touches all existing data access. Must be done first and validated thoroughly.
**Delivers:** ModeResolver, DatabaseProvider, repository interfaces, dual schema definitions, contract test suite, separate migration directories.
**Addresses:** Dual-mode DB abstraction (table stakes)
**Avoids:** Pitfall 1 (dialect differences), Pitfall 8 (migration ordering)

### Phase 2: Auth Infrastructure
**Rationale:** Required before any multi-tenant feature. Cannot build org management, RBAC, or any cloud-only service without knowing who the user is.
**Delivers:** Supabase Auth integration, AuthGuard tRPC middleware, protectedProcedure base, WebSocket upgrade auth, AuthContext in tRPC context.
**Addresses:** Authentication (table stakes)
**Avoids:** Pitfall 3 (auth boundary contamination), Pitfall 5 (WebSocket auth)

### Phase 3: Multi-Tenancy and RBAC
**Rationale:** Depends on both DB abstraction (Phase 1) and auth (Phase 2). Must be in place before any resource-owning feature.
**Delivers:** OrgService, org/project/membership CRUD, 3-role RBAC, tenant-scoped queries, RLS policies.
**Addresses:** Org management, project access control, RBAC (table stakes)
**Avoids:** Pitfall 4 (multi-tenancy data leaks)

### Phase 4: LoopService Refactor + Remote Execution
**Rationale:** Core cloud value proposition but requires executor interface extraction BEFORE ECS code. Depends on auth and multi-tenancy for access control.
**Delivers:** LoopExecutor interface, LocalLoopExecutor, EcsLoopExecutor, ECS Fargate integration, remote output streaming, task status reconciliation.
**Addresses:** Remote runtime execution, real-time streaming (table stakes)
**Avoids:** Pitfall 2 (god object), Pitfall 7 (ECS task lifecycle drift)

### Phase 5: Credential Management + Usage Tracking
**Rationale:** Supporting services that can be built after core cloud features are functional. Credential storage is needed before users can actually run AI loops remotely.
**Delivers:** CredentialService (AES-256-GCM encryption), per-org API key management, UsageService (token/compute tracking), usage dashboard.
**Addresses:** Encrypted credential storage, usage tracking (table stakes)
**Avoids:** Pitfall 6 (credential security gap)

### Phase 6: Preview Deployments + Advanced Features
**Rationale:** High-complexity differentiator features that build on all previous phases. Can be partially parallelized.
**Delivers:** PreviewQueueService, SQS integration, preview deployment worker, source management (GitHub/GitLab), notifications.
**Addresses:** Preview deployments, source management (differentiators)

### Phase 7: Cloud UI + Infrastructure
**Rationale:** Frontend for all cloud features. CDK stacks for self-hosting. Can be incrementally built alongside backend phases but finalized last.
**Delivers:** Cloud-specific UI pages/routes, CDK stacks (VPC, ECS cluster, SQS), environment configuration validation.
**Addresses:** CDK self-hosting (differentiator)

### Phase Ordering Rationale

- Phases 1-3 are strictly sequential: DB -> Auth -> Multi-tenancy. Each depends on the prior.
- Phase 4 is the critical path to cloud value. The LoopService refactor is a prerequisite baked into this phase, not a separate phase.
- Phase 5 can partially overlap with Phase 4 (credential storage is needed for remote execution to be useful).
- Phases 6-7 have flexibility in ordering and can be parallelized.
- Cloud UI work (Phase 7) should be incrementally built alongside each backend phase rather than saved entirely for the end.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 1:** Drizzle dual-dialect nuances -- need to validate specific column type mappings, date handling, and JSON support differences between SQLite and Postgres schemas.
- **Phase 4:** ECS Fargate task networking, log streaming patterns, and output relay architecture need detailed API-level research.
- **Phase 6:** SQS-to-ECS worker pattern for preview deployments; GitHub/GitLab OAuth integration specifics.

Phases with standard patterns (skip research-phase):
- **Phase 2:** Supabase Auth + Fastify JWT middleware is well-documented with existing plugins.
- **Phase 3:** Standard RBAC patterns; Supabase RLS is extensively documented.
- **Phase 5:** AES-256-GCM encryption is straightforward Node.js crypto; usage tracking is simple DB writes.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Most technologies already in codebase or proven in ralph-cloud. Official docs consulted. |
| Features | HIGH | Clear dependency chain. MVP vs defer decisions well-reasoned from domain analysis. |
| Architecture | HIGH | Patterns are well-established (repository pattern, strategy pattern, mode gating). Drizzle dual-dialect is the one area with MEDIUM confidence. |
| Pitfalls | HIGH | Based on real codebase analysis (1500-line LoopService, 590-line WebSocket handler) and known local-to-SaaS migration patterns. |

**Overall confidence:** HIGH

### Gaps to Address

- **Drizzle dual-dialect specifics:** Need to validate that all existing SQLite column types have clean Postgres equivalents. Date handling and boolean representation may need adaptation.
- **ECS task output streaming:** The exact mechanism (CloudWatch Logs polling vs direct WebSocket relay from ECS task) needs prototyping during Phase 4 planning.
- **Supabase connection pooling:** The `{ prepare: false }` requirement for Transaction mode pooling needs validation with Drizzle's query builder.
- **Test infrastructure:** How to run Postgres integration tests in CI (testcontainers vs hosted) needs a decision during Phase 1.

## Sources

### Primary (HIGH confidence)
- Supabase JS SDK, Auth, and Realtime documentation
- Drizzle ORM + Supabase integration guides (orm.drizzle.team, supabase.com)
- AWS SDK v3 ECS/SQS client documentation
- AWS CDK TypeScript guide
- Existing ralph-cloud codebase (PROJECT.md context)

### Secondary (MEDIUM confidence)
- Drizzle ORM GitHub discussions on dual-dialect schema (#2469, #3396)
- fastify-supabase plugin (JWT verification pattern)
- Community patterns for local-first to SaaS migration

### Tertiary (LOW confidence)
- Redis/ioredis for rate limiting and session cache -- may not be needed initially

---
*Research completed: 2026-03-08*
*Ready for roadmap: yes*
