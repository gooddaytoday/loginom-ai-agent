#!/usr/bin/env bash
# Offline self-test of the sync procedure on a synthetic upstream and fork (no network, no bun).
# Covers: pin refuses pre-releases, prepare reports the expected conflicts and refuses a reused directory,
# accepted rejects a merge without decision records and accepts the same merge with records committed in it; test_tools.py covers
# the gate, the oracle and apply-identity on synthetic merges; test_acceptance.py runs every cell of
# docs/upstream-sync/acceptance-contract.md as a Git merge and mutates the gate to prove the cells see its exit code and verdict;
# doctest_procedure.py runs the command blocks of procedure.md verbatim from a clean clone, `pin` to `accepted`.
# Usage: scripts/upstream-sync/selftest.sh   (exit 0 = all assertions held)
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1 GIT_TERMINAL_PROMPT=0 LC_ALL=C
export GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@example.invalid GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@example.invalid
W=$(mktemp -d "${TMPDIR:-/tmp}/upstream-sync-selftest.XXXXXX")
trap 'rm -rf "$W"' EXIT
fail() { echo "SELFTEST FAIL: $*" >&2; exit 1; }
expect() { [ "$2" = "$3" ] || fail "$1: expected '$3', got '$2'"; }

seq_file() { for i in $(seq 1 12); do echo "line $i"; done; }

# --- upstream: base commit, then tag v1.1.0 with an update
U=$W/upstream; git init -q -b main "$U"
mkdir -p "$U/pkg" "$U/keep"
seq_file >"$U/pkg/a.txt"; seq_file >"$U/pkg/b.txt"; seq_file >"$U/pkg/c.txt"; echo keep >"$U/keep/d.txt"; echo old >"$U/del.txt"
git -C "$U" add -A; git -C "$U" commit -q -m base; BASE=$(git -C "$U" rev-parse HEAD)
git -C "$U" tag v1.0.0
sed -i 's/^line 10$/line 10 upstream/' "$U/pkg/a.txt"
sed -i 's/^line 5$/line 5 upstream/' "$U/pkg/b.txt"
sed -i 's/^line 3$/line 3 upstream/' "$U/pkg/c.txt"
git -C "$U" rm -q del.txt; echo new >"$U/new.txt"
git -C "$U" add -A; git -C "$U" commit -q -m update; git -C "$U" tag v1.1.0; git -C "$U" tag v1.2.0-rc1
UP=$(git -C "$U" rev-parse HEAD)

# --- fork: from the base, changes a.txt (no overlap), b.txt (overlap), del.txt, adds a file
F=$W/fork; git clone -q "$U" "$F"; git -C "$F" checkout -q -b loginom "$BASE"
sed -i 's/^line 1$/line 1 fork/' "$F/pkg/a.txt"
sed -i 's/^line 5$/line 5 fork/' "$F/pkg/b.txt"
echo fork >>"$F/del.txt"; echo only >"$F/fork-only.txt"
git -C "$F" add -A; git -C "$F" commit -q -m fork
FORK=$(git -C "$F" rev-parse HEAD)

# --- pin
out=$("$HERE/sync-upstream.sh" pin --tag v1.1.0 --upstream-url "$U"); grep -q "UPSTREAM_SHA=$UP" <<<"$out" || fail "pin printed the wrong SHA: $out"
if "$HERE/sync-upstream.sh" pin --tag v1.2.0-rc1 --upstream-url "$U" >/dev/null 2>&1; then fail "pin accepted a pre-release"; fi

# --- prepare: b.txt content conflict and del.txt modify/delete
OUT=$W/rehearsal-out
"$HERE/sync-upstream.sh" prepare --fork-sha "$FORK" --tag v1.1.0 --upstream-sha "$UP" --out "$OUT" --fork-url "$F" --upstream-url "$U" >"$W/prepare.log"
expect "conflict count" "$(grep -c . "$OUT/measure/unmerged-paths.txt")" 2
grep -qx 'del.txt' "$OUT/measure/unmerged-paths.txt" || fail "del.txt not reported"
grep -qx 'pkg/b.txt' "$OUT/measure/unmerged-paths.txt" || fail "pkg/b.txt not reported"
if "$HERE/sync-upstream.sh" prepare --fork-sha "$FORK" --tag v1.1.0 --upstream-sha "$UP" --out "$OUT" --fork-url "$F" --upstream-url "$U" >/dev/null 2>&1; then
  fail "prepare reused a non-empty directory"; fi
[ "$(git -C "$OUT/clone" remote get-url --push origin)" = DISABLED ] || fail "push URL is not disabled"

R=$OUT/rehearsal
# --- a merge without decision records is rejected: both paths are conflicts of the mechanical merge
git -C "$R" checkout -q --ours pkg/b.txt; git -C "$R" add pkg/b.txt
git -C "$R" add del.txt; git -C "$R" commit -q -m "merge (no records)"
if "$HERE/sync-upstream.sh" accepted --out "$OUT" >"$W/bad.log" 2>&1; then fail "accepted passed a merge without decision records"; fi
grep -q 'FAIL conflict: pkg/b.txt' "$W/bad.log" || fail "the conflict at pkg/b.txt was not reported: $(cat "$W/bad.log")"
grep -q 'FAIL conflict: del.txt' "$W/bad.log" || fail "the conflict at del.txt was not reported"
grep -q 'RESULT: REJECTED' "$W/bad.log" || fail "no REJECTED result"

# --- the same files merged properly, with one record for each conflicted path committed in the merge
git -C "$R" reset -q --hard "$FORK"
set +e; git -C "$R" -c rerere.enabled=false merge --no-commit --no-ff "$UP" >/dev/null 2>&1; set -e
seq_file | sed 's/^line 5$/line 5 fork+upstream/' >"$R/pkg/b.txt"; git -C "$R" add pkg/b.txt
git -C "$R" rm -q -f del.txt
mkdir -p "$R/docs/upstream-sync"
cat >"$R/docs/upstream-sync/merge-decisions.json" <<'JSON'
{"format": 1, "decisions": [
 {"path": "pkg/b.txt", "rule": "PROCEDURE-2", "reason": "both edits of line 5 kept"},
 {"path": "del.txt", "rule": "ADR-1", "reason": "the fork no longer ships this file"}]}
JSON
git -C "$R" add -A; git -C "$R" commit -q -m "merge (with records)"
"$HERE/sync-upstream.sh" accepted --out "$OUT" >"$W/good.log" 2>&1 || fail "accepted rejected a merge with records: $(cat "$W/good.log")"
grep -q 'RESULT: ACCEPTED' "$W/good.log" || fail "no ACCEPTED result"
grep -q '| conflict | 2 | 2 |' "$W/good.log" || fail "expected two recorded conflicts: $(cat "$W/good.log")"
# --- apply-identity: new upstream code gets the fork's external names, provider keys stay
IDREPO=$W/identity; mkdir -p "$IDREPO/packages/core/src"; git init -q "$IDREPO"
printf 'const a = process.env.OPENCODE_NEW_FLAG\nconst k = process.env.OPENCODE_API_KEY\nconst d = ".opencode/agent"\nconst c = "opencode.json"\n' >"$IDREPO/packages/core/src/x.ts"
git -C "$IDREPO" add -A; git -C "$IDREPO" commit -q -m x
python3 -I "$HERE/apply-identity.py" --repo "$IDREPO" >/dev/null 2>&1
grep -q 'process.env.LOGINOM_AI_AGENT_NEW_FLAG' "$IDREPO/packages/core/src/x.ts" || fail "OPENCODE_NEW_FLAG was not renamed"
grep -q 'process.env.OPENCODE_API_KEY' "$IDREPO/packages/core/src/x.ts" || fail "provider key was renamed"
grep -q '".loginom-ai-agent/agent"' "$IDREPO/packages/core/src/x.ts" || fail "directory was not renamed"
grep -q '"loginom-ai-agent.json"' "$IDREPO/packages/core/src/x.ts" || fail "config file was not renamed"
python3 -I "$HERE/apply-identity.py" --repo "$IDREPO" --check >/dev/null 2>&1 || fail "apply-identity is not idempotent"
# --- behavior tests of apply-identity.py and verify-accepted.py on synthetic merges (one test per counterexample)
python3 -I "$HERE/test_tools.py" >"$W/test_tools.log" 2>&1 || { cat "$W/test_tools.log" >&2; fail "test_tools.py failed"; }
# --- every cell of the acceptance contract, as a real Git merge
python3 -I "$HERE/test_acceptance.py" >"$W/test_acceptance.log" 2>&1 || { tail -60 "$W/test_acceptance.log" >&2; fail "test_acceptance.py failed"; }
# --- procedure.md, verbatim, in a clean clone: pin -> prepare -> (manual step 2 by a script) -> identity -> catalog -> commit -> check -> accepted
DOC=$W/doc-clone; git init -q -b main "$DOC"; mkdir -p "$DOC/scripts" "$DOC/docs"
cp -R "$HERE" "$DOC/scripts/upstream-sync"; cp -R "$HERE/../../docs/upstream-sync" "$DOC/docs/upstream-sync"
rm -rf "$DOC/scripts/upstream-sync/__pycache__"; git -C "$DOC" add -A; git -C "$DOC" commit -q -m "tools and procedure"
cat >"$W/resolve.sh" <<'RESOLVE'
#!/usr/bin/env bash
# The person's part of procedure step 2 on the synthetic merge: resolve both conflicts, describe the divergence in the catalog,
# record a decision for each conflicted path in the file that is committed with the merge.
set -euo pipefail
. "$OUT/pins.env"; R=$OUT/rehearsal
for i in $(seq 1 12); do if [ "$i" = 5 ]; then echo "line 5 fork+upstream"; else echo "line $i"; fi; done >"$R/pkg/b.txt"
git -C "$R" add pkg/b.txt; git -C "$R" rm -q -f del.txt
mkdir -p "$R/docs/upstream-sync"
printf '{"against": "%s", "entries": [{"id": "CAT-01", "paths": ["pkg/*.txt"]}]}\n' "$UPSTREAM_SHA" >"$R/docs/upstream-sync/catalog.json"
printf '## CAT-01 fork edits\n' >"$R/docs/upstream-sync/catalog.md"
cat >"$R/docs/upstream-sync/merge-decisions.json" <<'JSON'
{"format": 1, "decisions": [
 {"path": "pkg/b.txt", "rule": "CAT-01", "reason": "both edits of line 5 kept"},
 {"path": "del.txt", "rule": "CAT-01", "reason": "the fork no longer ships this file"},
 {"path": "docs/upstream-sync/catalog.json", "rule": "PROCEDURE-2", "reason": "against moved to the merged tag"},
 {"path": "docs/upstream-sync/catalog.md", "rule": "PROCEDURE-2", "reason": "the divergence is described"}]}
JSON
RESOLVE
chmod +x "$W/resolve.sh"
DOCENV=(FORK_URL="$F" UPSTREAM_URL="$U" TAG=v1.1.0 CHECK_SKIP=install,typecheck,tests,check,httpapi,guards,build,compat GIT_ALLOW_PROTOCOL=file)
doctest() { env "${DOCENV[@]}" python3 -I "$HERE/doctest_procedure.py" --src "$DOC" --resolve "$W/resolve.sh" "$@"; }
doctest --doc "$HERE/../../docs/upstream-sync/procedure.md" --out "$W/doc-out" --log "$W/doctest.log" >"$W/doctest.out" 2>&1 \
  || { tail -60 "$W/doctest.log" >&2; cat "$W/doctest.out" >&2; fail "procedure.md does not run verbatim"; }
grep -q 'RESULT: ACCEPTED' "$W/doctest.log" || fail "the procedure document did not end in ACCEPTED: $(tail -5 "$W/doctest.log")"
grep -q '^catalog	PASS' "$W/doc-out/check/summary.tsv" || fail "the catalog step of check did not pass"
# the document must fail when a command depends on the working directory (C4 of LAB-300): with the same environment as the
# positive run, so that it fails at the step under test and not at the network
sed 's#--repo "\$OUT/rehearsal"#--repo rehearsal#' "$HERE/../../docs/upstream-sync/procedure.md" >"$W/procedure-relative.md"
if doctest --doc "$W/procedure-relative.md" --out "$W/doc-out-relative" --log "$W/doctest-relative.log" >"$W/doctest-relative.out" 2>&1; then
  fail "the doc-test passed a document with a relative --repo path"; fi
[ "$(grep '^### step=' "$W/doctest-relative.log" | tail -1 | sed 's/^### step=\([a-z]*\).*/\1/')" = identity ] \
  || fail "the relative --repo path did not fail at the identity step: $(tail -5 "$W/doctest-relative.log")"
grep -q '^### step=prepare' "$W/doctest-relative.log" || fail "the negative doc-test never reached prepare, so the network is not excluded"
sed 's#--fork-sha "\$FORK_SHA"#--fork-sha <FORK_SHA>#' "$HERE/../../docs/upstream-sync/procedure.md" >"$W/procedure-placeholder.md"
if doctest --doc "$W/procedure-placeholder.md" --out "$W/doc-out-placeholder" --log "$W/doctest-placeholder.log" >"$W/doctest-placeholder.out" 2>&1; then
  fail "the doc-test passed a document with a placeholder"; fi
grep -q 'is not executable as written' "$W/doctest-placeholder.out" || fail "the placeholder was not what failed: $(cat "$W/doctest-placeholder.out")"
[ -z "${DOCTEST_LOG:-}" ] || cp "$W/doctest.log" "$DOCTEST_LOG"
echo "SELFTEST PASS"
