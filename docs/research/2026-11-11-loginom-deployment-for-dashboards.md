# Развёртывание Loginom на Linux для пользовательских dashboard

Проверено 2026-11-11 по первичным источникам: [руководство пользователя и администратора](https://help.loginom.ru/adminguide/index.html), заметки о релизах и страница архитектуры на [loginom.ru](https://loginom.ru/platform/architecture), публичный GitHub [Loginom Company](https://github.com/loginom). Сторонние обзоры не использовались. Адрес `https://loginom.ru/docs` на эту дату отвечает 404; актуальная документация живёт на `help.loginom.ru`. Историческая ветка 6.5 лежит отдельно, например [веб-сервисы 6.5](https://help.loginom.ru/6.5/userguide/integration/web-services/), и на выводы о 7.x не переносилась.

Локальные заметки репозитория прочитаны и ниже не выдаются за документацию вендора: `docs/research/2026-11-03-loginom-dashboard.md`, `docs/research/2026-11-09-dashboard-live-investigation.md`, `docs/research/loginom-dashboard-evidence/`, `dashboard/stand/`.

Сверено с исходниками контейнерного установщика, официальной поставкой Linux 7.4.2 enterprise и образами dev-стенда: разделы «Сверка с исходниками установщика», «Сверка с поставкой Linux 7.4.2» и «Образы dev-стенда» в конце. Где справка и код расходятся, верен код.

## Что важно для dashboard

Пользовательский React-dashboard некуда «встроить» штатным расширением. Loginom на Linux — это три компонента: Loginom Server, статический веб-клиент Studio за Apache и Loginom Integrator. Серверные редакции на Linux — Standard и Enterprise. Готового образа на Docker Hub нет: контейнеры собираются из закрытого архива дистрибутива.

Для трёх сценариев из этого следует одно и то же:

1. **Локальный Docker на той же машине, что и агент.** Официальная схема — образы `loginom-server`, `loginom-http` (Studio) и `loginom-integrator`, поднятые `docker-compose`/`podman-compose`. Данные и конфиги — тома рабочего каталога. Агент на хосте видит только опубликованный порт веб-клиента (80/443), если WebSocket-прокси включён. Снимок, статический хост и сборщик dashboard логично ставить отдельным контейнером в ту же сеть либо на loopback, отдельным сайтом. Общего с сессией Studio cookie/API для проверки «может ли пользователь X менять пакет Y» в документации нет.
2. **Удалённый Loginom службами на Linux.** Службы `loginomd` и `loginomi`, веб-клиент — Apache (`apache2` на Debian-подобном облачном образе). Файлы клиента — каталог Apache, пакеты — `UserStorage` в рабочем каталоге сервера, владелец `loginom`, права `660`. Sidecar на том же хосте может читать пакеты только если его пустят в эту группу или в том; в клиент его официально не подключают.
3. **Удалённый Loginom в контейнерах.** Та же тройка контейнеров. Обновление — пересборка образов скриптом дистрибутива при сохранённом рабочем каталоге. Sidecar — ещё один сервис compose/Podman с собственным портом и томом. SELinux на RHEL-семействе требует метку тома `:Z`.

Штатные «отчёты» Loginom — это визуализаторы внутри пакета для роли «Просмотр отчётов», а не место для произвольного JS. Единственные документированные программные выходы наружу — опубликованные REST/SOAP-операции Integrator и, с 7.4 Enterprise, MCP-инструменты по тем же опубликованным узлам. Это вызов сценария, а не хостинг страницы и не ACL.

## Что уже есть в репозитории и не является фактом вендора

Стенды исследования и `dashboard/stand` подтверждают форму, похожую на официальный контейнерный клиент: Apache, каталог клиента, маршрут `/app/`, прокси WebSocket на `server:8080/ws/`. Путь `/app-debug/`, UID `7001` и правило `ProxyPass` в `dashboard/stand/loginom.site.conf` взяты из этих стендов и integration, а не из `help.loginom.ru`. Сборки стендов — внутренний master `7.5.0-alpha`; публично такая версия в блоге Loginom на дату проверки не объявлена.

## a. Архитектура, редакции, версии

Платформа работает как сервер для совместной работы или как настольное приложение. Сервер на Windows — редакции Team, Standard и Enterprise. На Linux сервер — только Standard и Enterprise. Community и Personal — настольный Loginom Desktop, один компонент, без совместной работы и публикации веб-сервисов; архивы есть и для Linux. [Руководство администратора](https://help.loginom.ru/adminguide/index.html), [компоненты](https://help.loginom.ru/userguide/components-platform.html), [сравнение редакций](https://help.loginom.ru/userguide/compare-editions.html), [установка Desktop на Linux](https://help.loginom.ru/adminguide/desktop/linux/setup.html).

| Компонент | Роль на Linux |
| --- | --- |
| Loginom Server | Расчёты, пакеты, права, сессии. Служба. |
| Loginom Studio | Веб-клиент в браузере. Статика, которую отдаёт веб-сервер. С сервером говорит по WebSocket. |
| Веб-сервер | В дистрибутиве Linux это Apache. Отдаёт клиент и может проксировать WebSocket. |
| Loginom Integrator | Публикация сценариев как веб-сервисов. На Linux — служба, не IIS. |
| BatchLauncher | Утилита командной строки, не служба. Запуск пакета по расписанию ОС или из другого процесса. |

Базовая серверная поставка включает Server и не меньше пяти конкурентных лицензий ролей «Проектирование сценариев» или «Просмотр отчётов». Запуск по расписанию и вызов веб-сервиса Integrator отдельную пользовательскую лицензию не тратит. [Компоненты](https://help.loginom.ru/userguide/components-platform.html).

Редакции различаются сценарием внедрения, а не набором алгоритмов и визуализаторов. Community — обучение, коммерческое использование не допускается, Linux и Windows. Personal — личная аналитика без коллективной работы, SOAP, автоматического запуска. Team — до 5 человек, до 6 ядер и 12 ГБ, только Windows; свой REST публикуется отдельным Integrator, SOAP нет. Standard — 5–10 пользователей, до 12 ядер и 24 ГБ, пакетный режим, публикация веб-сервисов, кластер, Linux и Windows. Enterprise — без лимита ядер и памяти, отказоустойчивый кластер (в базе две лицензии Server с Integrator), LDAP и OpenID, Linux и Windows. Cloud — виртуальная машина заказчика, Server и Integrator в поставке. [Сравнение редакций](https://help.loginom.ru/userguide/compare-editions.html). Образ Cloud в Яндекс.Облаке проверяет службы `loginomd` и `apache2` и открывает `http://<адрес>/app/`. [Loginom в Яндекс.Облако](https://help.loginom.ru/adminguide/yandex-cloud/index.html).

Страница архитектуры делит роли так: Server обрабатывает данные, веб-сервер отдаёт статику, Integrator публикует сервисы. В Linux-дистрибутив входят скрипты сборки своих образов, в том числе с Python, ODBC и файлами данных. Для эластичности вендор указывает Kubernetes. Балансировка Integrator между серверами описана как циклическая с учётом загрузки; для более сложной схемы рекомендован NGINX. Мониторинг на странице назван связкой Elastic, Prometheus и Grafana — это рекомендация стека, не встроенный агент. [Архитектура](https://loginom.ru/platform/architecture).

Требования Server на Linux: ядро 5.3+ (от 4.11, если не нужен Python), x64 с SSE4.2 и POPCNT, glibc 2.17+, libstdc++6 6.1+, libicu 61+, библиотека `systemd.so.0` для journald. Минимум 4 ядра, 8 ГБ, 200 ГБ. [Loginom Server на Linux](https://help.loginom.ru/adminguide/linux/server/index.html). Integrator: Debian 11+, Fedora 37+, Ubuntu 20.04+, Astra Linux 1.7, RedOS 7; glibc 2.23+ или musl 1.2.2+; платформа .NET 8.0 должна поддерживаться ОС. [Integrator на Linux](https://help.loginom.ru/adminguide/linux/integrator/index.html).

Публичные заметки о версиях, найденные в блоге на 11 ноября 2026:

| Версия | Дата | Что относится к Linux и к этой задаче |
| --- | --- | --- |
| [7.2](https://loginom.ru/blog/release-72) | 20 мая 2024 | Планировщик, OpenID по access token (Enterprise), в базовые образы добавлен Ubuntu 24.04 LTS. |
| [7.2.7](https://loginom.ru/blog/release-727) | 19 июня 2025 | Починка JavaScript на Linux (`libChakraCore.so`, glibc 2.41). |
| [7.3](https://loginom.ru/blog/release-73) | 20 ноября 2025 | Аутентификация Peer по Unix-сокету. На Linux admin обязан сменить пароль при первом входе. При обновлении службы сохраняется пользовательский `server.json`. Базовый образ по умолчанию — Debian 13, добавлен Astra Linux 1.8, базовые образы можно брать не только с `docker.io`. ODBC к MS SQL (`MSODBCSQL` или `FreeTDS`). Расширения SQLite кладут в `sqlite` рядом с бинарником; для Linux указан путь `/var/opt/loginom/server`. |
| [7.3.1](https://loginom.ru/blog/release-731) | 18 декабря 2025 | Починка поиска ODBC-драйверов и экспорта в MS SQL на Linux. |
| [7.3.2](https://loginom.ru/blog/release-732) | 26 марта 2026 | Исправления, без отдельной темы развёртывания в просмотренном тексте. |
| [7.4](https://loginom.ru/blog/release-74) | 14 мая 2026 | MCP-сервер в Integrator (Enterprise). Восстановление сессии Studio. LDAP SASL GSSAPI/Kerberos для служебной учётной записи. ADFS как провайдер OpenID. `client.json`: `disablenewsfetch`. |
| [7.4.1](https://loginom.ru/blog/release-741) | 22 июня 2026 | Устойчивость Studio, Mbed TLS 3.6.6. |
| [7.4.2](https://loginom.ru/blog/release-742) | 3 сентября 2026 | Исправления, 64-битные целые в редакторах. |

Более поздний публичный релиз поиском по блогу (`7.4.3`, `7.4.4`, `7.5`) не найден. Справка `help.loginom.ru` не закреплена номером версии в URL: это текущая редакция руководства, а не снимок 7.4.2.

## b. Установка службами на Linux

Дистрибутив — архив `loginom.tar.gz` / `Loginom-*.tar.gz` с каталогами `server`, `http`, `integrator`. Установка: `sudo ./install_server.sh`, `sudo ./install_http.sh`, `sudo ./install_integrator.sh`. Перед стартом в `/var/opt/loginom/server/gnclient.ini` в `IP_NAME=` пишется адрес машины, где активирована лицензия. Старт: `sudo systemctl start loginomd` и `sudo systemctl start loginomi`. Нужны ядро 5.3+, сеть или заранее поставленные пакеты, лицензионный ключ для `loginomd`. [Установка службой](https://help.loginom.ru/adminguide/linux/server/loginom-linux.html).

Пакеты без интернета. RHEL/РЕД ОС: для http — `httpd`, `mod_ssl`, `mod_http2`; для server — `pcre2`, `zlib`, `libicu`, `libtommath`, `libtomcrypt`, `mariadb-connector-c`, `libsqlite3x`, `unixODBC`, `librdkafka` (Enterprise); для integrator — `aspnetcore-runtime-8.0`. Debian/Astra: http — `apache2`; server — `libpcre2-8-0`, `zlib1g`, один из `libicu60`–`libicu79`, `libtommath1`, `libtomcrypt1`, `libmariadb3`, `libsqlite3-0`, `unixodbc`, `librdkafka1` (Enterprise); integrator — `aspnetcore-runtime-8.0`. Зависимости этих пакетов в списке не расписаны. [Там же](https://help.loginom.ru/adminguide/linux/server/loginom-linux.html). Диапазон ICU на странице установки (60–79) и требование «libicu 61+» на странице Server расходятся; какое из них действует для конкретной сборки, страница не сводит.

| Что | Путь и владелец |
| --- | --- |
| Бинарники Server | `/opt/loginom/server`, root, файлы `664`, исполняемые `775` |
| Рабочий каталог Server | `/var/opt/loginom/server`, пользователь `loginom`, `660` |
| Бинарники Integrator | `/opt/loginom/integrator`, root |
| Рабочий каталог Integrator | `/var/opt/loginom/integrator`, пользователь `loginom`, `660` |
| Веб-сервер | `apache2`; конфиги `/etc/apache2`; файлы клиента `/var/www/html/client` по справке, а по скрипту из поставки 7.4.2 — `/var/www/loginom` (см. «Сверка с поставкой Linux 7.4.2») |
| BatchLauncher в архиве | `server/redist/BatchLauncher`, копируется туда, откуда его запускают |

Служба Server: имя `loginom-server`, алиас `loginomd`, пользователь `loginom`, `OOMScoreAdjust=-200`, `TimeoutStopSec=11`, `Restart=on-failure`, `RestartSec=30`. Integrator: `loginom-integrator` / `loginomi`, `OOMScoreAdjust=-100`, `TimeoutStopSec=6`, тот же рестарт. [Установка службой](https://help.loginom.ru/adminguide/linux/server/loginom-linux.html). Имя unit веб-сервера в этой статье не названо. На образе Яндекс.Облака его проверяют как `apache2`. [Яндекс.Облако](https://help.loginom.ru/adminguide/yandex-cloud/index.html). Для RHEL в списке пакетов указан `httpd`; имя unit в прочитанных страницах не найдено. Закрыто поставкой 7.4.2: `httpd` на RHEL, `apache2` на Debian, `httpd2` на Alt (`install_http.sh`).

Обновление службы: копия `/var/opt/loginom/` → `/var/opt/loginom-backup`, останов `loginomd` и `loginomi`, `sudo bash install_loginom.sh`, старт тех же алиасов. [Обновление службы](https://help.loginom.ru/adminguide/linux/server/update-native.html). С 7.3 пользовательский `server.json` при таком обновлении сохраняется. [7.3](https://loginom.ru/blog/release-73).

Конфиги Server лежат в рабочем каталоге. Для native это `/var/opt/loginom/server`, для Podman — `${HOME}/loginom/server`, для Docker — `/var/opt/loginom-docker/server`. Файл `Settings.cfg`:

- `Settings/Directories/@UserStorage` — каталог пользователей, абсолютный или относительно рабочего каталога;
- `SessionBackup` — резерв сессий;
- `Bind` — по умолчанию `0.0.0.0`;
- `Port` — Integrator и BatchLauncher, по умолчанию `4580`;
- `UnixSocket` — файл сокета между компонентами;
- `WSPort` — WebSocket Studio, по умолчанию `8080`;
- `WSSPort`, `SSLCertificateFile`, `SSLPrivateKeyFile` — WSS, сертификат и ключ PEM.

Журнал — `Log.cfg`. По умолчанию `LoggerType=ltJournald` (тогда файловые атрибуты игнорируются), `MinLogLevel=llInfo`. Файловый режим: `app.log`, 10 МБ, 10 файлов. [Конфигурация Server на Linux](https://help.loginom.ru/adminguide/linux/server/config.html). В интерфейсе сокет по умолчанию на Linux — `/run/loginom/loginomd.socket`, права сокета `770` (на запись). Параметр есть только на Linux. [Параметры подключения](https://help.loginom.ru/userguide/admin/parameters/connection-parameters.html).

`UserStorage` по умолчанию — относительное имя каталога внутри workdir. Личная папка называется логином. Путь внутри хранилища выглядит как `/<логин>/test.lgp`. Пример абсолютного пути в справке дан для Windows (`C:\ProgramData\Loginom\Server\UserStorage`); для Linux тот же смысл у атрибута `UserStorage` рабочего каталога. [Папки](https://help.loginom.ru/userguide/admin/parameters/folders.html), [Settings.cfg](https://help.loginom.ru/adminguide/linux/server/config.html).

### Веб-клиент, URL, `server.json` и `client.json`

Studio ходит на Server по WebSocket: напрямую или через прокси на веб-сервере. Прокси нужен, чтобы снаружи открыть только 80/443. По умолчанию прокси выключен. [Веб-клиент](https://help.loginom.ru/adminguide/studio/index.html).

Без прокси браузер грузит `http://<веб-хост>:80/app` или `https://<веб-хост>:443/app`, а сокет открывает на `ws://<сервер>:8080/ws` или `wss://<сервер>:8443/ws`. Если страница открыта по HTTPS, незашифрованный WebSocket запрещён. С прокси сокет идёт на тот же хост и порт, путь по умолчанию `/ws`: `ws://<веб-хост>:80/ws` или `wss://<веб-хост>:443/ws`, а Apache уже подключается к Server. [Веб-клиент](https://help.loginom.ru/adminguide/studio/index.html). Проверка публикации REST в обход веб-сервера Studio на Linux: `http://localhost:5000/rest/help`. [Публикация веб-сервиса](https://help.loginom.ru/userguide/integration/web-services/publishing-web-service.html).

Браузеры: Chrome ≥ 84, Firefox ≥ 79, Opera ≥ 70, Safari ≥ 14.1, Edge ≥ 84, Яндекс ≥ 20.10, прочий Chromium ≥ 84. [Веб-клиент](https://help.loginom.ru/adminguide/studio/index.html).

`server.json` и `client.json`:

- Windows — `%ProgramFiles%\Loginom\Client\`;
- Linux-служба — `/var/www/loginom/`;
- контейнеры — `/var/opt/loginom-docker/http/`.

[Конфигурация Studio](https://help.loginom.ru/adminguide/studio/config.html). Это расходится со статьёй установки, где файлы клиента лежат в `/var/www/html/client`. В примере SELinux файл монтируется внутрь контейнера как `/usr/local/apache2/htdocs/client/server.json`. [Fedora 43](https://help.loginom.ru/adminguide/linux/server/docker-Fedora_43.html). Какой из каталогов на native-установке содержит `index.html`, руководство одной фразой не фиксирует. Скрипт `install_http.sh` из поставки 7.4.2 отвечает: `/var/www/loginom`. Путь `/app-debug/` в прочитанной справке не найден.

Параметры `server.json`: `host` (null — хост веб-сервера), `wsport` (null → 8080), `wssport` (null → 8443), `wsproxy`, `path` (по умолчанию `ws/`), `secure`, `openid` (`auto` / не задан, `none`/`false`, `force`). Для Team и Standard `openid` может быть только `none`; у Enterprise по умолчанию параметр не задан. `force` сразу уводит на внешнего провайдера; локальный вход тогда только логином и паролем в URL. [Конфигурация Studio](https://help.loginom.ru/adminguide/studio/config.html).

Параметры `client.json`, и только они в этой статье:

- `rememberuser: false` — скрыть «Запомнить» на странице входа; все серверные редакции;
- `disablenewsfetch: true` — не запрашивать новости и номер актуальной версии с loginom.ru; только Enterprise.

По умолчанию оба не заданы. Отдельного параметра встраивания клиента в чужое приложение в `client.json` эта статья не описывает. [Конфигурация Studio](https://help.loginom.ru/adminguide/studio/config.html), [7.4](https://loginom.ru/blog/release-74).

Полный текст virtual host с `ProxyPass` для Linux в прочитанных страницах не опубликован. Имя файла `studio.site.conf` встречается в примере Basic Auth для Firefox. [Аутентификация](https://help.loginom.ru/userguide/quick-start/authentication.html). Готовый фрагмент обратного прокси WebSocket в справке есть для IIS (`web.config`, URL Rewrite на `127.0.0.1:8080`), не для Apache на Linux. [IIS](https://help.loginom.ru/adminguide/windows/server/iis.html). Порты и PEM-сертификаты HTTP/HTTPS задаются установщиком на Windows (`WEBSRV_PORT` 80, `WEBSRV_PORT_SSL` 443, `WEBSRV_USE_SSL`, `WEBSRV_USE_WS_PROXY`, URI приложения по умолчанию `app/`, URI прокси `ws/`). [Установка на Windows](https://help.loginom.ru/adminguide/windows/server/setup.html). Для контейнеров те же флаги названы переменными `USE_SSL` и `USE_WS_PROXY` в обзоре Kubernetes. [Loginom в Kubernetes](https://loginom.ru/blog/loginom-kubernetes).

TLS для сокета Server: `SSLCertificateFile` и `SSLPrivateKeyFile` в PEM, порты 8080 и 8443. [Конфигурация Server](https://help.loginom.ru/adminguide/linux/server/config.html). Если Studio смотрят из интернета, справка рекомендует HTTPS. [Аутентификация](https://help.loginom.ru/userguide/quick-start/authentication.html).

## c. Контейнеры

Отдельного публичного образа Loginom на Docker Hub в документации нет. Архив содержит бинарники, библиотеки, конфиги, BatchLauncher и `setup.sh`, который собирает образы и `docker-compose`. Рекомендуемый движок — Podman; если рядом есть и Docker, выбор предлагают, по умолчанию Podman. Минимум: Podman ≥ 3.4.0 и podman-compose ≥ 1.0.3, либо Docker ≥ 20.10.1 и Docker Compose ≥ 1.21.0. [Установка Podman/Docker](https://help.loginom.ru/adminguide/linux/server/install-docker-podman.html).

| | Podman | Docker |
| --- | --- | --- |
| Кто запускает | текущий пользователь | root |
| Рабочий каталог | `$HOME/loginom` | `/var/opt/loginom-docker` |
| Автозапуск | crontab пользователя (`@reboot podman-compose -f … start`) | `restart: unless-stopped` в compose (по исходникам установщика) |
| Команда | `./setup.sh`, затем `podman-compose -f $HOME/loginom/docker-compose.yml up -d` | `sudo ./setup.sh`, затем `sudo docker-compose up -d` из `/var/opt/loginom-docker` |

Каталоги данных Podman: `$HOME/loginom/server`, `integrator`, `http`. У Docker всё дерево — `/var/opt/loginom-docker/`. Лицензия: в `gnclient.ini` (`$HOME/loginom/server/gnclient.ini` в тексте для Podman) заполняется `IP_NAME=`. [Установка Podman/Docker](https://help.loginom.ru/adminguide/linux/server/install-docker-podman.html).

Порты, которые просят открыть в firewall для схемы по умолчанию: 80, 443, 8080 (WebSocket), 8443 (WSS), 4580 (BatchLauncher или внешний Integrator). [Там же](https://help.loginom.ru/adminguide/linux/server/install-docker-podman.html).

Предустановка расписана по дистрибутивам. Docker — [Astra Linux 1.7](https://help.loginom.ru/adminguide/linux/server/docker-AstraLinux.html). Podman — [Debian 11.5 и Ubuntu 22.04](https://help.loginom.ru/adminguide/linux/server/docker-Debian-Ubuntu.html), [Fedora 43](https://help.loginom.ru/adminguide/linux/server/docker-Fedora_43.html), OpenSUSE 15.4, РЕД ОС 7.3.2. Для непривилегированного Podman: `net.ipv4.ip_unprivileged_port_start=80` и `loginctl enable-linger`. На SELinux (Fedora, РЕД ОС) в `docker-compose.yml` к томам, кроме сокета journald, добавляют `:Z`, пример — монтирование `server.json` в `/usr/local/apache2/htdocs/client/server.json`. Либо SELinux отключают. [Fedora 43](https://help.loginom.ru/adminguide/linux/server/docker-Fedora_43.html).

Базовый образ выбирается при сборке. Протестированы и предлагаются: `debian:trixie-slim` (по умолчанию), `debian:bookworm-slim`, `debian:bullseye-slim`, `ubuntu:22.04`, `ubuntu:24.04`, `ubuntu:26.04`, Astra Linux 1.8. Можно указать другой вручную. В образ можно дописать свои библиотеки, ODBC и Python. Имена образов по исходникам установщика — `loginom-http`, `loginom-server`, `loginom-integrator` с тегом версии и `latest`; дата есть только в именах сохранённых tar-архивов. Готовые tar сохраняют в `/var/opt/loginom-docker/images/` и переносят на машину без интернета; на цели `setup.sh` умеет взять «предварительно подготовленные образы». Один образ пересобирается из каталога дистрибутива, например `podman build http -t loginom-http`. [Установка Podman/Docker](https://help.loginom.ru/adminguide/linux/server/install-docker-podman.html). Фрагмент Dockerfile Server в статье обновления начинается с `FROM docker.io/debian:trixie-slim`, копирует `server/` и `libs/` в `/app/`, ставит библиотеки Debian и помечает образ `org.opencontainers.image.vendor=Loginom Company`. [Обновление контейнеров](https://help.loginom.ru/adminguide/linux/server/update-docker.html).

Обновление Docker: копия `/var/opt/loginom-docker`, `sudo docker compose -f /var/opt/loginom-docker/docker-compose.yml down`, `sudo bash setup.sh --update`, затем `up -d`. Для Podman шаги те же с поправками статьи установки. [Обновление контейнеров](https://help.loginom.ru/adminguide/linux/server/update-docker.html).

Обзор Kubernetes на сайте вендора прямо говорит, что `docker pull` готового образа недостаточно: образы собирают по инструкции и кладут в свой registry (`server`, `studio`, `integrator`). В примере dev-пода три контейнера делят `emptyDir` на `/run/loginom` (сокет) и PVC рабочего каталога Server, смонтированный в `/workdir`. Integrator слушает 5000, Studio — 80, при `USE_WS_PROXY=1`. Пробы Server — TCP 4580. Рядом описан контейнер сервера лицензий Guardant (порты 3185/3186/3187). Это статья-пример, не манифест из руководства администратора; путь `/workdir` внутри контейнера в `Settings.cfg` не закреплён. [Loginom в Kubernetes](https://loginom.ru/blog/loginom-kubernetes).

Полный текст официального `docker-compose.yml` (имена сервисов, список переменных, UID процесса) в прочитанных HTML-страницах не приведён. Зафиксированы пути томов на хосте, имена образов, порты и флаги `USE_SSL` / `USE_WS_PROXY` из статьи Kubernetes. Сам файл собирается из фрагментов в исходниках установщика — см. «Сверка с исходниками установщика» в конце заметки.

## d. Пользователи, аутентификация, права

Вход в серверные редакции: логин и пароль на странице, логин и пароль в URL (`http://login:password@host/app/`), LDAP (Enterprise), OpenID (Enterprise). Учётная запись после установки Windows-инсталлятора: `user` с пустым паролем (роли проектирования и просмотра, публикация пакетов), `admin` / `admin`, `service` / `service` для Integrator и BatchLauncher. Пароль администратора нужно сменить. [Аутентификация](https://help.loginom.ru/userguide/quick-start/authentication.html), [установка Windows](https://help.loginom.ru/adminguide/windows/server/setup.html). На Linux с 7.3 у admin сразу включено требование смены пароля при первом входе в веб-интерфейс. [7.3](https://loginom.ru/blog/release-73). В Cloud-образе учётки `user` и `service` по умолчанию выключены, пароль admin меняют скриптом `/var/opt/loginom/passwdchange.sh`. [Яндекс.Облако](https://help.loginom.ru/adminguide/yandex-cloud/index.html).

Способы аутентификации учётной записи: локальная, LDAP, OpenID, Peer. Переключатель LDAP/OpenID/Peer в интерфейсе отсутствует у Team и Standard (они и не ставятся на Linux как сервер). Peer — только Linux и только Unix-сокет: имя пользователя ОС, без пароля, для учётки, от которой Integrator или BatchLauncher ходят на Server. Для браузера он не предназначен. Поле «системный пользователь» — uid или имя ОС. Последнему локальному администратору нельзя сменить способ входа. [Пользователи](https://help.loginom.ru/userguide/admin/users/index.html), [7.3](https://loginom.ru/blog/release-73).

LDAP (Enterprise): Active Directory или OpenLDAP. Логин на странице Loginom, не DN и не `domain\user`. Служебная учётка читает каталог (простая, SASL DIGEST-MD5 или SASL GSSAPI). GSSAPI — это Kerberos для службы `loginomd`, запущенной из-под доменной учётки, к LDAP, а не вход сотрудника в Studio билетом Kerberos. Новому пользователю задаётся роль; при роли «Проектирование сценариев» выдаётся право публикации. [LDAP](https://help.loginom.ru/userguide/admin/ldap.html), [параметры LDAP](https://help.loginom.ru/userguide/admin/parameters/ldap-parameters.html), [7.4](https://loginom.ru/blog/release-74).

OpenID (Enterprise): кнопка на странице входа, редирект на IdP, роли и доступ к общим папкам берутся из access token. Клеймы задают логин, полное имя, список ролей, список общих папок (остальные общие папки при этом снимаются), переменные сессии. Можно обновлять роль и имя при каждом входе. Провайдером может быть ADFS; тогда имя читают из токена. Архитектурная страница называет это OpenID Connect + OAuth 2.0 и упоминает Keycloak. [OpenID](https://help.loginom.ru/userguide/admin/parameters/openid-parameters.html), [аутентификация](https://help.loginom.ru/userguide/quick-start/authentication.html), [архитектура](https://loginom.ru/platform/architecture).

Роли матрицы: ADMIN (администрирование), USER (проектирование), VIEWER (просмотр отчётов), SERVICE (пакетное выполнение). USER создаёт и сохраняет пакеты, настраивает сценарий и визуализаторы, открывает отчёты. VIEWER открывает пакеты и отчёты, сценарий не редактирует. SERVICE в интерактивное меню не входит; личная папка ему доступна, общие папки и полный доступ к хранилищу — только если это включено у учётки. Публикация пакетов — флаг поверх роли проектирования. [Матрица доступа](https://help.loginom.ru/userguide/admin/users/access-matrix.html), [пользователи](https://help.loginom.ru/userguide/admin/users/index.html).

Файловые права — не ACL на каждый пакет. Личная папка есть у учётки. Общая папка — имя и таблица пользователей с одним флажком «может пользоваться». «Полный доступ к файловому хранилищу» открывает всё хранилище, иначе только личное и разрешённые общие. [Общие папки](https://help.loginom.ru/userguide/admin/shared-folder.html), [пользователи](https://help.loginom.ru/userguide/admin/users/index.html). Модификатор доступа узла (закрытый, защищённый, внутренний, открытый, опубликованный) задаёт видимость между модулями и пакетами и признак веб-сервиса, а не право пользователя. [Модификатор доступа](https://help.loginom.ru/userguide/workflow/access-modifier.html).

Внешний сервис, который спрашивает «может ли пользователь X изменить пакет Y» или читает метаданные произвольного пакета, в прочитанной справке не описан. Администрирование — страницы Studio (пользователи, папки, параметры, диспетчер), доступные роли администратора. [Администрирование](https://help.loginom.ru/userguide/admin/index.html). Близкие публичные описания — help опубликованного сервиса (`/rest/<пакет>/help`, WSDL) и список опубликованных пакетов, который Integrator сам забирает у Server. Это не права интерактивного пользователя и не содержимое `.lgp`.

Integrator подключается к Server учётки с правом входа как служба: атрибуты `userName`/`password`, по умолчанию `service` и пустой пароль, если атрибут не задан. Пример конфига показывает `service`/`service`. Вызов веб-сервиса снаружи идёт на Integrator по HTTP(S); в прочитанных страницах отдельная аутентификация вызывающего абонента REST/SOAP не задана. Ограничение попыток пароля для роли «Пакетное выполнение» блокирует и Integrator, и BatchLauncher. [Конфигурация Integrator на Linux](https://help.loginom.ru/adminguide/linux/integrator/config.html), [параметры безопасности](https://help.loginom.ru/userguide/admin/parameters/security-parameters.html).

BatchLauncher на Linux берётся из `server/redist/BatchLauncher`. Обязателен `/Package` — путь внутри хранилища. Удалённо: `/address`, `/Port` (4580), `/userName`, `/Password`. Процесс синхронный: закрытие BatchLauncher отменяет процесс на Server. Нужны роль пакетного выполнения и доступ к хранилищу. [BatchLauncher](https://help.loginom.ru/userguide/scheduler/batchlauncher.html), [пакетный режим](https://help.loginom.ru/adminguide/packetmode/packetmode.html).

## e. API и расширяемость

Публикация. Узел с модификатором «Опубликованный», уникальным именем и открытыми родительскими подмоделями становится методом. Пакет публикуют со страницы «Веб-сервисы». SOAP WSDL: `http://<хост>/<приложение>/soap?wsdl`, приложение по умолчанию `lgi`, пример `http://localhost/lgi/soap?wsdl`. Справка REST: `http://localhost/lgi/rest/help`. Операция: `http://<хост>/lgi/rest/<пакет>/<узел>`. Прямой Integrator на Linux: порт 5000. Есть OpenAPI и необязательный Swagger UI (`openapi/index.html`). Префикс путей — атрибут `urlPathPrefix` (для адресов как в Loginom 6 ставят `Service.svc`). [Публикация](https://help.loginom.ru/userguide/integration/web-services/publishing-web-service.html), [конфигурация Integrator](https://help.loginom.ru/adminguide/linux/integrator/config.html).

Integrator может держать несколько Server, выбирать основной или резервный, обновлять список опубликованных пакетов по `packageRefreshPeriod`, ограничивать параллелизм (`maxConcurrentRequests`, `requestQueueLimit`). К Server он идёт через Unix-сокет `/run/loginom/loginomd.socket` и при неудаче по TCP `localhost:4580`. Сокет в контейнерах избавляет от сети между контейнерами. На запись сокета и чтение каталога нужна общая группа Server и Integrator. [Integrator на Linux](https://help.loginom.ru/adminguide/linux/integrator/index.html).

С 7.4 Enterprise те же опубликованные узлы можно отдать как MCP tools по Streamable HTTP: `http://<хост>/<приложение>/mcp/` для всех пакетов и `.../mcp/<пакет>/` для одного. Режим stateless, уведомления `tools/list_changed` не шлются. Включение — флаг «Публиковать MCP-сервер» при публикации пакета. Аутентификация клиента MCP в заметке релиза не описана. [7.4](https://loginom.ru/blog/release-74).

Исходящие REST/SOAP-вызовы из сценария умеют «не требуется», Negotiate/NTLM/Basic/Digest, OAuth 2.0 token, клиентский сертификат. Это аутентификация Loginom как клиента чужого сервиса. [Тип аутентификации](https://help.loginom.ru/userguide/integration/connections/list/auth-type.html).

JavaScript и Python — узлы сценария, не плагины веб-клиента. Узел JavaScript строит таблицу кодом, может импортировать внешние модули; на Linux нет `Atomics`, ожидание через `setTimeout`. Предпросмотр показывает до 100 строк. [JavaScript](https://help.loginom.ru/userguide/processors/programming/java-script/index.html), [предпросмотр](https://help.loginom.ru/userguide/visualization/preview/preview.html).

Визуализаторы узла: диаграмма, качество данных, куб, статистика, таблица, дубликаты, конечные классы, профили кластеров, отчёты регрессии, качество бинарной классификации, плюс быстрый просмотр и предпросмотр. Своего типа визуализатора справочник не предлагает. Визуализатор добавляют в отчёты пакета. Панель «Отчёты» — место конечного пользователя: открытие отчёта само активирует сценарий. Срез пользователь настроить может, сохранить эту настройку нельзя. Роль VIEWER отчёты открывает, группы отчётов создаёт USER. [Визуализаторы](https://help.loginom.ru/userguide/visualization/index.html), [отчёты](https://help.loginom.ru/userguide/report/index.html), [матрица](https://help.loginom.ru/userguide/admin/users/access-matrix.html).

Библиотеки компонентов — пакеты `.lgp` в подкаталоге `libs` личного или общего каталога Server (или любой папки на диске для Desktop). Так устроены официальные наборы на GitHub (`loginom-silver-kit` и другие), проверенные автором на 7.3.1. Это компоненты сценария, не веб-плагины. Исходников Server/Studio в организации [loginom](https://github.com/loginom) нет. [Silver Kit](https://github.com/loginom/loginom-silver-kit).

Способ добавить свой JavaScript в `index.html`, свой визуализатор или режим встраивания Studio в чужой сайт в прочитанной справке не найден. Единственное задокументированное «встраивание» наружу — публикация веб-сервиса и, на архитектурной странице, выгрузка в Tableau. [Архитектура](https://loginom.ru/platform/architecture).

Сессия Studio — WebSocket. Период проверки соединения и «время жизни сессии после разрыва» (по умолчанию 1800 с, максимум 12 ч, 0 — не хранить) относятся к интерактивным сессиям. Если обрыв не обнаружен, сессия и блокировка пакета могут жить дольше. [Параметры подключения](https://help.loginom.ru/userguide/admin/parameters/connection-parameters.html). С 7.4 клиент предлагает восстановить сессию; если сервер остановили или сессию закрыли в диспетчере, восстановить её нельзя. [7.4](https://loginom.ru/blog/release-74).

## f. Что документация говорит про защиту

Отдельной статьи «hardening» нет. По страницам установки, сессий и параметров собирается следующее.

- Снаружи достаточно 80/443, если включён WebSocket-прокси. 8080/8443 тогда открывают только для хоста веб-сервера. 4580 — только для Integrator и BatchLauncher. Ключи Guardant — TCP/UDP 3186 и 3187. [Установка Windows, раздел файрвола](https://help.loginom.ru/adminguide/windows/server/setup.html), [контейнерный firewall](https://help.loginom.ru/adminguide/linux/server/install-docker-podman.html).
- Доступ из интернета — по HTTPS. Сертификаты HTTP и WebSocket — PEM. При HTTPS страницы незашифрованный WebSocket запрещён, если не включён `secure` и прокси. [Аутентификация](https://help.loginom.ru/userguide/quick-start/authentication.html), [server.json](https://help.loginom.ru/adminguide/studio/config.html).
- Логин и пароль в URL поддерживаются, в том числе вместе с LDAP, и не работают в Safari и Яндекс.Браузере. Для Firefox ≤ 128 описан обход: alias `/app-basicauth/` и Basic Auth в `studio.site.conf`, чтобы браузер не предупреждал о credentials в URL. [Аутентификация](https://help.loginom.ru/userguide/quick-start/authentication.html).
- Таймаут блокировки сессии и таймаут закрытия (от 60 с), запрет мультисессии, лимит попыток пароля (история сбрасывается рестартом Server), парольная политика. «Переподключаться только с текущего IP» и «требовать аутентификацию при переподключении» по умолчанию выключены. [Параметры безопасности](https://help.loginom.ru/userguide/admin/parameters/security-parameters.html), [7.4](https://loginom.ru/blog/release-74).
- Списки разрешённых URL для картинок и для ссылок. По умолчанию загрузка картинок и формирование ссылок запрещены; совпадение по началу строки; протоколы ссылок — только HTTP и HTTPS. Настройка применяется со следующего входа. [Параметры безопасности](https://help.loginom.ru/userguide/admin/parameters/security-parameters.html). Точный фрагмент Apache, на который ссылается абзац про картинки, в этой выгрузке страницы не зафиксирован.
- `disablenewsfetch` отключает обращение Studio к loginom.ru. Пароли LDAP и ключ клиента OpenID при записи конфига шифруются. [7.4](https://loginom.ru/blog/release-74).
- Для IIS в `web.config` задают `Cache-Control: no-cache,must-revalidate` и MIME для json/woff. [IIS](https://help.loginom.ru/adminguide/windows/server/iis.html). Аналогичных заголовков для Apache на Linux в прочитанных страницах нет.
- Пример Kestrel в конфиге Integrator содержит `"AddServerHeader": true`. [Конфигурация Integrator](https://help.loginom.ru/adminguide/linux/integrator/config.html).
- Журнал сессии может включать IP, имя пользователя и HTTP-заголовки браузера, среди них `Origin` и заголовки WebSocket. [Формат логов](https://help.loginom.ru/userguide/admin/parameters/logging-parameters/log-format.html).

Заголовки `Content-Security-Policy`, `X-Frame-Options` и политика cookie для встраивания чужой страницы в клиент в прочитанной справке не найдены.

## g. Sidecar рядом с Loginom

Официального места для второго веб-приложения нет. Рядом с тремя компонентами можно поставить свой процесс, опираясь на уже описанные границы.

**Сеть.** На native Apache слушает 80/443, Server — 8080/8443 и 4580, Integrator — 5000 напрямую и/или путь `/lgi/` через веб-сервер. Контейнерный firewall открывает те же порты наружу только если так выбрали. Свой хост dashboard должен занять другой порт или другой virtual host. Как добавить `Alias` в поставленный `studio.site.conf`, справка не пишет; файл назван только в примере Basic Auth.

**Файлы.** Пакеты лежат в `UserStorage` рабочего каталога. На native это дерево `/var/opt/loginom/server` с правами `660` и владельцем `loginom`. Процесс вне группы `loginom` эти файлы не прочитает. В Docker том — `/var/opt/loginom-docker/server` (и соседние `http`, `integrator`); в Podman — `$HOME/loginom/...`. Обновление образов эти каталоги предлагает сохранять копией. Внутри контейнера статья Kubernetes монтирует рабочий каталог в `/workdir` и сокет в `/run/loginom`; журнал в journald требует сокет `/run/systemd/journal`. Числовой UID процесса в руководстве не указан; по исходникам установщика в контейнерах Loginom работает от root (см. «Сверка с исходниками установщика»).

**Сессия и права.** Sidecar не может предъявить сессию Studio: она живёт в WebSocket, восстановление завязано на IP и повторную аутентификацию, общего токена для внешнего сайта документация не даёт. «Запомнить» — это Credential Management API браузера, выключается `rememberuser`. Проверка права на пакет снаружи не описана. OpenID-клейм общих папок и роли описывают доступ к каталогам Loginom, а не к нашему сайту. Вызов опубликованного узла идёт от служебной учётки Integrator, поэтому ответ сервиса не доказывает, что текущий зритель Studio имеет право видеть этот пакет.

**Недоверенный код.** Отдельный origin для iframe согласуется с тем, что клиент Studio — статика Apache без документированного плагина. Список URL картинок и ссылок по умолчанию запрещает посторонние адреса внутри контента Loginom; попадёт ли под него `src` нашего iframe, справка не говорит. CSP/frame-ancestors у Studio не документированы, поэтому перед вложением чужого origin это нужно снять с живого ответа Apache.

**Лицензия и перезапуск.** `loginomd` без ключа не работает; в контейнере вендор рассчитывает на сетевой сервер Guardant, потому что программный ключ привязан к оборудованию. [Kubernetes](https://loginom.ru/blog/loginom-kubernetes). Рестарт `loginomd` сбрасывает историю неудачных паролей и обрывает сессии. Закрытие сессии без штатного выхода может оставить пакет занятым, пока не сработает обнаружение обрыва — это описано как риск отключения проверки соединения. [Параметры подключения](https://help.loginom.ru/userguide/admin/parameters/connection-parameters.html).

**MCP.** С 7.4 агент может вызывать уже опубликованный узел как MCP tool. Это другой канал, чем показ таблицы узла в браузере пользователя, и он доступен в Enterprise. Для dashboard на выходе узла в текущей сессии Studio он публикацию пакета не заменяет.

## Расхождения, которые нельзя сгладить

- Файлы клиента native: `/var/www/html/client` в [установке](https://help.loginom.ru/adminguide/linux/server/loginom-linux.html) и `/var/www/loginom/` для `client.json` в [конфигурации Studio](https://help.loginom.ru/adminguide/studio/config.html). Решено поставкой 7.4.2: `install_http.sh` ставит клиент и `client.json` в `/var/www/loginom`.
- Контейнерный каталог конфигов Studio в той же статье — только `/var/opt/loginom-docker/http/`, тогда как Podman хранит конфиги в `$HOME/loginom/http`. [Установка Podman/Docker](https://help.loginom.ru/adminguide/linux/server/install-docker-podman.html).
- Пример `wsproxy` в [конфигурации Studio](https://help.loginom.ru/adminguide/studio/config.html) показывает результирующий URL `ws://web-server-host:443/ws/` при том, что соседние разделы связывают 443 с `wss`. Это выглядит как опечатка страницы; схема из [веб-клиента](https://help.loginom.ru/adminguide/studio/index.html) согласована: порт страницы и `ws`/`wss` по протоколу страницы.
- Поисковый индекс справки в день проверки ещё показывал `aspnetcore-runtime-6.0`. Загруженная в этот же день страница установки указывает `aspnetcore-runtime-8.0`, требования Integrator — .NET 8.0. В заметку попала загруженная страница.

## Не найдено в документации

Часть пунктов закрыта поставкой 7.4.2 и исходниками установщика (пометки «закрыто»; см. разделы «Сверка» в конце).

- Публичный образ Loginom на Docker Hub или в GitHub Container Registry.
- Полный `httpd.conf` / virtual host Linux с `ProxyPass`, TLS и заголовками. Закрыто: `studio.site.conf` для Debian, RHEL и Alt лежит в `http/config-*` поставки 7.4.2, контейнерный — в `src/http/config` установщика.
- Каталог `index.html` одной фразой, если `/var/www/html/client` и `/var/www/loginom` — разные места. Закрыто: поставка 7.4.2 ставит клиент в `/var/www/loginom`.
- URL `/app-debug/`.
- Параметр встраивания Studio (`embedded`) в `client.json`.
- Плагин, свой визуализатор, официальная вставка произвольной страницы в веб-клиент.
- REST API администрирования и проверка «пользователь X может изменить пакет Y».
- Аутентификация входящего вызова REST/SOAP/MCP (кто имеет право дернуть опубликованный узел).
- `Content-Security-Policy` и `X-Frame-Options` ответа Studio. По исходникам установщика защитных заголовков у Apache нет (кроме `TraceEnable off` и HSTS на HTTPS); в живом ответе они не снимались.
- Числовой UID процесса в официальном образе. Для установки службами закрыто: `loginom` — UID 701, `loginomi` — UID 654; в контейнерах по исходникам установщика процессы работают от root.
- Имя systemd unit веб-сервера на RHEL (`httpd` назван пакетом, unit — нет). Закрыто: `httpd` на RHEL, `apache2` на Debian, `httpd2` на Alt.
- Версия новее 7.4.2 в блоге на 11 ноября 2026. Внутренний `7.5.0-alpha` есть только в стендах этого репозитория.

## Открытые вопросы владельцу

Часть вопросов уже решена в [roadmap](../superpowers/specs/2026-11-11-dashboard-architecture-roadmap.md): ответ записан после вопроса. Открытыми остались вопросы 3 и 8, вопрос 7 закрыт частично.

1. Целевая линия — публичная 7.4.x (последняя найденная 7.4.2) или внутренний master, на котором уже стоят стенды dashboard? От этого зависит, есть ли MCP и Peer и совпадает ли каталог клиента со справкой. **Решено в roadmap:** поддерживаются обе линии, dev-стенд на master (приоритет 1) и release 7.4.x (приоритет 2), раздел «Цели и стенды».
2. На трёх площадках (локальный Docker, голый Linux, удалённые контейнеры) включены ли `wsproxy` и HTTPS, и можно ли нам добавлять свой `Alias`/vhost в Apache, не обновляя файлы клиента? **Решено в roadmap:** `Alias` и vhost добавляются одним файлом `dashboard.site.conf` в каталог конфигурации Apache, файлы клиента не меняются; Studio работает и по HTTP, и по HTTPS, перенаправления нет. От `wsproxy` компоненты dashboard не зависят.
3. Какая редакция стоит на площадках — Standard или Enterprise? От этого зависят OpenID, LDAP, `disablenewsfetch` и MCP. **Открыто:** roadmap редакцию не фиксирует. Схема от неё не зависит: dashboard эти возможности не использует.
4. Sidecar может монтировать `UserStorage` и состоять в группе `loginom`, или пакеты для него закрыты и данные узла он видит только через браузерную сессию? **Решено в roadmap:** publisher монтирует `UserStorage` только на чтение и работает с UID процесса Loginom; для release это проверяет spike S2, на dev-стенде для этого нужен каталог хоста (путь Б).
5. Если публичной проверки прав нет, достаточно ли собственного списка разрешений dashboard, не связанного с общими папками Loginom? **Решено в roadmap:** права проверяет сам Loginom (право записи в папку пакета), собственного списка нет.
6. Разрешено ли менять `index.html` поставки, или кнопка и iframe живут только в нашей копии статики, которую обновление `install_http.sh` / `setup.sh --update` может затереть? **Решено в roadmap:** `index.html` не меняем, оболочка подключается конфигурацией Apache (`mod_substitute`).
7. Нужно ли с живого Apache снять заголовки frame/CSP до проектирования iframe на другом origin? **Закрыто частично:** по исходникам установщика защитных заголовков у Apache нет (кроме `TraceEnable off` и HSTS на HTTPS); живой ответ снимается в spike S3 и S4.
8. Кто владеет портами 80/443 на удалённых площадках — Apache Loginom или внешний обратный прокси, в который sidecar надо вписывать отдельно? **Открыто:** roadmap исходит из Apache Loginom и открывает отдельный порт хоста приложений (8101); внешний обратный прокси перед Apache не рассматривался.

## Сверка с исходниками установщика

Проверено 2026-11-11 по исходникам контейнерного установщика `loginom-install-docker` (master `277cade`, скрипт `src/setup.sh`, фрагменты compose `src/yml/*._yml`, конфигурация Apache `src/http/config`). Где справка и код расходятся, верен код.

- **Образы и проект.** Образы `loginom-http`, `loginom-server`, `loginom-integrator` с тегом версии и `latest`; дата есть только в именах сохранённых tar-архивов. `docker-compose.yml` собирается из фрагментов; проект `loginom`, своя сеть не объявлена (сеть по умолчанию, обычно `loginom_default`), контейнеры `loginom-http`, `loginom-server`, `loginom-integrator`. Порт Integrator 5000 наружу не публикуется.
- **Каталоги.** Данные сервера — `<данные>/server`, в контейнере `/workdir`; хранилище — `<данные>/server/UserStorage`. Конфигурация Apache — `<данные>/http/conf`, смонтирована целиком в `/usr/local/apache2/conf`. Docker: `/var/opt/loginom-docker`; Podman: `~/loginom` того пользователя, который ставил.
- **Пользователи и права.** В контейнерах Loginom работает от root; отдельного пользователя `loginom` и прав `660` нет — это про установку службой. `setup.sh` при каждом запуске, включая `--update`, делает `chown -R` своих каталогов: root:root в Docker, пользователь в Podman.
- **Обновление.** `--update` пересобирает образы, не трогает конфигурацию Apache, compose и `.env` и не перезапускает контейнеры. `--change` заново создаёт compose и `.env` и копирует файлы Apache поверх, не удаляя чужие. Удаления установщик не умеет.
- **Apache.** Образ `httpd:2.4-alpine`, клиент (`index.html`) запечён в образ. `httpd.conf` подключает `conf/*.site.conf`; загружены `mod_headers`, `mod_filter`, прокси и `mod_ssl`, `mod_substitute` не загружен. Сертификат задан через `Define SSL_CERT` и `SSL_KEY` в `env.conf`. Заголовков безопасности, кроме `TraceEnable off` и HSTS на HTTPS, нет; перенаправления с HTTP на HTTPS нет; у прокси `ProxyTimeout` 72 часа.
- **Автозапуск.** Docker — `restart: unless-stopped`; Podman — строка `@reboot podman-compose -f … start` в crontab пользователя. Podman всегда вызывается с `-f`, поэтому `docker-compose.override.yml` не подхватывается.
- **Сертификат по умолчанию** самоподписан на `localhost`, а его закрытый ключ лежит в дистрибутиве, то есть известен всем.
- **`client.json`.** Скрипт установщика его не создаёт, но файл приходит вместе с каталогом клиента (`COPY ./client`): см. «Сверка с поставкой Linux 7.4.2». Каталога `client` контейнерной поставки среди источников нет, поэтому наличие файла в контейнерах выведено по двум другим сборкам клиента.
- **Нет в release:** путь `/app-debug/`.
- **Неслитая ветка** `origin/rootless-container-user` переводит Loginom на UID 7001, Apache — на `www-data` и внутренние порты 4080 и 4443 и переписывает crontab.

Как это учтено в архитектуре — в [roadmap](../superpowers/specs/2026-11-11-dashboard-architecture-roadmap.md), раздел «Скрипты для стендов».

## Сверка с поставкой Linux 7.4.2

Проверено 2026-11-11 по официальной поставке Linux 7.4.2 enterprise (`loginom-install-linux-7.4.2-ent`): это установка прямо в систему, не контейнерная. Где справка и поставка расходятся, верна поставка.

- **Состав.** `install_loginom.sh` по очереди запускает `http/install_http.sh`, `server/install_server.sh` и, если каталог есть, `integrator/install_integrator.sh`; все требуют root.
- **Клиент.** Один: каталог `http/client/`, он ставится в `/var/www/loginom` (`CLIENT_DIR` в `install_http.sh`), а не в `/var/www/html/client`. Каталога `client-debug` и пути `/app-debug/` нет. Каталог клиента копируется поверх старого, сохраняется только `server.json`.
- **`client.json`** в поставке есть: `http/client/client.json` с содержимым `{}`. Установка копирует его вместе с каталогом клиента, поэтому правка этого файла на стенде пропадёт при обновлении.
- **Apache.** Раскладок три, дистрибутив определяется по файлам системы: Debian — `/etc/apache2`, сайт в `sites-available/studio.site.conf`, `a2ensite`, служба `apache2`; RHEL — `/etc/httpd/conf`, `studio.site.conf` рядом с `httpd.conf`, который подключает `Include conf/*.site.conf`, как в контейнерах, служба `httpd`; Alt — `/etc/httpd2/conf`, `sites-available`, служба `httpd2`.
- **HTTPS** включён сразу: `Define USE_SSL 1`, сертификат по умолчанию `default-cert.crt` и `default-cert.key` из архива поставки (закрытый ключ известен всем). WebSocket-прокси выключен (`#Define USE_WS_PROXY 1`), как и в контейнерах.
- **Пользователи.** Сервер работает от `loginom` (UID и GID 701), Integrator — от `loginomi` (UID 654) в группе GID 701, то есть в группе `loginom`.

Это относится к `native.sh`, который в backlog (roadmap, раздел «`native.sh`»). Живая установка не проверялась: выводы сделаны по скриптам и конфигурации поставки.

## Образы dev-стенда

Проверено 2026-11-11 по слоям образов `dashboard-master-20261109` (`docker save`); в Docker образы не загружались.

- Apache собран на `httpd` 2.4.68 alpine, той же базе, что у release (`FROM docker.io/httpd:2.4-alpine`). Модуль `mod_substitute.so` лежит в `modules/`, но по умолчанию не загружен: его загружает наш `dashboard.site.conf`.
- Конфигурация взята из integration: загружены `mod_headers`, `mod_filter`, `mod_deflate`, `mod_brotli`, `mod_proxy`, `mod_proxy_http`, `mod_proxy_wstunnel`, `mod_rewrite`, подключается `conf/*.site.conf`. Виртуальных хостов, HTTPS и сжатия нет: `snippets/deflate.conf` в образе есть, но не подключён. `ProxyPreserveHost` не задан.
- Сервер работает от UID 7001, томов нет, `UserStorage` лежит в слое контейнера (`/workdir/UserStorage`).
- `client.json` лежит в обоих каталогах клиентов, `client` и `client-debug`.
