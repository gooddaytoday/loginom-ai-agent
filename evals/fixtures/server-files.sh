set -eu

printf 'B\0before\0'
for process in /proc/[0-9]*; do
  [ "$process" = "/proc/$$" ] || printf '%s ' "${process##*/}"
done
printf '\0'
cat /proc/1/stat
printf '\0'
cat /proc/locks
printf '\0\0'

for process in /proc/[0-9]*; do
  [ "$process" != "/proc/$$" ] || continue
  pid=${process##*/}
  printf 'P\0%s\0' "$pid"
  cat "$process/stat"
  printf '\0'
  cat "$process/maps"
  printf '\0\0\0'
  for entry in "$process"/fd/*; do
    target=$(readlink -n "$entry" && printf .)
    target=${target%.}
    case "$target" in
      /workdir/UserStorage/*|/workdir/SessionBackup/*)
        printf 'F\0%s\0%s\0%s\0' "$pid" "${entry##*/}" "$target"
        stat -L --printf '%d:%i:%h:%F' "$entry"
        printf '\0'
        cat "$process/fdinfo/${entry##*/}"
        printf '\0'
        ;;
    esac
  done
  printf 'E\0%s\0' "$pid"
  cat "$process/stat"
  printf '\0\0\0\0'
done

printf 'B\0after\0'
for process in /proc/[0-9]*; do
  [ "$process" = "/proc/$$" ] || printf '%s ' "${process##*/}"
done
printf '\0'
cat /proc/1/stat
printf '\0'
cat /proc/locks
printf '\0\0'
