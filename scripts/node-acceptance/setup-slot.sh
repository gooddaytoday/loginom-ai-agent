#!/usr/bin/env bash
# Готовит слот на хосте (запуск от loginom-worker): каталоги, дисплей, профиль CLI.
# Запись слота в accounts.json приходит через stdin (JSON: {"api_key": ..., "slots": {"c": {...}}}).
# Секреты не печатаются.
set -euo pipefail

usage() {
  echo "Usage: setup-slot.sh --slot <a-z> [--accounts-stdin]" >&2
  exit 1
}

SLOT=""
FROM_STDIN=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --slot) SLOT="${2:-}"; shift 2 ;;
    --accounts-stdin) FROM_STDIN=true; shift ;;
    -h|--help) usage ;;
    *) usage ;;
  esac
done
[[ "$SLOT" =~ ^[a-z]$ ]] || usage

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ACCOUNTS="/opt/loginom-worker/slots/accounts.json"
[[ "$(id -un)" == "loginom-worker" ]] || { echo "запускать от loginom-worker" >&2; exit 1; }

if [[ "$FROM_STDIN" == "true" ]]; then
  umask 077
  # stdin занят текстом скрипта Python, поэтому JSON передаём через окружение.
  INCOMING_JSON="$(cat)"
  export INCOMING_JSON
  python3 - "$ACCOUNTS" "$SLOT" <<'PY'
import json, os, sys
path, slot = sys.argv[1:]
incoming = json.loads(os.environ["INCOMING_JSON"])
current = json.load(open(path, encoding="utf-8")) if os.path.exists(path) else {"slots": {}}
# Общие поля берём из входа, слот — только запрошенный.
for key, value in incoming.items():
    if key != "slots":
        current[key] = value
current.setdefault("slots", {})[slot] = incoming["slots"][slot]
with open(path, "w", encoding="utf-8") as fh:
    json.dump(current, fh)
os.chmod(path, 0o600)
PY
fi

exec python3 "$SCRIPT_DIR/init-slot-profile.py" --slot "$SLOT"
