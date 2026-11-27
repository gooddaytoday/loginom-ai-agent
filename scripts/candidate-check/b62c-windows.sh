#!/bin/bash
# B6.2c: the Windows part of the candidate check on `winstand` (plan B6.2-S, task 3) from the CI artifact of one SHA.
#   b62c-windows.sh <40-character SHA> [stage...]      stages, in this order when none is named:
#     fetch    download loginom-windows-unsigned-<run> and loginom-windows-installed-smoke-<run> of the release run of the SHA, check the hashes
#     prepare  administrator: C:\lab\b62c, scripts, snapshot "before", temporary account (random password to a 0600 file), release installers
#     send     installer and CLI ZIP in 20 MB parts with retries, joined and compared with the Linux hashes on the stand
#     profiles B3.3: for each release (B62C_RELEASES) a profile by the release Desktop, then the candidate CLI on `serve` and `migrate`
#     sec01    SEC-01 (DPAPI, Electron 44) as the ordinary account: write, read, unavailable, damaged ciphertext; compared with the CI jsons
#     smoke    checklist 4/5/10: clean NSIS install, PKG-01/02, BRAND-01, relaunch, LIFE-01, REMOVE-01 (windows-installed-smoke.py)
#     cli      checklist 8: install from the CLI ZIP, login, one task on a stub model, removal
#     clean    delete the installations, the account, its profile and C:\lab\b62c; snapshot "after"; compare with "before"
# Environment: B62C_OUT (evidence directory, default ~/.local/share/loginom-evidence/b62c), B62C_SECRET (0600 file for the account password, default
# $B62C_OUT/.account.secret), B62C_RELEASES (default "0.4.0 0.3.9"; both installers must be in C:\lab on the stand, see `dist` in b62c-stand.ps1).
# Never calls a real model: the profile providers are stubs on 127.0.0.1. Run from the repository root of the SHA (scripts and the smoke come from it).
# Needs: gh (authenticated), ssh alias `winstand` (administrator, key), python3, Node 24 and Bun 1.4.4 in PATH (the credential codec bundle).
set -euo pipefail
sha=${1:?usage: b62c-windows.sh <40-character SHA> [stage...]}
shift
[[ $sha =~ ^[0-9a-f]{40}$ ]] || { echo "the full 40-character SHA is needed (gh run list --commit does not take a short one)" >&2; exit 2; }
stages=${*:-fetch prepare send profiles sec01 smoke cli clean}
repo=$(git rev-parse --show-toplevel)
here=$repo/scripts/candidate-check
out=${B62C_OUT:-$HOME/.local/share/loginom-evidence/b62c}
export B33_ACCOUNT_SECRET=${B62C_SECRET:-$out/.account.secret}
export B33_ACCOUNT_NAME='Проверка Б62'
releases=${B62C_RELEASES:-"0.4.0 0.3.9"}
gh_repo=kartamyshev-dev/loginom-ai-agent-test
art=$out/artifacts
mkdir -p "$out" "$art"
admin() { ssh -o BatchMode=yes -o ServerAliveInterval=30 winstand "$@"; }
user() { "$repo/scripts/live-profiles/stand.sh" user "$@"; }
step() { echo "== $* $(date +%T)"; }
# A script file runs as the ordinary account through -File (a long -EncodedCommand does not fit the command line of the SSH session).
user_ps() { user "powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File C:\\lab\\b62c\\tools\\$1" "${@:2}"; }

# The release run may be red as a whole (a macOS job): what the Windows part needs is its two Windows jobs green.
run=
for id in $(gh run list -R "$gh_repo" --commit "$sha" --workflow loginom-release.yml --json databaseId --jq '.[].databaseId'); do
  ok=$(gh run view "$id" -R "$gh_repo" --json jobs --jq '[.jobs[]|select((.name=="windows / build-package-test" or .name=="verify windows") and .conclusion=="success")]|length')
  [ "$ok" = 2 ] && { run=$id; break; }
done
[ -n "$run" ] || { echo "no loginom-release.yml run of $sha with green 'windows / build-package-test' and 'verify windows'" >&2; exit 2; }
echo "SHA $sha, run $run"
unsigned=$art/unsigned
installer=$unsigned/desktop/loginom-ai-agent-win-x64.exe
zip=$(ls "$unsigned"/loginom-ai-agent-cli-*-win32-x64.zip 2>/dev/null | head -1 || true)

for stage in $stages; do
  t0=$(date +%s)
  step "stage $stage"
  case $stage in
    fetch)
      rm -rf "$unsigned" "$art/smoke"
      gh run download "$run" -R "$gh_repo" -n "loginom-windows-unsigned-$run" -D "$unsigned"
      gh run download "$run" -R "$gh_repo" -n "loginom-windows-installed-smoke-$run" -D "$art/smoke"
      python3 -I - "$unsigned" <<'PY'
import hashlib, json, pathlib, sys
root = pathlib.Path(sys.argv[1])
summary = json.loads((root / "ci-summary.json").read_text())
for key, path in (("desktop", root / "desktop" / summary["desktop"]["name"]), ("cli", root / summary["cli"]["name"])):
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    assert digest == summary[key]["sha256"], f"{key}: {digest} != {summary[key]['sha256']}"
    print(key, path.name, digest, "matches ci-summary.json")
print("commit", summary["commit"])
PY
      ;;
    prepare)
      admin 'if not exist C:\lab\b62c mkdir C:\lab\b62c & if not exist C:\lab\b62c\tools mkdir C:\lab\b62c\tools & if not exist C:\lab\b62c\parts mkdir C:\lab\b62c\parts'
      scp -O -q "$here/b62c-stand.ps1" winstand:C:/lab/b62c/stand.ps1
      scp -O -q "$here"/b62c-{assemble,sec01,cli,release,wipe-old,fetch-electron,extract-cli}.ps1 "$here/b62c-task.mjs" "$repo/scripts/live-profiles/"{live.mjs,wipe.ps1} \
        "$repo/packages/desktop/test/loginom/safe-storage-smoke.cjs" winstand:C:/lab/b62c/tools/
      admin 'powershell -NoProfile -ExecutionPolicy Bypass -File C:\lab\b62c\stand.ps1 -Task snapshot -Out C:\lab\b62c\snap-before.json'
      scp -O -q winstand:C:/lab/b62c/snap-before.json "$out/snap-before.json"
      umask 077
      admin 'powershell -NoProfile -ExecutionPolicy Bypass -File C:\lab\b62c\stand.ps1 -Task account-create'
      scp -O -q winstand:C:/lab/b62c/secret/account.txt "$B33_ACCOUNT_SECRET"
      admin 'powershell -NoProfile -ExecutionPolicy Bypass -File C:\lab\b62c\stand.ps1 -Task dist'
      # the SEC-01 inputs: the codec as the CI bundles it, and the Electron the Desktop package pins (SHA-256 from its checksums.json)
      bun build "$repo/packages/loginom-host/src/connection/credentials.ts" --target=node --format=cjs --outfile="$out/credentials.cjs" >/dev/null
      scp -O -q "$out/credentials.cjs" winstand:C:/lab/b62c/tools/
      ;;
    send)
      # `fetch` may have run in this very call: the ZIP name is only known now
      zip=$(ls "$unsigned"/loginom-ai-agent-cli-*-win32-x64.zip | head -1)
      mkdir -p "$out/chunks"
      (cd "$out/chunks" && rm -f inst.* cli.* && split -b 20M -d -a 3 "$installer" inst. && split -b 20M -d -a 3 "$zip" cli.)
      send() { # one part, retried; skipped when the stand already has it with the same size
        local f=$1 size have i
        size=$(stat -c %s "$out/chunks/$f")
        for i in 1 2 3 4 5 6; do
          have=$(timeout 60 ssh -o BatchMode=yes winstand "powershell -NoProfile -Command \"if(Test-Path C:\\lab\\b62c\\parts\\$f){(Get-Item C:\\lab\\b62c\\parts\\$f).Length}else{0}\"" 2>/dev/null | tr -d '\r\n ' || true)
          [ "$have" = "$size" ] && return 0
          timeout 900 scp -O -q -o BatchMode=yes -o ServerAliveInterval=30 "$out/chunks/$f" "winstand:C:/lab/b62c/parts/$f" || echo "retry $f $i"
        done
        echo "FAIL $f"; return 1
      }
      export -f send; export out
      (cd "$out/chunks" && ls | xargs -P5 -n1 bash -c 'send "$0"')
      for pair in "inst:$installer:installer.exe" "cli:$zip:cli.zip"; do
        IFS=: read -r prefix file target <<<"$pair"
        want=$(sha256sum "$file" | cut -d' ' -f1)
        got=$(admin "powershell -NoProfile -ExecutionPolicy Bypass -File C:\\lab\\b62c\\tools\\b62c-assemble.ps1 -Prefix $prefix -Out C:\\lab\\b62c\\dist\\$target" | tee /dev/stderr | sed -n 's/.*sha256 //p' | tr -d '\r')
        [ "$got" = "$want" ] || { echo "hash on the stand differs for $target: $got != $want" >&2; exit 1; }
        echo "$target on the stand: $got = Linux"
      done
      user_ps b62c-extract-cli.ps1 2>&1 | grep -av '^#< CLIXML\|^<Objs'
      ;;
    profiles)
      for rel in $releases; do
        step "release $rel"
        user_ps b62c-release.ps1 -Rel "$rel" 2>&1 | grep -av '^#< CLIXML\|^<Objs' | tee "$out/profiles-$rel.log"
      done
      ;;
    sec01)
      user_ps b62c-fetch-electron.ps1 2>&1 | grep -av '^#< CLIXML\|^<Objs' | tr -d '\r' | tee "$out/electron-sha.txt"
      want=$(python3 -I -c "import json,sys;print(json.load(open('$repo/packages/desktop/node_modules/electron/checksums.json'))['electron-v44.9.1-win32-x64.zip'])")
      grep -qx "$want" "$out/electron-sha.txt" || { echo "Electron zip hash differs from checksums.json" >&2; exit 1; }
      user_ps b62c-sec01.ps1 2>&1 | grep -av '^#< CLIXML\|^<Objs' | tee "$out/sec01-windows.log"
      mkdir -p "$out/sec01-ev"
      for mode in write read unavailable; do
        scp -O -q "winstand:C:/lab/b62c/u/sec01/ev/safe-storage-$mode.json" "$out/sec01-ev/"
        # equal to the CI evidence apart from "pid"
        diff <(sed 's/"pid":[0-9]*,//' "$out/sec01-ev/safe-storage-$mode.json") <(sed 's/"pid":[0-9]*,//' "$art/smoke/safe-storage-$mode.json") && echo "safe-storage-$mode.json = CI"
      done
      ;;
    smoke)
      user_ps b62c-wipe-old.ps1 2>&1 | grep -av '^#< CLIXML\|^<Objs'
      python3 "$repo/packages/desktop/test/loginom/windows-installed-smoke.py" C:/lab/b62c/dist/installer.exe --login "$B33_ACCOUNT_NAME" \
        --password-file "$B33_ACCOUNT_SECRET" --remote-root C:/lab/b62c/smoke --channel dev --version 2.3.0 \
        --sha256 "$(sha256sum "$installer" | cut -d' ' -f1)" --runs 3 --output "$out/smoke-$(date +%H%M%S)"
      ;;
    cli)
      user_ps b62c-cli.ps1 2>&1 | grep -av '^#< CLIXML\|^<Objs' | tee "$out/cli-step8.log"
      ;;
    clean)
      admin 'powershell -NoProfile -ExecutionPolicy Bypass -File C:\lab\b62c\stand.ps1 -Task account-delete'
      admin 'powershell -NoProfile -ExecutionPolicy Bypass -File C:\lab\b62c\stand.ps1 -Task snapshot -Out C:\lab\b62c\snap-after.json'
      scp -O -q winstand:C:/lab/b62c/snap-after.json "$out/snap-after.json"
      admin 'powershell -NoProfile -ExecutionPolicy Bypass -File C:\lab\b62c\stand.ps1 -Task clean'
      python3 -I - "$out/snap-before.json" "$out/snap-after.json" <<'PY'
import json, sys
def load(path):
    data = json.load(open(path, encoding="utf-8-sig"))
    for volatile in ("time", "freeGB"): data.pop(volatile, None)
    return data
before, after = load(sys.argv[1]), load(sys.argv[2])
changed = {key: (before[key], after[key]) for key in before if before[key] != after[key]}
print("snapshot after == before" if not changed else f"DIFFERENT: {json.dumps(changed, ensure_ascii=False)[:2000]}")
sys.exit(1 if changed else 0)
PY
      ;;
    *) echo "unknown stage $stage" >&2; exit 2 ;;
  esac
  echo "-- stage $stage: $(( $(date +%s) - t0 )) s"
done
