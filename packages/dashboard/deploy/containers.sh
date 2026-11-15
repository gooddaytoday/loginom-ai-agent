#!/usr/bin/env bash
set -euo pipefail
die() { echo "$*" >&2; exit 1; }
usage="Usage: $0 install --engine docker --public-host HOST [--app-host-port PORT]"
[[ ${1:-} == install ]] || die "$usage"
shift
engine='' host='' app_port=8101
while [[ $# -gt 0 ]]; do
  [[ $# -ge 2 ]] || die "$usage"
  case $1 in
    --engine) engine=$2;;
    --public-host) host=$2;;
    --app-host-port) app_port=$2;;
    *) die "$usage";;
  esac
  shift 2
done
[[ $engine == docker && $host =~ ^[a-zA-Z0-9][a-zA-Z0-9.-]*$ ]] || die "$usage"
[[ $app_port =~ ^[1-9][0-9]{0,4}$ && $app_port -le 65535 ]] || die "Invalid app host port"
bundle=$(cd "$(dirname "$0")" && pwd)
state=/var/opt/loginom-dashboard
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
if docker compose version >/dev/null 2>&1; then compose=(docker compose); else compose=(docker-compose); fi
command -v "${compose[0]}" >/dev/null || die "Docker Compose is required"
(cd "$bundle" && sha256sum -c SHA256SUMS) || die "Release checksum mismatch"
image=$(cat "$bundle/image.ref")
[[ $image =~ ^[a-zA-Z0-9][a-zA-Z0-9._/:@-]+$ ]] || die "Invalid image.ref"
mapfile -t studios < <(docker ps --filter label=com.docker.compose.service=loginom-http --format '{{.ID}}')
[[ ${#studios[@]} == 1 ]] || die "Expected one running standard Loginom installation"
studio=${studios[0]}
project=$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' "$studio")
mapfile -t servers < <(docker ps --filter "label=com.docker.compose.project=$project" --filter label=com.docker.compose.service=loginom-server --format '{{.ID}}')
[[ ${#servers[@]} == 1 ]] || die "Loginom server not found in selected installation"
server=${servers[0]}
conf=$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/usr/local/apache2/conf"}}{{.Source}}{{end}}{{end}}' "$studio")
server_root=$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/workdir"}}{{.Source}}{{end}}{{end}}' "$server")
[[ -d $conf && -d $server_root/UserStorage ]] || die "Standard Loginom configuration and UserStorage not found"
[[ $server_root =~ ^/[a-zA-Z0-9/_.-]+$ ]] || die "Unsupported UserStorage path"
network=
while read -r candidate; do
  if docker inspect --format '{{range $name, $_ := .NetworkSettings.Networks}}{{println $name}}{{end}}' "$server" | grep -Fxq "$candidate"; then
    network=$candidate
    break
  fi
done < <(docker inspect --format '{{range $name, $_ := .NetworkSettings.Networks}}{{println $name}}{{end}}' "$studio")
[[ -n $network ]] || die "Loginom containers have no common network"
studio_name=$(docker inspect --format '{{.Name}}' "$studio")
studio_name=${studio_name#/}
http_port=$(docker port "$studio" 80/tcp 2>/dev/null | head -n 1 | awk -F: '{print $NF}' || true)
https_port=$(docker port "$studio" 443/tcp 2>/dev/null | head -n 1 | awk -F: '{print $NF}' || true)
[[ -n $http_port || -n $https_port ]] || die "No published Studio HTTP or HTTPS port"
clients='' scheme=http upstream=''
if [[ -n $http_port ]]; then
  clients="http://$host:$http_port"
  [[ $http_port != 80 ]] || clients="http://$host"
fi
if [[ -n $https_port ]]; then
  https_origin="https://$host:$https_port"
  [[ $https_port != 443 ]] || https_origin="https://$host"
  clients="${clients:+$clients,}$https_origin"
  scheme=https
  upstream=$studio_name:8444
  docker exec "$studio" test -f /usr/local/apache2/modules/mod_substitute.so || die "Apache mod_substitute is required"
  docker exec "$studio" sh -c '! grep -qiE "[0-9A-F]+:20FC .* 0A " /proc/net/tcp /proc/net/tcp6' || die "Apache port 8444 is occupied"
fi
app_origin="$scheme://$host:$app_port"
if [[ $scheme == https && $app_port == 443 || $scheme == http && $app_port == 80 ]]; then app_origin="$scheme://$host"; fi
[[ -z $(ss -H -lnt "sport = :$app_port") ]] || die "App host port is occupied"
for role in web publisher builder; do
  ! docker container inspect "loginom-dashboard-$role" >/dev/null 2>&1 || die "Dashboard container already exists"
done
publisher_user=$(docker exec "$server" stat -c '%u:%g' /proc/1)
docker load -i "$bundle/image.tar"
docker image inspect "$image" >/dev/null
install -d -m 755 "$state"
install -d -m 777 "$state/builds" "$state/jobs-in" "$state/jobs-out"
cp "$bundle/compose-release.yaml" "$state/compose-release.yaml"
cat > "$state/.env" <<EOF
DASHBOARD_IMAGE=$image
DASHBOARD_STATE=$state
DASHBOARD_APP_HOST_PORT=$app_port
DASHBOARD_APP_ORIGIN=$app_origin
DASHBOARD_CLIENT_ORIGINS=$clients
DASHBOARD_TLS_UPSTREAM=$upstream
DASHBOARD_USERSTORAGE=$server_root/UserStorage
DASHBOARD_PUBLISHER_USER=$publisher_user
DASHBOARD_NETWORK=$network
EOF
integrity=$(docker run --rm --network none --read-only --cap-drop ALL --security-opt no-new-privileges --user 65534:65534 --entrypoint /opt/node/bin/node "$image" --input-type=module -e 'import {readFileSync} from "node:fs"; import {createHash} from "node:crypto"; console.log("sha384-"+createHash("sha384").update(readFileSync("/opt/dashboard/shell.js")).digest("base64"))')
cat > "$tmp/dashboard.site.conf" <<EOF
<IfModule !substitute_module>
  LoadModule substitute_module modules/mod_substitute.so
</IfModule>
ProxyPreserveHost On
RewriteEngine On
RewriteOptions InheritDownBefore
RewriteRule ^/dashboard/(.*)$ http://loginom-dashboard-web:8100/dashboard/\$1 [P,L]
<LocationMatch "^/app/(index\\.html)?$">
  RequestHeader unset If-None-Match
  RequestHeader unset If-Modified-Since
  Header unset ETag
  Header unset Last-Modified
  Header always set Cache-Control "no-store"
  Substitute "s|</head>|<script src=\"/dashboard/shell.js\" integrity=\"$integrity\" data-dashboard-studio-https-port=\"$https_port\"></script></head>|n"
  <If "%{HTTP:Accept-Encoding} =~ /br/">
    SetOutputFilter SUBSTITUTE;BROTLI_COMPRESS
  </If>
  <ElseIf "%{HTTP:Accept-Encoding} =~ /gzip/">
    SetOutputFilter SUBSTITUTE;DEFLATE
  </ElseIf>
  <Else>
    SetOutputFilter SUBSTITUTE
  </Else>
</LocationMatch>
<Location /app/>
  Header always set Content-Security-Policy "frame-src $app_origin; object-src 'none'; frame-ancestors 'none'"
</Location>
EOF
if [[ $scheme == https ]]; then
  cat >> "$tmp/dashboard.site.conf" <<'EOF'
Listen 8444
<VirtualHost *:8444>
  RewriteOptions IgnoreInherit
  ProxyPreserveHost On
  Include conf/snippets/ssl.conf
  SSLCertificateFile "${SSL_CERT}"
  SSLCertificateKeyFile "${SSL_KEY}"
  ProxyPass / http://loginom-dashboard-web:8102/
  ProxyPassReverse / http://loginom-dashboard-web:8102/
</VirtualHost>
EOF
fi
site=$conf/dashboard.site.conf
[[ ! -e $site ]] || cp -p "$site" "$tmp/previous.conf"
install -m 644 "$tmp/dashboard.site.conf" "$site.new"
mv -f "$site.new" "$site"
if ! docker exec "$studio" httpd -t; then
  if [[ -e $tmp/previous.conf ]]; then cp -p "$tmp/previous.conf" "$site.new"; mv -f "$site.new" "$site"; else rm -f "$site"; fi
  die "Apache configuration rejected; previous file restored"
fi
(cd "$state" && "${compose[@]}" -p loginom-dashboard -f compose-release.yaml up -d)
docker exec "$studio" httpd -k graceful
echo "Dashboard installed at $app_origin; verify the client connection separately."
