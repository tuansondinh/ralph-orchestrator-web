# Compare To Main

This document summarizes what exists on `ralph-cloud` compared with `main`, and what additional local changes were made during the recent loop-output debugging and deploy work.

## Branch Context

- Current branch: `ralph-cloud`
- Current HEAD: `88d9ce5` (`Merge branch 'opencode_chat_mcp' into ralph-cloud`)
- Comparison base: `main`

`ralph-cloud` is substantially ahead of `main`. The branch introduces the cloud-hosted Ralph UI stack, cloud auth, GitHub-backed projects, loop persistence/state improvements, EC2 deployment assets, and the OpenCode chat integration work.

## High-Level Work On `ralph-cloud` vs `main`

Major areas already committed on this branch:

- Cloud runtime and auth:
  - Supabase-backed auth and cloud runtime capability handling.
  - Cloud-aware API and app startup paths.
  - Mode-aware frontend shell and settings flows.

- Cloud project and workspace support:
  - GitHub OAuth routes and GitHub service integration.
  - Cloud project creation and repository-backed workspace management.
  - Workspace lifecycle support for remote/cloud projects.

- Loop infrastructure:
  - Loop output persistence to the database and replay fallback.
  - Database-authoritative loop state.
  - UUID-based imported loop IDs.
  - PTY-enabled loop execution work for TTY-dependent providers.

- OpenCode chat and websocket work:
  - OpenCode backend service integration.
  - Websocket channel/auth work for chat.
  - Chat session provider, mobile chat layout rework, and frontend chat updates.

- Deployment and operations:
  - EC2 deployment artifacts under `deploy/`.
  - `Dockerfile`, `compose.yaml`, and cloud env templates.
  - Systemd unit, nginx config, and setup/deploy scripts.

Representative commits on this branch include:

- `1366772` Add EC2 deployment artifacts
- `d6b9e7e` add loop output persistence to database
- `6045b51` implement database-authoritative loop state
- `c005556` cloud project service with repository integration
- `cff5a40` update cloud auth and deploy flow
- `9ba3c46` enable PTY for LoopService to resolve stuck OpenCode/Gemini backends
- `32324bc` build OpenCode chat service
- `ab7bd44` wire OpenCode websocket channel
- `1ae8525` improve OpenCodeService message processing and frontend display

## Local Changes Made In This Debug/Deploy Session

These changes are local relative to `HEAD`, and were made to get the cloud deployment working and to address the loop output regression:

### 1. Deploy script fix

Files:

- [deploy/deploy.sh](/Users/sonwork/Workspace/ralph-orchestrator-web/deploy/deploy.sh)

What changed:

- Fixed the remote `.env` update step so deploy no longer aborts on the SSH/heredoc section.
- Kept the deploy path compatible with the EC2 host even when `expect` is not installed.

Why:

- The original deploy attempt failed before restart because the remote `.env` mutation step was malformed.

### 2. Process spawning change for loop execution

Files:

- [packages/backend/src/runner/ProcessManager.ts](/Users/sonwork/Workspace/ralph-orchestrator-web/packages/backend/src/runner/ProcessManager.ts)
- [packages/backend/test/process-manager.test.ts](/Users/sonwork/Workspace/ralph-orchestrator-web/packages/backend/test/process-manager.test.ts)

What changed:

- Preserved the `expect` PTY bridge path for `tty: true` workloads.
- Added explicit exit propagation to the `expect` bridge script so the wrapper exits with the child process status.
- Removed the `script(1)` fallback that had been added during incident response.
- If `expect` is unavailable, the process manager now falls back to plain spawn instead of `script`.

Why:

- Remote EC2 did not have `expect`, which initially caused `loop.start` to fail with `spawn expect ENOENT`.
- The temporary `script(1)` fallback made loops start, but it changed the output stream into mostly terminal control sequences.
- Those control-sequence-heavy logs were the root cause of the broken/empty loop output in the UI.

### 3. Frontend terminal output sanitization

Files:

- [packages/frontend/src/components/loops/TerminalOutput.tsx](/Users/sonwork/Workspace/ralph-orchestrator-web/packages/frontend/src/components/loops/TerminalOutput.tsx)
- [packages/frontend/src/components/loops/TerminalOutput.test.tsx](/Users/sonwork/Workspace/ralph-orchestrator-web/packages/frontend/src/components/loops/TerminalOutput.test.tsx)

What changed:

- Expanded ANSI parsing so the component strips non-text terminal control sequences, not just color codes.
- Preserved SGR color rendering.
- Added a regression test covering cursor-hide / alternate-screen escape sequences.

Why:

- Even after identifying the backend root cause, the UI still needed to avoid rendering raw terminal control bytes when they appear.

### 4. Deployment artifact docs/tests

Files:

- [deploy/EC2_SETUP.md](/Users/sonwork/Workspace/ralph-orchestrator-web/deploy/EC2_SETUP.md)
- [packages/backend/test/deploy-artifacts.test.ts](/Users/sonwork/Workspace/ralph-orchestrator-web/packages/backend/test/deploy-artifacts.test.ts)

What changed:

- Documented `expect` as part of the deployment setup story.
- Added test coverage asserting the deploy artifacts mention the expected runtime/install assumptions.

## What Was Deployed

Deployed target:

- `app@18.159.34.250`

Live URL used during verification:

- `http://ec2-18-159-34-250.eu-central-1.compute.amazonaws.com:3003`

Deployed fixes included:

- deploy script `.env` update fix
- `ProcessManager` PTY fallback change
- frontend terminal output sanitization

Live verification performed:

- Health check passed at `/health`
- Loop-output root cause on the server was traced to `script`-generated control-sequence logs
- Deployed backend was verified to no longer contain the `script` fallback

## Important Nuance

There are additional local modifications in the working tree that are not part of the core compare-to-main story above, including planning files and some unrelated edits. This document is focused on:

- the major committed branch delta from `main`
- the hotfix/debug changes made in the latest deploy cycle
- what was actually pushed live to EC2

