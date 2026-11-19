#!/usr/bin/env bash
set +x
set -euo pipefail
umask 077

die() { printf '%s\n' "$*" >&2; exit 1; }

[[ $# == 0 ]] || die 'Запустите sudo ./install-all.sh без аргументов.'
(( EUID == 0 )) || die 'Запустите sudo ./install-all.sh.'

here=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
tag=7.4.2-6e72ef0f1824
enterprise=loginom-release-$tag
release=$enterprise-dashboard-m7
archive=$release.tar
expected=32d8341fc7621bf573d4c6f05ed83dfe179fd33b8e990d6cfa1de2db7ab9acbb
[[ -f $here/$archive && -f $here/$archive.sha256 ]] || die 'Положите архив и файл .sha256 рядом с установщиком.'
[[ $(< "$here/$archive.sha256") == "$expected  $archive" &&
   $(sha256sum < "$here/$archive") == "$expected  -" ]] || die 'Контрольная сумма дистрибутива не совпала.'

for tool in docker curl python3 flock ss journalctl sysctl; do
  command -v "$tool" >/dev/null || die "Установите $tool и повторите запуск."
done
[[ $(uname -sm) == 'Linux x86_64' && -S /run/systemd/journal/socket ]] ||
  die 'Нужен Linux x86_64 с работающим systemd-journald.'
curl_version=$(curl --version)
[[ $curl_version == *brotli/* && $curl_version == *zlib/* ]] || die 'Нужен curl с gzip и Brotli.'

# Compose reads exported variables before its --env-file.
while IFS= read -r variable; do
  case "$variable" in DOCKER_*|COMPOSE_*|DASHBOARD_*) unset "$variable" ;; esac
done < <(compgen -e)
unset RELEASE_TAG DATA_DIR HTTP_BIND HTTP_PORT
[[ -S /run/docker.sock ]] || die 'Запустите системный Docker Engine.'
export DOCKER_HOST=unix:///run/docker.sock
version_at_least() {
  local found=${1#v} minimum=$2
  found=${found%%[-+]*}
  [[ $found =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] &&
    [[ $(printf '%s\n' "$minimum" "$found" | sort -V | head -n 1) == "$minimum" ]]
}
version_at_least "$(docker version --format '{{.Server.Version}}')" 29.1.3 || die 'Нужен Docker Engine 29.1.3 или новее.'
version_at_least "$(docker compose version --short)" 2.40.3 || die 'Нужен Docker Compose 2.40.3 или новее.'
security_options=$(docker info --format '{{json .SecurityOptions}}')
[[ $security_options != *rootless* ]] || die 'Нужен системный Docker с правами root.'

store=/opt/loginom-offline-bundles
bundle=$store/$release
state=$store/.install-$tag
base=/opt/loginom-release
data=/var/lib/loginom-release
addon=/opt/loginom-release-dashboard
dashboard_state=/var/opt/loginom-dashboard
exec 8>>/run/loginom-install-all.lock
flock -n 8 || die 'Установщик уже работает.'

has_path() { [[ -e $1 || -L $1 ]]; }
private_dir() { [[ -d $1 && ! -L $1 && $(stat -c '%u:%a' -- "$1") == 0:700 ]]; }
if has_path "$store"; then private_dir "$store" || die "Ожидается закрытый каталог root: $store"; fi
resuming=false
if has_path "$state"; then
  [[ -f $state && ! -L $state && $(stat -c '%u:%a' -- "$state") == 0:600 ]] ||
    die "Неверные права файла состояния: $state"
  resuming=true
fi
inventory=$(docker ps -a --format '{{.Names}} {{.Label "com.docker.compose.project"}} {{.Label "com.docker.compose.service"}}')
while read -r name project service; do
  [[ -n $name ]] || continue
  case "$project:$name" in
    loginom-release:*|loginom-dashboard:*|*:loginom-release-server|*:loginom-release-integrator|*:loginom-release-http|\
    *:loginom-dashboard-web|*:loginom-dashboard-builder|*:loginom-dashboard-publisher)
      if [[ $resuming == true ]]; then
        case "$project:$service:$name" in
          loginom-release:server:loginom-release-server|loginom-release:integrator:loginom-release-integrator|\
          loginom-release:http:loginom-release-http|loginom-dashboard:web:loginom-dashboard-web|\
          loginom-dashboard:builder:loginom-dashboard-builder|loginom-dashboard:publisher:loginom-dashboard-publisher) continue ;;
        esac
      fi
      die "Чужой контейнер в проекте Loginom: $name"
      ;;
  esac
done <<< "$inventory"

if [[ $resuming == false ]]; then
  for path in "$bundle" "$base" "$data" "$addon" "$dashboard_state"; do
    if has_path "$path"; then die "Каталог занят: $path"; fi
  done
fi

ask() {
  printf '%s ' "$1" >&2
  IFS= read -r reply || die 'Ввод прерван. Для продолжения запустите установщик снова.'
}
host_pattern='^[A-Za-z0-9][A-Za-z0-9.-]*$'
valid_port() { [[ $1 =~ ^[1-9][0-9]{0,4}$ && $1 -le 65535 ]]; }
phase=enterprise
license_mode=''
license_server=''
license_secondary=''
activation_attempted=no
if [[ $resuming == true ]]; then
  mapfile -t settings < "$state"
  [[ ${#settings[@]} == 8 ]] || die "Не удалось прочитать состояние установки: $state"
  phase=${settings[0]}
  public_host=${settings[1]}
  studio_port=${settings[2]}
  app_port=${settings[3]}
  license_mode=${settings[4]}
  license_server=${settings[5]}
  license_secondary=${settings[6]}
  activation_attempted=${settings[7]}
  [[ $phase =~ ^(enterprise|password|dashboard|check)$ &&
     $license_mode =~ ^(external|local|activate)$ && $activation_attempted =~ ^(no|yes)$ ]] ||
    die "Не удалось прочитать состояние установки: $state"
  printf 'Продолжаем установку Studio %s на портах %s и %s.\n' "$public_host" "$studio_port" "$app_port"
else
  ask 'Имя Studio или IPv4, доступные серверу и рабочему месту:'
  public_host=$reply
  ask 'Порт Studio [80]:'
  studio_port=${reply:-80}
  ask 'Порт приложений Dashboard [8101]:'
  app_port=${reply:-8101}
fi
[[ $public_host =~ $host_pattern ]] || die 'Укажите имя или IPv4 без схемы, порта и пути.'
if ! valid_port "$studio_port" || ! valid_port "$app_port" || [[ $studio_port == "$app_port" ]]; then
  die 'Укажите два разных порта от 1 до 65535.'
fi

check_port() {
  local port=$1 container=$2 target=$3 listeners mapping
  listeners=$(ss -Hltn "sport = :$port")
  [[ -n $listeners ]] || return 0
  if [[ $resuming == true ]]; then
    mapping=$(docker port "$container" "$target/tcp" 2>/dev/null) || mapping=''
    if [[ $mapping == *":$port" ]]; then return 0; fi
  fi
  die "Порт $port занят."
}
check_port "$studio_port" loginom-release-http 80
check_port "$app_port" loginom-dashboard-web 8101

scratch=''
trap 'if [[ -n $scratch ]]; then rm -rf -- "$scratch"; fi' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
save_state() {
  printf '%s\n' "$phase" "$public_host" "$studio_port" "$app_port" "$license_mode" \
    "$license_server" "$license_secondary" "$activation_attempted" > "$state.new"
  mv -fT -- "$state.new" "$state"
}

license_args=()
if [[ $phase == enterprise ]]; then
  if [[ -z $license_mode ]]; then
    printf '%s\n' '1 — внешний Guardant' '2 — активированный локальный ключ' '3 — активация нового локального ключа'
    ask 'Способ лицензирования [1]:'
    case "${reply:-1}" in
      1) license_mode=external ;;
      2) license_mode=local ;;
      3) license_mode=activate ;;
      *) die 'Выберите 1, 2 или 3.' ;;
    esac
  fi
  if [[ $license_mode == external ]]; then
    if [[ -n $license_server ]]; then
      ask "Основной сервер Guardant [$license_server]:"
      license_server=${reply:-$license_server}
    else
      ask 'Основной сервер Guardant:'
      license_server=$reply
    fi
    if [[ -n $license_secondary ]]; then
      ask "Резервный сервер Guardant [$license_secondary]:"
      license_secondary=${reply:-$license_secondary}
    else
      ask 'Резервный сервер Guardant [пропустить]:'
      license_secondary=$reply
    fi
    [[ $license_server =~ $host_pattern && ( -z $license_secondary || $license_secondary =~ $host_pattern ) ]] ||
      die 'Укажите имена серверов Guardant или IPv4 без схемы и порта.'
    license_args=(--license-server "$license_server")
    if [[ -n $license_secondary ]]; then license_args+=(--license-server-secondary "$license_secondary"); fi
  else
    if [[ ! -d /run/systemd/system ]] || ! command -v systemctl >/dev/null; then
      die 'Для локального ключа нужен работающий systemd.'
    fi
    command -v ip >/dev/null || die 'Для локального ключа установите iproute2.'
    [[ -x /opt/guardant/glds/sbin/gldsd ]] || command -v dpkg >/dev/null ||
      die 'Для установки локального Guardant нужен dpkg.'
    if [[ -e /opt/guardant/glds/etc/grdsrv.ini ]] || systemctl is-active --quiet glds ||
      [[ -n $(ss -Hltn 'sport = :3186') ]]; then
      printf '%s\n' 'Штатный установщик изменит настройки glds. Если он обслуживает другие машины, выберите внешний Guardant.'
      ask 'Подтвердите, что локальный glds выделен для этой установки [да/нет]:'
      [[ $reply == да || $reply == yes ]] || die 'Установка с локальным ключом остановлена.'
    fi
    active_key=''
    if [[ -d /var/guardant/Containers ]]; then
      active_key=$(find /var/guardant/Containers -maxdepth 1 -type f -iname '*.grdvd' -print -quit)
    fi
    license_args=(--sp-key)
    if [[ -n $active_key ]]; then
      if [[ $license_mode == activate && $activation_attempted == no ]]; then
        die 'На машине уже активирован ключ Guardant. Выберите активированный ключ или используйте лицензионный сервер.'
      fi
      license_mode=local
    elif [[ $activation_attempted == yes ]]; then
      die 'Результат прежней активации не подтверждён. Проверьте ключ Guardant и журнал sp-activation.log перед повтором.'
    elif [[ $license_mode == local ]]; then
      die 'На этой машине не найден активированный локальный ключ Guardant.'
    else
      ask 'Путь к файлу нового ключа .grdvd:'
      [[ -f $reply && -r $reply && ${reply,,} == *.grdvd ]] || die 'Файл .grdvd недоступен.'
      key_file=$(realpath -e -- "$reply")
      printf '%s\n' 'Активация требует связи с activation.guardant.ru и привязывает ключ к этой машине.'
      ask 'Активировать этот ключ [да/нет]:'
      [[ $reply == да || $reply == yes ]] || die 'Активация отменена.'
    fi
  fi
fi

if ! has_path "$store"; then install -d -m 700 -- "$store"; fi
if ! has_path "$bundle"; then
  [[ $phase == enterprise ]] || die "Не найден проверенный комплект: $bundle"
  docker_root=$(docker info --format '{{.DockerRootDir}}')
  docker_free=$(df -Pk -- "$docker_root" | awk 'NR==2 {print $4}')
  staging_free=$(df -Pk -- /opt | awk 'NR==2 {print $4}')
  (( docker_free >= 4194304 && staging_free >= 1048576 )) ||
    die 'Нужен 1 ГиБ для распаковки и 4 ГиБ в файловой системе Docker.'
  if [[ $(stat -c %d -- "$docker_root") == "$(stat -c %d -- /opt)" ]]; then
    (( docker_free >= 5242880 )) || die 'Нужно 5 ГиБ на общей файловой системе /opt и Docker.'
  fi
  save_state
  scratch=$(mktemp -d -- "$store/.staging.XXXXXXXX")
  cp -- "$here/$archive" "$scratch/$archive"
  [[ $(sha256sum < "$scratch/$archive") == "$expected  -" ]] ||
    die 'Контрольная сумма копии дистрибутива не совпала.'
  tar --no-same-owner -xpf "$scratch/$archive" -C "$scratch"
  rm -- "$scratch/$archive"
  (
    cd -- "$scratch/$release"
    sha256sum --quiet -c SHA256SUMS
    tar --no-same-owner -xpf "$enterprise.tar"
    cd -- "$enterprise"
    sha256sum --quiet -c SHA256SUMS
  )
  chmod 700 -- "$scratch/$release"
  mv -T -- "$scratch/$release" "$bundle"
  rmdir -- "$scratch"
  scratch=''
fi
private_dir "$bundle" || die "Неверные права распакованного комплекта: $bundle"
stock=$bundle/$enterprise
(cd -- "$bundle" && sha256sum --quiet -c SHA256SUMS)
(cd -- "$stock" && sha256sum --quiet -c SHA256SUMS)
export no_proxy="${no_proxy:-${NO_PROXY:-}},127.0.0.1,localhost,$public_host"
export NO_PROXY="$no_proxy"

ownership=$store/.enterprise-$tag
check_enterprise_ownership() {
  [[ -f $ownership && ! -L $ownership && $(stat -c '%u:%a' -- "$ownership") == 0:600 &&
     -d $base && ! -L $base && -d $data && ! -L $data &&
     $(stat -c '%d:%i' -- "$base" "$data") == "$(< "$ownership")" ]] ||
    die 'Каталоги Enterprise принадлежат другой установке.'
}

if [[ $phase == enterprise ]]; then
  if ! has_path "$ownership"; then
    if has_path "$base" || has_path "$data"; then
      die 'Происхождение каталогов Enterprise не подтверждено. Сохраните их и проверьте перед новым запуском.'
    fi
    mkdir -m 755 -- "$base" "$data"
    stat -c '%d:%i' -- "$base" "$data" > "$ownership.new"
    mv -fT -- "$ownership.new" "$ownership"
  fi
  check_enterprise_ownership
  [[ -z $(find "$base" "$data" -type l -print -quit) ]] ||
    die 'В каталогах Enterprise обнаружена символическая ссылка. Штатная установка остановлена.'

  if [[ $license_mode == activate ]]; then
    scratch=$(mktemp -d -- /run/loginom-activation.XXXXXXXX)
    # shellcheck source=/dev/null
    source "$stock/sp-key.sh"
    printf 'Серийный номер Guardant: ' >&2
    IFS= read -rs serial || die 'Ввод серийного номера прерван.'
    printf '\n' >&2
    serial=$(sp_normalize_serial "$serial") ||
      die 'Неверный формат серийного номера. Повторите запуск с номером из письма Guardant.'
    printf '%s\n' "$serial" > "$scratch/serial"
    unset serial
    license_args+=(--key-file "$key_file" --serial-file "$scratch/serial")
    activation_attempted=yes
  fi
  save_state
  license_status=0
  (umask 022; cd -- "$stock"; ./install.sh --bind 127.0.0.1 --http-port "$studio_port" --wait 300 "${license_args[@]}") ||
    license_status=$?
  if [[ -n $scratch ]]; then rm -rf -- "$scratch"; scratch=''; fi
  if (( license_status == 3 )); then
    echo 'Лицензия не получена. Studio остаётся на 127.0.0.1. Исправьте доступ к Guardant и повторите запуск.' >&2
    exit 3
  fi
  (( license_status == 0 )) || die "Штатная установка завершилась с кодом $license_status. После диагностики повторите запуск."
  if [[ $license_mode == activate ]]; then license_mode=local; fi
  phase=password
  save_state
fi

check_enterprise_ownership
[[ -f $base/.env && ! -L $base/.env ]] || die 'Не найдены каталоги штатной установки.'
cmp -s -- "$stock/compose.yaml" "$base/compose.yaml" || die 'Конфигурация Compose отличается от комплекта.'
get_setting() { sed -n "s/^$1=//p" "$base/.env"; }
[[ $(get_setting RELEASE_TAG) == "$tag" && $(get_setting DATA_DIR) == "$data" &&
   $(get_setting HTTP_PORT) == "$studio_port" ]] || die 'Параметры штатной установки отличаются от сохранённых.'

studio_mapping() { docker port loginom-release-http 80/tcp; }
base_compose=(docker compose -p loginom-release --project-directory "$base" --env-file "$base/.env" -f "$base/compose.yaml")
apply_bind() {
  local address=$1 env_file
  check_enterprise_ownership
  env_file=$(mktemp -- "$base/.env.XXXXXXXX") || return 1
  if ! sed "s/^HTTP_BIND=.*/HTTP_BIND=$address/" "$base/.env" > "$env_file" ||
    ! mv -fT -- "$env_file" "$base/.env"; then
    rm -f -- "$env_file"
    return 1
  fi
  "${base_compose[@]}" up -d --no-deps http &&
    [[ $(studio_mapping) == "$address:$studio_port" ]]
}
password_changed() {
  docker exec --user 0 loginom-release-server cat /opt/loginom-release/config/Users.cfg |
    python3 -c '
import sys
import xml.etree.ElementTree as ET

seed = ET.parse(sys.stdin).getroot()
current = ET.parse(sys.argv[1]).getroot()
def admin(users):
    entries = users.findall("./Item[@Name=\"admin\"]")
    if users.tag != "Users" or len(entries) != 1:
        raise ValueError("missing admin")
    return entries[0]

try:
    before, after = admin(seed), admin(current)
except ValueError:
    sys.exit(1)
password = after.get("Password")
sys.exit(not (
    after.get("IsAdmin", "").lower() == "true"
    and after.get("MustChangePassword", "false").lower() == "false"
    and password and password != before.get("Password")
))
' "$data/workdir/Users.cfg" 2>/dev/null
}

if [[ $phase == password ]]; then
  bind=$(get_setting HTTP_BIND)
  mapping=$(studio_mapping) || mapping=''
  [[ $bind == 127.0.0.1 || $bind == 0.0.0.0 ]] || die 'Неожиданное значение HTTP_BIND.'
  if [[ $bind == 0.0.0.0 && $mapping == "$bind:$studio_port" ]] && password_changed; then
    if ! "$stock/verify.sh" --wait 30; then
      apply_bind 127.0.0.1 || die 'Не удалось восстановить локальную привязку Studio.'
      die 'Открытие Studio завершилось ошибкой. Восстановлена локальная привязка.'
    fi
  else
    if [[ $bind != 127.0.0.1 || $mapping != "127.0.0.1:$studio_port" ]]; then
      apply_bind 127.0.0.1 || die 'Не удалось восстановить локальную привязку Studio.'
    fi
    "$stock/verify.sh" --wait 300
    printf '\nВыполните на рабочем месте в отдельном терминале:\n'
    printf '  ssh -N -o ExitOnForwardFailure=yes -L 127.0.0.1:8080:127.0.0.1:%s SSH_USER@SSH_HOST\n' "$studio_port"
    printf '%s\n' 'Замените SSH_USER и SSH_HOST. При нестандартном SSH-порте добавьте -p ПОРТ.' \
      'Откройте http://127.0.0.1:8080/app/, смените штатный пароль admin и войдите снова.'
    ask 'Сменили пароль admin и повторно вошли в Studio? [да/нет]:'
    [[ $reply == да || $reply == yes ]] || die 'Studio остаётся доступна через SSH-туннель.'
    password_changed || die 'Смена пароля не подтверждена. Studio остаётся доступна через SSH-туннель.'
    if ! apply_bind 0.0.0.0 || ! "$stock/verify.sh" --wait 30; then
      apply_bind 127.0.0.1 || die 'Сбой открытия Studio и восстановления локальной привязки.'
      die 'Открытие Studio завершилось ошибкой. Восстановлена локальная привязка.'
    fi
  fi
  phase=dashboard
  save_state
fi

[[ $(get_setting HTTP_BIND) == 0.0.0.0 && $(studio_mapping) == "0.0.0.0:$studio_port" ]] ||
  die 'Studio не опубликована на сохранённом порту.'
password_changed || die 'Смена пароля admin не подтверждена.'

if [[ $phase == dashboard ]]; then
  marker=$addon/.loginom-dashboard-release
  if has_path "$addon"; then
    [[ -d $addon && ! -L $addon && -f $marker && ! -L $marker && $(< "$marker") == "$tag" &&
       -d $addon/apache-conf && ! -L $addon/apache-conf &&
       -f $addon/apache-conf/httpd.conf && ! -L $addon/apache-conf/httpd.conf ]] ||
      die "Не удалось подтвердить принадлежность каталога Dashboard: $addon"
  fi
  if has_path "$dashboard_state" && [[ ! -f $marker || ! -d $dashboard_state || -L $dashboard_state ||
      ! -f $dashboard_state/.env || -L $dashboard_state/.env ]]; then
    die "Установка Dashboard прервана. Проверьте $addon и $dashboard_state."
  fi
  (umask 022; "$bundle/dashboard-742.sh" install --public-host "$public_host" --app-host-port "$app_port")
  phase=check
  save_state
fi
(umask 022; "$bundle/dashboard-742.sh" check) || die 'Проверка Dashboard завершилась ошибкой. После диагностики повторите запуск.'
studio_url="http://$public_host"
if [[ $studio_port != 80 ]]; then studio_url+=":$studio_port"; fi
printf 'Studio готова. Откройте %s/app/ с рабочего места.\n' "$studio_url"
