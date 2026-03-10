---
status: completed
created: 2026-03-09
started: 2026-03-10
completed: 2026-03-10
---
# Task: Step 03 - GitHub OAuth Handler

## Description
Implement GitHub OAuth connect/callback/disconnect flows and repository listing for authenticated cloud users.

## Reference Documentation
- `specs/aws-single-instance-cloud-backend/design.md`
- `specs/aws-single-instance-cloud-backend/plan.md`
- `specs/aws-single-instance-cloud-backend/requirements.md`

## Key Source Files
- `packages/backend/src/api/githubAuth.ts`
- `packages/backend/src/services/GitHubService.ts`
- `packages/backend/src/db/schema.ts`

## Technical Requirements
1. Start the GitHub OAuth flow and handle the callback.
2. Store encrypted GitHub tokens in `github_connections`.
3. Support disconnect and repository listing for public/private repos.
4. Scope GitHub data to the authenticated Supabase user.

## Implementation Approach
1. Review current GitHub service utilities and route registration.
2. Add OAuth state/callback handling and token exchange logic.
3. Persist encrypted credentials and provider metadata in Postgres.
4. Expose repository listing and disconnect operations through the backend API surface.
5. Add backend tests covering connect callback persistence, repo listing, and disconnect cleanup.

## Acceptance Criteria
1. Authenticated cloud users can connect GitHub and store tokens securely.
2. Repository listing returns both public and private repositories available to the user.
3. Disconnect removes or invalidates the stored connection cleanly.
4. `npm test -w @ralph-ui/backend` passes.

## Metadata
- Complexity: High
- Labels: backend, github, oauth, api
- Required Skills: OAuth flows, encryption, HTTP API testing
