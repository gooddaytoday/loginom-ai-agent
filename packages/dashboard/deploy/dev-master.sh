#!/usr/bin/env bash
# Only the isolated dashboard master from dashboard/stand/README.md.
set -euo pipefail
cd "$(dirname "$0")/../../.."
project=$(pwd -P)
pkg=packages/dashboard
studio=dashboard-master-20261109-studio
server=dashboard-master-20261109-server
htdocs=/usr/local/apache2/htdocs
app=/workdir/dashboard-app
storage=/workdir/UserStorage/user/dashboard-roi
base=http://127.0.0.1:32768
die() { echo "$*" >&2; exit 1; }
[[ $# == 1 ]] || die "Usage: $0 install|check|uninstall"
case $1 in install|check|uninstall) ;; *) die "Usage: $0 install|check|uninstall";; esac
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

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
    curl -fsS "$base/app${client#client}/client.json" -o "$tmp/http.json"
    node -e '
      const fs = require("node:fs"), {isDeepStrictEqual} = require("node:util")
      const read = f => JSON.parse(fs.readFileSync(f))
      if (!isDeepStrictEqual(read(process.argv[1]), read(process.argv[2]))) throw Error(process.argv[3]+" JSON differs")
    ' "$tmp/$client.$1" "$tmp/http.json" "$client"
  done
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
if [[ $1 == uninstall ]]; then
  for client in client client-debug; do
    root=$htdocs/$client
    docker exec "$studio" sed -Ei "$tags" "$root/index.html"
    docker exec "$studio" rm -f "$root/dashboard/shell.js" "$root/dashboard-probe.js" "$root/dashboard-parameter.js" "$root/dashboard-bootstrap.js" "$htdocs/dashboard-config/$client.json"
  done
  docker exec "$studio" rm -f /usr/local/apache2/conf/dashboard-app.site.conf
  reload_apache
  stop_service
  docker exec "$server" rm -f /app/dashboard-node "$app/server.mjs"
  client_json original
  echo "Dashboard удалён; каждый клиент читает свой оригинальный client.json."
  exit
fi

# A fixed public fixture binding; compare lookup with the preserved on-disk publication.
roi_sha256=f42521cdeb21bbc3a3b536da85dab3936a512c5228df34864fc060dc71d886be
binding='{"server":"http://127.0.0.1:32768","packagePath":"/user/dashboard-roi/campaign.lgp","workflowGuid":"27cb94a9-f6e9-35ff-80b7-bc7d01ba6aa7","nodeGuid":"77c145b1-6ce3-458f-aa36-e6afdab2a930","port":0}'
if [[ $1 == check ]]; then
  exists=$(docker exec "$server" sh -ec 'if test -f "$1/index.html"; then echo true; else echo false; fi' sh "$app/apps/$roi_sha256")
  code=$(curl -sS -o "$tmp/lookup" -w '%{http_code}' -H 'Content-Type: application/json' -d "$binding" "$base/dashboard/lookup")
  [[ $code == 200 ]] || die "ROI lookup: HTTP $code (expected 200)"
  node -e '
    const res = JSON.parse(require("node:fs").readFileSync(process.argv[1]))
    if (res.key !== process.argv[2] || res.exists !== JSON.parse(process.argv[3])) throw Error("ROI lookup mismatch")
  ' "$tmp/lookup" "$roi_sha256" "$exists"
  if [[ $exists == true ]]; then curl -fsS "$base/dashboard/apps/$roi_sha256/" >/dev/null; fi
  for path in current "apps/$roi_sha256/binding.json" "apps/$roi_sha256/sample.json"; do
    [[ $(curl -sS -o /dev/null -w '%{http_code}' "$base/dashboard/$path") == 404 ]] || die "Expected 404: $path"
  done
  [[ $(curl -sS -H 'Host: dashboard.invalid' -o /dev/null -w '%{http_code}' "$base/dashboard/current") == 403 ]] || die 'Host: expected 403'
  for prefix in app app-debug; do
    curl -fsS "$base/$prefix/" -o "$tmp/index"
    [[ $(grep -Fc '<script src="dashboard/shell.js"></script>' "$tmp/index") == 1 ]] || die "$prefix: expected one shell script"
    curl -fsS -D "$tmp/headers" "$base/$prefix/dashboard/shell.js" -o "$tmp/shell.js"
    grep -iq '^cache-control:.*no-cache' "$tmp/headers" || die "$prefix: shell.js missing no-cache"
    cmp "$pkg/dist/shell.js" "$tmp/shell.js"
  done
  client_json overlay
  echo "Apache: ROI exists=$exists, current/metadata=404, Host=403, обе оболочки и оба JSON совпадают."
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
# M0 can be running an older Node. Check the replacement in the server's exact image, before touching either container.
image=$(docker inspect --format '{{.Image}}' "$server")
docker run --rm --network none --entrypoint /dashboard-node \
  -v "$node_bin:/dashboard-node:ro" -v "$project/$pkg/dist/server.mjs:/dashboard-server.mjs:ro" "$image" \
  -e 'if (process.versions.node !== process.argv[1]) process.exit(1); import("/dashboard-server.mjs")' "$pin"

legacy=dashboard/template/node_modules
if [[ -e $legacy || -L $legacy ]]; then
  [[ -x $legacy/.bin/vite && -x $legacy/.bin/tsc ]] || die "Нерабочий $legacy оставлен без изменений"
fi
for file in campaign.lgp dataset.csv; do [[ -s dashboard/fixture/$file ]] || die "Нет dashboard/fixture/$file"; done
if [[ ! -x $pkg/template/node_modules/.bin/vite || ! -x $pkg/template/node_modules/.bin/tsc ]]; then
  [[ ! -L $pkg/template/node_modules && ( ! -e $pkg/template/node_modules || -d $pkg/template/node_modules ) ]] ||
    die 'Не заменяю нестандартный node_modules нового шаблона'
  (cd "$pkg/template" && npm ci --ignore-scripts --no-audit --no-fund)
fi
if [[ ! -e $legacy ]]; then
  [[ ! -L dashboard/template ]] || die 'Не записываю в ссылку dashboard/template'
  mkdir -p dashboard/template
  ln -s "$project/$pkg/template/node_modules" "$legacy"
fi

docker exec "$server" mkdir -p "$app/apps" "$storage"
for file in campaign.lgp dataset.csv; do
  docker exec -i "$server" sh -ec 'if [ ! -e "$1" ] && [ ! -L "$1" ]; then set -C; cat > "$1"; fi' sh "$storage/$file" < "dashboard/fixture/$file"
done
docker cp "$node_bin" "$server:/app/dashboard-node.new"
docker exec "$server" mv -f /app/dashboard-node.new /app/dashboard-node
stop_service
docker cp "$pkg/dist/server.mjs" "$server:$app/server.mjs"
docker exec -d -e DASHBOARD_PROJECT_ROOT="$project" -e DASHBOARD_HOST=0.0.0.0 -e DASHBOARD_ALLOW_CURRENT=0 \
  -e DASHBOARD_PUBLIC_HOSTS=127.0.0.1:32768,localhost:32768 "$server" /app/dashboard-node "$app/server.mjs"

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
docker exec -i "$studio" sh -c 'cat > /usr/local/apache2/conf/dashboard-app.site.conf' <<'CONF'
Alias "/app/client.json" "/usr/local/apache2/htdocs/dashboard-config/client.json"
Alias "/app-debug/client.json" "/usr/local/apache2/htdocs/dashboard-config/client-debug.json"
<FilesMatch "^(index\.html|shell\.js)$">
  Header set Cache-Control "no-cache"
</FilesMatch>
<Location "/dashboard/">
  Require expr "tolower(req('Host')) == '127.0.0.1:32768' || tolower(req('Host')) == 'localhost:32768'"
  ProxyPreserveHost On
</Location>
ProxyPass /dashboard/ http://dashboard-master-20261109-server:8100/dashboard/
ProxyPassReverse /dashboard/ http://dashboard-master-20261109-server:8100/dashboard/
CONF
reload_apache
# The service starts in the background; Apache may briefly return 503.
curl --retry 5 --retry-delay 1 -fsS -H 'Content-Type: application/json' -d "$binding" "$base/dashboard/lookup" >/dev/null
echo "Dashboard установлен. Для HTTP и авторизованной Studio выполните: $0 check"
