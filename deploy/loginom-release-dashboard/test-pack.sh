#!/usr/bin/env bash
set -euo pipefail

[[ $# == 2 ]] || { echo "Usage: $0 <Enterprise archive> <Dashboard archive>" >&2; exit 2; }
here=$(cd -- "$(dirname -- "$0")" && pwd)
scratch=$(mktemp -d)
trap 'rm -rf -- "$scratch"' EXIT

base=loginom-release-7.4.2-6e72ef0f1824
dashboard=loginom-dashboard-c74c2d1dd4d18dfd.tar.gz
name="$base-dashboard-m7.tar"
"$here/pack-loginom-with-dashboard.sh" "$1" "$2" "$scratch/first"
"$here/pack-loginom-with-dashboard.sh" "$1" "$2" "$scratch/second"
cmp "$scratch/first/$name" "$scratch/second/$name"
(cd "$scratch/first" && sha256sum -c "$name.sha256")
tar -xf "$scratch/first/$name" -C "$scratch"
release="$scratch/${name%.tar}"
(cd "$release" && sha256sum -c SHA256SUMS)
cmp "$release/$base.tar" "$1"
cmp "$release/$dashboard" "$2"
bash -n "$release/dashboard-742.sh"
bash -n "$release/containers-742.sh"
if "$here/pack-loginom-with-dashboard.sh" "$1" "$1" "$scratch/invalid"; then
  echo "Packaging accepted the wrong Dashboard archive" >&2
  exit 1
fi
test ! -e "$scratch/invalid/$name"
