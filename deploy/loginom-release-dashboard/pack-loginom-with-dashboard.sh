#!/usr/bin/env bash
set -euo pipefail
umask 022

[[ $# == 3 ]] || { echo "Usage: $0 <Enterprise archive> <Dashboard archive> <output directory>" >&2; exit 2; }
here=$(cd -- "$(dirname -- "$0")" && pwd)
base=loginom-release-7.4.2-6e72ef0f1824.tar
dashboard=loginom-dashboard-c74c2d1dd4d18dfd.tar.gz
release=${base%.tar}-dashboard-m7

mkdir -p -- "$3"
out=$(cd -- "$3" && pwd)
tmp=$(mktemp -d -- "$out/.loginom-pack.XXXXXXXX")
trap 'rm -rf -- "$tmp"' EXIT
stage="$tmp/$release"
mkdir -- "$stage"
install -m 644 -- "$1" "$stage/$base"
[[ $(sha256sum < "$stage/$base") == 'c46b25113439a30c719b0e9b52c68d8361922fe6d0980a7c12e6956ade7e04d8  -' ]] ||
  { echo "Unsupported Enterprise archive. Expected $base." >&2; exit 1; }
install -m 644 -- "$2" "$stage/$dashboard"
[[ $(sha256sum < "$stage/$dashboard") == '53616f7464b11c5727792ad6f2a67de2a9084647eb8012af8105970a0de4aebe  -' ]] ||
  { echo "Unsupported Dashboard archive. Expected $dashboard." >&2; exit 1; }
install -m 644 -- "$here/README.md" "$here/compose.dashboard.yaml" "$stage/"
install -m 755 -- "$here/dashboard-742.sh" "$here/normalize-m7-image.sh" "$stage/"
tar -xOf "$stage/$dashboard" loginom-dashboard/containers.sh > "$tmp/containers.sh"
patch --batch --fuzz=0 --silent -o "$stage/containers-742.sh" "$tmp/containers.sh" "$here/containers-742.patch"
chmod 755 "$stage/containers-742.sh"
bash -n "$stage/containers-742.sh"

(cd "$stage" && sha256sum -- "$base" "$dashboard" README.md compose.dashboard.yaml dashboard-742.sh containers-742.sh normalize-m7-image.sh > SHA256SUMS)
LC_ALL=C tar -C "$tmp" --format=gnu --sort=name --owner=0 --group=0 --numeric-owner --mtime=@0 -cf "$tmp/$release.tar" "$release"
(cd "$tmp" && sha256sum -- "$release.tar" > "$release.tar.sha256")
mv -- "$tmp/$release.tar" "$tmp/$release.tar.sha256" "$out/"
printf '%s\n' "$out/$release.tar"
