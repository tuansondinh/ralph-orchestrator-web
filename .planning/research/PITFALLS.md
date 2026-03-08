# Domain Pitfalls

**Domain:** Local-first to hybrid local/cloud AI orchestration platform
**Researched:** 2026-03-08

## Critical Pitfalls

Mistakes that cause rewrites or major issues.

### Pitfall 1: Leaking Cloud Abstractions into Local Mode

**What goes wrong:** Adding a database abstraction layer (SQLite vs Postgres) that subtly changes local-mode behavior. Query semantics differ (e.g., SQLite's loose typing vs Postgres strict typing, `RETURNING` clause differences, JSON handling, `LIKE` case sensitivity). The abstraction "works" in tests but breaks edge cases in production for one mode or the other.

**Why it happens:** Developers test primarily against one database and assume the abstraction handles the other. Drizzle ORM helps but does not eliminate all dialect differences (e.g., migration format, date handling, array columns).

**Consequences:** Local users hit regressions. Cloud users hit silent data corruption. Debugging requires reproducing in both modes.

**Prevention:**
- Define a strict repository/store interface that both implementations conform to. Test both implementations against the same contract test suite.
- Never use raw SQL. Use only Drizzle query builder methods that are dialect-agnostic.
- Run CI against both SQLite and Postgres for every PR.
- Avoid Postgres-only features (arrays, `jsonb` operators, `LISTEN/NOTIFY`) in shared code paths.

**Detection:** Any query that works in dev (SQLite) but fails in staging (Postgres), or vice versa. Type mismatches on date/boolean columns are early warnings.

**Phase:** Must be solved in the dual-mode DB phase (earliest cloud phase). Get the abstraction right before building anything on top of it.

---

### Pitfall 2: The God Object Gets Worse Before It Gets Better

**What goes wrong:** LoopService (already 1531 lines) needs cloud-aware behavior: remote ECS loops vs local process loops, different output streaming, different status polling. Without refactoring first, developers add `if (isCloud)` branches throughout, turning a god object into a hydra.

**Why it happens:** Pressure to ship cloud features quickly. "We'll refactor later" but the branching complexity makes later refactoring exponentially harder.

**Consequences:** Untestable code. Local-mode regressions from cloud changes. State machine becomes incomprehensible with two parallel execution paths interleaved.

**Prevention:**
- Extract a `LoopExecutor` interface with `LocalLoopExecutor` and `EcsLoopExecutor` implementations BEFORE adding any ECS code.
- LoopService becomes an orchestrator that delegates to the appropriate executor based on mode.
- Same pattern for terminal sessions (local PTY vs remote ECS exec).

**Detection:** Any PR that adds `mode === 'cloud'` or `isRemote` checks inside LoopService is a red flag.

**Phase:** Refactoring must happen in the phase BEFORE remote execution. It is a prerequisite, not a nice-to-have.

---

### Pitfall 3: Auth Boundary Contamination

**What goes wrong:** Auth middleware gets added globally, breaking local mode. Or worse, auth is added per-route and some cloud-only routes accidentally work without auth. The "no auth in local mode" requirement creates a two-track system where every middleware, every tRPC procedure, and every WebSocket handler must be mode-aware.

**Why it happens:** Auth is cross-cutting. It touches everything. The existing codebase has zero auth concepts -- no user ID on any table, no session concept at the API level, no middleware chain for authorization.

**Consequences:** Security holes in cloud mode (forgotten auth checks). Broken local mode (auth required where it shouldn't be). User data leaks across tenants.

**Prevention:**
- Create a single `AuthContext` that resolves to either `{ mode: 'local', userId: null }` or `{ mode: 'cloud', userId: string, orgId: string }`. Pass it through tRPC context.
- Every tRPC procedure gets auth context injected. Cloud procedures use a `protectedProcedure` base that enforces auth. Local procedures use `publicProcedure`.
- Never check auth in business logic. Auth is a middleware concern only.
- The existing `allowsDangerousOperations()` pattern is a good model -- extend it, don't replace it.

**Detection:** Any service method that imports auth utilities directly. Any route handler that calls Supabase auth functions inline.

**Phase:** Auth infrastructure must be the first cloud phase, before any multi-tenant features.

---

### Pitfall 4: Multi-Tenancy as an Afterthought

**What goes wrong:** Adding `orgId` and `userId` columns to existing tables and hoping row-level filtering handles isolation. Missing a single `WHERE orgId = ?` clause in any query leaks data across tenants. The existing schema has no concept of ownership -- every loop, chat, project is implicitly owned by the single local user.

**Why it happens:** The local-mode schema assumes single-tenant. Retrofitting multi-tenancy requires touching every query, every service method, every API response.

**Consequences:** Data leaks between organizations. A user sees another org's loops. Credential exposure across tenants. This is a security incident, not a bug.

**Prevention:**
- Use Postgres Row-Level Security (RLS) in cloud mode as a defense-in-depth layer. Even if application code forgets a filter, RLS blocks cross-tenant access.
- In the repository layer, make `orgId` a required parameter for all cloud-mode queries. The type system should make it impossible to forget.
- Local mode keeps existing query paths (no orgId). Cloud mode uses separate query methods that require tenant context.
- Write integration tests that create data in Org A and verify Org B cannot access it.

**Detection:** Any cloud-mode query that does not include tenant scoping. Code review should flag `SELECT` without `WHERE org_id`.

**Phase:** Must be designed alongside the dual-mode DB phase. Schema changes and query patterns are foundational.

---

### Pitfall 5: WebSocket Auth and Channel Isolation

**What goes wrong:** The existing WebSocket handler (590 lines, already fragile) has zero authentication and allows any client to subscribe to any channel. In cloud mode, this means User A can subscribe to User B's loop output, terminal sessions, or chat messages.

**Why it happens:** The current design is correct for local mode (loopback-only). But the same WebSocket handler will serve cloud users, and retrofitting auth + channel isolation into the existing subscription logic is error-prone.

**Consequences:** Real-time data leaks. Terminal session hijacking. Chat message exposure.

**Prevention:**
- Authenticate WebSocket connections at upgrade time (validate Supabase JWT in the upgrade handler).
- Bind channel subscriptions to the authenticated user's org/project scope. Reject subscriptions to channels the user does not have access to.
- Consider replacing custom WebSocket pub/sub with Supabase Realtime for cloud mode, which has built-in RLS integration.

**Detection:** Any WebSocket `subscribe` message that does not validate the requesting user's access to the target resource.

**Phase:** Must be addressed in the auth infrastructure phase, before any cloud features expose real-time data.

## Moderate Pitfalls

### Pitfall 6: Credential Storage Security Gap

**What goes wrong:** Storing AI API keys (Anthropic, OpenAI, Google) in the database with application-level encryption, but the encryption key is stored in an environment variable alongside the database connection string. If the server is compromised, both are exposed together.

**Prevention:**
- Use AWS KMS or Supabase Vault for encryption key management in cloud mode. The app never holds the master key.
- Local mode can continue using local config files (current approach), since the threat model is different.
- Never log decrypted credentials. Never return them in API responses (return masked versions).

**Phase:** Credential management phase, after auth is established.

### Pitfall 7: ECS Task Lifecycle Drift

**What goes wrong:** The app's in-memory state about a remote ECS task diverges from reality. A task gets killed by ECS (spot reclaim, OOM, timeout) but the app still shows it as "running." Or worse, the app tries to stop an already-dead task and errors out.

**Prevention:**
- Treat ECS task status as eventually consistent. Poll ECS DescribeTasks periodically AND handle CloudWatch/EventBridge notifications.
- Design the loop state machine to handle "unknown" states gracefully. A task transitioning from "running" to "unknown" should trigger a status check, not an error.
- Implement idempotent stop operations (stopping an already-stopped task is a no-op, not an error).

**Phase:** Remote execution phase. Design the state reconciliation before building the ECS integration.

### Pitfall 8: Migration Ordering Breaks One Mode

**What goes wrong:** A Drizzle migration works on Postgres but has different behavior on SQLite (or vice versa). Column defaults, constraint names, index syntax, and ALTER TABLE capabilities differ significantly. SQLite doesn't support `DROP COLUMN` before 3.35.0, doesn't support adding constraints to existing tables, etc.

**Prevention:**
- Generate separate migration files per dialect. Drizzle supports this with dialect-specific migration folders.
- Test migrations in both directions (up and down) on both databases in CI.
- Never assume ALTER TABLE capabilities -- always check SQLite's limitations first.

**Phase:** Dual-mode DB phase. Migration strategy must be defined before any schema changes.

### Pitfall 9: Feature Flag Sprawl

**What goes wrong:** Cloud features get gated behind feature flags, environment variables, and runtime checks. The codebase accumulates dozens of `if (isCloudMode)` checks in UI components, API routes, and services. No one knows which flags are required for which features. Testing all flag combinations is combinatorially explosive.

**Prevention:**
- Use exactly one source of truth: a `mode` config that is `'local'` or `'cloud'`, set at startup.
- Feature differences should be handled through dependency injection (different service implementations), not runtime branching.
- Frontend: conditionally render entire route trees, not individual elements within shared components.

**Phase:** Architecture decision needed before any cloud feature work begins.

### Pitfall 10: Realtime Event Duplication

**What goes wrong:** Using both Supabase Realtime AND custom WebSocket pub/sub creates two event systems. Events arrive twice, arrive out of order, or arrive on one channel but not the other. Frontend stores get confused about the source of truth.

**Prevention:**
- Pick one realtime strategy per deployment mode. Local mode: existing WebSocket pub/sub. Cloud mode: Supabase Realtime.
- Abstract behind an `EventBus` interface that services publish to. The implementation routes to the correct transport.
- Never subscribe to the same event on both transports simultaneously.

**Phase:** Realtime infrastructure phase. Decide the strategy before building cloud-specific event flows.

## Minor Pitfalls

### Pitfall 11: Frontend Bundle Bloat from Cloud SDKs

**What goes wrong:** Importing `@supabase/supabase-js`, AWS SDK clients, and other cloud dependencies in the frontend bundle even for local-mode users who never need them.

**Prevention:** Dynamic imports (`import()`) for all cloud SDK code. Route-level code splitting so cloud pages are separate chunks. Tree-shake by ensuring cloud imports are never in shared utility files.

### Pitfall 12: Environment Configuration Explosion

**What goes wrong:** Cloud mode requires 15+ environment variables (Supabase URL, anon key, service role key, AWS region, ECS cluster, SQS queue URL, KMS key ID...). Developers forget one, get cryptic errors at runtime.

**Prevention:** Validate all required environment variables at startup with clear error messages. Use a typed config schema (zod) that fails fast. Provide a `.env.example` with documentation for every variable.

### Pitfall 13: Test Suite Becomes Unusably Slow

**What goes wrong:** Adding Postgres integration tests (requiring a running database) to the existing 373+ test suite. CI time doubles or triples. Developers stop running tests locally.

**Prevention:** Separate test suites: unit tests (fast, no external deps), SQLite integration tests, Postgres integration tests. Use `testcontainers` for Postgres in CI. Local dev runs SQLite tests by default; Postgres tests run in CI only.

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Dual-mode DB | Dialect differences silently corrupt data (Pitfall 1, 8) | Contract test suite for both dialects, separate migrations |
| Auth infrastructure | Auth breaks local mode (Pitfall 3) | Mode-aware middleware, `publicProcedure` vs `protectedProcedure` |
| Multi-tenancy | Data leaks across tenants (Pitfall 4) | RLS + required orgId in type signatures |
| Remote execution | God object expansion (Pitfall 2) | Executor interface extraction BEFORE ECS code |
| WebSocket/Realtime | Dual event systems (Pitfall 10), channel leaks (Pitfall 5) | Single transport per mode, auth at upgrade |
| Credential management | Key exposure (Pitfall 6) | KMS/Vault for cloud, local config for local |
| Infrastructure/DevOps | Env var chaos (Pitfall 12), slow tests (Pitfall 13) | Typed config schema, separated test suites |

## Sources

- Existing codebase analysis: `.planning/codebase/CONCERNS.md`
- Project context: `.planning/PROJECT.md`
- Domain knowledge: local-first to SaaS migration patterns (HIGH confidence -- well-established patterns)
- Drizzle ORM dual-dialect limitations (MEDIUM confidence -- based on known ORM dialect abstraction challenges)
- Supabase RLS for multi-tenancy (HIGH confidence -- documented Supabase pattern)

---

*Pitfalls audit: 2026-03-08*
