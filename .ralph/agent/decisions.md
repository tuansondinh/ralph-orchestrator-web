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
