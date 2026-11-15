# Dashboard M5 — release-стенд

Task 0 принят: **Spec Approved / Quality Approved**, обязательных замечаний нет. Следующий этап — Task 1. Из предоставленного release подготовлен комплект штатными Dockerfile и installer с одной проверенной поправкой сохранения конфигурации. В собственной VM подтверждены HTTP/HTTPS, WSS, Login/Logout, Integrator и установленная Linux-пара Desktop/CLI; повторный setup сохранил собственные данные. Tasks 1–5 не выполнялись. Основа — только в [checkpoint M5](dashboard-m5-checkpoint.md); контракт — в [плане](../../superpowers/plans/2026-11-15-dashboard-m5.md) и [дизайне](../../superpowers/specs/2026-11-15-dashboard-m5-design.md).

## Входы и происхождение

Пины этой проверки:

- Предоставленный архив: `loginom-release-7.4.2-6e72ef0f1824.tar`, SHA256 `c46b25113439a30c719b0e9b52c68d8361922fe6d0980a7c12e6956ade7e04d8`; повторная проверка внешней суммы и **12/12** внутренних сумм PASS.
- Штатный installer: tag `v7.4.2`, commit `277cade5605b76f723184ffd2e0e9f13b9120dd9`; SHA256 исходного архива `3aeb9ab8bb5e7e8c5bdfe6178c3da39f9ea0aee244edd0e2c0a45b1bf96bef95`.
- Гость: Ubuntu 24.04.5 LTS, kernel `6.8.0-147-generic`; [официальный cloud image](https://cloud-images.ubuntu.com/noble/current/noble-server-cloudimg-amd64.img), SHA256 `04e8f2461a16a44e78a370284471f29616cdd9baf1893df25807b71f985b6c94`, сверенный с [официальным manifest](https://cloud-images.ubuntu.com/noble/current/SHA256SUMS).
- Реальная установка: Docker `29.1.3`, Compose `2.40.3+ds1`; клиентская Linux-пара — установленный финальный кандидат [M4](dashboard-m4.md#task-7--поставка-и-сохранный-переход).
- Самодостаточный локальный комплект: `prepared-release-bundle.tar.gz`, SHA256 `869d4b2e1dea39ba7f2e3002732a999cc565dc25fbf3aaabefdb72483d09e1f8`; три образа, installer и provenance с `vendor-preserve-integrator-config.patch`. Это изменённый installer тега выше; private license/config/CA keys не включены.

Это собственная подготовка из предоставленного release и штатного installer, а не полученный готовый контейнерный архив вендора. Предоставленный клиент содержит overlay `data-tid`: 8 добавлений, 1 patch, 26 замен; побайтное совпадение с исходным клиентом вендора не заявляется. Внешний production не проверялся и не менялся.

До `docker load` проверено отсутствие всех трёх исходных тегов в локальном Docker. Из точного member `images/images.tar` восстановлены final rootfs штатными `docker create --network none` и `docker cp -a`, без собственного разбора слоёв. Собственные остановленные контейнеры не запускали входные entrypoint. Подготовка `make_installers.sh loginom <версия>` создала `result/loginom`; payload размещён в `http/client`, `server/server`, `server/libs`, `integrator/integrator`.

Проверены байты, modes, типы и ссылки: client 7264, Server 38, Integrator 54 записи. Пользовательские `server.json`, `appsettings.json`, `Integrator.dll.config` не переносились; конфиги задаёт штатный installer. Все три Dockerfile собраны без поправок; `ldd` Server разрешил зависимости. После сборки bytes/modes payload сохранились. Только две ссылки Firebird штатный Dockerfile преобразовал из относительных в абсолютные внутри `/app`; это отражено отдельно в provenance. После сборки в installer внесена только описанная ниже поправка сохранения конфигурации; продуктовые изменения отсутствуют; runtime binaries не пересобирались.

## Установленная проверка

- Одна KVM VM: 4 vCPU, 7 ГБ RAM, отдельный диск и гостевой адрес, QEMU user network с host forwards; shared folders нет. Основной интерфейс и глобальная сеть хоста не менялись.
- `setup.sh --dir <own-config> --load --nosave --defaults` и `docker compose up -d` завершились успешно. Штатные имена/entrypoint, mounts и конфиги взяты из installer; три образа имеют подготовленные байты, а не прямой retag входных образов.
- Все процессы штатной поставки работают от UID/GID `0:0`; UserStorage — `/workdir/UserStorage`, `0:0`, `0755`. Server получает bind `/workdir` и named socket volume `/run/loginom`; Integrator — собственный `/workdir` и тот же socket volume. Apache получает конфигурационный bind и отдельный `server.json`. Сеть — собственная Compose bridge гостя.
- Host `curl --fail` к HTTP и HTTPS `/app/` дал 200, ответы совпали. HTTPS `server.json` также 200. `httpd -t` — `Syntax OK`; `httpd -M` подтвердил SSL, HTTP/2, proxy и proxy_wstunnel. Это проверка serving/config, не успешной Loginom-сессии.
- Собственный тестовый CA штатно установлен в trust ОС гостя и хоста, а также NSS собственных клиентских HOME. TLS hostname verification и равенство peer certificate собственному сертификату проверены отдельно. Дистрибутивный тестовый ключ не используется; собственные private keys — `0600`. Bypass TLS не применялся. Точечное удаление только собственного CA сохранено приватной командой.
- После первоначального отказа лицензирования по указанию владельца найден и подтверждён существующий внутренний Guardant service. Только собственная VM получила его настройки; новая активация не выполнялась. Адрес и источник сохранены приватно. Server работает без новых restart; его native/WS/WSS listeners подтверждены.
- Браузер: минифицированная Studio заданной версии, Login, обмен WSS на том же HTTPS origin и штатный Logout PASS; пакеты не открывались. Для открытия меню дождались завершения первого перехода интерфейса. Integrator подтвердил в штатном журнале «Выполнено подключение к серверу»; HTTPS REST help и SOAP WSDL вернули 200 с ожидаемым отсутствием опубликованных пакетов. Это не выполнение опубликованного сервиса.
- Установленные CLI и Desktop проверены на отдельных нормальных HOME/XDG/профилях. Финальный CLI `loginom check --headless --format json`: `LOGINOM_CONNECTION_VALID`, Help ready, browser verified. Публичный Desktop IPC connection check: browser verified; Desktop штатно закрыт. После повторного setup оба клиентских check и браузерные Login/Logout повторены успешно. Все 15 runtime receipts: ACK + actual exit 0/no signal и отсутствие PID; собственный Xvfb завершён.
- Все 29 ранее существовавших контейнеров хоста сохранили ID, статус и StartedAt. Прежние M3/M4 стенды и пользовательские профили не использовались для новых подключений.

Первый запуск выявил дефект одноразовой подготовки: распаковка в госте под `umask 077` изменила права `server.json`, Apache вернул 403. Распаковка с `tar -p` и чистый повтор только собственной установки восстановили 0644/HTTP 200 и WSS proxy. RED сохранён. Это исправление процедуры, не vendor patch и не доказательство обновления. Собственные TLS-ключи явно установлены с 0600.

Минимальный повтор `--change --nobuild --defaults` обнаружил реальный дефект installer: существующий `Integrator.dll.config` безусловно заменялся шаблоном даже при отказе менять настройки. Пароль Integrator сбрасывался, а `Users.cfg` сохранялся; фактический журнал Integrator подтвердил «Неверное имя пользователя или пароль». Однострочная private patch меняет первый overwrite на copy-if-absent; существующая ветка явного изменения настроек сохранена. Независимое ревью поправки: Approved, 0 обязательных/необязательных замечаний. После восстановления известной верной исходной конфигурации тот же repeat setup с поправкой сохранил её hash, `Users.cfg`, байты/UID/GID/mode синтетического UserStorage. Перезапуск Integrator и тот же запрос подтвердили успешное соединение. Это поправка installer вне Git, а не восстановитель после установки; образы не пересобирались.

## Повторение и возобновление

Все диски, SSH/CA keys, credentials, raw logs и команды находятся вне Git в собственном `$M5_SCRATCH` с правами 0700. Точный каталог передаётся в приватном отчёте Task 0; `environment.sh` задаёт URL и пути без вывода credentials. VM оставлена для продолжения. Для проверки уже подготовленного стенда:

```sh
source "$M5_SCRATCH/environment.sh"
ssh -F "$M5_VM_SSH_CONFIG" m5-input 'sudo docker logs --tail 8 loginom-server'
ssh -F "$M5_VM_SSH_CONFIG" m5-input 'sudo docker exec loginom-http httpd -t'
curl --noproxy '*' --fail "$M5_STUDIO_HTTPS/app/" -o /dev/null
curl --noproxy '*' --fail "$M5_STUDIO_HTTPS/app/server.json" -o /dev/null
HOME="$M5_SCRATCH/cli-home" LOGINOM_AI_AGENT_CLI_PROFILE="$M5_SCRATCH/cli-profile" \
  "$M5_CLI_EXECUTABLE" loginom check --headless --format json
```

Для Node-процессов загрузить сохранённое разрешённое acceptance-окружение и `NODE_USE_ENV_PROXY=1`; не менять общую proxy/NO_PROXY политику. Private `guest-install.sh`, исправленный порядок распаковки и `login-release.mjs` сохраняют команды сборки/установки/проверки. Результаты расположены в `input-verification.json`, `build-*-1.log`, `payload-*-verification.json`, `vendor-link-changes.json`, `vendor-fixed-repeat-setup.log`, `fixed-repeat-preservation.log`, `final-fixed-inspect.json`, `integrator-fixed-green-summary.json`, `integrator-fixed-green.jsonl`, `login-release-result.json`, `installed-cli-check-final.log`, `installed-desktop-connect.json`, `client-cleanup-final-summary.json`, `bundle-readback-verification.json` и `tls-peer-identity.json`.

Task 0 больше не блокируется лицензированием. Сохранены готовая VM, private `environment.sh`, конфигурация и `OPERATIONS.md` с точными PID/ports/start/stop/monitor. Текущее NAT соответствие важно для следующего этапа: host 18080 → guest 80, host 18443 → guest 443; будущий app listener ещё не forwarded. Это не проверка всей сетевой матрицы M5. Комплект проверен на отсутствие собственных credentials/лицензионного endpoint/CA keys; неизменность RootFS образов подтверждена между build host и guest. Отдельная распаковка финального tar с `tar -p` подтвердила bytes/modes/types/links всего комплекта, исправленный setup, `server.json` 0644 и суммы трёх image archives относительно проверенных исходных файлов.

Минимальная повторная установка и синтетическая сохранность PASS; это не upgrade. Rootless Podman, SELinux, нижние версии, dashboard-публикация и полная update-матрица не выполнялись. Прежний поиск подтвердил package jobs предыдущего выпуска, но пригодный предыдущий контейнерный архив не получен; для Task 5 он нужен отдельно. Эксплуатационная доступность корпоративного license service остаётся внешней зависимостью. Push/PR/merge/release не выполнялись.
