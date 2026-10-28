#!/usr/bin/env bash
# Offline test of the stand requirements of `sync-upstream.sh check` (stand.sh): each requirement the LAB-338 rehearsal had to meet by hand
# is either refused with a message that names it or repaired by the script. Usage: scripts/upstream-sync/test_stand.sh
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
W=$(mktemp -d "${TMPDIR:-/tmp}/upstream-sync-stand.XXXXXX")
trap 'rm -rf "$W"' EXIT
fail() { echo "TEST_STAND FAIL: $*" >&2; exit 1; }
# shellcheck source=stand.sh
. "$HERE/stand.sh"

# 1. root: the tests of the fork assume a user that file modes can refuse (LAB-338 run 1)
msg=$(stand_require_non_root 0 2>&1) && fail "root was accepted"
grep -q 'non-root' <<<"$msg" || fail "the root refusal does not say what to do: $msg"
stand_require_non_root 1000 || fail "a regular user was refused"

# 2. skills of an ancestor directory leak into the bundled-skills tests (LAB-338: workdir/.claude/skills)
mkdir -p "$W/leaky/.claude/skills/x" "$W/agents/.agents/skills/y" "$W/clean/out/rehearsal" "$W/leaky/out/rehearsal" "$W/agents/out/rehearsal"
msg=$(stand_require_no_ancestor_skills "$W/leaky/out/rehearsal" 2>&1) && fail "an ancestor with .claude/skills was accepted"
grep -q "$W/leaky" <<<"$msg" || fail "the refusal does not name the ancestor: $msg"
stand_require_no_ancestor_skills "$W/agents/out/rehearsal" >/dev/null 2>&1 && fail "an ancestor with .agents/skills was accepted"
stand_require_no_ancestor_skills "$W/clean/out/rehearsal" || fail "a clean tree was refused"

# 3. environment: private TMP, umask 022, bunx beside bun, no turbo cache
mkdir -p "$W/tools" "$W/out"; printf '#!/bin/sh\nexit 0\n' >"$W/tools/bun"; chmod +x "$W/tools/bun"
env_out=$(env -i PATH=/usr/bin:/bin TMPDIR=/nonexistent/x TMP=/nonexistent/x TEMP=/nonexistent/x bash -c '
  . "$1"; umask 002; stand_prepare_env "$2" "$3"
  echo "umask=$(umask)"; echo "tmp=$TMPDIR $TMP $TEMP"; echo "turbo=$TURBO_FORCE"; echo "bunx=$(command -v bunx)"; touch "$TMPDIR/probe" && echo writable
' _ "$HERE/stand.sh" "$W/out" "$W/tools/bun" 2>&1) || fail "stand_prepare_env failed: $env_out"
grep -qx 'umask=0022' <<<"$env_out" || fail "umask not 022: $env_out"
grep -qx "tmp=$W/out/tmp $W/out/tmp $W/out/tmp" <<<"$env_out" || fail "TMP, TEMP, TMPDIR not private: $env_out"
grep -qx 'turbo=true' <<<"$env_out" || fail "TURBO_FORCE not set: $env_out"
grep -q '^bunx=.*/bunx$' <<<"$env_out" || fail "bunx not resolvable: $env_out"
grep -qx writable <<<"$env_out" || fail "private TMP is not writable: $env_out"
printf '#!/bin/sh\nexit 0\n' >"$W/tools/bunx"; chmod +x "$W/tools/bunx"
bunx_out=$(env -i PATH=/usr/bin:/bin bash -c '. "$1"; stand_prepare_env "$2" "$3"; command -v bunx' _ "$HERE/stand.sh" "$W/out" "$W/tools/bun")
[ "$bunx_out" = "$W/tools/bunx" ] || fail "an existing bunx beside bun was replaced: $bunx_out"

# 4. leftover of a failed build: an empty openapi.json that no longer belongs to any run
WT=$W/wt; mkdir -p "$WT/packages/sdk/js"; : >"$WT/packages/sdk/js/openapi.json"
stand_clean_debris "$WT" >/dev/null 2>&1
[ ! -e "$WT/packages/sdk/js/openapi.json" ] || fail "the empty openapi.json was left"
echo '{"openapi":"3.1.0"}' >"$WT/packages/sdk/js/openapi.json"
stand_clean_debris "$WT" >/dev/null 2>&1
[ -s "$WT/packages/sdk/js/openapi.json" ] || fail "a non-empty openapi.json was removed"
echo "TEST_STAND PASS"
