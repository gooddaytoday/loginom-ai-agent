# Восстановление локального стенда на Linux

Это рецепт **нового стенда на другом компьютере**. Он не останавливает и не заменяет
существующие контейнеры. Имена ниже и порт `127.0.0.1:32768` должны быть свободны:
они входят в текущий прототип Dashboard и Desktop. Используйте Linux x86_64,
Docker, Git LFS, unzip, curl и закреплённый Node из инструкции
[переноса](../HANDOFF.md). Node должен находиться в `PATH`: installer копирует
`command -v node` в Debian-контейнер сервера.

Проверенный ранее путь: master build 5579, библиотечные файлы integration,
обычный/debug веб-клиенты, исполнение ROI-пакета и публикация пульта. Он использовал
локально доступные базовые образы. Рецепт ниже заменяет эти непереносимые образы
официальными Dockerfile из того же дистрибутива и публичными Debian/Apache base
images. **Чистая сборка по этому рецепту здесь не выполнялась**; проверку на новой
машине начните с HTTP/WebSocket и исполнения fixture, затем переходите к Desktop.

## Внешние входы

Дистрибутив Loginom и integration содержат лицензированные файлы и не входят в
эту ветку. Получите их через обычный разрешённый доступ владельца:

1. Войдите в GitLab и скачайте artifact успешного job
   [build_staging 1367041](http://git.basegroup.ru/dev/deductor/-/jobs/1367041)
   проекта `dev/deductor`, pipeline 205579, commit
   `0dac4766535984c294eed4e42b653a38d397b972`, ветка master.
   Нужен ZIP целиком, содержащий `Dist/Server`, `Dist/Client`, `Dist/ClientDebug`.
   Размер — 217314589 байт, SHA256 —
   `8182dbeec7cb95739f1424bb08367b266b1ab87a8fbc3cd17a3f6ea41195597e`.
   Если job artifact уже истёк, потребуется получить именно эту сборку у владельца
   дистрибутива. Новая сборка master потребует отдельной проверки совместимости.
2. Клонируйте `testing/integration` обычным GitLab clone URL с настроенным SSH
   или credential helper. Для повторения входов текущего стенда используйте commit
   `c81703ad7a5e077e6ec2417a83192753edbe8400` и выполните `git lfs pull`.
   Нужен его каталог `ci/common/install-linux/configs`: `server/libs`,
   `server/ca.bg.local.pem.cer` и `client/config/httpd.conf`.
   Это не только сертификат и конфигурация: без LFS-библиотек сервер не запустится.

Не вставляйте токены в URL/командную строку и не копируйте свой рабочий
`UserStorage`, профили Desktop или настройки авторизации в build context.
`Dist/Server/config` содержит конфигурацию **тестового дистрибутива**, включая его
пользователей и лицензирование. Используйте её только в разрешённом локальном
стенде; собственную лицензию при необходимости подключите приватно.

## Подготовка build context

Все команды выполняются в одной оболочке. Начните из корня checkout этой ветки.
В двух строках с `/absolute/path/...` укажите скачанный ZIP и checkout integration.
Build context создаётся вне Git; исходные файлы integration не меняются.

```sh
repo=$(pwd -P)
inputs=$(mktemp -d)
archive=/absolute/path/to/downloaded/artifacts.zip
integration=/absolute/path/to/integration

printf '%s  %s\n' \
  8182dbeec7cb95739f1424bb08367b266b1ab87a8fbc3cd17a3f6ea41195597e \
  "$archive" | sha256sum --check
unzip -q "$archive" -d "$inputs/artifact"
dist="$inputs/artifact/Dist"
configs="$integration/ci/common/install-linux/configs"

cp -a "$configs/server/libs" "$dist/Server/"
cp "$configs/server/ca.bg.local.pem.cer" "$dist/Server/"
cp "$configs/client/config/httpd.conf" "$dist/Client/config/httpd.conf"
cp "$repo/dashboard/stand/loginom.site.conf" "$dist/Client/config/loginom.site.conf"
cp -a "$dist/ClientDebug/client" "$dist/Client/client-debug"
printf '\nCOPY client-debug /usr/local/apache2/htdocs/client-debug\n' \
  >> "$dist/Client/Dockerfile"
printf '{"wsproxy":"true"}\n' > "$dist/Client/server_proxy.json"
```

`libs` дополняют официальный `Dist/Server/Dockerfile`; не заменяйте их системными
библиотеками произвольных версий. Сам Dockerfile устанавливает остальные Debian
зависимости и запускает Loginom от UID/GID 7001. Небольшой wrapper из этой ветки
добавляет `procps`: `dashboard/install.sh` использует `ps` при запуске своего Node.
`httpd.conf` загружает `mod_headers`, `mod_proxy_http`, `mod_proxy_wstunnel` и
`conf/*.site.conf`; наш site config направляет оба WebSocket маршрута только в
этот server-контейнер, без Integrator и других стендов.

## Сборка и запуск новой пары

Не запускайте общий `integration/install.sh`: он предназначен для других
окружений и может затронуть их контейнеры. Здесь создаётся только новая пара.
Docker откажется повторно использовать занятое имя или порт; в таком случае
разберитесь с владельцем существующего ресурса, а не удаляйте его автоматически.

```sh
docker build -t dashboard-master-20261109-vendor:5579 "$dist/Server"
docker build -f "$repo/dashboard/stand/Dockerfile.server" \
  -t dashboard-master-20261109-server:5579 "$repo/dashboard/stand"
docker build -t dashboard-master-20261109-client:5579 "$dist/Client"

docker network create dashboard-master-20261109-net
docker run -d --name dashboard-master-20261109-server \
  --network dashboard-master-20261109-net \
  dashboard-master-20261109-server:5579
docker run -d --name dashboard-master-20261109-studio \
  --network dashboard-master-20261109-net \
  -p 127.0.0.1:32768:80 \
  dashboard-master-20261109-client:5579

docker exec dashboard-master-20261109-studio httpd -t
docker exec dashboard-master-20261109-server sh -c 'ldd /app/loginomd'
curl -fI http://127.0.0.1:32768/app/
curl -fI http://127.0.0.1:32768/app-debug/
```

Ожидания: Apache сообщает `Syntax OK`; `ldd` не содержит `not found`; обе страницы
отвечают HTTP 200. Дождитесь готовности сервера по его журналу; при ошибке
`docker logs dashboard-master-20261109-server` покажет причину. Порты server не
публикуются, host mounts отсутствуют, данные новой пары хранятся в контейнерах.

Откройте [обычный клиент](http://127.0.0.1:32768/app/?testable=true), войдите
пользователем тестового дистрибутива и проверьте в Network браузера успешный
WebSocket `/app/ws/` (HTTP 101). Для debug-клиента маршрут — `/app-debug/ws/`.
HTTP 200 страницы сам по себе не доказывает работоспособность Loginom.

## Подключение Dashboard из checkout

После успешного входа вернитесь в ту же оболочку:

```sh
cd "$repo"
./dashboard/install.sh
```

Installer установит bootstrap обоих клиентов, сервис снимков и fixture
`/user/dashboard-roi/campaign.lgp` вместе с `dataset.csv`. Обновите браузер,
откройте пакет, выполните узел «По убыванию ROI»: ожидается 500 кампаний.
Нажатие «Создать dashboard» выдаёт **новый** снимок. Старые ID с прежнего компьютера
не действуют; публикацию и привязку примера выполняйте по [инструкции переноса](../HANDOFF.md).

После перезапуска server-контейнера повторите `./dashboard/install.sh`: процесс
снимков запускается installer, отдельной системной службы в прототипе нет.
Это удаляет старые ID снимков, поэтому получите цель заново. После проверки
штатно выйдите из своей сессии Loginom и только затем закрывайте вкладку:
простое закрытие браузера может оставить пакет заблокированным.
