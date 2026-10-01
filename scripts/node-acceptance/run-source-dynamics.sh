#!/usr/bin/env bash
set -euo pipefail
[[ $# -eq 2 ]] || { echo 'Usage: run-source-dynamics.sh <candidate-root> <new-output-dir>' >&2; exit 1; }
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
exec python3 /opt/loginom-worker/diagnostic-recovery/current/scripts/node-acceptance/diagnostic-slot.py run \
 --slot "$NODE_SLOT" --resources /opt/loginom-worker/diagnostic-recovery/current/runtime/resources/loginom \
 --out "$2" -- bash "$SCRIPT_DIR/source-dynamics-body.sh" "$1" source "$2/evidence"
