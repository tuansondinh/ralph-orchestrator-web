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

echo "Building workspace..."
npm run build

echo "Syncing repository to ${REMOTE_HOST}:${REMOTE_DIR}..."
rsync -avz --delete \
  --exclude node_modules \
  --exclude .git \
  --exclude .env \
  --exclude '.env.*' \
  --exclude specs \
  -e "ssh ${SSH_OPTS}" \
  ./ "${REMOTE_HOST}:${REMOTE_DIR}/"

echo "Installing production dependencies on remote..."
ssh ${SSH_OPTS} "${REMOTE_HOST}" \
  "cd ${REMOTE_DIR} && npm ci --omit=dev"

echo "Installing systemd unit on remote..."
ssh ${SSH_OPTS} "${REMOTE_HOST}" \
  "sudo install -m 0644 ${REMOTE_DIR}/deploy/ralph-orchestrator.service /etc/systemd/system/ralph-orchestrator.service && sudo systemctl daemon-reload"

echo "Running cloud migrations..."
ssh ${SSH_OPTS} "${REMOTE_HOST}" \
  "cd ${REMOTE_DIR} && npm run db:migrate:cloud -w @ralph-ui/backend"

echo "Enabling and restarting service..."
ssh ${SSH_OPTS} "${REMOTE_HOST}" \
  "sudo systemctl enable ralph-orchestrator && sudo systemctl restart ralph-orchestrator"

echo "Deployment finished."
echo "Next checks:"
echo "  ssh ${SSH_OPTS} ${REMOTE_HOST} 'sudo systemctl status ralph-orchestrator --no-pager'"
echo "  ssh ${SSH_OPTS} ${REMOTE_HOST} 'sudo journalctl -u ralph-orchestrator -n 100 --no-pager'"
