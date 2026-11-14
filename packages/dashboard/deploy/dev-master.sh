#!/usr/bin/env bash
# Only the isolated dashboard master from dashboard/stand/README.md.
set -euo pipefail
cd "$(dirname "$0")/../../.."
pkg=packages/dashboard
studio=dashboard-master-20261109-studio
server=dashboard-master-20261109-server
htdocs=/usr/local/apache2/htdocs
app=/workdir/dashboard-app
storage=/workdir/UserStorage/user/dashboard-roi
base=http://127.0.0.1:32768
die() { echo "$*" >&2; exit 1; }
usage="Usage: $0 install [--strict] [--cli-button] [--web NAME] | check [--web NAME] | uninstall [--web NAME]"
[[ $# -ge 1 ]] || die "$usage"
action=$1
shift
mode=normal
cli_button=0
web=dashboard-master-20261109-web
while [[ $# -gt 0 ]]; do
  case $1 in
    --strict) [[ $action == install ]] || die "$usage"; mode=strict; shift;;
    --cli-button) [[ $action == install ]] || die "$usage"; cli_button=1; shift;;
    --web) [[ $# -ge 2 ]] || die "$usage"; web=$2; shift 2;;
    *) die "$usage";;
  esac
done
case $action in install|check|uninstall) ;; *) die "$usage";; esac
[[ $web =~ ^[a-zA-Z0-9][a-zA-Z0-9_.-]*$ ]] || die "Некорректное имя контейнера web"
[[ $web != "$server" && $web != "$studio" ]] || die "Контейнер web не должен совпадать с Loginom server или Studio"
if [[ $action == install ]]; then
  [[ $(id -u) != 0 ]] || die "install от root не поддерживается: запустите от пользователя, который публикует dashboard"
fi
net=dashboard-master-20261109-net
owner=io.loginom.dashboard.dev-master=20261109
state=$HOME/loginom-dashboard
builds=$state/builds
app_origin=http://dashboards.localhost:32769
client_origins=http://127.0.0.1:32768,http://localhost:32768
image=debian:bookworm-slim@sha256:734a72b3d6142a71993b4bc580ca01d8ca687f77a2c422d96a961d3376b179bc
csp=$(sed "s|<DASH>|$app_origin|g" "$pkg/deploy/studio.csp")
conf=/usr/local/apache2/conf/dashboard-app.site.conf
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

# Docker also accepts ID prefixes. Only remove an exact installer-owned name, by its full ID.
web_id=
if docker container inspect "$web" > "$tmp/web.json" 2> "$tmp/web.error"; then
  web_id=$(node -e '
    const v = JSON.parse(require("node:fs").readFileSync(process.argv[1]))[0]
    const [key, value] = process.argv[3].split("=")
    if (v.Name !== "/" + process.argv[2] || v.Config.Labels?.[key] !== value)
      throw Error("Отказ: контейнер должен иметь точное имя и метку установщика dashboard")
    console.log(v.Id)
  ' "$tmp/web.json" "$web" "$owner")
else
  names=$(docker container ls --all --filter "name=$web" --format '{{.Names}}') || die "Не удалось проверить контейнер web"
  if grep -Fxq -- "$web" <<< "$names"; then die "Контейнер web существует, но его принадлежность не проверена"; fi
fi

# Read the two vendor files directly; HTTP may already serve M0 overlays.
for client in client client-debug; do
  docker exec "$studio" cat "$htdocs/$client/client.json" > "$tmp/$client.original"
  node -e '
    const fs = require("node:fs")
    const v = JSON.parse(fs.readFileSync(process.argv[1]))
    if (!v || typeof v !== "object" || Array.isArray(v)) throw Error("Expected client.json object")
    fs.writeFileSync(process.argv[2], JSON.stringify({...v, rememberuser: false}))
  ' "$tmp/$client.original" "$tmp/$client.overlay"
done

client_json() {
  for client in client client-debug; do
    curl --noproxy '*' -fsS "$base/app${client#client}/client.json" -o "$tmp/http.json"
    node -e '
      const fs = require("node:fs"), {isDeepStrictEqual} = require("node:util")
      const read = f => JSON.parse(fs.readFileSync(f))
      if (!isDeepStrictEqual(read(process.argv[1]), read(process.argv[2]))) throw Error(process.argv[3]+" JSON differs")
    ' "$tmp/$client.$1" "$tmp/http.json" "$client"
  done
}
header() { sed -n "s/^$2:[[:space:]]*//Ip" "$1" | tr -d '\r'; }
app_headers() {
  # A header-file first argument prevents the server entrypoint from starting on import.
  "$state/node" --input-type=module -e '
    import { readFileSync } from "node:fs"
    const [file, server, origin, clients, cache] = process.argv.slice(1)
    const { appHeaders } = await import(server)
    const actual = Object.fromEntries(readFileSync(file, "utf8").split(/\r?\n/).slice(1).filter(Boolean)
      .map(line => [line.slice(0, line.indexOf(":")).toLowerCase(), line.slice(line.indexOf(":") + 1).trim()]))
    const expected = {...appHeaders(origin, clients.split(",")), "cache-control": cache,
      ...(cache !== "no-store" && {"access-control-allow-origin": "*"})}
    for (const [name, value] of Object.entries(expected))
      if (actual[name] !== value) throw Error(file + ": " + name)
  ' "$1" "$state/server.mjs" "$app_origin" "$client_origins" "$2"
}

# Only the complete stand-owned script tags (including previous M0 tags).
tags='/^[[:space:]]*<script src="(dashboard-(probe|parameter|bootstrap)\.js|dashboard\/shell\.js)"><\/script>[[:space:]]*$/d'
stop_service() {
  docker exec "$server" sh -ec 'ps -eo pid,args | awk '\''$2 == "/app/dashboard-node" && $3 == "/workdir/dashboard-app/server.mjs" {print $1}'\'' | xargs -r kill'
}
reload_apache() {
  docker exec "$studio" apachectl -t
  docker exec "$studio" apachectl -k graceful
}
if [[ $action == uninstall ]]; then
  for client in client client-debug; do
    root=$htdocs/$client
    docker exec "$studio" sed -Ei "$tags" "$root/index.html"
    docker exec "$studio" rm -f "$root/dashboard/shell.js" "$root/dashboard-probe.js" "$root/dashboard-parameter.js" "$root/dashboard-bootstrap.js" "$htdocs/dashboard-config/$client.json"
  done
  docker exec "$studio" rm -f "$conf"
  reload_apache
  if [[ -n $web_id ]]; then docker rm -f "$web_id" >/dev/null; fi
  rm -f "$state/node" "$state/server.mjs"
  stop_service
  docker exec -u 0 "$server" rm -f /app/dashboard-node "$app/server.mjs"
  client_json original
  echo "Dashboard удалён; builds сохранён, каждый клиент читает свой оригинальный client.json."
  exit
fi

# A fixed public fixture binding; compare lookup with the preserved on-disk publication.
binding='{"packagePath":"/user/dashboard-roi/campaign.lgp","workflowGuid":"27cb94a9-f6e9-35ff-80b7-bc7d01ba6aa7","nodeGuid":"77c145b1-6ce3-458f-aa36-e6afdab2a930"}'
if [[ $action == check ]]; then
  [[ -n $web_id ]] || die "Контейнер web не найден"
  [[ -x $state/node && -s $state/server.mjs ]] || die "Не найдены установленные Node/server.mjs"
  # The binding goes first: server.mjs as argv[1] would start the service on import.
  roi=$("$state/node" --input-type=module -e '
    const { bindingKey } = await import(process.argv[2])
    console.log(await bindingKey(JSON.parse(process.argv[1])))
  ' "$binding" "$state/server.mjs")
  mode=$(node -e '
    const v = JSON.parse(require("node:fs").readFileSync(process.argv[1]))[0]
    if (v.Config.User !== process.argv[2] || v.Config.User.split(":")[0] === "0") throw Error("web UID/GID mismatch")
    if (v.HostConfig.ReadonlyRootfs !== true) throw Error("web root must be read-only")
    if (v.HostConfig.CapDrop?.length !== 1 || v.HostConfig.CapDrop[0] !== "ALL") throw Error("web CapDrop mismatch")
    if (!v.HostConfig.SecurityOpt?.includes("no-new-privileges")) throw Error("web needs no-new-privileges")
    if (!v.Mounts.some(m => m.Destination === "/builds" && m.Source === process.argv[3] && m.RW === false)) throw Error("web builds mount mismatch")
    const mode = v.Config.Env.find(e => e.startsWith("DASHBOARD_MODE="))?.slice("DASHBOARD_MODE=".length)
    if (mode !== "normal" && mode !== "strict") throw Error("web mode mismatch")
    console.log(mode)
  ' "$tmp/web.json" "$(id -u):$(id -g)" "$builds")
  current=$(cat "$builds/$roi/current" 2>/dev/null || true)
  [[ -n $current ]] || die "Не проверено: опубликуйте ROI"
  code=$(curl --noproxy '*' -sS -D "$tmp/api.headers" -o "$tmp/lookup" -w '%{http_code}' -H 'Content-Type: application/json' -d "$binding" "$base/dashboard/lookup")
  [[ $code == 200 ]] || die "ROI lookup: HTTP $code (expected 200)"
  node -e '
    const res = JSON.parse(require("node:fs").readFileSync(process.argv[1]))
    if (res.key !== process.argv[2] || res.exists !== true || res.hash !== process.argv[3] ||
        res.appOrigin !== process.argv[4] || res.mode !== process.argv[5]) throw Error("ROI lookup mismatch")
    const web = JSON.parse(require("node:fs").readFileSync(process.argv[6]))[0]
    if (res.cliButton !== web.Config.Env.includes("DASHBOARD_CLI_BUTTON=1")) throw Error("CLI button mismatch")
  ' "$tmp/lookup" "$roi" "$current" "$app_origin" "$mode" "$tmp/web.json"
  [[ $(header "$tmp/api.headers" Content-Security-Policy) == "sandbox; default-src 'none'" ]] || die "API CSP mismatch"
  [[ $(header "$tmp/api.headers" X-Content-Type-Options) == nosniff ]] || die "API nosniff missing"
  snapshot="{\"binding\":$binding,\"nodeName\":\"ROI\",\"sample\":{\"schema\":[{\"name\":\"count\",\"type\":1}],\"rows\":[[42]]},\"parameters\":[],\"published\":false}"
  code=$(curl --noproxy '*' -sS -o "$tmp/snapshot" -w '%{http_code}' -H 'Content-Type: application/json' -H "Origin: $base" -d "$snapshot" "$base/dashboard/snapshots")
  [[ $code == 201 ]] || die "Snapshot: HTTP $code (expected 201)"
  id=$(node -e '
    const { id } = JSON.parse(require("node:fs").readFileSync(process.argv[1]))
    if (typeof id !== "string" || !id) throw Error("Snapshot ID missing")
    console.log(id)
  ' "$tmp/snapshot")
  for expected in 200 404; do
    code=$(curl --noproxy '*' -sS -o /dev/null -w '%{http_code}' "$base/dashboard/snapshots/$id")
    [[ $code == "$expected" ]] || die "Snapshot read: HTTP $code (expected $expected)"
  done
  [[ $(curl --noproxy '*' -sS -o /dev/null -w '%{http_code}' -H 'Content-Type: application/json' -H 'Origin: http://evil.invalid' -d "$snapshot" "$base/dashboard/snapshots") == 403 ]] || die 'Snapshot origin: expected 403'
  for path in current "targets/$id" "apps/$roi/" "apps/$roi/binding.json" "apps/$roi/sample.json"; do
    [[ $(curl --noproxy '*' -sS -o /dev/null -w '%{http_code}' "$base/dashboard/$path") == 404 ]] || die "Expected 404: $path"
  done
  [[ $(curl --noproxy '*' -sS -H 'Host: dashboard.invalid' -o /dev/null -w '%{http_code}' "$base/dashboard/current") == 403 ]] || die 'Host: expected 403'
  for prefix in app app-debug; do
    curl --noproxy '*' -fsS -D "$tmp/headers" "$base/$prefix/" -o "$tmp/index"
    [[ $(grep -Fc '<script src="dashboard/shell.js"></script>' "$tmp/index") == 1 ]] || die "$prefix: expected one shell script"
    [[ $(header "$tmp/headers" Content-Security-Policy) == "$csp" ]] || die "$prefix: forced CSP mismatch"
    if grep -iq '^Content-Security-Policy-Report-Only:' "$tmp/headers"; then die "$prefix: Report-Only is not allowed"; fi
    [[ $(header "$tmp/headers" X-Content-Type-Options) == nosniff ]] || die "$prefix: nosniff missing"
    [[ $(header "$tmp/headers" Referrer-Policy) == same-origin ]] || die "$prefix: referrer policy mismatch"
    [[ $csp == "frame-src $app_origin;"* ]] || die "$prefix: appOrigin is absent from frame-src"
    curl --noproxy '*' -fsS -D "$tmp/headers" "$base/$prefix/dashboard/shell.js" -o "$tmp/shell.js"
    grep -iq '^cache-control:.*no-cache' "$tmp/headers" || die "$prefix: shell.js missing no-cache"
    cmp "$pkg/dist/shell.js" "$tmp/shell.js"
  done
  asset=$(find "$builds/$roi/$current/assets" -maxdepth 1 -type f -printf '%f\n' -quit)
  [[ -n $asset ]] || die "ROI assets отсутствуют"
  for path in "/apps/$roi/$current/" "/apps/$roi/$current/assets/$asset" /apps/ "/apps/$roi/$current" "/apps/$roi/$current/binding.json" "/apps/$roi/$current/sample.json"; do
    expected=404
    cache=no-store
    if [[ $path == "/apps/$roi/$current/" ]]; then expected=200; fi
    if [[ $path == */assets/* ]]; then expected=200; cache='public, max-age=31536000, immutable'; fi
    code=$(curl --noproxy '*' --resolve dashboards.localhost:32769:127.0.0.1 -sS -D "$tmp/headers" -o /dev/null -w '%{http_code}' "$app_origin$path")
    [[ $code == "$expected" ]] || die "App host $path: HTTP $code (expected $expected)"
    app_headers "$tmp/headers" "$cache"
    [[ -z $(header "$tmp/headers" Location) ]] || die "App host must not redirect"
  done
  [[ $(curl --noproxy '*' --resolve dashboards.localhost:32769:127.0.0.1 -sS -H 'Host: evil.localhost:32769' -D "$tmp/headers" -o /dev/null -w '%{http_code}' "$app_origin/apps/") == 403 ]] || die 'App host: expected 403'
  app_headers "$tmp/headers" no-store
  client_json overlay
  echo "Apache и web: ROI hash/current, режим $mode, заголовки, ограничения контейнера, обе оболочки и оба JSON совпадают."
  node "$pkg/deploy/check-studio.mjs" master
  exit
fi

pin=$(node -p 'require("./packages/product/loginom-release.json").nodeVersion')
node_bin=$(realpath "$(command -v node)")
[[ $("$node_bin" --version) == "v$pin" ]] || die "Для службы нужен Node $pin в PATH"
for artifact in "$pkg/dist/server.mjs" "$pkg/dist/shell.js"; do
  [[ -s $artifact ]] || die "Отсутствует $artifact: выполните bun run build из $pkg"
  "$node_bin" --check "$artifact"
done
for file in campaign.lgp dataset.csv; do [[ -s dashboard/fixture/$file ]] || die "Нет dashboard/fixture/$file"; done
docker network inspect "$net" >/dev/null
install -d -m 700 "$state" "$builds"
install -m 755 "$node_bin" "$state/node.new" && mv -f "$state/node.new" "$state/node"
install -m 644 "$pkg/dist/server.mjs" "$state/server.mjs.new" && mv -f "$state/server.mjs.new" "$state/server.mjs"
# Validate the exact Debian/Node combination before stopping M1 or replacing web.
docker run --rm --network none --read-only --user "$(id -u):$(id -g)" \
  -v "$state/node:/opt/dashboard/node:ro" -v "$state/server.mjs:/opt/dashboard/server.mjs:ro" "$image" \
  /opt/dashboard/node -e 'if (process.versions.node !== process.argv[1]) process.exit(1); import("/opt/dashboard/server.mjs")' "$pin"

docker exec "$server" mkdir -p "$storage"
for file in campaign.lgp dataset.csv; do
  docker exec -i "$server" sh -ec 'if [ ! -e "$1" ] && [ ! -L "$1" ]; then set -C; cat > "$1"; fi' sh "$storage/$file" < "dashboard/fixture/$file"
done
stop_service
docker exec -u 0 "$server" rm -f /app/dashboard-node "$app/server.mjs"
if [[ -n $web_id ]]; then docker rm -f "$web_id" >/dev/null; fi
docker run -d --name "$web" --label "$owner" --network "$net" --user "$(id -u):$(id -g)" \
  --read-only --cap-drop ALL --security-opt no-new-privileges --tmpfs /tmp:rw,noexec,nosuid,size=16m \
  --memory 512m --pids-limit 64 --log-opt max-size=10m --log-opt max-file=3 --restart unless-stopped \
  -p 127.0.0.1:32769:8101 \
  -v "$state/node:/opt/dashboard/node:ro" -v "$state/server.mjs:/opt/dashboard/server.mjs:ro" -v "$builds:/builds:ro" \
  -e DASHBOARD_HOST=0.0.0.0 -e DASHBOARD_PORT=8100 -e DASHBOARD_APP_PORT=8101 -e DASHBOARD_BUILDS=/builds \
  -e DASHBOARD_APP_ORIGIN="$app_origin" -e DASHBOARD_CLI_BUTTON="$cli_button" \
  -e DASHBOARD_CLIENT_ORIGINS="$client_origins" -e DASHBOARD_MODE="$mode" \
  "$image" /opt/dashboard/node /opt/dashboard/server.mjs >/dev/null

docker exec "$studio" mkdir -p "$htdocs/dashboard-config"
for client in client client-debug; do
  root=$htdocs/$client
  docker cp "$tmp/$client.overlay" "$studio:$htdocs/dashboard-config/$client.json"
  docker exec "$studio" chmod 644 "$htdocs/dashboard-config/$client.json"
  docker exec "$studio" mkdir -p "$root/dashboard"
  docker cp "$pkg/dist/shell.js" "$studio:$root/dashboard/shell.js"
  docker exec "$studio" sed -Ei -e "$tags" -e '/<\/head>/i\<script src="dashboard/shell.js"></script>' "$root/index.html"
  docker exec "$studio" rm -f "$root/dashboard-probe.js" "$root/dashboard-parameter.js" "$root/dashboard-bootstrap.js"
done
cat > "$tmp/site.conf" <<CONF
Alias "/app/client.json" "$htdocs/dashboard-config/client.json"
Alias "/app-debug/client.json" "$htdocs/dashboard-config/client-debug.json"
<FilesMatch "^(index\.html|shell\.js)$">
  Header set Cache-Control "no-cache"
</FilesMatch>
<LocationMatch "^/app(-debug)?/(index\.html)?$">
  Header set Content-Security-Policy "$csp"
  Header set X-Content-Type-Options "nosniff"
  Header set Referrer-Policy "same-origin"
</LocationMatch>
<Location "/dashboard/">
  Require expr "tolower(req('Host')) == '127.0.0.1:32768' || tolower(req('Host')) == 'localhost:32768'"
  ProxyPreserveHost On
  Header always set Content-Security-Policy "sandbox; default-src 'none'"
  Header always set X-Content-Type-Options "nosniff"
</Location>
ProxyPass /dashboard/ http://$web:8100/dashboard/ connectiontimeout=2 timeout=30 disablereuse=On
ProxyPassReverse /dashboard/ http://$web:8100/dashboard/
CONF
docker exec "$studio" sh -ec 'rm -f "$1.bak"; if [ -e "$1" ]; then cp -p "$1" "$1.bak"; fi' sh "$conf"
docker exec -i "$studio" sh -ec 'cat > "$1.new"; mv -f "$1.new" "$1"' sh "$conf" < "$tmp/site.conf"
if ! docker exec "$studio" apachectl -t; then
  docker exec "$studio" sh -ec 'if [ -e "$1.bak" ]; then mv -f "$1.bak" "$1"; else rm -f "$1"; fi' sh "$conf"
  die "apachectl -t отклонил конфигурацию dashboard; прежний файл возвращён"
fi
docker exec "$studio" rm -f "$conf.bak"
docker exec "$studio" apachectl -k graceful
curl --noproxy '*' --retry 5 --retry-delay 1 -fsS -H 'Content-Type: application/json' -d "$binding" "$base/dashboard/lookup" >/dev/null
echo "Dashboard установлен ($mode). Создайте и опубликуйте ROI через Desktop (Создать dashboard → Опубликовать), затем выполните check: $0 check --web $web"
