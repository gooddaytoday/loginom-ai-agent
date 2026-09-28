#!/usr/bin/env bash
# Сборка CLI-кандидата из worktree без install.sh.
set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "Usage: build-candidate.sh <worktree> <out>" >&2
  exit 1
fi

WORKTREE="$1"
OUT="$2"

[[ "$WORKTREE" == /* && "$OUT" == /* ]] || {
  echo "worktree and out must be absolute paths" >&2
  exit 1
}
[[ -d "$WORKTREE/packages/loginom-host" ]] || {
  echo "packages/loginom-host missing in worktree" >&2
  exit 1
}
[[ ! -e "$OUT" ]] || {
  echo "out already exists: $OUT" >&2
  exit 1
}

if [[ -z "${LOGINOM_AI_AGENT_NODE_SOURCE:-}" || -z "${LOGINOM_AI_AGENT_BROWSER_SOURCE:-}" ]]; then
  echo "LOGINOM_AI_AGENT_NODE_SOURCE and LOGINOM_AI_AGENT_BROWSER_SOURCE must be set to absolute paths" >&2
  exit 1
fi
[[ "${LOGINOM_AI_AGENT_NODE_SOURCE}" == /* && "${LOGINOM_AI_AGENT_BROWSER_SOURCE}" == /* ]] || {
  echo "LOGINOM_AI_AGENT_NODE_SOURCE and LOGINOM_AI_AGENT_BROWSER_SOURCE must be absolute" >&2
  exit 1
}

BUN_BIN="$(command -v bun || true)"
[[ -n "$BUN_BIN" ]] || { echo "bun not found" >&2; exit 1; }
BUN_VERSION="$("$BUN_BIN" --version 2>/dev/null || true)"
[[ "$BUN_VERSION" == "1.3.14" ]] || {
  echo "bun 1.3.14 required, found: ${BUN_VERSION:-unknown}" >&2
  exit 1
}

cd "$WORKTREE/packages/loginom-host"
"$BUN_BIN" script/build-cli.ts "$OUT"

BIN="$OUT/bin/loginom-ai-agent-cli"
[[ -x "$BIN" ]] || {
  echo "candidate binary missing: $BIN" >&2
  exit 1
}
printf '%s\n' "$BIN"
