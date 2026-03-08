# Architecture Patterns

**Domain:** Hybrid local-cloud AI orchestration platform
**Researched:** 2026-03-08

## Recommended Architecture

The system extends the existing local-first Fastify app with a **mode-aware abstraction layer** that gates cloud features behind configuration and auth. Local mode remains the default with zero cloud dependencies.

```
                     +------------------+
                     |   React SPA      |
                     |  (Zustand + tRPC)|
                     +--------+---------+
                              |
                     +--------v---------+
                     |   tRPC Router    |
                     |  + Auth Guard    |  <-- New: conditional auth middleware
                     +--------+---------+
                              |
              +---------------+----------------+
              |                                |
     +--------v---------+          +-----------v-----------+
     |  Service Layer    |          |  Cloud Service Layer  |
     |  (existing)       |          |  (new, cloud-only)    |
     |  LoopService      |          |  OrgService           |
     |  ChatService      |          |  EcsOrchestrator      |
     |  ProjectService   |          |  PreviewQueueService  |
     |  TerminalService  |          |  CredentialService    |
     +--------+----------+          |  UsageService         |
              |                     +-----------+-----------+
              |                                 |
     +--------v---------+          +-----------v-----------+
     |  Data Layer       |          |  Data Layer           |
     |  SQLite (local)   |          |  Supabase Postgres    |
     |  better-sqlite3   |          |  drizzle-orm/pg-core  |
     |  drizzle-orm/     |          +-----------+-----------+
     |    sqlite-core    |                      |
     +-------------------+          +-----------v-----------+
                                    |  AWS Services         |
                                    |  ECS Fargate (compute)|
                                    |  SQS (preview queue)  |
                                    +-----------------------+
```

### Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| **ModeResolver** | Determines local vs cloud mode from config/env | App bootstrap, all gated services |
| **AuthGuard** (tRPC middleware) | Validates Supabase JWT in cloud mode; no-op in local mode | tRPC context, Supabase Auth |
| **Dual Schema Layer** | Separate SQLite and Postgres Drizzle schemas with shared type interfaces | All services via repository pattern |
| **DatabaseProvider** | Factory that returns SQLite or Postgres Drizzle instance based on mode | Data layer consumers |
| **OrgService** | Multi-tenant org/project RBAC (cloud-only) | AuthGuard, ProjectService |
| **EcsOrchestrator** | RunTask/StopTask/DescribeTasks for remote loops (cloud-only) | LoopService, AWS ECS SDK |
| **PreviewQueueService** | Enqueue preview deployments via SQS (cloud-only) | DevPreviewManager, AWS SQS SDK |
| **CredentialService** | Encrypted storage of AI API keys per org (cloud-only) | ChatService, McpChatService |
| **UsageService** | Token/compute usage tracking (cloud-only) | LoopService, ChatService |
| **RealtimeService** | Supabase Realtime for multi-user sync (cloud-only) | WebSocket handler, frontend stores |

### Data Flow

**Dual-Mode Database Selection (app startup):**
1. `ModeResolver` reads `RALPH_MODE` env var (default: `local`)
2. If `local`: instantiate `better-sqlite3` + `drizzle(sqlite)` -- existing path unchanged
3. If `cloud`: instantiate `drizzle(postgres)` with Supabase connection string
4. `DatabaseProvider` exposes unified repository interfaces to services
5. Services never import dialect-specific Drizzle code directly

**Cloud Auth Flow (per-request):**
1. Frontend includes Supabase session JWT in tRPC headers
2. `AuthGuard` tRPC middleware extracts and verifies JWT via `@supabase/supabase-js`
3. Decoded user ID injected into tRPC context
4. `OrgService` checks membership/RBAC for the target resource
5. In local mode, AuthGuard is a passthrough (no JWT required)

**Remote Loop Execution (cloud mode):**
1. Frontend calls `trpc.loop.start` with `runtime: 'cloud'`
2. `LoopService` delegates to `EcsOrchestrator.runTask()` instead of local `ProcessManager`
3. `EcsOrchestrator` calls `ECSClient.send(new RunTaskCommand({...}))` with Fargate launch type
4. Task ARN stored in DB; polling via `DescribeTasksCommand` for status
5. Loop output streamed from ECS task via CloudWatch Logs or direct WebSocket relay
6. Frontend receives output via same WebSocket channels (transparent to UI)

**Preview Deployment (cloud mode):**
1. Frontend requests preview deployment
2. `PreviewQueueService` sends SQS message with deployment config
3. Separate ECS worker (or Lambda) processes queue, provisions preview infra
4. Status updates written to DB, pushed to frontend via Supabase Realtime

## Patterns to Follow

### Pattern 1: Mode-Gated Service Registration
**What:** Register cloud services only when `RALPH_MODE=cloud`. Local mode app has zero cloud imports.
**When:** App bootstrap in `createApp()`
**Example:**
```typescript
// app.ts
const mode = process.env.RALPH_MODE ?? 'local';

if (mode === 'cloud') {
  const { OrgService } = await import('./services/cloud/OrgService.js');
  const { EcsOrchestrator } = await import('./services/cloud/EcsOrchestrator.js');
  app.decorate('orgService', new OrgService(db));
  app.decorate('ecsOrchestrator', new EcsOrchestrator(ecsConfig));
}
```

### Pattern 2: Dual Schema with Shared Repository Interface
**What:** Define separate Drizzle schemas per dialect (SQLite and Postgres have incompatible table constructors). Expose a shared TypeScript interface that services consume.
**When:** All data access
**Example:**
```typescript
// db/repositories/types.ts
export interface ProjectRepository {
  findById(id: string): Promise<Project | null>;
  create(data: NewProject): Promise<Project>;
  listByOrg(orgId: string): Promise<Project[]>;
}

// db/sqlite/projectRepo.ts -- uses sqliteTable schema
// db/postgres/projectRepo.ts -- uses pgTable schema
// db/index.ts -- factory returns correct impl based on mode
```

### Pattern 3: Conditional Auth Middleware
**What:** tRPC middleware that enforces auth only in cloud mode
**When:** Every tRPC procedure
**Example:**
```typescript
const authMiddleware = t.middleware(async ({ ctx, next }) => {
  if (ctx.mode === 'local') return next({ ctx });

  const token = ctx.req.headers.authorization?.replace('Bearer ', '');
  if (!token) throw new TRPCError({ code: 'UNAUTHORIZED' });

  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) throw new TRPCError({ code: 'UNAUTHORIZED' });

  return next({ ctx: { ...ctx, user } });
});
```

### Pattern 4: Runtime Strategy (Local ProcessManager vs ECS)
**What:** LoopService selects execution strategy based on requested runtime
**When:** Starting loops
**Example:**
```typescript
class LoopService {
  async start(opts: StartLoopOpts) {
    if (opts.runtime === 'cloud' && this.ecsOrchestrator) {
      return this.ecsOrchestrator.runLoop(opts);
    }
    return this.processManager.spawn(opts); // existing local path
  }
}
```

## Anti-Patterns to Avoid

### Anti-Pattern 1: Shared Drizzle Schema Across Dialects
**What:** Trying to use one schema definition for both SQLite and Postgres
**Why bad:** Drizzle has no dialect-agnostic schema API. `sqliteTable` and `pgTable` are different functions with different column types. Attempting to abstract this leads to type gymnastics and runtime bugs.
**Instead:** Maintain two schema files. Share TypeScript interfaces for the data shapes. Use a repository layer to hide the dialect.

### Anti-Pattern 2: Feature Flags Instead of Mode Gating
**What:** Sprinkling `if (isCloud)` checks throughout service code
**Why bad:** Cloud logic bleeds into local services, increases complexity, makes local mode harder to reason about
**Instead:** Use separate service classes for cloud features. Compose via DI at app bootstrap. Services that need both modes use strategy pattern (like LoopService above).

### Anti-Pattern 3: Supabase Client in Every Service
**What:** Each service creating its own Supabase client instance
**Why bad:** Connection pooling issues, inconsistent auth context, hard to test
**Instead:** Single Supabase client created at app startup, injected via Fastify decorator, passed through tRPC context

## Scalability Considerations

| Concern | Local (1 user) | Cloud (100 users) | Cloud (10K users) |
|---------|----------------|--------------------|--------------------|
| Database | SQLite file | Single Supabase Postgres | Supabase with connection pooling (pgBouncer) |
| Compute | Local processes | ECS Fargate tasks (1 per loop) | ECS with auto-scaling, task placement strategies |
| Real-time | WebSocket direct | Supabase Realtime channels | Supabase Realtime (managed scaling) |
| Queue | N/A | SQS standard queue | SQS with dead-letter queue, batch processing |
| Auth | None (loopback) | Supabase Auth (JWT) | Supabase Auth (rate limiting built-in) |

## Suggested Build Order

Dependencies dictate this order:

1. **ModeResolver + DatabaseProvider** -- Foundation. Everything depends on knowing the mode and having a DB connection. No cloud features work without this.
2. **Dual Schema Layer + Repository Pattern** -- Refactor existing SQLite data access into repository interfaces. Add Postgres implementations. This is the highest-risk refactor since it touches all existing services.
3. **AuthGuard + Supabase Auth** -- Required before any multi-tenant feature. Must be in place before OrgService.
4. **OrgService + RBAC** -- Multi-tenancy foundation. Projects, memberships, roles. Required before cloud compute features (need to know who owns what).
5. **EcsOrchestrator** -- Remote loop execution. Depends on auth (who can run tasks) and DB (where to store task state).
6. **PreviewQueueService + SQS** -- Preview deployments. Can be built in parallel with ECS orchestrator.
7. **CredentialService + UsageService** -- Supporting services. Can be built after core cloud features.
8. **RealtimeService + Collaboration** -- Multi-user real-time. Build last since it layers on top of everything.
9. **Cloud UI Pages** -- Frontend for all cloud features. Can be incrementally built alongside backend services.

**Critical path:** Steps 1-3 are sequential and blocking. Steps 4-7 have some parallelism. Step 8-9 layer on top.

## Sources

- [Drizzle ORM dialect-agnostic schema discussion](https://github.com/drizzle-team/drizzle-orm/discussions/2469) -- confirms no shared schema API exists
- [Drizzle ORM dual DB discussion](https://github.com/drizzle-team/drizzle-orm/discussions/3396)
- [fastify-supabase plugin](https://github.com/psteinroe/fastify-supabase) -- JWT verification pattern for Fastify
- [AWS SDK ECS Client docs](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/ecs/) -- RunTask, DescribeTasks commands
- [ECS RunTask API](https://docs.aws.amazon.com/AmazonECS/latest/APIReference/API_RunTask.html)
- Existing codebase: `.planning/codebase/ARCHITECTURE.md`, `.planning/PROJECT.md`
