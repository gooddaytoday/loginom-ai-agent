#!/usr/bin/env bash
set -euo pipefail
die() { echo "$*" >&2; exit 1; }
usage="Usage: $0 install --engine docker --public-host HOST [--app-host-port PORT] | check --engine docker"
action=${1:-}
[[ $action == install || $action == check ]] || die "$usage"
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
[[ $action != check || -n $engine ]] || engine=docker
[[ $engine == docker ]] || die "$usage"
[[ $action == check || $host =~ ^[a-zA-Z0-9][a-zA-Z0-9.-]*$ ]] || die "$usage"
[[ $app_port =~ ^[1-9][0-9]{0,4}$ && $app_port -le 65535 ]] || die "Invalid app host port"
bundle=$(cd "$(dirname "$0")" && pwd)
state=/var/opt/loginom-dashboard
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
# Saved installation is data, never shell code.
if [[ $action == check ]]; then
  (cd "$bundle" && sha256sum -c SHA256SUMS) || die "Release checksum mismatch"
  saved() { sed -n "s/^$1=//p" "$state/.env"; }
  [[ -f $state/.env ]] || die "Dashboard is not installed"
  image=$(saved DASHBOARD_IMAGE)
  [[ $image =~ ^[a-zA-Z0-9][a-zA-Z0-9._/:@-]+$ ]] || die "Invalid saved image"
  json() {
    docker run --rm -i --network none --read-only --cap-drop ALL --security-opt no-new-privileges \
      --memory 128m --pids-limit 32 --user 65534:65534 \
      -v "$bundle/check-release.mjs:/check.mjs:ro" --entrypoint /opt/node/bin/node "$image" /check.mjs "$@"
  }
  app_origin=$(saved DASHBOARD_APP_ORIGIN)
  clients=$(saved DASHBOARD_CLIENT_ORIGINS)
  storage=$(saved DASHBOARD_USERSTORAGE)
  json config "$app_origin" "$clients" "$storage" </dev/null
  origin=${clients##*,}
  request() { curl --silent --show-error --max-time 10 "$@"; }
  lookup() {
    json request "$probe" "$guid" "$workflow" "${1:-}" </dev/null | \
      request --fail -H 'Content-Type: application/json' --data-binary @- "$origin/dashboard/lookup"
  }
  probe=$(mktemp -d "$storage/dashboard-check-XXXXXXXX.lgp.dashboards")
  probe=${probe#"$storage/"}
  probe=${probe%.dashboards}
  guid=$(cat /proc/sys/kernel/random/uuid)
  workflow=$(cat /proc/sys/kernel/random/uuid)
  name=$(date -u +%Y%m%dT%H%M%SZ).json
  directory=$storage/$probe.dashboards/$guid
  publication=$directory/$name
  app_url='' html_file='' html_mode=''
  exec 3>&1 4>&2
  # ShellCheck cannot follow EXIT traps registered inside this branch.
  # shellcheck disable=SC2317
  cleanup() {
    result=$?
    exec 1>&3 2>&4
    trap - EXIT INT TERM
    if [[ -n $html_mode ]]; then chmod "$html_mode" "$html_file" || result=1; fi
    rm -f "$publication" "$directory/.upload"
    rmdir "$directory" "$storage/$probe.dashboards" 2>/dev/null || true
    deadline=$((SECONDS + 60))
    cleaned=false
    while (( SECONDS < deadline )); do
      if lookup > "$tmp/lookup.json" && json removed < "$tmp/lookup.json"; then
        if [[ -z $app_url || $(request -o /dev/null -w '%{http_code}' "$app_url") == 404 ]]; then cleaned=true; break; fi
      fi
      sleep 2
    done
    if [[ $cleaned == true ]]; then echo "Cleanup PASS: $probe";
    else echo "Cleanup incomplete: /$probe.dashboards/$guid/$name; source removed, publisher lookup/build residue unconfirmed${app_url:+; old build $app_url}" >&2; result=1; fi
    rm -rf "$tmp"
    exit "$result"
  }
  trap cleanup EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM
  echo "Probe source: $probe.dashboards/$guid/$name (SIGKILL requires manual source cleanup)"
  chmod 755 "$storage/$probe.dashboards"
  mkdir -m 755 "$directory"
  json publication "$probe" "$guid" "$workflow" </dev/null > "$directory/.upload"
  chmod 644 "$directory/.upload"
  source_hash=$(sha256sum "$directory/.upload" | cut -d ' ' -f 1)
  mv "$directory/.upload" "$publication"
  deadline=$((SECONDS + 120))
  while (( SECONDS < deadline )); do
    lookup "$name" > "$tmp/lookup.json"
    if app_url=$(json ready "$name" "$source_hash" "$app_origin" < "$tmp/lookup.json"); then break;
    else ready_result=$?; [[ $ready_result != 2 ]] || die "Publication build failed; cleanup follows"; fi
    sleep 2
  done
  [[ -n $app_url ]] || die "Publication incomplete: deadline reached; builder may be busy"
  request --fail "$app_url" > "$tmp/index.html"
  json assets < "$tmp/index.html" > "$tmp/assets"
  while read -r asset; do request --fail "$app_url$asset" -o /dev/null; done < "$tmp/assets"
  echo "Publication PASS: exact name/sourceHash, HTML and assets"
  http() {
    expected=$1 kind=$2 address=$3
    shift 3
    status=$(request -D "$tmp/headers" -o "$tmp/body" -w '%{http_code}' "$@" "$address")
    [[ $status == "$expected" ]] || die "HTTP check failed: $kind expected $expected, got $status"
    cat "$tmp/headers" "$tmp/body" | json response "$kind" "$app_origin" "$clients" "${integrity:-}" "${encoding:-identity}"
  }
  mapfile -t studios < <(docker ps --filter label=com.docker.compose.service=loginom-http --format '{{.ID}}')
  [[ ${#studios[@]} == 1 ]] || die "Expected one installed Studio"
  studio=${studios[0]}
  conf=$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/usr/local/apache2/conf"}}{{.Source}}{{end}}{{end}}' "$studio")
  docker exec "$studio" httpd -t
  modules=$(docker exec "$studio" httpd -M)
  for module in substitute headers proxy proxy_http env; do
    [[ $modules == *"${module}_module"* ]] || die "Required Apache module missing: $module"
  done
  grep -Fq 'Header always set Content-Security-Policy "sandbox; default-src' "$conf/dashboard.site.conf" || die "Missing Apache always CSP for API/errors"
  grep -Fq 'Header always set X-Content-Type-Options "nosniff"' "$conf/dashboard.site.conf" || die "Missing Apache always nosniff"
  integrity=$(docker exec loginom-dashboard-web /opt/node/bin/node --input-type=module -e 'import {readFileSync} from "node:fs"; import {createHash} from "node:crypto"; console.log("sha384-"+createHash("sha384").update(readFileSync("/opt/dashboard/shell.js")).digest("base64"))')
  IFS=, read -ra origins <<< "$clients"
  for client in "${origins[@]}"; do
    http 200 api "$client/dashboard/health"
    http 200 shell "$client/dashboard/shell.js"
    for encoding in identity gzip br; do
      http 200 studio "$client/app/" --compressed -H "Accept-Encoding: $encoding" -H 'If-None-Match: "check"' -H 'If-Modified-Since: Wed, 21 Oct 2037 07:28:00 GMT'
    done
    http 404 api "$client/dashboard/check-not-found"
    http 400 api "$client/dashboard/lookup" -H 'Content-Type: application/json' --data-binary '{'
    http 403 api "$client/dashboard/health" -H 'Host: dashboard.invalid'
    http 404 studio-error "$client/app/dashboard-check-not-found"
  done
  http 200 app "$app_url"
  while read -r asset; do http 200 app "$app_url$asset"; done < "$tmp/assets"
  for path in binding.json sample.json dashboard/health; do http 404 app "$app_origin/$path"; done
  http 403 app "$app_url" -H 'Host: dashboard.invalid'
  # Only our unique probe can be unreadable; always restore its exact prior mode.
  build_path=${app_url#"$app_origin/apps/"}
  [[ $build_path =~ ^[a-f0-9]{64}/[a-f0-9]{64}/$ ]] || die "Unexpected probe build path"
  html_file=$state/builds/${build_path}index.html
  html_mode=$(stat -c '%a' "$html_file")
  chmod 000 "$html_file"
  http 500 app "$app_url"
  chmod "$html_mode" "$html_file"
  html_mode=''
  http 200 app "$app_url"
  docker inspect loginom-dashboard-web loginom-dashboard-publisher loginom-dashboard-builder | json roles "$image" "$storage" "$state" "$(saved DASHBOARD_PUBLISHER_USER)" "$(saved DASHBOARD_NETWORK)" "$(docker image inspect --format '{{.Id}}' "$image")"
  [[ $(docker exec "$(docker ps --filter label=com.docker.compose.service=loginom-server --format '{{.ID}}')" stat -c '%u:%g' /proc/1) == "$(saved DASHBOARD_PUBLISHER_USER)" ]] || die "Publisher UID/GID differs from Loginom"
  for role in publisher builder; do
    docker exec "loginom-dashboard-$role" /opt/node/bin/node --input-type=module -e 'import {connect} from "node:net"; const socket=connect({host:"192.0.2.1",port:9}); socket.on("connect",()=>process.exit(1)); socket.on("error",()=>process.exit(0)); socket.setTimeout(2000,()=>{socket.destroy();process.exit(0)})'
  done
  docker exec loginom-dashboard-publisher /opt/node/bin/node --input-type=module -e 'import {readFileSync,openSync} from "node:fs"; readFileSync(process.argv[1]); try {openSync(process.argv[1],"r+");process.exit(1)} catch(e) {if(e.code!=="EROFS")throw e}' "/storage/$probe.dashboards/$guid/$name"
  echo "Server checks PASS: Apache/SRI/compression/headers/Host/isolation; mode normal"
  if [[ $app_origin == https:* ]]; then
    echo "TLS PASS: host curl verified OS trust, certificate name and validity"
    # Compare public certificates only; the private key remains in Apache.
    certificate=$(docker exec "$studio" cat /usr/local/apache2/conf/env.conf | json certificate-path)
    docker exec "$studio" cat "$certificate" | json certificate "$certificate"
  fi
  echo "Client access NOT CHECKED: run check-studio.mjs on the client host"
  exit 0
fi
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
<Location /dashboard/>
  Header always set Content-Security-Policy "sandbox; default-src 'none'" env=!DASHBOARD_APP_HOST
  Header always set X-Content-Type-Options "nosniff" env=!DASHBOARD_APP_HOST
</Location>
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
  SetEnv DASHBOARD_APP_HOST 1
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
