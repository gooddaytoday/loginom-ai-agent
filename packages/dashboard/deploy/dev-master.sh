#!/usr/bin/env bash
# Only the isolated dashboard master from dashboard/stand/README.md.
set -euo pipefail
pkg=packages/dashboard
htdocs=/usr/local/apache2/htdocs
storage=/workdir/UserStorage/user/dashboard-roi
die() { echo "$*" >&2; exit 1; }
usage="Usage: $0 install|check|stop|start|uninstall --config FILE [--strict] [--cli-button]"
[[ $# -ge 1 ]] || die "$usage"
action=$1
shift
mode=normal
cli_button=0
config=
while [[ $# -gt 0 ]]; do
  case $1 in
    --strict) [[ $action == install ]] || die "$usage"; mode=strict; shift;;
    --cli-button) [[ $action == install ]] || die "$usage"; cli_button=1; shift;;
    --config) [[ $# -ge 2 ]] || die "$usage"; config=$2; shift 2;;
    *) die "$usage";;
  esac
done
case $action in install|check|stop|start|uninstall) ;; *) die "$usage";; esac
[[ -n $config ]] || die "$usage"
cd "$(dirname "$0")/../../.."
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
node --input-type=module - "$config" > "$tmp/config" <<'JS'
import { readFileSync } from "node:fs"
const c = JSON.parse(readFileSync(process.argv[2], "utf8"))
const names = ["server", "studio", "network", "web", "project", "userstorage"]
for (const key of names) if (typeof c[key] !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(c[key])) throw Error("Invalid " + key)
if (new Set([c.server, c.studio, c.web, c.project + "-publisher", c.project + "-builder"]).size !== 5) throw Error("Container names overlap")
for (const key of ["base", "appOrigin"]) {
  const u = new URL(c[key])
  if (u.origin !== c[key] || u.protocol !== "http:" || !["127.0.0.1", "localhost", "dashboards.localhost"].includes(u.hostname) || !u.port) throw Error("Invalid " + key)
}
if (new URL(c.appOrigin).hostname !== "dashboards.localhost") throw Error("Separate apps origin required")
if (typeof c.state !== "string" || !c.state.startsWith("/") || /[\n\r\0,:]/.test(c.state) || c.state === "/" || c.state.split("/").includes("..")) throw Error("Invalid state")
if (typeof c.owner !== "string" || !/^[a-zA-Z0-9_.-]+=[a-zA-Z0-9_.-]+$/.test(c.owner)) throw Error("Invalid owner label")
for (const key of [...names, "base", "appOrigin", "state", "owner"]) console.log(c[key])
JS
mapfile -t settings < "$tmp/config"
server=${settings[0]}; studio=${settings[1]}; net=${settings[2]}; web=${settings[3]}
project=${settings[4]}; userstorage=${settings[5]}; base=${settings[6]}; app_origin=${settings[7]}
state=${settings[8]}; owner=${settings[9]}; builds=$state/builds
if [[ $action == stop || $action == start ]]; then
  names=$(docker container ls --all --format '{{.Names}}') || die "Не удалось получить список контейнеров dashboard"
  ids=()
  for target in "$web" "$project-publisher" "$project-builder"; do
    grep -Fxq -- "$target" <<< "$names" || continue
    inspected=$(docker container inspect --format "{{.Name}} {{index .Config.Labels \"${owner%%=*}\"}} {{.Id}}" "$target") \
      || die "Не удалось проверить контейнер dashboard: $target"
    read -r name label id <<< "$inspected"
    [[ $name == "/$target" && $label == "${owner#*=}" && $id =~ ^[0-9a-f]{64}$ ]] \
      || die "Не подтверждены имя, владелец или полный ID контейнера dashboard: $target"
    ids+=("$id")
  done
  if [[ ${#ids[@]} == 0 ]]; then
    [[ $action == stop ]] || die "Dashboard не установлен. Выполните install."
    echo "Dashboard не установлен."
    exit 0
  fi
  [[ ${#ids[@]} == 3 ]] || die "Установка dashboard неполная. Выполните install."
  docker "$action" "${ids[@]}" || die "Команда dashboard $action завершилась не полностью. Проверьте состояния трёх контейнеров."
  exit 0
fi
app_port=${app_origin##*:}
client_origins=$base
image=$project:local
local_image=sha256:43f84a0b210f98845ef003912981774c95efe439eaa4b1cb62cf803fd46fc82a
csp=$(sed "s|<DASH>|$app_origin|g" "$pkg/deploy/studio.csp")
conf=/usr/local/apache2/conf/dashboard-app.site.conf
for target in "$server" "$studio"; do
  [[ $(docker inspect --format '{{.Name}}' "$target") == "/$target" ]] || die "Имя Loginom не совпало"
  [[ $(docker inspect --format "{{index .Config.Labels \"${owner%%=*}\"}}" "$target") == "${owner#*=}" ]] || die "Чужой Loginom контейнер"
done
for target in "$project-publisher" "$project-builder"; do
  if docker inspect "$target" > "$tmp/role.json" 2>/dev/null; then
    node -e 'const v=JSON.parse(require("node:fs").readFileSync(process.argv[1]))[0]; if(v.Name!=="/"+process.argv[2]||v.Config.Labels?.[process.argv[3]]!==process.argv[4])throw Error("Foreign service")' "$tmp/role.json" "$target" "${owner%%=*}" "${owner#*=}"
  fi
done
[[ $(docker volume inspect --format "{{index .Labels \"${owner%%=*}\"}}" "$userstorage") == "${owner#*=}" ]] || die "Чужой UserStorage"
[[ $(docker network inspect --format "{{index .Labels \"${owner%%=*}\"}}" "$net") == "${owner#*=}" ]] || die "Чужая сеть"
docker inspect "$server" > "$tmp/server.json"
node -e 'const v=JSON.parse(require("node:fs").readFileSync(process.argv[1]))[0]; if(!v.Mounts.some(m=>m.Destination==="/workdir/UserStorage"&&m.Name===process.argv[2]&&m.RW))throw Error("UserStorage mount mismatch")' "$tmp/server.json" "$userstorage"
publisher_user=$(docker exec "$server" stat -c '%u:%g' /proc/1)
DASHBOARD_WEB_USER="$(id -u):$(id -g)"
export DASHBOARD_PROJECT=$project DASHBOARD_IMAGE=$image DASHBOARD_WEB=$web DASHBOARD_WEB_USER
[[ $(id -u) != 0 ]] || die "web/builder должны работать не от root"
export DASHBOARD_OWNER_KEY=${owner%%=*} DASHBOARD_OWNER_VALUE=${owner#*=} DASHBOARD_STATE=$state
export DASHBOARD_PUBLISHER_USER=$publisher_user DASHBOARD_USERSTORAGE=$userstorage DASHBOARD_NETWORK=$net
export DASHBOARD_APP_PORT=$app_port DASHBOARD_APP_ORIGIN=$app_origin DASHBOARD_CLIENT_ORIGINS=$client_origins
export DASHBOARD_MODE=$mode DASHBOARD_CLI_BUTTON=$cli_button
compose() { docker compose -f "$pkg/deploy/compose.yaml" "$@"; }
check_builder_image() {
  docker inspect "$project-publisher" "$project-builder" | node "$pkg/deploy/check-release.mjs" builder-image "$@"
}

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
reload_apache() {
  docker exec "$studio" apachectl -t
  docker exec "$studio" apachectl -k graceful
}
if [[ $action == uninstall ]]; then
  unset DASHBOARD_BUILDER_IMAGE
  compose config --quiet
  for client in client client-debug; do
    root=$htdocs/$client
    docker exec "$studio" sed -Ei "$tags" "$root/index.html"
    docker exec "$studio" rm -f "$root/dashboard/shell.js" "$root/dashboard-probe.js" "$root/dashboard-parameter.js" "$root/dashboard-bootstrap.js" "$htdocs/dashboard-config/$client.json"
  done
  docker exec "$studio" rm -f "$conf"
  reload_apache
  compose down
  rm -f "$state/node" "$state/server.mjs"
  client_json original
  echo "Dashboard удалён; builds сохранён, каждый клиент читает свой оригинальный client.json."
  exit
fi

# A fixed public fixture binding; compare lookup with the preserved on-disk publication.
binding='{"packagePath":"/user/dashboard-roi/campaign.lgp","workflowGuid":"27cb94a9-f6e9-35ff-80b7-bc7d01ba6aa7","nodeGuid":"77c145b1-6ce3-458f-aa36-e6afdab2a930"}'
if [[ $action == check ]]; then
  [[ -n $web_id ]] || die "Контейнер web не найден"
  check_builder_image
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
    if (!v.HostConfig.SecurityOpt?.some(option => ["no-new-privileges", "no-new-privileges:true"].includes(option))) throw Error("web needs no-new-privileges")
    if (!v.Mounts.some(m => m.Destination === "/builds" && m.Source === process.argv[3] && m.RW === false)) throw Error("web builds mount mismatch")
    const mode = v.Config.Env.find(e => e.startsWith("DASHBOARD_MODE="))?.slice("DASHBOARD_MODE=".length)
    if (mode !== "normal" && mode !== "strict") throw Error("web mode mismatch")
    console.log(mode)
  ' "$tmp/web.json" "$(id -u):$(id -g)" "$builds")
  current=$(node -e 'const state=JSON.parse(require("node:fs").readFileSync(process.argv[1])); const ready=Object.entries(state).filter(([,e])=>e.key===process.argv[2]&&e.status==="ready").sort(([a],[b])=>b.localeCompare(a)); console.log(ready[0]?.[1].buildHash??"")' "$builds/state.json" "$roi")
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
  asset=$("$state/node" -p 'encodeURIComponent(process.argv[1])' -- "$asset")
  for path in "/apps/$roi/$current/" "/apps/$roi/$current/assets/$asset" /apps/ "/apps/$roi/$current" "/apps/$roi/$current/binding.json" "/apps/$roi/$current/sample.json"; do
    expected=404
    cache=no-store
    if [[ $path == "/apps/$roi/$current/" ]]; then expected=200; fi
    if [[ $path == */assets/* ]]; then expected=200; cache='public, max-age=31536000, immutable'; fi
    code=$(curl --noproxy '*' --resolve "dashboards.localhost:$app_port:127.0.0.1" -sS -D "$tmp/headers" -o /dev/null -w '%{http_code}' "$app_origin$path")
    [[ $code == "$expected" ]] || die "App host $path: HTTP $code (expected $expected)"
    app_headers "$tmp/headers" "$cache"
    [[ -z $(header "$tmp/headers" Location) ]] || die "App host must not redirect"
  done
  [[ $(curl --noproxy '*' --resolve "dashboards.localhost:$app_port:127.0.0.1" -sS -H "Host: evil.localhost:$app_port" -D "$tmp/headers" -o /dev/null -w '%{http_code}' "$app_origin/apps/") == 403 ]] || die 'App host: expected 403'
  app_headers "$tmp/headers" no-store
  client_json overlay
  echo "Apache и web: ROI lookup/state, режим $mode, заголовки, ограничения контейнера, обе оболочки и оба JSON совпадают."
  DASHBOARD_STUDIO_ORIGIN="$base" node "$pkg/deploy/check-studio.mjs" master
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
install -d -m 700 "$state"
# The private 0700 parent protects host access; each role receives only its own mounts.
install -d -m 777 "$builds" "$state/jobs-in" "$state/jobs-out"
install -m 755 "$node_bin" "$state/node.new" && mv -f "$state/node.new" "$state/node"
install -m 644 "$pkg/dist/server.mjs" "$state/server.mjs.new" && mv -f "$state/server.mjs.new" "$state/server.mjs"
mkdir -p "$tmp/image/node-runtime/bin" "$tmp/image/node-runtime/lib/node_modules" "$tmp/image/template"
cp "$node_bin" "$tmp/image/node-runtime/bin/node"
npm_root=$(dirname "$(dirname "$node_bin")")/lib/node_modules/npm
[[ -f $npm_root/bin/npm-cli.js ]] || die "npm рядом с закреплённым Node не найден"
cp -R "$npm_root" "$tmp/image/node-runtime/lib/node_modules/npm"
tar -C "$pkg/template" --exclude=node_modules --exclude=dist -cf - . | tar -C "$tmp/image/template" -xf -
cp "$pkg/dist/server.mjs" "$tmp/image/server.mjs"
cp "$pkg/dist/shell.js" "$tmp/image/shell.js"
# Rootless Docker cannot reach the operators loopback proxy; cache only this pinned kit.
touch "$tmp/user.npmrc" "$tmp/global.npmrc"
(cd "$tmp/image/template" && env -i PATH="$PATH" LANG=C.UTF-8 NODE_USE_ENV_PROXY=1 HTTP_PROXY="${HTTP_PROXY:-}" HTTPS_PROXY="${HTTPS_PROXY:-}" NO_PROXY="${NO_PROXY:-}" "$node_bin" "$npm_root/bin/npm-cli.js" ci --userconfig="$tmp/user.npmrc" --globalconfig="$tmp/global.npmrc" --ignore-scripts --no-audit --fund=false --workspaces=false --cache "$tmp/image/npm-cache")
rm -rf "$tmp/image/template/node_modules" "$tmp/image/npm-cache/_logs"
base_image=debian:bookworm-slim@sha256:734a72b3d6142a71993b4bc580ca01d8ca687f77a2c422d96a961d3376b179bc
if docker image inspect "$local_image" >/dev/null 2>&1; then
  docker tag "$local_image" "$project:base"
  base_image=$project:base
fi
docker build --network none --build-arg "BASE_IMAGE=$base_image" -f "$pkg/deploy/Dockerfile" -t "$image" "$tmp/image"
DASHBOARD_BUILDER_IMAGE=$(docker image inspect --format '{{.Id}}' "$image") || die "Не удалось проверить образ builder"
[[ $DASHBOARD_BUILDER_IMAGE =~ ^sha256:[a-f0-9]{64}$ ]] || die "Неверный ID образа builder"
export DASHBOARD_BUILDER_IMAGE
compose config --quiet
docker exec "$server" mkdir -p "$storage"
for file in campaign.lgp dataset.csv; do
  docker exec -i "$server" sh -ec 'if [ ! -e "$1" ] && [ ! -L "$1" ]; then set -C; cat > "$1"; fi' sh "$storage/$file" < "dashboard/fixture/$file"
done
compose create
check_builder_image "$DASHBOARD_BUILDER_IMAGE"
docker inspect "$web" "$project-publisher" "$project-builder" > "$tmp/services.json"
node --input-type=module - "$tmp/services.json" "$state" "$userstorage" "$publisher_user" "$DASHBOARD_WEB_USER" <<'JS'
import { readFileSync } from "node:fs"
const [web, publisher, builder] = JSON.parse(readFileSync(process.argv[2], "utf8"))
const [state, storage, publisherUser, user] = process.argv.slice(3)
if (new Set([web.Image, publisher.Image, builder.Image]).size !== 1) throw Error("Roles must use one image")
for (const c of [web, publisher, builder]) {
  if (!c.HostConfig.ReadonlyRootfs || JSON.stringify(c.HostConfig.CapDrop) !== '["ALL"]' || !c.HostConfig.SecurityOpt.includes("no-new-privileges:true")) throw Error("Container isolation mismatch")
  if (!c.HostConfig.Tmpfs?.["/tmp"]) throw Error("Working tmpfs missing")
}
if (web.Config.User !== user || builder.Config.User !== user || user.split(":")[0] === "0" || publisher.Config.User !== publisherUser) throw Error("Container UID mismatch")
if (publisher.HostConfig.NetworkMode !== "none" || builder.HostConfig.NetworkMode !== "none") throw Error("Offline roles have network")
if (builder.HostConfig.Memory !== 1073741824 || builder.HostConfig.PidsLimit !== 256) throw Error("Builder limits mismatch")
for (const [c, expected] of [[web, [["/builds", false]]], [publisher, [["/storage", false], ["/builds", true], ["/jobs-in", true], ["/jobs-out", true]]], [builder, [["/jobs-in", false], ["/jobs-out", true]]]]) {
  if (c.Mounts.filter(m=>m.Type!=="tmpfs").length !== expected.length) throw Error("Unexpected role mount")
  for (const [target, rw] of expected) if (!c.Mounts.some(m=>m.Destination===target&&m.RW===rw&&(target==="/storage"?m.Name===storage:m.Source===state+target))) throw Error("Role mount mismatch")
}
console.log("Three-role image, mounts, UID and isolation verified before start")
JS
compose start

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
  Require expr "tolower(req('Host')) == '${base#http://}'"
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
echo "Dashboard установлен ($mode). Создайте и опубликуйте ROI через Desktop (Создать dashboard → Опубликовать), затем выполните check: $0 check --config $config"
