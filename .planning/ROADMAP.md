# Roadmap: Ralph Orchestrator Web — AWS Single-Instance Cloud Backend

**Created:** 2026-03-10
**Milestone:** v1.0 — Cloud Deployment

## Overview

Deploy the existing ralph-orchestrator-web app on a single EC2 instance with Supabase Auth, GitHub OAuth connector, and cloud-mode project management.

## Phases

### Phase 1: Cloud Infrastructure & Auth Foundation
**Goal:** Supabase auth middleware, GitHub OAuth, mode resolver, database schema
**Status:** Complete (implemented on ralph-cloud branch)

### Phase 2: Cloud Services & API
**Goal:** Cloud project service, workspace manager, tRPC cloud routes, WebSocket auth
**Status:** Complete (implemented on ralph-cloud branch)

### Phase 3: Frontend Cloud Integration
**Goal:** AuthProvider, SignInPage, GitHub connector UI, cloud project creation UI, mode-aware shell
**Status:** Complete (implemented on ralph-cloud branch)

### Phase 4: Stabilization & Deployment Prep
**Goal:** Fix all build errors, test failures, and deployment blockers across the cloud integration
**Status:** In Progress
