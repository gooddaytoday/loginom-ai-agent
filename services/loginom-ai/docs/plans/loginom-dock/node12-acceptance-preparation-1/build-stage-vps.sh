#!/bin/bash
# Coordinator only. Run on VPS after live inventory; never activate current.json.
set -euo pipefail
: "${NODE12_SOURCE:?Exact extracted source directory required}"
: "${NODE12_PACKET:?Transferred preparation directory required}"
: "${NODE12_NODE:?Verified VPS Node executable required}"
: "${NODE12_RELEASE:?New private VPS release directory required}"
: "${NODE12_ADMIN:?Verified Dock admin JSON path required}"
if [ -e "$NODE12_RELEASE" ]; then echo 'Release directory exists; stop and inspect existing pin.' >&2; exit 1; fi
python3 - "$NODE12_SOURCE" "$NODE12_PACKET/source-files.json" <<'PY'
import sys,json,hashlib
from pathlib import Path
root=Path(sys.argv[1]);m=json.loads(Path(sys.argv[2]).read_text())
for name,digest in m['files'].items():
 p=root/name
 if p.is_symlink() or hashlib.sha256(p.read_bytes()).hexdigest()!=digest:raise SystemExit('Source mismatch: '+name)
print('All committed source inputs match '+m['commit'])
PY
[ "$("$NODE12_NODE" --version)" = "v$(cat "$NODE12_SOURCE/client/.node-version")" ]
mkdir -m 700 "$NODE12_RELEASE"
"$NODE12_NODE" "$NODE12_SOURCE/deploy/loginom-dock/build-action-catalog.mjs" \
 --input "$NODE12_SOURCE/executor/catalog" --out "$NODE12_RELEASE/catalog" \
 --candidate --version 2026.09.13-node12.1-candidate --package-root /test-1/packages \
 --compatibility "$NODE12_PACKET/compatibility.json" --loginom-build 7.4.2 \
 > "$NODE12_RELEASE/build-report.json"
python3 "$NODE12_SOURCE/deploy/loginom-dock/publish-action-catalog.py" \
 --build "$NODE12_RELEASE/catalog" --stage --validate-only
python3 "$NODE12_SOURCE/deploy/loginom-dock/publish-action-catalog.py" \
 --build "$NODE12_RELEASE/catalog" --admin "$NODE12_ADMIN" \
 --endpoint http://127.0.0.1:1933 --stage --report "$NODE12_RELEASE/stage-report.json"
