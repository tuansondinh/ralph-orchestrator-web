---
status: pending
created: 2026-02-19
started: null
completed: null
---
# Task: Redesign Settings Page

## Description
Enhance the Settings page by adding an Appearance section (Light/Dark/System theme toggle + accent color picker) and upgrading the Notifications section from plain checkboxes to accessible toggle switches. Refine the overall layout to match the design's wider, more structured sections.

## Background
The current `SettingsPage` is functional but visually sparse — plain checkboxes for notifications, no appearance customization, and a tightly packed layout. The design adds a dedicated Appearance section with a segmented theme toggle (Light / Dark / System) and clickable accent color swatches, and replaces notification checkboxes with iOS-style toggle switches. The sidebar navigation shown in the design (Dashboard, Loops, Logs, Settings) is already handled by the app's existing `Sidebar` + router, so it does not need to be duplicated inside SettingsPage itself.

## Reference Documentation
**Required:**
- Design: `specs/stitch_new_project_dialog/settings_page/code.html`
- Design screenshot: `specs/stitch_new_project_dialog/settings_page/screen.png`

**Note:** Read the design file before beginning implementation. Note the segmented button pattern for the theme toggle and the ring-based accent color swatch selection pattern.

## Technical Requirements
1. **Appearance section** — insert between the Ralph Binary section and the Notifications section:
   - **Interface Theme:** segmented button group (Light / Dark / System). Active option has a highlighted background. Selecting a theme applies it immediately to `document.documentElement.classList` and persists to settings.
   - **Accent Color:** row of 5 circular color swatches (Violet `#4b2bee`, Blue, Emerald, Rose, Amber). Selected swatch shows a `ring-2` outline. Applying an accent color updates the CSS custom property `--color-primary` so it propagates through Tailwind utilities.
2. **Notifications section** — replace `<input type="checkbox">` with a custom CSS toggle switch component for "Loop Success" and "Loop Failure" events. The toggle switch must be keyboard-accessible (`role="switch"`, `aria-checked`).
3. **Section layout** — increase section spacing and use card containers (`rounded-xl`, padded panels) matching the design for Ralph Binary, Dev Preview, and Data Management sections.
4. **Theme persistence** — save the selected theme and accent color to the existing settings store/backend alongside other settings.
5. Add unit tests for: `applyTheme(theme)` function, `applyAccentColor(hex)` function, and the `ToggleSwitch` component (renders correctly, fires `onChange`, keyboard toggles with Space/Enter).

## Dependencies
- `SettingsPage` at `packages/frontend/src/pages/SettingsPage.tsx`
- Settings store or tRPC mutation for persisting settings
- Tailwind CSS config — confirm whether CSS custom properties (`--color-primary`) are usable or if a different approach is needed for dynamic accent color

## Implementation Approach
1. Read `SettingsPage.tsx` and the settings persistence mechanism.
2. Create a `ToggleSwitch` component (`components/ui/ToggleSwitch.tsx`) — pure presentational, takes `checked` + `onChange` props, fully accessible.
3. Create a `ThemeToggle` component (segmented button group) with `'light' | 'dark' | 'system'` options.
4. Create an `AccentColorPicker` component with hardcoded color options and ring-based selection state.
5. Implement `applyTheme(theme)` — updates `document.documentElement.classList` and optionally syncs with OS via `prefers-color-scheme` media query for System mode.
6. Implement `applyAccentColor(hex)` — sets `document.documentElement.style.setProperty('--color-primary', hex)`.
7. Insert the Appearance section into `SettingsPage` between Ralph Binary and Notifications.
8. Replace the two notification checkboxes with `<ToggleSwitch>` instances.
9. Update section wrappers to use the card-style layout from the design.
10. Wire theme + accent color to settings save.

## Acceptance Criteria

1. **Appearance section renders**
   - Given the Settings page is open
   - When the user scrolls to the Appearance section
   - Then a theme toggle (Light/Dark/System) and five accent color swatches are visible

2. **Theme toggle applies immediately**
   - Given the Settings page is open
   - When the user clicks "Light" in the theme toggle
   - Then the app switches to light mode immediately without a page reload

3. **System theme respects OS preference**
   - Given the user selects "System" in the theme toggle
   - When the OS is in dark mode
   - Then the app displays in dark mode; when the OS switches to light, the app follows

4. **Accent color updates primary color**
   - Given the Settings page is open
   - When the user clicks the Emerald swatch
   - Then the primary action color throughout the UI updates to Emerald

5. **Toggle switches replace checkboxes**
   - Given the Notifications section is visible
   - When inspected
   - Then "Loop Success" and "Loop Failure" use toggle switch components (not checkboxes), with correct `role="switch"` and `aria-checked` attributes

6. **Toggle switches are keyboard accessible**
   - Given a toggle switch is focused
   - When the user presses Space or Enter
   - Then the toggle state flips

7. **Settings persist on save**
   - Given the user has changed theme and accent color
   - When the user clicks "Save settings"
   - Then the new values are included in the save payload and restored on next load

8. **Unit tests for helpers and ToggleSwitch**
   - Given the `applyTheme` and `applyAccentColor` functions
   - When called with valid inputs
   - Then they update the DOM correctly; the `ToggleSwitch` component renders and responds to keyboard events as expected

## Metadata
- **Complexity**: Medium
- **Labels**: ui, settings, accessibility, frontend
- **Required Skills**: React, TypeScript, Tailwind CSS, accessibility (ARIA)
