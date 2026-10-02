#!/usr/bin/env bash
# Приёмка одного узла в слоте (одна латинская буква a-z) через headed CLI в квалифицированном bwrap.
set -euo pipefail

usage() {
  echo "Usage: accept-node.sh --node <slug> --slot <a-z> --cli <absolute loginom-ai-agent-cli> --out <absolute directory>" >&2
  exit 1
}

NODE=""
SLOT=""
CLI=""
OUT=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --node) NODE="${2:-}"; shift 2 ;;
    --slot) SLOT="${2:-}"; shift 2 ;;
    --cli) CLI="${2:-}"; shift 2 ;;
    --out) OUT="${2:-}"; shift 2 ;;
    -h|--help) usage ;;
    *) usage ;;
  esac
done

[[ -n "$NODE" && -n "$SLOT" && -n "$CLI" && -n "$OUT" ]] || usage
[[ "$SLOT" =~ ^[a-z]$ ]] || { echo "slot must be a single letter a-z" >&2; exit 1; }
[[ "$CLI" == /* && "$OUT" == /* ]] || { echo "--cli and --out must be absolute" >&2; exit 1; }

# Запуск из среды агента может унаследовать пустой OPENAI_BASE_URL: провайдер склеивает из него некорректный адрес
# /responses, и CLI падает до первого действия. Пустое значение убираем; заданное не трогаем.
if [[ -z "${OPENAI_BASE_URL:-}" ]]; then
  unset OPENAI_BASE_URL
fi
[[ -x "$CLI" ]] || { echo "CLI is not executable: $CLI" >&2; exit 1; }
[[ ! -e "$OUT" ]] || { echo "out already exists: $OUT" >&2; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ACCEPTANCE_DIR="$REPO_ROOT/docs/node-development/nodes/$NODE/acceptance"
TASK_MD="$ACCEPTANCE_DIR/task.md"
EXPECTED_JSON="$ACCEPTANCE_DIR/expected.json"
DATA_DIR="$ACCEPTANCE_DIR/data"
[[ -f "$TASK_MD" && -f "$EXPECTED_JSON" && -d "$DATA_DIR" ]] || {
  echo "missing acceptance inputs under $ACCEPTANCE_DIR" >&2
  exit 1
}

SLOT_ROOT="/opt/loginom-worker/slots/$SLOT"
PROFILE="$SLOT_ROOT/profile"
ATTEMPTS="$SLOT_ROOT/attempts"
LOCK_DIR="$ATTEMPTS/.lock"
CONNECTION_JSON="$PROFILE/loginom/connection/connection.json"
HARNESS_ROOT="/opt/loginom-worker/cli-v017-20260926"
BWRAP="/usr/local/libexec/loginom-swarm/bwrap"
HEADED_ENTRY="$HARNESS_ROOT/headed-entry.py"
MODEL="openai/gpt-6-sol"
# Дисплей слота: a=11, b=12, c=13 и так далее.
SLOT_ORD="$(printf '%d' "'$SLOT")"
DISPLAY_NUM=$((11 + SLOT_ORD - 97))

STALE_LOCK_CLEARED=false
LOCK_OWNED=false
RESULT_STATUS="FAIL"
TIMED_OUT=false
CLI_EXIT=""
CLI_VERSION="unknown"
SOURCE_SHA="unknown"
STARTED_EPOCH="$(date +%s)"
CLI_STARTED_EPOCH=""
CLI_FINISHED_EPOCH=""
ORACLE_STARTED_EPOCH=""
ORACLE_FINISHED_EPOCH=""
ORACLE_STATUS="not_run"
CLEANUP_PACKAGE_CLOSED=false
CLEANUP_LOGGED_OUT=false
PACKAGE_PATH=""
CONFIG_TMP=""
RELEASE_JSON=""
SAVED_JSON=""
RAW_STDOUT=""
RAW_STDERR=""
BWRAP_PID=""

find_payload_root() {
  local current
  # Лаунчер в ~/.local/bin — симлинк на payload/bin. Манифест лежит рядом с bin.
  current="$(readlink -f "$CLI" 2>/dev/null || printf '%s\n' "$CLI")"
  current="$(cd "$(dirname "$current")" && pwd)"
  while [[ "$current" != "/" ]]; do
    if [[ -f "$current/cli-manifest.json" ]]; then
      printf '%s\n' "$current"
      return 0
    fi
    current="$(dirname "$current")"
  done
  return 1
}

release_lock() {
  if [[ "$LOCK_OWNED" == "true" && -d "$LOCK_DIR" ]]; then
    rm -f "$LOCK_DIR/pid" "$LOCK_DIR/started" 2>/dev/null || true
    rmdir "$LOCK_DIR" 2>/dev/null || true
  fi
  LOCK_OWNED=false
}

write_result() {
  local finished_epoch duration_total duration_cli duration_oracle
  finished_epoch="$(date +%s)"
  duration_total=$((finished_epoch - STARTED_EPOCH))
  duration_cli=0
  duration_oracle=0
  if [[ -n "$CLI_STARTED_EPOCH" && -n "$CLI_FINISHED_EPOCH" ]]; then
    duration_cli=$((CLI_FINISHED_EPOCH - CLI_STARTED_EPOCH))
  fi
  if [[ -n "$ORACLE_STARTED_EPOCH" && -n "$ORACLE_FINISHED_EPOCH" ]]; then
    duration_oracle=$((ORACLE_FINISHED_EPOCH - ORACLE_STARTED_EPOCH))
  fi
  if [[ -d "$OUT" ]]; then
    umask 077
    python3 - "$OUT/result.json" <<'PY'
import json, os, sys
path = sys.argv[1]
env = os.environ
result = {
  "status": env["RESULT_STATUS"],
  "node": env["NODE"],
  "slot": env["SLOT"],
  "source_sha": env["SOURCE_SHA"],
  "cli_version": env["CLI_VERSION"],
  "model": env["MODEL"],
  "timed_out": env["TIMED_OUT"] == "true",
  "stale_lock_cleared": env["STALE_LOCK_CLEARED"] == "true",
  "cli_exit": int(env["CLI_EXIT"]) if env.get("CLI_EXIT", "").lstrip("-").isdigit() else env.get("CLI_EXIT") or None,
  "package_path": env.get("PACKAGE_PATH") or None,
  "durations": {
    "total_s": int(env["DURATION_TOTAL"]),
    "cli_s": int(env["DURATION_CLI"]),
    "oracle_s": int(env["DURATION_ORACLE"]),
  },
  "oracle": {
    "status": env["ORACLE_STATUS"],
  },
  "cleanup": {
    "package_closed": env["CLEANUP_PACKAGE_CLOSED"] == "true",
    "logged_out": env["CLEANUP_LOGGED_OUT"] == "true",
  },
}
with open(path, "w", encoding="utf-8") as fh:
  json.dump(result, fh, ensure_ascii=False, indent=2)
  fh.write("\n")
os.chmod(path, 0o600)
PY
  fi
}

# Записывает канал в маркер профиля слота атомарно (права 0600). Формат и версию маркера проверяет.
set_profile_channel() {
  python3 - "$PROFILE/cli-profile.json" "$1" <<'PY'
import json, os, sys, tempfile
marker, channel = sys.argv[1:]
data = json.load(open(marker, encoding="utf-8"))
if data.get("format") != "loginom-cli" or data.get("version") != 1:
    raise SystemExit("unexpected cli-profile.json format")
data["channel"] = channel
fd, temp = tempfile.mkstemp(dir=os.path.dirname(marker))
with os.fdopen(fd, "w", encoding="utf-8") as f:
    json.dump(data, f)
    f.write("\n")
os.chmod(temp, 0o600)
os.replace(temp, marker)
PY
}

cleanup() {
  local code=$?
  # Возвращаем исходный канал профиля. Если запуск убит и сюда не дошли, следующая попытка выровняет канал заново.
  if [[ -n "${PROFILE_CHANNEL_ORIGINAL:-}" ]]; then
    set_profile_channel "$PROFILE_CHANNEL_ORIGINAL" 2>/dev/null || true
  fi
  if [[ -n "${CONFIG_TMP:-}" && -f "$CONFIG_TMP" ]]; then
    rm -f "$CONFIG_TMP"
  fi
  if [[ -n "${RELEASE_JSON:-}" && -f "$RELEASE_JSON" ]]; then
    rm -f "$RELEASE_JSON"
  fi
  if [[ -n "${BWRAP_PID:-}" ]] && kill -0 "$BWRAP_PID" 2>/dev/null; then
    kill -INT -- "-$BWRAP_PID" 2>/dev/null || kill -INT "$BWRAP_PID" 2>/dev/null || true
    sleep 2
    kill -TERM -- "-$BWRAP_PID" 2>/dev/null || kill -TERM "$BWRAP_PID" 2>/dev/null || true
  fi
  export RESULT_STATUS TIMED_OUT STALE_LOCK_CLEARED CLI_EXIT PACKAGE_PATH ORACLE_STATUS
  export CLEANUP_PACKAGE_CLOSED CLEANUP_LOGGED_OUT NODE SLOT SOURCE_SHA CLI_VERSION MODEL
  export DURATION_TOTAL=$(( $(date +%s) - STARTED_EPOCH ))
  export DURATION_CLI=0 DURATION_ORACLE=0
  if [[ -n "$CLI_STARTED_EPOCH" && -n "$CLI_FINISHED_EPOCH" ]]; then
    DURATION_CLI=$((CLI_FINISHED_EPOCH - CLI_STARTED_EPOCH))
  fi
  if [[ -n "$ORACLE_STARTED_EPOCH" && -n "$ORACLE_FINISHED_EPOCH" ]]; then
    DURATION_ORACLE=$((ORACLE_FINISHED_EPOCH - ORACLE_STARTED_EPOCH))
  fi
  export DURATION_CLI DURATION_ORACLE
  write_result || true
  release_lock
  exit "$code"
}
trap cleanup EXIT

PAYLOAD_ROOT="$(find_payload_root)" || { echo "cli-manifest.json not found above $CLI" >&2; exit 1; }
RESOURCES="$PAYLOAD_ROOT/resources/loginom"
[[ -f "$RESOURCES/resource-manifest.json" ]] || { echo "resources missing under $PAYLOAD_ROOT" >&2; exit 1; }
[[ -x "$BWRAP" && -f "$HEADED_ENTRY" ]] || { echo "qualified bwrap harness missing" >&2; exit 1; }
[[ -d "$SLOT_ROOT" && -d "$PROFILE" && -d "$ATTEMPTS" ]] || { echo "slot layout missing under $SLOT_ROOT" >&2; exit 1; }
[[ -f "$CONNECTION_JSON" ]] || { echo "connection.json missing in slot profile" >&2; exit 1; }

# Общий guard с diagnostic-slot.py сериализует замену устаревшей блокировки.
exec 9>"$ATTEMPTS/.lock-guard"
flock -x 9
# Блокировка слота: mkdir без -p.
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  if [[ -f "$LOCK_DIR/pid" ]]; then
    OLD_PID="$(cat "$LOCK_DIR/pid" 2>/dev/null || true)"
    if [[ -n "$OLD_PID" ]] && kill -0 "$OLD_PID" 2>/dev/null; then
      RESULT_STATUS="BLOCKED"
      mkdir -m 700 "$OUT"
      echo "slot locked by live pid $OLD_PID" >&2
      exit 2
    fi
    rm -rf "$LOCK_DIR"
    STALE_LOCK_CLEARED=true
    mkdir "$LOCK_DIR"
  else
    RESULT_STATUS="BLOCKED"
    mkdir -m 700 "$OUT"
    echo "slot lock exists without recoverable pid" >&2
    exit 2
  fi
fi
LOCK_OWNED=true
printf '%s\n' "$$" >"$LOCK_DIR/pid"
printf '%s\n' "$STARTED_EPOCH" >"$LOCK_DIR/started"
chmod 600 "$LOCK_DIR/pid" "$LOCK_DIR/started"
flock -u 9
exec 9>&-

# Отказ при живом CLI с тем же профилем. При неоднозначности pgrep — только lock.
PROFILE_BUSY=false
if command -v pgrep >/dev/null 2>&1 && [[ -d /proc ]]; then
  while IFS= read -r pid; do
    [[ -n "$pid" ]] || continue
    env_file="/proc/$pid/environ"
    if [[ ! -r "$env_file" ]]; then
      # Нельзя однозначно сопоставить профиль — полагаемся на lock.
      PROFILE_BUSY=false
      break
    fi
    if tr '\0' '\n' <"$env_file" | grep -Fqx "LOGINOM_AI_AGENT_CLI_PROFILE=$PROFILE"; then
      PROFILE_BUSY=true
      break
    fi
  done < <(pgrep -f 'loginom-ai-agent-cli' 2>/dev/null || true)
fi
if [[ "$PROFILE_BUSY" == "true" ]]; then
  RESULT_STATUS="BLOCKED"
  mkdir -m 700 "$OUT"
  echo "live loginom-ai-agent-cli already uses this slot profile" >&2
  exit 2
fi

mkdir -m 700 "$OUT"
WORK="$OUT/work"
mkdir -m 700 "$WORK"

# Канал профиля должен совпадать с каналом кандидата. build-candidate.sh собирает dev, а профиль слота создан
# релизным CLI (prod), и CLI с другим каналом отказывается открыть профиль (PROFILE_FORMAT_INVALID). Раньше агент
# правил маркер вручную перед каждой попыткой. На время попытки выравниваем канал здесь, после неё возвращаем.
CANDIDATE_CHANNEL="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1],encoding="utf-8")).get("metadata",{}).get("channel") or "")' "$PAYLOAD_ROOT/cli-manifest.json" 2>/dev/null || true)"
PROFILE_CHANNEL_ORIGINAL=""
if [[ -n "$CANDIDATE_CHANNEL" && -f "$PROFILE/cli-profile.json" ]]; then
  PROFILE_CHANNEL_CURRENT="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1],encoding="utf-8")).get("channel") or "")' "$PROFILE/cli-profile.json")"
  if [[ "$PROFILE_CHANNEL_CURRENT" != "$CANDIDATE_CHANNEL" ]]; then
    set_profile_channel "$CANDIDATE_CHANNEL"
    PROFILE_CHANNEL_ORIGINAL="$PROFILE_CHANNEL_CURRENT"
    echo "profile channel aligned: $PROFILE_CHANNEL_CURRENT -> $CANDIDATE_CHANNEL" >&2
  fi
fi
SLOT_USER="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1],encoding="utf-8"))["username"])' "$CONNECTION_JSON")"
# Каждая попытка пишет свой пакет: модели запрещено перезаписывать файл,
# поэтому фиксированное имя ломало бы повторную приёмку в том же слоте.
ATTEMPT_TAG="$(basename "$OUT" | tr -c 'A-Za-z0-9-' '-' | sed 's/--*/-/g; s/^-//; s/-$//')"
PACKAGE_TEMPLATE="/${SLOT_USER}/node-pipeline-${NODE}-${ATTEMPT_TAG}.lgp"
python3 - "$TASK_MD" "$WORK/task.md" "$PACKAGE_TEMPLATE" <<'PY'
import pathlib, sys
source, dest, package = sys.argv[1:]
text = pathlib.Path(source).read_text(encoding="utf-8")
if "{{PACKAGE_PATH}}" not in text:
  raise SystemExit("task.md must contain {{PACKAGE_PATH}}")
text = text.replace("{{PACKAGE_PATH}}", package)
pathlib.Path(dest).write_text(text, encoding="utf-8")
PY
EXPECTED_JSON_SLOT="$OUT/expected.json"
python3 - "$EXPECTED_JSON" "$EXPECTED_JSON_SLOT" "$PACKAGE_TEMPLATE" <<'PY'
import json, pathlib, sys
source, dest, package = sys.argv[1:]
data = json.loads(pathlib.Path(source).read_text(encoding="utf-8"))
data["package_path"] = package
pathlib.Path(dest).write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
PY
chmod 600 "$EXPECTED_JSON_SLOT"
EXPECTED_JSON="$EXPECTED_JSON_SLOT"
# expected.json в work не копируем.
shopt -s nullglob
for item in "$DATA_DIR"/*; do
  [[ -f "$item" ]] || continue
  base="$(basename "$item")"
  # README в data/ — инструкция для оператора, не вложение модели.
  [[ "$base" == README.md || "$base" == README ]] && continue
  cp "$item" "$WORK/$base"
done
shopt -u nullglob

CLI_VERSION="$("$CLI" --version 2>/dev/null | head -n 1 || true)"
[[ -n "$CLI_VERSION" ]] || CLI_VERSION="unknown"
# source_sha: sourceCommit из cli-manifest; если у payload его нет — git HEAD репозитория; иначе unknown.
SOURCE_SHA="$(python3 -c 'import json,sys; m=json.load(open(sys.argv[1],encoding="utf-8")); print(m.get("metadata",{}).get("sourceCommit") or "")' "$PAYLOAD_ROOT/cli-manifest.json" 2>/dev/null || true)"
if [[ -z "$SOURCE_SHA" ]]; then
  SOURCE_SHA="$(git -C "$REPO_ROOT" rev-parse HEAD 2>/dev/null || true)"
fi
[[ -n "$SOURCE_SHA" ]] || SOURCE_SHA="unknown"

FILE_ARGS=()
while IFS= read -r -d '' file; do
  FILE_ARGS+=(--file "$file")
done < <(find "$WORK" -maxdepth 1 -type f -print0 | sort -z)

RAW_STDOUT="$OUT/.raw-stdout"
RAW_STDERR="$OUT/.raw-stderr"
PROMPT='Выполни приложенное задание и сохрани результат в указанном новом пакете без перезаписи существующего файла.'

CLI_STARTED_EPOCH="$(date +%s)"
# Отдельная сессия процессов для адресного SIGINT/SIGTERM группы.
setsid "$BWRAP" \
  --die-with-parent \
  --new-session \
  --unshare-all \
  --share-net \
  --cap-drop ALL \
  --ro-bind /usr /usr \
  --symlink usr/bin /bin \
  --symlink usr/sbin /sbin \
  --symlink usr/lib /lib \
  --symlink usr/lib64 /lib64 \
  --proc /proc \
  --dev /dev \
  --tmpfs /tmp \
  --tmpfs /run \
  --tmpfs /dev/shm \
  --ro-bind /etc/ssl /etc/ssl \
  --ro-bind /etc/ca-certificates /etc/ca-certificates \
  --ro-bind /etc/resolv.conf /etc/resolv.conf \
  --ro-bind /etc/hosts /etc/hosts \
  --ro-bind /etc/nsswitch.conf /etc/nsswitch.conf \
  --ro-bind /etc/passwd /etc/passwd \
  --ro-bind /etc/group /etc/group \
  --ro-bind /etc/fonts /etc/fonts \
  --ro-bind /etc/alternatives/awk /etc/alternatives/awk \
  --ro-bind "$PAYLOAD_ROOT" "$PAYLOAD_ROOT" \
  --ro-bind "$HARNESS_ROOT" "$HARNESS_ROOT" \
  --bind "$SLOT_ROOT" "$SLOT_ROOT" \
  --chdir "$WORK" \
  --setenv HOME "$SLOT_ROOT" \
  --setenv TMPDIR /tmp \
  --setenv LOGINOM_AI_AGENT_CLI_PROFILE "$PROFILE" \
  --setenv LOGINOM_AI_AGENT_PURE 1 \
  --setenv LOGINOM_AI_AGENT_DISABLE_PROJECT_CONFIG 1 \
  --setenv LOGINOM_AI_AGENT_SYSTEM_PROXY off \
  /usr/bin/xvfb-run -n "$DISPLAY_NUM" -s '-screen 0 1920x1200x24 -nolisten tcp' \
  /usr/bin/python3 "$HEADED_ENTRY" \
  "$PAYLOAD_ROOT/bin/loginom-ai-agent-cli" run --no-headless --format json \
  --model "$MODEL" --variant low \
  --dir "$WORK" \
  "${FILE_ARGS[@]}" \
  -- "$PROMPT" \
  >"$RAW_STDOUT" 2>"$RAW_STDERR" &
BWRAP_PID=$!

# Лимит работы CLI с моделью: 2 часа (раньше 30 минут). Худший случай всей попытки около 2 ч 15 мин,
# поэтому у агентов-разработчиков лимит тишины Codex (outputInactivityTimeoutMs) выше и равен 150 минутам.
LIMIT_S=7200
GRACE_S=60
elapsed=0
while kill -0 "$BWRAP_PID" 2>/dev/null; do
  if (( elapsed >= LIMIT_S )); then
    TIMED_OUT=true
    kill -INT -- "-$BWRAP_PID" 2>/dev/null || kill -INT "$BWRAP_PID" 2>/dev/null || true
    grace=0
    while kill -0 "$BWRAP_PID" 2>/dev/null && (( grace < GRACE_S )); do
      sleep 1
      grace=$((grace + 1))
    done
    if kill -0 "$BWRAP_PID" 2>/dev/null; then
      kill -TERM -- "-$BWRAP_PID" 2>/dev/null || kill -TERM "$BWRAP_PID" 2>/dev/null || true
    fi
    break
  fi
  sleep 1
  elapsed=$((elapsed + 1))
done

set +e
wait "$BWRAP_PID"
CLI_EXIT=$?
set -e
BWRAP_PID=""
CLI_FINISHED_EPOCH="$(date +%s)"

# Очистка stdout/stderr перед записью evidence.
REDACT_JS="$OUT/.redact-events.mjs"
cat >"$REDACT_JS" <<'EOF'
import { readFile, writeFile } from "node:fs/promises"
import { pathToFileURL } from "node:url"

const [stdoutPath, stderrPath, eventsOut, stderrOut, redactModule] = process.argv.slice(2)
let redactor
try {
  const mod = await import(pathToFileURL(redactModule).href)
  redactor = mod.createRedactor([])
} catch {
  redactor = null
}

const stdout = await readFile(stdoutPath, "utf8")
const lines = []
for (const line of stdout.split(/\r?\n/)) {
  if (!line) continue
  if (!redactor) {
    lines.push(JSON.stringify({ type: "redaction_skip", omitted: true, reason: "redactor unavailable" }))
    continue
  }
  try {
    const event = JSON.parse(line)
    lines.push(JSON.stringify(redactor.redact(event)))
  } catch {
    try {
      lines.push(JSON.stringify({ type: "text", text: redactor.text(line) }))
    } catch {
      lines.push(JSON.stringify({ type: "redaction_skip", omitted: true, reason: "line redaction failed" }))
    }
  }
}
await writeFile(eventsOut, lines.length ? lines.join("\n") + "\n" : "", { mode: 0o600 })

const stderr = await readFile(stderrPath, "utf8")
let stderrBody = ""
if (redactor) {
  try {
    stderrBody = redactor.text(stderr)
  } catch {
    stderrBody = "[redaction_skip] stderr omitted because redaction failed\n"
  }
} else {
  stderrBody = "[redaction_skip] stderr omitted because redactor unavailable\n"
}
await writeFile(stderrOut, stderrBody, { mode: 0o600 })
EOF

REDACT_MODULE="$REPO_ROOT/packages/loginom-runtime/client/lib/redact.mjs"
NODE_BIN="${RESOURCES}/bin/node"
if [[ ! -x "$NODE_BIN" ]]; then
  NODE_BIN="$(command -v node || true)"
fi
if [[ -n "$NODE_BIN" ]]; then
  "$NODE_BIN" "$REDACT_JS" "$RAW_STDOUT" "$RAW_STDERR" "$OUT/events.jsonl" "$OUT/stderr.txt" "$REDACT_MODULE" || {
    printf '%s\n' '{"type":"redaction_skip","omitted":true,"reason":"redaction process failed"}' >"$OUT/events.jsonl"
    printf '%s\n' '[redaction_skip] stderr omitted because redaction process failed' >"$OUT/stderr.txt"
    chmod 600 "$OUT/events.jsonl" "$OUT/stderr.txt"
  }
else
  printf '%s\n' '{"type":"redaction_skip","omitted":true,"reason":"node unavailable for redaction"}' >"$OUT/events.jsonl"
  printf '%s\n' '[redaction_skip] stderr omitted because node unavailable' >"$OUT/stderr.txt"
  chmod 600 "$OUT/events.jsonl" "$OUT/stderr.txt"
fi
rm -f "$REDACT_JS" "$RAW_STDOUT" "$RAW_STDERR"

# Путь сохранённого пакета: из stdout JSON или из expected.json.
PACKAGE_PATH="$(python3 - "$OUT/events.jsonl" "$EXPECTED_JSON" "$CLI_EXIT" <<'PY'
import json, re, sys
events_path, expected_path, cli_exit = sys.argv[1], sys.argv[2], sys.argv[3]
found = []
try:
  with open(events_path, encoding="utf-8") as fh:
    for line in fh:
      line = line.strip()
      if not line or ".lgp" not in line:
        continue
      try:
        obj = json.loads(line)
      except Exception:
        obj = line
      blob = json.dumps(obj, ensure_ascii=False) if not isinstance(obj, str) else obj
      for match in re.findall(r"/[^\s\"']+\.lgp", blob):
        if match not in found:
          found.append(match)
except FileNotFoundError:
  pass
if found:
  print(found[-1])
elif cli_exit == "0":
  expected = json.load(open(expected_path, encoding="utf-8"))
  print(expected.get("package_path") or "")
PY
)"

if [[ -z "$PACKAGE_PATH" ]]; then
  ORACLE_STATUS="not_run"
  RESULT_STATUS="FAIL"
  exit 1
fi

CONFIG_TMP="$OUT/.cold-config.json"
# Временный config из connection.json слота; содержимое не печатаем.
python3 - "$CONNECTION_JSON" "$CONFIG_TMP" <<'PY'
import json, os, sys
src, dst = sys.argv[1], sys.argv[2]
conn = json.load(open(src, encoding="utf-8"))
secrets = conn.get("secrets") or {}
if secrets.get("format") != "loginom-cli-secrets-v1" or secrets.get("protection") != "plaintext":
  raise SystemExit("CONFIG_SECRETS_UNAVAILABLE")
payload = json.loads(secrets["payload"])
password = payload.get("password")
if password is None:
  raise SystemExit("CONFIG_SECRETS_UNAVAILABLE")
config = {
  "api_key": payload["apiKey"],
  "loginom_url": conn["url"],
  "workflow_profile": {
    "passwordless_login": password == "",
    "loginom_user": conn["username"],
    "password": password,
  },
}
flags = os.O_WRONLY | os.O_CREAT | os.O_TRUNC | os.O_EXCL
fd = os.open(dst, flags, 0o600)
with os.fdopen(fd, "w", encoding="utf-8") as fh:
  json.dump(config, fh, ensure_ascii=False)
  fh.write("\n")
PY

SAVED_JSON="$OUT/saved.json"
python3 -c 'import json,sys; json.dump({"path": sys.argv[1]}, open(sys.argv[2],"w",encoding="utf-8")); open(sys.argv[2],"a",encoding="utf-8").write("\n")' "$PACKAGE_PATH" "$SAVED_JSON"
chmod 600 "$SAVED_JSON"

# CLI оставляет серверную сессию с открытым пакетом, и холодное открытие видит
# «только чтение». Перед oracle закрываем только сессии этого слота.
if [[ -z "${LOGINOM_ACCOUNTS_FILE:-}" && -r /opt/loginom-worker/slots/accounts.json ]]; then
  LOGINOM_ACCOUNTS_FILE=/opt/loginom-worker/slots/accounts.json
fi
if [[ -n "${LOGINOM_ACCOUNTS_FILE:-}" ]]; then
  [[ -f "$LOGINOM_ACCOUNTS_FILE" ]] || { echo "LOGINOM_ACCOUNTS_FILE is missing" >&2; RESULT_STATUS="FAIL"; exit 1; }
  RELEASE_JSON="$OUT/.release-accounts.json"
  python3 - "$LOGINOM_ACCOUNTS_FILE" "$RELEASE_JSON" <<'PY'
import json, os, sys
src, dst = sys.argv[1], sys.argv[2]
data = json.load(open(src, encoding="utf-8"))
payload = {"url": data["url"], "admin_user": data["admin_user"], "admin_password": data["admin_password"]}
fd = os.open(dst, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
with os.fdopen(fd, "w", encoding="utf-8") as fh:
  json.dump(payload, fh, ensure_ascii=False)
  fh.write("\n")
PY
  RELEASE_DIR="$OUT/release"
  mkdir -m 700 "$RELEASE_DIR"
  set +e
  setsid "$BWRAP" \
    --die-with-parent \
    --new-session \
    --unshare-all \
    --share-net \
    --cap-drop ALL \
    --ro-bind /usr /usr \
    --symlink usr/bin /bin \
    --symlink usr/sbin /sbin \
    --symlink usr/lib /lib \
    --symlink usr/lib64 /lib64 \
    --proc /proc \
    --dev /dev \
    --tmpfs /tmp \
    --tmpfs /run \
    --tmpfs /dev/shm \
    --ro-bind /etc/ssl /etc/ssl \
    --ro-bind /etc/ca-certificates /etc/ca-certificates \
    --ro-bind /etc/resolv.conf /etc/resolv.conf \
    --ro-bind /etc/hosts /etc/hosts \
    --ro-bind /etc/nsswitch.conf /etc/nsswitch.conf \
    --ro-bind /etc/passwd /etc/passwd \
    --ro-bind /etc/group /etc/group \
    --ro-bind /etc/fonts /etc/fonts \
    --ro-bind /etc/alternatives/awk /etc/alternatives/awk \
    --ro-bind "$PAYLOAD_ROOT" "$PAYLOAD_ROOT" \
    --ro-bind "$HARNESS_ROOT" "$HARNESS_ROOT" \
    --ro-bind "$SCRIPT_DIR" "$SCRIPT_DIR" \
    --bind "$SLOT_ROOT" "$SLOT_ROOT" \
    --chdir "$RELEASE_DIR" \
    --setenv HOME "$SLOT_ROOT" \
    --setenv TMPDIR /tmp \
    --setenv LOGINOM_AI_AGENT_TEST_HEADLESS 0 \
    /usr/bin/xvfb-run -n "$DISPLAY_NUM" -s '-screen 0 1920x1200x24 -nolisten tcp' \
    /usr/bin/python3 "$HEADED_ENTRY" \
    "$RESOURCES/bin/node" "$SCRIPT_DIR/release-slot-sessions.mjs" \
    --resources "$RESOURCES" \
    --accounts "$RELEASE_JSON" \
    --slot-user "$SLOT_USER" \
    --output "$RELEASE_DIR" \
    >"$RELEASE_DIR/stdout.txt" 2>"$RELEASE_DIR/stderr.txt" &
  BWRAP_PID=$!
  release_elapsed=0
  while kill -0 "$BWRAP_PID" 2>/dev/null; do
    if (( release_elapsed >= 180 )); then
      kill -INT -- "-$BWRAP_PID" 2>/dev/null || kill -INT "$BWRAP_PID" 2>/dev/null || true
      sleep 5
      kill -TERM -- "-$BWRAP_PID" 2>/dev/null || kill -TERM "$BWRAP_PID" 2>/dev/null || true
      break
    fi
    sleep 1
    release_elapsed=$((release_elapsed + 1))
  done
  wait "$BWRAP_PID"
  RELEASE_EXIT=$?
  set -e
  BWRAP_PID=""
  rm -f "$RELEASE_JSON"
  RELEASE_JSON=""
  chmod 600 "$RELEASE_DIR/stdout.txt" "$RELEASE_DIR/stderr.txt" 2>/dev/null || true
  if [[ "$RELEASE_EXIT" -ne 0 ]]; then
    echo "slot session release failed" >&2
    RESULT_STATUS="FAIL"
    exit 1
  fi
fi

ORACLE_DIR="$OUT/oracle"
mkdir -m 700 "$ORACLE_DIR"
ORACLE_STARTED_EPOCH="$(date +%s)"
# Прямой Chromium вне квалифицированного bwrap на этом хосте не принимается.
# Oracle идёт в том же контуре, с тем же номером дисплея, после завершения CLI.
ORACLE_BINDS=()
if [[ "$SCRIPT_DIR" != "$SLOT_ROOT" && "$SCRIPT_DIR" != "$SLOT_ROOT"/* ]]; then
  ORACLE_BINDS+=(--ro-bind "$SCRIPT_DIR" "$SCRIPT_DIR")
fi
if [[ "$OUT" != "$SLOT_ROOT" && "$OUT" != "$SLOT_ROOT"/* ]]; then
  ORACLE_BINDS+=(--bind "$OUT" "$OUT")
fi
set +e
setsid "$BWRAP" \
  --die-with-parent \
  --new-session \
  --unshare-all \
  --share-net \
  --cap-drop ALL \
  --ro-bind /usr /usr \
  --symlink usr/bin /bin \
  --symlink usr/sbin /sbin \
  --symlink usr/lib /lib \
  --symlink usr/lib64 /lib64 \
  --proc /proc \
  --dev /dev \
  --tmpfs /tmp \
  --tmpfs /run \
  --tmpfs /dev/shm \
  --ro-bind /etc/ssl /etc/ssl \
  --ro-bind /etc/ca-certificates /etc/ca-certificates \
  --ro-bind /etc/resolv.conf /etc/resolv.conf \
  --ro-bind /etc/hosts /etc/hosts \
  --ro-bind /etc/nsswitch.conf /etc/nsswitch.conf \
  --ro-bind /etc/passwd /etc/passwd \
  --ro-bind /etc/group /etc/group \
  --ro-bind /etc/fonts /etc/fonts \
  --ro-bind /etc/alternatives/awk /etc/alternatives/awk \
  --ro-bind "$PAYLOAD_ROOT" "$PAYLOAD_ROOT" \
  --ro-bind "$HARNESS_ROOT" "$HARNESS_ROOT" \
  --bind "$SLOT_ROOT" "$SLOT_ROOT" \
  "${ORACLE_BINDS[@]}" \
  --chdir "$ORACLE_DIR" \
  --setenv HOME "$SLOT_ROOT" \
  --setenv TMPDIR /tmp \
  --setenv LOGINOM_AI_AGENT_TEST_HEADLESS 0 \
  /usr/bin/xvfb-run -n "$DISPLAY_NUM" -s '-screen 0 1920x1200x24 -nolisten tcp' \
  /usr/bin/python3 "$HEADED_ENTRY" \
  "$RESOURCES/bin/node" "$SCRIPT_DIR/cold-check.mjs" \
  --config "$CONFIG_TMP" \
  --resources "$RESOURCES" \
  --saved "$SAVED_JSON" \
  --expected "$EXPECTED_JSON" \
  --output "$ORACLE_DIR" \
  >"$ORACLE_DIR/stdout.txt" 2>"$ORACLE_DIR/stderr.txt" &
BWRAP_PID=$!
oracle_elapsed=0
while kill -0 "$BWRAP_PID" 2>/dev/null; do
  if (( oracle_elapsed >= 600 )); then
    kill -INT -- "-$BWRAP_PID" 2>/dev/null || kill -INT "$BWRAP_PID" 2>/dev/null || true
    sleep 5
    kill -TERM -- "-$BWRAP_PID" 2>/dev/null || kill -TERM "$BWRAP_PID" 2>/dev/null || true
    break
  fi
  sleep 1
  oracle_elapsed=$((oracle_elapsed + 1))
done
wait "$BWRAP_PID"
ORACLE_EXIT=$?
set -e
BWRAP_PID=""
chmod 600 "$ORACLE_DIR/stdout.txt" "$ORACLE_DIR/stderr.txt" 2>/dev/null || true
ORACLE_FINISHED_EPOCH="$(date +%s)"

if [[ -f "$ORACLE_DIR/result.json" ]]; then
  ORACLE_STATUS="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1],encoding="utf-8")).get("status",""))' "$ORACLE_DIR/result.json" 2>/dev/null || echo fail)"
  CLEANUP_PACKAGE_CLOSED="$(python3 -c 'import json,sys; r=json.load(open(sys.argv[1],encoding="utf-8")); c=r.get("cleanup") or {}; print("true" if c.get("package_closed") else "false")' "$ORACLE_DIR/result.json" 2>/dev/null || echo false)"
  CLEANUP_LOGGED_OUT="$(python3 -c 'import json,sys; r=json.load(open(sys.argv[1],encoding="utf-8")); c=r.get("cleanup") or {}; print("true" if c.get("logged_out") else "false")' "$ORACLE_DIR/result.json" 2>/dev/null || echo false)"
elif [[ -f "$ORACLE_DIR/cleanup.json" ]]; then
  ORACLE_STATUS="fail"
  CLEANUP_PACKAGE_CLOSED="$(python3 -c 'import json,sys; c=json.load(open(sys.argv[1],encoding="utf-8")); print("true" if c.get("package_closed") else "false")' "$ORACLE_DIR/cleanup.json" 2>/dev/null || echo false)"
  CLEANUP_LOGGED_OUT="$(python3 -c 'import json,sys; c=json.load(open(sys.argv[1],encoding="utf-8")); print("true" if c.get("logged_out") else "false")' "$ORACLE_DIR/cleanup.json" 2>/dev/null || echo false)"
else
  ORACLE_STATUS="fail"
fi

rm -f "$CONFIG_TMP"
CONFIG_TMP=""

if [[ "$TIMED_OUT" == "true" ]]; then
  RESULT_STATUS="FAIL"
elif [[ "$CLI_EXIT" -eq 0 && "$ORACLE_EXIT" -eq 0 && "$ORACLE_STATUS" == "PASS" \
  && "$CLEANUP_PACKAGE_CLOSED" == "true" && "$CLEANUP_LOGGED_OUT" == "true" ]]; then
  RESULT_STATUS="PASS"
else
  RESULT_STATUS="FAIL"
fi

# write_result вызывается из trap
exit "$([[ "$RESULT_STATUS" == "PASS" ]] && echo 0 || echo 1)"
