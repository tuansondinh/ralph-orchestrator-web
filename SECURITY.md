# Security Notes

## Threat Model

This project is intentionally designed for **trusted environments** (local-first).

- No user authentication is implemented.
- Backend defaults to loopback bind (`127.0.0.1`) in non-production mode.
- SQLite is used for local state storage.

This is acceptable only when the backend is not exposed to untrusted networks.

## Default Network Behavior

- `RALPH_UI_BIND_HOST` defaults to `127.0.0.1` in non-production mode and `0.0.0.0` in production mode.
- CORS and WebSocket origin checks allow loopback origins by default.
- Additional allowed origins can be configured via `RALPH_UI_ALLOWED_ORIGINS`.

## Remote Safety Guard

When bind host is non-loopback, the backend blocks high-risk endpoints by default:

- `terminal.*`
- `ralph.*` (process list/kill APIs)
- `settings.clearData`
- `settings.testBinary`

Override (unsafe): `RALPH_UI_ALLOW_REMOTE_UNSAFE_OPS=1`

## Important Non-Loopback Caveats

Even with the guard above, some operations can still be risky if you expose the backend:

- `loop.start` (can run Ralph loops/processes)
- `settings.update` and `previewSettings.set` (can change executable command paths/settings)
- `project.create` (can create/access directories based on requested paths)

If you plan any non-local deployment, add authentication/authorization and tighten route access.

## Reporting

If you find a security issue, open a private report or issue with:

- reproduction steps
- affected endpoints/files
- impact assessment
- suggested remediation
