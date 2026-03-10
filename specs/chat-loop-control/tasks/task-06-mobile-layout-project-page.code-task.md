---
status: completed
created: 2026-03-10
started: 2026-03-10
completed: 2026-03-10
---
# Task: Rework ProjectPage Layout for Mobile Chat

## Description
Add conditional layout logic to `ProjectPage` so that `ProjectHeader` and `TabBar` are hidden on mobile when the chat tab is active, giving the chat interface the full viewport.

## Background
`ProjectPage` currently renders `ProjectHeader` and `TabBar` unconditionally for all tabs and all screen sizes. On mobile, these chrome elements consume vertical space that the full-screen chat UX needs. The fix is a `useMediaQuery` hook guarded by the active tab — so that only the combination of mobile + chat tab hides the chrome. All other combinations (desktop + any tab, mobile + non-chat tab) must leave the layout completely unchanged. This task is deliberately scoped to layout alone; ChatTab content changes come in Task 7.

## Reference Documentation
**Required:**
- Design: specs/chat-loop-control/design.md
- Plan: specs/chat-loop-control/plan.md

## Technical Requirements
1. Implement (or locate existing) `useMediaQuery(query: string): boolean` hook in `packages/frontend/src/hooks/useMediaQuery.ts`. It should use `window.matchMedia` and update when the media query match state changes.
2. In `packages/frontend/src/pages/ProjectPage.tsx` (or equivalent route component), derive `const isMobile = useMediaQuery('(max-width: 767px)')`.
3. Derive `const hideChrome = isMobile && tab === 'chat'` where `tab` is the current active tab identifier.
4. Conditionally render `ProjectHeader` and `TabBar`:
   - When `hideChrome` is `true`: omit both components; apply full-height flex container class `flex h-[100dvh] flex-col` to the section wrapper.
   - When `hideChrome` is `false`: render both components; use the existing layout classes unchanged.
5. The change must be purely conditional — no existing layout classes or component props should change for non-chat or desktop paths.
6. Provide a `matchMedia` polyfill in the frontend test setup file (`packages/frontend/src/test/setup.ts`) if not already present, so `useMediaQuery` can be tested.

## Dependencies
- `packages/frontend/src/pages/ProjectPage.tsx` (or equivalent) — file to modify
- `packages/frontend/src/components/ProjectHeader.tsx` — conditionally rendered
- `packages/frontend/src/components/TabBar.tsx` (or equivalent) — conditionally rendered
- `packages/frontend/src/test/setup.ts` — may need `window.matchMedia` polyfill
- Task 5 (`ChatSessionProvider`) must be mounted before this is tested end-to-end, but the layout tests can run independently

## Implementation Approach
1. Check if a `useMediaQuery` hook already exists in the frontend. If not, create `packages/frontend/src/hooks/useMediaQuery.ts` with a `window.matchMedia` + event listener implementation.
2. In the test setup file, add a `window.matchMedia` polyfill that allows tests to control the matched state.
3. Open `ProjectPage.tsx`, identify where `ProjectHeader` and `TabBar` are rendered, read the current layout class.
4. Import `useMediaQuery` and compute `hideChrome`.
5. Wrap `ProjectHeader` and `TabBar` in `{!hideChrome && ...}` guards and adjust the section wrapper class.
6. Write render tests in `packages/frontend/src/pages/ProjectPage.test.tsx` (`.test.tsx` extension required):
   - Mobile viewport + `tab=chat` → `ProjectHeader` and `TabBar` absent from DOM
   - Mobile viewport + `tab=loops` → `ProjectHeader` and `TabBar` present
   - Desktop viewport + `tab=chat` → `ProjectHeader` and `TabBar` present
7. Run `npm test -w @ralph-ui/frontend` — all tests must pass.

## Acceptance Criteria

1. **Mobile Chat: Chrome Hidden**
   - Given a mobile viewport (`max-width: 767px`) is simulated and the active tab is `chat`
   - When `ProjectPage` renders
   - Then `ProjectHeader` and `TabBar` are not present in the DOM

2. **Mobile Non-Chat: Chrome Visible**
   - Given a mobile viewport and the active tab is `loops` (or any non-chat tab)
   - When `ProjectPage` renders
   - Then `ProjectHeader` and `TabBar` are present in the DOM

3. **Desktop Chat: Chrome Visible**
   - Given a desktop viewport (`min-width: 768px`) and the active tab is `chat`
   - When `ProjectPage` renders
   - Then `ProjectHeader` and `TabBar` are present in the DOM

4. **Full-Height Container on Mobile Chat**
   - Given the mobile + chat condition is active
   - When `ProjectPage` renders
   - Then the section wrapper has `h-[100dvh]` applied

5. **No Regression on Existing Layout**
   - Given any tab other than chat on any viewport
   - When `ProjectPage` renders
   - Then existing layout classes and component rendering are unchanged from pre-task behavior

6. **Tests Pass**
   - Given all render tests run
   - When `npm test -w @ralph-ui/frontend` executes
   - Then all pass with no TypeScript errors

## Metadata
- **Complexity**: Low
- **Labels**: frontend, layout, mobile, project-page
- **Required Skills**: TypeScript, React, CSS, Vitest, React Testing Library
