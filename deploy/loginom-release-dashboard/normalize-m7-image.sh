#!/usr/bin/env bash
set -euo pipefail

[[ $# == 2 && $1 != "$2" ]] || { echo "Usage: $0 <original M7 image> <derived image tag>" >&2; exit 2; }
source_id=$(docker image inspect --format '{{.Id}}' "$1")
if derived_source=$(docker image inspect --format '{{index .Config.Labels "org.loginom.dashboard.source-image"}}' "$2" 2>/dev/null); then
  [[ $derived_source == "$source_id" ]] || { echo "Derived Dashboard image tag is occupied: $2" >&2; exit 1; }
  exit 0
fi

container=$(docker create --pull never --network none --cap-drop ALL --security-opt no-new-privileges \
  --entrypoint /bin/sh "$source_id" -ec '
    find /opt/dashboard -type d ! -perm -005 -exec chmod a+rx {} +
    find /opt/dashboard -type f ! -perm -004 -exec chmod a+r {} +
  ')
trap 'docker container rm -f "$container" >/dev/null' EXIT
docker start --attach "$container"
[[ $(docker inspect --type container --format '{{.State.ExitCode}}' "$container") == 0 ]]
docker commit --pause=false \
  --change 'ENTRYPOINT ["/opt/node/bin/node","/opt/dashboard/server.mjs"]' \
  --change 'CMD []' \
  --change "LABEL org.loginom.dashboard.source-image=$source_id" \
  "$container" "$2" >/dev/null
