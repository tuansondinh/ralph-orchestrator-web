#!/usr/bin/env bash
set -euo pipefail

HOST="${1:?Usage: ./deploy/deploy.sh <ec2-hostname> [ssh-key-path]}"
KEY_PATH="${2:-}"
REMOTE_USER="${REMOTE_USER:-app}"
REMOTE_HOST="${REMOTE_USER}@${HOST}"
REMOTE_DIR="${REMOTE_DIR:-/opt/ralph-orchestrator-web}"
SSH_OPTS=""

if [[ -n "$KEY_PATH" ]]; then
  SSH_OPTS="-i $KEY_PATH"
fi

echo "Building workspace (cloud mode)..."
npm run build:cloud

echo "Syncing repository to ${REMOTE_HOST}:${REMOTE_DIR}..."
rsync -avz --delete \
  --exclude node_modules \
  --exclude .git \
  --exclude .env \
  --exclude '.env.*' \
  --exclude specs \
  --exclude .worktrees \
  --exclude .ralph \
  --exclude .ralph-ui \
  --exclude .planning \
  --exclude .playwright-mcp \
  --exclude .claude \
  --exclude '*.log' \
  --exclude '*.txt' \
  --exclude '*.md' \
  --exclude .DS_Store \
  --exclude .flow \
  -e "ssh ${SSH_OPTS}" \
  ./ "${REMOTE_HOST}:${REMOTE_DIR}/"

echo "Installing production dependencies and ralph CLI on remote..."
ssh ${SSH_OPTS} "${REMOTE_HOST}" \
  "cd ${REMOTE_DIR} && npm ci --omit=dev && npm install @ralph-orchestrator/ralph-cli"

echo "Configuring npm user prefix for remote app user..."
ssh ${SSH_OPTS} "${REMOTE_HOST}" \
  "mkdir -p ~/.local && npm config set prefix ~/.local"

echo "Ensuring Gemini CLI is installed..."
ssh ${SSH_OPTS} "${REMOTE_HOST}" \
  "command -v gemini >/dev/null 2>&1 || npm install -g @google/gemini-cli@latest"

echo "Ensuring opencode CLI is installed..."
ssh ${SSH_OPTS} "${REMOTE_HOST}" \
  "command -v opencode >/dev/null 2>&1 || sudo npm install -g opencode-ai"

echo "Installing opencode config..."
ssh ${SSH_OPTS} "${REMOTE_HOST}" \
  "mkdir -p ~/.config/opencode && cp ${REMOTE_DIR}/deploy/opencode.json ~/.config/opencode/opencode.json"

echo "Updating runtime environment defaults..."
ssh ${SSH_OPTS} "${REMOTE_HOST}" \
  "python3 - <<'PY'\nfrom pathlib import Path\npath = Path('${REMOTE_DIR}/.env')\ntext = path.read_text() if path.exists() else ''\nlines = text.splitlines()\nupdates = {\n  'PATH': '/home/app/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',\n  'RALPH_UI_RALPH_BIN': '${REMOTE_DIR}/node_modules/.bin/ralph',\n  'RALPH_UI_DEFAULT_BACKEND': 'opencode',\n}\nseen = set()\nout = []\nfor line in lines:\n  replaced = False\n  for key, value in updates.items():\n    if line.startswith(key + '='):\n      out.append(f'{key}={value}')\n      seen.add(key)\n      replaced = True\n      break\n  if not replaced:\n    out.append(line)\nfor key, value in updates.items():\n  if key not in seen:\n    out.append(f'{key}={value}')\npath.write_text('\\n'.join(out) + '\\n')\nprint('updated')\nPY"

echo "Installing systemd unit on remote..."
ssh ${SSH_OPTS} "${REMOTE_HOST}" \
  "sudo install -m 0644 ${REMOTE_DIR}/deploy/ralph-orchestrator.service /etc/systemd/system/ralph-orchestrator.service && sudo systemctl daemon-reload"

echo "Running cloud migrations..."
ssh ${SSH_OPTS} "${REMOTE_HOST}" \
  "cd ${REMOTE_DIR}/packages/backend && npm run db:migrate:cloud"

echo "Enabling and restarting service..."
ssh ${SSH_OPTS} "${REMOTE_HOST}" \
  "sudo systemctl enable ralph-orchestrator && sudo systemctl restart ralph-orchestrator"

echo "Deployment finished."
echo "Next checks:"
echo "  ssh ${SSH_OPTS} ${REMOTE_HOST} 'sudo systemctl status ralph-orchestrator --no-pager'"
echo "  ssh ${SSH_OPTS} ${REMOTE_HOST} 'sudo journalctl -u ralph-orchestrator -n 100 --no-pager'"
