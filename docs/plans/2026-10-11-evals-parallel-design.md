# Параллельные evals: один Loginom Server, отдельный пользователь на слот

Дата: 2026-10-11; переработано 2026-10-13. Статус: **направление принято,
реализация не начата**. Исследованный код: `evals-parallel@ef06b6e9b2dba8b0da58c6063d350918ee66dd59`.
Этот документ заменяет прежнее решение об отдельной паре контейнеров на слот.
[Проверка замечаний](2026-10-11-evals-parallel-design-review.md) и
[детальный план реализации](../superpowers/plans/2026-10-13-evals-parallel-users.md).

## 1. Решение и границы

Один доверенный процесс harness обслуживает общую очередь на одном выделенном
Loginom Server через общую Studio. У каждого слота — уникальный пользователь
Loginom, отдельные CLI-профиль, browser runtime, workspace, история и закрытый
архив. Весь сервер выделен этому run. Разделение пользователей внутри run не
разрешает одновременно запускать прежние исполнители с широкой очисткой.
Координатор сохраняет один run и один summary.

Harness автоматически подготавливает и проверяет пользователей, права, личные
каталоги, профили, подключения, credentials, блокировки и восстановление.
Отдельный скрипт harness создаёт выделенную пару Server/Studio до prepare;
prepare затем проверяет её глобальную конфигурацию и готовит пользователей.
Пользователи и профили переиспользуются; дорогая подготовка выполняется до
dispatch, а не перед каждой попыткой. Направление уже принято владельцем.

Сохраняются общая очередь без барьера между кругами, retry на том же слоте,
независимый release исправных слотов, node-evals и чтение legacy summary.
Слот занят до завершения агента, судьи и cleanup. Отдельной очереди судей нет.
Авторизация модели поставляется временным переносом `shared-oauth`; она не
заменяет ни пользователей Loginom, ни авторизацию судьи `codex exec`.

В этот этап не входят распределённый scheduler, интеграция координатора Multica,
продолжение обычного run после падения harness и объединение runs (задача №7).
Исторические результаты и закреплённые условия текущих серий сохраняются.
Сейчас меняются только документы; создание пользователей, перенос коммитов,
сборка, запуск моделей и изменение действующих стендов не выполняются.

## 2. Основания и границы доказательств

Доказательства находятся в
`/home/kiselev/.codex/experiments/loginom-users-20261013-50e5f473/`.
Прочитаны `cli-evidence.json`, `parallel-evidence.json`, `export-evidence.json`,
`regeneration-evidence.json`, `safe-cleanup-evidence.json`, `provenance.json`,
`cleanup-receipt.json`; пять хэшей evidence из receipt совпали. Receipt фиксирует
удаление экспериментальных контейнеров, сети и частных CLI-профилей: это
историческое доказательство, а не текущий подготовленный стенд.

Условия: Loginom **7.4.2**, установленный CLI **0.1.17**, source
`5588651a291c59f53d1c14941d5ba768071a0018`, server image
`sha256:d138ce018adb4959282e65f5e5b7fe58265706d6c8c5a432022e4400ca387d1a`,
Studio image `sha256:69ce44ac1002dea3d3a78b5e35eb9175a352530ecd3f05bdb727d63895004e28`.
В эксперименте **0 model calls и 0 judge calls**.

| Evidence | Подтверждено | Не следует из результата |
| --- | --- | --- |
| `cli-evidence.json` | Отдельные профили eval-a/eval-b: общий URL Studio, успешные setup/check | Приёмка будущего shared-OAuth кандидата и полного LLM-eval |
| `parallel-evidence.json` | По 12 выполнений A/B, перекрытие 1282 мс; после убийства браузера A ещё 30 успешных запусков B | Принадлежность Chromium-процессов в harness supervisor |
| `export-evidence.json` | Свои операции успешны; чужой export дал `cross_write.ok=false` и общую ошибку активации | Точная ACL-причина отказа или безопасность всех серверных компонентов |
| `regeneration-evidence.json` | Оставшаяся сессия A вновь создала `calc.lgp.autosave` после удаления, когда проба включила `set_PackageAutoSavePeriod(1000)` | Автосохранение по умолчанию (оно выключено); browser exit или pending disconnect достаточны для cleanup |
| `safe-cleanup-evidence.json` | Адресное закрытие A и readback, очистка A; 60 выполнений B, хэши файлов B сохранены; A пуст 12 с | Универсальный timeout 12 с, immutable session identity или адресность SessionBackup |

Владелец также подтвердил разделение личных файлов и отрицательные проверки
чужого чтения, записи, копирования, импорта/экспорта и обхода `../`.
Приёмка повторяет всю матрицу с положительными контролями и отдельным evidence;
одно сообщение об ошибке узла не доказывает весь набор запретов.

Закрытие A выполнено из **браузерного контекста администратора**:
`ScopeGetObjectAsync(session, IBGDeductorSessionsManagerContainer)` →
`GetSessionsManager()` → `UpdateSessionInfos()` → `SessionInfo(i)` →
`CloseSession(target, 5000)` → повторный листинг. Target выбран по точному
`Name='eval-a:1'` с проверкой единственности. У B одновременно были две сессии,
включая pending disconnect. Это не самостоятельный HTTP API и не доказательство
одной сессии на пользователя. `SessionBackup` в provenance: **NOT_REPRODUCED**.

## 3. Конфигурация и владение ресурсами

`--parallel N` — положительное целое, default 1. `EVAL_SLOTS_FILE` — JSON версии
2; ранее предложенная версия 1 не реализована и не интерпретируется как v2.
Общие поля `server`: `container`, `studioContainer`, `url`, `network`, `alias`,
`storageRoot=/workdir/UserStorage`, `backupRoot=/workdir/SessionBackup`.
`url` — URL Studio; roots — пути внутри контейнера. `controller`: абсолютные `stateDir` и `adminCredentialsFile`.
`auth.sharedDir` — canonical каталог общей model OAuth-авторизации.
`judge.codexHome` — отдельный private каталог судьи, не `~/.codex` Desktop.
`slots`: `id`, `username`, абсолютные `profileDir`, `workspaceRoot`, `historyDir`.
Паролей в файле слотов нет. User roots, идентичность пользователей и credentials
фиксируются доверенной подготовкой в закрытом manifest, а не берутся от агента.

Первые N записей — активный набор. N больше числа слотов — ошибка. Неисправный
слот не заменяется, N автоматически не уменьшается. Если jobs меньше N,
проверяются выбранные N, занятых pipelines будет меньше. Весь файл проверяется
на дубликаты/пересечения путей; credentials читает только controller для активного
набора. С файлом `--parallel 1` проходит новый путь. Без файла сохраняется legacy
singleton; N > 1 запрещён. Legacy путь не работает с новым marker v2.

Модель, variant, tasks, rubric, CLI binary/manifest, Dock, судья и timeout общие
для run. Для новых eval-прогонов `loginom-ai-agent-cli` обязательно использует
`openai/gpt-6-luna` с variant `high`; судья `codex exec` — `gpt-6-sol` с reasoning
`xhigh`. Эти значения закрепляются в manifest и одинаковы при N=2 и N=1.
Исторические результаты сохраняют исходные model/reasoning pins.
Профили нельзя клонировать вместе с БД, WAL, recovery или browser runtime.
История каждой попытки и initial retry архивируется вне mounts до следующего
задания. Общий model OAuth store — отдельное writable-исключение; архивы,
соседние профили и admin state агенту недоступны.

`stateDir` — 0700, вне checkout, профилей, workspace и результатов. Здесь journal подготовки/операций, credentials 0600, ACL snapshots, ownership
manifest и ссылки на leases. Server-run fence и per-user/per-profile leases
расположены в фиксированном постоянном host-global `/var/lib/loginom-evals/locks`
(не в очищаемом при reboot `/run/lock`); stateDir или
XDG-переменная не могут перенести блокировку. Владелец один раз создаёт lock root:
`sudo install -d -m 0700 -o kiselev -g kiselev /var/lib/loginom-evals /var/lib/loginom-evals/locks`.
Prepare проверяет owner/mode, не вызывает sudo; отсутствие root даёт отказ до мутаций.
Lock-функции принимают root аргументом: CLI использует константу, unit-тесты — temp;
env/config override запрещён. Lease включает run/slot, PID + starttime,
**immutable container ID и пользователя**, server generation (`StartedAt` и
подтверждённую эпоху соединения). Один container ID не обнаруживает restart
того же контейнера. Имена контейнеров служат входом inspect, мутации идут по ID.
Отсутствующий PID или timeout не разрешают stale takeover.

`serverEpoch` — вычисленный controller hash версии схемы, полного container ID,
Docker StartedAt, host boot ID, daemon PID/starttime из `/proc/1/stat` внутри
контейнера. Для закреплённого image проверяются PID 1 `/app/loginomd` и entrypoint;
нечитаемая/неоднозначная identity запрещает операции. Это не Loginom RPC-поле и не
новый случайный UUID каждого prepare. Reconnect admin меняет generation его
proxy handles, сохраняя отдельную проверку epoch серверного процесса.

Владение разделено на OS guard и durable reservation. Guard — exclusive flock
по стабильному resource key; FD не наследуется детьми и закрывается при выходе
controller. Reservation с token/ownership epoch и ссылкой на journal сохраняется
на диске. Свободный guard после аварии не снимает запрет нового запуска.
Обычные prepare/verify/run при unresolved reservation дают RECOVERY_REQUIRED.

Standalone prepare/verify на успехе завершают свои probe/management/admin sessions
и процессы, сохраняют evidence, записывают durable released, затем отпускают guards.
Readiness receipt не резервирует среду. Run заново приобретает владение и проходит
admission; его внутренний prepare сохраняет владение до завершения pipelines.
На ошибке FD освобождаются, но неопределённые reservations остаются для recovery.

Внешний recover при живом controller возвращает BUSY. При аварии он берёт те же
server/profile/judge guards, сверяет цепочку владения от исходного incident до
актуальной reservation и её owner по boot ID, PID/starttime. CAS по актуальному
token/revision принимает запись в новый epoch **только для recovery**. Повтор после
аварии самой recovery использует ту же проверенную цепочку, а не старый token. Это не
разрешение dispatch/delete: surviving children, архив, server sessions и storage
проверяются отдельно. После proofs записывается released tombstone; неопределённость
сохраняет fence. Восстановление одного слота не снимает чужие retained reservations.
Повтор для уже released слота не трогает его данные, но завершает оставшиеся общие
admin/judge/server ресурсы incident; новое владение другого run не принимается.
Полная таблица переходов и проверки цепочек команд — в плане реализации.

Маркер `/workdir/.loginom-evals-isolated.json` получает несовместимые со старым
cleaner `kind: loginom-evals-users`, `version: 2`, container identity и перечень
управляемых user roots/ownership. Его записывает create новой пары; prepare сверяет
с journal и изменяет только принадлежащий inventory под server fence. Старый guard
уже ожидает kind/version 1; тест реального cleaner подтверждает отказ и сохранность
файлов на v2. Новый lock сам по себе старый код не останавливает. Миграция eval-tests
через `R/operations/stand.lease` остаётся legacy-only, свежая пара её не требует.

У Loginom User в исследованном интерфейсе нет immutable ID. Идентичность в
manifest — точные name/kind, версия создания/владения и server generation.
Нельзя удалить и заново создать login ради idempotency: прежняя папка и задания
планировщика могут наследоваться новым пользователем с таким именем.

## 4. Автоматическая подготовка и интерфейсы

Одна команда `parallel-env.ts prepare` согласует желаемую конфигурацию с
наблюдаемой средой; `run.ts` вызывает тот же идемпотентный pipeline до dispatch.
Prerequisites — Docker-доступ controller, локальные закреплённые образы,
ОС-bootstrap каталогов, установленный CLI и закрытый bootstrap credential администратора.
Harness выполняет настройки eval-среды. Получение лицензии, исходных админских
прав и интерактивное согласие OAuth не выдумываются программно: отсутствие
prerequisite даёт диагностируемый отказ до попыток.

Хост реализации/приёмки — `lg-pc-75` (10.200.2.58), Ubuntu 22.04.5, 12 CPU,
38.47 GiB RAM; MemAvailable при проверке 2026-10-13 около 9 GiB. Ресурсный бюджет
определяется свежими измерениями, не общей RAM. `10.200.13.152` и миграция remote
eval-tests через `R/operations/stand.lease` остаются legacy вне этой работы.
Новая пара создаётся скриптом `parallel-pair.ts` из локальных Server
`d138ce018adb` и Studio `69ce44ac1002` с закреплением полных image IDs.
Пара эксперимента удалена; `loginom-evals-isolated` и dev-пара не переиспользуются.

Create использует собственную network с alias `loginom-server-7.4.2-test`, не
занятую dev-сеть `loginom-net`. Только Studio публикует свободный loopback-порт
(`127.0.0.1:32771` в snapshot); `restart=no`, без mounts. До первого start
записываются Studio `/usr/local/apache2/initial-content/server.json` с boolean
`wsproxy=true` и Server `/workdir/Components.cfg` с Python Disabled=true.
Studio entrypoint копирует initial-content в htdocs: после start проверяется
served config и фактический route, чтобы не попасть на dev `127.0.0.1:8080`.
Create также записывает marker v2 до допуска; повторное создание сверяет ownership
journal/IDs. До появления ID provision guards берутся по Docker-daemon identity и
отдельным именам сети/контейнеров, затем по server ID; разные stateDir не обходят
эту блокировку. Create выдаёт только infrastructure-ready (config/HTTP/DNS),
фактический browser/CLI route доказывается задачами 2–3 с учётом sessions.
Destroy адресен, не является способом восстановления слота.
Отдельная research pair служит опытам с SessionBackup/restart, acceptance pair
для них не используется. Подробные команды и checks — задача 1а плана.

| Операция | Интерфейс и права | Readback / неопределённый исход |
| --- | --- | --- |
| Container identity, route, images, server config | Программно: Docker inspect/exec/read-only files; Docker-доступ controller | ID/generation, digest, mounts, единственный backend alias, `wsproxy=true`, DNS Studio→server, отсутствие backend/CDP наружу; изменение generation снимает допуск |
| Создание пары и начальная политика Studio/Server | Программно: отдельный Docker create/cp/start скрипт до prepare, JSON/XML parser, private journal/labels/full IDs; только Docker controller | До первого start задать wsproxy=true, Python-disabled и marker v2; read-back после start. Prepare только проверяет глобальные настройки; drift/unknown запрещает dispatch. Чужие или уже действующие пары не изменяются |
| Lease, marker, private state | Программно: Bun fs, exclusive create, atomic rename; private owner | Права, отсутствие ссылок/пересечений, receipt; незавершённая запись сверяется с journal, чужой lease не удаляется |
| Пользователь и права | **Playwright**: `Session.GetUsers()`, enumerate, `Add(name, dukUser)`, async setters, `SetPassword`; admin Loginom | Exact name/kind + manifest, getters всех прав и вход CLI; timeout → enumerate/readback, без слепого Add или смены пароля; чужое совпадение — отказ |
| Общие каталоги, группы и Everyone | **Playwright**: `Session.GetSharedDirectories()`, `get_Permissions()`, `GetEnumerator/Add/Delete`; admin | Полный readback списка допущенных users/groups и отрицательные операции; семантику массива int32 квалифицировать fixture. Только управляемые ACL; небезопасный чужой объект — отказ, не массовое изменение |
| Личный каталог | Программно: Docker exec по ID, проверенный `UserStorageDirectory + login`, mkdir с POSIX-владельцем server service | lstat/realpath/тип/owner, нет symlink/вложенности; файл положительного контроля появляется только в своём root; очистка контроля тоже после session fence |
| CLI profile и подключение | Программно: установленный CLI, `LOGINOM_AI_AGENT_CLI_PROFILE`, `loginom setup --stdin-json --format json`, status/check | ready, точные URL/user, binary/manifest; timeout → status/readback; готовый профиль с чужим URL не принимать и не reset вслепую |
| Model OAuth | Программно: capability/shared-store readiness; штатный providers login при bootstrap | Не выводить токены. Нужное согласие аккаунта → `AUTH_REQUIRED`, подготовка возобновляема; общий store вне cleanup |
| Серверные сессии | **Playwright**: SessionsManager RPC из раздела 2; admin, одно доверенное соединение/run | Только owned свежие proxy rows; ответ CloseSession недостаточен: актуальный список, отсутствие операций/locks; disconnect/timeout → чтение/reconciliation, не слепой повтор |
| Artifact и архив истории | Программно: Docker cp/текущий artifact reader, Bun fs; controller | Scoped source, хэши и принадлежность slot/attempt; сохранить до удаления |
| Очистка user root | Программно: Docker exec по ID, безопасная передача args и NUL-safe обход | Только после session fence; hidden/обычные/нестандартные имена, `.autosave`, без следования ссылкам; полный листинг и наблюдение без регенерации; uncertain → quarantine |
| SessionBackup | Пока программный read-only inventory; mutation после квалификации раздела 7 | Неизвестный backup не удалять; пустота не доказывает адресность |

Административного standalone CLI/API в исследованных Dock/runtime не найдено.
Generated RPC Studio требуют browser session; `page.evaluate` не делает их
независимым API. На 7.4.2 используется этот Playwright adapter. Если конкретный
RPC отсутствует — детерминированный UI script с закреплёнными selectors и
readback; несовместимость версии даёт отказ, не угадывание элементов.

У Users: `GetEnumerator(dukAll=7)` (в наборе флагов `dukUser=1`),
`Add(name, dukUser=0)` (одиночный kind), локальная auth
`uamLocal=1`; `SetPassword`, setters/getters `IsViewer`, `IsDesigner`, `IsAdmin`,
`Blocked`, `UseGlobalFileStorage`, `SchedulerFullAccess`, `AllowPublish`, `AuthMode`.
Permissions — список пользователей/групп, а не выдуманные View/Add/Modify bits;
`Add/Delete` принимают массив proxy и возвращают массив int32; смысл элементов ещё требует fixture. Everyone проверяется
и как явное разрешение общей папки, и через применимые группы пользователя.

Один admin context создаётся лениво для операций, которым нужен браузер, и
переиспользуется после проверки identity/состояния. Мутации сериализуются короткой
критической секцией; вычисления слотов и LLM не блокируются на время всей попытки.
После reconnect старые proxy handles отбрасываются, readback выполняется заново.
Bundle берётся из проверенных ресурсов установленного CLI: manifest → bundled
Node/Chromium, `runtime/client` с `playwright-core`. Developer `node_modules` и
случайный browser binary не используются. Playwright работает через pipe, без
TCP CDP. Trusted admin launcher входит в общий реестр supervisor отдельно от слотов.

Bun harness запускает отдельный `script/loginom-admin-driver.mjs` через bundled
`bin/node`. JSONL v1 по private stdin/stdout: id/op/expectedIdentity/deadline,
ответ confirmed/not_applied/unknown с тем же id. Только allowlisted операции;
generic evaluate в протоколе нет. Intent сохраняется до отправки; EOF/timeout
после mutation означает unknown и read-back, не replay. Credentials-file path
передаётся по pipe, секрет не попадает в argv/env/logs. Один driver/context на run.
RPC sources до реализации adapter сохраняются вне `/tmp` с image/path/SHA inventory;
при потере временной копии извлекаются из закреплённого Studio image без start.

При создании user сначала удерживается явно `Blocked=true`: задать AuthMode,
пароль и права, прочитать их обратно, затем разблокировать последней операцией.
Назначение роли может снять неявную блокировку; переход LDAP/OpenID→Local
сбрасывает пароль. У уже local user повторный prepare не вызывает setter AuthMode.

Намерение записывается до мутации, подтверждение — после readback. Пароль
генерируется и сохраняется в private store до создания пользователя; повторный
prepare его не меняет. Чужой пользователь/каталог с тем же именем не присваивается.
Удаление пользователей и сброс паролей не входят в обычный cleanup. Повторный
prepare при активном чужом lease возвращает BUSY без изменений, при неизменной
свободной среде переиспользует объекты. Readiness — опрос состояния с deadline,
а не фиксированный sleep. Подробные операции и команды — в плане реализации.

## 5. Допуск и изоляция

До **первой** попытки проверяется весь активный набор. Любой неисправный слот →
exit 2, ни одной попытки и measured summary; redacted preparation evidence
сохраняется отдельно. Освобождаются только собственные неиспользованные/очищенные
резервы; неопределённые остаются для recovery.

Проверяются:

1. Server-run fence, user/profile leases, marker v2, ID/generation, отсутствие
   старых broad-cleanup executors на том же сервере.
2. Маршрут общей Studio к выделенному Server. HTTP 200 и успешный `loginom check`
   сами по себе маршрут не доказывают; контрольный файл должен появиться в
   назначенном root подтверждённого контейнера.
3. Уникальные eval-users: designer разрешён, admin и `UseGlobalFileStorage`
   запрещены, scheduler full access/publish выключены. Нужные viewer/design права
   проверяются контрольным выполнением. Группы/Everyone не дают общих мест записи.
4. Нет чужого чтения/записи/копирования/импорта/экспорта и абсолютного/`../` обхода.
   Сохраняются ограничения небезопасных серверных компонентов, включая Python
   из isolation-контракта. Проверить допускаемые способы серверного file access
   на закреплённой сборке; UI-скрытие кнопки не является ACL.
5. Разные canonical profiles/workspaces/archives, без ссылок и вложенности.
   Bubblewrap открывает только текущую попытку, свой профиль, ресурсы продукта
   и отдельно общий model OAuth store. Admin credentials/cookies/state, чужие
   credentials, harness, judge, корпус, результаты и архивы вне mounts/env.
6. Точные username/URL профиля, model OAuth и отдельный judge готовы; свой root
   чист, неподконтрольных серверных сессий нет. Глобальная пустота UserStorage
   больше не требуется: файлы B не блокируют A. Backup gate — по разделу 7.

ACL не разделяют host `/proc` или сеть CLI. Доступ к общей Studio ожидаем;
защита — серверные права и недоступность чужих credentials. Файловая sandbox-граница
и запрет inspector/CDP сохраняются. Без доказанной процессной границы live запрещён.

Полная подготовка/отрицательные ACL-пробы кэшируются по verified fingerprint:
binary/manifests, images, generation, route/config/ACL snapshot hash и user/profile
identity. Не предполагается несуществующий server revision API: короткий readback
значимых настроек/прав выполняется перед dispatch **каждого run** и выявляет дрейф.
При совпадении со сохранённым успешным fingerprint повторно используются результаты
дорогих ACL-проб; при отсутствии receipt, изменении snapshot, recovery или потере
достоверности управления повторяется квалификация затронутой части. Внешние изменения выделенной среды во время run
не входят в допустимый режим эксплуатации. На попытку — короткая проверка lease, generation, session journal,
своего root и backup inventory. Изменение среды/recovery снимает готовность и
требует повторной квалификации затронутой части до dispatch. Пользователи,
профили и admin browser не создаются заново перед каждой попыткой.

И initial preflight, и проверка внутри binary `runAttempt` имеют отдельную v2
ветку по configured network/alias и своему root. Старые `loginom-net` и требование
пустоты всего storage остаются только legacy; рабочие файлы B не блокируют A.

## 6. Очередь, серверные сессии и cleanup

Jobs заранее строятся в порядке «круг 1: все задачи; круг 2: все задачи…».
Свободный слот атомарно берёт стабильный индекс до асинхронного запуска.
Барьер отсутствует; одна задача может выполняться одновременно разными users.
Ctrl+C не обещает полного первого круга. Изменяемые данные pipeline принадлежат
слоту. Admin handles/secrets принадлежат controller, не SlotContext/agent config.

Состояния: `unprepared → preparing → ready → running → draining → cleaning →
ready/released`; неопределённость → `quarantined`. Перед первым соединением
подтверждается отсутствие чужих сессий выделенного пользователя. Journal учитывает
**все** его сессии: setup/check, runtime, recovery и pending disconnect.
`summary.session_id` — ID агентской сессии, не серверной сессии Loginom.

ManagedSessionInfo содержит Name/CreateTime/SessionType/Role/PendingDisconnect,
но не Guid/UserID. У собственной Session есть Guid; связь с proxy менеджера
не установлена. До destructive adapter квалифицировать привязку server generation
+ leased username + точные Name/CreateTime + свежий proxy, либо найти более сильный
подтверждённый интерфейс. Проверить reuse имён, reconnect и гонки. Display name,
префикс username и PendingDisconnect сами по себе недостаточны. Неожиданная
сессия/неясная принадлежность → никаких close/delete, evidence и карантин.

Порядок попытки:

1. Агент в своём sandbox, измеренный исход, подтверждённое завершение собственных
   локальных процессов.
2. Извлечение artifact/diagnostics, judge и сохранение результатов до destructive
   cleanup. При аварии сохранить доступные доказательства.
3. Нужные management/recovery, затем повторное подтверждение остановки всех
   локальных writers. Архив истории, БД/WAL/SHM и inputs сохраняется с durable
   manifest/receipt **до** закрытия server sessions. Management-команды могут
   открыть новые соединения; все они учитываются до этого шага архивирования.
4. Администратор закрывает только достоверно собственные серверные сессии;
   дождаться исчезновения из свежего списка и прекращения своих операций/locks
   открытых пакетов. Неизвестный исход запрещает удаление.
5. Повторно проверить ID/generation, marker, lease, user→root, backup gate;
   удалить только содержимое своего root, включая обычные и скрытые файлы,
   нестандартные имена, `.autosave`. Не ограничиваться `eval-<run-id>-*`.
6. Полный листинг и отсутствие регенерации за квалифицированный интервал с учётом
   поведения сервера/autosave; сохранить receipt. 12 с эксперимента не являются
   универсальной гарантией. После fence не выполнять loginom check/recover,
   способный открыть новую сессию.
7. Только после подтверждённого cleanup — допустимый infra retry на этом же
   слоте, новое задание или независимый release user/profile leases.

При неопределённом server close готовый архив сохраняется, серверные файлы остаются
нетронутыми, слот удерживает reservation без retry/release. При archive I/O failure
или SIGKILL между переносами сохраняются исходники и частичный архив; recovery
согласует manifest по обеим сторонам. Committed архив повторно не заменяется
пустым. При живом writer или незавершённом CLI recovery история не перемещается;
диагностическая копия помечается неполной. Best-effort закрытие доказанно собственных
сессий допустимо для остановки операций, но ошибка архива всё равно запрещает
удаление серверных файлов и release.

В нынешнем `run.ts` artifact/orphan удаляются до `afterAttempt`; в новом пути
**все** удаления (`cleanupArtifact`, `cleanupOrphanResult`, sweep) переносятся за
server-session fence. Замены одной функции широкого rm недостаточно. Имена файлов
не разбираются по newline/tab и не вставляются в shell; обход не следует symlink.
Пустой per-run listing не равен полной чистоте root.

Retry сохраняет task/attempt, prompt, result name и `infra_retry.initial`;
одно логическое измерение не удваивается. Замена по job index, не по последнему
элементу массива. Ошибки качества не дают retry. Pipeline пишет только собственный
`<run>/<task>/<attempt>`; coordinator ожидает все pipelines и пишет summary/report
в устойчивом порядке. Неназначенные jobs не получают выдуманных измерений.

## 7. SessionBackup и восстановление

До живой приёмки нужен отдельный немодельный опыт на disposable сервере:
создать **непустой** SessionBackup; установить формат, owner/session/generation,
поведение при crash/reconnect и нескольких users; доказать, что cleanup A не
меняет B и не восстанавливает чужой пакет. Если адресности нет — исследовать
реальное отключение backups через server config/API и проверить crash/recovery.
Допустимы два квалифицированных режима: доказанная адресность и cleanup либо
доказанное безопасное отключение. До одного из результатов полный live допуск
закрыт; разработка очереди и read-only инструментов может продолжаться.

Общий `rm /workdir/SessionBackup/*` запрещён. Пустой снимок не доказывает
адресность. Inventory не удаляет данные. Backup с подтверждённым owner A блокирует
A до безопасного recovery; неизвестная общая принадлежность/влияние запрещает новый
dispatch на сервере. Активный B корректно завершается, если его безопасность
по-прежнему доказана. Никакого удаления чужих или неопознанных backups.

После crash controller восстанавливает leases/journal, сверяет identities,
завершает только собственные операции и затем чистит своё пространство.
Это recovery среды, а не повторение модельного запроса или resume измерений.
`parallel-env.ts recover --slot <id>` требует новые process/session/cleanup proofs;
исчезновение PID не снимает карантин. Общий сервер ради одного слота не
перезапускается. Неясный исход сохраняет данные, lease и evidence.

## 8. Отказы и локальные процессы

| Событие | Поведение |
| --- | --- |
| Отказ допуска выбранного слота | Ноль попыток; exit 2, preparation evidence без measured summary |
| PASS/FAIL/timeout/no_artifact | Сохранить исход, продолжить после cleanup |
| Допустимый infra error | Один retry на том же слоте после cleanup |
| Локальный stop/harness_error или неизвестный cleanup A | Карантин A, evidence/нужные leases; здоровый B продолжает очередь |
| Потеря admin control plane, общая изоляция/backup/persistence неизвестны | Запретить новые задания/retry, дождаться безопасного завершения pipelines; не удалять неподтверждённое |
| Первый Ctrl+C | Прекратить dispatch/retry, прервать agent/judge, дождаться cleanup, записать summary; exit 0 при безопасной пользовательской остановке |
| Повторный Ctrl+C | Exit 130 без гарантии summary; доступные leases/evidence остаются для recovery |

Карантин даёт exit 1 и stopped_reason, даже если B завершил очередь. Когда все
слоты на карантине, неначатые jobs не материализуются. Общий server fence остаётся
до разрешения активного/неопределённого владения; чистые user/profile leases
освобождаются независимо от exit code. Другой run не получает общий сервер.
При отмене judge/cleanup уже измеренный исход сохраняется.

Пользователи Loginom не доказывают принадлежность Chromium. Обязательный отдельный
тест: два slot launcher и trusted admin launcher, один browser bundle, helpers
без user-data-dir, reparent, переписанный title, SIGKILL. Реестр использует
PID/starttime и доказанные ancestry/birth identities; argv/PGID/строка пути не
разрешают убивать или игнорировать процесс. Unknown process сохраняет запрет
cleanup. Оба supervisor находятся в **общей** чистой PID-границе; разные namespaces
скрыли бы проверяемую гонку. Исправление выбирается по воспроизводимому тесту.
Длительность poll не измеряет задержку начала следующего poll.

## 9. Авторизация, summary и совместимость

Три независимых вида доступа:

- **Loginom:** eval-user на слот, admin credential только у controller.
- **Модель:** общий OAuth store на хосте и установленный кандидат из shared-oauth;
  коммиты и адаптация сохранены в
  [пункте 4 ревью](2026-10-11-evals-parallel-design-review.md#4-временно-перенести-общую-oauth-авторизацию-из-shared-oauth).
- **Судья:** native codex exec со своим CODEX_HOME и авторизацией. В первой версии
  общий mutex на вызов судьи в run; слот ожидает и остаётся занят. Это не новая
  очередь. Judge не получает model shared store/Loginom secrets; копирование
  refresh token по слотам не решает конкуренцию. До dispatch берётся host-global
  lease canonical CODEX_HOME в `/var/lib/loginom-evals/locks`, чтобы runs на разных
  серверах не обходили mutex. Lease освобождается после подтверждённого завершения
  всех собственных judge-процессов, не по одному отсутствию PID.

Для судьи создаётся `/home/kiselev/.local/state/loginom-evals/parallel/judge-codex`
(0700), владелец один раз выполняет `CODEX_HOME=<этот каталог> codex login --device-auth`.
Harness передаёт home только judge child; preflight/version/exec используют одно
effective judge env. Наличие auth в Desktop `~/.codex` не удовлетворяет admission.
Global lease действует среди harness controllers, не блокирует Codex Desktop.
Когда run не вызывает судью (`--skip-judge`/code-only node-evals), его auth и lease
не требуются; это не отменяет model и Loginom admission для живого агента.

Shared OAuth требует env allowlist, bind всего canonical store RW, адаптации
assertAuth, capability/manifest и нового установленного EVAL_CLI_BIN. Сначала
штатный login с generation metadata; ручной перенос auth.json недостаточен.
Неопределённый refresh не повторяется старым токеном. Продуктовая интеграция OAuth
— отдельная зависимость live v2 evals, подробности сохранены в ревью.

Выбран HTTP-only режим: перенос `66f0956bc9f16ee580b20f3cf98e368857048f27`
и `LOGINOM_AI_AGENT_EXPERIMENTAL_WEBSOCKETS=false` через оба env-фильтра обязательны.
В переносимый набор также включён отдельный password-focus fix
`3bcf645a7363b41aed709b985a63758431abeee6` из принятого round4 artifact.
На этом хосте проверенный prod `5588651a…` не имеет shared-oauth-v1. Основной чат
собирает/устанавливает отдельный кандидат от `loginom`, не заменяя prod, проверяет
`verify-cli-candidate --shared-oauth` и закрепляет realpath/SHA. Только shared sandbox
GREEN и live ждут его; конфигурация, non-model adapter и fixture scheduler — нет.

Временные cherry-pick shared-oauth сохраняются отдельными коммитами зависимости
с происхождением исходных SHA. Все адаптации, которые можно выполнить поверх
продуктового контракта, размещаются в `evals/` отдельными коммитами: env, sandbox,
admission, подготовка и тесты. Их не смешивают и не squash-ят с переносимым OAuth.
Необходимая правка самого продукта оформляется отдельно с обоснованием и путём
в основную ветку; форк OAuth-реализации ради evals не создаётся.

После включения эквивалентной реализации в `loginom` временные копии исключаются
из истории будущего PR: на новую базу переносятся собственные evals/docs-коммиты,
проверяются оставшийся diff, capability и новый установленный binary. OAuth из
основной ветки не откатывается через revert. Точный порядок и проверки — задача 7
плана; переписывание истории сейчас не выполняется.

Статусы, score/oracle, denominator и статистика compare не меняются. Все новые
обычные runs, включая N=1: optional `config.parallel`, `attempt.slot_id` (также
`infra_retry.initial`), `slots`. Legacy singleton получает `slot_id=default`.
Старые файлы без metadata читаются как N=1 без миграции; новые links, уникальные
IDs и совпадение slot initial/retry валидируются.

`summary.loginom.container` — общий immutable ID, `image_digest` — общий digest;
`storage_dir` — root для N=1, null для N>1. В `slots`: username/подтверждённая
manifest identity, container/generation, root, cleanup/status/reason и ссылки на
redacted evidence. Сохранённый config.json содержит redacted common server и slot
descriptors; прежние profileDir/loginom.username/storageDir при N>1 — null,
общая loginom.url остаётся URL Studio. Первый профиль не записывается как общий.
Admin credential paths/cookies/state/пароли/токены не сериализуются в результаты.

`storage_leftovers` остаётся `string[] | null`: null, если хоть один листинг
неизвестен; иначе для N>1 `slot=<id>;path=<JSON-encoded relative path>`, для N=1
прежние строки. Полный scoped inventory и backup status — отдельное evidence.
Stopped_reason включает карантин и блокирует inferential compare как сегодня.
`interrupted_cleanup` сохраняет тип `{recovered: boolean} | null`: null, если
прерванных попыток не было; иначе recovered — логическое ИЛИ `profile_recovered`
только попыток со статусом `interrupted`. Recovery обычной попытки это поле не меняет.
Это не proof cleanup; ошибки/неопределённость находятся в slots и stopped_reason.
Total_duration_ms — сумма времени попыток, wall time определяется started/finished.

Node runner выбирает профиль/архив по slot_id доверенного run config; неизвестный
ID — ошибка, без fallback на первый. Legacy attempts используют прежний singleton.
Compare/rejudge/judge-only сохраняют metadata без живого подключения.
Judge-only/калибровка последовательны, N>1 отклоняют. Fake/dry-run проверяют очередь
без Docker/моделей/credentials. `--reset-profile` и `--keep-storage` в новом
user-slots режиме отклоняются до dispatch: управление идёт через prepare/recover,
каждый root должен быть чистым. Legacy single-slot семантика флагов сохраняется.
Внешний одиночный `EVAL_HARNESS_LEASE_RECEIPT` и node-ops stand-переменные при N>1
отклоняются до отдельной интеграции; внутренние receipts отдельные по слотам.

Отказы реализуются общим `loadConfig` до early judge-only/calibrate и любых side
effects. Node wrapper использует тот же parser; задача 9 обновляет его help и
проверяет публичную команду с `--parallel`, не вводя второй parser.
Fake v2 получает программный fixture seam у `main`: только fake CLI + dir source,
раздельные temporary roots/locks и `liveQualified=false`, без admin/Docker/bwrap.
Production entrypoint не принимает fixture через env/config; binary обход запрещён.
Отмена ожидающего judge создаёт новый исход gate `{ok:false,error:"interrupted before judge",attempts:0}`
в существующем типе Judged и не переписывает измеренный исход агента.

## 10. Реализация и приёмка

Подробные TDD-задачи, файлы и команды — в
[плане реализации](../superpowers/plans/2026-10-13-evals-parallel-users.md).
Новые модули: slots.ts, parallel-pair.ts, loginom-admin.ts, user-environment.ts, scheduler.ts;
скрипты parallel-pair.ts, loginom-admin-driver.mjs, parallel-env.ts и check-parallel-users.ts. До изменения поведения
синхронизируются eval spec, evals/AGENTS.md, README, isolation/stand/node-evals
runbooks и orchestration-контракт. Исторические отчёты не переписываются.
Все нормативные изменения входят в задачу 0 как предусловие реализации.
Задача 11 уточняет фактические команды, pins и результаты приёмки.

Unit CI остаётся без Docker/Loginom/bwrap/фиксированного `/var/lib`. Эти проверки
вынесены в отдельные integration-файлы и явно исключены из `test:unit` в package.json;
их локальный запуск сохраняет receipt, skip не считается PASS. Тесты lock-функций
используют temp root через параметр, не изменение production конфигурации.

Обязательны: повторный prepare без повреждений; полный отказ до первой попытки
при неисправном слоте; одинаковые filenames A/B; запрет чужих операций и ../;
cleanup A во время B; crash A, сохранение B и отсутствие регенерации после
подтверждённого cleanup; admin secrets вне sandbox/env/diagnostics; concurrent
supervisor; SessionBackup positive proof; single-slot, legacy summary,
compare/rejudge и правильный архив node-evals. Fake tests не вызывают модели;
реальные Docker/browser проверки нельзя объявлять PASS по skipped тестам.

После этих gates — полный живой LLM-eval **двух** слотов, затем **одного**.
Закрепить CLI SHA/manifest/capability, images, задачи/prompts/rubric, модель,
transport, judge, OAuth generation без секрета, ACL/config fingerprint,
container generation, лимиты и timeout. Проверить перекрытие model attempts,
artifacts/oracle/judge, refresh OAuth, cleanup и отсутствие 429. Записать
CPU/RAM/диск и совместную нагрузку: свободная память не доказывает устойчивость.
Ресурсные пороги и лимиты фиксируются до приёмки; собираются samples до, во время
и после run, подтверждаются реальная выдача лицензии и число сессий. Отказ лицензии,
нарушение бюджета, OOM/ENOSPC или provider/Dock/judge rate/quota limit, включая
429 в промежуточном retry, не дают PASS выбранной параллельности. Измеренные
результаты сохраняются; неполная наблюдаемость явно отмечается в acceptance receipt.
Для нового прогона агент — gpt-6-luna/high, судья — gpt-6-sol/xhigh; новая калибровка судьи
отдельна от приёмки scheduler. Результаты сохраняются без повторов ради PASS.
Полный новый baseline не требуется. Эта приёмка ещё не проведена.

## 11. Checkpoint

- 2026-10-13: принято «один выделенный Server + общая Studio + user на слот».
- Исследованный HEAD: ef06b6e9b2dba8b0da58c6063d350918ee66dd59.
- Прочитаны семь evidence; пять хэшей из cleanup receipt совпали.
- Loginom 7.4.2 подтвердил разделение пользователей и cleanup A без повреждения B.
- Browser crash оставляет server session; close + readback обязательны до delete.
- Дизайн, ревью и детальный план обновлены; код и стенды не менялись.
- Сохранена интеграция shared-oauth; cherry-pick/сборка ещё не выполнены.
- Не доказаны production session identity, непустой SessionBackup и supervisor.
- Двухслотовый LLM-eval и последующая single-slot приёмка не выполнены.
- Далее: реализация по отдельной команде; сначала квалификация admin adapter.
