#!/usr/bin/env bash
set -euo pipefail

mode="${1:-}"
pid_file=".mock-ralph-loop.pid"

if [[ "${mode}" == "--version" ]]; then
  echo "ralph 9.9.9-e2e"
  exit 0
fi

if [[ "${mode}" == "plan" || "${mode}" == "task" ]]; then
  echo "Ralph ${mode} session started"
  printf "Your input: "

  while IFS= read -r line; do
    message="$(printf '%s' "${line}" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"

    if [[ -z "${message}" ]]; then
      continue
    fi

    if [[ "${message}" == "__exit__" ]]; then
      echo "Session finished"
      exit 0
    fi

    upper="$(printf '%s' "${message}" | tr '[:lower:]' '[:upper:]')"
    echo "Assistant: ${upper}"
    printf "Your input: "
  done

  exit 0
fi

if [[ "${mode}" == "loops" ]]; then
  subcommand="${2:-}"
  if [[ "${subcommand}" == "stop" ]]; then
    if [[ -f "${pid_file}" ]]; then
      target_pid="$(<"${pid_file}")"
      if [[ -n "${target_pid}" ]] && kill -0 "${target_pid}" 2>/dev/null; then
        kill -TERM "${target_pid}" 2>/dev/null || true
      fi
    fi
    exit 0
  fi
fi

if [[ "${mode}" == "run" ]]; then
  shift || true
  prompt=""
  prompt_file="PROMPT.md"

  for arg in "$@"; do
    if [[ "${arg}" == --prompt=* ]]; then
      prompt="${arg#--prompt=}"
    elif [[ "${arg}" == "--prompt-file" ]]; then
      continue
    elif [[ "${arg}" == "--prompt-file="* ]]; then
      prompt_file="${arg#--prompt-file=}"
    fi
  done

  for ((i = 1; i <= $#; i++)); do
    if [[ "${!i}" == "--prompt-file" ]]; then
      next_index=$((i + 1))
      if [[ "${next_index}" -le "$#" ]]; then
        prompt_file="${!next_index}"
      fi
    fi
  done

  if [[ -z "${prompt}" ]] && [[ -f "${prompt_file}" ]]; then
    prompt="$(<"${prompt_file}")"
  fi

  if [[ "${prompt}" == *"complete"* ]]; then
    echo 'Event: loop.iteration - {"iteration":1,"sourceHat":"builder","tokensUsed":42}'
    echo 'Event: loop.state - {"state":"completed"}'
    exit 0
  fi

  count=0
  cleanup_pid() {
    rm -f "${pid_file}"
  }
  handle_term() {
    echo 'Event: loop.state - {"state":"stopped"}'
    cleanup_pid
    exit 0
  }

  echo "$$" >"${pid_file}"
  trap cleanup_pid EXIT
  trap handle_term TERM INT

  while true; do
    count=$((count + 1))
    echo "tick-${count}"
    echo "Event: loop.iteration - {\"iteration\":${count},\"sourceHat\":\"builder\",\"tokensUsed\":$((count * 10))}"
    sleep 0.2
  done
fi

echo "Unsupported mode: ${mode}" >&2
exit 1
