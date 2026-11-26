#!/bin/bash
# B6.2b: SEC-01 at the B4.14a level on Linux: the safeStorage codec (loginom-host credentials.ts) in Electron 44, three modes of
# test/loginom/safe-storage-smoke.cjs, run by an ordinary user, as the "Desktop safeStorage smoke" step of loginom-linux.yml does.
#   b62b-sec01-linux.sh <work-dir>      run from the repo root of the candidate SHA, as root only to copy Electron: see below
# Electron is the one the Desktop package pins (node packages/desktop/node_modules/electron/install.js); the script copies it
# to <work-dir>/electron. The CI artifact's own safe-storage-*.json (loginom-linux-x64-desktop) is compared byte for byte
# apart from "pid".
set -euo pipefail
work=$(realpath "$1")
repo=$(pwd)
mkdir -p "$work/ev" "$work/prof"
bun build packages/loginom-host/src/connection/credentials.ts --target=node --format=cjs --outfile="$work/credentials.cjs" >/dev/null
[ -x "$work/electron/electron" ] || cp -a packages/desktop/node_modules/electron/dist "$work/electron"
cp packages/desktop/test/loginom/safe-storage-smoke.cjs "$work/"
for mode in write read unavailable; do
  data=$work/credentials.json
  [ "$mode" = unavailable ] && data=$work/must-not-exist.json
  env -i HOME="$work/home" PATH=/usr/bin:/bin \
    LOGINOM_SAFE_STORAGE_MODE="$mode" LOGINOM_SAFE_STORAGE_DATA="$data" \
    LOGINOM_SAFE_STORAGE_EVIDENCE="$work/ev/safe-storage-$mode.json" LOGINOM_SAFE_STORAGE_CODEC="$work/credentials.cjs" \
    LOGINOM_SAFE_STORAGE_PROFILE="$work/prof" \
    timeout 60 xvfb-run -a "$work/electron/electron" --no-sandbox "$work/safe-storage-smoke.cjs" 2>/dev/null
  cat "$work/ev/safe-storage-$mode.json"; echo
done
[ ! -e "$work/must-not-exist.json" ] && echo "must-not-exist.json: absent"
