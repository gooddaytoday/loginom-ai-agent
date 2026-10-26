#!/usr/bin/env bash
# Воспроизводимое измерение связности форка с upstream (OpenCode).
#
# Метрика: число путей в unmerged-состоянии после чистого пробного слияния
#   git merge --no-commit --no-ff -s ort <UPSTREAM_SHA>
# в рабочей копии форка на FORK_SHA. Определение метрики — `git diff --name-only --diff-filter=U`.
#
# Что зафиксировано и почему (проверено на git 2.43.0):
#   - SHA, а не имена веток и тегов: имена можно сдвинуть;
#   - изолированная конфигурация git (GIT_CONFIG_GLOBAL/NOSYSTEM), фиксированная личность,
#     rerere выключен: сохранённые решения конфликтов не должны занижать число;
#   - `-s ort` и merge.directoryRenames=conflict: при `true`/`false` пути «file location»
#     (6 шт.) скрываются, и метрику можно «улучшить» настройкой, а не кодом;
#   - merge.renames=false и `-X no-renames` в стратегии ort git 2.43 игнорирует
#     (на синтетическом репозитории слияние всё равно находит переименование),
#     поэтому на них метрика не опирается; версия git печатается в отчёт;
#   - предупреждение о лимите поиска переименований — отказ измерения, а не «0 конфликтов»;
#   - код возврата merge должен быть 0 или 1, а MERGE_HEAD — равен UPSTREAM_SHA;
#   - атрибуты merge= в .gitattributes форка — отказ (они могут скрыть конфликты).
#
# Использование:
#   scripts/upstream-sync/measure-conflicts.sh [--out DIR] [--repo DIR] [--compare FILE] [--keep]
# Переменные окружения (значения по умолчанию — исходная точка LAB-198):
#   FORK_URL, FORK_SHA, UPSTREAM_URL, UPSTREAM_TAG, UPSTREAM_SHA
# --repo DIR  использовать готовый клон, где уже есть оба коммита (иначе — чистый клон в $OUT/clone);
#             слияние всё равно идёт в отдельной временной рабочей копии (git worktree).
# --compare   сравнить список путей с эталоном; расхождение — код выхода 3.
set -euo pipefail

FORK_URL=${FORK_URL:-https://github.com/gooddaytoday/loginom-ai-agent.git}
FORK_SHA=${FORK_SHA:-2e6f66a92d961d3e517fb9cc63dc4b4c77039389}
UPSTREAM_URL=${UPSTREAM_URL:-https://github.com/anomalyco/opencode.git}
UPSTREAM_TAG=${UPSTREAM_TAG:-v1.19.4}
UPSTREAM_SHA=${UPSTREAM_SHA:-148842ef7cb1bc34192b3fff57d0f9721ab9c801}

OUT=./sync-measure-out
REPO=
COMPARE=
KEEP=0
while [ $# -gt 0 ]; do
  case $1 in
    --out) OUT=$2; shift 2 ;;
    --repo) REPO=$2; shift 2 ;;
    --compare) COMPARE=$2; shift 2 ;;
    --keep) KEEP=1; shift ;;
    -h|--help) sed -n '2,32p' "$0"; exit 0 ;;
    *) echo "неизвестный аргумент: $1" >&2; exit 2 ;;
  esac
done

die() { echo "ОШИБКА: $*" >&2; exit 1; }

# Изоляция от пользовательской и системной конфигурации git.
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1 GIT_TERMINAL_PROMPT=0 LC_ALL=C
export GIT_AUTHOR_NAME=sync-measure GIT_AUTHOR_EMAIL=sync-measure@example.invalid
export GIT_COMMITTER_NAME=sync-measure GIT_COMMITTER_EMAIL=sync-measure@example.invalid
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_ATTR_SOURCE

mkdir -p "$OUT"
OUT=$(cd "$OUT" && pwd)
rm -f "$OUT"/{meta.env,unmerged-paths.txt,conflicts.tsv,conflict-lines.txt,merge-output.log,summary.md,SHA256SUMS}

if [ -z "$REPO" ]; then
  REPO=$OUT/clone
  if [ ! -d "$REPO/.git" ]; then
    git clone --quiet --no-checkout "$FORK_URL" "$REPO"
  fi
  git -C "$REPO" fetch --quiet --no-tags "$UPSTREAM_URL" "refs/tags/$UPSTREAM_TAG:refs/upstream-measure/$UPSTREAM_TAG"
fi
REPO=$(cd "$REPO" && pwd)

# Оба коммита должны существовать и совпадать с заданными SHA целиком.
fork_resolved=$(git -C "$REPO" rev-parse --verify --quiet "$FORK_SHA^{commit}") || die "в $REPO нет коммита форка $FORK_SHA"
[ "$fork_resolved" = "$FORK_SHA" ] || die "FORK_SHA должен быть полным: $FORK_SHA -> $fork_resolved"
up_resolved=$(git -C "$REPO" rev-parse --verify --quiet "$UPSTREAM_SHA^{commit}") || die "в $REPO нет коммита upstream $UPSTREAM_SHA"
[ "$up_resolved" = "$UPSTREAM_SHA" ] || die "UPSTREAM_SHA должен быть полным: $UPSTREAM_SHA -> $up_resolved"
if tag_sha=$(git -C "$REPO" rev-parse --verify --quiet "refs/upstream-measure/$UPSTREAM_TAG^{commit}" 2>/dev/null); then
  [ "$tag_sha" = "$UPSTREAM_SHA" ] || die "тег $UPSTREAM_TAG указывает на $tag_sha, а ожидался $UPSTREAM_SHA"
fi
merge_base=$(git -C "$REPO" merge-base "$FORK_SHA" "$UPSTREAM_SHA") || die "нет общего предка у форка и upstream"

# Защита от «улучшения метрики»: атрибут merge= в дереве форка меняет алгоритм слияния файлов.
attr_files=$(git -C "$REPO" ls-tree -r --name-only "$FORK_SHA" | grep -E '(^|/)\.gitattributes$' || true)
for f in $attr_files; do
  if git -C "$REPO" show "$FORK_SHA:$f" | grep -Eq '(^|[[:space:]])-?merge(=|[[:space:]]|$)'; then
    die "в $f есть атрибут merge — метрика недостоверна"
  fi
done

WT=$(mktemp -d "${TMPDIR:-/tmp}/sync-measure-wt.XXXXXX")
cleanup() {
  git -C "$WT" merge --abort >/dev/null 2>&1 || true
  git -C "$REPO" worktree remove --force "$WT" >/dev/null 2>&1 || rm -rf "$WT"
  git -C "$REPO" worktree prune >/dev/null 2>&1 || true
}
if [ "$KEEP" = 0 ]; then trap cleanup EXIT; fi
rmdir "$WT"
git -C "$REPO" worktree add --quiet --detach "$WT" "$FORK_SHA"

MERGE_CFG=(-c rerere.enabled=false -c merge.directoryRenames=conflict -c merge.conflictStyle=merge
  -c merge.renameLimit=30000 -c diff.renameLimit=30000 -c merge.renormalize=false
  -c core.autocrlf=false -c core.safecrlf=false -c core.ignorecase=false -c core.fsmonitor=false
  -c core.hooksPath=/dev/null -c gc.auto=0)

set +e
git -C "$WT" "${MERGE_CFG[@]}" merge --no-commit --no-ff -s ort "$UPSTREAM_SHA" >"$OUT/merge-output.log" 2>&1
rc=$?
set -e
[ "$rc" = 0 ] || [ "$rc" = 1 ] || { cat "$OUT/merge-output.log" >&2; die "git merge вернул код $rc (ожидалось 0 или 1) — измерение недействительно"; }
git -C "$WT" rev-parse -q --verify MERGE_HEAD >"$OUT/.merge_head" || die "после merge нет MERGE_HEAD — измерение недействительно"
[ "$(cat "$OUT/.merge_head")" = "$UPSTREAM_SHA" ] || die "MERGE_HEAD не совпал с UPSTREAM_SHA"
rm -f "$OUT/.merge_head"
if grep -Eiq 'warning:.*(rename|renameLimit)' "$OUT/merge-output.log"; then
  die "git сообщил о лимите поиска переименований — результат недействителен (см. merge-output.log)"
fi

git -C "$WT" diff --name-only --diff-filter=U | sort >"$OUT/unmerged-paths.txt"
count=$(wc -l <"$OUT/unmerged-paths.txt" | tr -d ' ')
grep '^CONFLICT' "$OUT/merge-output.log" | sort >"$OUT/conflict-lines.txt" || true
conflict_lines=$(wc -l <"$OUT/conflict-lines.txt" | tr -d ' ')

# Таблица: путь, маска стадий индекса (1=база, 2=форк, 3=upstream), тип конфликта из сообщения git.
git -C "$WT" ls-files -u | awk -F'\t' '{split($1,a," "); m[$2]=m[$2] a[3]} END{for(p in m) print p "\t" m[p]}' | sort >"$OUT/.stages.tsv"
awk -F'\t' '
  FNR==NR { st[$1]=$2; next }
  { line=$0
    if (match(line, /^CONFLICT \(content\): Merge conflict in /))      { p=substr(line, RLENGTH+1); t["content"]; ty[p]=(ty[p]?ty[p]",":"") "content" }
    else if (match(line, /^CONFLICT \(modify\/delete\): /))            { p=substr(line, RLENGTH+1); sub(/ deleted in .*/, "", p); ty[p]=(ty[p]?ty[p]",":"") "modify/delete" }
    else if (match(line, /^CONFLICT \(rename\/delete\): /))            { p=substr(line, RLENGTH+1); sub(/ renamed to /, "\t", p); split(p, q, "\t"); sub(/ in HEAD.*/, "", q[2]); ty[q[2]]=(ty[q[2]]?ty[q[2]]",":"") "rename/delete" }
    else if (match(line, /^CONFLICT \(file location\): /))             { p=substr(line, RLENGTH+1); sub(/.*should perhaps be moved to /, "", p); sub(/\.$/, "", p); ty[p]=(ty[p]?ty[p]",":"") "file-location" }
    else if (match(line, /^CONFLICT \(add\/add\): Merge conflict in /)) { p=substr(line, RLENGTH+1); ty[p]=(ty[p]?ty[p]",":"") "add/add" }
    else { other[++n]=line }
  }
  END { for (p in st) printf "%s\t%s\t%s\n", p, st[p], (p in ty ? ty[p] : "unknown") }
' "$OUT/.stages.tsv" "$OUT/conflict-lines.txt" | sort >"$OUT/conflicts.tsv"
rm -f "$OUT/.stages.tsv"
unknown=$(awk -F'\t' '$3=="unknown"' "$OUT/conflicts.tsv" | wc -l | tr -d ' ')
[ "$(wc -l <"$OUT/conflicts.tsv" | tr -d ' ')" = "$count" ] || die "таблица типов ($(wc -l <"$OUT/conflicts.tsv")) не совпала с числом путей ($count)"

paths_sha=$(sha256sum "$OUT/unmerged-paths.txt" | cut -d' ' -f1)
{
  echo "fork_url=$FORK_URL"
  echo "fork_sha=$FORK_SHA"
  echo "upstream_url=$UPSTREAM_URL"
  echo "upstream_tag=$UPSTREAM_TAG"
  echo "upstream_sha=$UPSTREAM_SHA"
  echo "merge_base=$merge_base"
  echo "fork_only_commits=$(git -C "$REPO" rev-list --count "$FORK_SHA" "^$UPSTREAM_SHA")"
  echo "upstream_only_commits=$(git -C "$REPO" rev-list --count "$UPSTREAM_SHA" "^$FORK_SHA")"
  echo "git_version=$(git --version)"
  echo "merge_rc=$rc"
  echo "unmerged_paths=$count"
  echo "conflict_lines=$conflict_lines"
  echo "paths_sha256=$paths_sha"
} >"$OUT/meta.env"

{
  echo "# Измерение: пробное слияние $UPSTREAM_TAG в форк"
  echo
  echo "- форк: \`$FORK_SHA\`; upstream: \`$UPSTREAM_SHA\` ($UPSTREAM_TAG); база слияния: \`$merge_base\`"
  echo "- $(git --version); стратегия ort; merge.directoryRenames=conflict; rerere выключен"
  echo "- **unmerged-путей: $count** (строк CONFLICT: $conflict_lines; SHA-256 списка: \`$paths_sha\`)"
  echo
  echo "## По типам (из сообщений git)"
  echo
  awk -F'\t' '{n[$3]++} END{for(k in n) printf "| %s | %d |\n", k, n[k]}' "$OUT/conflicts.tsv" | sort | sed '1i | тип | путей |\n|---|---|'
  echo
  echo "## По группам путей"
  echo
  awk -F'\t' '{p=$1; g="прочее"
    if (p ~ /(^|\/)package\.json$/) g="package.json"
    else if (p == "bun.lock") g="bun.lock"
    else if (p ~ /^\.github\//) g=".github"
    else if (p ~ /^packages\/agent\/test\//) g="packages/agent/test"
    else if (p ~ /^packages\/agent\//) g="packages/agent (src, script)"
    else if (p ~ /^packages\/(console|stats)\//) { split(p,a,"/"); g="packages/" a[2] }
    else if (p ~ /^packages\//) { split(p,a,"/"); g="packages/" a[2] }
    n[g]++} END{for(k in n) printf "| %s | %d |\n", k, n[k]}' "$OUT/conflicts.tsv" | sort | sed '1i | группа | путей |\n|---|---|'
  echo
  echo "Строк CONFLICT больше числа путей на $((conflict_lines - count)): пути rename/delete порождают по две строки"
  echo "(rename/delete по старому пути и modify/delete по новому); учитывается один путь."
  if [ "$unknown" != 0 ]; then echo; echo "ВНИМАНИЕ: путей с неопознанным типом: $unknown (см. conflicts.tsv)"; fi
} >"$OUT/summary.md"

(cd "$OUT" && sha256sum meta.env unmerged-paths.txt conflicts.tsv conflict-lines.txt >SHA256SUMS)

echo "unmerged-путей: $count (строк CONFLICT: $conflict_lines); результат: $OUT"
if [ -n "$COMPARE" ]; then
  if diff -u "$COMPARE" "$OUT/unmerged-paths.txt"; then
    echo "СОВПАДЕНИЕ с эталоном $COMPARE"
  else
    echo "РАСХОЖДЕНИЕ с эталоном $COMPARE" >&2; exit 3
  fi
fi
