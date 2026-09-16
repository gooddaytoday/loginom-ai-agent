#!/bin/sh
# Bootstrap the clean Ubuntu Dock host using Docker's signed apt repository.
set -eu

test "$(id -u)" = 0 || { echo 'Run as root.' >&2; exit 1; }
if command -v docker >/dev/null 2>&1; then
    docker version
    docker compose version
    exit 0
fi
. /etc/os-release
test "$ID" = ubuntu || { echo 'This bootstrap supports Ubuntu only.' >&2; exit 1; }
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl
install -m 0755 -d /etc/apt/keyrings
curl --fail --silent --show-error --retry 3 \
    https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
cat > /etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: ${UBUNTU_CODENAME:-$VERSION_CODENAME}
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker
docker version
docker compose version
