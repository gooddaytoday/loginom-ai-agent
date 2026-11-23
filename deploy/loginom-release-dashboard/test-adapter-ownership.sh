#!/usr/bin/env bash
set -euo pipefail

[[ $# == 1 ]] || { echo "Usage: $0 <already loaded Enterprise server image>" >&2; exit 2; }
here=$(cd -- "$(dirname -- "$0")" && pwd)
docker run --rm --pull never --network none --user 0 -i --entrypoint /bin/bash \
  -v "$here/dashboard-742.sh:/adapter.sh:ro" "$1" -s <<'TEST'
set -euo pipefail
mkdir -p /opt/loginom-release-dashboard/apache-conf
cat > /usr/local/bin/docker <<'DOCKER'
#!/bin/sh
case "$1" in
  version) echo 29.1.3 ;;
  compose) [ "$2" = version ] && echo 2.40.3 ;;
  *) exit 128 ;;
esac
DOCKER
chmod +x /usr/local/bin/docker
addon=/opt/loginom-release-dashboard
printf '%s\n' keep > "$addon/apache-conf/httpd.conf"
if bash /adapter.sh uninstall > /tmp/output 2>&1; then
  echo "The adapter accepted a foreign Apache configuration." >&2
  exit 1
fi
grep -q "Existing Apache configuration is not owned by this Dashboard release" /tmp/output
test "$(cat "$addon/apache-conf/httpd.conf")" = keep
mv "$addon/apache-conf/httpd.conf" /tmp/old.conf
ln -s /tmp/old.conf "$addon/apache-conf/httpd.conf"
printf '%s\n' 7.4.2-6e72ef0f1824 > "$addon/.loginom-dashboard-release"
if bash /adapter.sh install --public-host studio.example.test > /tmp/output 2>&1; then
  echo "The adapter accepted a symlink to an Apache configuration." >&2
  exit 1
fi
grep -q "Existing Apache configuration is not owned by this Dashboard release" /tmp/output
test -L "$addon/apache-conf/httpd.conf"
test "$(cat /tmp/old.conf)" = keep
TEST
