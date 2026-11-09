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
docker exec -d -e DASHBOARD_PROJECT_ROOT="$project" "$server" /app/dashboard-node "$app/server.mjs"
for client in client client-debug; do
  root=/usr/local/apache2/htdocs/$client
  docker cp parameter.js "$studio:$root/dashboard-parameter.js"
  docker cp bootstrap.js "$studio:$root/dashboard-bootstrap.js"
  docker exec "$studio" sed -i -e '/<script src="dashboard-\(probe\|parameter\|bootstrap\)\.js"><\/script>/d' \
    -e '/<\/head>/i\<script src="dashboard-parameter.js"></script>\n<script src="dashboard-bootstrap.js"></script>' "$root/index.html"
done
docker exec -i "$studio" sh -c 'cat > /usr/local/apache2/conf/dashboard-app.site.conf' <<'CONF'
<FilesMatch "^(index\.html|dashboard-(bootstrap|parameter)\.js)$">
  Header set Cache-Control "no-cache"
</FilesMatch>
ProxyPass /dashboard/ http://dashboard-master-20261109-server:8100/dashboard/
ProxyPassReverse /dashboard/ http://dashboard-master-20261109-server:8100/dashboard/
CONF
docker exec "$studio" apachectl -t
docker exec "$studio" apachectl -k graceful
curl -fsS http://127.0.0.1:32768/app/dashboard-bootstrap.js >/dev/null
