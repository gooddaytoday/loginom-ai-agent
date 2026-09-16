#!/bin/bash
# Use `preflight` after coordinator readback; `run` only with the Hermes slot.
set -euo pipefail
NODE12_PACKET="$(cd "$(dirname "$0")" && pwd)"
NODE12_ROOT="$(cd "$NODE12_PACKET/../../../.." && pwd)"
: "${NODE12_MANIFEST_URI:?Coordinator-verified candidate URI required}"
: "${NODE12_MANIFEST_SHA256:?Coordinator-verified candidate SHA required}"
NODE12_MODE="${1:-preflight}"
case "$NODE12_MODE" in preflight|run) ;; *) exit 2;; esac
python3 - "$NODE12_ROOT" "$NODE12_PACKET/pins.json" <<'PY'
import sys,json,hashlib
from pathlib import Path
root=Path(sys.argv[1]);pins=json.loads(Path(sys.argv[2]).read_text());sys.path.insert(0,str(root/'tools/loginom-acceptance'))
from preflight import runtime_pin
assert runtime_pin(root)==pins['runtime'],'Runtime changed'
for name,digest in pins['harness_inputs'].items():
 assert hashlib.sha256((root/'tools/loginom-acceptance'/name).read_bytes()).hexdigest()==digest,'Harness changed: '+name
PY
exec python3 "$NODE12_ROOT/tools/loginom-acceptance/run.py" "--$NODE12_MODE" \
 --output "$NODE12_ROOT/.dock/node12-acceptance-preparation-1/candidate-preflight.json" \
 --runs-root "$NODE12_ROOT/.dock/node12-autonomous/runs" \
 --node /Users/kartamyshev/.loginom-dock/releases/0.1.0-dev.20260910.3-80ca61417ec7/runtime/node \
 --browsers /Users/kartamyshev/.loginom-dock/runtime/browsers \
 --dock-config /Users/kartamyshev/.loginom-dock/config.json \
 --hermes-home /Users/kartamyshev/.hermes \
 --loginom-user test-1 --storage-directory /test-1 \
 --loginom-url 'http://logi-test-plan.bg.local/app/?testable=true' \
 --manifest-uri "$NODE12_MANIFEST_URI" --manifest-sha256 "$NODE12_MANIFEST_SHA256" \
 --model-profile chatgpt-sol --goal duplicates-node-complete \
 --timeout 3600 --max-turns 100 --require-verification
