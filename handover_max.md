# Cloud Handover For Max

## Current deployment

- Repo: `ralph-orchestrator-web`
- Branch used for cloud work: `ralph-cloud`
- Server: `app@18.159.34.250`
- Live EC2 instance: `i-0e394eae69bc1b841` (`t3.large`, `eu-central-1a`, tag `ralph-cloud`)
- App directory on server: `/opt/ralph-orchestrator-web`
- Service name: `ralph-orchestrator`
- Backend health endpoint on box: `http://127.0.0.1:3003/health`
- Runtime shape: one VM, backend + built frontend served from the same app

This is not running on Docker in production right now.
The standard deploy path is still:

```bash
npm run deploy
```

That goes through [deploy/deploy.sh](/Users/sonwork/Workspace/ralph-orchestrator-web/deploy/deploy.sh).

## Auth / cloud mode

- Cloud auth uses Supabase.
- The frontend now has both `/sign-in` and `/sign-up`.
- Max has a manually created confirmed auth user in Supabase already.

Important:
- Do not put passwords or API keys into git-tracked docs.
- If Max needs the temp login, share it out of band and rotate it after first use.

## Runtime config currently expected on the server

These values matter on the live box:

- `RALPH_UI_ALLOW_REMOTE_UNSAFE_OPS=1`
- `RALPH_UI_RALPH_BIN=/opt/ralph-orchestrator-web/node_modules/.bin/ralph`
- `PATH` must include `/home/app/.local/bin`
- `ZAI_API_KEY` must be present
- `GEMINI_API_KEY` must be present

The deploy path was updated so fresh deploys also:

- install `@google/gemini-cli`
- keep OpenCode config synced
- write the PATH override
- write `RALPH_UI_RALPH_BIN`

Related files:
- [deploy/deploy.sh](/Users/sonwork/Workspace/ralph-orchestrator-web/deploy/deploy.sh)
- [deploy/.env.example](/Users/sonwork/Workspace/ralph-orchestrator-web/deploy/.env.example)
- [deploy/opencode.json](/Users/sonwork/Workspace/ralph-orchestrator-web/deploy/opencode.json)

## OpenCode config

The intended OpenCode model config is:

- provider: `zai-coding-plan`
- model: `zai-coding-plan/glm-4.7`
- small model: `zai-coding-plan/glm-4.5-air`

This is tracked in [deploy/opencode.json](/Users/sonwork/Workspace/ralph-orchestrator-web/deploy/opencode.json) and was also synced to the server user config at:

```bash
~/.config/opencode/opencode.json
```

## Terminal status

Terminal is enabled again in the frontend.

Known-good points:
- terminal tab was re-enabled in the app
- remote terminal safety gate was bypassed intentionally via `RALPH_UI_ALLOW_REMOTE_UNSAFE_OPS=1`
- `gemini` and `opencode` can run from the in-app terminal/server shell

## Known blocker: loops appear stuck

This is the main unresolved issue.

What was validated:
- `opencode` itself works on the server
- `gemini` was installed and made available on the server
- Ralph binary resolution was fixed with `RALPH_UI_RALPH_BIN`
- the app health endpoint is fine

What the current evidence suggests:
- the failure is not basic CLI installation anymore
- the problem happens at the Ralph orchestration layer
- with the full loop prompt, `opencode` starts making progress, but Ralph appears to trigger recovery/worktree behavior before the backend completes its first meaningful step
- in the failing worktrees, expected `.ralph/agent/*` files such as `scratchpad.md`, `decisions.md`, and `tasks.jsonl` were often missing

Observed symptom:
- loop logs mostly show the expanded prompt
- Ralph diagnostics showed repeated recovery / `task.resume` behavior
- manual replay of simpler prompts through `opencode` worked
- manual replay of the giant orchestration prompt showed progress, but slow enough that recovery looked suspicious

This means the cloud app is usable, but loop reliability is not solved yet.

## Suggested next debugging steps

1. Reproduce one failing loop on the server with the exact expanded prompt and capture the full backend output.
2. Check whether Ralph is timing out or recovering too aggressively before the first event.
3. Confirm whether missing `.ralph/agent/*` bootstrap files are part of the delay or only a side symptom.
4. Decide whether to fix this in:
   - app-side loop bootstrapping
   - Ralph preset/config timing
   - backend selection / prompt shape for `opencode`

## Deploy / ops notes

- Docker files exist in the repo, but Docker is not the active production path.
- The live server does not currently have Docker installed.
- Fargate / true scale-to-zero serverless is not a good fit for the app as currently designed because it depends on PTY terminals, local workspaces, and long-lived sessions.

## Current local repo state

There are local deploy-related modifications not yet described as deployed from this handoff file alone:

- [deploy/deploy.sh](/Users/sonwork/Workspace/ralph-orchestrator-web/deploy/deploy.sh)
- [deploy/.env.example](/Users/sonwork/Workspace/ralph-orchestrator-web/deploy/.env.example)
- [packages/backend/test/deploy-artifacts.test.ts](/Users/sonwork/Workspace/ralph-orchestrator-web/packages/backend/test/deploy-artifacts.test.ts)

Before changing cloud infra again, check:

```bash
git status
git log --oneline --decorate -n 10
```

## Quick commands

Server health:

```bash
ssh -i ~/.ssh/ralph-cloud-key.pem app@18.159.34.250 'curl -s http://127.0.0.1:3003/health'
```

Recent service logs:

```bash
ssh -i ~/.ssh/ralph-cloud-key.pem app@18.159.34.250 'journalctl -u ralph-orchestrator -n 200 --no-pager'
```

Restart service:

```bash
ssh -i ~/.ssh/ralph-cloud-key.pem app@18.159.34.250 'sudo systemctl restart ralph-orchestrator'
```

Standard deploy:

```bash
npm run deploy
```
