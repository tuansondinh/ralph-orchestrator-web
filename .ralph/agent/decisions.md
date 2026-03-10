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
