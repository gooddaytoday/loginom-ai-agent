# Dashboard M5 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Установить dashboard рядом со штатным release Loginom под Docker и rootless Podman и подтвердить установленный пользовательский путь по HTTPS, офлайн-установку, обновление и удаление без потери данных.

**Architecture:** Отдельный `containers.sh` управляет тремя существующими ролями M4 и одним файлом Apache. Web пересылает TLS в Apache, сохраняя ключ только там. Серверный `check` каждый раз публикует и удаляет синтетическое приложение; отдельная клиентская проверка подтверждает настоящую Studio и доступ с другой ОС.

**Tech Stack:** Существующие TypeScript, Bun, встроенный Node, `node:test`, Bash, OpenSSL/curl, Docker/Compose и Podman/podman-compose, QEMU/KVM; без новых сторонних библиотек.

**Spec:** [Принятый дизайн M5](../specs/2026-11-15-dashboard-m5-design.md), [roadmap](../specs/2026-11-11-dashboard-architecture-roadmap.md), [изоляция](../../security/dashboard-isolation.md).

Статус: выполнение разрешено владельцем 15 ноября 2026 года; Task 0 принят: Spec Approved и Quality Approved, обязательных замечаний нет. Tasks 1–5 не начинались. Уточнение входа ниже принято независимым ревью до сборки; остальные требования M5 сохранены. План прошёл независимое ревью — Approved, неразрешённых замечаний нет. Ход исполнения — [checkpoint M5](../../testing/loginom-ai-agent/dashboard-m5-checkpoint.md).

## Global Constraints

- Отдельный release-установщик; dev-путь не перерабатывается. Единственная ожидаемая совместимая правка `dev-master.sh` — включить `shell.js` в контекст общего Dockerfile. Общий deployment framework, SSH-оркестратор и новые службы не нужны.
- Release Loginom 7.4.x, минифицированный `/app/`, HTTP-only и совместно HTTP/HTTPS. При включённом HTTPS app-origin всегда HTTPS. Строгому режиму предоставляются отдельные домен и сертификат; полная строгая приёмка остаётся M6.
- Порт приложений по умолчанию 8101; API 8100 и HTTP app listener 8102 доступны только внутри сети. TLS завершает Apache на выделенном внутреннем порту 8444. Его фактические существующие порты и занятость нового порта проверяются до изменения конфигурации.
- Минимумы roadmap: Docker 20.10+ и Compose 1.21+; Podman 3.4+ и podman-compose 1.0.3+. Для старого Compose используется совместимый `version: "2.4"`, без top-level `name:`. Минимумы не заменяются проверкой современного CLI.
- Сохраняются ограничения M4: три роли одного образа, web/builder non-root, rootfs RO, capabilities dropped, no-new-privileges, конечные limits/tmpfs; publisher/builder без сети. Только publisher видит UserStorage RO, ни одна роль не видит весь каталог server или TLS-ключи.
- Публикация и права остаются по M4; JSON `format: 1`, `template: 1`, до 1 048 576 байт. `.lgp`, пользовательские публикации и исходники сохраняются. Серверная тестовая публикация не требует реального `.lgp` или Loginom credentials.
- Каждый серверный `check` выполняет пробную публикацию. Клиентская проверка обязательна отдельно после install, update и change; отсутствие её результата не скрывается успехом серверной части.
- CA ставится штатно в ОС/браузер. Не использовать `curl -k`, `ignoreHTTPSErrors`, отключение TLS-проверки или новый CA UI. Runtime Chromium остаётся direct, политика proxy/NO_PROXY остальных компонентов не меняется.
- На сервере не требуются Node/Bun/npm/checkout/Chromium. Для JSON используется Node готового образа; HTTP/TLS проверяет host curl со штатным доверием ОС. Артефакты поставки не содержат credentials.
- Пины Node/Chromium/шаблона — из Product/lockfile, без копий в плане. Тесты и `bun typecheck` запускаются из пакетов; перед коммитом — `bun run secrets staged` только своих файлов. Все VM-диски, сертификаты/ключи, configs и сырая диагностика вне Git.

## Основа, первый результат и размер

M4 окончательно принят: [checkpoint M4](../../testing/loginom-ai-agent/dashboard-m4-checkpoint.md) и [runbook M4](../../testing/loginom-ai-agent/dashboard-m4.md). M5 начат в отдельном worktree от принятой основы; перенесены только документы M5, результаты M4 сохранены. SHA начала реализации находится в checkpoint M5.

Самый ранний сквозной результат: настоящая release Studio в VM → установленный Desktop на хосте → HTTPS-снимок → черновик → подтверждение → публикация через Host → publisher/builder → Dashboard в `/app/`. До него не создавать расширенную диагностику, упаковочную инфраструктуру или матрицу отказов. Первые Task 0–1 подробнее остальных; поздние шаги используют полученные факты, не выдуманные mounts/UID/версии установщика.

Оценка уточнена по карте существующих callers: 18–26 файлов, 1 500–2 200 добавленных/удалённых строк вместе с тестами и документацией (`git diff --stat` от начала реализации). Условные CA-исправления учитываются только при воспроизводимом дефекте. Если размер превысит оценку вдвое или новый механизм требует третьего обходного исправления, пересмотреть подход, сохранив результат и гарантии. Одноразовые VM/spike-скрипты не становятся продуктом.

## Review Focus

| Условие и ожидаемое поведение | Где проверяется |
|---|---|
| HTTP Studio использует нестандартный HTTPS-порт: ссылка при недоступном iframe ведёт именно в Studio, TLS-ключ не попадает в web | Task 1: настоящий TLS и browser silent-case |
| Занятое имя/неоднозначный mount/ошибка Apache: прежняя установка и пользовательские байты сохранены | Task 3: install refusal/rollback и повторный install |
| Два `check`, занятый builder или отмена: чужие публикации/очередь сохранены, собственная очистка подтверждена либо честно сообщена | Task 2: normal, failure, cancellation, concurrent check |
| Rootless UID mapping и частная SELinux-метка сервера: Loginom продолжает читать/писать, publisher только читает | Task 4: реальные владельцы/mounts/enforcing |
| После update/change изменилась сеть/конфигурация/сертификат: обе проверки обязательны, устаревшая конфигурация не даёт успех | Task 5: настоящая пара версий и change |

## Карта файлов и интерфейсов

| Файлы | Ответственность |
|---|---|
| Новый `packages/dashboard/src/web/tls.ts`; существующие `src/web/server.ts`, `src/entry.ts` | TCP-forwarder, health/shell и выбор listener; никаких TLS-ключей или HTTP-разбора в forwarder |
| `src/shell/index.ts`; `test/browser/shell.test.mjs`, `test/browser/fixture.mjs` | Ссылка на HTTPS Studio в существующем silent-состоянии |
| Новые `deploy/containers.sh`, `deploy/compose-release.yaml`; существующие `deploy/Dockerfile`, одна строка `deploy/dev-master.sh` | Отдельная release-установка, bootstrap из образа, проверки, сохранный lifecycle |
| Новый `script/build-release.ts`; `package.json` | Повторяемая сборка серверного архива и включение новых тестов в существующие команды |
| `deploy/check-studio.mjs`; `test/web/server.test.mjs`, `test/web/dist-smoke.test.mjs`; новый `test/deploy/containers.test.mjs` | Проверки реальных транспортов/артефакта, ранних CLI-отказов и установленной Studio |
| `.github/workflows/test.yml`; `packages/dashboard/AGENTS.md`; новые `docs/testing/loginom-ai-agent/dashboard-m5.md`, `dashboard-m5-checkpoint.md`; существующий testing README и roadmap | Существующий CI, команды администратора, реальные доказательства и checkpoint до 20 строк |

Условные callers CA: `packages/desktop/src/main/index.ts`, `sidecar.ts`, `dashboard-target.ts`; `packages/loginom-host/src/node-client.ts`, `supervisor.ts`; `packages/loginom-runtime/src/connection-check.mjs`; CLI build/run в `packages/opencode`. Они уже используют штатное доверие; заранее их не менять. При доказанном дефекте сначала прочитать owning AGENTS.md и все callers, затем исправить первый неверный участок и повторить тот же установленный путь.

### Task 0: Подтвердить реальную release Studio в отдельной VM

**Files:** создать при исполнении runbook/checkpoint M5; продуктовые файлы не менять. Временные команды и конфигурация — `$M5_SCRATCH` вне Git.

**Interfaces:** вход — принятый M4, доступная штатная контейнерная поставка, существующая конфигурация провайдера/лицензирования. Выход — собственная VM и приватные `M5_STUDIO_HTTP`, `M5_STUDIO_HTTPS`, `M5_APP_ORIGIN`, SSH/config paths; в Git только обезличенные результаты и ссылка на один checkpoint. Пароли не в аргументах команд.

- [x] Сверить финальный M4 и создать отдельный checkout от принятого SHA. Перенести дизайн/план и только относящиеся к M5 изменения roadmap, сохранить новые результаты M4. Проверить hooks и закреплённый Gitleaks. Результат: основа записана один раз, чужие checkout/стенды не изменены.
- [x] Получить и проверить целевую **контейнерную** поставку 7.4.x разрешённым способом, сверить её происхождение/версию и реальный `setup.sh`. По отдельному поручению владельца допускается подготовить её из предоставленного release и соответствующего тега штатного установщика по процедуре ниже; это не объявляется готовым архивом вендора. Начать с версии, совместимой с уже принятым runtime M4; не расширять поддержку runtime ради недоступной поставки. Отдельно установить доступность выпущенной предыдущей версии для Task 5. Пока целевой поставки нет, работать только к этому входу; нативный архив и тестовые images не заменяют его.
- [x] Создать чистую Linux VM существующими QEMU/KVM/cloud-init. Одна VM одновременно, начально 4 vCPU/6–8 ГБ, собственный диск и сетевой адрес, без общих каталогов с клиентом. Не менять основной сетевой интерфейс/политику хоста и не останавливать M4. Снимок чистого гостя или отдельный чистый диск обеспечивает повтор для Podman; выбор поддерживаемой ОС и команды подготовки остаются исполнителю.
- [x] Штатно установить Loginom на Docker, определить реальные mounts, UserStorage, UID/GID, сеть, Apache-модули и порты через inspect/конфигурацию. Настроить собственный тестовый сертификат, установить CA штатно на сервере и клиенте; сохранить возможность удалить только собственный CA после приёмки. Ключи остаются в приватной среде.
- [x] Проверить с хоста `curl --fail "$M5_STUDIO_HTTPS/app/"`, вход/выход в `/app/` и подключение установленного Desktop/CLI на собственных профилях. Без bypass TLS. `httpd -t` и `httpd -M` внутри своего Studio подтверждают базу для S3. Результат: настоящая release Studio по HTTPS доступна с другой ОС; это ещё не проверка dashboard-снимка.
- [x] Записать ограничения и команды воспроизведения в runbook; локальный коммит `docs(dashboard): record M5 release stand prerequisites`. При внешнем блокере указать точный отсутствующий вход; не строить вокруг него инфраструктуру.

### Уточнение Task 0: проверка предоставленной release-сборки

Владелец предоставил контейнерный release и репозиторий штатного установщика, затем поручил выполнить проверки и необходимые доработки. Выбран путь: сохранить release payload и собрать образы штатными Dockerfile соответствующей версии. Прямой импорт образов отвергнут: отличаются теги, пользователь сервера и запуск Integrator. Происхождение и точные пины входов находятся только в [runbook M5](../../testing/loginom-ai-agent/dashboard-m5.md). Клиент содержит предусмотренные предоставленной сборкой изменения `data-tid`; точный исходный минифицированный клиент вендора не заявляется.

**Результат:** воспроизводимо подготовленный комплект со штатным `setup.sh`, установленная в собственной VM release Studio по HTTP/HTTPS, Login/Logout и подключение установленных Desktop/CLI; либо конкретный воспроизведённый блокер. Это не завершает dashboard-публикацию Task 1 или M5.

**Изменения:** план, дизайн, runbook и checkpoint; ожидаемо 4 файла, 80–150 изменённых строк. Артефакты сборки, одноразовые команды и поправки vendor-файлов остаются в собственном приватном scratch вне Git. Продуктовый механизм подготовки, новый installer и VM framework не добавляются. Необходимость продуктового исправления требует отдельного краткого дополнения и ревью до его реализации.

- [x] Повторно проверить SHA256 внешнего архива и его внутренний manifest; закрепить неизменённый тег installer. Без выполнения входных скриптов прочитать Dockerfile/setup и сформировать ожидаемые каталоги из финального содержимого release images, учитывая порядок слоёв, whiteouts и symlinks. Не извлекать архивные имена за пределы собственного staging; не переносить пользовательские конфигурации/ключи. Проверяемый результат: входные бинарники/клиент имеют те же байты и modes, ссылки остаются в собственной сборке.
- [x] Выполнить штатную подготовку installer с точной версией, разместить release payload, собрать три образа его Dockerfile и сохранить комплект. Сначала проверить дешёвым реальным build, что бинарники/библиотеки и конфиги полны; не вносить предупредительных изменений. При отказе сохранить команду/результат RED, изменить один подтверждённый участок и повторить до GREEN. Поправки vendor-сборки хранить отдельным patch с причиной; не называть изменённые файлы исходным тегом.
- [x] Создать собственную VM с KVM, 4 vCPU и 6–8 ГБ, отдельным диском/адресом без shared folders. Использовать существующие QEMU/cloud-init и отдельную локальную сеть без изменения основной сети/глобальной политики хоста. Сначала установить штатным `setup.sh` Docker-вариант и подтвердить server/Studio/Integrator; runtime binaries не пересобирать. Повторно использовать доступное разрешённое тестовое лицензирование; новую необратимую активацию ключа не выполнять.
- [x] Подтвердить основной путь Task 0: HTTP и HTTPS минифицированной `/app/`, фактическую версию, штатный Login/Logout, WebSocket, `httpd -t/-M`, mounts/UserStorage/UID/GID/network и реальные TLS-запросы с клиентской ОС. Установить только собственный CA штатно с точечным удалением; TLS bypass запрещён. Проверить установленный Desktop/CLI на отдельных профилях против этой Studio. Сохранить пакет/пользовательские байты при проверках.
- [x] После первого успешного запуска проверить повторный штатный install и сохранность собственных синтетических данных. Не выдавать reinstall одной версии за upgrade. Rootless/SELinux/нижние версии и полный dashboard-цикл остаются в Tasks 1–5; позднюю матрицу не развивать до первого основного результата.
- [x] Независимо проверить подготовленную сборку и фактические доказательства; обновить runbook/checkpoint, закрыть только доказанные пункты Task 0. Для настоящего update по-прежнему нужен отдельный предыдущий выпущенный release. Перед docs-коммитом — staged secret scan; push/PR/merge/release не выполнять.

Проверка и прежний блокер готового архива — [runbook M5](../../testing/loginom-ai-agent/dashboard-m5.md). Новая разрешённая подготовка не превращает исходниковые проверки в установленную приёмку.


### Task 1: Первый установленный dashboard по HTTPS

**Files:** `src/web/{server,tls}.ts`, `src/entry.ts`, `src/shell/index.ts`, `deploy/{containers.sh,compose-release.yaml,Dockerfile,dev-master.sh}`, существующие web/browser tests из карты.

**Interfaces:** `tlsForwarder({ host, port }): net.Server` создаёт, но не слушает сервер; timeout бездействия 30 секунд, фиксированный upstream. `startDashboard(env, shell: Uint8Array)` передаёт shell в `dashboardServer` и возвращает `{ api, apps, tls }`, где `tls` отсутствует в HTTP-only режиме. Entry читает `shell.js` рядом с установленным `server.mjs` только для роли web. Новая private env `DASHBOARD_TLS_UPSTREAM` задаёт Apache host:port, обязательна при HTTPS app-origin; origin и upstream проверяются до открытия listeners. HTTP-only сохраняет прежний путь. Фактический HTTPS-порт Studio передаётся доверенным script-tag как `data-dashboard-studio-https-port`; LookupResponse/протокол v1 не меняются.

- [ ] По одному добавить в `test/web/server.test.mjs` поведенческие тесты `health and installed shell respect Host` и `TLS bytes reach the configured Apache`. Для второго создать временный сертификат OpenSSL, настоящий `https.createServer`, forwarder и TLS-клиент с доверенным CA; использовать случайные порты. Ключ не сохранять в Git. Начальные assertions:
  ```js
  assert.equal(foreignHost.status, 403)
  assert.deepEqual(await health.json(), { ok: true })
  assert.equal(await deliveredShell.text(), installedShell)
  assert.deepEqual(received, expectedBytes)
  ```
- [ ] Из `packages/dashboard` выполнить `"$LOGINOM_AI_AGENT_TEST_NODE" --test test/web/server.test.mjs`; подтвердить RED по отсутствующему поведению. Реализовать точные GET `/dashboard/health` и `/dashboard/shell.js` после Host-check: минимальный JSON, JS MIME и `no-store`, без путей/секретов в ответе. Передать shell всем реальным callers/tests нового обязательного аргумента.
- [ ] Реализовать forwarder стандартными `node:net`/`pipe`, закрытие обеих сторон при error/close/idle timeout. Добавить по одному реальному тесту отказа upstream, закрытия клиента и конечного timeout; конфигурация HTTPS без upstream должна отказать до частичного старта. Выполнить те же tests до GREEN. Положительный запуск HTTPS listener дополнительно подтверждается в VM.
- [ ] Дополнить dist smoke: перенести `server.mjs` **и** `shell.js` в пустой каталог без checkout/node_modules, запустить web и проверить оба новых маршрута. В Dockerfile добавить shell; в dev-builder добавить только его копирование в общий build context. Проверить `bun run build` и `"$LOGINOM_AI_AGENT_TEST_NODE" --test test/web/dist-smoke.test.mjs`.
- [ ] В browser fixture добавить только вход для настоящего data-атрибута script. Тест `silent dashboard links to the actual Studio HTTPS port` проверяет нестандартный порт, ссылку на текущий hostname `/app/`, существующее сообщение «не ответил», удалённый iframe и рабочий возврат. При отсутствии атрибута остаётся прежнее сообщение без выдуманного HTTPS URL. После RED расширить существующий `silent` handler; `frame.ts`, 10-секундный timeout и MessagePort-протокол не менять. Проверка: `"$LOGINOM_AI_AGENT_TEST_NODE" --test test/browser/shell.test.mjs`.
- [ ] Реализовать минимальный `containers.sh install --engine docker --public-host <host> [--app-host-port <port>]`: обнаружение выбранной штатной установки, отдельный compose с тремя ролями, один атомарно заменяемый `dashboard.site.conf`, `httpd -t`/возврат прежнего файла до graceful reload. Корректно обработать HTTP-only и HTTP+HTTPS. `mod_substitute` вставляет shell с SRI/data-атрибутом, файлы клиента и `client.json` не меняются. API 8100 и app HTTP 8102 не публиковать наружу; app-port TLS пересылается на Apache 8444, без унаследованного API на app-origin. Для первого прохода вручную подготовить каталог будущей поставки по контракту Task 3 с образом из общего Dockerfile и текущими server/shell; отдельную систему упаковки пока не строить.
- [ ] В своей VM проверить `bash -n`/ShellCheck, `httpd -t`, HTTP/HTTPS и модуль substitute; с клиента — единственную script-вставку/SRI, gzip/br, повторный запрос с валидаторами даёт 200, правильные origin/Host. В browser-тесте подтвердить отрицательный контроль SRI: изменённые байты shell при прежнем integrity не исполняются, обычная Studio остаётся доступной. Зафиксировать реальные расхождения S3 до добавления обходов; не править `index.html` как fallback.
- [ ] Пройти первый полный цикл установленного Desktop с настоящей моделью и отдельным пакетом: снимок → черновик → явное подтверждение → свой JSON/ready → открытие Dashboard с живыми строками. Сверить `.lgp` до/после. Если выявлен CA-дефект, исправлять только воспроизведённый путь по owning AGENTS.md, сохранив отказ недоверенным сертификатам и сетевую политику. Повторить тот же путь; component-тест не заменяет его.
- [ ] Выполнить `bun typecheck`, `bun run test`, `bun run check:size` из dashboard и необходимые проверки условно затронутых пакетов. Записать первый installed результат и существенные ограничения; коммит `feat(dashboard): serve release dashboards over Apache TLS`. До PASS не переходить к поздним Tasks.

### Task 2: Проверка публикации и отдельная клиентская диагностика

**Files:** `deploy/containers.sh`, `deploy/check-studio.mjs`, новый `test/deploy/containers.test.mjs`, `package.json`, runbook M5. Новый помощник допустим только для сложного реально появившегося участка; общий API проверки не требуется.

**Interfaces:** `containers.sh check [--engine …]` читает сохранённую установку, завершает работу кодом 0 только после обязательных серверных проверок и подтверждённой очистки. Node из образа (`--entrypoint /opt/node/bin/node`, без сети) обрабатывает JSON через stdin; host curl выполняет HTTP/TLS со штатным CA. Клиентский запуск сохраняет существующие `DASHBOARD_STUDIO_CONFIG` и pinned Node/Chromium; credentials не передаются серверному check. Команда `check-studio.mjs 7.4.2` применима к подтверждённой текущей версии; изменение допустимых версий пробы сверяется с целевой поставкой Task 0, без снятия ограничений runtime.

- [ ] На реальном стенде добавить минимальную синтетическую публикацию: уникальный созданный эксклюзивно каталог `<check-name>.lgp.dashboards/<nodeGuid>/`, JSON v1 с `src/main.tsx`, атомарный rename. Публикацию формировать администратором; publisher остаётся RO. Дождаться существующим `lookup` точного имени и SHA256 байтов JSON, затем загрузить полученные HTML/assets по app-origin. До реализации зафиксировать воспроизводящий отсутствующий результат (RED); после — PASS.
- [ ] Удалить только собственный источник/пустые каталоги, дождаться очистки publisher. Проверка после удаления вызывается **без** `publication`:
  ```js
  assert.deepEqual([lookup.exists, lookup.latest, lookup.currentVersion], [false, null, null])
  assert.equal(oldBuildResponse.status, 404)
  assert.equal(otherPublicationHashAfter, otherPublicationHashBefore)
  ```
  Очистку state/jobs/builds выполняет publisher, не check. Ограничить ожидание существующими сроками M4 и отдельным конечным сроком очистки; по timeout сообщать «не завершена», а не «служба сломана». Подтверждённый build и отказ cleanup отражаются раздельно.
- [ ] По одному воспроизвести на собственной пробе ошибку сборки, SIGINT/TERM, занятый builder и два параллельных check. Исправить обнаруженные дефекты, проверить сохранность чужого JSON/работающей страницы и отсутствие вмешательства в чужую очередь. После SIGKILL не обещать автоматическое удаление: вывести/сохранить имя созданной пробы до записи и описать точечную ручную очистку, без нового реестра/daemon.
- [ ] Добавить остальные серверные проверки из раздела `check` roadmap: Apache/module/SRI/сжатие, принудительные заголовки на штатных и ошибочных ответах, закрытые metadata/API пути, Host, сертификат/срок/имя/default-cert warning, контейнерные network/RO/capabilities/limits и режим. Ответ 500 app-host проверять только на своей временной сборке: временно сделать её HTML недоступным web, восстановить точный прежний mode в finally. Общий state и чужие сборки не повреждать. Для ошибок Apache/API проверять действующие `Header always` и изолированный адресный тест соответствующего error path, без нового публичного fault endpoint; в отчёте различать наблюдаемый HTTP-ответ и проверку конфигурации.
- [ ] Доработать `check-studio.mjs`: отсутствие установленной оболочки — FAIL, удалить `addScriptTag` fallback. Сохранить существующий клиентский tooling и его явные prerequisites (checkout, Bun, pinned Node/Chromium/Playwright); проверочная сборка adapter не подменяет установленный shell. Проверить script/SRI, реальные объекты адаптера, открыть Dashboard и получить ready/живую таблицу из HTTPS iframe. Сохранить native Close/Logout и реальное закрытие Chromium; не приравнивать resource ACK к Logout.
- [ ] На клиентском хосте подтвердить оба отрицательных контроля: без установленного shell и при закрытом app-порте клиентская проверка отказывает, серверная сама по себе этого не обещает. После восстановления обе проходят. Команда из dashboard: `DASHBOARD_STUDIO_CONFIG="$M5_STUDIO_CONFIG" "$LOGINOM_AI_AGENT_TEST_NODE" deploy/check-studio.mjs 7.4.2` для целевой 7.4.2; приватный config содержит свой пакет/узел.
- [ ] В `test/deploy/containers.test.mjs` проверять реальные ранние CLI-отказы, не макетировать движок: invalid host/port/неполный strict-набор должны завершаться ненулевым кодом до любых изменений. Добавить файл к существующему package test; выполнить адресный Node test, ShellCheck и обе живые проверки. Коммит `feat(dashboard): verify release publication and client access`.

### Task 3: Сохранный lifecycle и переносимый офлайн-архив

**Files:** `deploy/containers.sh`, `deploy/compose-release.yaml`, новый `script/build-release.ts`, `package.json`, `test/deploy/containers.test.mjs`, runbook.

**Interfaces:** полные команды `install|check|stop|start|uninstall`; флаги roadmap `--engine`, повторяемый `--public-host`, `--app-host-port`, `--strict`, `--app-host-domain/cert/key`, `--cli-button`; только `uninstall` принимает `--remove-image`. Каталоги штатного Loginom обнаруживаются, не задаются вручную. Собственное состояние — `/var/opt/loginom-dashboard` для Docker или `$HOME/loginom-dashboard` для Podman. `build-release.ts --out <dir>` производит архив с `containers.sh`, release-compose, требуемыми supporting-файлами, `image.tar`, `image.ref` и `SHA256SUMS`; `image.ref` — имя/тег своего образа, не исполняемый config. Источники Node/template берутся из существующих закреплений.

- [ ] На собственной VM сначала воспроизвести отказы с неоднозначным mount/занятыми собственными именами, неверным внешним адресом и некорректным Apache-файлом. Зафиксировать byte/hash прежнего конфига и UserStorage. Минимально завершить обнаружение/валидацию: точные имена/принадлежность своих объектов, физический UserStorage, сохранение настроек без `source` произвольного shell, откат Apache при `httpd -t` failure. Не добавлять глобальные проверки чужих ресурсов.
- [ ] Реализовать `stop` как освобождение внешней сети только своим compose-проектом с сохранением данных; `start` пересоздаёт собственные контейнеры. Проверить, что внешний Loginom network после stop больше не имеет dashboard endpoint. Повторные install/start/stop безопасны; own crontab-строка добавляется/удаляется без изменения других строк.
- [ ] Проверить `uninstall`: удалены только свои контейнеры/конфиг/crontab/state, образ удаляется лишь при явном выборе, публикации и `.lgp` остаются в UserStorage. Apache config проходит проверку и reload, тот же пакет открывается без dashboard. Не использовать `down` Loginom или широкую очистку Docker/Podman.
- [ ] Вынести повторяемую подготовку образа в `script/build-release.ts`: использовать существующую последовательность pinned Node/npm/template из dev-builder, убрать локальный fallback по image ID и тестовый ROI; сохранить `--ignore-scripts`/offline image build. Экспортировать один образ трёх ролей и контрольные суммы архива. Не создавать новый реестр версий/артефактов; источник/версию фиксировать средствами существующей поставки и runbook.
- [ ] Проверить артефакт в свежей VM без Node/Bun/npm/checkout и без доступа к Интернету (сохранить доступ клиент↔VM и требуемое лицензирование): `sha256sum -c SHA256SUMS`, штатный load, install и check, отдельный клиентский прогон. Повреждённый вход должен отказать до изменения Loginom. Это основной тест нового build-скрипта; содержимое TAR без реального load/install недостаточно.
- [ ] Проверить HTTP-only и strict-конфигурацию с отдельным доменом/сертификатом: правильные origin, недоступность API на app-origin и отсутствие ключей в mounts web. Полное security-review M6 не заявлять. Пройти адресные tests/typecheck/build, сохранить команды сборки/установки; коммит `feat(dashboard): package the standalone release installer`.

### Task 4: Rootless Podman, SELinux и нижние версии

**Files:** только необходимые корректировки `containers.sh`/release-compose/tests и runbook; новый движок, универсальный адаптер или постоянный VM harness не создавать.

**Interfaces:** тот же архив и команды Task 3 под пользователем штатной rootless-установки; Loginom UID/GID и host mapping обнаруживаются. Web/builder non-root нельзя вычислять как `id -u` rootful Docker-администратора. Настройки SELinux следуют фактическим меткам UserStorage.

- [ ] Подготовить чистую гостевую установку со штатно поддерживаемым rootless Podman и SELinux enforcing, используя тот же автономный VM-подход. После штатной установки release Loginom проверить отсутствие Node/Bun/npm/checkout и отключить Интернет гостя, сохранив клиент↔VM и требуемое лицензирование. Из **того же** архива выполнить проверку сумм → `podman load` → install → server check → client check; офлайн-условия Task 3 обязательны и здесь. Воспроизвести первую несовместимость до изменения кода; каждый новый фикс должен отвечать конкретному наблюдаемому отказу.
- [ ] Проверить фактические UID mapping, чтение publisher, отказ его записи, прежнее чтение/запись Loginom и отсутствие доступа к `Users.cfg`/ssl. Проверить shared-label путь и предусмотренный roadmap вариант с частной меткой сервера без relabel, нарушающего Loginom; не выключать SELinux глобально и не добавлять capabilities. После каждого изменения повторить server check и client check.
- [ ] Перезагрузить собственную VM и проверить автозапуск Loginom/dashboard под нужным пользователем, затем обе проверки. Удаление dashboard должно удалять только собственную запись автозапуска и сохранять остальные строки.
- [ ] На чистых подходящих гостевых окружениях подтвердить заявленные нижние версии Docker/Compose и Podman/podman-compose реальным create/start/check и поддержкой RO/network/limits, а не только `compose config`. Современные версии используются для основной приёмки, нижние — для совместимости того же архива. Если нижняя версия недоступна/несовместима, честно зафиксировать незакрытый критерий; не поднимать минимум молча.
- [ ] Зафиксировать результаты/точные версии один раз в runbook, выполнить нужные адресные и package checks; коммит `feat(dashboard): support rootless release installations` только при фактических изменениях, иначе `docs(dashboard): record container compatibility`.

### Task 5: Обновление и итоговая установленная приёмка

**Files:** runbook/checkpoint/README, owning AGENTS.md, roadmap; `.github/workflows/test.yml`, package scripts/tests — только необходимые итоговые подключения.

**Interfaces:** окончательный архив, установленный Desktop/CLI из принятой основы с нужными M5-изменениями, реальная пара разных выпущенных версий Loginom. Для приёмки используются private test profiles/configs и обычные продуктовые разрешения; подтверждение публикации сохраняется.

- [ ] На Docker и Podman выполнить полный M4 release-цикл: личная/общая writable папки, предусмотренный версией отказ прав, local/downloaded src и продолжение, явное подтверждение/отказ Desktop, CLI без/с явным auto, ошибка новой сборки с прежней живой версией, manual rollback, неизменность `.lgp`. Основные входы — установленные Desktop и CLI; исходниковый builtin не подменяет их. Native Close/Logout и завершение runtime записывать раздельно.
- [ ] По имеющейся паре выполнить настоящее обновление Loginom: dashboard stop → штатные down/update/up → dashboard start → server check → client check. Проверить прежние публикации и пакет. Повторить `setup.sh --change` со сменой предусмотренного конфигурацией сертификата/порта: старое обнаружение не должно давать ложный PASS, повторный install восстанавливает параметры, обе проверки снова проходят. Не выдавать переустановку той же версии за update; отсутствие второй поставки блокирует только этот критерий, но завершить M5 без него нельзя.
- [ ] Проверить trusted private CA и отрицательные варианты unknown CA/неверное имя/просрочка на реальных путях: Studio/iframe, Desktop snapshot, backend lookup, CLI и Chromium Host. Неверный сертификат остаётся отказом; после возврата доверенного все пути работают. Одних Node/OpenSSL unit tests недостаточно. Test CA/ключи принадлежат только своей приёмке.
- [ ] Выполнить uninstall после обновления: прежние `.lgp` и JSON публикаций сохранены, Loginom открывает пакет, конфигурация и сеть его проекта работоспособны. Сохранить собственные материалы приёмки до итогового отчёта; старые M4 данные не удалять.
- [ ] Подключить новые проверки к существующим dashboard jobs в `.github/workflows/test.yml`: ShellCheck/`bash -n`, unit/deploy tests, web coverage, browser/dist. Новый `tls.ts` измеряется существующим full-web coverage; TLS tests остаются в уже запускаемом `server.test.mjs`. Нижние движки/SELinux/полный installed путь доказываются VM-прогонами, без отдельной CI-платформы. Общий Dockerfile проверяется также с build context dev-пути, не меняя действующий dev-стенд.
- [ ] Из `packages/dashboard` выполнить `bun typecheck`, `bun run test`, `bun run check:size`, `bun run test:browser`; сохранить web и workers coverage ≥90% строк/функций. Для реально затронутых Desktop/Host/runtime/CLI выполнить owning package checks и установленный повтор; общие проверки не гонять заново без изменений/неразрешённого риска. Проверить итоговую сборку и загрузку точного архива; факт source PASS не переносить на ранее собранный артефакт.
- [ ] Провести итоговое независимое ревью всей реализации с фокусом на приватные mounts/ключи, сохранность install/check/uninstall, лишние механизмы и границы M5/M6. Закрыть обязательные замечания, повторить только затронутые проверки. Записать runbook отдельно для source/container/installed/update результатов, checkpoint до 20 строк, инструкции и ссылки. Коммит `docs(dashboard): document M5 release acceptance`; push/PR/merge/release — отдельное поручение владельца.

## Самопроверка и передача

Дизайн покрывают Tasks 0–1 (основа/первый результат/HTTPS/CA), 2 (две проверки и сохранная проба), 3 (lifecycle/офлайн/strict setup), 4 (rootless/SELinux/минимумы), 5 (перенесённая release-приёмка/обновление/удаление/доказательства). Все пять Review Focus имеют свои наблюдаемые проверки. Новые постоянные механизмы ограничены release-конфигурацией, офлайн-артефактом и узким TCP-forwarder; существующие publisher state/очередь/API/CA-пути переиспользуются.

Самопроверка покрытия дизайна, последовательности, интерфейсов и размера выполнена; независимое ревью фиксируется в статусе этого документа. Владелец отдельно разрешил исполнение; исполнитель следует принятому дизайну и этому плану; при изменении результата/контракта/гарантий нужно решение владельца, при добавлении механизма — новое независимое ревью плана. Внешний блокер не компенсируется расширенной диагностикой вокруг неработающего основного пути.
