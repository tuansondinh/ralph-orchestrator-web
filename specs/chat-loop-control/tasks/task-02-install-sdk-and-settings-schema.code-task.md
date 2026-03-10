---
status: completed
created: 2026-03-10
started: 2026-03-10
completed: 2026-03-10
---
# Task: Install OpenCode SDK and Add Settings Schema

## Description
Add the `@opencode-ai/sdk` dependency to the backend package and extend the settings data model with `chatProvider` and `chatModel` fields, wiring them through `SettingsService` and the tRPC settings API.

## Background
The existing settings schema has a `model` field used for plan/task AI selection. Chat needs its own provider/model fields to avoid breaking the existing API contract. The new fields will be consumed by `OpenCodeService` (Task 3) to configure the LLM at startup and on change. The settings tRPC query and mutation must expose the new fields so the frontend settings page (Task 9) can read and write them.

## Reference Documentation
**Required:**
- Design: specs/chat-loop-control/design.md
- Plan: specs/chat-loop-control/plan.md

## Technical Requirements
1. Run `npm install @opencode-ai/sdk -w @ralph-ui/backend` and commit the updated `package.json` and lockfile.
2. Add `chatProvider: string` and `chatModel: string` columns (or JSON-stored fields) to the settings schema — use new names, do not rename or repurpose the existing `model` field.
3. Set defaults: `chatProvider = 'anthropic'`, `chatModel = 'claude-sonnet-4-20250514'`.
4. Update `SettingsService` (in `packages/backend/src/services/SettingsService.ts` or equivalent) to read and write the new fields.
5. Update the settings tRPC router (query and mutation) to include `chatProvider` and `chatModel` in the input/output types.
6. Add a provider-to-env-var mapping constant: `{ anthropic: 'ANTHROPIC_API_KEY', openai: 'OPENAI_API_KEY', google: 'GOOGLE_API_KEY' }` — this will be used by both the settings UI (warning display) and `OpenCodeService`.
7. Export the new types from a shared types module if one exists (e.g. `packages/backend/src/types/settings.ts`).

## Dependencies
- `packages/backend/src/services/SettingsService.ts` (or equivalent settings service file)
- `packages/backend/src/routers/settingsRouter.ts` (or equivalent tRPC router)
- SQLite migration file or settings schema definition
- `package.json` and `package-lock.json` for `@ralph-ui/backend`

## Implementation Approach
1. Run the npm install command and verify `@opencode-ai/sdk` appears in `packages/backend/package.json`.
2. Locate the settings schema (SQLite table definition or in-memory schema) and add `chatProvider` and `chatModel` — add a database migration if settings are stored in SQLite.
3. Update `SettingsService.getSettings()` to return the new fields with defaults when absent.
4. Update `SettingsService.updateSettings()` to persist the new fields.
5. Update the tRPC settings input/output Zod schemas to include `chatProvider: z.string().optional()` and `chatModel: z.string().optional()`.
6. Add the `PROVIDER_ENV_VAR_MAP` constant in a shared location importable by both `OpenCodeService` and the frontend type definitions.
7. Write unit tests in `packages/backend/src/services/SettingsService.test.ts` covering:
   - Settings round-trip: write `chatProvider`/`chatModel`, read them back
   - Defaults applied when fields are absent
   - Existing fields (`model`, `theme`, etc.) unaffected

## Acceptance Criteria

1. **Settings Round-Trip**
   - Given `chatProvider = 'openai'` and `chatModel = 'gpt-4o'` are saved via `SettingsService.updateSettings()`
   - When `SettingsService.getSettings()` is called
   - Then the returned object includes `chatProvider: 'openai'` and `chatModel: 'gpt-4o'`

2. **Defaults Applied**
   - Given no chat settings have ever been saved
   - When `SettingsService.getSettings()` is called
   - Then `chatProvider` is `'anthropic'` and `chatModel` is `'claude-sonnet-4-20250514'`

3. **Existing Fields Unaffected**
   - Given settings were saved before this change
   - When `getSettings()` is called after migration
   - Then the existing `model` field and all other settings fields retain their previous values

4. **tRPC API Surface**
   - Given the backend is running
   - When the settings tRPC query is called
   - Then the response includes `chatProvider` and `chatModel` alongside all existing fields

5. **Unit Tests Pass**
   - Given the new unit tests are run with `npm test -w @ralph-ui/backend`
   - When all settings tests execute
   - Then all pass with no TypeScript errors

## Metadata
- **Complexity**: Low
- **Labels**: backend, settings, opencode, schema
- **Required Skills**: TypeScript, Fastify, tRPC, SQLite, Vitest
