#!/usr/bin/env sh
set -eu

APP_HOME="${HOME:-/home/app}"
OPENCODE_CONFIG_DIR="${APP_HOME}/.config/opencode"
OPENCODE_CONFIG_PATH="${OPENCODE_CONFIG_DIR}/opencode.json"
WORKSPACE_DIR="${RALPH_UI_WORKSPACE_DIR:-/home/app/workspaces}"

mkdir -p "${OPENCODE_CONFIG_DIR}" "${WORKSPACE_DIR}"
cp /app/deploy/opencode.json "${OPENCODE_CONFIG_PATH}"

node /app/packages/backend/dist/src/db/migrate.js

exec npm run start -w @ralph-ui/backend
