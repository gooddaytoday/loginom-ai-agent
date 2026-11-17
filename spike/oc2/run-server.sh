#!/bin/sh
# Starts the OpenCode v2.3.0 sandbox server with isolated XDG dirs under .run/<name>.
# Usage: run-server.sh <name> <port> [extra env assignments...]
set -eu
here=$(cd "$(dirname "$0")" && pwd)
name=$1
port=$2
shift 2
run="$here/.run/$name"
mkdir -p "$run/home"
cd "$here/opencode/packages/cli"
exec env HOME="$run/home" XDG_DATA_HOME="$run/data" XDG_CONFIG_HOME="$run/config" XDG_STATE_HOME="$run/state" \
  XDG_CACHE_HOME="$run/cache" OPENCODE_SERVER_PASSWORD=spike OPENCODE_DISABLE_MODELS_FETCH=1 "$@" \
  bun run src/index.ts serve --port "$port"
