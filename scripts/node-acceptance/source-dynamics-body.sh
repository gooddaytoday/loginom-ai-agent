#!/usr/bin/env bash
# Addressed public Sliding scenario plus independent cold Execute, in own slot.
set -euo pipefail
[[ $# -eq 3 ]] || { echo 'Usage: run-crosstable-sliding.sh <candidate-root> <source> <new-output-dir>' >&2; exit 1; }
CANDIDATE="$1"
SCENARIO="$2"
OUT="$3"
[[ "${NODE_SLOT:-}" =~ ^[a-z]$ && "$CANDIDATE" == /* && "$OUT" == /* && ! -e "$OUT" ]] || exit 1
[[ "$SCENARIO" == source ]] || exit 1
SLOT_ROOT="/opt/loginom-worker/slots/$NODE_SLOT"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DATA_DIR="$SCRIPT_DIR/../../docs/node-development/fixtures/source-dynamics"
RESOURCES="$CANDIDATE/resources/loginom"
CONNECTION="$SLOT_ROOT/profile/loginom/connection/connection.json"

mkdir -m 700 "$OUT"
trap 'rm -f "$OUT/.cold-config.json"' EXIT
USER_NAME="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["username"])' "$CONNECTION")"
PACKAGE="/$USER_NAME/sliding-$SCENARIO-$(basename "$OUT").lgp"
DISPLAY_NUM=$((11 + $(printf '%d' "'$NODE_SLOT") - 97))
BWRAP=/usr/local/libexec/loginom-swarm/bwrap
HARNESS=/opt/loginom-worker/cli-v017-20260926
# Same qualified containment as accept-node.sh. Only this slot is writable.
run_headed() {
 "$BWRAP" --die-with-parent --new-session --unshare-all --share-net --cap-drop ALL \
  --ro-bind /usr /usr --symlink usr/bin /bin --symlink usr/sbin /sbin \
  --symlink usr/lib /lib --symlink usr/lib64 /lib64 --proc /proc --dev /dev \
  --tmpfs /tmp --tmpfs /run --tmpfs /dev/shm \
  --ro-bind /etc/ssl /etc/ssl --ro-bind /etc/ca-certificates /etc/ca-certificates \
  --ro-bind /etc/resolv.conf /etc/resolv.conf --ro-bind /etc/hosts /etc/hosts \
  --ro-bind /etc/nsswitch.conf /etc/nsswitch.conf --ro-bind /etc/passwd /etc/passwd \
  --ro-bind /etc/group /etc/group --ro-bind /etc/fonts /etc/fonts \
  --ro-bind /etc/alternatives/awk /etc/alternatives/awk \
  --ro-bind "$CANDIDATE" "$CANDIDATE" --ro-bind "$HARNESS" "$HARNESS" \
  --ro-bind "$SCRIPT_DIR" "$SCRIPT_DIR" --ro-bind "$DATA_DIR" "$DATA_DIR" \
  --bind "$SLOT_ROOT" "$SLOT_ROOT" --chdir "$OUT" \
  --setenv HOME "$SLOT_ROOT" --setenv TMPDIR /tmp --setenv LOGINOM_AI_AGENT_TEST_HEADLESS 0 \
  /usr/bin/xvfb-run -n "$DISPLAY_NUM" -s '-screen 0 1920x1200x24 -nolisten tcp' \
  /usr/bin/python3 "$HARNESS/headed-entry.py" "$RESOURCES/bin/node" "$@"
}
run_headed "$SCRIPT_DIR/source-dynamics.mjs" --resources "$RESOURCES" --connection "$CONNECTION" \
 --data "$DATA_DIR/data" --expected "$DATA_DIR/expected.json" --output "$OUT/public" \
 --package "$PACKAGE" > "$OUT/public-stdout.txt" 2> "$OUT/public-stderr.txt"
python3 - "$CONNECTION" "$OUT" "$PACKAGE" <<'PYCONFIG'
import json,sys,pathlib,os
connection,out,package=sys.argv[1:]
c=json.load(open(connection));secret=json.loads(c['secrets']['payload']);out=pathlib.Path(out)
config={'api_key':secret['apiKey'],'loginom_url':c['url'],'workflow_profile':{'passwordless_login':secret['password']=='','loginom_user':c['username'],'password':secret['password']}}
(out/'.cold-config.json').write_text(json.dumps(config));os.chmod(out/'.cold-config.json',0o600)
(out/'saved.json').write_text(json.dumps({'path':package}))
PYCONFIG
run_headed "$SCRIPT_DIR/cold-check.mjs" --config "$OUT/.cold-config.json" --resources "$RESOURCES" \
 --saved "$OUT/saved.json" --expected "$OUT/public/cold-expected.json" --output "$OUT/cold" \
 > "$OUT/cold-stdout.txt" 2> "$OUT/cold-stderr.txt"
python3 - "$OUT" "$CANDIDATE/cli-manifest.json" <<'PYRESULT'
import json,pathlib,sys
out=pathlib.Path(sys.argv[1]);cold=json.load(open(out/'cold/result.json'));public=json.load(open(out/'public/public-result.json'))
assert cold['status']=='PASS' and public['status']=='PASS'
assert cold['cleanup']['package_closed'] and cold['cleanup']['logged_out']
assert all(s['comparison']['status']=='PASS' for s in cold['scenarios'])
result={'status':'PASS','source_sha':json.load(open(sys.argv[2]))['metadata']['sourceCommit'],'scenario':'source-dynamics','public':public,'cold':cold,'cleanup':cold['cleanup']}
(out/'addressed-result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print('PASS: original S values, 3→6, 6→6 metadata, retained failure/recovery, save and independent cold')
PYRESULT
