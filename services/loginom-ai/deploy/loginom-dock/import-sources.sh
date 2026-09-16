#!/bin/sh
# Explicit native Assets refresh. Credentials and State stay in Dock-owned paths.
set -eu
umask 077
exec 9>/opt/loginom-dock/assets/import.lock
flock -n 9 || { echo 'A Dock source import is already running' >&2; exit 1; }
source=${1:-all}
case "$source" in
  all) manifest=/opt/loginom-dock/assets/sources.yaml ;;
  ai-skills|e2e-tests|loginom-help)
    manifest="/opt/loginom-dock/assets/sources-$source.yaml"
    printf 'protocol: openviking-assets/1\nassets:\n  - %s\n' "$source" > "$manifest"
    ;;
  *) echo 'Unknown Dock source' >&2; exit 1 ;;
esac
docker exec loginom-dock-openviking-1 ov add-resource \
  --manifest "$manifest" --wait --timeout 3600
python3 /opt/loginom-dock/tools/audit-sources.py \
  --client /opt/loginom-dock/config/client.json \
  --baseline /opt/loginom-dock/assets/source-baseline.json \
  --output /opt/loginom-dock/assets/source-audit.json
