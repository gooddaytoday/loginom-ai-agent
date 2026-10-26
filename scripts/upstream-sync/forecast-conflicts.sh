#!/usr/bin/env bash
# Прогноз числа конфликтов: для каждой комбинации классов механических переименований строит
# контрфактический коммит (counterfactual-names.py) и измеряет на нём то же пробное слияние
# (measure-conflicts.sh). Это нижняя оценка для одной дельты upstream, а не обещание для всех будущих.
#
# Использование:
#   forecast-conflicts.sh --repo DIR [--out DIR] [--fork SHA] [--upstream SHA] [--base SHA]
# DIR — клон, где уже есть FORK_SHA и UPSTREAM_SHA (например, клон из measure-conflicts.sh).
# Результат: $OUT/forecast.md и подкаталоги с полным выводом измерения для каждой комбинации.
set -euo pipefail

HERE=$(cd "$(dirname "$0")" && pwd)
FORK_SHA=${FORK_SHA:-2e6f66a92d961d3e517fb9cc63dc4b4c77039389}
UPSTREAM_SHA=${UPSTREAM_SHA:-148842ef7cb1bc34192b3fff57d0f9721ab9c801}
BASE_SHA=
REPO=
OUT=./sync-forecast-out
while [ $# -gt 0 ]; do
  case $1 in
    --repo) REPO=$2; shift 2 ;;
    --out) OUT=$2; shift 2 ;;
    --fork) FORK_SHA=$2; shift 2 ;;
    --upstream) UPSTREAM_SHA=$2; shift 2 ;;
    --base) BASE_SHA=$2; shift 2 ;;
    *) echo "неизвестный аргумент: $1" >&2; exit 2 ;;
  esac
done
[ -n "$REPO" ] || { echo "нужен --repo" >&2; exit 2; }
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1
[ -n "$BASE_SHA" ] || BASE_SHA=$(git -C "$REPO" merge-base "$FORK_SHA" "$UPSTREAM_SHA")
mkdir -p "$OUT"
OUT=$(cd "$OUT" && pwd)

# имя | классы | пояснение
COMBOS=(
  "baseline||без изменений"
  "svckey|svckey|ключи сервисов Effect @opencode/X (внутреннее)"
  "scope|scope|область пакетов @opencode-ai/ (внутреннее)"
  "pkgdir|pkgdir|каталог packages/opencode (внутреннее)"
  "tier1|svckey,scope,pkgdir|все внутренние имена"
  "env|env|переменные окружения OPENCODE_* (внешнее)"
  "userfiles|userfiles|каталог и файлы конфигурации/данных пользователя (внешнее)"
  "tier1+env|svckey,scope,pkgdir,env|внутренние + переменные окружения"
  "tier1+userfiles|svckey,scope,pkgdir,userfiles|внутренние + файлы пользователя"
  "tier2|svckey,scope,pkgdir,env,userfiles|внутренние + внешние имена (нужен адаптер идентичности)"
)

{
  echo "# Прогноз числа конфликтов по классам переименований"
  echo
  echo "- форк \`$FORK_SHA\`, upstream \`$UPSTREAM_SHA\`, база \`$BASE_SHA\`; $(git --version)"
  echo
  echo "| комбинация | классы | unmerged-путей | пояснение |"
  echo "|---|---|---|---|"
} >"$OUT/forecast.md"

for row in "${COMBOS[@]}"; do
  IFS='|' read -r name classes note <<<"$row"
  dir=$OUT/$(echo "$name" | tr '+' '_')
  sha=$FORK_SHA
  if [ -n "$classes" ]; then
    mkdir -p "$dir"
    sha=$(python3 -I "$HERE/counterfactual-names.py" --repo "$REPO" --base "$BASE_SHA" --fork "$FORK_SHA" \
      --upstream "$UPSTREAM_SHA" --classes "$classes" --report "$dir/build-report.json" 2>/dev/null)
  fi
  line=$(FORK_SHA=$sha UPSTREAM_SHA=$UPSTREAM_SHA "$HERE/measure-conflicts.sh" --repo "$REPO" --out "$dir" | head -1)
  count=$(sed -E 's/^unmerged-путей: ([0-9]+).*/\1/' <<<"$line")
  echo "| $name | ${classes:-—} | $count | $note |" >>"$OUT/forecast.md"
  echo "$name: $count"
done
echo "таблица: $OUT/forecast.md"
