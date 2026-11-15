# Dashboard M4: публикация через хранилище

Статус: Task 0 готовит отдельную базу и ресурсы для реализации. Это не приёмка M4. База хранится только в [checkpoint M4](dashboard-m4-checkpoint.md); контракт и последовательность — [дизайн](../../superpowers/specs/2026-11-14-dashboard-m4-design.md) и [план](../../superpowers/plans/2026-11-14-dashboard-m4.md).

M3 завершена: установленная Linux-приёмка, CI и независимые ревью PASS. Её результаты, ограничения URI dispatch/Windows/macOS и исходные артефакты сохраняются в [runbook M3](dashboard-m3.md). Они не подтверждают новый M4. Первый проверяемый результат реализации — закрытый host-вызов через авторизованную Studio на обеих версиях, затем публикация проверенных исходников до `ready` и открытия Dashboard.

## Собственные ресурсы

Выделены две новые пары Server/Studio: `dashboard-m4-master-{server,studio}` и `dashboard-m4-release-{server,studio}`. В каждой паре собственная сеть с соответствующим суффиксом `-net` и named volume `-userstorage`, смонтированный в `/workdir/UserStorage` с самого создания сервера. Использованы уже доступные образы из рецепта [стенда](../../../dashboard/stand/README.md) и опытов S1/S2: master build 5579, client/server 7.4.2 с необходимой libxml2. Исходные образы не менялись. Метка принадлежности новых сетей, томов и контейнеров — `codex.owner=dashboard-m4`.

Studio опубликованы только на свободных loopback-портах, Server наружу не опубликован. Старые DNS-имена серверов остаются aliases только внутри собственных сетей, поэтому Apache направляет WebSocket в свой Server. Master предоставляет минифицированный `/app/` и `/app-debug/`; 7.4.2 — минифицированный `/app/`. Реальные порты, IDs, images, private Studio configs и команды хранятся в приватном scratch вне Git (`stands.json`, `master.json`, `release.json`, `environment.sh`). Ниже они передаются переменными окружения.

В scratch заранее созданы раздельные каталоги `profiles/<stand>/{desktop,cli,browser}`. Desktop запускается с собственными HOME/XDG; CLI — со своим `LOGINOM_AI_AGENT_CLI_PROFILE`; браузер — с новым профилем. Короткий `TMPDIR` и закреплённые инструменты приходят из проверенного окружения M3. Не подменять общий HOME профилем приёмки и не использовать старый SDD environment. Proxy использует порт 10808 с обходом loopback; Docker daemon не перенастраивается.

Все существовавшие до подготовки контейнеры сохраняются, включая остановленные. Их IDs, состояние и StartedAt записаны приватно до/после. ROI, исходные LGP/CSV, резервы M3 и основной checkout не меняются. `dev-master.sh` M3 жёстко привязан к прежним именам/портам, поэтому его `install` здесь не запускается; первый полный проход с установкой dev-компонентов выполняется в Task 3, итоговая поставка и миграция — в Task 7.

## Подготовка и команды

В приватном терминале перед командами загрузить проверенное окружение, затем M4-переменные:

```sh
source "$ACCEPTANCE_ENVIRONMENT"
source "$M4_ENVIRONMENT"
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

Права проверены собственными ACL fixtures: master read-only читает, запись возвращает `DASHBOARD_ACCESS_DENIED`; 7.4.2 no-access возвращает тот же код до записи. Отмена во время login проверена временной паузой только своего Server: `DASHBOARD_CANCELLED`, Chromium завершён, ACK + exit 0, Server возобновлён в finally. Последняя сборка прошла все 10 live-сценариев с подтверждённым cleanup. Stale expected возвращает `changed` без создания файлов.

Task 1 передан на независимое review со статусом **DONE_WITH_CONCERNS**. В одном более раннем master-прогоне Knowledge child подтвердил close ACK, но не завершился и был остановлен SIGKILL; общий cleanup именно этого прогона **не подтверждён**. Две focused проверки исходной сборки с внешней диагностикой — no-browser и тот же rights-master цикл — завершились штатно. Причина единичного сбоя неизвестна; повторный успех не объявлен исправлением. Knowledge code и гарантия ACK + actual exit не изменены; исходный failure и diagnostic evidence сохранены для reviewer.

Source проверки: границы origin/generation, profile/call/admit, UTF-8/лимит, monotonic UTC, повторные короткие чтения, отмена запуска/операции, held generation/settings pending и shutdown. Отдельный `turn-lifecycle` test сохраняет отсутствие lease у обычного dashboard model-turn. Host suite 63 PASS; после последних изменений focused suite 31 PASS и typecheck PASS; runtime 19 PASS, turn-lifecycle 9 PASS. Точные RED→GREEN команды и локальные ссылки на evidence находятся в отчёте Task 1; raw scripts/configs/logs остаются в `$M4_SCRATCH`, вне Git.
