# M001: v0.9 Polish

**Vision:** Ralph Orchestrator Web is a cloud-deployed monorepo application (Fastify backend + React frontend) for managing AI-driven coding workflows.

## Success Criteria

- Loop output renders correctly using xterm.js (replacing broken custom ANSI parser)
- Loops auto-create a git branch, push, and open a PR on completion
- Each cloud user has isolated per-user API key storage
- Chat is the primary tab; tool calls collapsed by default; terminal and UI are clean and reliable

## Slices

- [x] **S01: Loop Output** `risk:medium` `depends:[]`
  > After this: Loop output is rendered correctly using xterm.js — ANSI colors, bold, cursor movement, and OSC sequences all display properly. Custom ANSI parser (TerminalOutput.tsx) is replaced.
- [ ] **S02: Loop Git Automation** `risk:medium` `depends:[S01]`
  > After this: Create the LoopGitService and update DB schemas to support git branch automation for loops.
- [ ] **S03: Per User Configuration** `risk:medium` `depends:[S02]`
  > After this: Each cloud user can configure their own API keys (Anthropic, OpenAI, Google) stored per Supabase user ID, isolated from other users.
- [ ] **S04: Chat, Terminal, and UI Polish** `risk:medium` `depends:[S03]`
  > After this: Chat is the default tab, tool calls are collapsed by default, terminal renders reliably on tab switch, and the UI is visually clean across all views.
