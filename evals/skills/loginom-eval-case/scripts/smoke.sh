#!/bin/bash
# Короткий прогон без инструментов: подтверждает вход, модель и вариант профиля до прогонов кейсов.
set -u
settings="${LOGINOM_EVAL_CASE_ENV:-$HOME/.config/loginom-eval-case/env}"
# shellcheck disable=SC1090
source "$settings"
here=$(dirname "$(realpath "$0")")
work="$WORK_ROOT/smoke/$(date +%Y%m%d-%H%M%S)"
if [ -z "${MODEL:-}" ]; then
  echo "в настройках нет MODEL" >&2
  exit 2
fi
if [ -e "$PROFILE/.writer" ]; then
  echo "профиль занят: $PROFILE/.writer" >&2
  exit 3
fi
mkdir -p "$work"
variant_args=()
if [ -n "${VARIANT:-}" ]; then
  variant_args=(--variant "$VARIANT")
fi
(
  for key in $(env | awk -F= '/^(LOGINOM_|EVAL_|JUDGE_|FAKE_CODEX_)/{print $1}'); do unset "$key"; done
  export LOGINOM_AI_AGENT_CLI_PROFILE="$PROFILE"
  export LOGINOM_AI_AGENT_PURE=1
  export LOGINOM_AI_AGENT_DISABLE_PROJECT_CONFIG=1
  export LOGINOM_AI_AGENT_DISABLE_CLAUDE_CODE_PROMPT=1
  "$CLI" run --headless --format json --model "$MODEL" ${variant_args[@]+"${variant_args[@]}"} --dir "$work" \
    -- "Ответь ровно строкой CLI_MODEL_OK и не вызывай инструменты." > "$work/events.jsonl" 2> "$work/stderr.txt"
  echo $? > "$work/exit-code"
)
echo "exit=$(cat "$work/exit-code") work=$work"
bun "$here/summarize_attempt.ts" "$work"
