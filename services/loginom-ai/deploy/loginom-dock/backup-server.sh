#!/bin/bash
# Consistent cold backup with the artifacts needed to restore a separate host.
set -euo pipefail
umask 077
test "$(id -u)" = 0
base=/opt/loginom-dock
mkdir -p "$base/backups"
exec 9>"$base/backup.lock"
flock -n 9 || { echo 'Another Dock backup is running' >&2; exit 1; }
if test -d "$base/assets"; then
    exec 8>"$base/assets/import.lock"
    flock -n 8 || { echo 'A Dock source import is running' >&2; exit 1; }
fi

destination="$base/backups/$(date -u +%Y%m%dT%H%M%SZ)"
mkdir "$destination"
volume=$(docker volume inspect loginom-dock_dock_data --format '{{.Mountpoint}}')
test -d "$volume"
test "$(docker inspect --format '{{.State.Running}}' loginom-dock-openviking-1)" = true
image=$(docker inspect --format '{{.Image}}' loginom-dock-openviking-1)
printf '%s\n' "$image" > "$destination/image-id"
readlink -f "$base/current" > "$destination/source-release"

# Export immutable images before the maintenance window. No pruning is implicit.
# Their hashes are referenced by each backup, and copied with it for off-host restore.
mkdir -p "$base/backups/images"
available=$(df -PB1 "$base" | awk 'NR==2 {print $4}')
test "$available" -ge 10737418240 || { echo 'Backup stopped: less than 10 GiB free' >&2; exit 1; }
for container in loginom-dock-openviking-1 loginom-dock-caddy-1 loginom-dock-ollama-1 loginom-dock-gitlab-gateway-1 loginom-dock-gitlab-lfs-proxy-1; do
    identity=$(docker inspect --format '{{.Image}}' "$container")
    archive="$base/backups/images/${identity#sha256:}.tar.gz"
    if test -f "$archive"; then
        (cd "$base/backups/images"; sha256sum -c "${identity#sha256:}.tar.gz.sha256")
    else
        docker image save "$identity" | gzip -1 > "$archive.pending"
        gzip -t "$archive.pending"
        mv "$archive.pending" "$archive"
        (cd "$base/backups/images"; sha256sum "${identity#sha256:}.tar.gz" > "${identity#sha256:}.tar.gz.sha256")
    fi
    printf '%s %s\n' "$container" "$identity" >> "$destination/container-images"
    (cd "$destination"; sha256sum "../images/${identity#sha256:}.tar.gz") >> "$destination/image-checksums"
done

source_release=$(cat "$destination/source-release")
test -f "$source_release/source.tar.gz"
cp "$source_release/source.tar.gz" "$destination/source.tar.gz"
tar --numeric-owner --exclude='*.log' --exclude='*.pid' --exclude='*.exit' \
    -czf "$destination/deployment.tar.gz" -C "$base" tools deploy-stage2/compose.gitlab.yaml deploy-stage2/gitlab-lfs-proxy.py

# Always restore service, including when archiving fails.
trap 'docker start loginom-dock-ollama-1 loginom-dock-caddy-1 loginom-dock-gitlab-gateway-1 loginom-dock-gitlab-lfs-proxy-1 loginom-dock-openviking-1 >/dev/null' EXIT
docker stop --time 60 loginom-dock-openviking-1 >/dev/null
docker stop --time 30 loginom-dock-caddy-1 loginom-dock-ollama-1 loginom-dock-gitlab-gateway-1 loginom-dock-gitlab-lfs-proxy-1 >/dev/null
tar --numeric-owner -czf "$destination/data.tar.gz" -C "$volume" .
for name in caddy_data caddy_config ollama_data gitlab_tls; do
    mount=$(docker volume inspect "loginom-dock_$name" --format '{{.Mountpoint}}')
    test -d "$mount"
    tar --numeric-owner -czf "$destination/$name.tar.gz" -C "$mount" .
done
tar --numeric-owner -czf "$destination/config.tar.gz" -C "$base" config
if test -d "$base/assets"; then
    tar --numeric-owner --exclude='*.log' --exclude='*.pid' --exclude='*.exit' \
        --exclude='import.lock' -czf "$destination/assets.tar.gz" -C "$base" assets
fi
(
    cd "$destination"
    sha256sum data.tar.gz config.tar.gz source.tar.gz deployment.tar.gz \
        caddy_data.tar.gz caddy_config.tar.gz ollama_data.tar.gz gitlab_tls.tar.gz \
        image-id source-release container-images image-checksums > SHA256SUMS
    if test -f assets.tar.gz; then sha256sum assets.tar.gz >> SHA256SUMS; fi
    sha256sum -c SHA256SUMS
)
docker start loginom-dock-ollama-1 loginom-dock-caddy-1 loginom-dock-gitlab-gateway-1 loginom-dock-gitlab-lfs-proxy-1 loginom-dock-openviking-1 >/dev/null
trap - EXIT
python3 - <<'PY'
import time, urllib.request
for _ in range(45):
    try:
        with urllib.request.urlopen('http://127.0.0.1:1933/ready', timeout=5) as response:
            if response.status == 200: break
    except Exception: pass
    time.sleep(2)
else: raise SystemExit('Dock did not become ready after backup')
PY
printf '%s\n' "$destination" > "$base/latest-backup.pending"
mv "$base/latest-backup.pending" "$base/latest-backup"
printf 'Backup saved: %s\n' "$destination"
