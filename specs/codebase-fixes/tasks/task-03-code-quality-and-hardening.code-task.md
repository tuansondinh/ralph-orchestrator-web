---
status: completed
created: 2026-03-07
started: 2026-03-07
completed: 2026-03-07
---
# Task: Code Quality and Hardening

## Description
Fix tRPC client type safety, eliminate per-request service instantiation in the router, and introduce a base service error class to replace the duplicated error pattern.

## Background
The frontend tRPC client is typed as `any`, completely defeating type safety. The tRPC router creates new service instances (ProjectService, PresetService, SettingsService, etc.) in nearly every handler instead of reusing shared instances. The codebase has 10 identical `ServiceError` classes with the same `code` property pattern.

## Technical Requirements

### 1. Fix tRPC client typing
**File:** `packages/frontend/src/lib/trpc.ts` (line 38)

```ts
// BEFORE:
export const trpcClient: any = createTRPCProxyClient<any>({

// AFTER:
import type { AppRouter } from '@ralph-ui/backend/src/trpc/router'
export const trpcClient = createTRPCProxyClient<AppRouter>({
```

- If direct import doesn't work due to package boundaries, export the `AppRouter` type from the backend package and import it
- Verify that the frontend `tsconfig.json` can resolve the backend type
- Fix any type errors that surface from this change

### 2. Reuse service instances from context
**File:** `packages/backend/src/trpc/router.ts`

The router creates `new ProjectService(ctx.db)`, `new PresetService()`, `new SettingsService(ctx.db)`, `new HatsPresetService()` repeatedly in handlers. Instead:

- Add `projectService`, `presetService`, `settingsService`, `hatsPresetService` to the tRPC context (in `context.ts`)
- Update `app.ts` to pass these instances when creating the context
- Update all router handlers to use `ctx.projectService` etc. instead of `new ProjectService(ctx.db)`

### 3. Introduce base ServiceError class
**File:** Create `packages/backend/src/lib/ServiceError.ts`

```ts
export type ServiceErrorCode = 'BAD_REQUEST' | 'NOT_FOUND' | 'CONFLICT'

export class ServiceError extends Error {
  code: ServiceErrorCode
  constructor(code: ServiceErrorCode, message: string) {
    super(message)
    this.name = 'ServiceError'
    this.code = code
  }
}
```

- Have all service error classes extend `ServiceError` (or replace them entirely)
- Simplify `asTRPCError` to check for a single `ServiceError` instanceof instead of 10 separate checks

## Dependencies
- None

## Implementation Approach
1. Create base ServiceError class
2. Refactor existing service errors to extend it
3. Simplify asTRPCError
4. Move service instances to context
5. Fix tRPC client typing
6. Run all tests

## Acceptance Criteria

1. **tRPC client is type-safe**
   - Given the frontend tRPC client
   - When calling a backend procedure
   - Then TypeScript provides autocomplete and type checking for inputs and outputs

2. **Services are shared instances**
   - Given the tRPC router handlers
   - When handling requests
   - Then they use shared service instances from context, not new instances per request

3. **Single base error class**
   - Given the asTRPCError function
   - When converting service errors to tRPC errors
   - Then it checks a single `ServiceError` base class instead of 10 separate instanceof checks

4. **All tests pass**
   - Given the refactored code
   - When running `npm test`
   - Then all existing tests pass

## Metadata
- **Complexity**: Medium
- **Labels**: code-quality, type-safety, refactor, p1
- **Required Skills**: TypeScript, tRPC, Fastify
