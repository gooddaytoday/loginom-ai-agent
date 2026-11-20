#!/usr/bin/env bash
set -euo pipefail

die() { echo "$*" >&2; exit 1; }
usage="Usage: $0 install --public-host HOST [--app-host-port PORT] | check | uninstall"
action=${1:-}
case "$action" in
  install|check|uninstall) shift ;;
  *) die "$usage" ;;
esac
if [[ $action == install ]]; then
  [[ ($# == 2 || $# == 4) && $1 == --public-host && $2 =~ ^[a-zA-Z0-9][a-zA-Z0-9.-]*$ ]] || die "$usage"
  if [[ $# == 4 ]]; then
    [[ $3 == --app-host-port && $4 =~ ^[1-9][0-9]{0,4}$ && $4 -le 65535 ]] || die "$usage"
  fi
else
  [[ $# == 0 ]] || die "$usage"
fi
[[ $EUID == 0 ]] || die "Run as root."

version_at_least() {
  local found=${1#v} minimum=$2
  found=${found%%[-+]*}
  [[ $found =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] &&
    [[ $(printf '%s\n' "$minimum" "$found" | sort -V | head -n 1) == "$minimum" ]]
}
version_at_least "$(docker version --format '{{.Server.Version}}')" 29.1.3 || die "Docker Engine 29.1.3 or newer is required."
version_at_least "$(docker compose version --short)" 2.40.3 || die "Docker Compose 2.40.3 or newer is required."

bundle=$(cd -- "$(dirname -- "$0")" && pwd)
base=/opt/loginom-release
addon=/opt/loginom-release-dashboard
m7_state=/var/opt/loginom-dashboard
tag=7.4.2-6e72ef0f1824
marker="$addon/.loginom-dashboard-release"
exec 9>/run/loginom-release-dashboard.lock
flock -x 9
if [[ -e $addon || -L $addon ]]; then
  [[ -d $addon && ! -L $addon && -d $addon/apache-conf && ! -L $addon/apache-conf &&
    -f $marker && ! -L $marker && $(cat "$marker") == "$tag" &&
    -f $addon/apache-conf/httpd.conf && ! -L $addon/apache-conf/httpd.conf ]] ||
    die "Existing Apache configuration is not owned by this Dashboard release."
fi
(cd "$bundle" && sha256sum -c SHA256SUMS)
tar -xOf "$bundle/loginom-release-$tag.tar" "loginom-release-$tag/compose.yaml" | cmp -s -- "$base/compose.yaml" - ||
  die "Installed Compose does not match the supported Enterprise archive."
[[ $(sed -n 's/^RELEASE_TAG=//p' "$base/.env") == "$tag" ]] || die "Unsupported installed Enterprise version."
unset RELEASE_TAG DATA_DIR HTTP_BIND HTTP_PORT
base_compose=(docker compose -p loginom-release --project-directory "$base" --env-file "$base/.env" -f "$base/compose.yaml")
dashboard_compose=("${base_compose[@]}" -f "$bundle/compose.dashboard.yaml")

for service in http server integrator; do
  name=loginom-release-$service
  expected_image="$name:$tag"
  actual=$(docker inspect --type container --format '{{.State.Running}} {{index .Config.Labels "com.docker.compose.project"}} {{index .Config.Labels "com.docker.compose.service"}} {{.Config.Image}} {{.Image}}' "$name")
  image_id=$(docker image inspect --format '{{.Id}}' "$expected_image")
  [[ $actual == "true loginom-release $service $expected_image $image_id" ]] ||
    die "Expected the running Enterprise container $name from the supported release."
done
studio=loginom-release-http
mount=$(docker inspect --type container --format '{{range .Mounts}}{{if eq .Destination "/usr/local/apache2/conf"}}{{println .Source}}{{end}}{{end}}' "$studio")
[[ -z $mount || $mount == "$addon/apache-conf" ]] || die "Studio Apache configuration is already mounted from another location."
if [[ $action == install ]]; then
  "$base/verify.sh" --wait 30
  if [[ ! -e $addon ]]; then
    [[ -z $mount && ! -e $m7_state && ! -L $m7_state ]] || die "Existing Dashboard state requires recovery before installation."
  fi
else
  [[ -d $addon && $mount == "$addon/apache-conf" ]] || die "Dashboard configuration is not mounted."
fi

tmp=$(mktemp -d)
trap 'rm -rf -- "$tmp"' EXIT
tar -xf "$bundle/loginom-dashboard-c74c2d1dd4d18dfd.tar.gz" -C "$tmp"
(cd "$tmp/loginom-dashboard" && sha256sum -c SHA256SUMS)
install -m 755 -- "$bundle/containers-742.sh" "$bundle/normalize-m7-image.sh" "$tmp/loginom-dashboard/"
dashboard="$tmp/loginom-dashboard/containers-742.sh"

restore_http() {
  "${base_compose[@]}" up -d --no-deps --force-recreate http
}

case "$action" in
  check)
    "$dashboard" check
    "$base/verify.sh" --wait 30
    ;;
  uninstall)
    if ! "$dashboard" uninstall; then
      restore_http || echo "Failed to restore the stock Studio container." >&2
      die "Dashboard uninstall failed. Inspect retained Dashboard state."
    fi
    restore_http
    mv -- "$addon" "$tmp/uninstalled-conf"
    "$base/verify.sh" --wait 30
    ;;
  install)
    fresh=false
    if [[ ! -e $addon ]]; then
      mkdir -- "$tmp/apache-conf"
      docker run --rm --pull never --network none --entrypoint tar "loginom-release-http:$tag" \
        -C /usr/local/apache2/conf -cf - . | tar -xf - -C "$tmp/apache-conf"
      cat >> "$tmp/apache-conf/httpd.conf" <<'APACHE'

LoadModule rewrite_module modules/mod_rewrite.so
LoadModule env_module modules/mod_env.so
LoadModule brotli_module modules/mod_brotli.so
IncludeOptional conf/dashboard.site.conf
APACHE
      mkdir -- "$addon"
      mv -- "$tmp/apache-conf" "$addon/apache-conf"
      printf '%s\n' "$tag" > "$marker"
      fresh=true
    fi
    if "${dashboard_compose[@]}" up -d --no-deps http &&
      docker exec "$studio" httpd -t &&
      "$dashboard" install "$@"; then
      exit 0
    fi
    if [[ $fresh == true && -f $m7_state/.env ]]; then
      "$dashboard" uninstall || echo "Dashboard state retained after failed cleanup." >&2
    fi
    if [[ -z $mount ]]; then
      restore_http || die "Dashboard installation failed and stock Studio could not be restored."
    fi
    if [[ $fresh == true && ! -e $m7_state ]]; then
      mv -- "$addon" "$tmp/failed-conf"
    fi
    die "Dashboard installation failed."
    ;;
esac
