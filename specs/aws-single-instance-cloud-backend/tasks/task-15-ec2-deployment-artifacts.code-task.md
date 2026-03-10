---
status: completed
created: 2026-03-09
started: 2026-03-10
completed: 2026-03-10
---
# Task: Step 15 - EC2 Deployment Artifacts

## Description
Add the deployment assets needed to run the app on a single EC2 host with systemd and nginx.

## Reference Documentation
- `specs/aws-single-instance-cloud-backend/design.md`
- `specs/aws-single-instance-cloud-backend/plan.md`
- `specs/aws-single-instance-cloud-backend/requirements.md`

## Key Source Files
- `Dockerfile`
- backend startup scripts and production server entrypoints
- new deployment artifact paths to be introduced in this step

## Technical Requirements
1. Provide systemd unit configuration for the app process.
2. Provide nginx configuration appropriate for frontend/API/WebSocket traffic.
3. Add a deploy script or documented command flow for installing/updating on EC2.
4. Capture the required environment variables for cloud mode.

## Implementation Approach
1. Review the existing production startup path (`npm start`, backend serve entrypoint, static hosting assumptions).
2. Add deployment artifact files under a clear deploy/infrastructure directory.
3. Include env var placeholders for Supabase, GitHub OAuth, bind host, and workspace root values.
4. Document or script the expected build, install, restart, and rollback-adjacent steps.
5. Smoke-check the artifact syntax where possible.

## Acceptance Criteria
1. The repo contains runnable systemd and nginx artifacts for single-instance deployment.
2. Deployment steps describe how to start the app with the required cloud env vars.
3. WebSocket proxying requirements are captured in the nginx config.
4. Any relevant validation or smoke checks pass.

## Metadata
- Complexity: Medium
- Labels: deploy, aws, nginx, systemd
- Required Skills: Linux service management, reverse proxy config

## Detailed Implementation Plan
1. Inspect the current production start/build path for both frontend and backend so the deployment assets reflect how this repo actually boots, rather than introducing a new runtime contract.
2. Choose a single deployment artifact directory and keep all new files there:
   - `systemd` unit for the app service.
   - `nginx` site config with API and WebSocket proxy rules.
   - Deploy/update script or command script with environment placeholders.
3. Base the service environment on the cloud-mode requirements already defined in the spec: Supabase values, GitHub OAuth values, workspace root, bind host/port, and any other required existing app variables.
4. Keep the artifacts additive and explicit. Do not add container orchestration, secrets managers, or preview deployment paths that are outside this step’s scope.
5. If there is an existing Dockerfile or start script relationship that operators must use, document it in the deploy script/comments so the artifacts are runnable by a junior operator without guessing.
6. Validate syntax wherever possible:
   - Shell script passes `bash -n`.
   - `nginx` config structure is internally consistent.
   - `systemd` unit has the required sections and ExecStart path expectations.
7. Capture rollback-safe deployment flow at a basic level: build/install, restart service, and where logs/status should be checked after deployment.
