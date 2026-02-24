---
status: completed
created: 2026-02-19
started: 2026-02-19
completed: 2026-02-19
---
# Task: Fix Preview Feature

## Description
The preview iframe does not load because the preview URL uses `127.0.0.1` (which may be blocked in iframes), the Vite dev server has no reserved fixed port, and there is no UI to configure the preview URL or command. Fix all four issues.

## Background
`DevPreviewManager` hard-codes `http://127.0.0.1:<port>` as the preview URL. Browsers and iframes often treat `127.0.0.1` differently from `localhost`. The Vite frontend server picks a random available port on each start, making it impossible to reserve a stable port for this project. The preview command detection auto-discovers `npm run dev` / `yarn dev` etc., but the user cannot override it. The `SettingsService` and `getSetting`/`setSetting` pattern already exist for storing these values.

## Reference Documentation
**Required:**
- Design: specs/lucent-builder-fixes/design.md (if created)

**Key source files:**
- `packages/backend/src/services/DevPreviewManager.ts` – preview process management
  - `normalizeUrl` (line 86): converts `0.0.0.0` → `127.0.0.1` (needs to use `localhost`)
  - `start` (line 348): builds URL as `http://127.0.0.1:${port}`
  - `isPortAvailable` (line 563): listens on `127.0.0.1`
- `packages/backend/src/app.ts` – `previewPortStart`/`previewPortEnd` settings
- `packages/backend/src/services/SettingsService.ts` – settings persistence
- `packages/backend/src/trpc/router.ts` – expose preview settings endpoints
- `packages/frontend/vite.config.ts` – Vite dev server port
- `packages/frontend/src/components/preview/ConfigurePreviewDialog.tsx` – existing config dialog

## Technical Requirements
1. Replace all occurrences of `127.0.0.1` with `localhost` in `DevPreviewManager` (URL construction and port-check listener).
2. Add a `vite.config.ts` server port setting so the frontend always starts on a fixed, reserved port (e.g., `5174` or configurable via `VITE_PORT` env var).
3. Add a user-configurable preview base URL setting: key `preview.baseUrl`, default `http://localhost`, stored via `SettingsService`. When set, use this host for constructed preview URLs instead of `localhost`.
4. Add a user-configurable preview command setting per project: key `preview.command` (e.g., `npm run dev`). If set, skip auto-detection and use the configured command.
5. Expose these settings via tRPC (`previewSettings.get`, `previewSettings.set`).
6. Surface the settings in `ConfigurePreviewDialog.tsx` so the user can edit the URL and command from the UI.
7. The `npm run dev` script must be preferred in auto-detection when both `dev` and `start` scripts exist (already the case in `parseNodeDevCommand` — verify and document).

## Dependencies
- `packages/backend/src/services/DevPreviewManager.ts`
- `packages/backend/src/app.ts` – for reading new settings on startup
- `packages/backend/src/services/SettingsService.ts`
- `packages/backend/src/trpc/router.ts`
- `packages/frontend/vite.config.ts`
- `packages/frontend/src/components/preview/ConfigurePreviewDialog.tsx`

## Implementation Approach
1. In `DevPreviewManager`:
   - Change `http://127.0.0.1:${port}` (line 348) to `http://localhost:${port}`.
   - In `normalizeUrl`, change the fallback `http://127.0.0.1:${fallbackPort}` to `http://localhost:${fallbackPort}`.
   - In `normalizeUrl`, map `127.0.0.1` → `localhost` (in addition to `0.0.0.0`).
   - In `isPortAvailable`, change the listen address from `'127.0.0.1'` to `'localhost'`.
2. In `vite.config.ts`, add `server: { port: Number(process.env.VITE_PORT ?? 5174), strictPort: true }` so Vite fails fast if the port is taken rather than picking a random one.
3. Add `preview.baseUrl` and `preview.command` to the settings schema. Read them in `DevPreviewManager.start` and use them when building the URL / selecting the command.
4. Add tRPC procedures for getting and setting preview config.
5. Update `ConfigurePreviewDialog` to show a text field for the preview URL and a text field for the custom start command.

## Acceptance Criteria

1. **Preview URL uses localhost**
   - Given a preview is started for a Node.js project
   - When the preview becomes ready
   - Then the reported URL starts with `http://localhost:` not `http://127.0.0.1:`

2. **Vite frontend starts on a fixed port**
   - Given the frontend is started with `npm run dev`
   - When the dev server initializes
   - Then it binds to port 5174 (or the configured `VITE_PORT`) and fails with a clear error if that port is already in use

3. **Preview URL is user-configurable**
   - Given the user sets `preview.baseUrl` to `http://my-machine.local` in the settings
   - When a new preview is started
   - Then the preview URL uses `http://my-machine.local:<port>`

4. **Preview command is user-configurable**
   - Given the user sets `preview.command` to `yarn dev` for a project
   - When the preview is started
   - Then the spawned process uses `yarn dev` instead of the auto-detected command

5. **Auto-detection prefers npm run dev**
   - Given a `package.json` with both `dev` and `start` scripts
   - When `detectDevCommand` is called
   - Then it returns `npm run dev` not `npm run start`

6. **Configure dialog exposes URL and command fields**
   - Given the user opens the preview configure dialog
   - When they change the URL and command fields and save
   - Then the new values are persisted and used on next preview start

7. **Unit test: normalizeUrl maps 127.0.0.1 to localhost**
   - Given `normalizeUrl` is called with `http://127.0.0.1:3001`
   - When the function runs
   - Then it returns `http://localhost:3001`

## Metadata
- **Complexity**: Medium
- **Labels**: bug, feature, preview, vite, settings, ui
- **Required Skills**: Node.js, Vite, React, tRPC, SQLite
