#!/bin/sh
# Recreates the OpenCode sandbox for the spike: a detached worktree at opencode/ on the target tag, its dependencies,
# plugin links, and the seam patches. Usage: setup.sh [tag]   (default v2.3.0)
set -eu
here=$(cd "$(dirname "$0")" && pwd)
tag=${1:-v2.3.0}
repo=$(git -C "$here" rev-parse --show-toplevel)
git -C "$repo" remote get-url opencode >/dev/null 2>&1 || git -C "$repo" remote add opencode https://github.com/anomalyco/opencode.git
git -C "$repo" fetch opencode tag "$tag" --no-tags
[ -d "$here/opencode" ] || git -C "$repo" worktree add --detach "$here/opencode" "$tag"
(cd "$here/opencode" && bun install)
for plugin in loginom-product impostor; do ln -sfn ../../opencode/node_modules "$here/plugin/$plugin/node_modules"; done
ln -sfn ../../../../../plugin/loginom-product "$here/opencode/packages/core/src/plugin/loginom-product"
for patch in "$here"/patches/*.patch; do
  if git -C "$here/opencode" apply --check "$patch" 2>/dev/null; then git -C "$here/opencode" apply "$patch"; else echo "skip $patch (already applied or conflicting)"; fi
done
