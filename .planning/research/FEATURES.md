# Feature Landscape

**Domain:** Hybrid local-cloud AI orchestration / developer platform
**Researched:** 2026-03-08

## Table Stakes

Features users expect from a cloud-enabled AI orchestration platform. Missing = product feels incomplete or untrustworthy.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Authentication & session management | Can't have multi-user without auth | Medium | Supabase Auth is proven; email/password + OAuth. Local mode stays auth-free. |
| Organization / team management | Every SaaS has org-level grouping | Medium | Org CRUD, invite flow, member listing. Standard pattern. |
| Role-based access control (RBAC) | Users expect permission boundaries (owner/editor/viewer) | Medium | 3-role model is sufficient. Don't over-engineer fine-grained permissions. |
| Project-level access control | Users expect project isolation within an org | Low | Membership table linking users to projects with roles. |
| Encrypted credential storage | Users won't paste API keys into a platform that stores them in plaintext | High | Encrypt at rest. Server-side decryption only at runtime. Key rotation support. |
| Usage tracking & reporting | Users need to know what they're spending on AI tokens and compute | Medium | Track token counts, ECS compute hours, preview runtime. Dashboard with breakdowns per user/project. |
| Remote runtime execution | Core value prop -- scale beyond local machine | High | ECS Fargate task orchestration. Start/stop/status. Log streaming back to UI. |
| Real-time output streaming | Users expect live output from remote runtimes, same as local | Medium | WebSocket or SSE for remote loop output. Supabase Realtime + polling fallback. |
| Audit log | Enterprise expectation for who did what and when | Low | Append-only event log. Who started/stopped loops, changed settings, managed members. |
| Graceful local/cloud mode switching | Users must not lose local functionality when cloud is available | Medium | Feature detection, not feature flags. Zero cloud dependencies in local mode. |

## Differentiators

Features that set Ralph apart. Not universally expected, but create competitive advantage.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Seamless local-to-cloud continuity | Same UI, same workflow, just more compute. No context switch. | High | This is Ralph's core thesis. Most platforms are cloud-only OR local-only. The dual-mode DB abstraction is the technical enabler. |
| Preview deployments with queue integration | One-click deploy a preview of the AI-built app | High | SQS queue for deployment requests, ECS task for builds. Developers see live previews of AI-generated code without leaving the platform. |
| Interactive sessions with presence | See who else is watching/working in a loop session | Medium | Cursor-style awareness. Lightweight -- just presence indicators and shared output view, not full collaborative editing. |
| Source management (GitHub/GitLab) | Connect repos, use as seed sources for AI loops | Medium | OAuth integration with git providers. Clone/pull into runtime environments. Most AI coding tools require manual repo setup. |
| Notifications system | Proactive alerts when loops complete, fail, or need attention | Low | In-app + optional email/webhook. Useful for long-running cloud loops where user navigates away. |
| Infrastructure-as-code (CDK) | Users can self-host the cloud stack in their own AWS account | High | CDK stacks for VPC, ECS, SQS. Differentiator for privacy-conscious teams who want cloud scale but own infrastructure. |

## Anti-Features

Features to explicitly NOT build. Tempting but wrong for this product.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Billing / payment processing | Out of scope per PROJECT.md. Massive compliance burden (PCI, tax, invoicing). | Track usage only. Let users bring their own API keys and AWS accounts. Billing can be a future product if needed. |
| Custom model hosting / fine-tuning | Ralph orchestrates AI, it doesn't host models. Completely different infrastructure problem. | Integrate with existing providers (Anthropic, Google, OpenAI). Support BYOK (bring your own key). |
| Mobile app | AI loop orchestration is a desktop/laptop workflow. Mobile adds massive surface area for minimal value. | Responsive web works fine for status checking on mobile. |
| Collaborative code editing | Google Docs-style real-time co-editing is enormously complex (CRDTs, OT). Not the core value. | Presence indicators + shared read-only output view. Users edit in their own IDE. |
| Marketplace / plugin system | Premature abstraction. Platform isn't mature enough to know what the extension points should be. | Build features directly. Consider extensibility after v2 when usage patterns are clear. |
| Fine-grained permissions (ABAC) | 3 roles (owner/editor/viewer) covers 95% of use cases. Attribute-based access adds config complexity users hate. | Stick with simple RBAC. Add one more role (admin) only if absolutely needed. |
| Multi-region deployment | Enormous infrastructure complexity for marginal benefit at this stage. | Single-region deployment. Add region selection as a future enhancement when user base demands it. |

## Feature Dependencies

```
Authentication -----> Organization Management -----> RBAC
                                |
                                v
                        Project Access Control
                                |
                                v
                    Credential Storage (per-project encrypted keys)
                                |
                                v
                    Remote Runtime Execution (ECS, needs credentials)
                                |
                                v
                    Preview Deployments (needs runtime infra)

Authentication -----> Usage Tracking (need to know WHO is using what)

Authentication -----> Notifications (need to know WHO to notify)

Dual-mode DB -------> Everything cloud (all cloud features depend on Postgres being available)

Real-time streaming --> Interactive Sessions with Presence

Source Management is independent -- can be built in parallel with runtime features
```

## MVP Recommendation

**Cloud MVP -- build first (table stakes only):**

1. **Dual-mode database abstraction** -- everything else depends on this
2. **Authentication** (Supabase Auth) -- gate for all multi-user features
3. **Org + project management with RBAC** -- basic multi-tenancy
4. **Encrypted credential storage** -- needed before remote execution
5. **Remote runtime execution** (ECS Fargate) -- the core cloud value prop
6. **Real-time output streaming** for remote runtimes
7. **Usage tracking** -- users need cost visibility from day one

**Defer to post-MVP:**

- Preview deployments: High complexity, not needed for core loop orchestration value
- Interactive sessions / presence: Nice-to-have, not blocking adoption
- Source management (GitHub/GitLab): Users can manually configure repos initially
- Notifications: Console output suffices early on
- CDK self-hosting: Power user feature, not needed for initial cloud launch
- Audit log: Can backfill from usage tracking data

## Sources

- [Microsoft Azure Multi-tenant Control Plane Architecture](https://learn.microsoft.com/en-us/azure/architecture/guide/multitenant/approaches/control-planes)
- [Northflank Multi-tenant Cloud Deployment Guide](https://northflank.com/blog/multi-tenant-cloud-deployment)
- [WorkOS Developer Guide to SaaS Multi-tenant Architecture](https://workos.com/blog/developers-guide-saas-multi-tenant-architecture)
- [Claude Code Deployment Patterns with Amazon Bedrock](https://aws.amazon.com/blogs/machine-learning/claude-code-deployment-patterns-and-best-practices-with-amazon-bedrock/)
- [The New Stack: Choosing Your AI Orchestration Stack for 2026](https://thenewstack.io/choosing-your-ai-orchestration-stack-for-2026/)
- [Saturn Cloud: Top 15 Cloud Platforms for AI/ML Teams](https://saturncloud.io/blog/top-15-cloud-platforms-for-ai-ml-teams-in-2026/)
- Ralph-cloud source codebase analysis (PROJECT.md context)
