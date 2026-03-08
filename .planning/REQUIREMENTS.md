# Requirements: Ralph Orchestrator — Cloud Integration

**Defined:** 2026-03-08
**Core Value:** Seamlessly scale from local AI loop execution to cloud-based ECS runtimes without changing workflow

## v1 Requirements

Full parity with ralph-cloud, integrated into the existing local-first app.

### Database

- [ ] **DB-01**: App supports dual-mode persistence — SQLite for local, Supabase Postgres for cloud
- [ ] **DB-02**: Repository abstraction layer with consistent API across both database backends
- [ ] **DB-03**: Drizzle ORM schemas for both SQLite and Postgres dialects sharing TypeScript interfaces
- [ ] **DB-04**: Mode resolver determines local vs cloud at startup based on environment config
- [ ] **DB-05**: Database migrations work for both SQLite (Drizzle Kit) and Postgres (Supabase migrations)

### Authentication

- [ ] **AUTH-01**: User can sign up with email and password via Supabase Auth
- [ ] **AUTH-02**: User can log in and session persists across browser refresh
- [ ] **AUTH-03**: User can log out from any page
- [ ] **AUTH-04**: Auth middleware is mode-aware — enforced in cloud mode, skipped in local mode
- [ ] **AUTH-05**: tRPC context includes authenticated user in cloud mode

### Organizations & Multi-Tenancy

- [ ] **ORG-01**: User can create an organization
- [ ] **ORG-02**: User can invite members to an organization
- [ ] **ORG-03**: User can view and manage organization members
- [ ] **ORG-04**: Organization owner can assign roles (owner/editor/viewer)
- [ ] **ORG-05**: All data queries are tenant-scoped — no cross-org data leakage

### Projects

- [ ] **PROJ-01**: User can create projects within an organization
- [ ] **PROJ-02**: User can view projects they have access to
- [ ] **PROJ-03**: Project access is controlled by membership and role
- [ ] **PROJ-04**: Projects in cloud mode persist to Supabase Postgres

### Credentials

- [ ] **CRED-01**: User can store AI backend credentials (API keys) per project
- [ ] **CRED-02**: Credentials are encrypted at rest (AES-256-GCM)
- [ ] **CRED-03**: Credentials are decrypted server-side only at runtime
- [ ] **CRED-04**: User can update and delete stored credentials

### Remote Runtimes

- [ ] **RUN-01**: User can start a loop on ECS Fargate from the UI
- [ ] **RUN-02**: User can stop a running remote loop
- [ ] **RUN-03**: Remote loop output streams back to UI in real-time
- [ ] **RUN-04**: Remote loop status (pending, running, completed, failed) tracks in UI
- [ ] **RUN-05**: ECS task orchestration uses AWS SDK v3 (RunTask, StopTask, DescribeTasks)
- [ ] **RUN-06**: Executor interface abstracts local (ProcessManager) vs remote (ECS) execution

### Interactive Sessions

- [ ] **SESS-01**: User can start an interactive session with an AI runtime
- [ ] **SESS-02**: Session supports bidirectional chat-like interaction
- [ ] **SESS-03**: Session shows presence (who's viewing/collaborating)
- [ ] **SESS-04**: Session maintains ordered event history

### Preview Deployments

- [ ] **PREV-01**: User can trigger a preview deployment from a loop run
- [ ] **PREV-02**: Preview deployment requests queue via SQS
- [ ] **PREV-03**: Preview lifecycle tracked (provisioning → ready → expired → cleanup)
- [ ] **PREV-04**: User can view and manage active previews

### Realtime & Notifications

- [ ] **RT-01**: Cloud mode uses Supabase Realtime for event streaming with polling fallback
- [ ] **RT-02**: User receives in-app notifications for loop completion, failures, etc.
- [ ] **RT-03**: Unified event stream per project (project_realtime_events)

### Usage & Audit

- [ ] **USE-01**: System tracks AI token usage per user and project
- [ ] **USE-02**: System tracks ECS compute hours per project
- [ ] **USE-03**: User can view usage dashboard with breakdowns
- [ ] **AUD-01**: Audit log records who started/stopped loops, changed settings, managed members

### Source Management

- [ ] **SRC-01**: User can connect GitHub/GitLab repositories to a project
- [ ] **SRC-02**: Connected repos can be used as seed sources for AI loops
- [ ] **SRC-03**: Support for scratch projects and uploaded seed sources

### Infrastructure

- [ ] **INFRA-01**: CDK stacks for VPC, ECS cluster, SQS queues ported from ralph-cloud
- [ ] **INFRA-02**: CDK lives in a `packages/infra` workspace
- [ ] **INFRA-03**: Single-command deployment via CDK

### Frontend

- [ ] **UI-01**: Cloud UI pages rebuilt from scratch using existing component patterns
- [ ] **UI-02**: Login/signup page
- [ ] **UI-03**: Organization and project management pages
- [ ] **UI-04**: Credential settings page
- [ ] **UI-05**: Usage dashboard page
- [ ] **UI-06**: Remote loop monitoring with live output
- [ ] **UI-07**: Preview deployment management page
- [ ] **UI-08**: Collaborators management page
- [ ] **UI-09**: Mode indicator showing local vs cloud

### Mode Switching

- [ ] **MODE-01**: Local mode works exactly as today with zero cloud dependencies
- [ ] **MODE-02**: Cloud mode activates when Supabase/AWS env vars are configured
- [ ] **MODE-03**: Feature detection determines available capabilities per mode

## v2 Requirements

- **NOTF-02**: Email/webhook notifications for loop events
- **MULTI-01**: Multi-region ECS deployment
- **BILL-01**: Billing integration for usage-based pricing

## Out of Scope

| Feature | Reason |
|---------|--------|
| Billing / payment processing | Massive compliance burden; track usage only |
| Custom model hosting / fine-tuning | Ralph orchestrates AI, doesn't host models |
| Mobile app | Desktop workflow; responsive web suffices |
| Collaborative code editing | CRDT complexity; presence + shared output instead |
| Marketplace / plugin system | Premature abstraction |
| Fine-grained permissions (ABAC) | 3 roles covers 95% of use cases |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| DB-01 | Phase 1 | Pending |
| DB-02 | Phase 1 | Pending |
| DB-03 | Phase 1 | Pending |
| DB-04 | Phase 1 | Pending |
| DB-05 | Phase 1 | Pending |
| MODE-01 | Phase 1 | Pending |
| MODE-02 | Phase 1 | Pending |
| MODE-03 | Phase 1 | Pending |
| AUTH-01 | Phase 2 | Pending |
| AUTH-02 | Phase 2 | Pending |
| AUTH-03 | Phase 2 | Pending |
| AUTH-04 | Phase 2 | Pending |
| AUTH-05 | Phase 2 | Pending |
| ORG-01 | Phase 3 | Pending |
| ORG-02 | Phase 3 | Pending |
| ORG-03 | Phase 3 | Pending |
| ORG-04 | Phase 3 | Pending |
| ORG-05 | Phase 3 | Pending |
| PROJ-01 | Phase 3 | Pending |
| PROJ-02 | Phase 3 | Pending |
| PROJ-03 | Phase 3 | Pending |
| PROJ-04 | Phase 3 | Pending |
| RUN-01 | Phase 4 | Pending |
| RUN-02 | Phase 4 | Pending |
| RUN-03 | Phase 4 | Pending |
| RUN-04 | Phase 4 | Pending |
| RUN-05 | Phase 4 | Pending |
| RUN-06 | Phase 4 | Pending |
| SESS-01 | Phase 4 | Pending |
| SESS-02 | Phase 4 | Pending |
| SESS-03 | Phase 4 | Pending |
| SESS-04 | Phase 4 | Pending |
| CRED-01 | Phase 5 | Pending |
| CRED-02 | Phase 5 | Pending |
| CRED-03 | Phase 5 | Pending |
| CRED-04 | Phase 5 | Pending |
| USE-01 | Phase 5 | Pending |
| USE-02 | Phase 5 | Pending |
| USE-03 | Phase 5 | Pending |
| AUD-01 | Phase 5 | Pending |
| PREV-01 | Phase 6 | Pending |
| PREV-02 | Phase 6 | Pending |
| PREV-03 | Phase 6 | Pending |
| PREV-04 | Phase 6 | Pending |
| SRC-01 | Phase 6 | Pending |
| SRC-02 | Phase 6 | Pending |
| SRC-03 | Phase 6 | Pending |
| RT-01 | Phase 6 | Pending |
| RT-02 | Phase 6 | Pending |
| RT-03 | Phase 6 | Pending |
| UI-01 | Phase 7 | Pending |
| UI-02 | Phase 7 | Pending |
| UI-03 | Phase 7 | Pending |
| UI-04 | Phase 7 | Pending |
| UI-05 | Phase 7 | Pending |
| UI-06 | Phase 7 | Pending |
| UI-07 | Phase 7 | Pending |
| UI-08 | Phase 7 | Pending |
| UI-09 | Phase 7 | Pending |
| INFRA-01 | Phase 7 | Pending |
| INFRA-02 | Phase 7 | Pending |
| INFRA-03 | Phase 7 | Pending |

**Coverage:**
- v1 requirements: 62 total
- Mapped to phases: 62
- Unmapped: 0

---
*Requirements defined: 2026-03-08*
*Last updated: 2026-03-08 after roadmap creation*
