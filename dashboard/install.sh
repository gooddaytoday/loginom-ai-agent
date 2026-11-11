#!/usr/bin/env bash
# Installs this checkout into the isolated master stand from the research recipe.
set -euo pipefail
cd "$(dirname "$0")"
project=$(cd .. && pwd -P)
studio=dashboard-master-20261109-studio
server=dashboard-master-20261109-server
app=/workdir/dashboard-app
storage=/workdir/UserStorage/user/dashboard-roi

if [[ ! -x template/node_modules/.bin/vite ]]; then (cd template && npm ci --no-audit --no-fund); fi
docker exec "$server" mkdir -p "$app/apps" "$storage"
for file in fixture/campaign.lgp fixture/dataset.csv; do
  if ! docker exec "$server" test -e "$storage/${file##*/}"; then docker cp "$file" "$server:$storage/"; fi
done
docker cp server.mjs "$server:$app/server.mjs"
if ! docker exec "$server" test -x /app/dashboard-node; then docker cp "$(command -v node)" "$server:/app/dashboard-node"; fi
docker exec "$server" sh -c 'ps -eo pid,args | awk '\''$2 == "/app/dashboard-node" && $3 == "/workdir/dashboard-app/server.mjs" {print $1}'\'' | xargs -r kill'
# Apache runs in the studio container, so this process must accept the Docker network address.
# The server container publishes no ports and shares that network only with studio.
docker exec -d -e DASHBOARD_PROJECT_ROOT="$project" -e DASHBOARD_HOST=0.0.0.0 -e DASHBOARD_PUBLIC_HOSTS=127.0.0.1:32768,localhost:32768 "$server" /app/dashboard-node "$app/server.mjs"
config=$(mktemp -d)
trap 'rm -rf "$config"' EXIT
for client in client client-debug; do
  root=/usr/local/apache2/htdocs/$client
  docker cp "$studio:$root/client.json" "$config/$client.json"
  docker cp parameter.js "$studio:$root/dashboard-parameter.js"
  docker cp bootstrap.js "$studio:$root/dashboard-bootstrap.js"
  docker exec "$studio" sed -i -e '/<script src="dashboard-\(probe\|parameter\|bootstrap\)\.js"><\/script>/d' \
    -e '/<\/head>/i\<script src="dashboard-parameter.js"></script>\n<script src="dashboard-bootstrap.js"></script>' "$root/index.html"
done
node - "$config" <<'NODE'
const {readFileSync, writeFileSync} = require("node:fs")
const configs = ["client", "client-debug"].map(client => ({
  file: `${process.argv[2]}/${client}.json`,
  value: JSON.parse(readFileSync(`${process.argv[2]}/${client}.json`, "utf8")),
}))
for (const config of configs) {
  config.value.rememberuser = false
  writeFileSync(config.file, JSON.stringify(config.value))
}
NODE
docker exec "$studio" mkdir -p /usr/local/apache2/htdocs/dashboard-config
docker cp "$config/." "$studio:/usr/local/apache2/htdocs/dashboard-config/"
docker exec -i "$studio" sh -c 'cat > /usr/local/apache2/conf/dashboard-app.site.conf' <<'CONF'
Alias "/app/client.json" "/usr/local/apache2/htdocs/dashboard-config/client.json"
Alias "/app-debug/client.json" "/usr/local/apache2/htdocs/dashboard-config/client-debug.json"
<FilesMatch "^(index\.html|dashboard-(bootstrap|parameter)\.js)$">
  Header set Cache-Control "no-cache"
</FilesMatch>
<Location "/dashboard/">
  Require expr "tolower(req('Host')) == '127.0.0.1:32768' || tolower(req('Host')) == 'localhost:32768'"
  ProxyPreserveHost On
</Location>
ProxyPass /dashboard/ http://dashboard-master-20261109-server:8100/dashboard/
ProxyPassReverse /dashboard/ http://dashboard-master-20261109-server:8100/dashboard/
CONF
docker exec "$studio" apachectl -t
docker exec "$studio" apachectl -k graceful
curl -fsS http://127.0.0.1:32768/app/dashboard-bootstrap.js >/dev/null
# Node starts in the background. 404 on an unknown id means Apache reached it; 000 or 5xx does not.
code=000
for _ in 1 2 3 4 5 6 7 8 9 10; do
  code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 2 \
    http://127.0.0.1:32768/dashboard/targets/00000000-0000-0000-0000-000000000000 || true)
  if [[ "$code" == 404 ]]; then break; fi
  sleep 0.5
done
if [[ "$code" != 404 ]]; then
  printf 'Сервис снимков недоступен через Apache (HTTP %s). В контейнере server нужен DASHBOARD_HOST=0.0.0.0.\n' "$code" >&2
  exit 1
fi
