# Dashboard M4: публикация через хранилище

Статус: Tasks 0–4 приняты независимыми review; Task 5 реализована и проверена, ожидается независимый полный review. Это не приёмка установленной M4. База хранится только в [checkpoint M4](dashboard-m4-checkpoint.md); контракт и последовательность — [дизайн](../../superpowers/specs/2026-11-14-dashboard-m4-design.md) и [план](../../superpowers/plans/2026-11-14-dashboard-m4.md).

M3 завершена: установленная Linux-приёмка, CI и независимые ревью PASS. Её результаты, ограничения URI dispatch/Windows/macOS и исходные артефакты сохраняются в [runbook M3](dashboard-m3.md). Они не подтверждают новый M4. Первый проверяемый результат реализации — закрытый host-вызов через авторизованную Studio на обеих версиях, затем публикация проверенных исходников до `ready` и открытия Dashboard.

## Собственные ресурсы

Выделены две новые пары Server/Studio: `dashboard-m4-master-{server,studio}` и `dashboard-m4-release-{server,studio}`. В каждой паре собственная сеть с соответствующим суффиксом `-net` и named volume `-userstorage`, смонтированный в `/workdir/UserStorage` с самого создания сервера. Использованы уже доступные образы из рецепта [стенда](../../../dashboard/stand/README.md) и опытов S1/S2: master build 5579, client/server 7.4.2 с необходимой libxml2. Исходные образы не менялись. Метка принадлежности новых сетей, томов и контейнеров — `codex.owner=dashboard-m4`.

Studio опубликованы только на свободных loopback-портах, Server наружу не опубликован. Старые DNS-имена серверов остаются aliases только внутри собственных сетей, поэтому Apache направляет WebSocket в свой Server. Master предоставляет минифицированный `/app/` и `/app-debug/`; 7.4.2 — минифицированный `/app/`. Реальные порты, IDs, images, private Studio configs и команды хранятся в приватном scratch вне Git (`stands.json`, `master.json`, `release.json`, `environment.sh`). Ниже они передаются переменными окружения.

В scratch заранее созданы раздельные каталоги `profiles/<stand>/{desktop,cli,browser}`. Desktop запускается с собственными HOME/XDG; CLI — со своим `LOGINOM_AI_AGENT_CLI_PROFILE`; браузер — с новым профилем. Короткий `TMPDIR` и закреплённые инструменты приходят из проверенного окружения M3. Не подменять общий HOME профилем приёмки и не использовать старый SDD environment. Proxy использует порт 10808 с обходом loopback; Docker daemon не перенастраивается.

Все существовавшие до подготовки контейнеры сохраняются, включая остановленные. Их IDs, состояние и StartedAt записаны приватно до/после. ROI, исходные LGP/CSV, резервы M3 и основной checkout не меняются. `dev-master.sh` M3 жёстко привязан к прежним именам/портам, поэтому его `install` здесь не запускается; первый полный проход с установкой dev-компонентов выполняется в Task 3, итоговая поставка и миграция — в Task 7.

## Подготовка и команды

Для локальной приёмки M4 с уже подготовленным proxy-окружением загрузить проверенные переменные и явно включить его использование Node. Существующие proxy/NO_PROXY сохранить; глобальный скрипт M3 и продуктовую proxy-политику не менять:

```sh
source "$ACCEPTANCE_ENVIRONMENT"
source "$M4_ENVIRONMENT"
export NODE_USE_ENV_PROXY=1
cd "$M4_REPO"
```

`ACCEPTANCE_ENVIRONMENT` указывает на сохранённый `acceptance-environment.sh` рядом с финальными артефактами M3, а `M4_ENVIRONMENT` — на новый `environment.sh` scratch. Последний задаёт `M4_REPO`, `M4_SCRATCH` и URL двух новых Studio без credentials. Credentials доступны только через JSON-файлы с правами `0600`. Для GitHub-команд использовать `gh --repo gooddaytoday/loginom-ai-agent`.

Штатная установка зависимостей нового checkout:

```sh
bun install --frozen-lockfile
(cd packages/loginom-runtime/client && npm ci --ignore-scripts)
(cd packages/dashboard/template && npm ci --ignore-scripts)
bun run prepare
git config --get core.hooksPath
gitleaks version
```

Ожидаются `.husky/_` и версия из `.gitleaks-version`. Lockfiles не обновлять. Для Task 1 доступны штатные `bun test`/`bun typecheck` из `packages/loginom-host` и новые focused `node --test test/dashboard-storage.test.mjs` из `packages/loginom-runtime`; точные новые focused tests добавляются с реализацией. Команды dashboard выполняются из `packages/dashboard`:

```sh
bun run build
bun typecheck
bun run check:size
```

Проверка выделенных пар без установки dashboard:

```sh
docker ps -a --filter label=codex.owner=dashboard-m4
docker exec dashboard-m4-master-studio httpd -t
docker exec dashboard-m4-release-studio httpd -t
docker exec dashboard-m4-master-server ldd /app/loginomd
docker exec dashboard-m4-release-server ldd /app/loginomd
curl --noproxy '*' -fI "$M4_MASTER_URL"
curl --noproxy '*' -fI "$M4_RELEASE_URL"
```

HTTP 200 и `Syntax OK` недостаточны для подтверждения подключения: дополнительно проверяется вход через штатный `loginBrowser` с private config, версия `bg.app.Version` и штатный logout в собственном временном профиле, затем закрытие context. Эти операции не открывают и не сохраняют пакет. Проверка записи, rename/collision и закрытого host относится к Task 1; Task 0 их не объявляет выполненными.

Перед каждым коммитом: `git diff --check`, подготовить только свои файлы и `bun run secrets staged`. Полный CI завершённого M3 не повторяется ради подготовки checkout. Доступность старых DEB/AppImage/CLI, manifest и evidence сверяется с сохранёнными материалами M3; проверка доступности не означает новую static verification поставки.

## Результат Task 0 и ограничения

Установлены зависимости штатными frozen-командами; hooks и закреплённый Gitleaks доступны. Dashboard source build, typecheck и check:size пройдены. Обе новые пары стартовали, Apache config и ldd проверены, страницы клиентов ответили HTTP 200. Штатные login/logout PASS: master `7.5.0-alpha+build.5579` и release `7.4.2`; context закрыты, пакеты не открывались. Проверены IDs, images, status, StartedAt/FinishedAt, ports и mounts всех 17 исходных контейнеров: без изменений. Команды и приватные evidence — в локальном отчёте Task 0.

Полный CI, установленный M4 и builder/publisher ещё не проверены; состояние закрытого storage path и прав приведено ниже. Пара 7.4.2 из тестовых images подтверждает только путь рантайма; она не заменяет полноценную release-установку M4, условие переноса которой в M5 задано roadmap. Rootless Podman/SELinux не принимаются этим прогоном. npm ci сообщил audit findings в закреплённых зависимостях; lockfiles и зависимости в Task 0 не менялись.

## Переход и полномочия

Владелец разрешил автономную реализацию всех задач, локальные коммиты/сборки/профили/стенды/публикации, сохранную миграцию освобождённого dev-стенда M3 и замену локальной установки с backup/rollback. Для миграции сохранить Server/Studio/web и локальные `src/`, остановить только собственную запись Loginom перед финальным копированием, перенести UserStorage с владельцами/правами в новый том, сверить байты и вход Studio, оставить прежнюю копию. На каждом нужном узле получить свежий снимок и перепубликовать сохранённые исходники штатно. Продуктовое разовое подтверждение публикации сохраняется.

Пользовательское работающее приложение принудительно не закрывается. Если оно мешает замене файлов, отложить именно замену до штатного завершения; остальные проверки вести в собственных профилях. Слияние, выпуск и удаление прежних данных — отдельные действия владельца. После трёх раундов unresolved mandatory назначается свежий сильный независимый reviewer. Лимиты подтверждаются реальными примерами, корректировки — по замерам и ревью в пределах принятого контракта.

## Task 1 — закрытый Host → Studio

Финальный проход через штатно собранный Node Host и staged runtime выполнен на минифицированном `/app/` master и 7.4.2: pre-chat read → private publish → private read возвращает точные UTF-8 bytes/hash, `.lgp` остаётся побайтно прежним. Это проверка общей реализации Host, не установленная приёмка Desktop/CLI M4. Сборка использует `buildNodeHost` и `stageResources`, Product/lock pins и штатный knowledge-key build input; произвольного runtime override нет.

`RenameFile` оказался небезопасным для занятого имени. После независимого review выбран штатный `MoveFile(part, final, false)`; проверены occupied target (оба содержимых целы) и свободный final (полный размер при первом наблюдении и тот же inode). Продуктовый проход дополнительно подтвердил collision с полным сохранённым `.part` и отмену после появления upload part размером 0 на обеих версиях: возвращается `DASHBOARD_WRITE_UNKNOWN`, final отсутствует, записи не повторяются. Browser runtimes дали close ACK и exit 0.

Права проверены собственными ACL fixtures: master read-only читает, запись возвращает `DASHBOARD_ACCESS_DENIED`; 7.4.2 no-access возвращает тот же код до записи. Отмена во время login проверена временной паузой только своего Server: `DASHBOARD_CANCELLED`, Chromium завершён, ACK + exit 0, Server возобновлён в finally. Сборка `delivery` прошла все 10 live-сценариев с подтверждённым cleanup до последующей правки классификации ошибок (fix #1). Stale expected возвращает `changed` без создания файлов.

Task 1 принят независимым review: fix #1 — **Approved**, замечание #2 — **ADDRESSED** в границах Task 1. Fix #1 возвращает `DASHBOARD_WRITE_UNKNOWN` при некорректном успешном ответе публикации и потере acquired IPC без replay; известные отказы, отмена до отправки и cleanup failure сохранены. Проверены focused 38 tests и typecheck; runtime этой правкой не менялся.

Для #2 выполнен один штатный exact rights-master на исходном неинструментированном `built-check` с единственным изменённым входом `NODE_USE_ENV_PROXY=1`. Флаг подтверждён у самого Knowledge child; его наблюдённый socket peer совпал с настроенным proxy. Чтение разрешено, запись дала `DASHBOARD_ACCESS_DENIED`, `host.close()` дождался завершения. Исходные receipts Knowledge и обоих browser runtime: ACK true, actual exit 0, signal null; все наблюдавшиеся собственные PID исчезли. Этот запуск проверяет исправленный proxy-вход и lifecycle исходного artifact; он не приписывается `delivery` или Host fix #1. Это также не установленная приёмка Desktop/CLI M4.

Исторический master-прогон с Knowledge ACK → SIGKILL остаётся достоверным отказом: общий cleanup именно того прогона **не подтверждён**, исходная receipt сохранена. Причина **UNKNOWN**, связь с отсутствием proxy-флага у того PID не доказана; новый PASS не объявляется исправлением исторического сбоя. Редкий post-ACK отказ может повториться. Knowledge code, timeout и требование ACK + actual exit0/no signal не изменены; новый cleanup failure потребует адресного разбора. Raw evidence и независимые verdict сохранены в материалах Task 1.

Source проверки: границы origin/generation, profile/call/admit, UTF-8/лимит, monotonic UTC, повторные короткие чтения, отмена запуска/операции, held generation/settings pending и shutdown. Отдельный `turn-lifecycle` test сохраняет отсутствие lease у обычного dashboard model-turn. Host suite 63 PASS; после fix #1 focused suite 38 PASS и typecheck PASS; runtime 19 PASS, turn-lifecycle 9 PASS. Точные RED→GREEN команды и локальные ссылки на evidence находятся в отчёте Task 1; raw scripts/configs/logs остаются в `$M4_SCRATCH`, вне Git.

## Task 2 — проверенные исходники после подтверждения

`preparePublish` сохраняет прошедшую локальные проверки копию `src/` рядом с `operation/dist`, строит строгий JSON v1 без образца и считает его SHA-256. Полный UTF-8 JSON ограничен 1 048 576 байтами отдельно от прежнего лимита исходников. Builtin читает версию короткой private Host-операцией, освобождает lease, вызывает прежний `ctx.ask` с узлом/пакетом и `always: []`, затем передаёт сохранённые байты с `expected`. Неизвестная основа папки M3 при существующей версии отмечается как расхождение в metadata; отображение основания и хранение основы относятся к Task 4.

Локальная запись M3 в builds и `publish.sqlite` удалены. `changed` возвращает `needs-confirmation`, отказ и отмена сохраняют черновик; подтверждённая передача возвращает только `pending`. Образец сохраняется до будущего `ready`. Потеря локальной папки после подтверждённой записи не отменяет результат передачи. В пакете dashboard нет импорта Host, нового транспорта или зависимости; callback сохраняет границу пакетов. Публичный Protocol/HttpApi не менялся.

На обеих собственных Studio выполнен настоящий builtin с пустыми аргументами → adapter → ранее собранный Host `delivery` → managed runtime/Chromium. Одно разрешение на конкретный узел/пакет, lease чтения освобождён до вопроса, одна запись; правка рабочего `src/` внутри `ctx.ask` не изменила переданные bytes/sourceHash. Private read подтвердил точное содержимое и отсутствие образца; локальный образец сохранён, `.lgp` неизменён, папка операции убрана. Оба `host.close()` завершились, actual Host exit 0/signal null. Probe использовал искусственный snapshot и Session directory; это проверка source builtin с собранным Host, а не установленной Desktop/CLI M4 или серверной сборки. Evidence: `$M4_SCRATCH/task2-live.json`, script `live-task2.ts`; результаты не объявляют `ready`.

Проверки из соответствующих пакетов: dashboard — `"$LOGINOM_AI_AGENT_TEST_NODE" --test test/contract/publication.test.mjs test/agent/publish.test.mjs`, `bun typecheck`, `bun run build`; opencode — `bun test test/tool/dashboard.test.ts test/product/turn-lifecycle.test.ts`, `bun typecheck`. Формат покрывает круговой перенос текста/бинарных байтов, полный UTF-8 лимит, число/повторы/пути/кодировки, строгие поля и entry point. Проверена неизменность подготовленных байтов после правки и двух пересборок. Старые fake lease в двух тестовых файлах дополнены только неожиданными dashboard-вызовами: обязательный typecheck выявил отсутствие этих методов после Task 1. Итог: dashboard 16/16, builtin/lifecycle 21/21 (95 assertions), оба typecheck и сборка dashboard PASS. RED→GREEN приведены в локальном отчёте Task 2.

Task 3 (publisher, lookup и `ready`), Task 4 (основа/конфликты/UI), установленная приёмка и CI в этой задаче не выполнялись. Исторический cleanup concern Task 1 остаётся в своём разделе; новая проверка его не отменяет.


## Task 3 — первый dashboard из UserStorage

На собственной master-паре первый путь завершён: кнопка установленной оболочки
минифицированного `/app/` создала настоящий одноразовый снимок узла «По убыванию
ROI»; существующий пример `roi` подготовлен локально, source builtin получил одно
разовое разрешение с `always: []` и передал сохранённые bytes через собранный Host.
Publisher обнаружил окончательный JSON, builder собрал его, инструмент дождался
`ready` своего имени/sourceHash и вернул `published`. Затем штатная кнопка Dashboard
показала пять живых строк в `sandbox="allow-scripts"`. Это source builtin + built
Host + установленная оболочка/контейнеры, **не установленная Desktop/CLI M4**.

Привязка проверяется по физическому пути, результат — по собственной ограниченной
копии publisher. Linux publisher удерживает directory fd при чтении: отдельный
RED→GREEN воспроизвёл подмену родительского каталога ссылкой; исправление независимо
Approved, source bundle и работающий image сверены побайтно. Один `state.json` заменяет серверный `current`: lookup отдельно
возвращает текущую работающую версию, последнюю попытку и запрошенный файл. Общая
сборка обслуживает agent и builder; локальные `current` и две версии остаются
agent-owned. Стенд использует один image и три роли. Реальное чтение JSON publisher
прошло; запись в UserStorage отклонена `EROFS`. Inspect подтвердил UID Loginom,
RO UserStorage, отсутствие этого mount у web/builder, отсутствие сети у
publisher/builder, non-root web/builder, RO rootfs, cap-drop, no-new-privileges и
лимиты. `.lgp` совпал побайтно, JSON не содержит образца; локальный sample удалён
после ready. JSON и output не содержат `sample.json`.

На том же image три примера прошли отдельные последовательные задачи builder при
90 секундах, 1 ГБ и 256 процессах, exit 0 без OOM: ROI — 607 050 байт / 8,3 с,
channel-summary — 231 530 байт / 4,0 с, campaign-summary — 578 031 байт / 3,3 с.
Предел 20 МиБ имеет более чем 30-кратный запас на крупнейшем примере; лимиты не
изменены. Сравнение локального и серверного результата даёт одинаковый hash.

Первоначальные проверки из `packages/dashboard`: `bun run build`, `bun typecheck`,
focused набор из brief — 41/41 PASS, `bun run test` PASS с прежним порогом web coverage. Из корня:
`bash -n packages/dashboard/deploy/dev-master.sh`, ShellCheck, compose config,
inspect и `dev-master.sh check --config <локальный JSON>` PASS. Последний проверил
lookup/state, HTTP-заголовки, обе оболочки и штатные adapter-вызовы на `/app/` и
`/app-debug/`, включая ClosePackage и Logout.

Dev-config выбирает конкретную пару без discovery; проверка URL в `check-studio`
минимально параметризована здесь, поскольку это нужно существующему `check`
новой пары. Fresh install сохраняет pinned Debian fallback при отсутствии
локального image cache. Rootless Docker не видел loopback proxy хоста: для image
используется отдельный публичный npm cache, подготовленный с пустыми user/global
configs и чистым окружением; внутри image — `npm ci --offline`. Credentials,
Knowledge key и локальные настройки в контекст не копируются. Переноса M3 нет.

Evidence вне Git: `$M4_SCRATCH/task3-live.json`, `task3-view.json`, `task3-studio.png`,
`task3-inspect.json`, `task3-ro.json`, `task3-container-measure.json`, `task3-check.log`
и журналы focused/package tests. Первый view-probe ошибся CSS-селектором; повторён
только просмотр без новой публикации. Этот failed probe закрыл Chromium, но
пропустил штатный Logout. Native log выявил четыре сохранённые собственные сессии:
три короткие Host-операции и failed view. Они закрыты одним разрешённым maintenance
restart только новой собственной master-пары: журнал подтвердил закрытие всех
четырёх контекстов. Все 25 долговечных файлов, включая `.lgp` и публикацию, сохранили
прежние байты; удалён только lock собственного пакета. Evidence:
`$M4_SCRATCH/task3-maintenance.json`. Исходная сверка 26→25 и её false сохранены;
отдельная адресная проверка подтвердила неизменность оставшихся файлов.

`Host cleanup=true` в live evidence означает resource ACK, завершение Chromium и
child с exit 0; это **не native Logout**. Существующая политика короткого private
runtime без подготовленного workspace допускает сохранение server session после
disconnect. Она в Task 3 не менялась. Snapshot, успешный view и проверки `check`
выполнили ClosePackage/Logout. Cleanup concern failed probe закрыт подтверждённым
maintenance; причина прежнего read-only warning напрямую не проверялась.
Исторический Knowledge ACK→SIGKILL остаётся отдельным UNKNOWN concern Task 1.

Независимый review Task 3 выявил два дефекта. Fix 1 учитывает JSON-экранирование
диагностики и переводит невалидный manifest в отказ только своей задачи; следующая
публикация продолжает обрабатываться, прежняя ready сохраняется. Предел самой
диагностики остаётся 8 КиБ. Отсутствующий manifest остаётся ожиданием, включая
отдельную проверку, что dangling symlink не считается отсутствием. Общая сборка
переиспользует уже установленный hash при конкретном конфликте одновременного
rename; другие ошибки распространяются. Новых очередей или повторов нет.
Fix 1: адресный набор builder/publisher/agent — 30/30 PASS; после добавления
проверки dangling manifest — publisher 15/15 PASS. `bun typecheck` и `bun run build`
прошли. Обычные rebuild/install/check собственной пары завершились без новой
публикации; bundle из source, каталога установки и работающего image совпал
побайтно. Установщик повторно подтвердил изоляцию до старта, `check` подтвердил
ClosePackage/Logout на обоих клиентах. Неизменённые широкие suites не повторялись.
Evidence Fix 1: `$M4_SCRATCH/task3-fix1-*.log` и `task3-fix1-inspect.json`.

Основа/конфликты/UI Task 4, recovery Task 5, расширенная матрица и установленная
Desktop/CLI приёмка здесь не выполнялись. Task 3 accepted: независимая проверка Fix 1 закрыла оба mandatory замечания без новых дефектов. Результаты Task 4 описаны ниже.


## Task 4 — продолжение черновика и осознанная замена версии

`prepareDashboard` читает публикацию через приватный pre-chat Host. Desktop сохраняет origin и generation одного status, CLI вызывает management `dashboard.read` до подключения backend. Lifecycle отменяет запросы снимка/lookup; Desktop передаёт сигнал Host, CLI использует существующий awaited `close`/`beginClose`. Отдельного IPC отмены и второго браузера нет.

При наличии локального `src/` его содержимое и основа сохраняются. Если исходников нет, скачанный JSON v1, привязка и хеш проверяются до раскладки файлов; шаблон разрешён только после подтверждённого отсутствия публикации. Старые папки M3 с неизвестной основой остаются читаемыми. Смена origin не перепривязывает папку. Недоступная Studio допускает только продолжение имеющегося черновика с сообщением. Desktop показывает toast, CLI пишет notice в stderr; причины прав, формата и подключения остаются различимыми.

`dashboardConflict: {base, latest}` показывается в той же форме одноразового разрешения вместе с узлом и пакетом. Согласие относится к сохранённому payload и захваченной latest; изменение версии до записи возвращает `needs-confirmation`, без повторного согласия или записи. Desktop auto-accept не отвечает; CLI без `--auto` явно объясняет отказ. Основа обновляется только после `written` с точным хешем под существующим коротким lock. Две свои публикации сохраняют более новую основу независимо от порядка завершения. Обновление снимка перечитывает основу под тем же lock; подтверждённая публикация сохраняет поля нового снимка и удаляет образец только своего snapshot ID после `ready`.

Исходниковые проверки Task 4: dashboard folder/publish — 42/42; Desktop target — 5/5; opencode builtin/standalone/turn lifecycle — 27/27; App permission-auto-respond/build-request/submit — 59/59; browser publication UI — 2/2 (toast, различимые ошибки, warning до выбора, обновление latest, отказ и отсутствие always). CLI subprocess проверяет pre-chat generation, `--auto`, сохранение локальной папки при отказе Studio, отдельную ошибку доступа для новой папки, SIGINT → interrupt/close и освобождение profile guard. Typecheck dashboard, desktop, opencode, app и ui — PASS.

Общий JSX test preload исправлен после независимого воспроизведения неверного output pinned Bun: используется уже имеющийся Solid compiler с фактическим DOM/SSR режимом. Проба через настоящий onLoad проверила fragment и реактивные текст/атрибут; существующие UI scroll/i18n проверки — 23/23. Новых зависимостей, global shim или второго test plugin нет. Это исправление тестового окружения, не изменение продуктовой модели публикации.

Эти результаты относятся к source и контролируемым private IPC fixtures. Task 4 не повторяла публикацию на стенде, не меняла установленный Desktop/CLI, контейнеры или native Logout. Исторический Knowledge UNKNOWN остаётся в разделе Task 1. Task 4 accepted: независимый review завершён без mandatory замечаний. Результаты Task 5 приведены ниже; установленная приёмка остаётся Task 7.


## Task 5 — отказы сохраняют работающую версию

Shell теперь показывает ошибку новой публикации, продолжая открывать прежнюю сборку. Статус берётся из `latest`, диагностика вставляется как текст в область с ограниченной высотой и прокруткой, чтобы длинная ошибка не скрывала прежнюю страницу. Реальные файлы, publisher/buildNext и HTTP lookup/appHost проверили malformed JSON, неверную физическую привязку, неизвестный template, неверный GUID, type/import error и результат больше 20 МиБ: `failed` относится к указанному файлу, прежние key/hash/page сохраняются. Валидный GUID другого сценария не меняет ключ настоящего сценария. Диагностика ограничена 8 КиБ.

На собственных minified master и 7.4.2 выполнен настоящий upload и `MoveFile(part, final, false)`. После ответа Studio `{written:true}` временный facade бросал искусственное исключение: точное чтение конечного имени и хеша подтвердило `written`. В варианте после native Logout и закрытия контекста проверка недоступна — `DASHBOARD_WRITE_UNKNOWN`, без повторной записи. Это fault injection после завершённого RPC, **не наблюдённая потеря сетевого/native RPC ответа**. Полные final bytes сохранены, `.part` отсутствовал, пакеты неизменны. Native Logout подтверждён у всех четырёх зачтённых случаев. Исходная четвёртая probe не подтвердила закрытие контекста; один адресный повтор исправил только введение сбоя и сохранение evidence. Исходный неуспешный результат сохранён отдельно. Narrow independent plan review подтвердил эту границу без нового сетевого критерия.

`WRITE_UNKNOWN` сохраняет src/sample/base; `pending` не объявляется ошибкой или успехом. Проверка с настоящим ожиданием двух минут получила pending, затем поздний ready не запустил фоновую очистку. Собственный ready A подтверждается при более новой B. Удалённый ожидаемый файл остаётся pending. Потеря work после written/ready и ошибка unlink образца сохраняют published с отдельным предупреждением; чужой свежий образец сохраняется.

Лимиты проверены на временных собственных контейнерах с теми же non-root, RO root, no-network, cap_drop, no-new-privileges и tmpfs настройками. Доверенный этап компилятора временно заменялся нагрузкой: память достигла 1 ГиБ, ядро подтвердило oom_kill=1; число процессов достигло 256, pids.events подтвердил отказ и child вернул EAGAIN. В обоих случаях настоящий child failure дал manifest failed, publisher сохранил предыдущую страницу HTTP200; контейнеры завершились и удалены. Это fault injection компилятора, не обычное приложение. Таймаут общей сборки проверен через существующий timeoutMs=500: реальный compiler PID завершён, прежняя страница доступна. Production default остаётся 90 секунд.

Замеры обычных примеров из принятой Task 3 переиспользованы при неизменных build pipeline, примерах и проверенном серверном bundle: ROI — 8,311 с / 607 050 байт; channel-summary — 3,981 с / 231 530 байт; campaign-summary — 3,322 с / 578 031 байт. Все успешно собраны при 1 ГиБ и 256 процессах; отдельные peaks памяти/процессов примеров не измерялись. Минимальный запас — 10,8 раза по времени и 34,5 раза по результату; оснований менять начальные лимиты не выявлено.

Evidence хранится в `$M4_SCRATCH/task5-*`; команды и точная граница каждой проверки — в локальном отчёте Task 5. Browser shell проверяется как rebuilt source bundle под закреплённым Chromium. Контейнерные проверки использовали собственный image с побайтным совпадением серверного bundle; это не установленная приёмка Desktop/CLI. Исторический Knowledge UNKNOWN сохраняется. Tasks 6–7, миграция, push/merge/release этим этапом не выполнялись.

Итоговые проверки Task 5: dashboard package 27 web + 68 остальных, folder/publish 44, shell browser 43, build 67, Host 71, runtime 19, Desktop 5, opencode 27, App browser 2 и unit 59, UI 23 — PASS. Web coverage: 97,13% строк / 96,30% функций. Dashboard typecheck/build PASS; остальные package typecheck переиспользованы из Task 4 при неизменном коде. После адресного исправления длинной диагностики browser regression повторён и прошёл; остальные результаты не повторялись. Измеренный бюджет оболочки обновлён после narrow independent review Approved/0 mandatory; фактическое измерение и запас — в [check-size.ts](../../../packages/dashboard/script/check-size.ts). Проверка размера PASS, runtime/security лимиты прежние. Следующий gate — независимый полный review Task 5.
