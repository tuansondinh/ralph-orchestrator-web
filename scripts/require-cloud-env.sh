#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
BACKEND_ENV="$ROOT_DIR/.env.cloud"
FRONTEND_ENV="$ROOT_DIR/packages/frontend/.env.cloud"

if [[ ! -f "$BACKEND_ENV" ]]; then
  echo "Missing $BACKEND_ENV"
  exit 1
fi

if [[ ! -f "$FRONTEND_ENV" ]]; then
  echo "Missing $FRONTEND_ENV"
  exit 1
fi

set -a
. "$BACKEND_ENV"
. "$FRONTEND_ENV"
set +a

missing=()

for key in SUPABASE_URL SUPABASE_ANON_KEY SUPABASE_DB_URL VITE_SUPABASE_URL VITE_SUPABASE_ANON_KEY; do
  value="${!key:-}"
  if [[ -z "$value" || "$value" == *FILL_ME_* ]]; then
    missing+=("$key")
  fi
done

if [[ ${#missing[@]} -gt 0 ]]; then
  echo "Cloud environment is incomplete. Fill these values before running dev:cloud:"
  printf ' - %s\n' "${missing[@]}"
  exit 1
fi
