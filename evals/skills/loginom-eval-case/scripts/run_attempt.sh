#!/bin/bash
# Один изолированный прогон CLI для кейса. Аргументы: каталог кейса, номер попытки, необязательный файл подсказки.
set -u
settings="${LOGINOM_EVAL_CASE_ENV:-$HOME/.config/loginom-eval-case/env}"
# shellcheck disable=SC1090
source "$settings"
here=$(dirname "$(realpath "$0")")
case_dir=$(realpath "$1")
attempt=$2
hint=${3:-}
id=$(basename "$case_dir")
collection=$(basename "$(dirname "$case_dir")")
name="${collection}-${id}-${attempt}"
work="$WORK_ROOT/$collection/$id/attempt-$attempt"

if [ -z "${MODEL:-}" ]; then
  echo "в настройках нет MODEL" >&2
  exit 2
fi
if [ -e "$work/events.jsonl" ]; then
  echo "попытка уже запускалась: $work" >&2
  exit 2
fi
for writer in "$PROFILE/.writer" "$AGENT_REPO/evals/.profile/agent/.writer"; do
  if [ -e "$writer" ]; then
    echo "профиль занят: $writer" >&2
    exit 3
  fi
done
mkdir -p "$WORK_ROOT"
for dir in "$WORK_ROOT" "$PROFILE"; do
  free_kb=$(df -Pk "$dir" | awk 'NR == 2 {print $4}')
  if [ "${free_kb:-0}" -lt 1048576 ]; then
    echo "на файловой системе $dir меньше 1 GiB свободного места" >&2
    exit 2
  fi
done
if ! existing=$(docker exec "$LOGINOM_CONTAINER" find "$LOGINOM_STORAGE" -maxdepth 1 -type f -name "$name.*" -printf '%f\n'); then
  echo "не удалось прочитать хранилище $LOGINOM_CONTAINER:$LOGINOM_STORAGE" >&2
  exit 2
fi
if [ -n "$existing" ]; then
  echo "в хранилище уже есть файлы этой попытки: $existing" >&2
  exit 2
fi

mkdir -p "$work"
printf '%s\n' "$name" > "$work/name"
printf '%s\n' "$case_dir" > "$work/case"
if ! bun "$here/prepare_attempt.ts" "$AGENT_REPO" "$case_dir" "$work" "/$LOGINOM_USERNAME/$name.lgp" "$name.result.csv"; then
  exit 2
fi
if [ -n "$hint" ]; then
  printf '\n\n%s' "$(cat "$hint")" >> "$work/prompt.txt"
  cp "$hint" "$work/hint.txt"
fi

variant_args=()
if [ -n "${VARIANT:-}" ]; then
  variant_args=(--variant "$VARIANT")
fi
files=()
if [ -s "$work/files.txt" ]; then
  while IFS= read -r file || [ -n "$file" ]; do files+=(--file "$file"); done < "$work/files.txt"
fi
for key in $(env | awk -F= '/^(LOGINOM_|EVAL_|JUDGE_|FAKE_CODEX_)/{print $1}'); do unset "$key"; done
export LOGINOM_AI_AGENT_CLI_PROFILE="$PROFILE"
export LOGINOM_AI_AGENT_PURE=1
export LOGINOM_AI_AGENT_DISABLE_PROJECT_CONFIG=1
export LOGINOM_AI_AGENT_DISABLE_CLAUDE_CODE_PROMPT=1
export LOGINOM_AI_AGENT_PERMISSION='{"loginom_*":"allow","loginom_remember":"deny","loginom_write":"deny","loginom_edit":"deny","loginom_add_resource":"deny","loginom_forget":"deny"}'
date -Is > "$work/started-at"
timeout --signal=INT --kill-after=120s "$ATTEMPT_TIMEOUT_S" "$CLI" run --headless --format json \
  --model "$MODEL" ${variant_args[@]+"${variant_args[@]}"} \
  ${files[@]+"${files[@]}"} --dir "$work" \
  -- "$(cat "$work/prompt.txt")" > "$work/events.jsonl" 2> "$work/stderr.txt"
echo $? > "$work/exit-code"
date -Is > "$work/finished-at"
echo "exit=$(cat "$work/exit-code") work=$work"
