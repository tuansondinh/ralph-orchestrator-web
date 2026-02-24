# Ralph Binary

This directory is reserved for packaging or distribution assets.

Current backend resolution order is:
1. `settings.ralphBinaryPath`
2. `RALPH_UI_RALPH_BIN`
3. `node_modules/.bin/ralph`
4. `ralph` on `PATH`

Note: `bin/ralph` is not currently auto-resolved by the backend.
