# Requirements: Ralph Orchestrator Web

**Defined:** 2026-03-11
**Core Value:** Users can reliably orchestrate AI coding loops and chat with an AI assistant through a polished, intuitive web interface

## v0.9 Requirements

Requirements for the v0.9 Polish milestone. Each maps to roadmap phases.

### Loop Output

- [x] **LOOP-01**: Loop output is rendered using xterm.js terminal emulator instead of the custom ANSI parser
- [x] **LOOP-02**: Loop output handles all escape sequences (colors, bold, cursor movement, OSC) correctly

### Loop Git Automation

- [ ] **GIT-01**: A new git branch is created before a loop process spawns
- [ ] **GIT-02**: On loop completion, the working branch is automatically pushed to the remote
- [ ] **GIT-03**: On loop completion, a pull request is automatically opened against the base branch

### Per-User Configuration

- [ ] **USER-01**: Each cloud user can configure their own API keys (Anthropic, OpenAI, Google) stored per user ID for opencode. for the chat and the ralph loop
- [ ] **USER-02**: API keys are scoped to the authenticated user and not shared across users

### Chat Polish

- [ ] **CHAT-01**: Chat is the first/default tab when opening a project
- [ ] **CHAT-02**: Tool call messages in chat are collapsed by default (expandable on click)
- [ ] **CHAT-03**: Chat UI is clean — no unnecessary clutter
- [ ] **CHAT-04**: Chat assistant asks which project a plan/task belongs to and writes specs to the correct project workspace folder

### Terminal Reliability

- [ ] **TERM-01**: Terminal tab renders reliably on tab switch without blank or janky state
- [ ] **TERM-02**: Terminal xterm.js instance initializes correctly after navigation

### UI Cleanup

- [ ] **UI-01**: Navigation and tab layout is clean and uncluttered
- [ ] **UI-02**: Consistent visual treatment across all views (loops, chat, terminal, settings)
- [ ] **UI-03**: Remove or hide low-value UI elements that add visual noise

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Notifications

- **NOTIF-01**: Push notifications for loop completion (browser/mobile)
- **NOTIF-02**: Email notifications for long-running loop results

### Collaboration

- **COLLAB-01**: Multiple users can view the same project simultaneously
- **COLLAB-02**: Shared loop output viewing across users

## Out of Scope

| Feature | Reason |
|---------|--------|
| New AI backend integrations | Focus on polishing existing backends |
| Mobile-native app | Web-first for v0.9 |
| Multi-tenant billing/subscription | Internal team use only |
| Major architectural rewrites | Targeted fixes only |
| OAuth providers beyond GitHub | GitHub sufficient for internal team |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| LOOP-01 | Phase 6 | Complete |
| LOOP-02 | Phase 6 | Complete |
| GIT-01 | Phase 7 | Pending |
| GIT-02 | Phase 7 | Pending |
| GIT-03 | Phase 7 | Pending |
| USER-01 | Phase 8 | Pending |
| USER-02 | Phase 8 | Pending |
| CHAT-01 | Phase 9 | Pending |
| CHAT-02 | Phase 9 | Pending |
| CHAT-03 | Phase 9 | Pending |
| CHAT-04 | Phase 9 | Pending |
| TERM-01 | Phase 9 | Pending |
| TERM-02 | Phase 9 | Pending |
| UI-01 | Phase 9 | Pending |
| UI-02 | Phase 9 | Pending |
| UI-03 | Phase 9 | Pending |

**Coverage:**
- v0.9 requirements: 16 total
- Mapped to phases: 16
- Unmapped: 0

---
*Requirements defined: 2026-03-11*
*Last updated: 2026-03-11 — traceability filled in after roadmap creation*
