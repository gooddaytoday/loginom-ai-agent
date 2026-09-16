#!/bin/sh
# Coordinator only: execute on the Dock VPS, never on the Mac. No activation.
set -eu
if [ "$#" -ne 4 ]; then
  echo 'Usage: replacement-stage-vps.sh SOURCE_ARCHIVE SOURCE_MANIFEST NODE_24_19_0 NEW_BUILD_DIRECTORY' >&2
  exit 2
fi
dock_archive=$1
dock_source_manifest=$2
dock_node=$3
dock_build=$4
[ "$("$dock_node" --version)" = 'v24.19.0' ]
# Refuse reusing any build directory. Publisher separately refuses conflicting releases.
mkdir "$dock_build"
python3 - "$dock_archive" "$dock_source_manifest" "$dock_build" <<'PY'
import hashlib,json,sys,tarfile
from pathlib import Path
archive,manifest,out=map(Path,sys.argv[1:]);proof=json.loads(manifest.read_text())
assert hashlib.sha256(archive.read_bytes()).hexdigest()==proof['archive_sha256']=='396026de516792499c9d21f00981ea0044d9d47fced7f052b65c307150ebbf50'
assert proof['source']['source_commit']=='b05715340937f9c828e03bc6ec7a88f3adf086da' and proof['source']['build_inputs_match_commit'] is True
with tarfile.open(archive) as f:
 for m in f.getmembers():
  assert not m.name.startswith('/') and '..' not in Path(m.name).parts and not m.issym() and not m.islnk()
 f.extractall(out/'source')
for item in proof['source']['files']:
 p=out/'source'/item['path'];assert hashlib.sha256(p.read_bytes()).hexdigest()==item['sha256'] and p.stat().st_size==item['bytes']
(out/'source-manifest.json').write_text(json.dumps(proof,indent=2)+'\n')
(out/'compatibility.json').write_text(json.dumps(dict(profile_id='loginom-7.4.2-macos-chromium-ru',loginom_build='7.4.2',platform='macos',browser='chromium'),indent=2)+'\n')
PY
"$dock_node" "$dock_build/source/deploy/loginom-dock/build-action-catalog.mjs" \
  --input "$dock_build/source/executor/catalog" --out "$dock_build/catalog" \
  --candidate --version 2026.09.13-node11.2-candidate --compatibility "$dock_build/compatibility.json" --loginom-build 7.4.2 \
  --package-root /test-2 > "$dock_build/catalog-build-report.json"
python3 "$dock_build/source/deploy/loginom-dock/publish-action-catalog.py" \
  --build "$dock_build/catalog" --stage --validate-only
python3 "$dock_build/source/deploy/loginom-dock/publish-action-catalog.py" \
  --build "$dock_build/catalog" --stage --endpoint http://127.0.0.1:1933 \
  --admin /opt/loginom-dock/config/admin.json --report "$dock_build/stage-report.json"
