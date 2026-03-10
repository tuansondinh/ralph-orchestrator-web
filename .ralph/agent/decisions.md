# Decision Journal

## DEC-001
- Decision: Resolve the spec/code naming mismatch around the legacy assistant model setting while implementing Task 2.
- Chosen Option: Preserve the existing `chatModel` field semantics for the current assistant setting and add separate OpenCode fields as `chatProvider` plus `opencodeModel`.
- Confidence: 72
- Alternatives Considered: Rename the legacy field to `model` across backend/frontend now; repurpose `chatModel` for OpenCode immediately and fix downstream breakage in the same iteration.
- Reasoning: The repository already ships code and tests that treat `chatModel` as the existing assistant selection. Renaming or repurposing it in this single atomic task would broaden scope and risk regressions across frontend and chat code. Adding distinct OpenCode fields is reversible and keeps existing behavior stable.
- Reversibility: High. A later phase can normalize naming once the OpenCode migration is complete.
- Timestamp (UTC ISO 8601): 2026-03-10T00:00:00Z

## DEC-002
- Decision: Normalize backend OpenCode websocket payloads into a frontend-local chat message model for Task 5.
- Chosen Option: Create shared frontend chat types with `timestamp`, optional `isStreaming`, and optional `toolCall`, then map backend `chat:message` (`createdAt`) and `chat:tool-result` events into that local store shape inside `ChatSessionProvider`.
- Confidence: 74
- Alternatives Considered: Change backend payloads now to exactly match the design type; constrain the frontend store to backend payloads only and defer tool-result rendering until later UI tasks.
- Reasoning: The backend contract is already covered by Task 3 and Task 4 tests, so changing it here would widen scope. The UI design requires streamed assistant state and plain-text tool result rendering, which the raw backend message shape does not provide directly. Provider-side normalization is additive, localized, and reversible.
- Reversibility: High. A later phase can collapse the mapping once backend and frontend types are intentionally unified.
- Timestamp (UTC ISO 8601): 2026-03-10T00:00:00Z

## DEC-003
- Decision: Handle the currently hidden `chat` route while implementing the mobile chat layout gate in Task 6.
- Chosen Option: Preserve `params.tab === 'chat'` as the active `ProjectPage` tab locally, while leaving the broader tab visibility and navigation model unchanged in this iteration.
- Confidence: 71
- Alternatives Considered: Keep the existing `resolveProjectTab()` behavior and only test the layout with mocked tab resolution; expand `projectTabs`/routing now so chat becomes a fully visible project tab in the broader app shell.
- Reasoning: The current `ProjectPage` logic collapses `chat` to `loops`, which makes the mobile chat layout branch unreachable and defeats the task's acceptance criteria. Preserving the chat route locally is the narrowest reversible change that enables the layout behavior without pulling Task 7/8 navigation work into this iteration.
- Reversibility: High. Later chat-tab work can centralize chat visibility once the full tab experience is intentionally enabled.
- Timestamp (UTC ISO 8601): 2026-03-10T19:03:13Z

## DEC-004
- Decision: Scope the Task 7 chat drawer navigation without changing the global project tab model.
- Chosen Option: Build the hamburger drawer inside `ChatView` using the existing visible project tabs plus the current project name, and keep chat-route visibility/navigation rules outside this iteration unchanged.
- Confidence: 76
- Alternatives Considered: Promote `chat` into the shared tab model now; add a separate chat-specific navigation source just for mobile.
- Reasoning: The task requires an in-chat navigation affordance because `ProjectHeader` and `TabBar` are hidden on mobile, but broad tab-model changes belong to later chat-route work. Reusing the existing visible tab list keeps the drawer additive, consistent with current navigation labels, and avoids widening scope beyond the tab surface itself.
- Reversibility: High. A later iteration can centralize drawer/tab definitions once chat becomes a first-class visible tab everywhere.
- Timestamp (UTC ISO 8601): 2026-03-10T19:10:00Z

## DEC-005
- Decision: Handle the Task 9 settings contract mismatch and transitional payloads without renaming the existing backend fields.
- Chosen Option: Keep the backend/frontend OpenCode settings contract as `chatProvider` plus `opencodeModel`, label the UI field as "Chat model", and make the page tolerate missing `providerEnvVarMap` / `apiKeyStatus` metadata instead of crashing.
- Confidence: 78
- Alternatives Considered: Rename the backend contract to `chatModel` for OpenCode immediately; require the new metadata fields unconditionally and fail hard on older payloads.
- Reasoning: The repository already documented the additive `opencodeModel` contract in Task 2, and renaming it now would widen scope across backend, frontend, and chat code. The settings page still needs user-facing "Chat model" wording, but it should not crash if a stale backend process or partial mock returns the older snapshot shape during rollout. Defensive reads are additive and reversible.
- Reversibility: High. A later cleanup phase can normalize the naming once the legacy assistant model field is retired everywhere.
- Timestamp (UTC ISO 8601): 2026-03-10T00:00:00Z
