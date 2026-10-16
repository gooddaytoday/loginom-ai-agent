set -eu
test "$#" -ge 2
root=$1
expected=$2
shift 2
test -d "$root" && ! test -L "$root"
test "$(readlink -f -- "$root")" = "$root"
test "$(stat --printf '%d %i %u %g' -- "$root")" = "$expected"
for prefix do
  case "$prefix" in eval-?*) ;; *) exit 1 ;; esac
  case "$prefix" in *[!a-zA-Z0-9._-]*) exit 1 ;; esac
done
# Validate all children before deleting anything; unclaimed files preserve the entire root.
for entry in "$root"/* "$root"/.[!.]* "$root"/..?*; do
  test -e "$entry" || test -L "$entry" || continue
  owned=false
  for prefix do
    case "${entry##*/}" in "$prefix".*) owned=true ;; esac
  done
  test "$owned" = true
done
find -P "$root" -xdev -mindepth 1 -depth -delete
remaining=$(find -P "$root" -mindepth 1 -print -quit)
test -z "$remaining"
