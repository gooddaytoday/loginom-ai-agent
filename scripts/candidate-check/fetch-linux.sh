#!/bin/sh
# B6.2-S: download the CI artifacts of one candidate SHA, check their SHA256SUMS and unpack the Linux CLI.
#   fetch-linux.sh <sha> <out-dir> [owner/repo]
# DRY=1 only prints the runs and artifacts found. Needs `gh` with read access to the fork. Writes only under <out-dir>.
# The Windows artifact (loginom-windows-unsigned-<run id>) is downloaded the same way and copied to the stand by hand.
set -eu
sha=$1
out=$2
repo=${3:-kartamyshev-dev/loginom-ai-agent-test}
case "$sha" in [0-9a-f]*) ;; *) echo "sha must be hex" >&2; exit 2 ;; esac
[ "${#sha}" -eq 40 ] || { echo "gh run list --commit needs the full 40-character sha" >&2; exit 2; }

# newest successful run per workflow for this commit; a missing one is an error, not a skip
runs=$(gh run list -R "$repo" --commit "$sha" --limit 100 --json databaseId,workflowName,conclusion \
  --jq '[.[]|select(.conclusion=="success")]|group_by(.workflowName)|map(max_by(.databaseId))|.[]|"\(.databaseId)\t\(.workflowName)"')
printf '%s\n' "$runs"
for wf in "Loginom Linux" "Loginom macOS candidate" "Loginom Windows candidate"; do
  printf '%s\n' "$runs" | grep -q "	$wf\$" || echo "no successful run: $wf" >&2
done
printf '%s\n' "$runs" | grep -q "	Loginom Linux\$" || exit 1
[ "${DRY:-}" = 1 ] && exit 0

mkdir -p "$out"
printf '%s\n' "$runs" | while IFS="	" read -r id name; do
  case "$name" in "Loginom Linux"|"Loginom macOS candidate"|"Loginom Windows candidate") ;; *) continue ;; esac
  gh run download "$id" -R "$repo" -D "$out/$id"
done
for dir in "$out"/*/loginom-linux-x64-cli "$out"/*/loginom-linux-x64-desktop; do
  (cd "$dir" && sha256sum -c SHA256SUMS)
done
cli=$(ls -d "$out"/*/loginom-linux-x64-cli)
mkdir -p "$out/cli" && tar --same-permissions -xzf "$cli"/loginom-ai-agent-cli-*-linux-x64.tar.gz -C "$out/cli"
# the archive is flat: bin/, resources/, cli-manifest.json. A throwaway HOME keeps the real profile untouched.
home=$(mktemp -d)
env -i HOME="$home" PATH=/usr/bin:/bin "$out/cli/bin/loginom-ai-agent-cli" --version
rm -rf "$home"
echo "CLI for live.mjs: $out/cli/bin/loginom-ai-agent-cli"
