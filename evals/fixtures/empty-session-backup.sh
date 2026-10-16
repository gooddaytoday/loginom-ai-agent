set -eu
test "$#" = 1
test -d "$1" && ! test -L "$1"
test "$(readlink -f -- "$1")" = "$1"
entry=$(find -P "$1" -mindepth 1 -print -quit)
test -z "$entry"
