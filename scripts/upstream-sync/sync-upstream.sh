#!/usr/bin/env bash
# Rehearsal of an OpenCode (upstream) update. Nothing here changes the fork's working branch or publishes anything:
# every step runs in a fresh clone under --out whose push URL is disabled.
#
#   sync-upstream.sh pin      --tag vX.Y.Z [--upstream-url URL]
#   sync-upstream.sh prepare  --fork-sha SHA --tag vX.Y.Z --upstream-sha SHA --out DIR [--fork-url URL] [--upstream-url URL]
#   sync-upstream.sh check    --out DIR [--skip build,tests] [--bun PATH]
#   sync-upstream.sh accepted --out DIR [--merge REV]
#
# pin       Resolves a stable tag to its commit and prints UPSTREAM_TAG / UPSTREAM_SHA. Pre-releases are refused.
# prepare   Fresh clone of the fork at FORK_SHA, upstream tag fetched and verified against UPSTREAM_SHA, rehearsal
#           branch `sync-rehearsal/<tag>-<fork8>` with the trial merge left unresolved, conflict report (same metric as
#           measure-conflicts.sh) and the class table. Resolve the conflicts in DIR/rehearsal, commit the merge there.
# check     After the merge is committed: lockfile, typecheck, CI test commands, generated-client check, builds and the
#           external-compatibility comparison against the pre-merge fork. Every step is PASS, FAIL or NOT_RUN; a FAIL is
#           never hidden. Exit code is non-zero if any step failed.
# accepted  The acceptance gate: compares the merge commit (the HEAD of DIR/rehearsal) with the mechanical merge of the same two
#           parents and requires a decision record, committed with the merge, for every conflicted or deviating path.
#           --merge REV names the merge commit when later commits sit on top of it (default HEAD).
#
# Full procedure, ownership policies and acceptance: docs/upstream-sync/procedure.md
set -euo pipefail

HERE=$(cd "$(dirname "$0")" && pwd)
FORK_URL_DEFAULT=https://github.com/gooddaytoday/loginom-ai-agent.git
UPSTREAM_URL_DEFAULT=https://github.com/anomalyco/opencode.git

die() { echo "ERROR: $*" >&2; exit 1; }
usage() { sed -n '2,25p' "$0"; exit "${1:-0}"; }
[ $# -ge 1 ] || usage 2
CMD=$1; shift

TAG= FORK_SHA= UPSTREAM_SHA= OUT= FORK_URL=$FORK_URL_DEFAULT UPSTREAM_URL=$UPSTREAM_URL_DEFAULT
SKIP= BUN=bun MERGE=HEAD
while [ $# -gt 0 ]; do
  case $1 in
    --tag) TAG=$2; shift 2 ;;
    --fork-sha) FORK_SHA=$2; shift 2 ;;
    --upstream-sha) UPSTREAM_SHA=$2; shift 2 ;;
    --out) OUT=$2; shift 2 ;;
    --fork-url) FORK_URL=$2; shift 2 ;;
    --upstream-url) UPSTREAM_URL=$2; shift 2 ;;
    --skip) SKIP=$2; shift 2 ;;
    --bun) BUN=$2; shift 2 ;;
    --merge) MERGE=$2; shift 2 ;;
    -h|--help) usage 0 ;;
    *) die "unknown argument: $1" ;;
  esac
done

# Isolation from user and system git configuration; fixed identity; no stored conflict resolutions.
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1 GIT_TERMINAL_PROMPT=0 LC_ALL=C
export GIT_AUTHOR_NAME=upstream-sync GIT_AUTHOR_EMAIL=upstream-sync@example.invalid
export GIT_COMMITTER_NAME=upstream-sync GIT_COMMITTER_EMAIL=upstream-sync@example.invalid
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE
MERGE_CFG=(-c rerere.enabled=false -c merge.directoryRenames=conflict -c merge.conflictStyle=merge
  -c merge.renameLimit=30000 -c diff.renameLimit=30000 -c merge.renormalize=false
  -c core.autocrlf=false -c core.safecrlf=false -c core.ignorecase=false -c core.fsmonitor=false
  -c core.hooksPath=/dev/null -c gc.auto=0)

is_sha() { [[ $1 =~ ^[0-9a-f]{40}$ ]]; }
need_out() { [ -n "$OUT" ] || die "--out is required"; }

case $CMD in
pin)
  [ -n "$TAG" ] || die "--tag is required"
  [[ $TAG =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "$TAG is not a stable tag (vMAJOR.MINOR.PATCH); pre-releases are refused"
  refs=$(git ls-remote "$UPSTREAM_URL" "refs/tags/$TAG" "refs/tags/$TAG^{}")
  sha=$(awk -v t="refs/tags/$TAG^{}" '$2==t{print $1}' <<<"$refs")
  [ -n "$sha" ] || sha=$(awk -v t="refs/tags/$TAG" '$2==t{print $1}' <<<"$refs")
  is_sha "${sha:-}" || die "tag $TAG not found at $UPSTREAM_URL"
  echo "UPSTREAM_TAG=$TAG"
  echo "UPSTREAM_SHA=$sha"
  ;;

prepare)
  need_out
  [ -n "$TAG" ] && is_sha "$FORK_SHA" && is_sha "$UPSTREAM_SHA" || die "--tag and full 40-hex --fork-sha / --upstream-sha are required"
  if [ -e "$OUT" ] && [ -n "$(ls -A "$OUT" 2>/dev/null)" ]; then die "$OUT is not empty; a rehearsal never reuses a directory"; fi
  mkdir -p "$OUT"; OUT=$(cd "$OUT" && pwd)
  CLONE=$OUT/clone
  git clone --quiet --no-checkout "$FORK_URL" "$CLONE"
  git -C "$CLONE" remote set-url --push origin DISABLED   # a rehearsal can never push
  git -C "$CLONE" fetch --quiet --no-tags "$UPSTREAM_URL" "refs/tags/$TAG:refs/upstream-sync/$TAG"
  [ "$(git -C "$CLONE" rev-parse "refs/upstream-sync/$TAG^{commit}")" = "$UPSTREAM_SHA" ] || die "tag $TAG does not point at $UPSTREAM_SHA"
  [ "$(git -C "$CLONE" rev-parse --verify --quiet "$FORK_SHA^{commit}")" = "$FORK_SHA" ] || die "fork commit $FORK_SHA is not in $FORK_URL"
  BRANCH="sync-rehearsal/$TAG-${FORK_SHA:0:8}"
  git -C "$CLONE" worktree add --quiet -b "$BRANCH" "$OUT/rehearsal" "$FORK_SHA"
  {
    echo "FORK_URL=$FORK_URL"; echo "FORK_SHA=$FORK_SHA"
    echo "UPSTREAM_URL=$UPSTREAM_URL"; echo "UPSTREAM_TAG=$TAG"; echo "UPSTREAM_SHA=$UPSTREAM_SHA"
    echo "BRANCH=$BRANCH"; echo "MERGE_BASE=$(git -C "$CLONE" merge-base "$FORK_SHA" "$UPSTREAM_SHA")"
  } >"$OUT/pins.env"
  # Metric: the same script and settings as the baseline, on a separate temporary worktree.
  FORK_SHA=$FORK_SHA UPSTREAM_TAG=$TAG UPSTREAM_SHA=$UPSTREAM_SHA \
    "$HERE/measure-conflicts.sh" --repo "$CLONE" --out "$OUT/measure" | head -1 | tee "$OUT/metric.txt"
  # Leave the conflicted merge in the rehearsal worktree for resolution.
  set +e
  git -C "$OUT/rehearsal" "${MERGE_CFG[@]}" merge --no-commit --no-ff -s ort "$UPSTREAM_SHA" >"$OUT/merge-output.log" 2>&1
  rc=$?
  set -e
  [ "$rc" = 0 ] || [ "$rc" = 1 ] || die "git merge returned $rc (see $OUT/merge-output.log)"
  {
    echo "# Upstream sync rehearsal: $TAG"
    echo
    echo "- fork \`$FORK_SHA\`, upstream \`$UPSTREAM_SHA\` ($TAG), merge base \`$(git -C "$CLONE" merge-base "$FORK_SHA" "$UPSTREAM_SHA")\`"
    echo "- $(head -1 "$OUT/metric.txt")"
    echo "- rehearsal branch \`$BRANCH\` in \`$OUT/rehearsal\` (trial merge left unresolved: ${rc} = conflicts present)"
    echo
    python3 -I "$HERE/conflict-classes.py" --after "$OUT/measure/conflicts.tsv" \
      --before "$HERE/reference/baseline-conflicts.tsv" --residual "$HERE/reference/forecast-tier1-conflicts.tsv" || true
  } >"$OUT/report.md"
  echo "report: $OUT/report.md"
  echo "next: resolve the conflicts in $OUT/rehearsal, commit the merge, then run: $0 check --out $OUT"
  ;;

check)
  need_out
  OUT=$(cd "$OUT" && pwd)
  [ -f "$OUT/pins.env" ] || die "$OUT is not a prepared rehearsal"
  # shellcheck disable=SC1091
  . "$OUT/pins.env"
  WT=$OUT/rehearsal; CLONE=$OUT/clone; CHK=$OUT/check; mkdir -p "$CHK"
  [ -z "$(git -C "$WT" diff --name-only --diff-filter=U)" ] || die "unresolved conflicts remain in $WT"
  [ "$(git -C "$WT" rev-parse -q --verify MERGE_HEAD || true)" = "" ] || die "merge is not committed in $WT"
  git -C "$WT" merge-base --is-ancestor "$UPSTREAM_SHA" HEAD || die "rehearsal HEAD does not contain $UPSTREAM_SHA"
  [ -z "$(git -C "$WT" status --porcelain)" ] || die "working tree of $WT is not clean (release scripts require a clean tree)"
  : >"$CHK/summary.tsv"
  FAILED=0
  skipped() { [[ ",$SKIP," == *",${1%%-*},"* ]]; }
  step() { # name dir command...   (dir relative to the worktree)
    local name=$1 dir=$2; shift 2
    if skipped "$name"; then printf '%s\tNOT_RUN\tskipped by --skip\n' "$name" >>"$CHK/summary.tsv"; return; fi
    local t0=$SECONDS rc=0
    (cd "$WT/$dir" && "$@") >"$CHK/$name.log" 2>&1 || rc=$?
    if [ $rc = 0 ]; then printf '%s\tPASS\t%ss\n' "$name" $((SECONDS - t0)) >>"$CHK/summary.tsv"
    else printf '%s\tFAIL\texit %s, see %s.log\n' "$name" "$rc" "$name" >>"$CHK/summary.tsv"; FAILED=1; fi
  }
  # 1. Dependencies: the lockfile is regenerated by the merge resolution, so it must install frozen afterwards.
  step install . "$BUN" install --frozen-lockfile
  if skipped install; then printf 'install-runtime-client\tNOT_RUN\tskipped by --skip\n' >>"$CHK/summary.tsv"
  else
    (cd "$WT/packages/loginom-runtime/client" && npm ci --ignore-scripts --omit=dev --no-audit --fund=false --workspaces=false) \
      >"$CHK/install-runtime-client.log" 2>&1 || { printf 'install-runtime-client\tFAIL\tsee log\n' >>"$CHK/summary.tsv"; FAILED=1; }
  fi
  # 2. Type check and tests: the commands of .github/workflows/test.yml and typecheck.yml.
  step typecheck . "$BUN" turbo typecheck --continue --concurrency=1
  step tests-turbo . "$BUN" turbo test --continue --concurrency=2
  step tests-desktop packages/desktop "$BUN" test --path-ignore-patterns=src/main/draft-store.test.ts
  step check-generated packages/client "$BUN" run check:generated
  step httpapi packages/opencode "$BUN" run test:httpapi
  # The catalog is compared with the merged upstream commit; catalog.json "against" must have been moved to it (procedure, step 2),
  # otherwise the product guard test below, which reads "against", fails on purpose.
  step catalog . python3 -I "$HERE/catalog-check.py" --repo "$WT" --against "$UPSTREAM_SHA"
  step guards packages/product "$BUN" test
  # 3. Builds.
  # electron-vite bundles the whole backend into the main process: .github/workflows/release.yml:221–223 gives it 6144 MB of V8 heap.
  step "build-desktop" packages/desktop env "NODE_OPTIONS=${NODE_OPTIONS:---max-old-space-size=6144}" "$BUN" run build
  # 4. External compatibility: identical modulo documented renames, compared with the pre-merge fork.
  if skipped compat; then printf 'compat\tNOT_RUN\tskipped by --skip\n' >>"$CHK/summary.tsv"
  else
    [ -d "$OUT/before" ] || git -C "$CLONE" worktree add --quiet --detach "$OUT/before" "$FORK_SHA"
    (cd "$OUT/before" && "$BUN" install --frozen-lockfile && "$BUN" "$HERE/compat-snapshot.ts" --repo "$OUT/before" --out "$CHK/compat-before.json") >"$CHK/compat-before.log" 2>&1 || true
    (cd "$WT" && "$BUN" "$HERE/compat-snapshot.ts" --repo "$WT" --out "$CHK/compat-after.json") >"$CHK/compat-after.log" 2>&1 || true
    if [ -f "$CHK/compat-before.json" ] && [ -f "$CHK/compat-after.json" ]; then
      rc=0; "$BUN" "$HERE/compat-compare.ts" "$CHK/compat-before.json" "$CHK/compat-after.json" >"$CHK/compat.log" 2>&1 || rc=$?
      if [ $rc = 0 ]; then printf 'compat\tPASS\tsee compat.log\n' >>"$CHK/summary.tsv"; else printf 'compat\tFAIL\tsee compat.log\n' >>"$CHK/summary.tsv"; FAILED=1; fi
    else printf 'compat\tFAIL\tsnapshot not produced, see compat-*.log\n' >>"$CHK/summary.tsv"; FAILED=1; fi
  fi
  { echo "| Step | Result | Detail |"; echo "|---|---|---|"; awk -F'\t' '{printf "| %s | %s | %s |\n",$1,$2,$3}' "$CHK/summary.tsv"; } >"$CHK/summary.md"
  cat "$CHK/summary.md"
  [ $FAILED = 0 ] || { echo "FAILED steps are listed above; compare with the pre-merge fork before attributing them to the merge." >&2; exit 1; }
  ;;

accepted)
  need_out
  OUT=$(cd "$OUT" && pwd)
  [ -f "$OUT/pins.env" ] || die "$OUT is not a prepared rehearsal"
  # shellcheck disable=SC1091
  . "$OUT/pins.env"
  python3 -I "$HERE/verify-accepted.py" --repo "$OUT/rehearsal" --fork "$FORK_SHA" --upstream "$UPSTREAM_SHA" --merge "$MERGE"
  ;;

*) usage 2 ;;
esac
