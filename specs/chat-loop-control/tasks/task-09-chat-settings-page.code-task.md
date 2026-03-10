---
status: completed
created: 2026-03-10
started: 2026-03-10
completed: 2026-03-10
---
# Task: Add Chat Settings (Provider/Model) to Global Settings Page

## Description
Add a "Chat" section to the global settings page with provider and model configuration fields, wired to the settings tRPC mutation, and trigger an immediate `OpenCodeService.updateModel()` call when settings are saved.

## Background
The existing settings page manages general preferences. Chat now needs its own LLM provider/model configuration, separate from the `model` field used for plan/task AI selection. The user must be able to select from Anthropic, OpenAI, or Google as a provider, and specify the model string. When saved, the backend should apply the change to OpenCode immediately (not just on next restart) by calling `updateModel()`. Additionally, if the expected API key for the selected provider is not present in the environment, the UI should show an inline warning so the user knows why chat may not work.

## Reference Documentation
**Required:**
- Design: specs/chat-loop-control/design.md
- Plan: specs/chat-loop-control/plan.md

## Technical Requirements
1. Extend `packages/frontend/src/components/settings/SettingsView.tsx` (or equivalent settings page component) with a new "Chat" section containing:
   - A provider dropdown with options: `Anthropic`, `OpenAI`, `Google` (values: `anthropic`, `openai`, `google`).
   - A model input field (text input) pre-populated with the current `chatModel` value, or a dropdown with common models that adjusts based on the selected provider.
   - An inline warning message shown when the settings query indicates the expected API key env var is not detected (use the `PROVIDER_ENV_VAR_MAP` from Task 2 to determine which env var to check; the backend can expose whether the var is set or not without revealing its value).
2. Read current values via the existing settings tRPC query (which now includes `chatProvider` and `chatModel` from Task 2).
3. On save, call the settings tRPC mutation with `{ chatProvider, chatModel }` merged with all other settings fields.
4. On the backend, after the settings mutation completes, call `openCodeService.updateModel(provider, model)`. This can be implemented as a post-mutation hook in `settingsRouter.ts` or a settings change listener registered in `app.ts`.
5. The API key presence check must not expose the key value — only a boolean `hasApiKey: boolean` per provider needs to be returned from the backend.
6. Saving must not reset any other settings fields — the mutation must merge with existing settings.

## Dependencies
- `packages/frontend/src/components/settings/SettingsView.tsx` — to extend
- `packages/backend/src/routers/settingsRouter.ts` (or equivalent) — to add post-save hook
- `packages/backend/src/services/OpenCodeService.ts` — `updateModel()` from Task 3
- `packages/backend/src/app.ts` — `fastify.openCodeService` decorator
- Settings tRPC query/mutation with `chatProvider` and `chatModel` (from Task 2)
- `PROVIDER_ENV_VAR_MAP` constant (from Task 2)

## Implementation Approach
1. Update the settings tRPC query response to include `apiKeyStatus: Record<string, boolean>` — for each provider key in `PROVIDER_ENV_VAR_MAP`, check `!!process.env[varName]` and include as `{ anthropic: boolean, openai: boolean, google: boolean }`.
2. In `SettingsView.tsx`, add the Chat section after reading `chatProvider` and `chatModel` from the settings query response.
3. Implement the provider dropdown and model input with local controlled state, pre-populated from the query.
4. Implement the inline warning: when `apiKeyStatus[selectedProvider] === false`, show a message like "ANTHROPIC_API_KEY environment variable is not set. Chat may not work."
5. Wire the save button to call the settings mutation with updated `chatProvider` and `chatModel`.
6. In `settingsRouter.ts` (or `app.ts`), add a call to `openCodeService.updateModel(input.chatProvider, input.chatModel)` in the mutation's success path (use `try/catch` — failure to update model should not fail the settings save).
7. Write frontend render tests in `packages/frontend/src/components/settings/SettingsView.test.tsx`:
   - Chat section renders with provider dropdown and model input
   - API key warning shown when `apiKeyStatus.anthropic === false`
   - Saving triggers mutation with correct `chatProvider` and `chatModel`
8. Write a backend unit test: saving settings with `chatProvider = 'openai'` calls `openCodeService.updateModel('openai', ...)`.
9. Run `npm test -w @ralph-ui/backend` and `npm test -w @ralph-ui/frontend` — all tests must pass.

## Acceptance Criteria

1. **Chat Section Renders**
   - Given the settings page is open
   - When it renders
   - Then a "Chat" section is visible with a provider dropdown showing `Anthropic`, `OpenAI`, `Google` and a model input

2. **Values Pre-Populated**
   - Given the settings query returns `chatProvider: 'anthropic'` and `chatModel: 'claude-sonnet-4-20250514'`
   - When the settings page renders
   - Then the dropdown shows `Anthropic` selected and the model input shows the model string

3. **API Key Warning**
   - Given the backend reports `apiKeyStatus.openai === false`
   - When the user selects `OpenAI` as provider
   - Then an inline warning about the missing `OPENAI_API_KEY` variable is displayed

4. **Save Triggers Mutation**
   - Given the user changes provider to `openai` and model to `gpt-4o` and clicks Save
   - When the mutation fires
   - Then it includes `chatProvider: 'openai'` and `chatModel: 'gpt-4o'`

5. **Backend Applies Model Change**
   - Given the settings mutation receives `chatProvider: 'openai'` and `chatModel: 'gpt-4o'`
   - When the mutation completes
   - Then `openCodeService.updateModel('openai', 'gpt-4o')` is called

6. **Existing Settings Unaffected**
   - Given other settings fields exist in the store
   - When only `chatProvider` and `chatModel` are changed and saved
   - Then all other settings fields remain at their previous values

7. **All Tests Pass**
   - Given all new frontend and backend tests run
   - When `npm test -w @ralph-ui/backend` and `npm test -w @ralph-ui/frontend` execute
   - Then all pass with no TypeScript errors

## Metadata
- **Complexity**: Medium
- **Labels**: frontend, backend, settings, opencode, ux
- **Required Skills**: TypeScript, React, tRPC, Vitest, React Testing Library
