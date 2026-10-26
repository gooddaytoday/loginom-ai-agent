set -eu
test "$#" -ge 3
root=$1
expected=$2
prefix_count=$3
shift 3
test -d "$root" && ! test -L "$root"
test "$(readlink -f -- "$root")" = "$root"
test "$(stat --printf '%d %i %u %g' -- "$root")" = "$expected"
case "$prefix_count" in ''|*[!0-9]*) exit 1 ;; esac
test "$prefix_count" -le "$#"
validate_claims() {
  count=$prefix_count
  while test "$count" -gt 0; do
    prefix=$1
    shift
    case "$prefix" in eval-?*) ;; *) exit 1 ;; esac
    case "$prefix" in *[!a-zA-Z0-9._-]*) exit 1 ;; esac
    count=$((count - 1))
  done
  while test "$#" -gt 0; do
    test "$#" -ge 3
    hash=$1 bytes=$2 name=$3
    shift 3
    test "${#hash}" -eq 64
    case "$hash" in *[!a-f0-9]*) exit 1 ;; esac
    case "$bytes" in ''|*[!0-9]*) exit 1 ;; esac
    case "$name" in ''|.|..|*[!a-zA-Z0-9._-]*) exit 1 ;; esac
    if test -e "$root/$name" || test -L "$root/$name"; then
      test -f "$root/$name" && ! test -L "$root/$name"
      test "$(stat --printf '%s' -- "$root/$name")" = "$bytes"
      actual=$(sha256sum -- "$root/$name")
      test "${actual%% *}" = "$hash"
    fi
  done
}
has_claim() {
  child=$1 count=$prefix_count
  shift
  while test "$count" -gt 0; do
    case "$child" in "$1".*) return 0 ;; esac
    shift
    count=$((count - 1))
  done
  while test "$#" -gt 0; do
    test "$child" != "$3" || return 0
    shift 3
  done
  return 1
}
validate_claims "$@"
# Validate all children before deleting anything; unclaimed files preserve the entire root.
for entry in "$root"/* "$root"/.[!.]* "$root"/..?*; do
  test -e "$entry" || test -L "$entry" || continue
  has_claim "${entry##*/}" "$@"
done
find -P "$root" -xdev -mindepth 1 -depth -delete
remaining=$(find -P "$root" -mindepth 1 -print -quit)
test -z "$remaining"
