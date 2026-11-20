#!/usr/bin/env bash

dashboard_mounts() {
  local engine=$1 image=$2 state=$3 operation=$4 group=${5:-}
  local names=(builds jobs-in jobs-out) name binds=() paths=()
  if [[ $operation == clear ]]; then shift 4; names=("$@"); fi
  for name in "${names[@]}"; do
    if [[ $operation == clear && ! -e $state/$name && ! -L $state/$name ]]; then continue; fi
    [[ -d $state/$name && ! -L $state/$name ]] || return 1
    binds+=(--volume "$state/$name:/$name:rw,z")
    paths+=("/$name")
  done
  if [[ ${#paths[@]} == 0 ]]; then return 0; fi
  # Apply numeric permissions inside the same UID/GID mapping as the roles.
  # shellcheck disable=SC2016
  "$engine" run --pull never --rm -i --network none --read-only --cap-drop ALL \
    --cap-add CHOWN --cap-add FOWNER --cap-add FSETID --cap-add DAC_OVERRIDE --security-opt no-new-privileges \
    --user 0:0 "${binds[@]}" --entrypoint /bin/sh "$image" -ec '
      operation=$1 group=$2
      shift 2
      case "$operation" in
        read) stat -c "%g:%a" "$@" ;;
        apply) chgrp -- "$group" "$@"; chmod 02770 -- "$@" ;;
        restore)
          failure=0
          for path do
            IFS= read -r permissions
            # Two leading zeros let chmod clear inherited setgid as well.
            chgrp -- "${permissions%:*}" "$path" && chmod "00${permissions#*:}" -- "$path" || failure=1
          done
          exit "$failure" ;;
        clear) find "$@" -xdev -mindepth 1 -delete ;;
      esac
    ' sh "$operation" "$group" "${paths[@]}"
}
