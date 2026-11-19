#!/usr/bin/env bash
set -euo pipefail

here=$(cd -- "$(dirname -- "$0")" && pwd)
scratch=$(mktemp -d)
trap 'rm -rf -- "$scratch"' EXIT
tag=7.4.2-6e72ef0f1824
enterprise=loginom-release-$tag
bundle=loginom-release-$tag-dashboard-m7
root=()
if (( EUID != 0 )); then root=(unshare --user --map-root-user); fi

printf 'bad archive\n' > "$scratch/$bundle.tar"
(cd "$scratch" && sha256sum "$bundle.tar" > "$bundle.tar.sha256")
test -f "$here/install-all.sh"
cp -- "$here/install-all.sh" "$scratch/"
if "${root[@]}" bash "$scratch/install-all.sh" </dev/null > "$scratch/output" 2>&1; then
  echo "Accepted a damaged archive" >&2
  exit 1
fi
grep -Fq 'Контрольная сумма' "$scratch/output"
echo 'PASS: повреждённый архив'

mkdir -p "$scratch/bin" "$scratch/fixture/$bundle"
tar -cf "$scratch/$bundle.tar" -C "$scratch/fixture" "$bundle"
(cd "$scratch" && sha256sum "$bundle.tar" > "$bundle.tar.sha256")
digest=$(sha256sum < "$scratch/$bundle.tar")
digest=${digest%% *}
sed -E "s/^expected=[0-9a-f]{64}/expected=$digest/; s@/run/loginom-install-all.lock@$scratch/install.lock@" "$here/install-all.sh" > "$scratch/install-all.sh"
cat > "$scratch/bin/docker" <<'DOCKER'
#!/usr/bin/env bash
case "$*" in
  'version --format {{.Server.Version}}') echo 29.1.3 ;;
  'compose version --short') echo 2.40.3 ;;
  'info --format {{json .SecurityOptions}}') echo '[]' ;;
  'info --format {{.DockerRootDir}}') echo "$TEST_ROOT" ;;
  'ps -a --format '*) printf "%s\n" "${TEST_INVENTORY:-}" ;;
  'port loginom-dashboard-web 8101/tcp') cat "$TEST_ROOT/app-bind" ;;
  'port loginom-release-http 80/tcp') cat "$TEST_ROOT/bind" ;;
  'exec --user 0 loginom-release-server cat /opt/loginom-release/config/Users.cfg')
    printf '%s\n' '<Users><Item Name="admin" IsAdmin="true" MustChangePassword="true" Password="seed" /></Users>' ;;
  'compose -p loginom-release '*)
    [[ ! -v HTTP_BIND && $* == *' up -d --no-deps http' ]]
    bind=$(sed -n 's/^HTTP_BIND=//p' "$TEST_ROOT/host/base/.env")
    printf '%s:18080\n' "$bind" > "$TEST_ROOT/bind" ;;
  *) exit 99 ;;
esac
DOCKER
chmod +x "$scratch/bin/docker"
if "${root[@]}" env TEST_ROOT="$scratch" TEST_INVENTORY="foreign-analytics loginom-release analytics" PATH="$scratch/bin:$PATH" bash "$scratch/install-all.sh" </dev/null > "$scratch/output" 2>&1; then
  echo "Accepted a foreign Compose service" >&2
  exit 1
fi
grep -Fq 'Чужой контейнер' "$scratch/output"
echo 'PASS: чужой контейнер'

cat > "$scratch/bin/ss" <<'SS'
#!/usr/bin/env bash
if [[ $* == *":${TEST_OCCUPIED_PORT:-none}" ]]; then echo 'LISTEN'; fi
SS
chmod +x "$scratch/bin/ss"
if printf 'studio.test\n18080\n18101\n' | "${root[@]}" env TEST_ROOT="$scratch" TEST_OCCUPIED_PORT=18101 PATH="$scratch/bin:$PATH" bash "$scratch/install-all.sh" > "$scratch/output" 2>&1; then
  echo "Accepted a busy application port" >&2
  exit 1
fi
grep -Fq 'Порт 18101 занят' "$scratch/output"
echo 'PASS: занятый порт'

mkdir -p "$scratch/fixture/$enterprise" "$scratch/host"
printf '%s\n' 'services: {}' > "$scratch/fixture/$enterprise/compose.yaml"
cat > "$scratch/fixture/$enterprise/install.sh" <<'INSTALL'
#!/usr/bin/env bash
set -euo pipefail
[[ ! -v HTTP_BIND ]]
if [[ $* == *' --sp-key '* ]]; then
  [[ $(< "${!#}") == TEST-SERIAL ]]
  printf 'activate\n' >> "$TEST_ROOT/events"
  exit 1
fi
[[ "$*" == '--bind 127.0.0.1 --http-port 18080 --wait 300 --license-server license.test' ]]
printf 'enterprise\n' >> "$TEST_ROOT/events"
mkdir -p "$TEST_ROOT/host/base" "$TEST_ROOT/host/data/workdir"
cp -- compose.yaml "$TEST_ROOT/host/base/"
cp -- verify.sh "$TEST_ROOT/host/base/"
cat > "$TEST_ROOT/host/base/.env" <<ENV
RELEASE_TAG=7.4.2-6e72ef0f1824
DATA_DIR=$TEST_ROOT/host/data
HTTP_PORT=18080
HTTP_BIND=127.0.0.1
LICENSE_MODE=server
ENV
printf '127.0.0.1:18080\n' > "$TEST_ROOT/bind"
exit "${TEST_VENDOR_EXIT:-0}"
INSTALL
cat > "$scratch/fixture/$enterprise/verify.sh" <<'VERIFY'
#!/usr/bin/env bash
set -euo pipefail
if [[ ${TEST_REPLACE_DATA_ON_VERIFY:-0} == 1 && $* == '--wait 300' ]]; then
  mv -- "$TEST_ROOT/host/data" "$TEST_ROOT/host/owned-data"
  cp -a -- "$TEST_ROOT/host/owned-data" "$TEST_ROOT/host/data"
fi
VERIFY
cat > "$scratch/fixture/$enterprise/sp-key.sh" <<'GUARDANT'
sp_normalize_serial() {
  [[ $1 == TEST-SERIAL ]] || return 1
  printf '%s\n' "$1"
}
GUARDANT
cat > "$scratch/bin/systemctl" <<'SYSTEMCTL'
#!/usr/bin/env bash
exit 3
SYSTEMCTL
chmod +x "$scratch/bin/systemctl"
cat > "$scratch/fixture/$bundle/dashboard-742.sh" <<'DASHBOARD'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$TEST_ROOT/events"
if [[ $1 == check ]]; then exit "${TEST_CHECK_EXIT:-0}"; fi
mkdir -p "$TEST_ROOT/host/addon/apache-conf"
printf '7.4.2-6e72ef0f1824\n' > "$TEST_ROOT/host/addon/.loginom-dashboard-release"
touch "$TEST_ROOT/host/addon/apache-conf/httpd.conf"
mkdir -p "$TEST_ROOT/host/dashboard"
touch "$TEST_ROOT/host/dashboard/.env"
if [[ ${TEST_INSTALL_EXIT:-0} != 0 ]]; then exit "$TEST_INSTALL_EXIT"; fi
printf '0.0.0.0:18101\n:::18101\n' > "$TEST_ROOT/app-bind"
DASHBOARD
chmod +x "$scratch/fixture/$enterprise/"*.sh "$scratch/fixture/$bundle/dashboard-742.sh"
(cd "$scratch/fixture/$enterprise" && sha256sum compose.yaml install.sh verify.sh sp-key.sh > SHA256SUMS)
tar -cf "$scratch/fixture/$bundle/$enterprise.tar" -C "$scratch/fixture" "$enterprise"
(cd "$scratch/fixture/$bundle" && sha256sum "$enterprise.tar" dashboard-742.sh > SHA256SUMS)
tar -cf "$scratch/$bundle.tar" -C "$scratch/fixture" "$bundle"
(cd "$scratch" && sha256sum "$bundle.tar" > "$bundle.tar.sha256")
digest=$(sha256sum < "$scratch/$bundle.tar")
digest=${digest%% *}
sed -E \
  -e "s/^expected=[0-9a-f]{64}/expected=$digest/" \
  -e "s@/run/loginom-install-all.lock@$scratch/install.lock@" \
  -e "s@^store=.*@store=$scratch/host/store@" \
  -e "s@^base=.*@base=$scratch/host/base@" \
  -e "s@^data=.*@data=$scratch/host/data@" \
  -e "s@^addon=.*@addon=$scratch/host/addon@" \
  -e "s@^dashboard_state=.*@dashboard_state=$scratch/host/dashboard@" \
  -e "s@/opt/guardant@$scratch/host/guardant@g" \
  -e "s@/var/guardant/Containers@$scratch/host/guardant/Containers@g" \
  -e "s@/run/loginom-activation\.@$scratch/activation.@" \
  -e "s@ /opt\)@ $scratch/host)@" \
  "$here/install-all.sh" > "$scratch/install-all.sh"
run_installer() {
  "${root[@]}" env HTTP_BIND=0.0.0.0 TEST_ROOT="$scratch" PATH="$scratch/bin:$PATH" "$@" \
    bash "$scratch/install-all.sh" > "$scratch/output" 2>&1
}
inputs='studio.test\n18080\n18101\n1\nlicense.test\n\n'
status=0
printf '%b' "$inputs" | run_installer TEST_VENDOR_EXIT=3 || status=$?
if [[ $status != 3 ]]; then cat "$scratch/output" >&2; exit 1; fi
grep -Fq 'Лицензия' "$scratch/output"
[[ $(< "$scratch/bind") == '127.0.0.1:18080' && $(< "$scratch/events") == enterprise ]]
echo 'PASS: ошибка лицензии оставляет Studio на loopback'

mv -- "$scratch/host/data" "$scratch/host/owned-data"
mkdir "$scratch/host/data"
printf '%s\n' 'unrelated files' > "$scratch/host/data/untouched"
if printf '\n\n' | run_installer; then
  echo 'Accepted a replacement data directory' >&2
  exit 1
fi
grep -Fq 'Каталоги Enterprise принадлежат другой установке' "$scratch/output"
[[ $(< "$scratch/events") == enterprise ]]
[[ $(< "$scratch/host/data/untouched") == 'unrelated files' ]]
rm -r -- "$scratch/host/data"
mv -- "$scratch/host/owned-data" "$scratch/host/data"
echo 'PASS: повтор при подмене каталога не запускает штатный установщик'

printf '\n\n' | run_installer && { echo 'Accepted EOF before password change' >&2; exit 1; }
grep -Fq 'Сменили пароль admin' "$scratch/output"
[[ $(< "$scratch/bind") == '127.0.0.1:18080' ]]
[[ $(< "$scratch/events") == $'enterprise\nenterprise' ]]
echo 'PASS: прерывание на смене пароля не публикует Studio'

printf '%s\n' '<Users><Item Name="admin" IsAdmin="true" MustChangePassword="true" Password="seed" /></Users>' \
  > "$scratch/host/data/workdir/Users.cfg"
if printf 'да\n' | run_installer; then
  echo 'Opened Studio after an unconfirmed password change' >&2
  exit 1
fi
grep -Fq 'Смена пароля не подтверждена' "$scratch/output"
[[ $(< "$scratch/bind") == '127.0.0.1:18080' ]]
echo 'PASS: ответ без смены пароля не публикует Studio'

printf '%s\n' '<Users><Item Name="admin" IsAdmin="true" Password="changed" /></Users>' \
  > "$scratch/host/data/workdir/Users.cfg"
expect_no_studio_publication() {
  if printf 'да\n' | run_installer "$@"; then
    echo 'Opened Studio after adopting replacement data during password phase' >&2
    exit 1
  fi
  grep -Fq 'Каталоги Enterprise принадлежат другой установке' "$scratch/output"
  [[ $(< "$scratch/bind") == '127.0.0.1:18080' && $(< "$scratch/events") == $'enterprise\nenterprise' ]]
  rm -r -- "$scratch/host/data"
  mv -- "$scratch/host/owned-data" "$scratch/host/data"
}
mv -- "$scratch/host/data" "$scratch/host/owned-data"
cp -a -- "$scratch/host/owned-data" "$scratch/host/data"
expect_no_studio_publication
echo 'PASS: после подмены каталога данных возобновление не публикует Studio'

expect_no_studio_publication TEST_REPLACE_DATA_ON_VERIFY=1
echo 'PASS: подмена каталога данных во время смены пароля не публикует Studio'

if printf 'да\n' | run_installer TEST_INSTALL_EXIT=2; then
  echo 'Ignored a failed Dashboard install' >&2
  exit 1
fi
[[ $(< "$scratch/bind") == '0.0.0.0:18080' ]]
first_attempt=$'enterprise\nenterprise\ninstall --public-host studio.test --app-host-port 18101'
[[ $(< "$scratch/events") == "$first_attempt" ]]

marker="$scratch/host/addon/.loginom-dashboard-release"
printf 'other-release\n' > "$marker"
if run_installer < /dev/null; then
  echo 'Adopted another Dashboard release' >&2
  exit 1
fi
[[ $(< "$scratch/events") == "$first_attempt" ]]
printf '%s\n' "$tag" > "$marker"
if run_installer TEST_CHECK_EXIT=2 < /dev/null; then
  echo 'Ignored a failed Dashboard check' >&2
  exit 1
fi
grep -Fq 'Проверка Dashboard завершилась ошибкой' "$scratch/output"
second_attempt="$first_attempt"$'\ninstall --public-host studio.test --app-host-port 18101\ncheck'
[[ $(< "$scratch/events") == "$second_attempt" ]]
echo 'PASS: после смены пароля Studio открыта, Dashboard продолжает свою прерванную установку'

run_installer TEST_OCCUPIED_PORT=18101 < /dev/null
grep -Fq 'Studio готова' "$scratch/output"
[[ $(< "$scratch/events") == "$second_attempt"$'\ncheck' ]]
echo 'PASS: повтор после ошибки проверяет Dashboard без переустановки'

mv -- "$scratch/host" "$scratch/host-external"
mkdir "$scratch/host"
rm "$scratch/events"
touch "$scratch/new.grdvd"
if printf 'studio.test\n18080\n18101\n3\n%s\nда\ntypo\n' "$scratch/new.grdvd" | run_installer; then
  echo 'Accepted an invalid serial' >&2
  exit 1
fi
grep -Fq 'Неверный формат серийного номера' "$scratch/output"
test ! -e "$scratch/events"
if printf '%s\nда\nTEST-SERIAL\n' "$scratch/new.grdvd" | run_installer; then
  echo 'Ignored a failed activation' >&2
  exit 1
fi
[[ $(< "$scratch/events") == activate ]]
if run_installer < /dev/null; then
  echo 'Allowed a retry after an inconclusive activation' >&2
  exit 1
fi
grep -Fq 'Результат прежней активации не подтверждён' "$scratch/output"
[[ $(< "$scratch/events") == activate ]]
echo 'PASS: опечатку в серийном номере можно исправить до активации'
