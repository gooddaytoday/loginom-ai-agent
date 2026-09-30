#!/usr/bin/env bash
# Сборка CLI-кандидата из worktree без install.sh.
#
# Сборка идёт не в worktree задачи, а в постоянной копии слота: $BUILD_ROOT/repo
# (по умолчанию /opt/loginom-worker/slots/$NODE_SLOT/build). Иначе `bun install` кладёт в worktree
# node_modules на 2,3 ГБ, а Paperclip копирует всю папку на хост и обратно при каждом запуске агента
# (десятки минут простоя и по 3 ГБ на диске за каждый запуск).
# В постоянной копии зависимости ставятся один раз; следующие сборки только меняют исходники.
#
# Собирается HEAD worktree. Незакоммиченные изменения переносятся, тогда кандидат получит sourceDirty=true.
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

# Значения по умолчанию для хоста. Node нужен полный дистрибутив (с lib/node_modules/npm), а не одиночный бинарник.
NODE_DEFAULT=/opt/loginom-worker/tools/node-v24.19.0-linux-x64/bin/node
BROWSERS_DEFAULT=/opt/loginom-worker/tools/cli-0.1.16/resources/loginom/browsers
if [[ -z "${LOGINOM_AI_AGENT_NODE_SOURCE:-}" && -x "$NODE_DEFAULT" ]]; then
  export LOGINOM_AI_AGENT_NODE_SOURCE="$NODE_DEFAULT"
fi
if [[ -z "${LOGINOM_AI_AGENT_BROWSER_SOURCE:-}" && -d "$BROWSERS_DEFAULT" ]]; then
  export LOGINOM_AI_AGENT_BROWSER_SOURCE="$BROWSERS_DEFAULT"
fi
if [[ -z "${LOGINOM_AI_AGENT_NODE_SOURCE:-}" || -z "${LOGINOM_AI_AGENT_BROWSER_SOURCE:-}" ]]; then
  echo "LOGINOM_AI_AGENT_NODE_SOURCE and LOGINOM_AI_AGENT_BROWSER_SOURCE must be set to absolute paths" >&2
  exit 1
fi
[[ "${LOGINOM_AI_AGENT_NODE_SOURCE}" == /* && "${LOGINOM_AI_AGENT_BROWSER_SOURCE}" == /* ]] || {
  echo "LOGINOM_AI_AGENT_NODE_SOURCE and LOGINOM_AI_AGENT_BROWSER_SOURCE must be absolute" >&2
  exit 1
}

# Закреплённый Bun хоста лежит вне PATH агента.
if ! command -v bun >/dev/null 2>&1 && [[ -x /opt/loginom-worker/.bun/bin/bun ]]; then
  export PATH="/opt/loginom-worker/.bun/bin:$PATH"
fi
BUN_BIN="$(command -v bun || true)"
[[ -n "$BUN_BIN" ]] || { echo "bun not found" >&2; exit 1; }
BUN_VERSION="$("$BUN_BIN" --version 2>/dev/null || true)"
[[ "$BUN_VERSION" == "1.3.14" ]] || {
  echo "bun 1.3.14 required, found: ${BUN_VERSION:-unknown}" >&2
  exit 1
}

BUILD_ROOT="${LOGINOM_BUILD_ROOT:-}"
if [[ -z "$BUILD_ROOT" ]]; then
  [[ -n "${NODE_SLOT:-}" ]] || {
    echo "NODE_SLOT (or LOGINOM_BUILD_ROOT) must be set: the build copy lives in the slot" >&2
    exit 1
  }
  BUILD_ROOT="/opt/loginom-worker/slots/$NODE_SLOT/build"
fi
[[ "$BUILD_ROOT" == /* ]] || { echo "LOGINOM_BUILD_ROOT must be absolute" >&2; exit 1; }
[[ "$OUT" != "$BUILD_ROOT"/* ]] || { echo "out must be outside $BUILD_ROOT" >&2; exit 1; }

mkdir -p "$BUILD_ROOT"
REPO="$BUILD_ROOT/repo"

# Одна сборка за раз в слоте: копия общая.
exec 9>"$BUILD_ROOT/.lock"
flock -w 1800 9 || { echo "another build holds $BUILD_ROOT/.lock" >&2; exit 1; }

[[ -d "$REPO/.git" ]] || git init -q "$REPO"
git -C "$REPO" fetch -q --no-tags "$WORKTREE" HEAD
git -C "$REPO" checkout -q --detach -f FETCH_HEAD
# Удаляет прежние неотслеживаемые файлы; node_modules в .gitignore и остаётся.
git -C "$REPO" clean -fdq

PATCH="$(mktemp)"
LIST="$(mktemp)"
trap 'rm -f "$PATCH" "$LIST"' EXIT
git -C "$WORKTREE" diff HEAD --binary >"$PATCH"
if [[ -s "$PATCH" ]]; then
  git -C "$REPO" apply --binary --whitespace=nowarn "$PATCH"
fi
git -C "$WORKTREE" ls-files -o --exclude-standard -z >"$LIST"
if [[ -s "$LIST" ]]; then
  tar -C "$WORKTREE" --null -T "$LIST" -cf - | tar -C "$REPO" -xf -
fi

# --ignore-scripts: установочные скрипты нативных зависимостей (tree-sitter-powershell) на хосте не собираются,
# для сборки кандидата они не нужны.
# Оборванная установка оставляет node_modules с недостающими ссылками, а повторная считает его готовым
# и сборка падает с "Could not resolve". Поэтому при сбое каталог удаляется и установка идёт заново.
if ! (cd "$REPO" && "$BUN_BIN" install --frozen-lockfile --ignore-scripts); then
  echo "bun install failed, retrying from clean node_modules" >&2
  rm -rf "$REPO/node_modules"
  (cd "$REPO" && "$BUN_BIN" install --frozen-lockfile --ignore-scripts)
fi

cd "$REPO/packages/loginom-host"
"$BUN_BIN" script/build-cli.ts "$OUT"

BIN="$OUT/bin/loginom-ai-agent-cli"
[[ -x "$BIN" ]] || {
  echo "candidate binary missing: $BIN" >&2
  exit 1
}
printf '%s\n' "$BIN"
