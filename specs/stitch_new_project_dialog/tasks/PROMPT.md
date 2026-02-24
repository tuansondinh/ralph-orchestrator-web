# Objective

Implement UI redesigns for the lucent-builder frontend based on the Stitch design specs. Each task targets a specific component; implement them in order so earlier tasks inform later ones.

# Spec Directory

All design references are in: `specs/stitch_new_project_dialog/`
- HTML mockups: `*/code.html` files contain authoritative colors, layout, and class names
- Screenshots: `*/screen.png` files for visual reference

# Execution Order

1. `task-01-redesign-new-project-dialog.code-task.md` — Low complexity, self-contained dialog
2. `task-02-redesign-start-loop-dialog.code-task.md` — Medium, converts inline panel to modal
3. `task-05-enhance-preview-error-state.code-task.md` — Medium, new toolbar + error card
4. `task-04-redesign-settings-page.code-task.md` — Medium, new Appearance section + toggle switches
5. `task-03-enhance-loop-detail-view.code-task.md` — High, split-panel layout with sidebar

# Key Files

- `packages/frontend/src/components/project/NewProjectDialog.tsx`
- `packages/frontend/src/components/loops/StartLoopDialog.tsx`
- `packages/frontend/src/components/preview/PreviewView.tsx`
- `packages/frontend/src/pages/SettingsPage.tsx`
- `packages/frontend/src/components/loops/LoopDetail.tsx`

# Constraints

- Stack: React 19, Vite, Tailwind CSS 4, TypeScript, Zustand, tRPC
- No new UI libraries — use Tailwind utilities only
- Dark mode is forced via `document.documentElement.classList` (class strategy)
- Design uses deep purple palette: background `#131022`, primary `#4b2bee`; existing app uses zinc — update components being touched but do not globally refactor unrelated components
- Each task must include unit tests for its pure helper functions and key components
- Do not break existing functionality — all current form submission logic must remain intact

# Acceptance

Each task is complete when:
1. The component visually matches the referenced design (approximately — no pixel-perfect requirement)
2. All existing behavior is preserved
3. Unit tests pass for the new logic added in that task
