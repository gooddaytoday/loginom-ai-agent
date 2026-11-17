#!/usr/bin/env bash
set -euo pipefail
die() { echo "$*" >&2; exit 1; }
usage="Usage: $0 install|check|stop|start|uninstall [--engine docker|podman] [--public-host HOST] [--app-host-port PORT] [--strict --app-host-domain HOST --app-host-cert PATH --app-host-key PATH] [--cli-button] [--remove-image]"
action=${1:-}
[[ $action == install || $action == check || $action == stop || $action == start || $action == uninstall ]] || die "$usage"
shift
app_port_explicit=false
engine=docker hosts=() app_port=8101 mode=normal cli_button=0 domain='' cert='' key='' remove_image=false
while [[ $# -gt 0 ]]; do
  case $1 in
    --strict) mode=strict; shift; continue;;
    --cli-button) cli_button=1; shift; continue;;
    --remove-image) [[ $action == uninstall ]] || die "$usage"; remove_image=true; shift; continue;;
  esac
  [[ $# -ge 2 ]] || die "$usage"
  case $1 in
    --engine) engine=$2;;
    --public-host) hosts+=("$2");;
    --app-host-port) app_port=$2; app_port_explicit=true;;
    --app-host-domain) domain=$2;;
    --app-host-cert) cert=$2;;
    --app-host-key) key=$2;;
    *) die "$usage";;
  esac
  shift 2
done
[[ $engine == docker || $engine == podman ]] || die "$usage"
for host in "${hosts[@]}"; do [[ $host =~ ^[a-zA-Z0-9][a-zA-Z0-9.-]*$ ]] || die "$usage"; done
[[ $app_port =~ ^[1-9][0-9]{0,4}$ && $app_port -le 65535 ]] || die "Invalid app host port"
if [[ $action != install ]]; then
  [[ ${#hosts[@]} == 0 && $app_port == 8101 && $mode == normal && $cli_button == 0 && -z $domain$cert$key ]] || die "$usage"
fi
state=/var/opt/loginom-dashboard
[[ $engine != podman ]] || state=$HOME/loginom-dashboard
if [[ $mode == strict && ! -d $state ]]; then
  [[ $domain =~ ^[a-zA-Z0-9][a-zA-Z0-9.-]*$ && $cert =~ ^/[a-zA-Z0-9/_.-]+$ && $key =~ ^/[a-zA-Z0-9/_.-]+$ ]] || die "$usage"
  for host in "${hosts[@]}"; do [[ $domain != "$host" ]] || die "Strict app domain must differ from Studio"; done
elif [[ $mode != strict ]]; then
  [[ -z $domain$cert$key ]] || die "$usage"
fi
bundle=$(cd "$(dirname "$0")" && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
saved() { sed -n "s/^$1=//p" "$state/.env"; }
if [[ $engine == podman ]]; then compose=(podman-compose);
elif docker compose version >/dev/null 2>&1; then compose=(docker compose); else compose=(docker-compose); fi
command -v "${compose[0]}" >/dev/null || die "${compose[0]} is required"
(cd "$bundle" && sha256sum -c SHA256SUMS) || die "Release checksum mismatch"
image=$(cat "$bundle/image.ref")
[[ $image =~ ^[a-zA-Z0-9][a-zA-Z0-9._/:@-]+$ ]] || die "Invalid image.ref"
installed=false
if [[ -e $state || -L $state ]]; then
  [[ -d $state && ! -L $state && -f $state/.env && ! -L $state/.env ]] || die "Dashboard state is occupied"
  # shellcheck disable=SC2094
  while IFS='=' read -r setting value; do
    case $setting in
      DASHBOARD_IMAGE|DASHBOARD_STATE|DASHBOARD_APP_HOST_PORT|DASHBOARD_APP_ORIGIN|DASHBOARD_CLIENT_ORIGINS|DASHBOARD_TLS_UPSTREAM|DASHBOARD_USERSTORAGE|DASHBOARD_PUBLISHER_USER|DASHBOARD_NETWORK|DASHBOARD_MODE|DASHBOARD_CLI_BUTTON) ;;
      *) die "Unknown saved setting";;
    esac
    [[ $value != *[^a-zA-Z0-9/_.:@,-]* && $(grep -c "^$setting=" "$state/.env") == 1 ]] || die "Invalid saved setting"
  done < "$state/.env"
  [[ $(saved DASHBOARD_STATE) == "$state" && $(saved DASHBOARD_IMAGE) == "$image" ]] || die "Saved release differs; use the matching release"
  installed=true
fi
json() {
  "$engine" run --rm -i --network none --read-only --cap-drop ALL --security-opt no-new-privileges \
    --memory 128m --pids-limit 32 --user 65534:65534 \
    -v "$bundle/check-release.mjs:/check.mjs:ro,z" --entrypoint /opt/node/bin/node "$image" /check.mjs "$@"
}
autostart() {
  [[ $engine == podman ]] || return 0
  local row
  row="@reboot $(command -v "${compose[0]}") -p loginom-dashboard -f \"$state/compose-release.yaml\" start"
  if ! LC_ALL=C crontab -l > "$tmp/crontab" 2> "$tmp/crontab-error"; then
    [[ $(cat "$tmp/crontab-error") == "no crontab for $(id -un)" ]] || die "Cannot read user crontab; dashboard state preserved"
  fi
  awk -v row="$row" '$0 != row' "$tmp/crontab" > "$tmp/crontab-next"
  [[ $1 != add ]] || printf '%s\n' "$row" >> "$tmp/crontab-next"
  crontab "$tmp/crontab-next"
}
# Inspect only our reserved names and compose project before any destructive operation.
for role in web publisher builder; do
  if "$engine" container inspect "loginom-dashboard-$role" > "$tmp/$role.json" 2>/dev/null; then
    [[ $installed == true ]] || die "Dashboard container name is occupied: $role"
    json owned "$state" "$role" < "$tmp/$role.json"
  fi
done
while read -r name; do
  [[ $name == loginom-dashboard-web || $name == loginom-dashboard-publisher || $name == loginom-dashboard-builder ]] || die "Dashboard project is occupied"
done < <("$engine" ps -a --filter label=com.docker.compose.project=loginom-dashboard --format '{{.Names}}')
if [[ $action == stop || $action == start || $action == uninstall ]]; then
  if [[ $installed == false ]]; then [[ $action != start ]] || die "Dashboard is not installed"; echo "Dashboard is not installed"; exit 0; fi
  if [[ $action == stop ]]; then
    (cd "$state" && "${compose[@]}" -p loginom-dashboard -f compose-release.yaml down)
    echo "Dashboard stopped; data preserved"
    exit 0
  fi
  if [[ $action == start ]]; then
    (cd "$state" && "${compose[@]}" -p loginom-dashboard -f compose-release.yaml up -d)
    echo "Dashboard started; verify server and client separately"
    exit 0
  fi
fi
mapfile -t studios < <("$engine" ps --filter label=com.docker.compose.service=loginom-http --format '{{.ID}}')
[[ ${#studios[@]} == 1 ]] || die "Expected one running standard Loginom installation"
studio=${studios[0]}
project=$("$engine" inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' "$studio")
mapfile -t servers < <("$engine" ps --filter "label=com.docker.compose.project=$project" --filter label=com.docker.compose.service=loginom-server --format '{{.ID}}')
[[ ${#servers[@]} == 1 ]] || die "Loginom server not found in selected installation"
server=${servers[0]}
mapfile -t conf_mounts < <("$engine" inspect --format '{{range .Mounts}}{{if eq .Destination "/usr/local/apache2/conf"}}{{println .Source}}{{end}}{{end}}' "$studio" | sed '/^$/d')
mapfile -t storage_mounts < <("$engine" inspect --format '{{range .Mounts}}{{if eq .Destination "/workdir"}}{{println .Source}}{{end}}{{if eq .Destination "/workdir/UserStorage"}}{{println .Source}}{{end}}{{end}}' "$server" | sed '/^$/d')
[[ ${#conf_mounts[@]} == 1 && ${#storage_mounts[@]} == 1 ]] || die "Ambiguous Loginom mounts"
conf=$(realpath -e "${conf_mounts[0]}")
server_root=$(realpath -e "${storage_mounts[0]}")
storage=$(realpath -e "$server_root/UserStorage")
[[ -d $conf && -d $storage && $storage == "$server_root/UserStorage" && $storage =~ ^/[a-zA-Z0-9/_.-]+$ ]] || die "Physical UserStorage not found"
# Go templates are interpreted by the container engine, not the shell.
# shellcheck disable=SC2016
mapfile -t networks < <(comm -12 <("$engine" inspect --format '{{range $name, $_ := .NetworkSettings.Networks}}{{println $name}}{{end}}' "$server" | sed '/^$/d' | sort) <("$engine" inspect --format '{{range $name, $_ := .NetworkSettings.Networks}}{{println $name}}{{end}}' "$studio" | sed '/^$/d' | sort))
[[ ${#networks[@]} == 1 ]] || die "Expected one common Loginom network"
network=${networks[0]}
site=$conf/dashboard.site.conf
replace_site() {
  [[ ! -e $site ]] || cp -a "$site" "$tmp/previous.conf"
  if [[ -f $tmp/dashboard.site.conf ]]; then install -m 644 "$tmp/dashboard.site.conf" "$site.new";
    if command -v selinuxenabled >/dev/null && selinuxenabled; then chcon --reference="$conf/httpd.conf" "$site.new"; fi
    mv -f "$site.new" "$site"; else rm -f "$site"; fi
  if ! "$engine" exec "$studio" httpd -t; then
    if [[ -e $tmp/previous.conf ]]; then cp -a "$tmp/previous.conf" "$site.new";
      mv -f "$site.new" "$site"; else rm -f "$site"; fi
    die "Apache configuration rejected; previous file restored"
  fi
}
if [[ $action == uninstall ]]; then
  replace_site
  "$engine" exec "$studio" httpd -k graceful
  (cd "$state" && "${compose[@]}" -p loginom-dashboard -f compose-release.yaml down)
  autostart remove
  rm -rf "$state"
  if [[ $remove_image == true ]]; then "$engine" image rm --no-prune "$image"; fi
  echo "Dashboard uninstalled; UserStorage publications preserved"
  exit 0
fi
if [[ $installed == true ]]; then
  json settings < "$state/.env" > "$tmp/settings"
  mapfile -t settings < "$tmp/settings"
  [[ $app_port_explicit == true ]] || app_port=${settings[0]}
  [[ $mode == strict ]] || mode=${settings[1]}
  [[ $cli_button == 1 ]] || cli_button=${settings[2]}
  [[ -n $domain ]] || domain=${settings[3]}
  [[ ${#hosts[@]} -gt 0 ]] || hosts=("${settings[@]:4}")
fi
[[ ${#hosts[@]} -gt 0 ]] || die "$usage"
for host in "${hosts[@]}"; do [[ $host =~ ^[a-zA-Z0-9][a-zA-Z0-9.-]*$ ]] || die "$usage"; done
studio_name=$("$engine" inspect --format '{{.Name}}' "$studio")
studio_name=${studio_name#/}
http_port=$("$engine" port "$studio" 80/tcp 2>/dev/null | head -n 1 | awk -F: '{print $NF}' || true)
https_port=$("$engine" port "$studio" 443/tcp 2>/dev/null | head -n 1 | awk -F: '{print $NF}' || true)
[[ -n $http_port || -n $https_port ]] || die "No published Studio HTTP or HTTPS port"
clients='' scheme=http upstream=''
for host in "${hosts[@]}"; do
  if [[ -n $http_port ]]; then
    client="http://$host:$http_port"
    [[ $http_port != 80 ]] || client="http://$host"
    clients="${clients:+$clients,}$client"
  fi
  if [[ -n $https_port ]]; then
    client="https://$host:$https_port"
    [[ $https_port != 443 ]] || client="https://$host"
    clients="${clients:+$clients,}$client"
  fi
done
if [[ -n $https_port || $mode == strict ]]; then scheme=https; upstream=$studio_name:8444; fi
publisher_user=$("$engine" exec "$server" stat -c '%u:%g' /proc/1)
# Saved installation is data, never shell code.
if [[ $action == check ]]; then
  [[ $installed == true ]] || die "Dashboard is not installed"
  json discovery "$clients" "$upstream" "$storage" "$network" "$publisher_user" < "$state/.env"
  image=$(saved DASHBOARD_IMAGE)
  [[ $image =~ ^[a-zA-Z0-9][a-zA-Z0-9._/:@-]+$ ]] || die "Invalid saved image"
  app_origin=$(saved DASHBOARD_APP_ORIGIN)
  mode=$(saved DASHBOARD_MODE)
  mode=${mode:-normal}
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
    if app_url=$(json ready "$name" "$source_hash" "$app_origin" "$mode" < "$tmp/lookup.json"); then break;
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
  mapfile -t studios < <("$engine" ps --filter label=com.docker.compose.service=loginom-http --format '{{.ID}}')
  [[ ${#studios[@]} == 1 ]] || die "Expected one installed Studio"
  studio=${studios[0]}
  conf=$("$engine" inspect --format '{{range .Mounts}}{{if eq .Destination "/usr/local/apache2/conf"}}{{.Source}}{{end}}{{end}}' "$studio")
  "$engine" exec "$studio" httpd -t
  modules=$("$engine" exec "$studio" httpd -M)
  for module in substitute headers proxy proxy_http env; do
    [[ $modules == *"${module}_module"* ]] || die "Required Apache module missing: $module"
  done
  grep -Fq 'Header always set Content-Security-Policy "sandbox; default-src' "$conf/dashboard.site.conf" || die "Missing Apache always CSP for API/errors"
  grep -Fq 'Header always set X-Content-Type-Options "nosniff"' "$conf/dashboard.site.conf" || die "Missing Apache always nosniff"
  integrity=$("$engine" exec loginom-dashboard-web /opt/node/bin/node --input-type=module -e 'import {readFileSync} from "node:fs"; import {createHash} from "node:crypto"; console.log("sha384-"+createHash("sha384").update(readFileSync("/opt/dashboard/shell.js")).digest("base64"))')
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
  "$engine" inspect loginom-dashboard-web loginom-dashboard-publisher loginom-dashboard-builder | json roles "$image" "$storage" "$state" "$(saved DASHBOARD_PUBLISHER_USER)" "$(saved DASHBOARD_NETWORK)" "$("$engine" image inspect --format '{{.Id}}' "$image")" "$engine"
  for role in web publisher builder; do
    "$engine" exec "loginom-dashboard-$role" /opt/node/bin/node --input-type=module -e 'import {readFileSync} from "node:fs"; import assert from "node:assert/strict"; const status=readFileSync("/proc/1/status","utf8"); for (const name of ["CapInh","CapPrm","CapEff","CapBnd","CapAmb"]) assert(new RegExp("^"+name+":\\s+0+$","m").test(status), name)'
  done
  [[ $("$engine" exec "$("$engine" ps --filter label=com.docker.compose.service=loginom-server --format '{{.ID}}')" stat -c '%u:%g' /proc/1) == "$(saved DASHBOARD_PUBLISHER_USER)" ]] || die "Publisher UID/GID differs from Loginom"
  for role in publisher builder; do
    "$engine" exec "loginom-dashboard-$role" /opt/node/bin/node --input-type=module -e 'import {connect} from "node:net"; const socket=connect({host:"192.0.2.1",port:9}); socket.on("connect",()=>process.exit(1)); socket.on("error",()=>process.exit(0)); socket.setTimeout(2000,()=>{socket.destroy();process.exit(0)})'
  done
  "$engine" exec loginom-dashboard-publisher /opt/node/bin/node --input-type=module -e 'import {readFileSync,openSync} from "node:fs"; readFileSync(process.argv[1]); try {openSync(process.argv[1],"r+");process.exit(1)} catch(e) {if(e.code!=="EROFS")throw e}' "/storage/$probe.dashboards/$guid/$name"
  echo "Server checks PASS: Apache/SRI/compression/headers/Host/isolation; mode $mode"
  if [[ $app_origin == https:* ]]; then
    echo "TLS PASS: host curl verified OS trust, certificate name and validity"
    # Compare public certificates only; the private key remains in Apache.
    certificate=$("$engine" exec "$studio" cat /usr/local/apache2/conf/env.conf | json certificate-path)
    "$engine" exec "$studio" cat "$certificate" | json certificate "$certificate"
  fi
  echo "Client access NOT CHECKED: run check-studio.mjs on the client host"
  exit 0
fi
if [[ $installed == true ]]; then
  [[ ! -L $site ]] || die "Dashboard Apache file is occupied"
  if [[ -e $site ]]; then [[ -f $site ]] || die "Dashboard Apache file is occupied"; json site < "$site"; fi
else
  [[ ! -e $site && ! -L $site ]] || die "Dashboard Apache file is occupied"
fi
if [[ $mode == strict ]]; then
  if [[ -z $cert || -z $key ]]; then
    [[ $installed == true ]] || die "$usage"
    [[ -f $site ]] || die "Strict settings unavailable; repeat original --strict --app-host-domain --app-host-cert --app-host-key flags"
    json site strict < "$site" > "$tmp/tls-paths"
    mapfile -t paths < "$tmp/tls-paths"
    [[ -n $cert ]] || cert=${paths[0]}
    [[ -n $key ]] || key=${paths[1]}
  fi
  [[ $domain =~ ^[a-zA-Z0-9][a-zA-Z0-9.-]*$ && $cert =~ ^/[a-zA-Z0-9/_.-]+$ && $key =~ ^/[a-zA-Z0-9/_.-]+$ ]] || die "$usage"
  for host in "${hosts[@]}"; do [[ $domain != "$host" ]] || die "Strict app domain must differ from Studio"; done
fi
if [[ -n $https_port || $mode == strict ]]; then
  scheme=https
  upstream=$studio_name:8444
  "$engine" exec "$studio" test -f /usr/local/apache2/modules/mod_substitute.so || die "Apache mod_substitute is required"
  if ! "$engine" exec "$studio" sh -c '! grep -qiE "[0-9A-F]+:20FC .* 0A " /proc/net/tcp /proc/net/tcp6'; then
    [[ $installed == true && -f $site ]] || die "Apache port 8444 is occupied"
    # Observe the live Apache sockets and active virtual hosts without changing configuration.
    # shellcheck disable=SC2016
    "$engine" exec "$studio" sh -ec 'cat /proc/1/comm; for fd in /proc/1/fd/*; do readlink "$fd" || true; done; echo TCP; cat /proc/net/tcp /proc/net/tcp6; echo VHOSTS; httpd -S 2>&1' > "$tmp/apache"
    json apache < "$tmp/apache"
  fi
fi
if [[ $mode == strict ]]; then
  host=$domain
  # Paths are administrator-owned paths inside Apache, never mounts into web.
  "$engine" exec "$studio" test -r "$cert" || die "App certificate unavailable; repeat original --strict --app-host-domain --app-host-cert --app-host-key flags"
  "$engine" exec "$studio" test -r "$key" || die "App key unavailable; repeat original --strict --app-host-domain --app-host-cert --app-host-key flags"
  command -v openssl >/dev/null || die "Host OpenSSL is required for strict app TLS validation"
  # Administrator-only stdin validation; private bytes never enter Dashboard roles or shell variables.
  cert_public=$("$engine" exec "$studio" cat "$cert" | openssl x509 -pubkey -noout) || die "Invalid app certificate"
  key_public=$("$engine" exec "$studio" cat "$key" | openssl pkey -pubout -passin pass:) || die "Invalid app private key"
  [[ -n $cert_public && -n $key_public && $cert_public == "$key_public" ]] || die "App certificate and private key do not match"
else
  host=${hosts[0]}
fi
app_origin="$scheme://$host:$app_port"
if [[ $scheme == https && $app_port == 443 || $scheme == http && $app_port == 80 ]]; then app_origin="$scheme://$host"; fi
ss -H -lnt4 "sport = :$app_port" > "$tmp/listeners4"
ss -H -lnt6 -e "sport = :$app_port" > "$tmp/listeners6"
listeners=$(sed 's/^/4 /' "$tmp/listeners4"; sed 's/^/6 /' "$tmp/listeners6")
if [[ -n $listeners ]]; then
  [[ $installed == true && -s $tmp/web.json ]] || die "App host port is occupied"
  json owned "$state" web "$app_port" "$listeners" < "$tmp/web.json"
fi
[[ ! -e $site.new && ! -L $site.new ]] || die "Dashboard Apache candidate path is occupied"
if [[ $installed == true ]]; then
  [[ -f $state/compose-release.yaml && ! -L $state/compose-release.yaml ]] || die "Saved compose file is occupied"
fi
for directory in builds jobs-in jobs-out; do
  [[ ! -L $state/$directory && ( ! -e $state/$directory || -d $state/$directory ) ]] || die "Dashboard directory is occupied"
done
for client in ${clients//,/ }; do curl --silent --show-error --fail --max-time 10 "$client/app/" -o /dev/null || die "Public Studio address is not reachable"; done
"$engine" load -i "$bundle/image.tar"
"$engine" image inspect "$image" >/dev/null
integrity=$("$engine" run --rm --network none --read-only --cap-drop ALL --security-opt no-new-privileges --user 65534:65534 --entrypoint /opt/node/bin/node "$image" --input-type=module -e 'import {readFileSync} from "node:fs"; import {createHash} from "node:crypto"; console.log("sha384-"+createHash("sha384").update(readFileSync("/opt/dashboard/shell.js")).digest("base64"))')
cat > "$tmp/dashboard.site.conf" <<EOF
# Managed by loginom-dashboard release installer
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
if [[ $mode == strict ]]; then
  sed -i "s|\\\${SSL_CERT}|$cert|; s|\\\${SSL_KEY}|$key|" "$tmp/dashboard.site.conf"
fi
cp "$bundle/compose-release.yaml" "$tmp/compose-release.yaml"
# Preserve an administrator's private server MCS label; only publisher bypasses that label.
if [[ $engine == podman ]] && command -v selinuxenabled >/dev/null && selinuxenabled && [[ $(stat -c '%C' "$storage") == *:container_file_t:s0:c* ]]; then
  sed -i '/^  publisher:$/a\    security_opt: [no-new-privileges, label=disable]' "$tmp/compose-release.yaml"
  # Keep Compose's variable expression literal.
  # shellcheck disable=SC2016
  sed -i 's|${DASHBOARD_USERSTORAGE:?required}:/storage:ro,z|${DASHBOARD_USERSTORAGE:?required}:/storage:ro|' "$tmp/compose-release.yaml"
fi
cat > "$tmp/.env" <<EOF
DASHBOARD_IMAGE=$image
DASHBOARD_STATE=$state
DASHBOARD_APP_HOST_PORT=$app_port
DASHBOARD_APP_ORIGIN=$app_origin
DASHBOARD_CLIENT_ORIGINS=$clients
DASHBOARD_TLS_UPSTREAM=$upstream
DASHBOARD_USERSTORAGE=$storage
DASHBOARD_PUBLISHER_USER=$publisher_user
DASHBOARD_NETWORK=$network
DASHBOARD_MODE=$mode
DASHBOARD_CLI_BUTTON=$cli_button
EOF
mv "$tmp/.env" "$tmp/next.env"
mv "$tmp/compose-release.yaml" "$tmp/next-compose.yaml"
if [[ $installed == true ]]; then
  cp -p "$state/.env" "$state/compose-release.yaml" "$tmp/"
fi
[[ -d $state ]] || install -d -m 755 "$state"
for directory in builds jobs-in jobs-out; do
  [[ -d $state/$directory ]] || install -d -m 777 "$state/$directory"
done
replace_site
if ! { cp "$tmp/next.env" "$state/.env" && cp "$tmp/next-compose.yaml" "$state/compose-release.yaml" &&
  (cd "$state" && "${compose[@]}" -p loginom-dashboard -f compose-release.yaml up -d) && "$engine" exec "$studio" httpd -k graceful; }; then
  if [[ -e $tmp/previous.conf ]]; then
    { cp -a "$tmp/previous.conf" "$site.new" && mv -f "$site.new" "$site"; } || echo "Previous Apache file recovery failed" >&2
  else rm -f "$site" || echo "Apache candidate removal failed" >&2; fi
  if [[ $installed == true ]]; then
    cp -p "$tmp/.env" "$tmp/compose-release.yaml" "$state/" || echo "Previous env/compose recovery failed" >&2
    (cd "$state" && "${compose[@]}" -p loginom-dashboard -f compose-release.yaml up -d) || echo "Previous compose recovery failed; data preserved" >&2
  fi
  "$engine" exec "$studio" httpd -k graceful || echo "Previous Apache reload failed; data preserved" >&2
  die "Dashboard apply failed; previous configuration recovery attempted; verify recovery"
fi
if ! (autostart add); then echo "Dashboard installed; autostart update failed; configure it separately" >&2; fi
echo "Dashboard installed at $app_origin; verify the client connection separately."
