#!/usr/bin/env bash
set -euo pipefail

[[ $# == 1 ]] || { echo "Usage: $0 <already loaded Dashboard M7 image>" >&2; exit 2; }
here=$(cd -- "$(dirname -- "$0")" && pwd)
source_image=$1
derived=loginom-dashboard:enterprise-742-permission-test-$$
source_id=$(docker image inspect --format '{{.Id}}' "$source_image")
trap 'docker image rm "$derived" >/dev/null 2>&1 || true' EXIT
"$here/normalize-m7-image.sh" "$source_image" "$derived"
derived_id=$(docker image inspect --format '{{.Id}}' "$derived")
[[ $derived_id != "$source_id" ]]
"$here/normalize-m7-image.sh" "$source_image" "$derived"
[[ $(docker image inspect --format '{{.Id}}' "$derived") == "$derived_id" ]]
[[ $(docker image inspect --format '{{.Id}}' "$source_image") == "$source_id" ]]
[[ $(docker image inspect --format '{{json .Config.Entrypoint}}' "$derived") == \
  "$(docker image inspect --format '{{json .Config.Entrypoint}}' "$source_image")" ]]
[[ $(docker image inspect --format '{{len .Config.Cmd}}' "$derived") == 0 ]]

read_runtime='const { createHash } = require("node:crypto");
const { readFileSync, readdirSync } = require("node:fs");
const hash = createHash("sha256");
for (const entry of ["shell.js", "server.mjs", "template/package.json", ...readdirSync("/opt/dashboard/template/src").sort().map(name => "template/src/" + name)]) {
  hash.update(readFileSync("/opt/dashboard/" + entry));
}
console.log(hash.digest("hex"))'
run=(docker run --rm --pull never --network none --read-only --cap-drop ALL --security-opt no-new-privileges --entrypoint /opt/node/bin/node)
expected=$("${run[@]}" "$source_image" -e "$read_runtime")
for uid in 65534:65534 701:701; do
  [[ $("${run[@]}" --user "$uid" "$derived" -e "$read_runtime") == "$expected" ]]
done
