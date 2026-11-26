#!/bin/bash
# B6.2b: B3.3 on Linux. Profiles written by installed Desktop AppImages (0.3.9, 0.4.x) are taken over by the candidate CLI.
#   b62b-linux.sh <cli> <releases-dir> <work-dir> [serve|migrate]...
#   <cli>           bin/loginom-ai-agent-cli unpacked by fetch-linux.sh
#   <releases-dir>  <release>/squashfs-root of each extracted release AppImage (gh release download, --appimage-extract)
#   <work-dir>      per release: home-<release> (HOME of the profile), state-<release> (live.mjs state, reports)
# `old` runs once per release and is skipped when state-<release>/old.json exists, so a rerun on a new SHA only repeats `v2`
# (it restores the profile from state-<release>/pristine). Run as an ordinary user, never root. Needs xvfb-run and git.
# The CLI never adopts a Desktop directory, so v2 puts the old data and config into its own profile `<work>/cli-<release>` (live.mjs --profile).
# The model is the stub inside live.mjs; nothing leaves 127.0.0.1.
set -euo pipefail
cli=$(realpath "$1")
rels=$(realpath "$2")
mkdir -p "$3"
work=$(realpath "$3")
shift 3
paths=${*:-serve migrate}
here=$(cd "$(dirname "$0")/../live-profiles" && pwd)
[ "$(id -u)" -ne 0 ] || { echo "run as an ordinary user" >&2; exit 2; }
for dir in "$rels"/*/squashfs-root; do
  rel=$(basename "$(dirname "$dir")")
  home=$work/home-$rel
  state=$work/state-$rel
  node=$dir/resources/loginom/bin/node
  run() { env -i HOME="$home" PATH=/usr/bin:/bin LANG=C.UTF-8 "$node" "$here/live.mjs" "$@"; }
  mkdir -p "$home" "$state"
  if [ ! -f "$state/old.json" ]; then
    echo "== old $rel"
    run old --app "$dir/loginom-ai-agent" --label "$rel" --state "$state" 2>&1 | tee "$state/old.out"
  fi
  for path in $paths; do
    echo "== v2 $rel $path"
    run v2 --bin "$cli" --state "$state" --path "$path" --profile "$work/cli-$rel" 2>&1 | tee "$state/v2-$path.out"
  done
done
