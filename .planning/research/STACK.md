# Technology Stack — Cloud SaaS Extension

**Project:** Ralph Orchestrator Cloud Integration
**Researched:** 2026-03-08
**Mode:** Ecosystem — adding cloud capabilities to existing local-first app

## Existing Stack (Keep As-Is)

These are already in the codebase and should not change:

| Technology | Version | Purpose |
|------------|---------|---------|
| Fastify | ^5.7.4 | HTTP server |
| tRPC | ^11.10.0 | Type-safe API |
| React | ^19.2.4 | Frontend |
| Zustand | ^5.0.11 | State management |
| Drizzle ORM | ^0.45.1 | Database ORM |
| better-sqlite3 | ^12.6.2 | Local SQLite driver |
| Vitest | ^4.0.18 | Testing |
| Vite | ^7.3.1 | Frontend build |

## New Stack — Cloud Extension

### Authentication

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| @supabase/supabase-js | ^2.98.0 | Auth + Supabase client | All-in-one client for Auth, Realtime, and Postgres. Already proven in ralph-cloud. Includes auth-js internally. | HIGH |

**Why not alternatives:**
- **Auth.js/NextAuth:** Designed for Next.js, awkward fit with Fastify. Requires session store config.
- **Clerk:** Vendor lock-in, expensive at scale, overkill when Supabase is already the DB host.
- **Custom JWT:** Unnecessary complexity when Supabase Auth handles JWT issuance, refresh, email/password flows.

**Integration pattern:** Create a Fastify plugin that extracts the Supabase JWT from `Authorization` header, verifies it via `supabase.auth.getUser()`, and decorates the request with the user. Local mode skips auth entirely (existing loopback check).

### Database — Dual-Mode Persistence

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| drizzle-orm | ^0.45.1 (already installed) | ORM abstraction | Drizzle supports both SQLite and Postgres dialects. Key enabler for dual-mode. | HIGH |
| postgres | ^3.4.5 | Postgres.js driver for Supabase | Recommended by both Drizzle and Supabase docs. Lightweight, no native deps, ESM-native. | HIGH |
| drizzle-kit | ^0.31.9 (already installed) | Schema migrations | Generates migrations for both SQLite and Postgres targets. | HIGH |

**Architecture for dual-mode DB:**

Drizzle requires separate schema definitions per dialect (`drizzle-orm/sqlite-core` vs `drizzle-orm/pg-core`). You cannot use one schema for both. The pattern:

1. **Shared schema interface** — TypeScript types defining the shape of each table
2. **Two schema implementations** — `schema/sqlite/` and `schema/pg/` using dialect-specific column types
3. **Repository layer** — abstracts Drizzle queries behind interfaces; factory picks SQLite or Postgres at boot
4. **Single migration strategy** — Drizzle Kit generates migrations per dialect, stored in `migrations/sqlite/` and `migrations/pg/`

**Why not alternatives:**
- **Prisma:** Supports both SQLite and Postgres but with one schema file. Sounds ideal, but Prisma generates a heavy client binary, has slower cold starts, and lacks the raw SQL escape hatches Drizzle provides. Drizzle is already in the codebase.
- **Kysely:** Good query builder but no migration tooling, no schema-first approach. More work.
- **TypeORM:** Legacy patterns, decorator-based, poor TypeScript inference.

**Critical note:** The `postgres` driver must use `{ prepare: false }` when connecting through Supabase's connection pooler in Transaction mode. This is well-documented but easy to miss.

### AWS — ECS Orchestration & SQS Queuing

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| @aws-sdk/client-ecs | ^3.946.0 | ECS RunTask/StopTask/DescribeTasks | Modular SDK v3 — import only what you need. Tree-shakeable. | HIGH |
| @aws-sdk/client-sqs | ^3.1001.0 | SQS SendMessage/ReceiveMessage | Preview deployment queue integration. | HIGH |
| @aws-sdk/client-cloudwatch-logs | ^3.x | CloudWatch log streaming | Fetch ECS task logs for display in UI. | MEDIUM |
| aws-cdk-lib | ^2.x | Infrastructure-as-code | VPC, ECS cluster, task definitions, SQS queues. Already proven in ralph-cloud CDK stacks. | HIGH |
| constructs | ^10.x | CDK construct base | Required peer dependency for aws-cdk-lib. | HIGH |

**Why not alternatives:**
- **AWS SDK v2:** Deprecated, monolithic bundle, no tree-shaking.
- **Pulumi:** Different IaC paradigm, ralph-cloud already has CDK stacks to port.
- **SST:** Opinionated framework layer on top of CDK. Adds complexity without clear benefit for this use case.
- **Terraform:** HCL syntax, separate toolchain, ralph-cloud uses CDK already.

**CDK workspace:** Add `packages/infra` as a third workspace in the monorepo. Keeps infrastructure code co-located but independently deployable.

### Realtime & Events

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| @supabase/supabase-js (realtime) | ^2.98.0 | Postgres changes subscription | Built into the Supabase client. Subscribe to table changes for notifications, session updates, presence. | HIGH |

**Why not alternatives:**
- **Pusher/Ably:** Extra vendor, extra cost. Supabase Realtime is included.
- **Custom WebSocket:** Already exists for local mode (loop output streaming). Cloud mode adds Supabase Realtime for cross-user events (org-level notifications, collaboration presence). The existing WebSocket system stays for PTY/loop streaming; Supabase Realtime handles multi-user events.

### Encryption & Credentials

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Node.js crypto (built-in) | — | AES-256-GCM encryption | Encrypt API keys at rest in the database. No external dependency needed. | HIGH |

**Why not alternatives:**
- **AWS KMS:** Better for production (key never leaves AWS), but adds latency and AWS dependency to every credential read. Use as a future upgrade.
- **Vault:** Over-engineered for this use case. The app stores user-provided API keys, not infrastructure secrets.

### Supporting Libraries

| Library | Version | Purpose | When to Use | Confidence |
|---------|---------|---------|-------------|------------|
| nanoid | ^5.1.0 | Short unique IDs | Org/project/session IDs (URL-safe, collision-resistant) | HIGH |
| ioredis | ^5.4.0 | Redis client | Rate limiting, session cache in cloud mode. Only if needed — start without it. | LOW |
| @fastify/rate-limit | ^10.x | API rate limiting | Cloud mode endpoint protection. Works without Redis for single-instance. | MEDIUM |

## Installation

```bash
# Cloud database driver
npm install -w @ralph-ui/backend postgres

# Supabase client (auth + realtime)
npm install -w @ralph-ui/backend @supabase/supabase-js

# AWS SDK (modular — only what we need)
npm install -w @ralph-ui/backend @aws-sdk/client-ecs @aws-sdk/client-sqs @aws-sdk/client-cloudwatch-logs

# Infrastructure (new workspace)
mkdir -p packages/infra
npm install -w @ralph-ui/infra aws-cdk-lib constructs

# Dev tools for CDK
npm install -D -w @ralph-ui/infra aws-cdk ts-node
```

## Environment Variables (Cloud Mode)

```bash
# Mode toggle
RALPH_MODE=cloud              # "local" (default) or "cloud"

# Supabase
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...  # Backend only, never expose to frontend

# Database (cloud mode)
DATABASE_URL=postgresql://...     # Supabase connection string

# AWS
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=...             # Or use IAM role in ECS
AWS_SECRET_ACCESS_KEY=...

# Encryption
CREDENTIAL_ENCRYPTION_KEY=...    # 32-byte hex for AES-256-GCM
```

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Auth | Supabase Auth | Clerk, Auth.js | Supabase is already the DB; integrated auth avoids extra vendor |
| Postgres driver | postgres (postgres.js) | pg (node-postgres) | postgres.js is ESM-native, no native deps, recommended by Drizzle+Supabase docs |
| IaC | AWS CDK | Terraform, Pulumi, SST | Ralph-cloud already has CDK stacks to port |
| Realtime | Supabase Realtime | Pusher, Ably, custom WS | Included with Supabase, no extra cost |
| Encryption | Node.js crypto | AWS KMS | Simpler, no network latency; KMS can be added later |
| Queue | AWS SQS | BullMQ+Redis, RabbitMQ | SQS is serverless, proven in ralph-cloud, no infra to manage |

## Sources

- [Supabase JS SDK - npm](https://www.npmjs.com/package/@supabase/supabase-js)
- [Drizzle + Supabase docs](https://orm.drizzle.team/docs/connect-supabase)
- [Drizzle + Supabase tutorial](https://orm.drizzle.team/docs/tutorials/drizzle-with-supabase)
- [Supabase Drizzle guide](https://supabase.com/docs/guides/database/drizzle)
- [AWS SDK v3 ECS Client](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/ecs/)
- [@aws-sdk/client-ecs - npm](https://www.npmjs.com/package/@aws-sdk/client-ecs)
- [@aws-sdk/client-sqs - npm](https://www.npmjs.com/package/@aws-sdk/client-sqs)
- [AWS CDK TypeScript guide](https://docs.aws.amazon.com/cdk/v2/guide/work-with-cdk-typescript.html)
- [Drizzle ORM - npm](https://www.npmjs.com/package/drizzle-orm)
- [Postgres.js + Supabase](https://supabase.com/docs/guides/database/postgres-js)
