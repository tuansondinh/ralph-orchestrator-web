# Roadmap: Ralph Orchestrator Web

## Milestones

- ✅ **v0 Cloud Deployment** - Phases 1-5 (shipped 2026-03-11)
- 🚧 **v0.9 Polish** - Phases 6-9 (in progress)

## Phases

<details>
<summary>✅ v0 Cloud Deployment (Phases 1-5) - SHIPPED 2026-03-11</summary>

### Phase 1: Cloud Infrastructure and Auth Foundation
**Goal:** Supabase auth middleware, GitHub OAuth, mode resolver, database schema
**Status:** Complete

### Phase 2: Cloud Services and API
**Goal:** Cloud project service, workspace manager, tRPC cloud routes, WebSocket auth
**Status:** Complete

### Phase 3: Frontend Cloud Integration
**Goal:** AuthProvider, SignInPage, GitHub connector UI, cloud project creation UI, mode-aware shell
**Status:** Complete

### Phase 4: Stabilization and Deployment Prep
**Goal:** Fix all build errors, test failures, and deployment blockers across the cloud integration
**Status:** Complete

### Phase 5: Cloud Bug Fixing and Production Diagnostics
**Goal:** Fix remaining bugs across the app, prioritizing issues reproduced on the cloud deployment
**Status:** Complete

</details>

### 🚧 v0.9 Polish (In Progress)

**Milestone Goal:** Polish the app to release quality — correct loop output rendering, automated git workflow, per-user API keys, and clean UI with chat as the primary interaction point.

- [ ] **Phase 6: Loop Output** - Replace custom ANSI parser with xterm.js for correct terminal rendering
- [ ] **Phase 7: Loop Git Automation** - Auto-create branch, push, and open PR on loop completion
- [ ] **Phase 8: Per-User Configuration** - Per-user API key storage scoped to Supabase user ID
- [ ] **Phase 9: Chat, Terminal, and UI Polish** - Chat as primary tab, collapsed tool calls, terminal reliability, UI cleanup

## Phase Details

### Phase 6: Loop Output
**Goal**: Loop output is rendered correctly using xterm.js so users see properly formatted terminal output with all escape sequences handled
**Depends on**: Phase 5
**Requirements**: LOOP-01, LOOP-02
**Success Criteria** (what must be TRUE):
  1. Loop output renders ANSI colors, bold, and cursor movement sequences correctly in the browser
  2. Loop output no longer uses the custom ANSI parser in TerminalOutput.tsx
  3. Backend streams raw PTY bytes to the frontend rather than pre-parsed line strings
  4. Complex escape sequences (OSC, cursor movement) display without garbled or missing output
**Plans**: 1 plan

Plans:
- [ ] 06-01-PLAN.md — Replace custom ANSI parser with xterm.js and update backend to stream raw PTY chunks

### Phase 7: Loop Git Automation
**Goal**: Loops automatically manage git branch lifecycle so users never need to manually branch, push, or open a PR
**Depends on**: Phase 6
**Requirements**: GIT-01, GIT-02, GIT-03
**Success Criteria** (what must be TRUE):
  1. Starting a loop creates a new git branch before the loop process spawns
  2. When a loop completes, the working branch is automatically pushed to the remote
  3. When a loop completes, a pull request is automatically opened against the base branch
  4. The loop result surface shows the branch name or PR link to the user
**Plans**: TBD

Plans:
- [ ] 07-01: Add git branch creation before loop spawn and auto-push plus PR creation on loop completion in LoopService

### Phase 8: Per-User Configuration
**Goal**: Each cloud user has isolated API key storage so secrets are never shared across users
**Depends on**: Phase 7
**Requirements**: USER-01, USER-02
**Success Criteria** (what must be TRUE):
  1. A logged-in user can configure their own Anthropic, OpenAI, and Google API keys from the settings page
  2. API keys saved by one user are not visible to or usable by any other user
  3. API keys are stored in a per-user DB table keyed to the Supabase user ID
  4. Loops run by a user use that user's own API keys rather than a global shared value
**Plans**: TBD

Plans:
- [ ] 08-01: Add per-user API keys DB table and backend service, update settings UI to read/write per authenticated user

### Phase 9: Chat, Terminal, and UI Polish
**Goal**: Chat is the default experience, the UI is clean and uncluttered, and every view renders reliably
**Depends on**: Phase 8
**Requirements**: CHAT-01, CHAT-02, CHAT-03, CHAT-04, TERM-01, TERM-02, UI-01, UI-02, UI-03
**Success Criteria** (what must be TRUE):
  1. Chat is the first tab shown when opening a project
  2. Tool call messages in chat are collapsed by default and expand on click
  3. Terminal renders immediately without blank or janky state when switching to the terminal tab
  4. Chat assistant asks which project a plan belongs to and writes specs to the correct workspace folder
  5. Navigation and all views are visually clean with no low-value clutter
**Plans**: TBD

Plans:
- [ ] 09-01: Move chat to first tab, collapse tool calls by default, and improve chat assistant project context
- [ ] 09-02: Fix terminal tab fit/remount issues on tab switch and clean up navigation and UI across all views

## Progress

**Execution Order:**
Phases execute in numeric order: 6 → 7 → 8 → 9

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1-5. Cloud Deployment | v0 | — | Complete | 2026-03-11 |
| 6. Loop Output | v0.9 | 0/1 | Not started | - |
| 7. Loop Git Automation | v0.9 | 0/1 | Not started | - |
| 8. Per-User Configuration | v0.9 | 0/1 | Not started | - |
| 9. Chat, Terminal, and UI Polish | v0.9 | 0/2 | Not started | - |
