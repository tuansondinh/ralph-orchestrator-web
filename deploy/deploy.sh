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

echo "Ensuring expect is installed..."
ssh ${SSH_OPTS} "${REMOTE_HOST}" \
  "command -v expect >/dev/null 2>&1 || (echo 'expect not present; continuing with script(1) PTY fallback if available' >&2; true)"

echo "Installing opencode config..."
ssh ${SSH_OPTS} "${REMOTE_HOST}" \
  "mkdir -p ~/.config/opencode && cp ${REMOTE_DIR}/deploy/opencode.json ~/.config/opencode/opencode.json"

echo "Updating runtime environment defaults..."
ssh ${SSH_OPTS} "${REMOTE_HOST}" "REMOTE_DIR='${REMOTE_DIR}' python3 -" <<'PY'
from pathlib import Path
import os

remote_dir = os.environ["REMOTE_DIR"]
path = Path(remote_dir) / ".env"
text = path.read_text() if path.exists() else ""
lines = text.splitlines()
updates = {
    "PATH": "/home/app/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
    "RALPH_UI_RALPH_BIN": f"{remote_dir}/node_modules/.bin/ralph",
}
seen = set()
out = []

for line in lines:
    replaced = False
    for key, value in updates.items():
        if line.startswith(f"{key}="):
            out.append(f"{key}={value}")
            seen.add(key)
            replaced = True
            break
    if not replaced:
        out.append(line)

for key, value in updates.items():
    if key not in seen:
        out.append(f"{key}={value}")

path.write_text("\n".join(out) + "\n")
print("updated")
PY

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
