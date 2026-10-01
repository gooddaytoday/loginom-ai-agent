#!/usr/bin/env bash
# Native public + cold regressions share the acceptance lock and cleanup lifecycle.
set -euo pipefail
[[ $# -eq 3 ]] || { echo 'Usage: run-crosstable-sliding.sh <candidate-root> <width|same-count> <new-output-dir>' >&2; exit 1; }
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
exec python3 /opt/loginom-worker/diagnostic-recovery/current/scripts/node-acceptance/diagnostic-slot.py run \
 --slot "$NODE_SLOT" --resources /opt/loginom-worker/diagnostic-recovery/current/runtime/resources/loginom \
 --out "$3" -- bash "$SCRIPT_DIR/crosstable-sliding-body.sh" "$1" "$2" "$3/evidence"
