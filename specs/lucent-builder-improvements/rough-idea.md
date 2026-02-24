# Rough Idea

Add a **code review mode** to lucent-builder that shows the git diff for a project's
workspace in a clean, readable, and pleasant UI.

## Key Constraints (from user)
- Simple — no comment threads, no "try again", no approval flow
- Just display the git diff in a good-looking way
- Can reference/copy patterns from `/Users/sonwork/Workspace/junior` (ReviewPage.tsx)
- Should integrate naturally into the existing lucent-builder UI

## Context
- Lucent Builder is a UI for the Ralph Orchestrator
- Projects have associated workspaces where Ralph makes code changes
- After Ralph completes a loop, users need to review what changed
- Currently there's no diff viewer — users have to use external tools
