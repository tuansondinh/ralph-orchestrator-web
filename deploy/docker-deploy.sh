#!/usr/bin/env bash
set -euo pipefail

HOST="${1:?Usage: ./deploy/docker-deploy.sh <hostname> [ssh-key-path]}"
KEY_PATH="${2:-}"
REMOTE_USER="${REMOTE_USER:-app}"
REMOTE_HOST="${REMOTE_USER}@${HOST}"
REMOTE_DIR="${REMOTE_DIR:-/opt/ralph-orchestrator-web}"
SSH_OPTS=""

if [[ -n "$KEY_PATH" ]]; then
  SSH_OPTS="-i $KEY_PATH"
fi

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

echo "Preparing docker env on remote..."
ssh ${SSH_OPTS} "${REMOTE_HOST}" \
  "cd ${REMOTE_DIR} && if [ ! -f .env.docker ]; then cp deploy/docker.env.example .env.docker; fi"

echo "Starting docker compose deployment..."
ssh ${SSH_OPTS} "${REMOTE_HOST}" \
  "cd ${REMOTE_DIR} && docker compose up --build -d"

echo "Docker deployment finished."
echo "Next checks:"
echo "  ssh ${SSH_OPTS} ${REMOTE_HOST} 'cd ${REMOTE_DIR} && docker compose ps'"
echo "  ssh ${SSH_OPTS} ${REMOTE_HOST} 'cd ${REMOTE_DIR} && docker compose logs --tail=100'"
