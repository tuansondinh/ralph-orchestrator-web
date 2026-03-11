#!/usr/bin/env sh
set -eu

APP_HOME="${HOME:-/home/app}"
OPENCODE_CONFIG_DIR="${APP_HOME}/.config/opencode"
OPENCODE_CONFIG_PATH="${OPENCODE_CONFIG_DIR}/opencode.json"
WORKSPACE_DIR="${RALPH_UI_WORKSPACE_DIR:-/home/app/workspaces}"

mkdir -p "${OPENCODE_CONFIG_DIR}" "${WORKSPACE_DIR}"

node <<'EOF'
const fs = require('node:fs')

const templatePath = '/app/deploy/opencode.json'
const configPath = process.env.OPENCODE_CONFIG_PATH
const port = Number(process.env.PORT || 3003)
const template = JSON.parse(fs.readFileSync(templatePath, 'utf8'))

template.mcp = {
  ...(template.mcp ?? {}),
  ralph: {
    type: 'remote',
    enabled: true,
    url: `http://127.0.0.1:${port}/mcp`
  }
}

fs.writeFileSync(configPath, JSON.stringify(template, null, 2) + '\n')
EOF

node /app/packages/backend/dist/src/db/migrate.js

exec npm run start -w @ralph-ui/backend
