# Decision Journal

## DEC-001
- Decision: Resolve the spec/code naming mismatch around the legacy assistant model setting while implementing Task 2.
- Chosen Option: Preserve the existing `chatModel` field semantics for the current assistant setting and add separate OpenCode fields as `chatProvider` plus `opencodeModel`.
- Confidence: 72
- Alternatives Considered: Rename the legacy field to `model` across backend/frontend now; repurpose `chatModel` for OpenCode immediately and fix downstream breakage in the same iteration.
- Reasoning: The repository already ships code and tests that treat `chatModel` as the existing assistant selection. Renaming or repurposing it in this single atomic task would broaden scope and risk regressions across frontend and chat code. Adding distinct OpenCode fields is reversible and keeps existing behavior stable.
- Reversibility: High. A later phase can normalize naming once the OpenCode migration is complete.
- Timestamp (UTC ISO 8601): 2026-03-10T00:00:00Z
