#!/usr/bin/env bash
set -euo pipefail

if [[ $(uname -s) != Linux || $# == 0 || $# -gt 2 || $1 != /* || ! -x $1 || ( $# == 2 && ( $2 != /* || ! -f $2/out/main/index.js ) ) ]]; then
  echo 'Usage: c5-sec01-linux.sh /absolute/path/to/desktop [absolute app directory for unpackaged Electron]' >&2
  exit 2
fi
for tool in bun dbus-run-session gnome-keyring-daemon secret-tool unzip xvfb-run; do
  command -v "$tool" >/dev/null || { echo "SEC-01: missing $tool" >&2; exit 2; }
done

driver=$(dirname "$(realpath "$0")")/c5-sec01-linux.mjs
root=$(mktemp -d)
trap 'rm -rf -- "$root"' EXIT
mkdir -m 700 "$root"/{home,config,data,state,cache,runtime,tmp} "$root/home/Downloads"
printf 'XDG_DOWNLOAD_DIR="$HOME/Downloads"\n' > "$root/config/user-dirs.dirs"

env -i PATH="$PATH" LANG=C.UTF-8 HOME="$root/home" TMPDIR="$root/tmp" \
  XDG_CONFIG_HOME="$root/config" XDG_DATA_HOME="$root/data" XDG_STATE_HOME="$root/state" \
  XDG_CACHE_HOME="$root/cache" XDG_RUNTIME_DIR="$root/runtime" \
  dbus-run-session -- xvfb-run -a bash -ceu '
    printf "disposable-sec01-keyring\n" | gnome-keyring-daemon --unlock --components=secrets >/dev/null
    exec timeout 420 bun "$@"
  ' sec01 "$driver" "$root" "$@"
