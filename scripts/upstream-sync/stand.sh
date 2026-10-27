# Requirements of the stand that runs `sync-upstream.sh check` (procedure.md, "Стенд шага check"). Sourced by sync-upstream.sh;
# each function either repairs the requirement or refuses with the action to take. Tested by test_stand.sh.

stand_die() { echo "ERROR: $*" >&2; return 1; }

# The tests of the fork rely on file modes that refuse a write; as root they pass or fail for the wrong reason (LAB-338).
stand_require_non_root() {
  [ "$1" != 0 ] || stand_die "check must run as a non-root user: file-mode tests (loginom-host archive modes, tool.write, log retention) fail as root; create a user for the stand"
}

# The bundled-skills tests find skills of every ancestor directory of the checkout (`.claude/skills`, `.agents/skills`): put the rehearsal outside such a tree.
stand_require_no_ancestor_skills() {
  local dir=$1
  while [ "$dir" != / ] && [ -n "$dir" ]; do
    dir=$(dirname "$dir")
    if [ -d "$dir/.claude/skills" ] || [ -d "$dir/.agents/skills" ]; then
      stand_die "$dir has a skills directory that the bundled-skills tests would discover as extra skills; run the rehearsal outside $dir"
      return 1
    fi
  done
}

# $1 = rehearsal directory, $2 = the bun that runs the steps.
# A private TMP (an inherited one may belong to another user: EACCES), umask 022 (archive-mode tests), a `bunx` next to `bun`
# (the http-recorder build calls it; a bare bun-linux-x64.zip has none), and a turbo that runs the tests instead of replaying a cache.
stand_prepare_env() {
  local out=$1 bun=$2 bun_path
  umask 022
  mkdir -p "$out/tmp"
  export TMPDIR=$out/tmp TMP=$out/tmp TEMP=$out/tmp
  export TURBO_FORCE=true
  bun_path=$(command -v "$bun") || stand_die "bun not found: $bun" || return 1
  if ! command -v bunx >/dev/null 2>&1; then
    if [ -x "$(dirname "$bun_path")/bunx" ]; then export PATH=$(dirname "$bun_path"):$PATH
    else mkdir -p "$out/bin"; ln -sf "$bun_path" "$out/bin/bunx"; export PATH=$out/bin:$PATH; fi
  fi
}

# A failed build leaves an empty packages/sdk/js/openapi.json (script/build.ts writes it before generating and removes it at the end); it makes the next run's tree dirty.
stand_clean_debris() {
  local f=$1/packages/sdk/js/openapi.json
  if [ -f "$f" ] && [ ! -s "$f" ]; then rm -f "$f"; echo "removed the empty $f left by a failed build" >&2; fi
}
