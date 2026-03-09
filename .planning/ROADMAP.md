# Roadmap: Ralph Orchestrator Cloud Integration

## Overview

This roadmap delivers scoped cloud integration for Ralph Orchestrator in 7 phases, progressing from database foundation through authentication, multi-tenancy, remote execution, supporting services, advanced features, and finally cloud shell polish with infrastructure. Each phase delivers a coherent capability that unblocks the next, including the minimum UI needed to make that capability usable. Local mode remains untouched throughout.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Dual-Mode Database Foundation** - Repository abstraction supporting SQLite and Postgres with mode detection
- [ ] **Phase 2: Authentication** - Supabase Auth integration with mode-aware middleware
- [ ] **Phase 3: Multi-Tenancy** - Organizations, projects, memberships, and RBAC
- [ ] **Phase 4: Remote Execution** - ECS Fargate loop execution and interactive sessions
- [ ] **Phase 5: Credentials & Usage** - Encrypted credential storage, usage tracking, and audit logging
- [ ] **Phase 6: Previews, Sources & Realtime** - Preview deployments, source management, and realtime event streaming
- [ ] **Phase 7: Cloud UI & Infrastructure** - Cloud-specific frontend pages and CDK deployment stacks

## Phase Details

### Phase 1: Dual-Mode Database Foundation
**Goal**: App can run against either SQLite or Postgres without any code changes beyond environment config
**Depends on**: Nothing (first phase)
**Requirements**: DB-01, DB-02, DB-03, DB-04, DB-05, DB-06, MODE-01, MODE-02, MODE-03
**Success Criteria** (what must be TRUE):
  1. App starts in local mode with SQLite when no cloud env vars are set, behaving identically to today
  2. App starts in cloud mode with Supabase Postgres when Supabase env vars are configured, without requiring AWS runtime setup
  3. Existing local SQLite data remains intact when cloud mode is enabled; no automatic cross-mode migration occurs in v1
  4. All existing features (loops, chat, terminals, projects) work identically against both database backends where the feature is available
  5. Feature detection API reports available capabilities based on current mode and configured integrations
**Plans**: TBD

Plans:
- [ ] 01-01: TBD
- [ ] 01-02: TBD

### Phase 2: Authentication
**Goal**: Users can securely access their accounts in cloud mode while local mode remains auth-free
**Depends on**: Phase 1
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, UI-02
**Success Criteria** (what must be TRUE):
  1. User can sign up with email/password and log in with session persisting across browser refresh
  2. User can log out from any page and is redirected to login
  3. All tRPC endpoints enforce authentication in cloud mode
  4. Local mode continues working with zero auth — no login page, no token checks
  5. Cloud mode exposes a functional login/signup UI, while local mode bypasses it entirely
**Plans**: TBD

Plans:
- [ ] 02-01: TBD
- [ ] 02-02: TBD

### Phase 3: Multi-Tenancy
**Goal**: Users can create and manage organizations with role-based access to projects
**Depends on**: Phase 2
**Requirements**: ORG-01, ORG-02, ORG-03, ORG-04, ORG-05, PROJ-01, PROJ-02, PROJ-03, PROJ-04, UI-03, UI-08
**Success Criteria** (what must be TRUE):
  1. User can create an organization and invite members by email
  2. Organization owner can assign roles (owner/editor/viewer) that restrict what members can do
  3. User can create projects within an organization and only see projects they have access to
  4. No data from one organization is ever visible to members of another organization
  5. Cloud mode provides organization, project, and collaborator management UI sufficient to exercise the RBAC model end-to-end
**Plans**: TBD

Plans:
- [ ] 03-01: TBD
- [ ] 03-02: TBD

### Phase 4: Remote Execution
**Goal**: Users can run AI loops on cloud infrastructure and interact with sessions collaboratively
**Depends on**: Phase 3
**Requirements**: RUN-01, RUN-02, RUN-03, RUN-04, RUN-05, RUN-06, SESS-01, SESS-02, SESS-03, SESS-04, UI-06
**Success Criteria** (what must be TRUE):
  1. User can start a loop on ECS Fargate and see its output streaming in real-time in the UI
  2. User can stop a running remote loop and see its status update to reflect termination
  3. User can start an interactive session with bidirectional chat and see who else is viewing
  4. Local loops continue using ProcessManager with no ECS dependency
  5. Remote loop status (pending, running, completed, failed) is accurately tracked and displayed
  6. Cloud mode provides a monitoring UI for remote runs that is good enough for daily operation, not just API verification
**Plans**: TBD

Plans:
- [ ] 04-01: TBD
- [ ] 04-02: TBD
- [ ] 04-03: TBD

### Phase 5: Credentials & Usage
**Goal**: Users can securely store AI credentials and monitor resource consumption
**Depends on**: Phase 3
**Requirements**: CRED-01, CRED-02, CRED-03, CRED-04, USE-01, USE-02, USE-03, AUD-01, UI-04, UI-05
**Success Criteria** (what must be TRUE):
  1. User can store, update, and delete AI API keys per project with keys encrypted at rest
  2. Stored credentials are used transparently when running remote loops (never exposed to frontend)
  3. User can view a usage dashboard showing AI token consumption and ECS compute hours per project
  4. Audit log records who started/stopped loops, changed settings, and managed members
  5. Cloud mode provides credential management and usage dashboard pages for end users
**Plans**: TBD

Plans:
- [ ] 05-01: TBD
- [ ] 05-02: TBD

### Phase 6: Previews, Sources & Realtime
**Goal**: Users can deploy previews, connect source repos, and receive real-time notifications
**Depends on**: Phase 4
**Requirements**: PREV-01, PREV-02, PREV-03, PREV-04, SRC-01, SRC-02, SRC-03, RT-01, RT-02, RT-03, UI-07
**Success Criteria** (what must be TRUE):
  1. User can trigger a preview deployment from a loop run and track its lifecycle through to ready state
  2. User can connect GitHub/GitLab repos to a project and use them as seed sources for loops
  3. User receives in-app notifications for loop completions, failures, and other events
  4. Cloud mode streams events via Supabase Realtime with automatic polling fallback
  5. Cloud mode provides preview management UI for active previews and their lifecycle state
**Plans**: TBD

Plans:
- [ ] 06-01: TBD
- [ ] 06-02: TBD
- [ ] 06-03: TBD

### Phase 7: Cloud UI & Infrastructure
**Goal**: Complete shared cloud UI shell/polish and one-command infrastructure deployment
**Depends on**: Phase 5, Phase 6
**Requirements**: UI-01, UI-09, INFRA-01, INFRA-02, INFRA-03
**Success Criteria** (what must be TRUE):
  1. All cloud pages delivered in earlier phases are unified by a consistent shell, navigation model, and shared component patterns
  2. Mode indicator in UI shows whether app is running in local mode or cloud mode, and which cloud capabilities are available
  3. CDK stacks deploy VPC, ECS cluster, and SQS queues with a single command
  4. Infrastructure packaging and deployment docs are complete enough for repeatable setup
**Plans**: TBD

Plans:
- [ ] 07-01: TBD
- [ ] 07-02: TBD
- [ ] 07-03: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4/5 (parallel) -> 6 -> 7

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Dual-Mode Database Foundation | 0/2 | Not started | - |
| 2. Authentication | 0/2 | Not started | - |
| 3. Multi-Tenancy | 0/2 | Not started | - |
| 4. Remote Execution | 0/3 | Not started | - |
| 5. Credentials & Usage | 0/2 | Not started | - |
| 6. Previews, Sources & Realtime | 0/3 | Not started | - |
| 7. Cloud UI & Infrastructure | 0/3 | Not started | - |
