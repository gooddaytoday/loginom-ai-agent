#!/usr/bin/env bash
# Сводка по слотам на хосте (запуск от loginom-worker): готовность профиля, блокировка, последняя попытка.
# Секреты не читает и не печатает.
set -euo pipefail

cd /opt/loginom-worker
ROOT="/opt/loginom-worker/slots"
[[ -d "$ROOT" ]] || { echo "нет каталога $ROOT" >&2; exit 1; }

printf '%-5s %-14s %-9s %-10s %-26s %s\n' СЛОТ АККАУНТ ПРОФИЛЬ БЛОКИРОВКА ПОСЛЕДНЯЯ_ПОПЫТКА РЕЗУЛЬТАТ
for dir in "$ROOT"/[a-z]; do
  [[ -d "$dir" ]] || continue
  slot="$(basename "$dir")"
  user="-"
  [[ -f "$dir/profile/loginom/connection/connection.json" ]] &&
    user="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1],encoding="utf-8")).get("username","-"))' "$dir/profile/loginom/connection/connection.json" 2>/dev/null || echo "-")"
  profile="нет"
  [[ -f "$dir/profile/data/auth.json" && -f "$dir/profile/loginom/connection/connection.json" ]] && profile="готов"
  lock="свободен"
  if [[ -d "$dir/attempts/.lock" ]]; then
    pid="$(cat "$dir/attempts/.lock/pid" 2>/dev/null || true)"
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then lock="занят($pid)"; else lock="устарел"; fi
  fi
  last="-"
  result="-"
  latest="$(find "$dir/attempts" -maxdepth 2 -name result.json -printf '%T@ %p\n' 2>/dev/null | sort -nr | head -n 1 | cut -d' ' -f2- || true)"
  if [[ -n "$latest" ]]; then
    last="$(basename "$(dirname "$latest")")"
    result="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1],encoding="utf-8")).get("status","?"))' "$latest" 2>/dev/null || echo "?")"
  fi
  printf '%-5s %-14s %-9s %-10s %-26s %s\n' "$slot" "$user" "$profile" "$lock" "${last:0:26}" "$result"
done
