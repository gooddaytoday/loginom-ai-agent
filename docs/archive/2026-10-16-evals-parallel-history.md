# Архив parallel evals до решений владельца от 2026-10-16

## N1 от 2026-10-19: первый завершённый агент, ещё без полной приёмки

- e468064b1c добавил cleanup загруженных inputs по существующим tool receipts,
  unit12/72 PASS/typecheck/sh-n/diff PASS, независимое ревью Approved.
  Native judge отдельно: `evidence/judge-native-MlEzbc`, первая попытка100,
  unit завершён/home released. Startup97e… убрал ровно3 своих файла, включая input.
- `20261019-075047-e468064b1c-dirty-s9821T`: calc-data-double179s,14 tools,
  score100/cleanup confirmed. Filter-active-rows не запускался: появились чужие
  inspector/CDP34969/46455 Desktop PID2680928 из чата «Выпустить версию 0.2.2».
  Полный N1 не состоялся. Из-за записи admission до pre-spawn guard нет cleanup.json
  второй попытки; он не создавался задним числом. Source guard до supervisor,
 6 прежних receipts/71 PID+birth gone2passes, fresh native admin проверил Pool0,
  backup empty, нет сессий/файлов/FD/maps в root, profile clean; dispose confirmed.
  Только точные a20b86de… holds освобождены существующим CAS без удаления,
  result unchanged: `evidence/n1-debugger-settlement-20261019.json`.
  Независимое ревью плана operator settlement: достаточно после прямых проверок.

- `20261019-073105-1b2fd99c36-dirty-Vh3uUV`: provider overload/retry остановил
  первый запрос, cleanup confirmed,18 проб ресурсов без пропусков. Повтор после паузы.
- `20261019-073306-1b2fd99c36-dirty-iLakZJ`: calc-data-double completed,
  249554ms,21 tools/0 errors/0 retries, артефакт получен. Judge64: новая глобальная
  desktop.conversationDetailMode отсутствовала в private home. Home синхронизирован
  под lease с сохранением прежнего config в private evidence, login status0/unit clean.
- Очистка отказала без удаления: input загружен Dock как hash-0-amounts.csv,
  существующая successful artifact_deliver квитанция даёт destination/13 bytes/SHA256.
  Prefix-only guard сохранил root и бронь. Решение — использовать ту же квитанцию
  normal cleanup/startup, без новой durable описи. Оба failed results неизменны.
- Wrapper096f18e: local bunfig preload canary RED→GREEN,11 tests PASS/bash-n PASS,
  независимое ревью Approved. Чужие изменения wrapper repo сохранены.

Это исторические снимки, а не действующие требования или разрешение на очистку.
Новый дизайн и короткий план имеют приоритет. Нерешённые инциденты остаются
сохранёнными; перенос записи сюда не означает их разрешения.
Снимки включают незакоммиченные правки, существовавшие перед пересмотром,
в том числе текст чужой правки старого плана.

## Решения владельца, заменившие прежнюю цель

Новая цель. Заменяет прежнюю цель и план от 2026-10-13. Решения владельца от 2026-10-16 имеют приоритет над прежними дизайном, планом, контрактом и записями в памяти.

Готово, когда: один прогон N=2 на реальной модели (агент openai/gpt-6-luna/high, судья gpt-6-sol/xhigh) на 2–4 небольших задачах завершился сводкой, каждый слот удалил только своё, обязательные гарантии соблюдены. Сравнение качества с N=1 — следующая задача, не эта.

Решения:
1. Восстановление. Внутри прогона не восстанавливать: упавший слот уходит в карантин с сохранёнными результатами, здоровый продолжает очередь. Разбор и очистка — в начале следующего прогона одной повторяемой процедурой; нет доказательства — карантин, ничего не удалять. Цепочка эпох и адресный recover не нужны.
2. Блокировки. Одна блокировка сервера на прогон плюс блокировки профиля и home судьи. Блокировку пользователя убрать: слот берётся только под блокировкой сервера.
3. Сессии. Пользователями слотов пользуется только harness, поэтому все серверные сессии пользователя слота N принадлежат слоту N. Закрывать их по точному имени через админ-соединение, открытое до старта слотов, затем перечитывать список.
4. Ресурсы. PASS: заранее записанный бюджет, CPU и RAM хоста и контейнеров, диск, OOM, лицензия, ошибки провайдера. Пороги предложить по замеру N=1, утверждаю я. Телеметрия процессов — только диагностика.
5. SessionBackup только читаем: непустой каталог — остановка без удаления. Отказ лицензии в сессии — остановка прогона.
6. Судья. В ~/git/codex-vpn-lockdown/bin/codex сохранять заданный вызывающим CODEX_HOME, только если он внутри ~/.local/state/loginom-evals/ и содержит тот же lockdown-конфиг. Отдельный маленький коммит; чужие незакоммиченные правки в этом репозитории не трогать.
7. Пользователи слотов. Подготовка создаёт недостающих и проверяет права, прогоны только проверяют. Исследовательские пробы (backup, pool, progress, компоненты) убрать из рабочих операций admin-драйвера.
8. Процессы. Процесс, чья цепочка родителей прочитана целиком и не ведёт в свой launcher, — чужой: не трогать и не карантинить. Если цепочку прочитать нельзя — отказ.
9. Живые тесты. Обязательны четыре сценария A/B: слот не видит чужие файлы; закрытие сессий A не трогает B; удаление только после закрытия своих сессий; при неизвестном владении ничего не удаляется. Остальные живые тесты — только по флагу.

Порядок работ:
1. Переписать на месте затронутые разделы дизайна и контракта (контракт — только правила, до ~400 строк); runbook сократить до инструкции оператора (~200 строк); хронику, старый план и закрытые блокеры перенести в один архивный файл; написать новый короткий план и получить его независимое ревью до реализации. Составить перечень удержанных стендов и инцидентов (что, чьё, в каком состоянии, используется ли). Показать мне план и перечень и дождаться ответа.
2. Реализовать сквозной путь: подготовка, два агента, судья, очистка, сводка; снять SLOTS_ADMISSION_UNAVAILABLE для этого пути.
3. Замер N=1 на тех же задачах, предложить пороги, дождаться моего утверждения, затем прогон N=2.
4. После успешного прогона одним проходом удалить неиспользуемые механизмы и их тесты.

Заморозка: не развивать цепочку эпох, блокировку пользователя, описи процессов, процессную телеметрию, квитанции FD и ядра, архивы серверного хранилища; не добавлять новых протоколов, описей и разделов контракта. Хронику в нормативные документы не писать. Checkpoint — не больше 20 строк.

Нельзя ослаблять: отдельные пользователь, профиль, workspace и архив на слот; секреты вне окружения агента и судьи и вне результатов; закрытие своих сессий и перечитывание списка до удаления; PackagePoolSize=0 до работы пользователя; проверку перед удалением, что у сервера нет открытых файлов в корне слота (без цепочки квитанций); запрет удаления при неизвестном владении; запрет перезапуска общего сервера ради одного слота; блокировку сервера с долговечной бронью; маркер v2 против старых широких очисток; subreaper и проверку pid+starttime перед сигналом.

Остановиться и спросить меня запросом к пользователю, не продолжая работу до ответа, если: нужно изменить требование; блокер мешает сквозному пути (не записывать его в блокеры с переходом к другим задачам); нужно удалить что-либо, кроме собственных временных файлов текущего хода.

Не мешать другим агентам (например, codex://threads/01a133e7-7e88-7ff3-b4ea-fd0f99885d3f) и сохранять чужие незакоммиченные изменения. Каждое логическое изменение — отдельный коммит. Новый код — по TDD на уровне unit-тестов. Принципы Simplicity First и Surgical Changes в силе.

<!-- original-begin docs/plans/2026-10-11-evals-parallel-design.md sha256=b540c1a5927a49ed42ad7065cb18d46b794663770e543dfeb7a90a51785e0b95 -->
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
<!-- original-end docs/plans/2026-10-11-evals-parallel-design.md -->

<!-- original-begin docs/superpowers/plans/2026-10-13-evals-parallel-users.md sha256=43c8172e49b7d9f873354bd864b203e9314934659c344a818fbb0e23e24c2865 -->
# Параллельные evals по пользователям Loginom — Implementation Plan

> **Для исполнителя:** применять доступный skill `tdd`, выполнять задачи по checkbox-шагам с проверкой между задачами. Этот документ не начинает реализацию; она требует отдельной команды владельца.

**Goal:** Один доверенный harness автоматически готовит и переиспользует отдельного пользователя Loginom на слот, выполняя параллельные попытки на одном выделенном Loginom Server и общей Studio.

**Architecture:** Общий контроллер владеет административным Playwright-соединением, серверным run fence, журналом подготовки и учётными данными. Слот владеет пользователем, CLI-профилем, workspace, историей, lease и доказанными серверными сессиями; удаление разрешено только после подтверждённого прекращения своих серверных операций. Существующий цикл оценки включается в общую очередь без барьера кругов и с retry на том же слоте.

**Tech Stack:** Bun/TypeScript, установленный Linux CLI, Linux bubblewrap и `/proc`, Docker CLI, Playwright из проверенных ресурсов установленного CLI, Loginom 7.4.2, существующие `fake-cli.ts` и `fake-codex.ts`.

**Spec:** [Дизайн](../../plans/2026-10-11-evals-parallel-design.md), [актуализированное ревью](../../plans/2026-10-11-evals-parallel-design-review.md), [контракт harness](../specs/2026-09-18-evals-design.md).

## Global Constraints

- Статус на 2026-10-13: **реализация начата с задачи 0 на b54455e187fb0a728787263e17a1adc828d77221; live v2 ещё не квалифицирован**.
- Исследованная рабочая база: `ef06b6e9b2dba8b0da58c6063d350918ee66dd59`. Перед реализацией зафиксировать фактическую базу; не сбрасывать и не включать в свои коммиты чужие изменения.
- Принятая топология: один выделенный Loginom Server, одна Studio, уникальный пользователь Loginom на слот. Её повторное согласование не требуется.
- Runtime-код scheduler и provisioning остаётся в `evals/`. Продуктовая поставка shared OAuth — отдельная работа основного чата; harness потребляет проверенный установленный кандидат.
- Временные shared-oauth dependency commits отделены от собственных evals/docs-коммитов. Всё, что можно адаптировать поверх продуктового контракта, реализуется в `evals/`; такие изменения не включаются в cherry-pick и не squash-ятся с ним. После слияния OAuth в `loginom` временные копии исключаются из истории будущего PR по процедуре задачи 7.
- Все команды тестов и typecheck ниже выполняются из `evals/`; typecheck — только `bun typecheck`. Каждый шаг реализации проходит RED → минимальный GREEN → проверку → отдельный коммит.
- В тестах нет `globalThis.*` и моков внутренних функций. Разрешённые замены внешних процессов: `EVAL_CLI_MODE=fake`, `EVAL_ARTIFACT_SOURCE=dir:`, `EVAL_JUDGE_COMMAND`. Loginom-adapter проверяется на настоящем отдельном экспериментальном сервере; production-конфигурация не получает fake-admin обхода.
- Сохраняются installed-binary admission, bubblewrap, запрет внешних CDP/inspector, ограничения небезопасных серверных компонентов, закрытая история и процессная identity. Пользователи Loginom не заменяют эти границы.
- Запрещены общий cleanup `UserStorage`/`SessionBackup`, перезапуск общего сервера для восстановления слота, удаление lease по одному лишь исчезнувшему PID, изменение исторических results и pins текущих серий.
- Дорогая подготовка выполняется до dispatch; пользователи, профили и пригодное административное соединение переиспользуются. Никаких фиксированных sleep вместо проверки состояния с deadline.
- Все новые eval-прогоны оцениваемого `loginom-ai-agent-cli` используют `openai/gpt-6-luna` с variant `high` (`EVAL_AGENT_MODEL=openai/gpt-6-luna`, `EVAL_AGENT_VARIANT=high`). Судья — `gpt-6-sol` с reasoning `xhigh` (`JUDGE_MODEL=gpt-6-sol`, `JUDGE_REASONING=xhigh`). Эти обязательные pins записываются в manifest и сохраняются при N=2 → N=1; исторические результаты и начатые серии сохраняют исходные pins.
- Административные credentials, cookies и приватные журналы не входят в mounts/env агента и судьи, результаты или диагностику. Общий OAuth store модели — отдельное явное исключение, не административный секрет Loginom.

---

## 1. Доказательная база и границы утверждений

Прочитаны семь JSON и `parallel-probe.mjs`, `export-probe.mjs`, `safe-cleanup-probe.mjs` в `/home/kiselev/.codex/experiments/loginom-users-20261013-50e5f473/`. Исходные файлы остаются на месте; секреты и сырые browser dumps в git не переносить.

| Файл и точный ключ | Что подтверждено | Чего это не подтверждает |
| --- | --- | --- |
| `cli-evidence.json` → `[0/1].setup_exit`, `.setup.state`, `.setup.username`, `.check_exit`, `.check.code` | Два профиля установленного CLI для `eval-a`/`eval-b`, `ready`, `LOGINOM_CONNECTION_VALID` | Полный LLM-eval или автоматическая повторная подготовка harness |
| `parallel-evidence.json` → `checks[name=overlap-execution].overlap_ms=1282`, `.A.count=12`, `.B.count=12` | Реальное перекрытие исполнения двух пользователей | Измеренное ускорение LLM-evals |
| Тот же файл → `checks[name=cross-user-import].ok=false`, `checks[name=B-after-A-crash].all_finished=true`, `checks[name=B-file-after-crash].exists=true` | Импорт чужого файла отвергнут, B исполнил 30 операций после аварии A и сохранил файл | Полная повторяемая матрица всех ACL/Everyone/обходов путей в harness |
| `export-evidence.json` → `control.ok`, `absolute_own_read.ok`, `absolute_own_write.ok`, `cross_write.ok=false`, `cross_write.error` | Свои операции успешны; чужой экспорт завершился общей ошибкой активации | Точный ACL-код причины отказа или полная матрица файловых операций; ключ `cross_write.ok` в сохранённом JSON присутствует |
| `regeneration-evidence.json` → `recreated_after_cleanup=true`, `autosave_mtime > cleanup_at` | Живая серверная сессия пересоздала `calc.lgp.autosave` после удаления **при включённом пробой `set_PackageAutoSavePeriod(1000)`** | Автосохранение по умолчанию (оно выключено) или завершение server session по факту смерти браузера |
| `safe-cleanup-evidence.json` → `closed_A.closed=true`, `closed_A.after`, `A_immediately`, `A_after_12s`, `B_unchanged=true`, `B.all_finished=true`, `overlap_verified=true` | Закрытие A, затем пустое личное пространство в наблюдаемом окне; файлы и работа B сохранены | Универсальный достаточный timeout 12 секунд или надёжная production identity по одному display name |
| `provenance.json` → `loginom_version`, `server_image`, `studio_image`, `cli_metadata.sourceCommit`, `model_calls=0`, `judge_calls=0`, `legacy_session_backup_positive_test="NOT_REPRODUCED"` | Loginom 7.4.2, закреплённые образы, CLI 0.1.17 с `5588651a291c59f53d1c14941d5ba768071a0018`; немодельный эксперимент | Параллельный LLM-eval, адресная очистка непустого SessionBackup |
| `cleanup-receipt.json` → `containers_removed`, `network_removed`, `private_cli_profiles_removed`, `evidence_sha256` | Экспериментальная среда удалена, зафиксированы хэши пяти файлов | Наличие сейчас доступного подготовленного стенда |

В `safe-cleanup-probe.mjs` административные `GetSessionsManager`, `UpdateSessionInfos`, `SessionInfo`, `CloseSession` вызваны **внутри `page.evaluate`**. Это Playwright-путь через браузерную Studio, не независимый HTTP/RPC API. Эксперимент выбирал `eval-a:1` по имени; production cleanup должен дополнительно доказать владельца и идентичность сессии в текущем server epoch. Подтверждённую пользователем более широкую матрицу изоляции повторить машинно в задаче 10, не выдумывая отсутствующие JSON-поля.

## 2. Владение файлами и границы интерфейсов

Названия ниже — **предлагаемые новые интерфейсы**, которых пока нет. Они едины для дизайна, задач и будущего runbook.

| Файл | Ответственность / владелец реализации |
| --- | --- |
| `evals/src/slots.ts`, `evals/test/slots.test.ts` | Версия 2 конфигурации, canonical paths, типы слота, server fence и user/profile leases; автор задачи 1 |
| `evals/src/loginom-admin.ts`, `evals/script/loginom-admin-driver.mjs`, `evals/test/loginom-admin.test.ts`, `evals/test/loginom-admin-integration.test.ts` | Bun-клиент и JSONL-драйвер на bundled Node, один trusted context/run, административные действия; задача 2 |
| `evals/src/parallel-pair.ts`, `evals/script/parallel-pair.ts`, `evals/test/parallel-pair.test.ts`, `evals/test/parallel-pair-integration.test.ts` | Создание/удаление только принадлежащей harness пары, marker v2 и извлечение RPC sources; задача 1а |
| `evals/package.json` и отдельные `*-integration.test.ts` | Разделение обычного CI и проверок с Docker/Loginom/bwrap; начиная с задачи 1а |
| `evals/src/user-environment.ts`, `evals/test/user-environment.test.ts`, `evals/script/parallel-env.ts` | Журнал подготовки, prepare/verify/status/recover, session-close fence и карантин; последовательные задачи 3–5 с одним владельцем файла |
| `evals/src/artifact.ts`, `evals/test/artifact.test.ts`, `evals/test/isolated-storage.test.ts`, `evals/test/no-artifact-cleanup.test.ts` | Scoped storage и безопасное удаление всех имён после fence; задача 5 |
| `evals/src/process-supervisor.ts`, `evals/src/process-launcher.ts`, `evals/test/process-supervisor.test.ts` | Доказанная принадлежность процессов нескольких слотов и trusted admin; задача 6 |
| `evals/src/profile.ts`, `evals/src/cli.ts`, `evals/src/sandbox.ts`, их одноимённые тесты | Проверка фактического подключения, shared OAuth и явный фильтр окружения; задачи 3/7 последовательны |
| `evals/src/scheduler.ts`, `evals/test/scheduler.test.ts` | Общая очередь и состояния слотов, без административных секретов; задача 8 |
| `evals/src/judge.ts`, `evals/test/judge.test.ts` | Один run-local mutex для вызовов существующего `codex exec`, abort ожидания и освобождение в finally; задача 8 |
| `evals/src/config.ts`, `evals/src/preflight.ts`, `evals/src/run.ts`, их тесты | Подключение config v2, all-slot admission и нового cleanup к существующему циклу; задачи 1/3/5/8 последовательны |
| `evals/src/report.ts`, `evals/src/compare.ts`, `evals/src/rejudge.ts`, `evals/src/node-runner.ts`, `evals/src/node-evals.ts`, `evals/script/run-node-evals.ts`, профильные тесты | Совместимость summary, CLI help и выбор истории по slot_id; задача 9 |
| `evals/fixtures/fake-cli.ts`, `evals/fixtures/fake-codex.ts` | Детерминированные сценарии перекрытия/отмены/retry; задачи 6/8/9 согласуют одного владельца fixtures |
| `evals/script/check-parallel-users.ts` | Воспроизводимая немодельная приёмка настоящих двух пользователей, включая crash/ACL/cleanup; задача 10 |
| `evals/AGENTS.md`, `evals/README.md`, `evals/.env.example`, `evals/docs/2026-10-07-analytic-evals-isolation-plan.md`, `evals/docs/2026-10-07-eval-tests-runtime.md`, `evals/docs/node-evals.md`, `evals/docs/evaler-orchestration.md` | Нормативные правила и переход — задача 0; фактические команды и результаты — задача 11 |
| `docs/superpowers/specs/2026-09-18-evals-design.md`, `docs/testing/loginom-ai-agent/parallel-evals.md` | Сначала синхронизировать контракт, затем завершить runbook; задачи 0/11 |

Никакой параллельной записи одного файла разными задачами. Возможные независимые направления после задачи 0: конфигурация/locks, исследование админ-интерфейсов и backup, supervisor, продуктовая поставка OAuth. Сведение `run.ts` выполняет один интегратор.

### Хост и bootstrap до первой подготовки

Целевой host этого плана — **`lg-pc-75`, 10.200.2.58**, Ubuntu 22.04.5, 12 CPU,
38.47 GiB RAM. Read-only snapshot 2026-10-13: MemAvailable около 9 GiB, swap почти
заполнен; это наблюдение, не гарантированный бюджет. Перед запуском задача 10
измеряет доступные ресурсы заново. Удалённый `EVALS_RUNNER=10.200.13.152` здесь
не используется. Remote eval-tests/Multica runtime на этом хосте не установлен;
исторические файлы `~/.multica` не означают наличия работающего исполнителя.

Пара эксперимента удалена. `loginom-evals-isolated` остаётся legacy-стендом.
Dev-пара `loginom-*-7.4.2-test` занимает `loginom-net` и порты 80/4580/8080.
Новая пара создаётся задачей 1а в своей сети; dev/legacy пары не меняются.
Перенос eval-tests через `R/operations/stand.lease` — legacy-процедура вне этого
плана, не обязательный шаг подготовки свежего контейнера.

После отдельной команды на реализацию владелец **один раз** выполняет:

```bash
sudo install -d -m 0700 -o kiselev -g kiselev /var/lib/loginom-evals /var/lib/loginom-evals/locks
install -d -m 0700 /home/kiselev/.local/state/loginom-evals/parallel/{controller,secrets,model-oauth,a,b,evidence,results,judge-codex,studio-source}
```

Bootstrap реализации 2026-10-13 выполнен: `/var/lib/loginom-evals/locks` проверен 0700/kiselev; `/var/lib` принадлежит root.
Harness проверяет owner/mode; не вызывает sudo и не меняет lock root через env/config.
Функции принимают `lockRoot` параметром: production entrypoints всегда передают
константу `/var/lib/loginom-evals/locks`, unit-тесты — собственный temporary directory.
Это зависимость файлового хранилища, не разрешённый пользователю обход global fence.

### Конфигурация версии 2

```json
{
  "version": 2,
  "server": {
    "container": "loginom-evals-users",
    "studioContainer": "loginom-evals-studio",
    "url": "http://127.0.0.1:32771/app/",
    "network": "loginom-evals-users",
    "alias": "loginom-server-7.4.2-test",
    "storageRoot": "/workdir/UserStorage",
    "backupRoot": "/workdir/SessionBackup"
  },
  "controller": {
    "stateDir": "/home/kiselev/.local/state/loginom-evals/parallel/controller",
    "adminCredentialsFile": "/home/kiselev/.local/state/loginom-evals/parallel/secrets/loginom-admin.json"
  },
  "auth": { "sharedDir": "/home/kiselev/.local/state/loginom-evals/parallel/model-oauth" },
  "judge": { "codexHome": "/home/kiselev/.local/state/loginom-evals/parallel/judge-codex" },
  "slots": [
    { "id": "a", "username": "eval-a", "profileDir": "/home/kiselev/.local/state/loginom-evals/parallel/a/profile", "workspaceRoot": "/home/kiselev/.local/state/loginom-evals/parallel/a/work", "historyDir": "/home/kiselev/.local/state/loginom-evals/parallel/a/history" },
    { "id": "b", "username": "eval-b", "profileDir": "/home/kiselev/.local/state/loginom-evals/parallel/b/profile", "workspaceRoot": "/home/kiselev/.local/state/loginom-evals/parallel/b/work", "historyDir": "/home/kiselev/.local/state/loginom-evals/parallel/b/history" }
  ]
}
```

Endpoint/имена в примере описывают будущую отдельно выделенную среду, не распоряжение изменять работающий стенд. Credentials-file содержит только bootstrap-учётную запись контроллера и проверяется как private regular file 0600; секреты каждого eval-пользователя генерируются один раз и сохраняются контроллером до отправки create/update. Повторный prepare не меняет пароли, профили и существующие данные без доказанной принадлежности.

`--parallel N` выбирает первые N слотов; default 1. Одинаковый сервер ожидается, одинаковый `username` — ошибка. V1 design-only multi-container файл не принимается как v2. Без файла остаётся legacy singleton, но его широкая очистка обязана отвергать v2 marker. `--parallel >1` без файла, judge-only/calibrate с N>1, legacy `EVAL_NODE_OPS_CONFIG`/`EVAL_NODE_STAND_LEASE` с N>1, а также `--keep-storage` в пользовательском режиме — явные ошибки до dispatch. `--reset-profile` в v2 явно отклоняется: оператор использует адресное `recover`, который не сбрасывает shared auth store.

### Типы и публичные функции

Это спецификация интерфейсов, не разрешение добавлять неиспользуемые абстракции. Типы экспортируются из владеющего модуля; функции, которые не нужны за его границей, остаются локальными.

```ts
// slots.ts
export type ServerIdentity = {
  containerId: string; startedAt: string; serverEpoch: string
  studioContainerId: string; studioStartedAt: string; configurationHash: string
}
export type SlotDefinition = {
  id: string; username: string; profileDir: string; workspaceRoot: string; historyDir: string
}
export type SlotFile = {
  version: 2
  server: { container: string; studioContainer: string; url: string; network: string; alias: string; storageRoot: string; backupRoot: string }
  controller: { stateDir: string; adminCredentialsFile: string }
  auth?: { sharedDir: string }
  judge: { codexHome: string }
  slots: SlotDefinition[]
}
export type SlotLease = {
  slot: SlotDefinition; identity: ServerIdentity; receipt: string
  token: string; close(): Promise<void>; release(cleanupReceipt: string): Promise<void>
}
export function parseSlots(value: unknown, parallel: number): SlotFile
export function loadSlots(file: string, parallel: number, installRoot?: string): Promise<SlotFile>
export function acquireSlotLease(file: SlotFile, slot: SlotDefinition, identity: ServerIdentity, lockRoot: string): Promise<SlotLease>

// loginom-admin.ts: userKey — controller hash от manifest generation,
// exact Name и UserKind; Loginom immutable user ID здесь не предполагается.
// remoteKey — controller key от serverEpoch + exact Name + CreateTime.
// Он разрешает CloseSession только после сверки свежего manager proxy.
export type ServerSession = {
  remoteKey: string; userKey: string; username: string; serverEpoch: string
  pendingDisconnect: boolean; activeOperations: number | null
}
export type AdminConnection = {
  identity: ServerIdentity
  inspect(): Promise<{ identity: ServerIdentity; sessions: ServerSession[]; configurationHash: string }>
  reconcileUser(lease: SlotLease, secretFile: string): Promise<{ userKey: string; aclHash: string }>
  closeSession(session: ServerSession): Promise<void>
  dispose(): Promise<void>
}
export function openLoginomAdmin(file: SlotFile, identity: ServerIdentity): Promise<AdminConnection>
export function selectOwnedSessions(observed: ServerSession[], owned: ServerSession[]): ServerSession[]

// user-environment.ts
export type ReadyEnvironment = {
  identity: ServerIdentity; generation: string; receipt: string
  slots: (SlotDefinition & { status: "ready"; profileGeneration: number })[]
  changedUsers: string[]; changedPasswords: string[]
}
export type CleanupReceipt = {
  status: "confirmed" | "quarantined"; slotId: string; evidence: string
  leaseToken: string; serverEpoch: string
  processes: "confirmed" | "unknown"; serverSessions: "confirmed" | "unknown"
  archive: "committed" | "unsettled" | "failed"
  storageDeletionAllowed: boolean; nextAdmissionAllowed: boolean
}
export function prepareEnvironment(file: SlotFile, parallel: number, outDir: string): Promise<ReadyEnvironment>
export function verifyEnvironment(file: SlotFile, parallel: number, outDir: string): Promise<ReadyEnvironment>
export function cleanupSlot(input: {
  file: SlotFile; lease: SlotLease; admin: AdminConnection
  ownedSessions: ServerSession[]; processEvidence: string; outDir: string
}): Promise<CleanupReceipt>
export function recoverSlot(file: SlotFile, slotId: string, incident: string, outDir: string): Promise<CleanupReceipt>

// scheduler.ts
export type Job = { index: number; taskId: string; attempt: number }
export function buildJobs(taskIds: string[], repeat: number): Job[]
export function runSlotQueue<T>(input: {
  jobs: Job[]; slots: string[]; signal: AbortSignal
  execute(slotId: string, job: Job): Promise<{ result: T; quarantine: boolean }>
}): Promise<{ results: { job: Job; slotId: string; result: T }[]; quarantined: string[]; unassigned: Job[] }>
```

`serverEpoch` вычисляет controller, это **не поле Loginom RPC**: версионированный
SHA-256 от полного container ID, Docker `StartedAt`, host boot ID, daemon PID и
starttime из `/proc/1/stat` внутри контейнера. Для закреплённого образа PID 1 должен
быть `/app/loginomd` (`/proc/1/exe`, entrypoint/args проверяются). Несовпадение,
неоднозначность или невозможность чтения запрещают admission/close/delete.
Epoch стабилен при неизменном daemon и сверяется перед операциями; restart меняет
его. Переподключение admin создаёт отдельную локальную generation proxy handles,
не выдаётся за restart сервера и не подменяет `serverEpoch`.

`prepareEnvironment`/`verifyEnvironment` публично открывают и закрывают один admin context для standalone-команды. Внутренний run-контроллер вызывает те же локальные шаги с уже открытым `AdminConnection`, а не вызывает публичную обёртку для каждого слота/попытки. Его serialized administrative queue не сериализует исполнение агентов и судей. `SlotContext` содержит `config`, `AgentCommand`, scoped `ArtifactSource` и lease/reference к журналу; `AdminConnection` и credentials остаются в контроллере.

### Владение самостоятельных команд

**Guard и reservation — разные сущности.** В фиксированном
`/var/lib/loginom-evals/locks` для server/profile/judge keys используются OS
exclusive `flock` на постоянных lock-файлах (Linux, Bun FFI/libc) и отдельные durable reservations.
Lock-файлы не unlink/replace; FD имеет CLOEXEC и не наследуется дочерними процессами.
Guard автоматически отпускается при crash, но незавершённая reservation продолжает
запрещать обычный запуск. В ней command/run ID, ownership token/epoch, host boot ID,
PID/starttime, server generation, inventory ресурсов и canonical locator журнала.
Server generation не входит в ключ lock и не подменяется ownership epoch.

Нужные guards берутся в едином порядке ключей с ограниченным ожиданием; при
конфликте уже взятые освобождаются. Server guard одного контейнера не защищает
profile или judge home на другом сервере: для них нужны собственные глобальные
keys. Reservation записывается durable **до** первой побочной операции. В finally
закрываются FD guards, но unresolved reservations не удаляются.

| Команда | Захват и успешное завершение | Ошибка / оставшееся владение |
| --- | --- | --- |
| `status` | Только чтение snapshots без takeover, Loginom login и изменения reservations; сообщить, если снимок менялся | Не объявлять такой снимок новым admission |
| standalone `prepare` / `verify` | Взять server и выбранные user/profile guards/reservations; при проверке judge auth — также judge-home guard. Закрыть все свои probe/management/admin sessions и процессы, подтвердить архив/очистку созданных проб, записать readiness и durable `released`, затем отпустить guards | Неиспользованные или доказанно завершённые собственные reservations можно release; uncertain остаётся retained, команда завершается с ошибкой. При найденной прежней unresolved reservation — `RECOVERY_REQUIRED` без изменений |
| `run` | Заново acquire + admission; внутренний prepare использует текущее владение без release между подготовкой и dispatch. При окончании слота release его чистых user/profile reservations; server reservation — после всех слотов и admin finalization, judge-home — после всех своих судей | Незавершённые reservations удерживают durable fence, даже если процесс завершился и guards уже свободны |
| внешний `recover --slot` | Взять соответствующие guards; только recovery может принять прежнюю reservation по протоколу ниже. После полного archive/session-close/cleanup подтвердить release слота | При живом run — `BUSY`, без изменения token. Неопределённый исход сохраняет reservation; чистый слот не снимает другие unresolved reservations |

Readiness receipt фиксирует результат проверки и **не резервирует** окружение.
`prepare → prepare → verify → run` каждый раз получает новое владение и проверяет
fingerprint. Успех standalone возвращается только после durable release;
неудавшийся release не маскируется успешной подготовкой. Проверка состояния
`verify` не исправляет конфигурацию, но отвечает за завершение собственных проб.

**Приём владения после аварии:**

1. `--incident` указывает на исходное владение и canonical run journal, а не
   навсегда фиксирует последний recovery token. Под всеми соответствующими guards
   `recover` перечитывает актуальные reservations и проверяет непрерывную lineage
   от исходного incident: token/epoch, inventory, server identity и текущего
   controller по boot ID + PID/starttime. Живой либо неопределённый owner — отказ.
   Исчезновение controller не доказывает остановку его детей или server sessions.
2. По **актуальной** проверенной revision атомарно journal-ит CAS в новый ownership
   epoch/token `recovery-only`, сохраняя lineage. CAS со старым token отклоняется;
   повтор после crash самой recovery с тем же исходным incident допускается через
   подтверждённую цепочку новых epochs. Чужая/повреждённая lineage — отказ. Это
   разрешение восстановить среду, **не** dispatch или delete без последующих proofs.
3. Адресно завершает доказанных surviving children, согласует частичный архив,
   подтверждает все собственные server sessions и выполняет scoped cleanup.
   Смена server generation или неизвестная identity сохраняет карантин.
4. Записывает proof и durable `released` tombstone, затем отпускает guards.
   При crash на любом шаге следующая recovery согласует journal; receipt не
   удаляется по PID/возрасту, неизвестные данные сохраняются.

Внутренний recovery A при работающем B выполняет текущий controller без передачи
владения. После падения всего harness внешний recovery обрабатывает перечисленные
в incident слоты адресно. Если восстановлен только A, а B ещё unresolved, результат
помечается partial: A выпущен, общий server fence остаётся. Новый run возможен
лишь после восстановления всех retained ресурсов и admin/judge finalization;
для нескольких слотов `recover --slot` выполняется последовательно по актуальному
run journal. Если указанный слот уже released, команда не трогает его данные,
но завершает retained общие admin/judge/server ресурсы этого incident. Полный
no-op возможен только после terminal state **всего** incident. Новое владение
другого run не принадлежит прежней lineage и никогда не принимается этой командой.

## 3. Конкретные способы выполнения операций

| Операция | Выбранный интерфейс и права | Проверка результата и неопределённый исход |
| --- | --- | --- |
| Container/Studio identity, сеть, route, roots, marker, ограничения компонентов | Программно: Docker CLI с массивом argv, `inspect` и `exec` по полному container ID; доступ к Docker только контроллеру | Проверить ID + StartedAt + server epoch, mount topology, digest/config hash и настоящий маршрут Studio. Изменение identity требует нового admission; не продолжать по имени контейнера |
| Локальные каталоги, private secrets, journals и leases | Программно: Bun/Node fs, `lstat`/`realpath`, атомарные файлы и эксклюзивное создание | UID/mode, отсутствие symlink/hardlink и пересечения mounts; потеря write/read-back сохраняет незавершённую операцию и запрещает dispatch |
| Пользователи, роль проектировщика, запрет admin/full storage и ACL включая Everyone | Playwright: административная Studio и её browser RPC; независимый документированный CLI/API для этих операций пока не установлен | Read-back фактических прав и доступа под обоими пользователями. При ответе с неопределённым исходом сначала read-back по сохранённой user identity; не повторять create, не удалять чужого пользователя |
| Личный физический каталог пользователя | Программно: Docker CLI `exec` по подтверждённому ID, canonical root из `Settings.UserStorageDirectory` + безопасный login; если штатный Add/login уже создал каталог, только проверка | Для отсутствующего каталога создать ровно этот каталог с проверенными UID/GID серверного процесса; не угадывать owner и не делать recursive chown. Существующий несопоставленный каталог не присваивать. Проверить каталог и доступ своим/чужим пользователем через Studio |
| Создание пары, начальная route/wsproxy/component policy | Программно: Docker create/cp/start задачи 1а; JSON/XML до первого start, marker v2 и journal принадлежности | Prepare только проверяет конфигурацию/route/IDs; drift даёт отказ, не автоматический restart. Read-back served Studio config и Python-disabled обязателен. Backup policy квалифицируется отдельно в задаче 4 на research pair |
| CLI-профиль и Loginom-подключение | Программно: установленный `loginom-ai-agent-cli loginom setup --stdin-json --format json`, `loginom status/check --format json` | Сопоставить endpoint и username, `check.ok=true`, `LOGINOM_CONNECTION_VALID`; все созданные этими вызовами серверные сессии учесть и закрыть до admission. Неподходящий готовый профиль не принимать |
| Модельная OAuth-авторизация | Программная подготовка shared store, capability и stdin/CLI; первый вход — штатный `providers login` с внешним подтверждением владельца аккаунта | Нет обещания unattended headless выдачи новых токенов. До первой попытки проверить существующую авторизацию и отсутствие refresh-pending. При отсутствии вывести безопасное `AUTH_REQUIRED`, не маскировать как Loginom-ошибку |
| Judge `codex exec` | Его существующий CLI и отдельный auth; фильтр env судьи | Версия, доступность и отдельная немодельная/живая проверка согласно текущему контракту. Shared store Loginom CLI судье не передавать |
| Наблюдение и адресное закрытие серверной сессии | Playwright `page.evaluate`: `GetSessionsManager` → `UpdateSessionInfos` → нормализованные строки → `CloseSession` конкретной подтверждённой сессии | Текущая user identity, session identity, epoch и lease должны совпасть. Перечитать список до исчезновения именно этих сессий и прекращения операций/locks. Timeout/неоднозначность → карантин, файлы сохранены |
| Артефакты, `.autosave`, обычные/нестандартные имена и вложенные файлы пользователя | Программно: Docker `exec`/`cp` по immutable ID, адресный каталог `/workdir/UserStorage/<username>` | Copy/archive до delete; delete только после receipt закрытия, `find`/NUL-список без split по newline и без следования symlink. Повторный read-back корня; при неопределённом удалении не dispatch |
| SessionBackup | Сначала исследование; затем только доказанное сопоставление user/session/epoch либо проверенное поддержанное отключение | Никакого удаления всего каталога. Неизвестный backup сохраняется; если его влияние невозможно локализовать — прекращение новых admissions всего run |
| Восстановление слота | Программный оркестратор существующих `recover`, supervisor, admin close и scoped cleanup | Recovery может породить новое соединение: завершить его **до** финального close fence. После удаления не запускать новый `loginom check` до следующего управляемого admission |

Проверенные по исходникам Studio browser RPC для задачи 2:

- `Session.GetUsers()`; у коллекции `GetEnumerator(AUserKinds)`, `Add(AName,AUserKind=0)`, `Delete(AUser,ADeleteUserData=false)`. Локальный пользователь: `dukUser=0` для Add; для набора `GetEnumerator` — `dukUser=1`, `dukAll=7`; local authentication: `uamLocal=1`.
- User setters: `set_IsAdmin`, `set_IsViewer`, `set_IsDesigner`, `set_Blocked`, `set_UseGlobalFileStorage`, `set_SchedulerFullAccess`, `set_AllowPublish`, `set_AuthMode`, `SetPassword(Value)` и соответствующие getters. Нового пользователя явно держать `Blocked=true` на время AuthMode/password/rights; designer/viewer задать по контракту, admin/global storage/scheduler full access/publish — false. После полного read-back разблокировать последним действием и снова проверить. Назначение роли снимает неявную блокировку; перевод LDAP/OpenID в Local сбрасывает пароль. Поэтому повторный prepare уже local-пользователя не вызывает setter AuthMode и не меняет пароль.
- `Session.GetSharedDirectories()`, затем `GetEnumerator`, `Add(AName)`, `Delete(AItem,ADeletePhysicalDirectory)` и `dir.get_Permissions()`. `IBGAccessPermissions.GetEnumerator/Add(AUsers)/Delete(AUsers)` работает с массивом user/group proxies; результаты Add/Delete — массив чисел `int32[]`, не boolean. Семантика чисел ещё не квалифицирована: fixture должен установить её, а успех определяется полным read-back ACL. `Everyone` — точное имя универсальной группы.
- ACL здесь — список допущенных users/groups, не вымышленные поля `View/Add/Modify` на каждой записи. Поддержанный `UserStorageDirectory` задаёт общий physical root, личная папка выводится из login. Поэтому delete/recreate пользователя с тем же именем может унаследовать прежние данные и не является способом «сбросить» слот.
- У managed session прочитаны `Name`, `CreateTime`, `SessionIP`, `SessionHost`, `SessionType`, `Role`, `Capacity`, `PendingDisconnect`; `Guid`/`UserID` в этой строке не обнаружены. У собственной session есть Guid, но его связь с manager row ещё не доказана. Выбранный безопасный кандидат сопоставления: epoch + leased username + точные Name/CreateTime + свежий proxy; при невозможности подтвердить его гонкоустойчивость live gate остаётся закрытым. `activeOperations:null` означает отсутствие измерения, а не нулевую активность.

Источник проверки интерфейсов: сохранённый `bg_js_bg.model.rpc.js` в `/tmp/loginom-users-50e5f473/studio-source/`, примеры `/home/kiselev/git/e2e-tests/tests/toreview/helpers/admin.ts` и справка `/home/kiselev/git/support/loginom-help/data/admin/parameters/folders.md`, `/home/kiselev/git/support/loginom-help/data/admin/users/README.md`. `/tmp` очищается при загрузке (`D /tmp` в tmpfiles): до задачи 2 задача 1а сохраняет sources и SHA inventory в постоянный `controller`-соседний `studio-source`, либо извлекает их из закреплённого Studio image. Это исследовательские материалы, не runtime dependency. Старый helper `AddUser` нельзя копировать: проверка flags через `!= null` включает флаг даже при `false`; пригодны только проверенные RPC/selector references.

## 4. Порядок реализации

### Задача 0. Синхронизировать нормативные контракты и runbook

**Files:** Modify `docs/superpowers/specs/2026-09-18-evals-design.md`, `evals/AGENTS.md`, `evals/README.md`, `evals/.env.example`, `evals/docs/2026-10-07-analytic-evals-isolation-plan.md`, `evals/docs/2026-10-07-eval-tests-runtime.md`, `evals/docs/node-evals.md`, `evals/docs/evaler-orchestration.md`; Create `evals/docs/parallel-users-contract.md`, `docs/testing/loginom-ai-agent/parallel-evals.md`.

**Interfaces:** Produces нормативные версии slots v2, marker v2, lifecycle команд/блокировок, session identity, archive/cleanup receipts и summary, а также правила эксплуатации нового режима во всех перечисленных документах. Это обязательное предусловие задач 1–10; runtime-код ещё не меняется. Будущий v2 помечен как не реализованный: документ не разрешает менять действующий legacy стенд.

- [x] Прочитать фактический `git status --short`, базовый SHA, owning AGENTS и этот дизайн. Задать владельцев файлов из таблицы; сохранить только подтверждённые SHA и хэши evidence.
- [x] Записать новый контракт до изменения кода: admission failure до первой попытки → exit 2 и отдельный безопасный preparation receipt без measured summary; карантин после dispatch → summary и exit 1; неизвестная очистка удерживает соответствующие leases.
- [x] Описать v2 marker по существующему `/workdir/.loginom-evals-isolated.json`, который старая версия `checkIsolatedStorage` отвергает по version. Не оставлять рядом старый совместимый маркер, позволяющий broad cleanup.
- [x] Закрепить lifecycle из раздела «Владение самостоятельных команд»: OS guards действуют только при живом controller; durable reservations сохраняют запрет запуска после его выхода. Server reservation остаётся unresolved при незавершённом incident, даже если чистые user/profile reservations уже выпущены. Archive предшествует server close; удаление server files требует отдельного closure proof.
- [x] Зафиксировать разовый bootstrap владельца из раздела «Хост и bootstrap»: он создаёт `/var/lib/loginom-evals/locks`; prepare только проверяет этот root. CLI использует константу, функции получают root аргументом, unit-тесты используют temp. Env/config override запрещён. `controller.stateDir` хранит journal, но не переносит global fence; два stateDir конфликтуют по одинаковым server/user/profile/judge keys.
- [x] Во всех нормативных документах до изменения кода разделить legacy exclusive и v2 user-scoped admission/cleanup, описать marker migration, release/recover, архивирование до server close и отказ при uncertain outcome. Зафиксировать запрет старых broad-cleanup executors и перезапуска сервера для слота, сохранение текущих серий и условия 2 → 1 приёмки.
- [x] В node-evals/orchestration/runtime runbooks закрепить новую пару на `lg-pc-75` из задачи 1а; никаких изменений remote eval-tests/`R/operations/stand.lease` и legacy/dev контейнеров. Старые миграционные инструкции пометить legacy-only, без выполнения здесь. Новый marker делает свежую пару непригодной для broad cleaner; ordinary node-evals выбирает архив по slot_id. Нормативно закрепить `interrupted_cleanup` только по прерванным попыткам, включая исправление более широкой формулировки SIGINT в старой спеки. Задача 11 сверяет команды и evidence.
- [x] Проверить документный diff и закоммитить только свои контрактные файлы: `git diff --check`, затем `git commit -m "docs(evals): define user-isolated parallel contract"` с явным `git add` перечисленных файлов.

### Задача 1. Конфигурация, canonical paths и leases

- [x] Grouped resource preflight: `acquireResourceSet` берёт все OS guards в порядке ключей и проверяет весь набор до первой reservation. BUSY/retained/admit отказ на позднем ресурсе не создаёт ранние reservations; отдельный процесс подтверждает исключительность всего набора. RED missing API → GREEN; 54 lease/slots/offline-recovery PASS/201 (9.36s), typecheck/diff PASS. Ошибка записи может оставить retained rows; filesystem atomicity/rollback не заявляются. Подключение к standalone all-slot admission остаётся открытым.

- [x] Composite ownership guard: `SlotLease.assertHeld` проверяет private manifest вместе с обеими reservations; release повторяет эту проверку до resource tombstones. RED изменённый composite token принимался для held/provisioning и release → GREEN: чужой manifest не создаёт prepare files и не освобождает resources, восстановление исходных bytes возвращает held state.76 slots/lease/user/admin PASS/245 (4.14s), typecheck/diff PASS. Terminal partial-release reconciliation остаётся отдельным открытым шагом задачи5.

**Files:** Create `evals/src/slots.ts`, `evals/test/slots.test.ts`; Modify `evals/src/config.ts`, `evals/src/lease.ts`, `evals/test/config.test.ts`, `evals/test/lease.test.ts`.

**Interfaces:** Produces `SlotFile`, `SlotDefinition`, `ServerIdentity`, `SlotLease`, `parseSlots`, `loadSlots`, `acquireSlotLease`. `config.parallel` и `config.slotsFile` добавляются без удаления singleton-настроек.

- [x] RED: добавить минимальный JSON fixture прямо в тест и проверить одинакового пользователя/вложенные пути, при этом один общий сервер принимается:

```ts
const value = {
  version: 2,
  server: { container: "server", studioContainer: "studio", url: "http://localhost/app/", network: "eval", alias: "loginom-server-7.4.2-test", storageRoot: "/workdir/UserStorage", backupRoot: "/workdir/SessionBackup" },
  controller: { stateDir: `${root}/controller`, adminCredentialsFile: `${root}/secrets/admin.json` },
  judge: { codexHome: `${root}/judge` },
  slots: [
    { id: "a", username: "eval-a", profileDir: `${root}/a/profile`, workspaceRoot: `${root}/a/work`, historyDir: `${root}/a/history` },
    { id: "b", username: "eval-b", profileDir: `${root}/b/profile`, workspaceRoot: `${root}/b/work`, historyDir: `${root}/b/history` },
  ],
}
expect(parseSlots(value, 2).slots.map(slot => slot.username)).toEqual(["eval-a", "eval-b"])
expect(() => parseSlots({ ...value, slots: value.slots.map(slot => ({ ...slot, username: "eval-a" })) }, 2)).toThrow("SLOT_USER_DUPLICATE")
expect(() => parseSlots(value, 3)).toThrow("SLOT_COUNT")
expect(() => parseSlots({ ...value, version: 1 }, 2)).toThrow("SLOTS_VERSION")
```

- [x] `root` в fixture — реальный `mkdtemp` под `tmpdir()`; создавать private child directories, удалять только свой fixture. Запустить RED: `bun test test/slots.test.ts test/config.test.ts`. Новый тест падает из-за контракта, не из-за отсутствия `/var/lib`/Docker/Loginom.
- [x] В `loadConfig` реализовать `--parallel` и отказы до ранних веток judge-only/calibrate, чтения node-ops private config и side effects: v2 с `--keep-storage` или `--reset-profile`; N>1 без slots; N>1 с judge-only/calibrate, `EVAL_NODE_OPS_CONFIG`, `EVAL_NODE_STAND_LEASE` или `EVAL_HARNESS_LEASE_RECEIPT`. Parameterized RED/GREEN покрывает каждую переменную отдельно, парные комбинации и разрешённый legacy N=1. Проверить exit 2 и отсутствие созданной run directory/CLI dispatch.
- [x] GREEN: добавить parse/validate и реальные filesystem-проверки отдельно в `loadSlots`; нормализовать канонические пути через `realpath` ближайшего существующего предка, затем проверить все попарные пересечения profile/workspace/history/controller/admin/auth/install. `username` ограничить безопасным идентификатором, а **имена файлов пользователя не ограничивать этим regex**.
- [x] RED/GREEN отдельными тестами реальной fs и двух Bun-процессов: duplicate `(containerId, username)` при разных profile; разные users на одном container; замена inode owner; мёртвый PID с неразобранным receipt; server restart с тем же container ID; symlink и вложенные canonical roots. Зафиксировать ключ user lease как hash полного container ID и canonical username/UserKind; сохранить manifest generation/epoch в receipt, не делать их частью обходного ключа блокировки.
- [x] Примитивы resource lease: real-process exclusion/SIGKILL/CLOEXEC, private root/journal, guard inode, bound release, recovery-only CAS/lineage; отдельный коммит. SlotLease/generation завершены следующими вертикальными циклами.
- [x] RED/GREEN реальными Bun-процессами: освобождение OS guard при SIGKILL не снимает durable fence; FD не наследуется child; только recovery-only CAS принимает ожидаемую актуальную revision/token; устаревший CAS отклоняется, два recover не принимают одну revision одновременно. Проверить PID reuse/boot ID, потерянный журнал, crash до/после durable release и разные server IDs с общим profile/judge key. Эти тесты проверяют примитивы lease, не требуют будущей CLI recover.
- [x] Проверить `bun test test/slots.test.ts test/config.test.ts test/lease.test.ts` и `bun typecheck`; коммит `feat(evals): add user slot configuration and leases`.


### Задача 1а. Новая пара контейнеров, постоянные sources и граница CI

- [x] Permanent research factory 2026-10-14: configured private admin schema/loadSlots PASS; обе research names отсутствовали до create. Public parallel-pair create с fixed globalLockRoot завершился infrastructure-ready; pair.json/private receipt/readServerIdentity/loadResourceContainers read-back PASS. Nonce e6799bc1-0e0d-4b44-88f5-7213279df442, Server6ae20e68318269f0c0838c410e701453a43804d1e57f646ddabde73f53d86075, Studioff3ce5974e678dd2967261262b110c22023a11b2a680d2cf79dd8240a809ef95. Встроенные frozen config/route/marker/ownership guards прошли factory; browserRouteQualified=false. Acceptance pair ещё не создана; admin/browser/session/licence readiness отдельные gates, dev/legacy не затронуты.

**Files:** Create `evals/src/parallel-pair.ts`, `evals/script/parallel-pair.ts`, `evals/test/parallel-pair.test.ts`, `evals/test/parallel-pair-integration.test.ts`; Modify `evals/package.json`. Зависит от задачи 1 и bootstrap владельца; обязательна до задач 2–5/10. OAuth-кандидата не ждёт.

**Interfaces:** `parallel-pair.ts create|destroy --config <slots.json> --purpose acceptance|research --out <private-dir>`. Docker вызывается массивом argv. Create идемпотентен по private ownership journal, nonce/labels и полным IDs; одноимённые чужие ресурсы не принимаются. Destroy требует явной команды и того же подтверждённого ownership, отсутствия активного run/retained incident; не используется для recovery одного слота.

Модуль экспортирует `readServerIdentity(file: SlotFile): Promise<ServerIdentity>`;
его используют create, admission и повторные проверки перед mutation.

До появления container ID используются provision guards/reservations в том же
global root: отдельные стабильные keys Docker-daemon identity + canonical network
name и каждого container name, в общем порядке захвата. Они защищают совпадения
между разными stateDir/config; имя Docker network само по себе не уникально.
После create сохраняются полные IDs, далее применяется и server guard. Неопределённое
создание сохраняет reservation для reconciliation; destroy берёт оба вида guards.

- [x] Подзадача 1а: pure planPair/usersMarker — pins image IDs, отдельная network, loopback port, no server publish, restart=no и отказ небезопасных полей; 4 tests/typecheck PASS.
- [x] Подзадача 1а: pure reconciliation unknown create — single full ID/name/nonce/purpose, отказ чужих labels/сменённого ID/duplicate network; 9 pair tests/typecheck PASS. Реальное Docker reconciliation ещё требует integration.
- [x] Подзадача 1а: acceptance/research slots.json созданы private 0600, отдельные names/ports/roots; bootstrap admin отсутствует, loadSlots отказал до mutation. Детали в eval_parallel_blockers.md; полный шаг ниже остаётся открыт.
- [x] RED/GREEN unit: выбор config paths/ports, schema marker, plan действий и reconciliation неизвестного Docker-ответа. Использовать pure входные JSON и временный lock root; Docker не подменять внутренним mock. Docker-поведение проверить отдельно в integration.
- [x] После bootstrap сохранить конфигурацию из раздела 2 как `/home/kiselev/.local/state/loginom-evals/parallel/slots.json` (0600) с проверенными локальными путями и отдельным bootstrap admin file. Подготовить второй research config с собственными именами/портом/roots. Пароль в slots JSON не записывать; private bootstrap file предоставляет владелец, последующие slot secrets создаёт harness. Existing config без подтверждённой принадлежности не перезаписывать.
- [x] Private configuration/bootstrap сверка (2026-10-15): acceptance/research slots.json уже существовали0600, acceptance точно соответствует approved JSON; разные names/network/ports/host roots и distinct bootstrap file inodes, public loadSlots(...,2) PASS. Первичная проверка нашла12 отсутствовавших profile/work/history leaf dirs. Под четырьмя actual global profile OS guards и только при полном отсутствии durable reservations созданы12 empty0700 dirs, parent fsync и private journal; повторное guard acquisition/read-back подтвердило26 declared private paths, empty/inode stability и unchanged config bytes. Reservations изменено0, auth/credential bytes не читались, fixed guard files сохранены. Private native-two-users-6ebb9781.../slot-directories-postcheck.json SHA78d0039f40e7b3b5cf8ad5b00db120322e8ae9692a1fd85b1629be918a40a4ce, post-config3310afcc...; acceptance pair journal отсутствует, readiness=false. Это operator bootstrap данных, не новый CLI interface и не qualification auth/Server/CLI setup.
- [x] В `evals/package.json` дополнить текущий `test:unit` явными исключениями `parallel-pair-integration`, `loginom-admin-integration`, `user-environment-integration`, `parallel-lifecycle-integration`, `shared-oauth-integration`, `process-supervisor-integration`, `parallel-acceptance-integration` к прежним `isolated-storage,node-eval-ops,node-skill,sandbox`. Создавать новые файлы в их задачах; проверки с Loginom/Docker/bwrap/Chromium не добавлять в обычные `*.test.ts`. Существующий `evals-unit` продолжает `bun run test:unit`; unit locks всегда на temp. Local integration запускается явным списком файлов по готовности; отсутствие prereqs даёт receipt непроверенной проверки, skip ≠ PASS. Для полного local regression сохраняются `bun test` и `bun typecheck`.
- [x] `create` проверяет локальные image IDs `loginom-server-7.4.2-test:with-libxml2` (`d138ce018adb`) и `loginom-client-7.4.2-test:latest` (`69ce44ac1002`), закрепляет **полные** IDs/digests в journal до создания. Pull/подмена тега не выполняются. Создать отдельную Docker network и alias `loginom-server-7.4.2-test` только внутри неё; не подключать к `loginom-net`. Server не публикует порты; Studio binding `127.0.0.1:<port>:80` выводится из validated loopback `server.url`; 32771 — acceptance пример. Research config задаёт другой свободный порт. Повторная проверка занятости и отказ Docker bind обрабатываются без остановки dev.
- [x] Подзадача 1а: реальный disposable create/cp/start проверяет topology до config writes, материализует отсутствующий в pinned image Components.cfg, XML/Python-disabled и marker v2 до первого старта. Atomic private payloads/read-back; public Studio server.json читается Apache daemon. Bootstrap admin login не выполнялся.
- [ ] Создать контейнеры (`docker create`, ещё не start), `restart=no`, без mounts и privileged. Подтверждённый default workdir/bootstrap этой версии квалифицировать на research pair; bootstrap admin брать только из private regular file 0600. До первого старта `docker cp` записывает Studio `/usr/local/apache2/initial-content/server.json` с boolean `"wsproxy": true`, Server `/workdir/Components.cfg` с Python `Disabled="true"` (Guid `70a6c99d-a725-4309-b05c-898c8072c3cd`). Entry point Studio копирует initial-content в htdocs при старте; запись только в htdocs до старта недопустима. Исходный `auto` допускает `ws://127.0.0.1:8080`, где находится dev-сервер.
- [x] До старта записать `/workdir/.loginom-evals-isolated.json`: kind `loginom-evals-users`, version 2, полный container ID и owned inventory/nonce. Затем start по IDs, bounded infrastructure health, read-back marker/config и served `/usr/local/apache2/htdocs/client/server.json`, DNS alias/backend address и proxy config. Неизвестный исход create/cp/start требует inspect+read-back по journal; не повторять вслепую и не принимать чужой ID. Receipt пока только `infrastructure-ready`, не eval admission. Actual browser/CLI WebSocket route доказывается в задачах 2–3 под journal с учётом и закрытием созданных sessions. Последующий prepare проверяет глобальную конфигурацию, не переписывает и не перезапускает пару.
- [x] Подзадача 1а: versioned serverEpoch parser/hash — stable/volatile stat, StartedAt/starttime/boot changes и отказ unknown daemon; 8 pair/CI tests/typecheck PASS.
- [x] Реализовать `readServerIdentity` в `parallel-pair.ts`: Docker full `.Id`/`.State.StartedAt`, host boot ID и `/proc/1/exe`, cmdline/stat starttime внутри container → versioned hash `serverEpoch` по формуле выше; Studio identity читается отдельно. Pure parser/hash RED/GREEN — stable reread, changed field, malformed/unreadable/unknown executable → отказ. На research pair integration — restart с тем же ID меняет epoch; повторное чтение без restart стабильно. Production не меняет epoch при одном лишь новом admin context.
- [x] До задачи 2 сохранить RPC sources в `/home/kiselev/.local/state/loginom-evals/parallel/studio-source` (0700) с image digest/path/SHA inventory: `/usr/local/apache2/initial-content/bg/js/bg.model.rpc.js`, `bg.server.rpc.js`, `bg.model.js`. Если копия из `/tmp` доступна — сверить с image; иначе `docker create` extraction-container без start → `docker cp` → удалить только свой extraction ID. Секреты/browser state не копировать.
- [x] Integration RED/GREEN: повтор create сохраняет IDs/файлы; занятой порт/чужое имя дают отказ без изменений; `cleanupIsolatedStorage` legacy реально вызывается на v2 marker и отказывает, hashes контрольных A/B остаются прежними. Legacy cleaner уже проверяет version 1; менять его контракт ради этого отказа не требуется. Destroy тестируется только на собственном disposable fixture с сохранностью посторонней dev-пары.
- [x] Дополнительный crash gate: настоящий Bun SIGKILL оставляет provision reservation; failed reconciliation сохраняет recovery-only, новый read-back подтверждает release. Renamed full ID блокирует destroy до удаления Studio. 24 assertions real Docker PASS; неопределённый create без видимого ресурса остаётся unknown (unit), browser/admin/model readiness не заявляется.
- [x] Подзадача 1а: frozen full unit 595 PASS/3 SKIP/0 FAIL (457.92s), 12 targeted pair/CI tests, real Docker 24 assertions и typecheck/diff check PASS. Source/test SHA до/после совпали. Первый запуск с umask077 был ошибкой команды проверки; diagnosis в runbook, assertions/runtime не менялись.
- [ ] Research pair для SessionBackup, restart/epoch и crash-тестов имеет собственные имена/network/порт/paths/receipt, не совпадающие с acceptance config. Свободный research-порт выбирается и фиксируется отдельно; acceptance pair не используется для этих опытов. Проверить `bun run test:unit`, `bun typecheck`, затем `bun test test/parallel-pair-integration.test.ts` на этом хосте с receipt; коммит `feat(evals): provision dedicated user-eval pairs`.

- [x] Safe Docker read diagnostics: `PAIR_DOCKER_READ` сохраняет только operation/numeric exit/timedOut, без argv/stdout/stderr. Реальный missing-container inspect RED missing metadata→GREEN1/3 assertions (1.60s); pair unit11/45 и typecheck/diff PASS. Production deadline20s и mutation/reconciliation policy сохранены; это диагностика, не readiness gate.

### Задача 2. Trusted административный Playwright adapter

**Files:** Create `evals/src/loginom-admin.ts`, `evals/script/loginom-admin-driver.mjs`, `evals/test/loginom-admin.test.ts`, `evals/test/loginom-admin-integration.test.ts`; Modify `evals/src/preflight.ts` для проверки установленного browser runtime.

**Interfaces:** Produces `ServerSession`, `AdminConnection`, `openLoginomAdmin`, `selectOwnedSessions`. Consumes `SlotFile`, `ServerIdentity`, `SlotLease` для user mutation; credentials не выходят из модуля.

- [x] RED: чистая функция выбора сессии должна отказать при несовпадении user/epoch даже с одинаковым remoteKey:

```ts
const owned = { remoteKey: "session-41", userKey: "user-a", username: "eval-a", serverEpoch: "epoch-1", pendingDisconnect: true, activeOperations: 0 }
expect(selectOwnedSessions([owned], [owned])).toEqual([owned])
expect(() => selectOwnedSessions([{ ...owned, userKey: "user-b" }], [owned])).toThrow("SESSION_IDENTITY_CHANGED")
expect(() => selectOwnedSessions([{ ...owned, serverEpoch: "epoch-2" }], [owned])).toThrow("SERVER_EPOCH_CHANGED")
expect(() => selectOwnedSessions([owned, owned], [owned])).toThrow("SESSION_IDENTITY_AMBIGUOUS")
```

- [x] Запустить `bun test test/loginom-admin.test.ts` (RED), затем реализовать нормализатор и проверки (GREEN). Display name `eval-a:1` не используется как достаточное доказательство.
- [ ] Проверить доступные реальные поля session identity/user identity и сигнатуры административных browser RPC на закреплённой 7.4.2 по перечню выше. Зафиксировать adapter capability contract и обезличенный ответ в `evals/docs/parallel-users-contract.md`. У managed row нет обнаруженного immutable ID: доказать составную identity epoch/leased username/exact Name/CreateTime и fresh proxy отрицательными race tests; если нельзя — возвращать `SESSION_IDENTITY_UNSUPPORTED`, не ослаблять выбор до имени.
- [x] Read-only native account capability: ownSession observations хранит IsAdmin/IsDesigner как проверенные boolean. Bootstrap admin фактически true/false; пакетный linkage probe этим account невозможен. Экспериментальный op удалён, bootstrap rights не менялись, qualification=false. TDD target1 PASS/17 (6.42s), schema проверена; причинный probe переносится на подготовленный design user. Один transient dispose hang не воспроизведён локально (15 PASS/63 и два Node/pipe order probes); incident сохранён в blockers/диагнозе.
- [x] Native user enumeration: штатные GetUsers/GetEnumerator(dukUser)/MoveNext/Current/awaited cast/ReleaseObject, 4 users, CurrentUser exact name/objectId match=1. Private whitelist user flags и UserKind=0; missing users RED → target1 PASS/21 (7.77s), typecheck/diff PASS. Account mutation/ownership across contexts и effective groups/Everyone ACL остаются gates.
- [x] Native shared permissions read-back: GetSharedDirectories/GetEnumerator и nested Permissions.GetEnumerator; actual2 shared dirs/2 grants Everyone(UserKind2), оба enumerators ReleaseObject. Missing sharedDirectories RED → target1 PASS/23 (6.72s), schema whitelist и typecheck PASS. Mutation Delete/Add/write semantics/effective isolation не квалифицированы; перед design user требуется guarded policy reconciliation и negative access proof.
- [x] Подзадача 2: установленный prod runtime read-only квалифицирован по 5393 CLI/4381 resource entries (paths, SHA, modes, links, full inventory, ELF/x64/executable). Bundled Node v24.19.0, Chromium 153.0.8010.12 --version и createRequire/playwright-core resolve/import PASS; private admin-runtime-inventory.json. Browser/admin login ещё не запускался; runtime verifier в коде ниже предстоит.
- [x] Подзадача 2: verifyAdminRuntime в preflight — full CLI inventory/hash/mode/link/canonical paths, resource claims/target/required payload и ELF/x64/executable checks. 9 реальных fs RED/GREEN tests, 35 preflight/admin PASS и typecheck PASS; установленный prod CLI проверен новым кодом, manifest SHA совпал. Verifier только читает, ничего не исполняет; launch/live RPC остаются ниже.
- [x] Native research admin bootstrap с pinned candidate: actual role/username read-back и подтверждённый browser/native process dispose. Первый probe ADMIN_DISPOSE_UNKNOWN stable3/3; safe codes/stage/state установили ADMIN_DEADLINE на password READONLY. Pinned Studio Login.js:217–231 AutoCompleteOff снимает readonly при focus; штатный password.focus перед fill исправил вход без JS attribute mutation, retries/timeouts/assertions не ослаблены. Тот же configured research test1 PASS/7 assertions (6.22s), initialization confirmed/dispose confirmed/browserBindings>0/final00, original identity unchanged. Receipt research/controller/admin-wU7Ebw/connection.json (private); old unknown/quarantine evidence сохранены. Admin integration/unit/preflight48 PASS/123 assertions (36.33s), typecheck/diff PASS; диагноз evals/docs/2026-10-14-admin-password-focus-diagnosis.md. Это admin login/browser transport, session ownership/close/ACL/backup/licence-counting не квалифицированы.
- [x] Native init FORM gate: после одного FORM refusal и следующего ROLE PASS collector3/3 PASS (78 assertions) не воспроизвёл сбой. Перед exact count guard добавлены visible waits в прежнем request deadline. Native admin/CRUD/codec/preflight59 PASS/226 (59.25s), typecheck/diff PASS. Причина race остаётся выводом по коду; deterministic reproduction не заявлено. Диагноз дополнен в admin-password-focus-diagnosis.md.
- [x] Запустить браузер средствами проверенной установленной копии: bundled Node и Chromium из `resources/loginom/resource-manifest.json`, `playwright-core` через `createRequire` от `resources/loginom/runtime/client/package.json`. Проверить relative paths, CLI manifest hashes и executable; исходный monorepo `node_modules` не использовать. Не добавлять runtime-зависимость harness и не скачивать другой Chromium.
- [x] Bun-модуль `loginom-admin.ts` запускает `script/loginom-admin-driver.mjs` отдельным child через закреплённый bundled `bin/node`. Это выбор штатного product runtime; утверждение, что любой импорт Playwright под Bun невозможен, не требуется. Driver владеет browser/context и RPC proxies; Bun владеет journal/leases и supervisor. Между ними private stdin/stdout JSONL v1, без TCP listener. Native child/journal/dispose proof проверены ниже; положительный browser/RPC контракт остаётся открытым.
- [x] Подзадача 2: driver.mjs добавлен, real bundled Node проверяет protocol allowlist, dispose без context, missing/malformed private credentials и mismatch runtime hash до browser launch. 2 integration PASS/7 assertions, Node --check, 36 preflight/admin/CI tests и typecheck PASS. Init/readonly inspector написаны по pinned source, но login/live RPC не квалифицированы; CloseSession и user mutations закрыты capability gate.
- [x] Подзадача 2: supervisor принимает потоковые stdin/stdout для постоянного private pipe; protocol stdout передаётся consumer без сохранения в diagnostic output. Реальные процессы RED/GREEN доказывают три последовательных обмена/EOF и ограничение зависшего consumer; 21 supervisor tests/98 assertions и typecheck PASS. Browser ownership/admission и durable admin bridge ещё требуют следующих шагов.
- [x] Подзадача 2: journaled channel fsync intent/file+directory до dispatch; private exclusive command ID, payload/reply только SHA. Unknown запрещает mutation replay, новый канал учитывает retained intent; result I/O failure/подмена каталога сохраняют intent и чужие файлы. 5 real-pipe/filesystem RED/GREEN tests, 41 admin/preflight/CI tests/typecheck PASS. Драйвер/supervisor bridge, reconciliation receipt и live RPC ещё предстоят.
- [x] Подзадача 2: openLoginomAdmin/AdminConnection — verified Node, private context/journal/profile, fresh Docker identity до init/операций, serialized RPC, idempotent dispose ack+EOF+continuous process proof. 3 actual Node/Docker rejection integration tests/17 assertions PASS; stale epoch не создаёт context, missing parent credentials → private code. 41 targeted/21 supervisor tests (99 assertions)/typecheck/Node --check PASS. Browser/login/session qualification, process registry после crash и full adapter acceptance остаются открытыми.
- [x] Подзадача 2: при открытии journal строгая schema intent/terminal, request identity/op, desired/reply SHA и timestamps; claimed completion без reply evidence отказал до mutation (RED/GREEN real pipe/fs). 49 scheduler/admin/preflight/CI tests/113 assertions и typecheck PASS; reconciliation unknown этим не подменяется.
- [x] Подзадача 2 static surface: owned stopped/no-network/no-ports/read-only Studio container из exact69ce44ac image, private copy public htdocs, 12 interface descriptors/8 source SHA в admin-source-4905babb/rpc-inventory.json600 read-back PASS. Подтверждены Session.Guid, managed object ID getter via bg.objectId(method5), UI InfoKey по cached object ID, CloseSession(SessionInfo proxy, timeout), GetUsers/Add/Delete/SetPassword/role flags и shared-directory Permissions.Add/Delete. GUID↔managed-ID correlation/reconnect stability и real calls не квалифицированы; имена/время не становятся ownership proof. Container никогда не стартовал, после fresh ID/image/nonce/state проверки удалён; source/evidence сохранены.

- [ ] Протокол: request `{v:1,id,op,expectedIdentity,deadline,payload}`, response `{v:1,id,outcome:"confirmed"|"not_applied"|"unknown",data}`. Allowlist op: init/inspect/reconcile-user/close-session/dispose; generic evaluate и произвольный JS запрещены. Init передаёт проверенный resource root, origin и **путь** credential-file по pipe, не секрет в argv/env. Stdout только protocol, stderr только безопасные diagnostic codes. Journal intent durable до отправки; mutation одна in flight. Timeout/EOF/crash/невалидный ответ после dispatch → unknown с read-back, без слепого replay. Dispose требует ack и подтверждённого выхода; PID ownership сохраняется до supervisor proof.
- [x] Unit RED/GREEN публичного codec через реальные pipe streams в Bun: framing/correlation/size limits, неизвестный op/id, EOF/timeout и отсутствие секрета в diagnostic envelope; импорт codec не запускает браузер. Bundled Node/Chromium/Loginom нужны только `test/loginom-admin-integration.test.ts`; там проверить запуск настоящего driver, crash после mutation и последующий read-back, а не mock RPC.
- [ ] Реализовать один private context на controller run, transport по pipe без TCP CDP. Перед переиспользованием сверять admin identity/epoch; reconnect только после фиксации неопределённых действий и read-back. Административные mutations сериализовать. Deadline ограничивает login, readiness и ожидание закрытия; отсутствие ожидаемого UI/RPC — явная ошибка adapter capability.
- [ ] Для управления пользователями/ACL использовать перечисленные browser RPC: enumerate exact Name/UserKind → сверить ownership manifest → reuse либо Add → явно Blocked=true при подготовке нового/своего idle-пользователя → необходимое изменение AuthMode/password/rights → getter/enumerator read-back → unblock последним. На unchanged local user setters AuthMode/password не вызываются. Если отдельная необходимая операция не имеет проверенной сигнатуры, использовать детерминированный Playwright UI с точным числом найденных элементов и read-back. Все такие UI selectors фиксируются как versioned adapter contract в этом же коммите. Непроверенные REST endpoint не изобретать.
- [x] Native wire blocked phase на disposable pair: all-kind collision rejection/private credential SHA, Add(dukUser)→Blocked=true→getter read-back; repeat exact supplied owner observation оставляет одного account, unowned name refused. Deferred ReleaseObject удерживал enumeration read lock: fixed immediate release по primary source устранил Add timeout. Target1 PASS/20 (23.03s), combined58 PASS/197 (55.69s), typecheck/diff PASS. Native final00, pair destroyed штатно; private evidence/report evals/docs/2026-10-14-native-blocked-user.md. Это CRUD capability; parent protected ownership/admission/ACL/unblock ещё открыты. Первый draft retained fixture в blockers без обхода fence.
- [x] Native configure/reuse phase: AuthMode local/password/design flags и getters под Blocked=true; unchanged local native owner не вызывает AuthMode/password setters (ровно1/1 call-site writes на два configure). Readonly inspect enumerators также immediate, иначе следующая CONFIGURE ждала read lock/unknown. Target1 PASS/26 (23.42s), combined58 PASS/203 (60.93s), typecheck/diff PASS. Parent ownership/idle closure и ACL/unblock остаются gates; Blocked не принимается за отсутствие старых sessions.
- [x] Native ACL phase: полный expectedPolicy сравнивается до mutation, shortened[] refused; Permissions.Delete снял2 nonempty Everyone grants на2 dirs, read-back точный и repeat removed0. Target1 PASS/35 (22.67s), typecheck PASS; own grant требует exact name/kind/ID, stale own principal даёт отказ. Parent global guard/effective access/own+foreign fixture coverage/unblock ещё open; account blocked.
- [ ] Немодельный интеграционный RED/GREEN на отдельном disposable Loginom: A и B видны под своими identity, два одинаковых create/read-back дают одного пользователя, закрытие A не закрывает B; ответы при разрыве административного соединения не объявляются успехом. Секретный ввод/сетевые ответы login не включать в traces.
- [ ] Проверить `bun test test/loginom-admin.test.ts`, `bun typecheck`; приложить редактированный non-model receipt, коммит `feat(evals): add trusted Loginom administration adapter`.

### Задача 3. Идемпотентная подготовка и all-slot admission

- [x] Parent activation prerequisite: activateOwnedUser требует held normal lease, protected owner/configuration, published exact empty physical root и full empty shared policy до activation intent; перед serialized fenced RPC повторяет protected/storage checks. Native activate read-back проверяет exact account/LocalAuth/safe flags/ACL, parent сохраняет private source-bound receipt. Missing method RED→GREEN native1 PASS/10 (40.76s): missing owner/configuration/root refused без activation intent; first activated:true, repeat:false при неизменных nonce/password/configuration. Final native2 PASS/71 (44.48s) включает dirty-root/closed/recovery-only guards;67 related unit PASS/328 (5.47s), typecheck/diff PASS. Private600 native-parent-activation-c7e5cde7... SHA80b317a3.../28 source/closure/cleanup checks; own pair/root absent. Собственная RED fixture dGorw5 принята через public recoverUnactivatedPreparation/status released и удалена после destroyPair; private recovery evidence сохранён. Это per-user primitive, не all-slot readiness/admission.
- [x] Composed native parent→CLI lifecycle: disposable fixture теперь использует createBlockedUser→configureOwnedUser→reconcileOwnedAcl→prepareUserStorage→activateOwnedUser под held server/inventory, затем phase cli_admitted→actual setup/check→durable ledgers→targeted close. Прежний raw wire provisioning удалён (-39 net lines); private evidence сохраняет protected storage/activation receipt и реальные source commands. RED missing parent receipt→GREEN native1 PASS/33 (59.50s), typecheck/diff PASS; existing corruption/retry/peer-row controls сохранены. Private600 native-cli-sessions-d31c525d... SHA01520393.../240 source/generation/process/close/cleanup audit checks, own pair/root absent. Это normal management native composition на temp slot authority, не production prepare/release или full all-slot readiness; failed CLI/recovery lineage/active attempts/SessionBackup остаются open.
- [x] Configured CLI readonly controls: actual status и recover с отсутствующими pending recoveries сохраняют whitelisted observed view, immutable result/continuous process/native snapshot chains. В обоих окнах не наблюдалось новых user rows; recordManagementSession отказал, frozen setup/check ledgers пережили append. Optional recoveries отсутствует при empty (сверено с product schema/service); starting/browser:unknown не заменяется readiness. Native1 PASS/47 (69.85s), typecheck/diff PASS. Private600 native-cli-sessions-1c1a6e34... CLI SHA5f8fdbee... + readonly.json/295 source/close/cleanup audit checks, own pair/root absent. Это no-op recovery/metadata controls; pending recovery/failed CLI ownership и CAS recovery lineage ещё open.
- [x] Interrupted native check ownership: actual check отменяется после immutable snapshot новой own row; exit130/interrupted:true/timeout:false + confirmed local closure оставили pending Count0 row. RED ledger refused interrupted result→GREEN native1 PASS/51 (82.64s). Ledger/native adopt допускают только interrupted check после verified same-user/profile setup при прежних protected generation/process/snapshot/exact row guards; readiness не выдаётся. Final native1 PASS/57 (92.23s): non-interrupted/timeout data-only result controls rejected; actual interrupted result has no verified reply, close removes only its row and preserves both setup/check rows.68 related unit PASS/351 (9.06s), typecheck/Node syntax/diff PASS. Private600 native-cli-sessions-a0b79119... CLI SHA95d81ad0...; cancelled-check SHA6475d819...;346 source/generation/process/close/peer/cleanup audit checks, own pair/root absent. Failed setup/arbitrary failures/timeout/pending recovery/recovery-only lineage остаются open.




- [x] Native parent blocked preparation/root positive control: real create→configure→ACL→physical publication→repeat проходит на disposable pinned pair, credential/nonce сохранены, passwordChanged true→false, account never activated, exact reserved inode сохраняется. Native RED обнаружил появление root во время account preparation: exclusive physical reservation теперь делается до Add и перепроверяется перед serialized dispatch; unknown existing/planned-only roots не принимаются.3 composed native guards/parent PASS/56 (55.85s), native storage regression1 PASS/21 (34.18s), related unit98 PASS/384 (6.47s), typecheck/diff PASS. Private native-parent-* evidence600 SHA/read-back; successful pairs destroyed. RED XnBhbF incident retained и записан в blockers/diagnosis. Activation/effective access/production cleanup/public prepare остаются open.

- [x] All-slot resource acquisition prerequisite: `acquireEnvironmentLeases` preflights server и выбранные user/profile keys под всеми guards, затем публикует composites с private command-local journal. BUSY B не создаёт A/server reservations или composites; existing run journal не меняется. Recovery и terminal reconciliation проверяют explicit journal/canonical containment/commandId и resource lineage, legacy fallback сохраняется. RED missing API/hardcoded journal → GREEN; actual exited child и foreign/symlink/malformed journal controls.87 slots/lease/user/admin PASS/339 (5.15s), typecheck/diff PASS. Это ownership API, не public prepare, cleanup qualification или production admission.

- [x] Readonly ownership status: public `parallel-env status --config` reads canonical metadata/private pair journal and recorded server/judge/user/profile reservations twice, reports `snapshotChanged` and `admission:not_verified`; no takeover, Loginom login, CLI/Docker subprocess or writes. Metadata projection excludes unrecognized fields; malformed pair nonce/resources refused. Real fs/flock held lease bytes/guards preserved, missing slot reservations null. RED missing module/malformed nonce accepted→GREEN49 status/slots/lease PASS/132 (2.66s), typecheck/diff PASS; actual research CLI status exit0 also with PATH empty, ready recorded pair/two slots/stable snapshot. Readiness fingerprint/prepare/verify live qualification still open.

- [x] Parent staged reconcile orchestration: unsupported no-phase payload заменён на protected blocked creation → confirmed configure → fresh ACL в одном context. Возвращаемые user/ACL hashes не активируют пользователя; physical/effective access readiness gates ещё open. Native RED `ADMIN_CAPABILITY_UNSUPPORTED` при held server lease → GREEN foreign bootstrap name получает `ADMIN_USER_OWNERSHIP_CONFLICT`, protected claim не создаётся;2 native guard tests PASS/45 (24.47s),53 codecs/slots/admin PASS/194 (2.67s), typecheck/diff PASS. Positive нового account full parent flow ещё не проверен.

- [x] Parent staged ACL + server mutation fence: `reconcileOwnedAcl` требует protected configuration/never-activated owner, читает fresh full shared policy и проверяет exact removed count/preserved grants/native read-back/source SHA, возвращает canonical ACL hash. Parent reconcile-user/close-session требуют held `server:<full ID>` lease с exact generation; recovery-only server lease не разрешает user mutations. RED missing ACL method и copied verified pair без server lease достигал native collision → GREEN:2 native guard tests PASS/43 (14.70s), journal до RPC отсутствует;53 codecs/slots/admin PASS/194 (2.44s), typecheck/diff PASS. Global run acquisition и positive parent ACL/effective user access ещё open.

- [x] Protected configure phase: parent `configureOwnedUser` требует held normal lease, staged secret, never-activated owner; latest confirmed configuration SHA задаёт repeat password admission и перепроверяется в serialized queue. `record/readUserConfiguration` сохраняют private/fsynced generation/user/identity/secret binding с exact native safe role/LocalAuth/AllowPublish read-back и command desired/reply/source SHA. RED missing APIs и skipped first password write accepted → GREEN; source drift/after-activation refusal.53 codecs/slots/admin PASS/194 (2.57s), native closed/recovery-only guards1 PASS/37 (8.79s), typecheck/diff PASS. Positive native parent creation→configuration/ACL/activation ещё не проверен; main admission остаётся закрытым.

- [x] Parent readonly `inspectPolicy` возвращает fresh ServerIdentity и проверенные native sharedDirectories/principals; общее `inspect` продолжает требовать квалифицированную session identity. Общий observed-data writer сохраняет private evidence. RED missing method → GREEN на постоянной research pair:1 PASS/31 (7.14s), ACL содержит2 исходных Everyone grants, user mutations отсутствуют и admin processes подтверждённо завершены;52 codecs/slots/admin PASS/181 (2.17s), typecheck/diff PASS. Effective ACL/user provisioning/admission этим не квалифицируются.

**Files:** Create `evals/src/user-environment.ts`, `evals/test/user-environment.test.ts`, `evals/test/user-environment-integration.test.ts`, `evals/script/parallel-env.ts`; Modify `evals/src/profile.ts`, `evals/src/preflight.ts`, `evals/test/profile.test.ts`, `evals/test/preflight.test.ts`.

**Interfaces:** Produces `ReadyEnvironment`, `prepareEnvironment`, `verifyEnvironment`; script `prepare|verify|status`. Consumes admin adapter и slot leases. Публичная standalone-команда закрывает свой admin context; `run.ts` позднее использует те же шаги со своим context.

- [x] V2 profile status exit qualification: `ensureProfile` отказывает PROFILE_STATUS_FAILED/exit2 при nonzero status, даже если JSON имеет ожидаемые username/url/state. Проверены initial status и fresh read-back после успешного setup; оба отказа сохраняют прежний agent config, initial не вызывает setup. Два последовательных TDD RED (ошибочный resolve)→GREEN2/6 assertions; related profile/preflight/user-environment111 PASS/383 assertions81.67s после runner-budget correction ниже; исходный run110PASS/1 timeout5000ms сохранён как diagnosis. Typecheck/diff PASS. Production change6 added lines, legacy policy сохранена; это profile prerequisite, не готовый all-slot admission.

- [x] Durable ownership runner budget: исходный user-ownership test3/3 timeout5000ms; diagnostic budget30000 завершил все61 assertions за7287.98ms. Полный path содержит40 durable publications/80 explicit fsync, без wait-loop/sleep; доля fsync отдельно не измерена, breaking commit не установлен. На том этапе изменён только runner timeout данного test на30000; теперь этот одинаковый local override снят в пользу script default ниже, assertions/production deadlines сохранены. Пять повторов без CLI timeout override PASS/305 assertions39.41s (6.35–9.45s/test), typecheck/diff PASS. Private profile-status-c27d53c4-1d60-4935-b364-c38299b76f0b/diagnosis.json SHA488fcf060a65282f62adfefbfdb52f892398a5733415cc847846f33e44049a27 хранит4 source logs; оригиналы после byte-readback удалены из scratch. Повторный related3-file regression111 PASS/383 assertions81.67s без CLI timeout override; private verification.json SHA2ba0e96cc3baae18c412e3cff49529b928e91b0ffaa02b3dac07db755e9057a3 связывает raw regression log и4 source hashes. Это related suite, не full package regression.

- [x] Shared test runner budget: scripts test/test:unit задают default30000 для durable real-FS cases, два собственных одинаковых local overrides убраны; assertions и production/native operation budgets сохранены. Независимый partial slot recovery имел2PASS2.78/4.35s и1timeout5s, control30s PASS17 assertions4.62s;20 publications/41 sync, waiting loops нет, доля sync времени не измерена. После изменения related5-file71 PASS/412 assertions94.36s и unit-script5 repeats PASS/85 assertions22.51s (3.94–5.08s), typecheck/diff PASS. Private runner-budget-d64f0700-ad6b-4fee-8b78-2d0cdc0e94a1/diagnosis.json SHA9ccfb05b... хранит4 неизменённых source logs; verification.json SHAe5b47fddd986f845df1e27380bec78de092921fff7e72f656349ec2b8cd00d74 связывает source hashes и фактические tool results. Scratch originals удалены после byte-readback. Это test budget correction, full package suite ещё не запускалась.

- [ ] RED через fake CLI: готовый профиль с чужими username/endpoint отвергается до `run`, собственный повторно не вызывает setup. Расширить fake status строго проверяемыми `url`/`username`, сохранив старые fixtures. Пример утверждений после двух запусков preparation:

```ts
expect(receipt.slots.map(slot => slot.status)).toEqual(["ready", "ready"])
expect(second.slots.map(slot => slot.profileGeneration)).toEqual(receipt.slots.map(slot => slot.profileGeneration))
expect(second.changedUsers).toEqual([])
expect(second.changedPasswords).toEqual([])
expect(await Bun.file(foreignSentinel).text()).toBe("preserve")
```

Полная пара `receipt`/`second` требует реального Loginom и выполняется в немодельной интеграционной приёмке; unit RED с fake CLI проверяет только профильную часть через её публичный интерфейс, без fake-admin и без попытки выдать её за полный prepare.

- [x] Подзадача 3: ensureProfile при slotsFile связывает существующий configured profile с exact url/username; чужие/missing fields отказали до setup/config write. 4 fake-CLI RED/GREEN и reuse case (2 status, 0 setup, unchanged generation/cli-profile); 66 profile tests/188 assertions и typecheck PASS (29.22s). Legacy missing fields сохраняют прежний контракт. Fresh setup read-back и полная prepare receipt ещё не квалифицированы; это profile metadata, не доказательство live user/ACL.
- [x] Подзадача 3: fresh v2 setup проверяет exact username/url в ack и отдельном status read-back до записи agent config. Fake CLI читает stdin-json, сохраняет только safe fields; data-only setup fixture раздельно задаёт ack/saved state. RED/GREEN foreign ack и false ack→foreign saved state; positive setup→status→reuse (единственный setup). 8 v2 profile cases/32 assertions, 121 profile/config tests/366 assertions и typecheck PASS (32.65s). Это settings binding; durable prepare intent/real sessions/user ACL ещё не подтверждены.

`receipt`/`second` — JSON публичной будущей `parallel-env prepare`; `foreignSentinel` создаёт тест во временном постороннем каталоге. Счётчики изменения — только безопасный отчёт подготовки, без credential values.

- [ ] Запустить RED: `bun test test/profile.test.ts test/user-environment.test.ts`. Затем реализовать журнал prepare: запланировать операцию с nonce и desired hash → сохранить private secret → выполнить → прочитать фактическое состояние → записать committed receipt. После crash продолжать по read-back, а не создавать пользователя или менять пароль второй раз.
- [x] Подзадача 3: stageUserPreparation под настоящим slot lease сохраняет planned intent с nonce/desired hash/server identity до private secret, затем staged receipt. Повтор сохраняет nonce, пароль и inode секрета; planned с уже сохранённым credential возобновляется без ротации. Потеря lease, drift, orphan secret и missing staged secret дают отказ без замены данных; возвращаются только безопасные поля. RED missing module, orphan adoption и private-field leak → GREEN8 real-fs/flock tests/30 assertions; связанные lease/slots/profile121 PASS/336 assertions (45.37s), typecheck/diff PASS. Это локальная стадия до административного действия; реальный create/update/read-back/committed и crash в RPC остаются открыты.
- [x] Mutation preflight: readUserPreparation под held SlotLease читает существующий staged journal/private secret, проверяет canonical configured slot, endpoint/identity, строгий nonce и SHA credential, не создаёт/меняет файлы и возвращает whitelist. reconcileUser принимает lease; повторяет проверку внутри serialized request перед journal/dispatch и связывает nonce/desired/secret SHA. Native closed-lease RED (раньше RPC ADMIN_CAPABILITY_UNSUPPORTED) → target1 PASS/25 (6.89s), command journal не содержит reconcile-user. Malformed nonce RED→GREEN; closed lease/credential drift сохраняют файлы. Actual create/ACL/unblock всё ещё capability-gated.
- [x] Native wire activate capability для research: exact supplied owner/credential SHA/full empty shared policy/local auth/design+safe flags проверены до Blocked=false, identity+policy read-back после. RED unsupported phase→GREEN activation/repeat, Everyone policy и missing configured SHA refused. Target1 PASS/43 (21.69s), typecheck/diff PASS; disposable pair удалена после confirmed native process dispose. Parent admission/physical root/effective ACL/session close остаются закрыты; next causal design-session probe.
- [x] Native unusual component matrix: normal+8 CSV paths (space/tab/newline/Unicode/dash/dot/nested/autosave suffix),18 собственных pipeline outputs проходят разные A/B literal oracles. Каждый case имеет Finished/Failed positive перед18 negatives; все324 neighbor/shared import/export cases требуют Finished+Failed+targetStatus3. Parent directories реально существуют, native FileName read-back exact, own continuation и full NUL SHA/topology peer/shared сохранены. TDD missing positives RED→GREEN native1 PASS/97 (57.85s), final native2 PASS/215 (93.43s), admin/user/slots60 PASS/260 (3.16s), typecheck/diff PASS. Deadline/supervisor timeouts не увеличивались. Concurrency, server backup policy и production readiness/cleanup остаются open.
- [x] Autosave suffix в native FileStorage matrix: copy.lgp.autosave — отдельный восьмой special filename; собственные copy/read/CreateFile+WriteBuffer и independent NUL SHA проходят, neighbor/shared negative matrix648 denied. TDD missing case RED→GREEN native1 PASS/118 (36.85s), typecheck/diff PASS; previous adjacent2 native/60 unit regression PASS. Это filename copy control; настоящий autosave generation квалифицирован отдельным research probe, SessionBackup policy всё ещё open.
- [x] Native unusual-file negatives: обе стороны A/B отвергают read/write/copy-out/copy-in для normal+7 unusual filenames (virtual/absolute/../, neighbor/common/temp), всего576 operations. Shared cases — реальные копии native own-positive tree; все target/shared bytes хэшируются sha256sum -z, NUL-safe metadata сравнивается без разбиения newline/tab. Own operation до/после сохраняется. TDD old plain-only matrix RED→GREEN native1 PASS/118 (35.24s); final extension-matched destinations/native regression2 PASS/197 (71.73s), admin/user/slots60 PASS/260 (3.40s), typecheck/diff PASS. Component unusual paths, active B и production readiness/cleanup ещё открыты.
- [x] Native unusual-file positives: A/B через собственный FileStorage.CreateDirectory/CopyFile/OpenFile/ReadBuffer создают/читают/пишут7 fixed cases (space, tab, newline, Unicode, leading dash, dotfile, nested path). Byte counts/read flags и независимый Docker sha256sum -z всех14 copies совпадают с own native package;14 WriteBuffer canaries имеют точный SHA байта A. NUL framing не делит newline names. TDD missing unusual/written data RED→GREEN final native1 PASS/118 (38.29s); admin/user/slots60 PASS/260 (3.29s), typecheck/diff PASS. Neighbor/shared unusual negatives и component filename matrix ещё открыты.
- [x] Bilateral native component isolation: настоящие A/B имеют разные input CSV и literal output oracles A9/B11 и A11/B19. Каждый выполняет свой pipeline до/после18 neighbor/shared import/export probes через virtual/absolute/../ (36 denied total), требует native Finished/Failed/targetStatus3. Независимые NUL-safe SHA всех файлов и metadata всего target/shared root неизменны. TDD peer-phase rejection RED→GREEN native1 PASS/79 (31.93s); реальная подготовка peer вынесена для повторного использования FileStorage control; final57 PASS/443 (93.84s), typecheck/diff PASS. Production parent readiness, unusual names и concurrent heartbeat ещё открыты.
- [x] Native shared import/export negatives: fixed component probe использует ModelUnits.Item.ModelUnit.WorkFlow, pinned Import/Export nodes и typed engine FileName setters с read-back. Перед каждым activation/reset полностью ожидается DeactivateAllAsync work item;12 shared common/temp×virtual/absolute/../×import/export дают Finished+Failed и target node mnsInactiveError(3). Own positive/continued runs PASS, физический TSV A9/B11; shared input SHA/NUL topology неизменны. TDD missing denials RED→GREEN native final1 PASS/56 (27.64s), combined component/storage2 PASS/163 (67.40s), admin/user/slots60 PASS/260 (3.17s), typecheck/diff PASS. Evidence600 native-user-29beba5b.../component-probe.json SHA36529410..., actual process/dispose confirmed и pair absent. Neighbor components, unusual names/concurrent B и parent readiness ещё открыты.
- [x] Native server-component positive control: session-component-probe под non-admin designer открывает фиксированный настоящий fixture-group-sum-qty.lgp и выполняет Activate(0) с bounded Finished wait. ImportTextFile читает own data/sales.csv, Group на новом входе A2/A7/B11 даёт A9/B11, ExportTextFile пишет физический TSV с Qty|Сумма; независимый literal oracle проверяет значения/формат и исключает сохранённый результат fixture. TDD unsupported phase RED→GREEN final1 PASS/47 (25.39s), combined component/storage2 PASS/155 (63.56s), admin/user30 PASS/136 (1.48s), typecheck/diff PASS. Исторический artifact CSV fixture не использован как native wire oracle и сохранён без изменений. Native process/dispose confirmed, own pair отсутствует; negative component paths, simultaneous B и production readiness ещё открыты.
- [x] Native shared-root negatives: существующие common/temp получают реальные копии positive package; оба пользователя отказывают read/write/copy-in/out через virtual/absolute/../ paths после удаления Everyone grants. Вместе с neighbor matrix72 operations denied; SHA и NUL-safe topology shared/peer roots неизменны, свой файл после матрицы доступен. TDD RED missing shared scopes→GREEN final1 PASS/108 (40.91s), admin/user/slots60 PASS/260 (4.13s), typecheck/diff PASS. Только basename-safe native policy names переходят в фиксированные probe paths; unknown shared topology не расширяет scope. Import/export, unusual names, concurrent heartbeat и parent readiness ещё открыты.
- [x] Native neighbor storage negatives: два настоящих non-admin designers со своими ненулевыми SavePackageAs/OpenFile/CopyFile controls. A→B и B→A отвергают read/write/copy-in/copy-out для virtual/absolute/../ paths (24 операции); после каждой матрицы свой OpenFile работает, SHA обоих target files и NUL-safe состав/размеры target root неизменны. Foreign peer ID/traversal peer name refused до probe; native peer требует awaited IBGDeductorUser cast перед Blocked read-back. TDD request-shape RED→GREEN, repeated-file collision устранена раздельными fixed own/peer probe names. Native1 PASS/91 (36.13s), broad native/admin/lease/slots/preflight120 PASS/1SKIP/722 (207.09s), typecheck/diff PASS. Shared roots, import/export, unusual names, active B heartbeat и parent readiness ещё открыты.
- [x] Native effective own-storage positive control: fixed session-storage-probe логинится самим configured non-admin designer, SavePackageAs→OpenFile/ReadBuffer→CopyFile→GetFileInfo подтверждают ненулевой свой пакет и копию; physical Docker SHA совпадает. Native RED unsupported phase→GREEN1 PASS/53 assertions (26.57s), канал/ownership30 PASS/136, existing native user+parent2 PASS/129 (73.65s), typecheck/diff PASS. Count0 causal session ledger/close и actual native transport/process dispose сохранены; pair удалена штатно. Это положительный control, не effective isolation PASS: neighbor/shared/read-write-copy/import-export negatives, B heartbeat и parent readiness ещё открыты.
- [x] Native publish policy: configure читает/при необходимости меняет штатный AllowPublish и требует false на read-back; repeated configure сохраняет password/AuthMode setters=1. Missing read-back field RED→GREEN на disposable pair; admin/native/codec/preflight60 PASS/229 (60.90s), typecheck/diff PASS. Source UserForm.js:95 и generated getter/setter подтверждены. Activation/effective ACL/session ownership ещё open.
- [x] Protected ownership codec: claimUserOwnership exclusive0600/fsync под held lease связывает staged generation/Name/UserKind/controller key/native observed ID с confirmed creation journal (identity/id/filename/desired+reply SHA). readUserOwnership повторно проверяет source semantic SHA, credential и lease; inode reuse, foreign generation/source change/renamed journal/closed lease refusal сохраняют данные. TDD missing API и renamed source RED→GREEN;49 user/admin/slots PASS/138 (1.72s), typecheck/diff PASS. Это real-fs/flock data-only evidence codec, не fake-admin/native parent integration; bridge consumption/idle closure/physical marker ещё open.
- [x] Activation intent fence (2026-10-15): stage/readUserActivation под held lease private/fsync связывает generation/user key/native ID/epoch/secret+creation SHA; повтор сохраняет nonce/bytes/inode, foreign metadata и closed lease refused. Effective ownership everActivated=true при любом activation journal (conservative planned/unknown), creation snapshot immutable; parent blocked-create требует idle proof до RPC. RED missing APIs/old false flag→GREEN49 user/admin/slots PASS/151 (1.69s), typecheck/diff PASS. Это real-fs/flock lifecycle codec; parent native unblock должен ещё подключить stage, full prepare/admission/confirmed activation и durable session ledger open.
- [x] Native unactivated-user observation producer: inspectUnactivatedUser под held slot/server fences проверяет protected preparation/never-activation/ownership перед serialized RPC и после, native admin role и актуальный epoch/pair. Допускает absent account либо exact owned blocked account; возможные user-session names отказывают. Private receipt связывает lease token/nonce/ownership с реальным confirmed inspect command и semantic command/reply/receipt SHA. TDD missing method RED→GREEN, отсутствие fence до secret/RPC, foreign account и invalid activation marker refusal без RPC; absent→created blocked native controls.3 native PASS/69 (59.24s),60 unit PASS/260 (3.60s), typecheck/diff PASS. Это observation для будущего unactivated finalizer, не readiness/delete/release proof; production terminal reader/archive/process integration ещё open.
- [x] Parent blocked-user API: createBlockedUser читает held preparation/ownership, повторяет проверки перед serialized dispatch, публикует claim из actual creation journal; repeat требует exact observed account и created=false. RED missing method после успешного native init → GREEN closed lease отказал до secret/RPC, journal без reconcile-user. Native admin/CRUD/codec/preflight59 PASS/226 (59.25s), typecheck/diff PASS. Положительный native parent creation пока не проверен; codec и wire CRUD не заменяют этот gate.
- [x] Global pair guard: verifyParallelPair читает private ready journal/daemon/full IDs+labels/pins/topology/no mounts/restart/marker inventory/Python/DNS/proxy/wsproxy, повторно сверяет journal и expected identity без записи. Parent reconcile-user вызывает его до intent/RPC. RED missing API/path traversal inventory accepted/native missing journal reached RPC → GREEN. Actual pair12 PASS/76 (28.55s): read-only bytes/stale epoch/unsafe marker/Python drift refused, restore и dev сохранность; native parent1 PASS/3 (6.48s), codecs/preflight54 PASS/148 (6.75s), typecheck/diff PASS. Полный prepare, server-run fence, user-root publication и effective ACL ещё open.
- [x] V2 storage guard connected to runAttempt: explicit SlotStorageContext selects own-root branch instead of legacy global emptiness/loginom-net. Held normal lease, protected preparation/account and published storage source/inode, exact immutable Docker source, config/profile/workspace/URL/username/command binding проверяются до CLI; binary slotsFile без context refused. RED actual fake CLI dispatched despite native A leftovers→GREEN; A empty/B nonempty positive, A leftovers/source B/foreign command profile/private inode drift refused, B preserved.62 storage/lifecycle/preflight/slot/user tests PASS/264 (59.48s), typecheck/diff PASS. Общая data-only authority/native Docker fixture вынесена для двух integration suites; она не симулирует Loginom login. Production main admission, active B session, deferred delete/server cleanup и full prepare остаются открытыми.

- [x] Protected user-root publication: prepareUserStorage требует held normal slot/server leases, protected creation source и never-activated ownership; свежий epoch проверяется перед mutations. Private planned→created→published journal связывает preparation/user/source/identity и physical device/inode/UID/GID. Existing foreign root не принимается; marker inventory меняется atomic rename только после проверки journaled inode и исходного SHA, сохраняет остальные rows. Recovery created состояния завершает matching private600/single-link temporary marker либо уже published marker без нового mkdir; conflicting/symlink temp, replaced inode, null journal и lost lease refused без присвоения чужого root. TDD RED missing API/premature inventory/temporary crash/null overwrite/symlink→GREEN75 unit/native tests PASS/359 (64.15s), typecheck/diff PASS. Native Docker filesystem + data-only account authority fixture; full parent account→root/ACL readiness, native cleanup proofs и публичный prepare ещё открыты. Собственный ошибочный teardown fixture восстановлен CAS/release/destroy; permanent incidents сохранены.

- [x] Readonly physical user-root inspection: inspectUserStorage связывает configured slot/owner nonce с проверенным v2 inventory и свежей pair identity; проверяет canonical ancestors/root, стабильные device/inode, fs UID/GID service PID1, NUL-safe metadata traversal без following symlink. Unknown/hardlink/foreign-owner topology отказывает; соседние bytes не читаются. RED missing API→GREEN actual Docker: unusual names, nested/dotfiles/autosave, symlink to B, hardlink refusal, root symlink/UID drift и B hash preservation.12 pair/native tests PASS/89 (32.98s), typecheck/diff PASS; own pair removed/dev unchanged. Inventory здесь synthetic control; protected root publication, native user→root positive control, effective ACL и admission ещё открыты.

- [x] Physical pair marker gate: native symlink marker с прежним JSON раньше принимался (RED); verifyPair теперь требует regular non-symlink file до чтения. Реальная owned factory fixture восстановила исходный marker и сохранила dev pair;12 pair PASS/77 (26.74s), typecheck/diff PASS. User-root ownership publication и hardlink/metadata policy отдельные ещё открытые шаги.
- [ ] Проверить receipt созданной задачей 1а пары, полные IDs, marker v2, restart policy/no mounts, фактический route/`wsproxy=true`/Python-disabled config. Prepare не создаёт и не перенастраивает контейнеры и не перезапускает сервер. Неизвестная или изменившаяся глобальная конфигурация даёт отказ до users/dispatch; исправление квалифицируется отдельно на research pair.
- [ ] Разделить `checkIsolatedLoginom` в preflight на legacy и v2 admission: v2 использует `server.network`/`server.alias` из конфигурации, marker v2, immutable identity и **свой** user root. Глобальные пустота/`loginom-net` остаются только legacy. Интеграционный regression: сеть отличается от `loginom-net`, B содержит рабочие данные, A готов; остатки в A блокируют A. Подключение к dev alias или чужая network identity запрещено.
- [ ] Под существующим server fence создать только принадлежащие окружению users/dirs. `IsDesigner=true`, права просмотра по необходимости, `IsAdmin=false`, `UseGlobalFileStorage=false`; права на свой root и отсутствие эффективных прав на соседей и общие места записи, включая Everyone, проверять под оцениваемым пользователем. Чужое существующее имя/каталог без совпадающего ownership marker → `USER_OWNERSHIP_CONFLICT`, без перезаписи.
- [ ] Подготовить CLI `setup` через stdin, проверить фактическое соединение `check`, закрыть/учесть setup/check sessions. Правильные профили и accounts переиспользовать; исправление дрейфа — только принадлежащий idle-slot или отдельное восстановление. `--reset-profile` не использовать как штатную подготовку.
- [ ] Сделать выбранный `historyDir` действительным: расширить существующий `archiveProfileHistory(profileDir, archiveId)` опциональным третьим `historyDir = \`${profileDir}.history\`` и передавать slot history root в новом пути. Legacy default сохраняется; реальные fs-тесты проверяют отсутствие истории в writable профиле и невозможность монтировать соседний/закрытый архив.
- [x] Подзадача 3: archiveProfileHistory принимает explicit historyDir, default остаётся у canonical legacy profile; до mkdir/moves отказывает same/inside/ancestor root и alias parent. 5 новых real-fs RED/GREEN cases, 9 archive tests/35 assertions и весь profile suite 61 PASS/166 assertions (25.32s), typecheck PASS. Slot caller/sandbox и crash-recoverable durable archive задачи 5 ещё не подключены.
- [x] Strict unactivated observation reader: protected canonical/private receipt+admin0700, exact slot/token/nonce/ownership и confirmed inspect command/reply/source SHA; account и absence matching session вычисляются из raw source. Producer использует reader read-back. Rehashed foreign account/session/admin role/unknown command, source drift/token, public directory, activation и closed lease refused без изменения source bytes. TDD RED public directory accepted→GREEN;88 unit PASS/353 (5.27s),3 native PASS/69 (60.97s), typecheck/diff PASS. Private native-parent-1de4cfc5.../blocked-preparation.json SHA6f2e3d0c..., admin disconnect/process confirmed и exact pair absent independently. Archive/process/terminal producer и public standalone finalization остаются open.
- [x] Admin finalization source: dispose сохраняет фактический reply + confirmed command source SHA в connection.json; readAdminFinalization проверяет private canonical admin/receipt, pair identity, native disconnect и existing continuous process qualifier (producer/owner/launcher/lifetime/two absence passes). Dispose command/reply/source SHA и timestamp внутри lifetime обязательны. TDD missing export RED→GREEN; additional RED accepted reply after process finish→GREEN. Real OS child + data-only codec negatives: unknown/mutated command, foreign producer/owner, unit_after_exit, unknown disconnect refused.90 unit PASS/373 (8.40s),3 native PASS/69 (57.76s), preserved native1 PASS/21 (36.36s), typecheck/diff PASS. Private600 native-parent-d0b109ca... receipt SHA3c780aca... сохраняет full receipt+command; три SHA independently matched, exact pair independently absent. Две superseded own green logs удалены с private audit. Command inventory/lineage + archive/terminal finalizer ещё open; release capability этим не выдаётся.
- [x] Persist-before-spawn admin inventory: optional processInventory требует exact held server fence, existing protected commandId/journal/identity и durably append directory/producer PID до superviseProcess; same-process writes serialized. Connection receipt связывает original inventory/journal/command. readAdminProcessInventory проверяет все continuous finalizations/source SHA и reread inventory; duplicate/foreign producer/journal/receipt command и starting connection refused. TDD missing export и чужая command binding accepted RED→GREEN.90 unit PASS/379 (9.07s),3 native PASS/71 (59.56s), typecheck/diff PASS. Private native-parent-3f77ff84... receipt SHAb628d2c7... сохраняет inventory+connection+dispose sources, SHA independently matched, exact pair absent. Test-only admin prefix collision corrected by processes-admin.json; failed fixture jkdzDM retained и записан в eval_parallel_blockers.md. Command-to-lease lineage/CLI inventory/archive/terminal production finalizer остаются open.
- [x] Normal unactivated finalizer: finalizeUnactivatedEnvironment связывает exact held normal server/slot manifests с protected pre-CLI command; seal через общую inventory queue закрывает новую admin admission. Native owned Blocked/never-activation/no-session source → durable profile archive → admin disconnect/continuous process inventory → fresh own-root ownership/inode/empty observation и archive/journal read-back → реальные slot tombstones → server release. CLI-admitted/recovery-only/foreign manifests refused; missing inventory/sealed command отказ до runtime/launch. Current native parent test больше не публикует test-only cleanup flags. TDD missing module, unsealed completion и missing inventory reached runtime RED→GREEN; concurrent seal one winner, closed/stale refusal.102 unit PASS/457 (15.27s),3 native PASS/81 (61.19s), typecheck/diff PASS. Private600 native-parent-b6417f5a... receipt SHA455426c0... сохраняет command/cleanup/archive/native observation/command/inventory; independent hashes, archive≤dispose, released slot, server proof и exact pair absence подтверждены. Filesystem B canary preserved; active B не квалифицирован.4 superseded own green logs удалены с audit; retained incidents не тронуты. Public prepare/verify, active CLI inventory, recovery-only/partial terminal reconciliation остаются open.
- [x] Programmatic standalone prepare controller: prepareEnvironment получает canonical config/pair/epoch, пишет command intent+admin inventory до grouped leases; один context выполняет blocked create/reuse→configure/ACL→published root. Native inspect capability даёт фактический SESSION_IDENTITY_UNSUPPORTED; production finalizer выпускает normal reservations, private preparation receipt возвращает ready:false/code2 без model/CLI/judge dispatch. Unknown provisioning пишет failed receipt и retains ownership. Native2→1 repeat: stable generation/native ID, changed users/passwords2→0, оба finalizations released. TDD missing module RED→GREEN; invalid0/3/fractional slots до runtime/receipts.105 unit PASS/465 (13.75s), native1 PASS/9 (59.63s), typecheck/diff PASS. Private600 native-standalone-32e214cf... evidence SHAaba025a4...,23 independent checks и exact pair absence PASS; logs600 /tmp/evals-standalone-preparation-{preserved-native,unit}.log SHAd5d6b177.../118023f1...; public CLI/verify, full readiness and unused/recovery-only failure finalization остаются open.
- [x] Public prepare CLI: parallel-env prepare --config --out [--parallel N, default1] использует controller API и default globalLockRoot. Output private/disjoint до runtime; preparation error создаёт failed receipt без measured summary; blocked result пишет receipt600/JSON и exit2. Recover/status сохранены, prepare API загружается lazy. TDD unsupported command/output policy и missing error receipt RED→GREEN.97 CLI/status/offline-recovery/user/admin/slot/lease PASS/430 (12.91s), native1 PASS/14 (75.44s), typecheck/diff PASS. Actual global-root API N2→N1→public CLI N1: users/generations/passwords reuse, все normal reservations released, ready:false/code2 SESSION_IDENTITY_UNSUPPORTED. Private native-standalone-f5f14267... receipt SHAe09a44ce...,36 independent source checks и exact pair absence PASS; logs600 /tmp/evals-public-prepare-{unit,native}.log SHAc199d71f.../d1e1bb31.... Empty own factory draft with missing required lockRoot в test caller удалён после nonce-scoped absence/empty guards checks; private audit сохранён. Verify/full readiness/recovery остаются open.
- [x] Readonly standalone verify API/CLI: verifyEnvironment + parallel-env verify --config --out [--parallel N] разделяют controller/fences с prepare; только читают protected preparation/ownership/configuration, без reconcile/password/root publication. Native finalizer проверяет blocked never-activated user, отсутствие sessions/published empty root/archive/admin closure, releases normal reservations даже при actual capability refusal. TDD missing API и unsupported CLI RED→GREEN;98 unit PASS/418 (6.52s),8 CLI PASS/41 (0.415s), native1 PASS/21 (88.08s), typecheck/diff PASS. Actual prepare2→prepare1→public prepare1→public verify1:10 markers byte-SHA unchanged, native verify operations only init/inspect/dispose, changedUsers/passwords empty, ready:false/code2 SESSION_IDENTITY_UNSUPPORTED. Private600 native-standalone-9dfdd704... receipt SHA112b6df4...,34 independent source checks и exact pair absence PASS. Verify остаётся pre-CLI never-activated, full readiness/неполные preparations/unused/recovery-only finalization open.
- [x] Never-created account finalization primitive: inspectAbsentUserStorage проверяет exact configured slot/current pair, отсутствие inventory claim и physical root включая dangling symlink, canonical ancestors, stable marker/epoch без записи. Normal unactivated finalizer принимает native account:null/serverSessions:absent, archives history before dispose, требует отсутствие publication/reservation source и physical root до slot/server release; owned path сохраняет прежние inode/ownership checks. Credentials/B bytes сохранены. TDD missing absent inspector RED→GREEN native pair1 PASS/46 (34.37s); native unused+owned lifecycle2 PASS/39 (59.74s), related98 unit PASS/418 (6.90s), typecheck/diff PASS. Source-complete unused rerun1 PASS/8 (22.20s), private native-unused-ae4d5c22... SHA0294cfa0...,16 independent source/process/archive-order checks и exact pair absence PASS; recovery-only/unknown created root/automatic partial-failure finalization остаются open.
- [x] Automatic pre-CLI failure finalization: prepare/verify при ошибке и journal phase unactivated вызывает существующий normal finalizer до dispose/guard close; sealed phase не исполняется повторно. Failed receipt сохраняет original reason + actual finalization released/unconfirmed. EnvironmentFailure связывает private controller receipt; public CLI перечитывает/сохраняет его целиком, не теряя closure result, fallback явно unconfirmed. TDD missing failure status RED→GREEN;98 unit PASS/418 (6.90s),8 CLI PASS/41 (0.465s), native1 PASS/24 (97.76s), typecheck/diff PASS. Actual prepare2→1→public prepare1→failed verify missing configuration→verify1: failure USER_CONFIGURATION_UNCONFIRMED/released, next ownership acquired,10 markers unchanged after exact test source restore. Private600 native-standalone-56819dc0... receipt SHA945a9ce1...,5 source sets/41 independent checks/exact pair absence PASS. Unknown/provisioning/recovery-only and partial terminal reconciliation remain open.
- [ ] Реализовать standalone finalization по таблице lifecycle: даже при отказе проверки закрыть доказанно свои probe/management/admin owners; readiness не является lease. Внутренний prepare получает controller context и сохраняет его reservations для run. На текущем этапе тестировать публичные prepare/verify и отсутствие утечки reservations; полная цепочка с run/recover проверяется в задачах 5/8/10. До готовности session/backup/cleanup gates возвращать отказ допуска, не фиктивный ready.
- [ ] Закрепить fingerprint: server/Studio generation, образы, marker, ACL/Everyone/shared directories, component policy, backup policy, CLI/resource digests, выбранные users, canonical roots и shared-auth capability. Перед dispatch каждого run — свежий read-back этих полей и сравнение с durable успешным receipt. Дорогие отрицательные ACL-пробы повторяются при отсутствии receipt, изменении fingerprint, recovery или потере достоверности управления; неизменный fingerprint позволяет reuse. На попытку — lease/generation/session journal/empty-user-root checks, без повторного входа/создания пользователя. RED/GREEN: второй prepare/run без дрейфа не повторяет ACL-пробы; изменение Everyone, image или component policy снимает readiness до первого dispatch.
- [ ] RED/GREEN: неисправный B, занятый lease B, недостаточные права B, несовпадающий route, shared writable Everyone и неподтверждённая backup policy дают exit 2 до первого model dispatch, не уменьшают `parallel`; освобождаются лишь заведомо чистые reservations. После неясного provisioning сохраняются журнал и удержание соответствующего владения.
- [ ] Проверить `bun test test/profile.test.ts test/preflight.test.ts test/user-environment.test.ts` и `bun typecheck`; коммит `feat(evals): prepare reusable user environments before dispatch`.

### Задача 4. Session ownership и положительное исследование SessionBackup

- [x] Empty/non-browser agent accounting (2026-10-16): explicit empty browserBindings/runtimeDirectories принимаются только без новых причинных same-user rows; native окна/normal lease/preparation/activation/closed process revalidated и пустой physical invocation остаётся в sealed inventory. Новая row без browser linkage отказывает до ledger publication. TDD text provider RED→GREEN2/16; actual no-browser RED AGENT_SESSION_BROWSER_UNCONFIRMED8 assertions101.29s→GREEN1/16 102.39s; metadata-omission copy RED wrongly published ledger25 assertions137.36s→guard→оба native2/55 PASS242.82s. Original proof unchanged, omission не публикует новый ledger, genuine Count1 close/empty result/setup baseline сохранены. Related49/248 PASS58.87s, typecheck/diff PASS. SQLite oracle исправлен по actual DB4096+WAL848752+SHM: копия family даёт committed SDK session1/quick_check ok, originals unchanged; native test читает приватную копию всей family. Private d84be043… auditca5c3ea5…1648 checks/108 sources/16 causal frames и71e4d75c… audit06a69132…80/58/6, обе15 source+binary pins; own pairs/networks/controller roots absent, histories retained. Два дублирующих unexecuted own audit drafts удалены после verified-copy; originals не менялись. Общий slot/attempt finalizer, recovery, production/live admission ещё открыты.

- [x] Общий collector management/browser-agent (2026-10-16): collectSlotSessions сохраняет строгий management-only API и связывает normal held lease с journal-registered agent inventory, sealed process proofs и полным списком invocation observations. Пропущенное окно/незакрытый inventory/неизвестная same-user row запрещают accounting; current и все historical snapshots сверяются с обоими видами causal ledger, closed ledger не покрывает текущую строку. Setup/check остаются Count0, agent count проверяет close API. TDD missing export RED→codec GREEN; related48/245 PASS55.60s, typecheck/diff PASS; native actual setup+runAgent1/36 PASS150.78s, unsealed/missing invocation и legacy strict refusal проверены, после agent close setup ledger сохранён. Private native-agent-replay-ca96f759… audit0546e73b…1658 checks/113 sources,20 causal snapshots/15 source+binary pins, обе actual CLI families, archive/target close и exact own pair/network/controller root absence. Private history retained. Empty/non-browser invocation qualification, общий finalizer/recovery и production admission остаются открытыми.

- [x] Agent archive-before-close/native adoption (2026-10-16): closeAgentSession принимает revalidated causal ledger только с committed архивом exact profile/physical CLI invocation после continuous closure; full archive replay проверяется перед RPC. Missing/слишком ранний архив отклонены до native close. Driver повторно сверяет lease/user/activation, frozen process entry/proof/snapshots/archive, свежую user+Name/CreateTime identity и pending/package count, затем адресный CloseSession/absence. Terminal sidecar связывает exact adopt+archive/command/reply SHA, повторное закрытие/read-back после sealing идемпотентны. TDD missing export RED → native SESSION_SOURCE_UNCONFIRMED RED19 assertions154.46s → GREEN1/29 PASS134.46s; related48/233 PASS50.73s, typecheck/syntax/diff PASS. Private native-agent-replay-d75f5d7a… audit0c35e3dc…1648 checks/66 sources,15 causal snapshots/13 code+binary pins; все archived tree inodes/bytes и исходный SDK session ID в БД сохранены, непустой setup baseline пережил target close. Own pair/network/controller root отсутствуют, отдельный private historyDir retained; deletion/release/readiness не выдаются. A/B management regression1/20 PASS164.60s: прежний Count0 close/finalizer работает при активном B, B затем успешно продолжает check. Private native-two-users-79a7ca24… audit5d6da801…634 checks/183 sources подтверждает source bindings/continuous closures/archive order и exact own pair/network/root absence. Полное same-user accounting/finalizer/recovery/production admission и backup/licence/LLM gates остаются открытыми.

- [x] Read-only agent session ledger (2026-10-15): readAgentProcess проверяет отдельный confirmed CLI entry до общего sealing; entrySource хэширует именно запись и сохраняется при append/seal. Real Bun child подтвердил refusal для нового planned entry и чтение предыдущего completed. recordAgentSessions/readAgentSession связывают held normal lease, protected preparation/user/activation, exact process entry и native before/during/after одного admin context; все during пересекают actual closed process lifetime, неизвестная новая after-row отклоняется. Actor agent содержит admission command ID и UUID CLI invocation; Name/CreateTime сохраняются точно. TDD missing API RED→reader GREEN1/14; native ledger import RED→GREEN1 PASS/20 assertions107.77s, related8/59 PASS16.07s, typecheck/diff PASS. Private native-agent-replay-cbed6057… audit5b8e2e68…94 checks/50 sources,16 overlapping snapshots/12 source+binary pins, own pair/network/root absent. Read-back до/после sealing и bad entry SHA/window controls PASS. Driver adoption, archive-before-close, полное same-user accounting/recovery и production admission остаются открытыми.

- [x] Native agent run research (2026-10-15): actual installed CLI через runAgent/bubblewrap, private active user/profile и детерминированный local SSE provider. Skill activation → штатный dock_prepare(new_draft) → final text, exit0; continuous CLI/Chromium и admin transport/dispose подтверждены. Новая active Count1 row пересекает actual process lifetime, после local closure та же row pending Count1. Native1 PASS/14 assertions105.74s; related5/46 PASS, typecheck/diff PASS. Local provider TDD покрывает activation/prepare/finish, model=replay и CDP GET404; paid model/judge0. Private native-agent-replay-6b26e673… audit665a2bea…87 checks/45 sources,15 overlapping snapshots,11 tested source/binary pins и exact own pair/network/root absence. Ledger actor kind=agent/targeted close/release/admission и N2 ещё не квалифицированы. Skill-only negative control eaced503… имел exit0 без browser/session; два ранних retained fixture incidents описаны в eval_parallel_blockers.md.

- [x] Hard-crash backup observation (2026-10-15): named/modified package, native pending Count1 row и autosave5062 bytes при period5000/keepAlive1800000 → old admin disconnect/continuous closure → kill exact own disposable daemon CID. Docker state exit137/OOMKilled=false, restart preserves IDs/new StartedAt+epoch, новый admin init/inspect/dispose/closure. SessionBackupManager list до crash пуст; physical backups после kill/после native-ready startup пусты, SessionBackup.cfg после restart absent; positive/disabled policy всё ещё не доказана. Native oracle RED expected137/observed0 (68 assertions68.85s)→one command change→graceful+hard GREEN2 PASS/146 assertions147.83s, typecheck/diff PASS. Private native-user-831bf8d0-e994-4722-8d64-0963f15ffd35 audit7678658c18976971879db5dc3c56d1f906a0b2dc1ed0f2b736a6985adcf03f4e (24 checks/32 sources); graceful62678829...22/30, RED678fa71a...21/34; verificationfa28c0dd... перечитала96 source hashes/copied empty dirs/все3 exact own pairs+networks+roots absent. Production code/grants не менялись; model/judge0.

- [x] Graceful restart backup control (2026-10-15): настоящий named/modified package + nonzero autosave, old admin disconnect/continuous closure до own server stop; restart exact disposable CID даёт новую StartedAt/epoch. Новый native admin init/inspect/dispose квалифицирует готовность daemon перед физическим снимком. Backup root пуст до/после startup, SessionBackup.cfg отсутствует. Native1 PASS/70 assertions65.18s, typecheck/diff PASS; private native-user-72d4968d-8965-4308-8c3d-a13b6c979513/source-audit.json SHA6e1029b0f0d616178a5b3e0cec23047984b3e1fd2b26cd820bb3ec1aae63b655,17 checks/30 sources, оба continuous closures и exact pair/network/root absence. Это отрицательный результат нового recipe, не positive backup/disabled policy; hard-crash/startup в этом graceful control не проверялся, отдельный опыт описан рядом. Production admission закрыт.

- [x] Native two-user management qualification (2026-10-15): own fresh research pair; genuine A/B CLI setup overlap with distinct profiles/users and inventories. A archived/targeted close while verified B CLI held by guarded SIGSTOP; B original session survived, SIGCONT and a fresh B check returned LOGINOM_CONNECTION_VALID. Finalizer closed1 A +3 B sessions with delete/admission=false. Existing implementation qualified, no new production RED claimed. Native1 PASS/16 assertions (167.84s), typecheck/diff PASS; independent source audit584 checks/177 sources, four CLI +admin continuous proofs, archive<close within B lifetime and fresh B check after close. Private native-two-users-6ebb9781-90c4-4057-9241-0f688b7f8c16/source-audit.json SHA0ea06a6ad25f942d1553f7b59fd9fa1e188d7a449aa3f2e352e5d2064a82eea6, verification1c363ada...; exact pair/network/root absent on same daemon. No storage deletion/normal release/readiness/resource/licence PASS; SessionBackup and full active cleanup remain open.

- [x] Awaited own admin transport teardown: pinned connector Disconnect возвращает void и запускает RPC dispose без await; driver ожидает именно FServerConnector.$FSession.Disconnect() Task, затем browser closure. Initialized parent receipt требует transportDisconnect=confirmed, иначе quarantine. Native admin A сохраняет baseline перед входом B; causally new B Count0 row исчезает по independent bounded read-back после B dispose, A продолжает package probe. RED отсутствующий explicit transport ACK→GREEN target1 PASS/118 (45.36s); полный admin/native/backup/failed-init/codec/slots/lease/preflight110 PASS/573 (139.76s), typecheck/diff PASS. Backup controlled own stop сохранил корректный teardown. Parent receipt поле подтверждено native; failed initialization без session не объявляет transport confirmation. Runtime session inventory/positive slot cleanup/release/full prepare остаются отдельными gates, grants не ослаблены.

- [x] Native reconnect close по persisted claim: новый independently supervised admin process не принимает старый volatile proofId без adopt. Private canonical UID600/single-link claim + identity/binding и confirmed command desired/reply/source SHA повторно проверяются; fresh native account/row handles, Count0/pending→CloseSession→bounded absence и repeat observed_absent PASS. Wrong claim SHA/binding/mode0644/source drift refused до RPC; первый admin продолжил package probe после закрытия второго. Parent closeOwnedSession формирует adopt после полного ledger read, cross-context closure codec требует exact adopt SHA, same-context совместим. RED native lost binding/codec rejected new journal→GREEN native1 PASS/108 (41.63s),103 codec/admin/slot/lease/preflight PASS/342 (10.67s), typecheck/diff PASS. Новый test fixture missing import исправлен без production workaround. Это native wire + data-only codec, full parent provisioning/session inventory/CAS recovery и active Count1 adoption ещё открыты; own pair удалена после обоих process proofs. Следующий native gate — собственный admin finalization, а не browser exit.

- [x] Controlled real autosave source: experimental fixed backup probe waits published design-UI initialization completion (after late default period write), reads native storage roots/period5000, creates named changed package without execution and samples2 actual periods at period/4 cadence. Real own `.lgp.autosave` copied privately with bytes/SHA/user/session/current identity. RED startup period drift→handshake; named autosave target1 PASS/51 (40.56s), final native/admin/slots/lease/user/preflight107 PASS/504 (135.67s), typecheck/diff PASS. SessionBackup native list and physical root stayed empty even after own graceful stop; receipts preserve `sessionBackupQualified:false`, production ledger/main admission unchanged. Positive SessionBackup/enforced-disabled remains[] and documented in blockers. Separate research test preserves existing session-close cases; no timeout increase.

- [x] Native A close while B remains active: отдельная own disposable pair, A fixed empty-package Count1/pending; independently supervised B design browser меняет named package и ждёт native autosave. Fresh manager B Count1/pending=false до/после A CloseSession, A absent, B exact name/time и native user identity подтверждены успешным завершением B, canary SHA неизменен и actual autosave ненулевой. Fixture missing route RED; ошибочное ожидание autosave перед живой observation и cross-context proxy equality исправлены по фактическим timestamps/rows. Итог native1 PASS/78 (82.84s), typecheck/diff PASS; private600 native-user-06b1d620... peer-survival SHAd96f30d2.../31 independent audit checks/3 sources подтверждают ordering, account identity, continuous closure обоих admin и own pair/root absence. В новом active-user fixture main lifetime90/peer60/request30/outer180 учитывают два login и2×5000ms; обычный reconnect30/20, остальные main60/outer120 и production deadlines сохранены. Two account setters ожидаются2/2. Primary safe code/location сохраняются до teardown. Timeout E8Sfcy и PAIR_REMOVE_UNKNOWN YSqAwr исправлены public destroyPair после qualified process closure; private failed evidence сохранено, normal success из него не синтезирован. Это session-close noninterference, не storage cleanup/regrowth/backup qualification/full admission.

- [x] Pre-runtime reconnect phase guard: normal `cli_admitted` допускается до sealing в обоих admission guards; `finalizing` и recovery CLI остаются запрещены. Public real-fs RED получил SEALED вместо проверки missing binary → GREEN1/9; full admin24/87 PASS8.91s, typecheck/diff PASS. Команда и inventory unchanged на отказах; Actual sequential native handoff затем PASS1/38 (145.30s) в следующем пункте.

- [x] Live cancellation observer не использует strict nlink-reader для изменяемого producer manifest: атомарная замена оставляет уже открытый inode с nlink0 (real-fs control), тогда как immutable snapshot и settled inventory сохраняют строгую проверку. Native LEASE_FILE_PRIVATE RED→GREEN finalizer1/53 (174.94s), audit154/11/read-back, typecheck/diff PASS. Check завершился раньше abort (exit0/interrupted=false); фактическое прерывание и прежний ARCHIVE_TOPOLOGY этим не квалифицированы. Private native-cli-sessions-70a965d2... terminal SHA2f1da010...; own root/pair absent.

- [x] Reconnect accounting по qualified composite identity: original native CLI observations сохраняют causal proxy/source guards; свежий context сопоставляет exact owned user/epoch/Name/CreateTime/Count0 с уникальным ledger. Unknown row, Count1 и duplicate tuple refused. Native RED MANAGEMENT_SESSION_UNKNOWN на двух changed proxies→GREEN actual sequential admin handoff/setup+completed check/finalizer1 PASS/38 (145.30s); оба targeted close и fresh absence, оба continuous admin closures, held leases/no storage or admission grant подтверждены. Private native-cli-sessions-59b958c6...; independent audit145/15 artifacts/read-back PASS, terminal SHA32005ebd..., exact pair/network/root absent. Дополнительные blocked writer/proc/архивные incidents не объявлены исправленными.

- [x] Corrupt observed ledger preservation: `recordServerSession` отличает ENOENT от существующего JSON null, создаёт файл только при отсутствии и не переписывает неизвестный persisted state. Public actual-FS RED перезаписал null и resolved→GREEN сохраняет bytes и SESSION_IDENTITY_CHANGED; target1/61 PASS7.60s, related37/195 PASS42.10s, typecheck/diff PASS. Существующий terminal reader уже отвергает null до producer, его поведение не расширялось. Native server не подменяется; это data-only durable codec control.

- [x] Parent retained-package producer/reconnect close: `observeOwnedSession(..., "retained-package")` использует fixed native probe и protected parent ledger; independently supervised второй admin усыновляет private exact claim/source hashes и заново проверяет causal Count0→1→1/pending trace перед Count1 CloseSession. Normal management Count0 rule сохранено. Producer RED ordinary phase→GREEN1/14 (70.65s); reconnect RED SESSION_SOURCE_UNCONFIRMED→GREEN1/16 (97.50s), repeat/fresh absence и оба admin continuous proofs PASS. Private600 native-parent-activation-576bd87a... retained-close SHA c1ef86c7.../34 independent audit checks/5 sources, exact pair/root absent. Related37 tests/193 assertions PASS (40.78s); unchanged native wire/Count0/reconnect matrix1/118 PASS (72.21s), typecheck/diff PASS. Это controlled empty-package session, не arbitrary active operations/CLI SIGKILL/B survival/storage release; backup policy и эти gates остаются open.

- [x] Durable codec controlled Count1: `recordServerSession`/`readServerSession` принимают только fixed session-package-crash-probe с causal Count0→1→1 и exact pending=true/Count1 после disconnect. Normal phase Count1, missing/changed/nonpending disconnect и Count0 afterPackage refused. TDD phase rejection RED→GREEN11 tests/109 assertions (22.52s), typecheck/diff PASS. Это data-only codec; parent producer/native reconnect adoption отдельным следующим шагом. SessionBackup RPC boundary записана в blockers, gate остаётся open.

- [x] Controlled native retained-package close: fixed `session-package-crash-probe` оставляет ровно один собственный пустой пакет, закрывает только свой writer context с onpagehide fault; causal row сохраняет Count0→1→1 и pending=true. Volatile binding фиксирует допустимый Count1 только для этой phase. Fresh exact account/epoch/Name/CreateTime proxy → CloseSession → bounded absence; чужие name/time refused, повтор observed_absent. RED unsupported phase и затем SESSION_NOT_IDLE → GREEN target1 PASS/84 (32.90s); итоговые native/admin/slots/lease/user/preflight106 PASS/454 (86.55s), typecheck/diff PASS. Новый phase не принимается production parent ledger, qualification=false; CLI SIGKILL, arbitrary active operations, B survival, backup and recovery ещё open.

- [x] Native reverse scope control: ScopeFindObjectAsync(managed row, IBGCustomDeductorServerSession) возвращает null для всех12 rows при собственном GUID4caebf76-7323-47e0-91c9-bb383f6cbcb5. Persisted sessionGuid:null не заменяется username/обычным proxy ID. TDD missing row observation field→GREEN target1 PASS/15 (7.36s); admin integration/unit/preflight48 PASS/131 (35.95s), typecheck/diff PASS. Evidence research/controller/admin-QVtacx/session-observations.json. Два поддержанных scope пути не дали identity linkage; qualification=false/close/delete/model admission запрещены. Следующий research — другие опубликованные managed metadata и контролируемая связь SessionManager, не эвристика по имени.

- [x] Native own-session scope lookup: поддержанный ScopeFindObjectAsync(session, IBGManagedSessionInfo), подтверждённый BG_Interfaces.js:70–93, возвращает null на research. Receipt сохраняет managedObjectId:null, не отождествляет его с обычным Session proxy ID. TDD missing observation field→GREEN target1 PASS/14 (6.49s); admin integration/unit/preflight48 PASS/130 (35.84s), typecheck/diff PASS. Own GUID122e93cc-0e44-4ee7-b6cf-deeef8ba0b28, managedMatches0, rows10; evidence research/controller/admin-x1eDkF/session-observations.json. Это отрицательный control конкретного supported scope path; обратная row→Session scope связь/CLI/reconnect/close ещё исследуются, unsupported capability всей платформы не утверждается. Qualification остаётся false.

- [x] Native readonly session observations на configured research с pinned candidate: actual inspect получает собственный Session.Guid/proxy object ID и managed row object IDs через поддержанный ProxyObjectsHelper.GetObjectId после await Session. Cached-only ID чтение дало ADMIN_OUTCOME_UNKNOWN; правильный async getter подтверждён первичным rpc.js и native run. Parent сохраняет private/fsynced whitelist observations с exact ServerIdentity, counts/pendingDisconnect и qualification=false, не raw frame. Target1 PASS/13 assertions (6.51s); admin integration/unit/preflight48 PASS/129 (36.69s), typecheck/diff PASS. Собственный GUID75f1cd6a-c753-460a-ae80-439a635ff4d7; session proxy отличается от всех managed row IDs (0 direct matches), есть pending/active rows. Evidence research/controller/admin-w6rH8L/session-observations.json. Username не даёт ownership/close; inspect по-прежнему SESSION_IDENTITY_UNSUPPORTED, delete/signals/ACL/model dispatch не выполнялись. Stable/reconnect/CLI mapping, адресный close, backup policy остаются открытыми.

- [x] Causal native design-session probe: fixed session-probe phase проверяет active account/SHA/full empty policy, отдельный context supervised browser выполняет login/CreatePackage/ClosePackage(new Ref,5000). CurrentUser exact native ID/Name и false/true admin/designer совпали; одна new managed row objectId/Name/CreateTime стабильна при Count0→1→0, context закрыт до reply. Unsupported phase RED→GREEN target1 PASS/53 (29.28s), codecs30 PASS/98 (1.187s), typecheck/diff PASS. Private evidence native-user-8a546f36.../session-probe.json; own disposable pair/profiles удалены после confirmed process disposal. Qualification=false; next negative fresh-proxy close races/reconnect/durable ledger/backup.

- [x] Bound native already-closed read-back: close initially stable3/3 SESSION_IDENTITY_CHANGED, afterDisconnect доказал отсутствие causal row по ID и Name/CreateTime. Volatile probe proofId/exact tuple + fresh native account/epoch/manager inventory подтверждают observed_absent после writer context closure; foreign proof/name/time rejected, repeat idempotent. Unsupported RED→GREEN, native/admin/codec/preflight60 PASS/260 (73.81s), typecheck/diff PASS. Successful evidence native-user-172fece6...; diagnosis и source pagehide→Finalize в native-blocked-user.md. Это уже завершённая сессия: retained-row CloseSession RPC, reconnect, durable ledger/recovery/backup ещё open; parent generic close unsupported.

- [x] Native targeted empty-session close: обычный context disconnect иногда оставляет pending/Count0 row, поэтому immediate absence assertion снята по actual counterexample. Fixed own-renderer onpagehide fault injection воспроизводит retained native row; fresh exact account/epoch/Name/CreateTime proxy + Count0/pending true → CloseSession(proxy,5000) → bounded fresh absence. Changed name/time отказали до mutation, valid RPC closed и repeat observed_absent. RED missing fault phase→GREEN target1 PASS/71 (30.17s); final60 admin/native/codec/preflight PASS/271 (77.49s), typecheck/diff PASS. Evidence native-user-d3ec9d6a.../session-crash-{probe,close}.json; own pair destroyed after process proof. CLI SIGKILL, active packages, reconnect, durable ledger/parent authority/backup ещё open; qualification=false.

**Files:** Modify `evals/src/user-environment.ts`, `evals/src/loginom-admin.ts`, `evals/test/user-environment.test.ts`, `evals/test/loginom-admin.test.ts`, `evals/test/user-environment-integration.test.ts`, `evals/test/loginom-admin-integration.test.ts`, `evals/docs/parallel-users-contract.md`; Create fixtures доказанных обезличенных ownership observations в `evals/fixtures/parallel-users/`.

**Interfaces:** Produces durable session ledger и подтверждённая backup policy, потребляемые `cleanupSlot`. На ещё не подтверждённой policy live допуска нет.

- [ ] RED через уже введённые в задаче 2 `AdminConnection.inspect` и `selectOwnedSessions`: несколько своих сессий учитываются, неизвестная сессия того же username или запись прежнего epoch не получает подтверждённого ownership. Unit-тесты проверяют публичный selector, реальные browser-ответы — немодельный adapter fixture. Тест полной команды recovery и её запрета delete перенесён в задачу 5; задача 4 не вызывает ещё не созданную команду.

- [x] Management session codec + parent producer (2026-10-15): record/readServerSession связывают held composite lease/token/slot/run command, user generation/activation/identity, exact one new row/count0→1→0 и confirmed private command id/payload/reply/semantic SHA; private/fsynced whitelist observation/read-back. Source change/foreign manifest token rejected. Parent observeOwnedSession revalidates preparation/owner/activation до serialized RPC и пишет ledger до return; native closed lease RED missing API→GREEN1 PASS/27 (6.59s), codecs/slots/admin49 PASS/157 (1.73s), typecheck/diff PASS. Codec fixtures data-only, native positive parent producer не квалифицирован. Actor пока management/attempt=null; CLI/setup/check, close state/recovery и full ledger open.
- [x] Management close terminal (2026-10-15): отдельный private/fsynced receipt с confirmed same-context close journal, original proofId/binding/epoch/desired+reply/semantic SHA; reader checks обе source chains и effective closed. Changed close source/corrupt/null receipt rejected; null→observed было RED, исправлено. Parent closeOwnedSession verifies held ledger/current identity/context и serialized reread/pair guard до RPC, persist terminal после ack. Data-only codecs/slots/admin49 PASS/163 (2.14s), native closed lease RED missing method→GREEN1 PASS/28 (7.07s), typecheck/diff PASS. Native positive parent lifecycle, recovery lineage и CLI/setup/check producers open.
- [x] Management process inventory: held normal slot + cli_admitted journal обязательны; private planned entry записывается до dispatch, continuous owner/producer/launcher proof сохраняется и перечитывается после exit. Setup/status/check/recover/providers status whitelist исключает произвольные аргументы и stdin из inventory. Source tamper, чужой producer и закрытый lease отвергаются. Real OS probe и fake-CLI seam проверяют wiring; installed pinned CLI unconfigured status проходит без Loginom login/model. Native PROFILE_FORMAT_INVALID исправлен пустой fresh fixture, проверка CLI сохранена. 146 unit PASS/552 (60.94s), native1 PASS/5 (2.86s), typecheck/diff PASS. Это process evidence, session correlation и active cleanup остаются open. Пять своих старых native fixture roots удалены после проверки continuous proof и отсутствия exact PID/starttime; private audit management-native-draft-cleanup-20261015.json SHA7ddeac08... сохранён.
- [x] Durable management inventory registry prerequisite: command journal получает exact file/slot/leaseToken/profileDir до first dispatch. Registration сериализована по journal; существующая запись при повторе byte-identical, alternate file на том же slot/lease refused before child. Actual OS child independently checks journal registration: RED missing registration→GREEN1 PASS/27 (3.54s), typecheck/diff PASS. Это discoverable ownership prerequisite для management finalizer; sealing/all-owners/archive/close/release остаются open. Parallel OS controls2 PASS/30 (5.10s), related69 PASS/358 (16.61s), typecheck/diff PASS. Cooperative SIGINT может завершиться exit0; actual receipt сохраняется до assertions, data-only failed-result controls задают exit130/replynull и восстанавливают оригинал. Native56 assertions прошли, outer200s остановил factory destroy после confirmed admin closure; public destroyPair resumed→destroyed/root removed,162 source/audit checks PASS. Fixture aggregate now360s for five60s CLI calls plus native lifecycle; individual60/30s guards unchanged. Cold native1 PASS/56 (193.44s), private native-cli-sessions-1d3cde44... registry SHA989e512f.../181 source/closure/cleanup audit checks, exact pair/root absent. Cancellation race now permits only interrupted outcome or exact verified successful completion; no readiness granted. Explicit data-only failure variants independent of the race. Scratch TMPDIR=/home/kiselev/storage/tmp; new-scratch related default5/10s guards timed out6/69, isolated3 repeats дали timeout2/3 у10s guard; passing9.21s. Только2 module runner guards→30s; target2 PASS/30 (16.19s), first10.45s/typecheck PASS; related30s69 PASS/358 (94.19s); final exact-source cold native1 PASS/57 (183.05s), private08dac3a1... registry SHAf266cea3.../177 audit checks, exact pair/root absent.

- [x] Management admission seal: under the shared journal queue validate the complete held normal slot set, registered inventory bindings and all closed process sources; reject an active or changed producer without phase mutation. Seal management and admin admission before profile archive; no new management/admin dispatch after phase=finalizing. TDD actual OS2-slot producers: old phase gate RED→GREEN1/8; duplicate-proof acceptance RED→refusal GREEN1/10. Held full set/hash/live writer/post-seal dispatch controls:25 unit PASS/120 (26.71s); final expanded69 unit PASS/370 (105.74s), typecheck/diff PASS. Final-source native1 PASS/62 (186.23s), private5317c73a... sealed SHAe17d353f.../184 source/admission/closure/cleanup audit checks, exact pair/root absent. New live OS probe holds1s for durable subreaper admission after actual failed proof retained pending CLI; production proof checks unchanged.
- [x] Activated management session finalization (normal path, leases retained): native all3-open TDD missing API RED50 assertions/184.91s; minimal implementation/typecheck PASS; native GREEN1 PASS/53 (291.45s), privatefa2f4727... finalizer SHA9b4f5f11.../251 audit/11 artifacts, exact own pair/root absent. Real extra unregistered CLI unknown-row control1 PASS/56 (211.19s), private9a6be541... unknown-finalizer SHA513d1323.../155 audit/9 artifacts; known3+unknown1 preserved, zero close commands/closed terminals/finalization receipt; own pair/root absent. Final related53 unit PASS/346 (104.22s), typecheck/diff PASS; consume the sealed complete source set, archive every profile before first finalizer server close, account for all known sessions and refuse unknown same-user sessions. No deletion/release without the remaining backup and storage gates.
- [x] Complete normal management session accounting: collectManagementSessions derives every setup/check ownership ledger from the frozen inventory, validates supported successful readonly outcomes, reconciles all historical/current same-user rows against exact bindings and refuses unknown rows. Native TDD missing API RED46 assertions/153.66s. Collector derives setup/check ledgers, requires sealed inventory SHA, verifies readonly success and exact historical/current bindings. Native GREEN stopped before collector on separate writer-release proof (2 assertions/90.23s); retained aEnKx5/blockers, no authority forged. Casefold same-user data-only RED resolved→3 PASS/6, bare username and peer controls; related37 PASS/185 (48.89s), typecheck/diff PASS. Final exact-source cold native1 PASS/71 (185.02s), private333b6dc5... accounted SHA3b79a699...;217 linked inventory/observation/ledger/archive-order/terminal/cleanup audit checks over10 artifacts, own pair/root absent. Native extra-row/package controls data-only and restored; actual CLI/admin source chains genuine. Prior writer failure remains separate; no close/delete/release authority granted by accounting. Caller uses a fresh immutable observation after all local producers stop; no close/delete/release authority from accounting alone.
- [x] Management archive prerequisite: archiveManagementEnvironment consumes only finalizing normal command/full held slot set and requalifies every frozen source before moves. Durable per-slot archives bind lease tokens and exact sealed command; repeat reuses committed manifests/receipt, retains settings and reservations. TDD missing API RED→GREEN1/36 (10.14s); pending B initially moved A (RED)→all-profile settled preflight GREEN1/38 (11.46s). Changed-source refusal added; related36 PASS/212 (41.87s), final typecheck PASS; final-source archive/recovery16 PASS/161 (57.11s). Native fixture moved first close after archive and retains all3 live own rows in before-close observation:1 PASS/67 (171.08s). Private e3acc33c... archived SHAde0c6b49...;188 linked source/archive-order/session/closure/cleanup audit checks, exact own pair/root absent. Native canary data-only; CLI/session operations genuine. All-owner session accounting/unknown-session refusal and storage/backup gates remain separate.

- [x] Immutable native session snapshots: inspectSessionInventory пишет отдельный private command-bound whitelist snapshot для каждого inspect; readAdminSessionInventory проверяет canonical admin root/UID/mode, exact schema/identity/session row uniqueness, snapshot+command semantic SHA, confirmed inspect/desired+reply hash и ordered timestamps. Возвращает sessionIdentityQualified:false; generic inspect readiness gate сохранён. TDD missing method/export RED→GREEN; changed snapshot/command/epoch и malformed count refused.92 unit PASS/396 (15.58s),1 installed-CLI test SKIP; native1 PASS/57 (15.48s), typecheck/diff PASS. Два последовательных actual inspect сохраняют первый snapshot byte-identical, native admin disconnect/process closure confirmed. Private600 native-session-inventory-6cfbb015.../snapshots.json SHA354e282c...,2 source snapshots/commands/continuous finalization checked. Следующий шаг — связать before/after snapshots с actual CLI process inventory; snapshots alone не дают ownership/close/delete или readiness.
- [x] Management before/after native snapshots: при supplied trusted admin superviseManagementProcess сохраняет before ref в planned entry до actual CLI dispatch, after — только после qualified local closure. Reader revalidates обе immutable native chains в том же private controller root/current identity и проверяет before.settledAt≤process.startedAt / after.at≥process.finishedAt; reversed/changed source refuses. Необязательное поле сохраняет прежние process-only records; оба snapshots остаются unqualified. Native standalone status и новый readonly-admin control перенесены в parallel-lifecycle-integration (unit больше не запускает installed CLI). TDD actual installed status lacked snapshots RED→GREEN; native2 PASS/16 (17.10s), final source-complete target1 PASS/12 (14.67s),166 unit PASS/612 (72.67s), typecheck/diff PASS. Private600 native-management-sessions-5a141ba0.../management.json SHA65b242b9...,16 independent source/process/timing checks, admin continuous closure confirmed, own fixture removed/research pair unchanged. CLI unconfigured status создаёт0 user sessions; actual setup/check/recover mapping, parent activation и active cleanup ещё open. Это before/after evidence, не ownership ledger/readiness.
- [x] Native CLI setup/check during observations: trusted sampler сохраняет immutable snapshots в planned process entry во время actual supervisor lifetime, после local closure остаются только пересекающие это окно observations; reader проверяет hashes/identity/unique refs/interval overlap. Observer failure сохраняет unconfirmed record после settlement actual child; прежние before/after-only records читаются как during=[]. TDD actual installed setup/check succeeded but lacked during RED→GREEN.166 related unit PASS/612 (77.76s), затем extended OS+data-only reader target1 PASS/17 (2.30s) с before/after-as-live refusal; final native3 PASS/35 (90.82s), typecheck/diff PASS. В disposable actual wire-created/configured/ACL/activated user setup/browser verified и check/browser verified создали по одной новой row, отсутствовавшей в baseline; stable ID/Name/CreateTime/Count0. Setup eval-a:3 и check eval-a:4 остались pending после CLI exit — close всё ещё нужен. Private600 native-cli-sessions-4c5a22e9.../cli.json SHAbaf21b38...,25+28 observations,192 independent source/process/closure checks, own pair/root absent. User provisioning authority в fixture data-only/external native research, production activation/ownership ledger/close readiness не заявлены. Native CreateTime смещён на3ч относительно controller; opaque equality only, clock qualification отсутствует. Model/judge calls0.
- [x] Immutable management command result: producer пишет private management-result.json с exact command/slot/lease/profile/owner/operation/process SHA, exit/timeout/interruption, raw stdout SHA и whitelisted reply. API key/password/произвольные reply поля не сохраняются. Inventory связывает source SHA; reader проверяет exact schema/context/process binding и safe reply fields. Old process-only entries поддержаны без result. TDD missing result RED→GREEN; changed exit source rejected/password canary absent. Target1 PASS/20 (2.83s),166 related unit PASS/618 (64.62s), native actual setup/check1 PASS/20 (65.73s), typecheck/diff PASS. Private600 native-cli-sessions-13c29bbe.../cli.json SHA8ef0738d...,result source/process hash links+browser verified,192 full source/closure audit checks/exact pair+root absence PASS. Stdout SHA сравнивается с actual returned bytes в native test; raw stdout не сохраняется. Это immutable command outcome prerequisite; protected activation/session ownership ledger и targeted close ещё open.
- [x] Native CLI fixture protected authority: staged credentials/nonce берутся через stageUserPreparation, actual blocked creation — через claimUserOwnership, actual configure reply — через recordUserConfiguration; activation intent сохраняется до wire activation. Commands находятся в controller root и копируются в evidence; raw credential не копируется. Existing APIs compose без production edits. Native1 PASS/22 (53.97s), typecheck/diff PASS; private native-cli-sessions-f7fddcee... authority SHA390717aa.../19 source/generation/native-ID checks и CLI SHA7d4a85d9.../195 full source/closure checks, own pair/root absent. Это external native adapter с temp slot locks; production parent activation/active slot release/session ownership ledger ещё open. Следующая реализация ledger должна сохранять frozen per-process descriptor, чтобы последующий append management inventory не инвалидировал прежнюю сессию.
- [x] Durable normal management-session ledger: record/readManagementSession требуют held normal lease, protected preparation/user generation/activation и verified setup/result/process/source chains. Check связывается с предшествующим verified setup того же profile/user/url; setup обязан ссылаться на собственный process. Ровно одна новая own row относительно baseline, stable remote ID/Name/CreateTime/Count0, after identity consistency. Frozen command+connection descriptors сохраняются в каждой private session record; общий readManagementProcess qualifier переиспользован, append inventory не инвалидирует старую сессию. TDD missing module RED→GREEN; native31 PASS (52.46s),166 related unit/618 (68.88s), typecheck/diff PASS. Exact retry/re-read после append сохраняет record, binding tamper rejected. Private native-cli-sessions-429167f3... CLI SHAb9d9e6a2.../204 independent source/generation/actor/closure checks, own pair/root absent. Recovery-only запрещён, failed CLI/status/recover и terminal close ещё не поддержаны. Первый final native teardown пересёк proc-denial unit и quarantined; 00q2hZ сохранён в blockers. Browser native tests не совмещать с unit suite.
- [ ] Запустить RED `bun test test/user-environment.test.ts test/loginom-admin.test.ts`; реализовать persist-before-use ledger: container ID, StartedAt/server epoch, user identity, slot/run/attempt, session identity, наблюдаемая связь с запуском CLI, состояние close. Setup/check/recover connections учитываются тоже. Username используется как условие владения, но не разрешение закрывать любые неизвестные сессии аккаунта.
- [x] Primary binary/RPC boundary: найден отдельный SessionBackup.cfg и SessionBackupConfiguration/User/Session map/status/finalize enums в pinned server binary SHA1fea749d...; это не доказательство create/disable syntax. SavePackageAs имеет только2 formal args. Exact own permanent-pair file absence подтверждена без browser/RPC; symbol/UTF16 lookup не дал trigger. Private audit5 sources SHA7219026d..., три never-started inspection CID/tmp binaries удалены на том же daemon, permanent pair не изменена. SESSION_BACKUP_POLICY_UNPROVEN сохраняется, неподтверждённый config не создавался; дальше независимая credential canary matrix задачи9.
- [ ] На disposable 7.4.2 создать **непустой** SessionBackup поддержанными crash/recovery сценариями: пакет с несохранённым изменением, отключение browser; повторить A/B с одинаковыми именами. Зафиксировать путь, содержимое metadata, user/session/epoch, момент создания и повторного появления. Полный restart допустим только в этом отдельном эксперименте, не как recovery production-слота.
- [x] Actual CLI targeted close: closeManagementSession перечитывает held normal ledger/protected generation/continuous sources перед serialized dispatch под server fence. Native adopt проверяет immutable claim, user/activation/process/result/snapshots и fresh account+row; CloseSession применяется только к exact pending Count0 row. Отдельный terminal receipt связывает original ledger SHA и confirmed close command/reply; reader реконструирует обе цепочки. Native RED SESSION_SOURCE_UNCONFIRMED→GREEN1 PASS/37 (53.17s), final native1 PASS/39 (55.39s) с null terminal/changed close source refusal,153 related unit PASS/633 (62.13s), typecheck/Node --check/diff PASS: check закрыт с сохранением setup, setup закрыт, повтор byte-identical без RPC. Private native-cli-sessions-25f6d5cd... CLI SHA254bec2f.../212 source+close+cleanup audit checks; own pair/root absent. Failed CLI/status/recover/recovery-only, active attempts и SessionBackup остаются open; production admission закрыт.

- [ ] Выбрать доказанный контракт: (a) однозначное сопоставление backup entries с user/session/epoch и адресный delete после session close; либо (b) поддержанное отключение создания backup, фактический read-back настройки и положительный crash/recovery контроль отсутствия backup. Если ни один не доказан, оставить live dispatch заблокированным с `SESSION_BACKUP_POLICY_UNPROVEN` и конкретным исследовательским receipt.
- [ ] Неизвестную/чужую backup entry сохранять. Карантин только A допустим при доказанном локальном влиянии; если невозможно установить затронутого пользователя/границу, остановить новые admissions всех слотов, дать подтверждённо здоровым активным pipelines завершиться и сохранить результаты.
- [ ] Проверить RED/GREEN тесты и `bun typecheck`; приложить положительный backup evidence к задаче, коммит `feat(evals): bind server sessions and backups to user slots`. Не называть пустой каталог положительной приёмкой.

### Задача 5. Close fence перед всеми удалениями и адресное recovery

- [x] Native package descriptor inventory (2026-10-16): исследован установленный Dispatcher/IBGManagedSessionInfo.PackageInfo; readonly inspect payload {packages:true} возвращает все manager collections (user/admin/shared/pool), package objectId/Name/Path/ReadOnly/ReferenceCount и nullable Progress. Counts проверяются до/после обхода; обычный inspect не меняется. TDD missing collections RED47 assertions50.05s→native data выявили ошибочный nonnegative oracle: ReferenceCount=-1, как скрываемый renderer sentinel; raw -1 сохранён, не превращён в0. Финал native1/63 PASS51.41s: настоящий named/modified .lgp+autosave скопированы до target close, writable path /eval-a/backup-probe.lgp виден до и отсутствует во всех collections после close. Related admin/preflight48/140 PASS16.60s, typecheck/node syntax/diff PASS. Privatee8c84277… auditefc2a9e1…42 checks/13 sources+5 code/binary pins, own exact pair/network/root absent; оба RED data/source artifacts retained, их pairs/roots тоже absent. Primary schema7ba115e0… SHA c32bff0e… хранит source+read-back установленного Studio; официальный Dispatcher описывает отдельные Shared/Pool groups. Это readonly wire capability: parent durable reader/cleanup consumption, running Progress и nonempty Shared/Pool controls, operations/locks, backup/storage/unpause/admission ещё open; cleanupAllowed/operationsQualified=false.
- [x] Parent package inventory (2026-10-16): inspectPackageInventory сохраняет полный native reply и ссылку/SHA command journal в private canonical receipt; readAdminPackageInventory проверяет epoch, reply/request hashes, времена, вложенные counts/types/duplicates и повторный read-back. Отрицательный ReferenceCount и nullable Progress сохранены; observation не даёт ownership/cleanup. Codec missing module RED→GREEN1/8; malformed tree RED→GREEN1/20. Parent missing API native RED44/64.90s; финал с заранее открытым admin1/67 PASS67.56s, related49/160 PASS21.68s, typecheck/syntax/diff PASS. Private9bcdf36b… audit0e6fc145…67 checks/23 sources+6 pins: named/modified LGP+autosave, durable replay до/после CloseSession, обе continuous admin closures/transport ACK, exact own pair/network/root absence. Позднее подключение admin на retained Count1 дало PendingDisconnect=false и safe SESSION_NOT_IDLE; причина не доказана, ограничение записано в blockers, guard не ослаблен. Пять RED/diagnostic fixtures проверены и удалены штатно, их исходные данные сохранены. Уточнён installed enum: client0/self1/shared2/pool3/backup4, self не admin-role. Running/shared/pool positive, quiescence/cleanup/main остаются open.
- [x] Positive Shared package control (2026-10-16): отдельный protected research phase session-shared-probe создаёт native библиотеку в own UserStorage, закрывает её обычный handle и добавляет AddModelPackageLink из named/modified designer package. Обычный backup phase сохраняет прежний reply shape. Native RED40/52.93s unsupported phase; первый positive выявил ошибочный oracle ReadOnly=true: actual Shared descriptor false/ReferenceCount1, без вывода об effective ACL. Исправленный финал ordinary+shared2/138 PASS134.44s; related49/160 PASS24.03s, typecheck/syntax/diff PASS. Private6b4a9575… audite5025baf…74 checks/24 sources+6 pins: actual linked path/count и оба admin observers, source library+root LGP+autosave, fresh Shared Count0 после targeted CloseSession, обе closures/transport ACK и exact pair/network/root absence. Ordinary40574ffb… audit7634c941…67/23. RED/diagnostic fixtures1c4c4b4f…,ec1f1c76…,f61a4611… safely settled, original sources/data retained (library file в oracle RED не успел копироваться; в final сохранён). Pool/running/operations-locks/quiescence/admission remain open; readonly descriptor не становится cleanup grant.
- [x] Positive native Progress lifecycle (2026-10-16): XML-only LGP с одним bounded JavaScript узлом и readable source fixture загружается/выполняется настоящим designer в собственной research pair. Parent observes non-null Progress (actual percent50), затем тот же package objectId/path с Progress=null при ещё открытом пакете и fresh absence после targeted CloseSession. Native engine.Code сверяется с fixture; Finished=true/Failed=false/status4. Missing phase RED41/53.52s, empty-package routing исправлен; XML fixture сохраняет native-style MD5 ZIP fields и ModelViews Nodes/Links. Initial running1/52 PASS67.70s; stricter idle RED45/59.70s→retained-package phase→final1/53 PASS61.95s. Related49/160 PASS21.58s, typecheck/syntax/diff PASS. Privatef7fa45bd… auditc33e5b99…69 checks/23 sources+8 pins, original input LGP retained, оба admin closures/transport ACK и exact pair/network/root absence verified. Native StartTime raw не сравнивается с controller clock и не нормализуется. Все6 RED/diagnostic fixtures safely settled с source snapshots/input LGP; intermediate0d2d8fdc… auditfd2c5ff4…67/23 retained. Pool positive, backend operations/locks, cleanup/admission остаются open; operationsQualified/cleanupAllowed=false.
- [x] Positive native Pool control (2026-10-16): отдельный guarded session-pool-probe допускается только для ephemeral eval-pool-probe в собственной research pair. Его modes1→3 разрешают batch, admin/global-storage=false; обычные eval users не меняются. Own Scheduler job запускается вручную один раз: Enabled=true, PeriodNone, auto start на сутки вперёд, startup/missed=false, timeout10s; ApplyChanges требует Ref. Native log completed3 bound к job/user; точечный Delete GUID + fresh jobsAfter=[] проверены. Creator browser/session закрыт, но тот же package objectId/path остаётся в Pool type3, raw ReadOnly=false/ReferenceCount=-1/Progress=null. TDD missing phase RED41/54.32s, normal/admin permission refusals сохранены; Ref/disabled-job fixes; fresh deletion RED42/62.05s→GREEN. Финал ordinary/Progress/Pool3/174 PASS202.77s; related49/160 PASS22.14s, typecheck/syntax/diff PASS. Private71f121cd… auditc8983e29…69 checks/23 sources+8 pins; обе admin closures/ACK, own exact pair/network/root absence/input LGP verified; ordinaryb04f5f9f… audit70844392…67/23, Progress48d3d0d9… audit5f1f3d77…69/23. Все7 RED/diagnostic fixtures safely settled с actual source/input; intermediatefac878fb… audit26865189…73/25 retained. Primaryf6236ca2… SHA7a68a6b3… закрепляет enums/UI, model RPC уже сохранён. Pool presence после отсутствия user session запрещает считать такое отсутствие package quiescence; scoped pool close/locks/storage/backup/admission remain open, cleanupAllowed/operationsQualified=false.
- [x] Selected Pool ClosePackage refusal (2026-10-16): guarded research phase связывает completed3/deleted own job с unique Pool path/Progress=false, вызывает ровно один native manager.ClosePackage(packageInfo,5000), сохраняет отказ «Не найдена сессия…» и fresh same-object read-back. Собственный Pool package остаётся после creator close; пакет eval-b сохранён целиком через один parent observer, затем отдельно закрыт. Proxy IDs одной SessionInfo различаются между admin observers; cross-observer comparison исправлен без изменения close ownership guards. Missing-phase RED49/57.34s; positive-close expectation RED53/65.53s; failed cross-observer oracle и two-user counter retained. Final native1/70 PASS68.76s; related49/160 PASS21.98s, typecheck/syntax/diff PASS. Private63e4e2dc… audit17f23462…93 checks/43 sources+8 pins, обе continuous closures/transport ACK и exact own pair/network/root absence verified. Обычный Pool control1641d4d8… PASS64.57s, audit8af85dfe…69/23. Адресный Pool cleanup не квалифицирован: blocker записан в eval_parallel_blockers.md; следующий candidate — доказать PackagePoolSize=0 до user work на новой disposable pair. Все delete/unpause/admission grants остаются false.
- [x] Native preventive Pool policy (2026-10-16): guarded session-pool-disabled-probe на новой собственной pair требует нулевые counts всех collections и только admin client/self rows до setter. Native socket Settings.PackagePoolSize меняется10→0; getter сразу и после actual completed3/deleted own Scheduler job возвращает0. Completed package отсутствует во всех collections до/после creator CloseSession. TDD missing phase RED41/51.90s→native1/54 PASS63.23s; same-source default Pool1/54 PASS66.51s, private62335c26… audit7e614cb9…74/25. Related49/160 PASS21.15s, typecheck/syntax/diff PASS. Private2df05c6e… auditca4df303…70 checks/23 sources+8 pins; обе continuous admin closures/transport ACK, own exact pair/network/root absence и retained input verified. Выбран дальнейший preventive policy0 до user work; unsupported targeted Pool ClosePackage не повторять. Это квалификация recipe на7.4.2: production preparation/frozen policy/read-back drift guards ещё не подключены; backend locks, backup и все cleanup/admission grants остаются отдельными gates.
- [x] Fenced public Pool policy API (2026-10-16): AdminConnection.configurePoolPolicy требует retained server fence и private same-command unactivated-preparation; inspectPoolPolicy только читает0 либо отказывает POOL_POLICY_DRIFT. Native configure-pool допускает только empty collections/admin-only rows, меняет getter value только если before!=0 и сохраняет полный reply/command-bound immutable private receipt. readAdminPoolPolicy перепроверяет epoch/schema/hash/journal/operation/times и наличие native self observer; matching-hash empty scope RED→GREEN1/2. Native missing method RED38/46.96s; drift error namespace RED39/57.05s исправлен в whitelist. Final native1/48 PASS62.31s: before-work drift refused, bad phase before RPC, actual10→0, repeated changed=false, readonly0. Related50/162 PASS22.76s, typecheck/syntax/diff PASS. Private691caaea… audit5b14827c…51 checks/23 sources+6 pins, both continuous closures/ACK, exact pair/network/root absence. Две failed fixtures d2b851c0…/7719c1a9… столкнули controller/factory reservation scope; отдельный controller lock root исправляет fixture, оригиналы восстановлены через CAS recovery-only/release с actual full closures/ACK без PID-only authority, затем owned factory destroy. Их boundaries750cd9f3…29/14 и8935aab7…50/22; whitelist RED7c482cba…798fa7ac…29/14 settled. Production prepare/verify ещё нужно подключить; cleanup/admission grants false.
- [x] Pool policy preparation/verification wiring (2026-10-16): prepareEnvironment вызывает configurePoolPolicy до stage/configure пользователей, verifyEnvironment — только inspectPoolPolicy; полный bound result сохраняется в environment receipt. Общая readiness остаётся false/SESSION_IDENTITY_UNSUPPORTED. Native public prepare→verify RED missing poolPolicy7/76.03s→GREEN1/16 PASS99.68s; helper bridge закрывается до обеих команд, сроки ожидания unchanged. Native10→0 раньше всех reconcile-user, verify включает только init/inspect/dispose и видит unchanged0. Related public CLI/recovery/admin62/232 PASS46.09s, typecheck/syntax/diff PASS. Private51f765be… audit9c6e5d40…83 checks/45 sources+9 pins; три continuous admin lifetimes/transport ACKs, оба unactivated finalizers released, exact own pair/network/root absent. RED80d294fe… auditbf910e54…35/17 safely settled с original sources и missing-field receipt. Это before-CLI preparation release, не evaluated-attempt cleanup; runtime admission/frozen fingerprint/drift и остальные gates ещё open.
- [x] Controlled active JavaScript backend stop (2026-10-16): session-active-probe загружает existing one-node fixture, устанавливает exact interrupt-probe.js (20s) через native Code setter, получает unfinished work item и теряет creator context. После context loss ещё наблюдаются Count1/pending=true и ненулевой Progress. Same-source/image control проходит natural active→idle, затем close; второй сценарий вызывает existing scoped CloseSession при активном Progress и получает fresh session/package absence за3051ms вместо control21456ms (start→fresh absence). Ownership/PendingDisconnect guards и сроки unchanged; observer подключён до probe supervisor. Missing phase RED41/57.60s→initial control1/54 PASS83.27s; final close1/53 PASS61.68s + control1/54 PASS79.82s, identical9 pins/images. Related50/162 PASS22.75s, typecheck/syntax/diff PASS. Private05c609b2… audit48d6b749…64/25 и0ff79e61…192a52d3…184/73; initialedf916c9…191d94e0…189/75 retained. Обе admin continuous closures/ACKs, exact own pair/network/root absence/input verified; REDcb0aeee0…acf77d76…24/12 safely settled. Это real native CPU-node stop после client-context loss; actual CLI crash, B activity, FD/locks, backup/storage/no-regrowth и durable cleanup consumption ещё отдельные gates, operationsQualified/cleanupAllowed=false.
- [x] Native active A/B stop isolation (2026-10-16): A uses detached20s Code, B connected10s peer-probe.js; both ordinary designers have simultaneous native Progress. Bound CloseSession removes only A; exact B observer/package ID remains active, B finishes with finished=true/failed=false/status4 after A close (+8108ms), its canary hash unchanged, then B closes separately. Peer phase retains existing30s request/60s supervisor bounds; A uses the existing90s two-user fixture budget, with180s outer scenario. RED missing peer phase was masked by fixture boolean/object assertion; qualifier returns a proof object, corrected to truthy. Original011628b4… preserved/settled through native factory after all3 actual closures/ACKs, no CAS/forced reservation edits needed; auditb94ef228…45/22. GREEN1/75 PASS83.41s; related50/162 PASS21.52s, typecheck/syntax/diff PASS. Privateb36aa5a7… auditf175c946…69 checks/33 sources+11 pins; complete native replies, 3 continuous closures/ACKs, exact own pair/network/root absence/input verified. Guarded peer settlement prevents fixture deletion on unqualified peer teardown. This qualifies concurrent native JS operations/user isolation, not actual CLI crash, FD/locks/no-regrowth, backup or full cleanup/admission.
- [x] Native CLI active interruption (2026-10-16): actual sandboxed candidate + local provider opens prelinked bounded20s JS→Calculator fixture. Native Progress triggers supervisor abort; measured interrupted=true/timedOut=false, backend remains active after continuous CLI closure. Finalizer preserves pending .tmp in committed archive, then closes exact eval-a:3 agent + eval-a:2 setup and confirms fresh absence; storageDeletionAllowed/nextAdmissionAllowed=false. RED ff86c31a… no execution, actual dc751ee6… hit archive barrier; archive fix2c9a81d730→GREEN1/14 PASS180.97s (CLI73.597s). Private d9c44aac… auditd10a7521…2191 checks/168 sources/26 causal frames+18 source/binary pins, original archive inodes/bytes and SQLite-copy integrity, admin closure/ACK and exact own pair/network/root absence checked. Agent close settles17.661s after first observed active command,11.704s after post-CLI active observation; these are controller observation intervals. This qualifies controlled CLI interruption; hard SIGKILL, FD/locks/no-regrowth, backup and admission remain open.
- [x] RED hard CLI kill oracle (2026-10-16): новый режим ожидает exit137/timedOut=false/interrupted=false; прежний abort завершился exit1/interrupted=true. Проверка упала после полного archive-before-close/finalizer,1/12 FAIL183.81s; private966365c1… сохраняет исходные sources/results. Это отрицательный контроль SIGKILL, не его квалификация.
- [x] Native hard CLI kill (2026-10-16): SIGKILL отправлен единственному admitted CLI из exact slot scope после native Progress; intent хранит полную birth/executable/group/session identity, owner/launcher и immutable trigger source. signalProcess повторно сверяет identity перед syscall. Actual exit137/timedOut=false/interrupted=false, continuous CLI/Host/Chromium closure, backend active после неё; committed pending-history archive→exact agent/setup close→fresh absence. GREEN1/16 PASS184.30s; private5e699014… auditf8cbd6b2…2239/183/29 causal+18 source/binary pins, SDK SQLite-copy integrity и original archive objects, admin transport/closure, own pair/network/root absence verified. RED966365c1… auditfdcf3641…2223/179 доказывает прежний SIGINT control, все его resources/root absent. Related22/160 PASS30.09s, signal identity/refusal3/6 PASS0.217s, typecheck/diff PASS. Это hard CLI crash одного native JS workload, не FD/locks/no-regrowth, full N2/runtime или admission; flags false.
- [x] Retire own archive-barrier research fixtures (2026-10-16): f5473183…/ZjdFIE,2f0726d8…/5FqIMa,dc751ee6…/fHXu1g прошли source-qualified local/admin closure read-back, CAS recovery-only server+profile/user, committed history archive и public factory disposal. Exact9 container/network IDs и3 scratch roots absent; original failures/old+new claims/receipts и SDK SQLite сохранены. Independent5424 checks/104 sources: auditsfe65226a…1685/34,3de7c127…1864/36,a1f808b2…1875/34. Global factory reservations released через API; persistent lock files сохранены. Это decommission отдельных research namespaces; normalRelease/storageDeletionAllowed/nextAdmissionAllowed=false, production recover/admission gates не расширены. Support scripts и9 public source pins bound to589f32a7ca; obsolete4 duplicate logs removed after SHA/read-back.
- [x] Native kernel package FD/flock control (2026-10-16): read-only bounded Docker exec enumerates every container process except its collector, brackets process births, captures scoped FD targets/stat/fdinfo plus raw maps and kernel locks. Standard unprivileged research pair: PID1 retains `.progress-probe.lgp.lck` with real FLOCK ADVISORY WRITE; native active CloseSession→fresh full package absence→no own-root FDs and no matching lock in either post-close kernel snapshot, same daemon birth. Native1/65 PASS71.90s; private7b3fb852… audit77f25169…82/28+11 pins, elapsed3640ms, both admin continuous closures/ACKs and own pair/network/root absence. Module-missing RED80ms; first diagnostic7d37a6a8… failed on test callback shadowing after collecting data, audit18791214…82/28 validates original sources/teardown with hash-recovered close reply. Related50/162 PASS25.04s, typecheck/shell syntax/diff PASS. Final newline-fix native repeat7841a66a…1/65 PASS84.80s, auditf6eff982…82/28+11pins/5567ms. Reader/cleanup consumption, B-active FS, no-regrowth and full workload coverage remain open; operationsQualified/cleanupAllowed=false.
- [x] Kernel observer filename/mmap control (2026-10-16): actual child holds FD with trailing-LF name and executable mmap in own disposable pair. RED3193c23f… loses final LF through shell substitution; minimal readlink -n+sentinel GREEN4210e0e9…1/9 PASS30.52s preserves exact path, positively sees non-daemon maps, then confirms child exit0/FD+mapping absence with stable daemon. Independent audit9c9c3af9…61 checks/16 sources covers both original verdicts, 4 tested-source pins each, own6 pair/network IDs+2 roots absent. Initial missing-alias configuration failure creates no factory resources; its empty controller/locks and synthetic fixture manifest retained before removing exact unused root. This qualifies observer visibility only; production fenced consumption, B-active control and no-regrowth remain open.
- [x] Fenced raw kernel evidence prerequisite (2026-10-16): collector moved from test helper into src/server-files.ts; captureServerFiles/readServerFiles preserve raw NUL frame in fsynced private receipt bound to held server command/token/revision, slot/token, exact pair epoch and script SHA. Reader reparses raw data and rechecks source/fences; snapshot grants neither storage delete nor next admission. Missing-module RED92ms→actual Docker GREEN1/6 PASS44.26s, typecheck PASS. Unknown record acceptance RED1/7 FAIL54.39s→strict-tag GREEN1/7 PASS56.77s. Repeated-boundary acceptance REDfbaafa4e…1/8 FAIL55.72s→exact outer boundaries GREENc8719560…1/12 PASS46.25s; changed hash/foreign slot and closed guard refused, original receipt restored/read back. Independent audit6a282b8a…78 checks/22 sources binds both raw snapshots/fence tuples,8 tested source pins each, own6 resource IDs+2 roots absent. Moved collector mmap/LF regression ce062306…1/9 PASS42.19s, independent audita89ad84f…61/16. Native FD/FLOCK regression f7f4c786…1/65 PASS77.16s, audit76cc72e1…82/28+11pins and6514ms controller interval; same collector sidecar lock/FD absence and native session close preserved. Final related69/334 PASS70.27s, typecheck/sh syntax/diff PASS; private verificationd9837842…. Full finalizer/cleanup consumption remains open; flags false.
- [x] Bind finalizer to post-close kernel receipt (2026-10-16): actual hard-CLI-kill REDcd27cb3e…1/6 FAIL237.33s found missing terminal.serverFiles after successful archive/session close. Independent audit73bc5816…2262 checks/200 sources/28 causal frames+20 pins preserves original failed verdict, paused prefix, CLI137, exact own pair/root absence and history. Minimal finalizer now captures after complete absence, persists source ref and replays it with temporal/epoch/lease/hash guards; Hard-kill GREENb5e3bb27…1/20 PASS237.31s; audit57566cdf…2304/219/30 causal frames+20pins, full own pair/root absence and retained SDK archive, post-close raw kernel source bound to terminal/current fences, own-root FD/maps absent at point. Text GREEN5a6780c2…1/27 PASS161.10s: actual changed-source and backdated-point refusal, original source restored/replayed, pending terminal reconstruction captures new post-absence source; audit593d3fe8…289/121/6 causal frames+20pins, exactly2 kernel captures and no duplicate close RPC. Related15/166 PASS56.49s, typecheck/diff PASS, verificationd6b6fea2…. Initial text setup1e06a8e1… failed health before CLI; Apache ready+40.206s, old30s budget preserved; public factory resume/no restart→destroy,4 released claims/3 IDs+bpTCqq root absent, disposald142b481…. No delete/retry/admission grants.
- [x] Pending history archive barrier (2026-10-16): archiveProfileEvidence отделён от admission: при held profile lease требует отсутствие writer marker и две свежие проверки idle, затем сохраняет recovery .tmp/.json под прежним durable manifest. Живой argv/env-only writer по-прежнему запрещает перенос и intent (ARCHIVE_PROFILE_BUSY). Actual native interrupted CLI RED dc751ee6… (interrupted=true/timedOut=false, backend Progress после local closure) и focused unit RED→GREEN; archive14/88 PASS24.77s, остальные9 related PASS, typecheck/diff PASS. Session close/cleanup/admission этим не разрешены; native finalizer1/14 PASS180.97s; старые pending-reservation incidents требуют recovery.







- [x] Automatic pending attempt reconciliation (2026-10-16): finalizeSlotAttempt при существующем validated intent использует только confirm-absent для недостающих agent/management close receipts. Fresh complete accounting/archive/epoch guards сохраняются; живая native цель не закрывается повторно. Existing published terminal с потерянным close proof по-прежнему даёт PENDING; missing terminal + native confirmed absence восстанавливает sidecar/terminal и stable repeat. TDD old pending refusal RED19 assertions119.12s→native browser/text2/50 PASS294.22s; больше нет ручного confirm в test recovery path. Production diff3 lines, related50/266 PASS54.90s, typecheck/diff PASS. Privateeda67412… audit2a2c433b…1772 checks/112 sources/14 causal frames и7bcba6eb… auditb5d45025…227/93/6, обе16 pins; no extra close RPC, original histories/SDK rows retained, own pairs/networks/controller roots absent. Joint249 checks SHA2fd4cc4a…. Это normal held-controller receipt-loss reconciliation, не actual lost wire response/SIGKILL/recovery-only lineage. Cleanup/delete/release/unpause/admission grants остаются false; backend operations/locks, storage/backup cleanup и full recovery/main ещё open.

- [x] Read-only session absence confirmation (2026-10-16): отдельная confirm-session-absent использует те же protected user/epoch/process/archive bindings, но при живой цели возвращает SESSION_STILL_PRESENT до CloseSession. closeAgentSession/closeManagementSession получают explicit confirm-absent mode; closure codec принимает этот op только с observed_absent. Journal разрешает read-only confirmation после unknown, не снимая запрет мутаций. TDD channel REQUEST_INVALID RED→1/8 GREEN0.752s; native old driver ADMIN_REQUEST_INVALID RED18 assertions117.00s→browser/text2/50 PASS297.29s. Живой management target сохранён; после реконструкции потери final/session receipts pending finalizer refused, explicit native absence-only confirmation agent/management восстановила sidecar, общий finalizer дописал terminal без повторного CloseSession и повтор вернул stable source. Это actual native RPC + filesystem receipt-loss control, не SIGKILL/потерянный wire response/active recovery lineage. Related50/266 PASS60.53s, typecheck/syntax/diff PASS. Private6e3edf07… audit45845c1a…1782 checks/116 sources/17 causal frames и19bc4ebe… auditd9c562fc…229/92/5, обе16 pins; exact own pair/network/controller-root absence и original histories/SDK rows verified. Storage/delete/release/unpause/admission false; автоматическая интеграция read-back в pending finalizer и полный recovery остаются open.

- [x] Normal slot/attempt session finalizer (2026-10-16): finalizeSlotAttempt связывает held normal leases/current epoch, management seal и paused agent prefix; полный учёт до переноса истории, settled-writer release и committed архив каждого physical invocation, включая no-browser. Durable intent фиксирует archives/полный target set до первого close; адресные agent→management closes, fresh complete absence и closed sidecars дают private sessions_closed receipt. Повтор возвращает прежний source без новых close RPC; pending intent запрещает слепой повтор. Storage delete/release/unpause/admission не выдаются, admin остаётся у caller. TDD missing module RED→native browser+text2/38 PASS269.12s; incomplete observations/recovery-only refused до archive/close, original DB/session rows preserved. Related50/263 PASS54.48s, typecheck/diff PASS. Private477594c6… audit696f7948…1789 checks/103 sources/15 causal frames и1c75c612… audit215fe870…186/73/5; обе16 pins, exact own pairs/networks/controller roots absent, original histories/SDK session retained. Browser archive содержит DB/WAL/SHM; text archive валиден с одним DB. Teardown сохраняет root/pair при unarchived history. Active uncertain-close recovery, backend operations/package locks, storage/backup cleanup и validated unpause/main остаются open.

- [x] Durable agent prefix boundary (2026-10-16): pauseAgentProcessInventory квалифицирует completed prefix, durably ставит paused до публикации immutable snapshot, блокирует новые CLI и сохраняет snapshot при последующем final sealing. Snapshot publication I/O failure оставляет pause; repeat согласует тот же hash/path; changed snapshot запрещает read/seal. readAgentProcessBoundary принимает paused+snapshot либо final sealed; resource reader по-прежнему только sealed. Combined session accounting проверяет immutable source и отдельно mutable current manifest, driver принимает paused под прежними selected-process/native/archive guards. TDD missing export RED→5/52 PASS7.81s; native strict resource-only reader RED UNSEALED9 assertions98.59s→boundary wiring→native browser+text2/56 PASS243.49s. Genuine Count1 archive/targeted close выполнен до final sealing; empty invocation с WAL/SHM также учтён. Related50/263 PASS51.57s, typecheck/syntax/diff PASS. Private149f6bd8… audit3abbca9b…1650 checks/108 sources/16 causal frames; ae3518db… audit9a8f9abb…91/62/6, обе15 source/binary pins, stable paused sources после final sealing, own pairs/networks/controller roots absent, histories retained. Это boundary primitive: normal slot/attempt finalizer, validated unpause после полного cleanup, backend/storage/backup release/recovery и production admission ещё открыты; nextAdmissionAllowed не выдаётся.

- [x] Normal per-slot management finalizer: `finalizeManagementSlot` сам выполняет seal/settled archive→fresh complete session accounting→адресный close→fresh absence/closed ledgers→archive read-back→private receipt. Shared admin не dispose, B admission продолжает работать. Receipt связывает exact slot/token/epoch, archive/inventory/before/after и original+terminal session SHA; delete/release/admission=false. Native TDD missing API RED88ms→GREEN1 PASS/20 assertions164.00s на genuine A/B; B сохранён/fresh check valid, затем all-slot finalizer переиспользует A archive. Related29 PASS/126 assertions37.89s, typecheck/diff PASS. Private native-two-users-33d08445-a845-45b8-b7cb-3d374ae45861: finalizer SHA5b145a49..., audit681f789752552be70ba11d822edfab3353070d1f2551ba9449330ec4e734ee20 (628 checks/181 sources), before/after code pins a2a98eeb..., exact own pair/network/root absent. Нормальный management Count0 path; attempt actors, uncertain-close recovery, SessionBackup/scoped deletion/release/main остаются open; model/judge0.

- [x] Per-slot management session accounting: collector принимает cli_admitted только с validated per-slot seal; reader возвращает source SHA seal, collector перечитывает его перед return. Unsealed A refused; неизвестная same-user row по-прежнему refused, peer B row не присваивается A. Global finalizing source gate сохранён. Новый codec case RED прежний MANAGEMENT_SESSION_UNCONFIRMED вместо unknown-row→GREEN1/3 (1.438s); related4-file32 PASS/210 assertions60.25s, typecheck/diff PASS. Native A/B fixture вызывает collector после архива и закрывает только весь возвращённый набор A; последующая positive qualification описана ниже. Delete/release/admission не разрешены.

- [x] Per-slot management archive: `archiveManagementSlot` seals только A, проверяет settled writers и использует существующий durable archive. Receipt связывает token/epoch/seal/inventory/profile manifest SHA; DB/WAL/SHM/inputs перенесены, auth и B сохранены. Повтор byte-identical; после завершения B общий finalizer переиспользует тот же архив A. TDD missing API RED→GREEN1/27; расширенная compatibility проверка1/30 PASS14.77s, related5-file49/322 PASS91.33s, typecheck/diff PASS. Native A/B fixture использует этот API; последующая positive qualification описана ниже, старый eR7Snq сохранён. Receipt не разрешает storage delete/release/next admission; server sessions остаются под отдельным close fence.

- [x] Native per-slot seal/archive/accounting qualification: exact-source run32685e3e66 дал1 PASS/19 assertions168.88s без concurrent unit. Genuine A/B setup lifetimes overlap; seal A→refused A status→committed archive→полный collector set A→targeted close внутри held B lifetime; B session сохранена и fresh check valid. Global finalizer переиспользовал exact A archive manifest и закрыл обеих users; все4 CLI/admin continuous proofs qualified. Private native-two-users-4a143678-dfcf-4a51-ae93-33db172b9b72/source-audit.json SHAdd7acfd3197a7164153e1acdf2ff884ddc41726794123191d861c1e20fb7684a:649 checks/192 sources, exact own pair/network/root absent. Source pins9d821936.../5 exact HEAD sources+candidate SHA/read-back. UID error не повторился, cause старого eR7Snq не установлен: retained proofs/pair/local reservations сохранены отдельно в blockers. Это normal management Count0 sessions, без full cleanup/recovery/backup/delete/release/admission grant; model/judge0.

- [x] Per-slot management producer seal: `sealManagementProcessInventory` под held server/slot и общим registration mutex фиксирует private sidecar с inventory SHA/command/epoch/token/profile. Повтор byte-stable; дальнейший producer A отвергается до CLI, B продолжает status, journal и A inventory сохраняются. Sealed inventory drift refused reader, собственный live producer даёт BUSY без seal. TDD missing API RED→GREEN, reader принял drift RED→GREEN; module3 cases PASS, затем related5-file71 PASS/412 assertions94.36s; initial4-file59PASS/1 existing slot-recovery timeout5000ms сохранён в отдельном runner diagnosis. Typecheck/diff PASS. Это local producer fence без delete/release/admission grant; normal native A/B composition впоследствии квалифицирована, полный cleanupSlot остаётся открыт. Runner budget исправлен и проверен отдельно.

- [x] V2 attempt deletion deferred: actual runAttempt больше не вызывает cleanupArtifact для slot context; orphan CSV копируется с bytes/SHA без delete. storage-cleanup pending/removed=false/verified_absent=false/deletion_deferred=true; cleanup.json сохраняет serverSessions=unknown и оба admission/delete=false. Legacy afterAttempt отказывает SLOT_CLEANUP_REQUIRED до management/archive/broad cleanup и сохраняет отрицательные flags, measured completed/status не переписывается. Два независимых native RED удаляли CSV/LGP до fence→GREEN; файл создавался реальным Docker после fake-child trace/baseline, evidence сохраняется, следующий attempt refused. Native lifecycle3 PASS/37 (69.93s), после refactor оба paths2 PASS/23 (47.46s); legacy cleanup/transition25 PASS/294 (150.12s), coordinator25 PASS/161 (142.02s), typecheck/diff PASS. Docker cp fixture UID приведён к service owner; topology guard сохранён. Это native filesystem + fake actor/data-only account authority: active Loginom session/B survival, positive close/scoped delete executor/backup/recovery ещё открыты.

- [x] Recovery terminal reconciliation: finalizeReleasedSlot проверяет lineage исходного incident до текущих released resources, оба slot/cleanup sources и SHA под двумя OS guards. Дописывает missing recovery tombstone и original releaseReceipt без нового CAS; normal admission требует original acknowledgment. TDD RED premature admission → GREEN; real exited-controller partial-release fixture + crash-boundary reconstruction, повтор terminal finalization и live/foreign refusal.62 slot/lease/user/status PASS/249 (4.42s),26 coordinator/offline-recovery PASS/187 (147.03s), typecheck/diff PASS. Native cleanup producer, full CLI recover и общие fences остаются открытыми.

- [x] Partial release CAS admission: recoverSlotLease принимает released resource только по slot-specific release proof/private composite + exact resource identity/token/revision/source and cleanup SHA; проверяет proof до takeover и повторно под resource guard. Generic recoverResourceLease по умолчанию released не принимает; slot callback разрешает только recovery-only CAS после dead-owner check. Real exited Bun controller + actual second-proof rename fault дали released/retained; оба приняли новые recovery-only tokens/lineage, model preparation refused. Source drift отказал без изменения reservations; live partial owner BUSY. RED прежний partial lineage rejection→GREEN62 slot/lease/user/status PASS/241 (4.61s), actual offline-judge recovery1 PASS/26 (7.40s), typecheck/diff PASS. Recovery-only terminal reconciliation/repeated partial recovery and native cleanup producers/CLI recover ещё открыты.

- [x] Composite release finalization: slot resource proof связывает slot receipt и semantic cleanup SHA; ordinary slot acquire под resource guard требует durable composite released, иначе RECOVERY_FINALIZATION_REQUIRED. finalizeReleasedSlot берёт оба guards без нового ownership, проверяет exact configured inventory/token/revision/identity/source SHA+cleanup predicates и дописывает missing composite tombstone, повтор идемпотентен. RED missing API/обычный acquire принимал crash gap→GREEN. Real-fs codec reconstruction, actual second-proof rename fault (released+retained preserved), cleanup source drift и новый live/foreign run refusal;86 status/slot/lease/user/parallel-main PASS/392 (138.32s), actual offline-judge recovery1 PASS/26 (7.03s), typecheck/diff PASS. Это fully released-resource finalization: partial CAS adoption, recovery-only terminal manifests, general fences и native cleanup producer/CLI recover ещё открыты.

- [x] Native parent recovery-only guard qualification: actual initialized research admin context + real exited child slot owner → recovery-only lease. Parent create/reconcile/probe отказывают до secret read/RPC; ни одного reconcile-user command в admin journal. Native target1 PASS/35 (7.22s); совместные native/admin/slots/lease/user/preflight106 PASS/427 (80.59s), typecheck/diff PASS. Своя wire disposable pair удалена после confirmed disposal; прежние retained incidents сохранены. Это admission refusal, не подтверждение positive parent provisioning или полного recover lifecycle.

**Files:** Modify `evals/src/run.ts`, `evals/src/user-environment.ts`, `evals/src/artifact.ts`, `evals/src/profile.ts`, `evals/test/no-artifact-cleanup.test.ts`, `evals/test/isolated-storage.test.ts`, `evals/test/transition.test.ts`, `evals/test/user-environment.test.ts`, `evals/test/profile.test.ts`, `evals/test/lease.test.ts`, `evals/script/parallel-env.ts`; Create `evals/test/parallel-lifecycle-integration.test.ts`.

**Interfaces:** Produces `CleanupReceipt`, `cleanupSlot`, `recoverSlot` и `parallel-env recover`. `ArtifactSource` для v2 фиксирует проверенный container ID и root конкретного пользователя.

- [x] Slot recovery ownership primitive: `recoverSlotLease` проверяет исходный private composite manifest, configured keys/canonical profile, актуальные reservations, identity и lineage; записывает recovery intent до CAS и сохраняет частичное владение. Новое владение recovery-only запрещает stage preparation/activation и parent create/reconcile/probe. Реальные дочерние Bun processes: dead owner adoption, live owner отказ без изменения reservations, повтор от исходного incident после выхода recovery controller. RED missing export и recovery admission accepted → GREEN;55 slots/lease/user tests PASS/192 (3.48s), typecheck/diff PASS. CLI recover, terminal release reconciliation, server/admin/judge fences и cleanup proofs ещё открыты.

- [x] Whole-preparation recovery ownership: recoverPreparationLeases принимает private exact pre-CLI command/identity/prefix slots, находит ровно один original slot manifest на slot, проверяет server lineage; recovery intent/admin inventory сохраняются до server CAS и последовательного slot CAS. Частичное владение остаётся recovery-only, current server fence удерживается при slot adoption. Реальные exited Bun controllers: original→recovery→second recovery revision3, live owner BUSY с неизменными reservations, stageUserPreparation refused. TDD missing module RED→GREEN;69 related unit PASS/311 (5.22s), explicit resume target1 PASS/8 (0.534s), typecheck/diff PASS. Это владение без release/cleanup/dispatch grant; native/process/archive finalization и public recover ещё open.
- [x] Recovered pre-CLI native finalizer: same normal finalizer допускает recovery-only только при exact recovery command/slot manifests/original hash/server lineage; перед archive и после current admin dispose перечитывает все prior admin inventories, continuous proofs и fresh PID/starttime absence. Recovered admin admission требует inventory/unsealed phase до runtime. Cleanup включает prior source refs; slot release дополняет original incident через finalizeReleasedSlot, server release после всех slots. TDD native old finalizer refused recovery-only и missing recovery inventory reached runtime RED→GREEN;91 unit PASS/388 (7.17s), native1 PASS/6 (42.50s), typecheck/diff PASS. Actual exited controller/native blocked account/profile history/B canary PASS; own green pair removed. RED fixture /tmp/evals-recover-preparation-CrWNk2 сохранена для проверки public recovery/resumption, не удалена вручную. Public command/idempotency/partial-release recovery и active-account lifecycle open.
- [x] Public pre-CLI preparation recover: parallel-env recover --config --incident <original prepare journal> --out маршрутизирует kind unactivated-preparation в recoverUnactivatedPreparation; fresh loadSlots/pair/identity → whole-environment CAS → proof-producing recovered finalizer. Result kind preparation-recovery/status released/ready:false, exit0 означает cleanup; failure receipt unconfirmed/exit2, offline judge route сохранён. TDD wrong offline-judge routing RED→GREEN;100 unit PASS/433 (7.00s), offline judge2 PASS/37 (7.29s), typecheck/diff PASS. Actual public command принял сохранённую RED fixture после выхода первого recovery owner:2 prior controllers inventories/continuous proofs, original slot terminal, archived canary/B bytes preserved;31 independent checks PASS. Private600 native-recovery-red-resume-20261015/qualified-recovery.json SHA49794de0..., cleanup-audit сохранён; exact own pair штатно destroyed/root removed. Fully terminal idempotency/partial release/active accounts open; native normal-path regression1 PASS/31 (41.16s).
- [x] Durable recovery completion/idempotent repeat: после всех releases и result receipt пишется completion.json с original/result refs и полным immutable closure source set. Replay проверяет source hashes и metadata, возвращает already_released до CAS/admin runtime. Corrupt proof не fallback в takeover. TDD actual repeat refused PREPARATION_RECOVERY_SLOT_UNCONFIRMED RED→GREEN;100 unit PASS/433 (7.15s), native1 PASS/14 (55.47s), typecheck/diff PASS. Native repeat с unreadable CLI runtime не создаёт controller files; altered server proof refused; повтор при следующем held server/user/profile owner сохраняет все3 reservation bytes, next normal finalization проходит. Private600 native-recovery-2a249859... receipt SHA f8a75284...,14 retained source hashes совпали, exact pair absent. Один собственный superseded green log удалён с private audit. Crash до completion marker/partial terminal/reserved root/active CLI open.
- [x] Reconcile released server before completion: под server resource guard проверяются exact current released token/revision/epoch/release source, command/incident identity, all released slot proofs/composite tombstones и continuous admin inventory; результат/completion восстанавливаются без CAS/admin runtime. Поддержан также fully completed normal preparation; не требуется новый slot ownership. TDD native persisted missing result+completion refused PREPARATION_RECOVERY_SLOT_UNCONFIRMED RED→GREEN;100 unit PASS/433 (6.79s), native1 PASS/23 (56.50s), typecheck/diff PASS. Corrupt released-server proof refuses before restoring either receipt; valid public CLI с unreadable runtime восстанавливает оба byte-identical, next-owner reservations preserved, normal standalone completion/repeat PASS. Private600 native-recovery-c45ef966... receipt SHAd14762e0...,14 closure source + original/result hashes independently match,3 next reservations preserved, exact pair absent. Это persisted boundary injection, не реальный SIGKILL в этом окне; server-retained/partial slots/real crash windows ещё open.
- [x] Retained server after all slots released: finishReleasedPreparation принимает только общий server fence через recovery-only CAS; already released slot/resource proofs проверяет без их CAS, все prior admin inventories и fresh PID/starttime absence перечитывает дважды. Current empty inventory sealed до release; fresh pair и command проверяются, global proof включает prior/current source refs. Completion graph учитывает common actors отдельно от slot cleanup. TDD real EISDIR at server receipt→actual controller SIGKILL137→old recover refused RED→GREEN.100 unit PASS/433 (8.42s), native tail+base2 PASS/33 (117.16s), typecheck/diff PASS. Unconfirmed process capture leaves recovery-only server; restore exact known source→retry releases only server, user/profile bytes/revisions1 unchanged, no new admin directory with unreadable runtime, archived history preserved. Private600 native-tail-2fb30702.../tail.json SHA243a1648...,14 source hashes/result match/exact pair absent. RED n4IMAF recovered through public CLI and destroyed after24 checks; qualified-tail SHA528096e0.../12 sources + cleanup audit. Mixed partial A/B/other crash windows/active CLI remain open.
- [x] Mixed recovery ownership primitive: recoverPreparationLeases принимает released/retained original manifests; под new server recovery-only fence validates released slots через finalizeReleasedSlot, пишет completedSlots refs и принимает CAS только pending slots. Descriptor checkpoint предшествует следующему adoption. TDD released A rejected RED→GREEN; real OS controller exit/fs/flock + data-only cleanup codec подтверждают A bytes unchanged/B-only ownership/common fence held.101 unit PASS/438 (7.30s), typecheck/diff PASS. Native consumer и archive reuse добавлены следующей подзадачей.
- [x] Mixed pre-CLI finalization/archive reuse: native finalizer validates completedSlots и pending subset, объединяет cleanup refs в configured order; ранее committed/intent B archive берётся по original/recovery lineage и повторно проверяется существующим archive codec, без нового пустого архива. Native actual original controller SIGKILL137: A released, B root canary refusal, failed recovery сохраняет общий fence; удаление только собственного test canary и retry завершают B, A resource bytes неизменны, original history-b сохранена. Initial native GREEN1 PASS/12 (72.23s); missing composite data-only RED re-adopted A→GREEN3 unit/25 assertions с changed descriptor SHA refusal. Related113 unit PASS/512 (19.26s), typecheck/diff PASS. Saved original RED izBc4f выпущена public CLI,23 source hashes/36 audit checks PASS, own pair destroyed/root removed; private qualified-mixed SHA43a5ab76.... Mixed missing result/completion RED→GREEN native1 PASS/18 (82.52s): metadata byte-identical с unreadable runtime, без новых controller files/server CAS. Private600 native-mixed-c6167cfe... SHA d71d7ca4...,23 source hashes/exact pair absence PASS. Один собственный concurrent browser run дал quarantined process proof, incident dyI2ST сохранён в blockers.
- [x] Native partial slot release + recovery SIGKILL qualification: actual finalizer у B получает EISDIR на втором resource release proof, оставляя profile released/user retained после release A; original controller SIGKILL137. Первый recovery-only CAS принимает оба B resources/revision2 и тоже SIGKILL137 до admin dispatch. Public retry от original incident завершается, B revisions3/lineage2, A resource bytes неизменны, original committed history-b reused; missing result/completion затем согласуется без CLI runtime. Existing production implementation прошла новый сценарий без изменений, native1 PASS/19 (62.30s), typecheck/diff PASS. Private600 native-mixed-55aff707.../mixed.json SHA5d634270...,21 source hashes/31 audit checks/exact pair absence PASS. Это native partial resource boundary и два реальных SIGKILL; не active CLI/session/backup qualification.
- [ ] RED для публичной `parallel-env recover` этой задачи: один `browser-exited` не разрешает file cleanup; прежний server epoch, неизвестная session и активная операция оставляют `storageDeletionAllowed=false`, `nextAdmissionAllowed=false`. Проверить JSON receipt: `processes="confirmed"`, `serverSessions="unknown"`; затем реализовать команду и довести тест до GREEN в этой же задаче. Внешний adapter используется в реальном Docker/browser fixture; внутренних моков нет.
- [ ] Все реальные Loginom/driver/recover/runAttempt проверки этой задачи поместить в `parallel-lifecycle-integration.test.ts` (и уже исключённый `isolated-storage.test.ts` для старого контракта). Обычные `no-artifact-cleanup`/`transition`/`user-environment` tests остаются fake+dir/receipt/fs, без Docker. Local команда: `bun test test/parallel-lifecycle-integration.test.ts` с research config и receipt; skip не заменяет GREEN.
- [ ] В `runAttempt` заменить повторный binary-вызов `checkIsolatedLoginom` **только для v2** на короткую проверку slot identity/lease/marker/configured network+alias и своего root из задачи 3. В `test/parallel-lifecycle-integration.test.ts` проверить начало A при активном B и отказ A при собственных остатках; legacy binary продолжает прежний admission. Без изменения этого call site каждый v2 attempt будет блокироваться старой проверкой.
- [ ] RED на настоящем disposable Loginom: тест на фактическом `runAttempt` должен обнаружить, что `cleanupArtifact`/`cleanupOrphanResult` пока вызываются до `afterAttempt`; создать no-artifact result и незавершённую серверную сессию, требовать сохранения файла. Переносится **всё** удаление, включая аварийное/orphan, а не только `cleanupIsolatedStorage`.
- [ ] Запустить `bun test test/no-artifact-cleanup.test.ts test/transition.test.ts test/user-environment.test.ts` (RED); live-часть запускается в отдельном Docker/browser integration окружении. Без него skipped означает непроверенный fence, не PASS. Сохранить измеренный результат и все copy/evidence операции; delete отложить за единый fence в `afterAttempt`/`cleanupSlot`.
- [ ] Реализовать единый порядок: остановить собственные процессы → сохранить diagnostics/артефакты → выполнить нужный CLI recovery с учётом новых соединений → **повторно подтвердить остановку всех локальных writers после последней management-команды** → архивировать историю, БД/WAL/SHM и inputs с durable archive receipt → через admin закрыть подтверждённые собственные server sessions → подтвердить их отсутствие и прекращение operations/package locks → сохранить closure receipt → удалить собственные server files и доказанные backups → проверить root/epoch/marker → сохранить cleanup receipt → release/retry/следующее задание.
- [ ] Сделать архивирование crash-recoverable: до перемещений записать manifest исходных/целевых путей и identity/hash, после переноса и проверки — fsync данных/каталогов и committed receipt. При SIGKILL между DB/WAL/inputs moves recovery согласует обе стороны по журналу; частичный архив не считается committed, обе части сохраняются до однозначного завершения. Подтверждённый прежний архив переиспользуется, не заменяется новым пустым архивом.
- [x] Подзадача 5: новый profile-archive.ts/archiveProfileEvidence использует существующие profileHistory/assertProfileSettled, не меняя legacy archiveProfileHistory. Caller держит profile lease и предоставляет private preallocated target/controller journal. Intent durable до rename; inode/device/type/mode/UID/hash, обе стороны, canonical root bindings, target topology, fsync files/dirs/root parent и committed receipt. Reuse не заменяет manifest пустым. 11 real-fs/process cases/69 assertions: DB/WAL/SHM/inputs, partial I/O+reconcile, actual SIGKILL, foreign/symlink target, hardlink, live writer, changed data/root, unusual names/symlink objects. 80 archive/profile tests/267 assertions, typecheck/diff check PASS (40.10s). Primitive ещё не подключён к cleanupSlot/recover/main; server close/delete/release gates этим не квалифицированы.
- [ ] При неопределённом CloseSession committed архив остаётся доступным для диагностики, server files не удаляются, слот/leases карантинятся, retry запрещён. При неподтверждённых local writers или незавершённом CLI recovery история не перемещается: сохраняются оригиналы и диагностика с явной пометкой неполноты. Ошибка архива сохраняет оригиналы/частичный архив и запрещает server deletion/release; допустимый best-effort close доказанно собственных sessions прекращает операции, но не снимает этот запрет.
- [ ] RED/GREEN: archive committed → потерянный close response; SIGKILL между archive receipt и close; SIGKILL посередине DB/WAL/inputs moves; I/O failure архива и живой writer. Проверить хэши сохранённой истории, отсутствие server delete/retry/release, сохранение B и возможность повторной recovery по журналу. В новый `recover` не добавлять безусловный запуск CLI после уже committed archive.
- [ ] После финального close fence до окончания file cleanup не вызывать `loginom check`, `setup`, `status` с побочным подключением или другой producer server sessions. Повторный scan и admin read-back не должны открывать соединение оцениваемого пользователя.
- [ ] Реализовать user-only traversal по argv, без glob и `split("\n")`: dotfiles, `.autosave`, имя с пробелом/tab/newline, `-leading`, Unicode, вложенная директория, symlink и hardlink. Root и его предки должны быть canonical directories; удаление symlink-объекта не переходит по target; hardlinks/непонятная ownership topology дают безопасный отказ до delete. Удаляются все материалы **своего** пространства, а не только `eval-*`.
- [ ] После timeout `CloseSession` сначала read-back, а не повторный слепой close/delete. Closed=true без исчезновения сессии не успех. При неизвестном исходе сохранять user/profile leases и evidence, A → quarantine, B продолжает. Server restart/смена shared ACL → общий stop admissions.
- [x] Finalizer own-root FD gate (2026-10-16): native RED700f7136…1 FAIL/16 assertions131.45s через actual sandboxed text CLI/public finalizeSlotAttempt подтвердил sessions_closed при настоящем FD7 в root A после полного native absence. Original FAIL/paused prefix, источник активного FD и inode, SDK/SQLite архив, транспорт и exact own teardown сохранены; auditff62269e…232 checks/97 sources/6 causal+20 pins. Three-line runtime gate отказывает ATTEMPT_SERVER_FILES_ACTIVE до terminal write; native GREEN5a3c024d…1 PASS/35 assertions174.82s: actual holder release0→новый чистый point→sessions_closed, original rejected point сохранён; stable replay, changed-hash/backdated refusal и pending reconstruction проходят. Typecheck/diff PASS; GREEN auditad2bd5a1…298 checks/130 sources/7 causal+20 pins, original rejected positive point сохранён. Related agent/management process/session15 PASS/166 assertions60.14s. Exact own pair/network/root absent у RED и GREEN; оба SDK/SQLite архива и original FAIL сохранены; 5 duplicate temp files удалены после SHA/read-back. Полная mmap/operation/backup/no-regrowth qualification этим не заменяется.
- [x] Finalizer user-root topology gate (2026-10-16): actual text CLI native REDce3a9440…1 FAIL/18 assertions184.53s accepted terminal after successful hardlink creation; raw link stat was not captured in original RED, exact test source/control and original verdict retained (audit6ee9947f…61 checks/16 sources+20 pins). One existing inspectUserStorage call after post-close kernel FD gate now refuses unsafe topology before terminal. Native GREEN67bf6231…1 PASS/39 assertions225.24s/audit13e20eec…324 checks/139 sources/8 causal+21 pins: actual NUL before/after shows nlink2 file, names/inodes unchanged, no terminal; removing only control hardlink permits ordinary finalization/replay/sidecar reconstruction with dotfiles/autosave/space/tab/LF/Unicode/leading-dash/nested files and symlink object intact, B canary SHA unchanged. Source snapshots and archived SDK SQLite retained, own3 IDs/root absent. Browser regression64edcd81…1 PASS/25 assertions237.72s/auditc8fc0894…1902 checks/160 sources/24 causal+21 pins; normal actual Loginom material, replay and reconstruction pass within original240s budget. Related15 PASS/166 assertions61.77s/typecheck/diff PASS.8 duplicate temp logs/helpers removed only after SHA read-back. This is readonly finalizer consumption, not general deletion or published-inode/backup/operation/release/admission qualification; both grants false.
- [x] Native finalizer server-storage archive binding (2026-10-16): focused actual sandboxed text CLI e183a9a4… RED1FAIL/11 assertions162.53s returned sessions_closed v2 without storageArchive; source audit1e89c0ba…23pins/20 snapshots. Minimal finalizer integration emits v3 only after closed-session/fenced-kernel gates and all-owned committed archive; pending producer checks source, completed replay reads historical archive. GREENd9a1bf27…1PASS/32 assertions187.16s within unchanged240s; stable replay and missing-terminal/closed-sidecar reconstruction keep the original archive source. Independent audit7a2b69e7…80 source refs,9 regular files/binary input SHA/symlink/NUL physical metadata/SDK SQLite and exact3 resources/root absence verified. Related15 PASS/166 assertions63.16s/typecheck/diff. Both grants false. Dedicated test-only archived variant preserves existing FD/topology controls; previous broad timeout2203 is not promoted (cause unproven, retired research evidence708c23f4…). Existing FD/topology native regression1f474d72…1PASS/43 assertions214.58s, audit7da6f7bf…90 references/9 regulars/23pins/20 snapshots/SQLite and own3 IDs/root absence; separate literal negative audit9c4a10dc… verifies both refusals/FD exit0 and every regular payload. Browser regression running at the same240s budget; full cleanup/backup/release/admission remain open.
- [x] Partial server archive filesystem reconciliation (2026-10-16): real-FS copying journal + truncated700-byte payload RED refused → GREEN1PASS/9 assertions61.13s. Same source root/content must match the original intent; recovery creates a fresh private directory/tar, retains all old partial bytes and records expected/observed size/SHA or absence. Independent historical reader verifies new full payload and retained partial chain; second missing-payload reconstruction passes, source value remains original. This is a reconstructed filesystem boundary, not actual SIGKILL or recovery-only lease qualification. Foreign partial-history path accepted RED1FAIL53.16s → shared loader refusal; final three archive cases3 PASS/50 assertions171.99s, including changed-source refusal preserving pending journal/payload. Typecheck/diff PASS. Verification/source snapshots retained;5 temporary duplicates cleaned. Full finalizer consumption remains open, both grants false.
- [x] Committed server storage archive replay (2026-10-16): actual Docker RED1FAIL/35.44s USER_STORAGE_ARCHIVE_EXISTS → guarded historical reader + byte/inode-stable producer replay GREEN1PASS/7 assertions42.14s. Repeated producer compares fresh root metadata and regular content with the prior snapshot, refuses changed/empty source without replacing committed material; historical reader still verifies the retained tar after source removal. Held lease/publication/context and private directory/payload/hash checks; both grants false. Corrupt-source/context/mode/hardlink/symlink/payload negatives and full pathological-name regression2 PASS/36 assertions91.95s; typecheck/diff PASS. No production change needed for these negative controls. Partial-copy reconciliation/finalizer consumption remain open.
- [x] Data-only all-owned server storage archive producer (2026-10-16): held server/slot + protected publication/current physical inode → NUL-safe metadata snapshots → two Docker cp tar content/hash comparisons → private fsynced payload and copying/committed journal. Actual Docker positive1 PASS/21 assertions37.89s preserves binary LGP, dotfile/autosave/space/tab/LF/Unicode/leading-dash/nested regulars, empty directory and symlink object; independent Python tar reader checks names/bytes/target, original root metadata and B canary unchanged. Initial missing API RED, then Bun1.3.14 PAX Unicode truncation reproduced offline; GNU tar --to-command hashes regular stdin without filesystem extraction, fixed minimal env. Both grants false; this is data-only ownership codec, not native session/quiescence/delete qualification. Related profile/archive/user/agent/management32 PASS/229 assertions63.76s; typecheck/diff PASS. Private source/control verification f6869d56… retained;7 duplicate temporary files removed after SHA read-back. Replay/partial archive reconciliation and finalizer consumption remain open.
- [x] Finalizer own-root file-backed mmap fence (2026-10-16): native REDfd50f79a…1 FAIL/18 assertions144.58s принял terminal при настоящем mapped executable A без единого own-root FD; пять map segments совпали с inode скопированного /bin/cat. Auditbb89c0cb…67 checks/16 sources+21 pins. Пять строк runtime выделяют pathname после пяти metadata columns из уже bound /proc/maps и отказывают ATTEMPT_SERVER_MAPPINGS_ACTIVE до terminal write. Native GREEN672886f3…1 PASS/37 assertions177.04s/audit4105c9d6…309 checks/133 sources/7 causal+21 pins: pathname с пробелом/Unicode/U+2028, refusal при mapping, EOF/exit0→fresh absence с прежним inode→обычная finalization/replay/reconstruction. Existing FD/topology regression4edb2b66…1 PASS/39 assertions192.54s/audit6da34ebf…301/133/4 causal+21 pins; related15 PASS/166 assertions60.46s/typecheck/diff PASS. Aggregate240s/holder60s budgets unchanged; отдельный test-only mapped variant. Все9 own Docker IDs и3 controller roots absent, SDK/SQLite архивы и original FAIL сохранены;7 duplicate temp files удалены после SHA/read-back. Это pathname-scoped snapshot fence, не доказательство anonymous/relocated mappings или всех operations, не cleanup/release/admission grant.
- [x] Native A/B kernel control (2026-10-16): новый test-only сценарий проходит на существующем collector/runtime без исправления production-кода; искусственный RED не заявляется. Перед адресным close A обе нативные операции активны и обе package sidecars держат PID1 FLOCK на разных inode. После close A её FD/lock отсутствуют, B сохраняет inode/FD/FLOCK, тот же native session/package ID и активный Progress, затем успешно заканчивает 10s node; canary SHA неизменен. После отдельного close B освобождены оба root/lock. Native607f0ea7…1 PASS/103 assertions94.56s, auditbec18a5b…123 checks/38 sources+13 pins; controller close A→B finish9458ms. Typecheck/diff PASS; 12 repo source snapshots, actual candidate and both native transport/process closures retained; exact own3 IDs/root absent. Это конкретный положительный A/B control; operationsQualified/cleanupAllowed=false, autosave/no-regrowth и полная coverage остаются открыты.
- [x] Autosave/browser-crash + active B no-regrowth (2026-10-16): native28ca68f5…1/101 PASS180.55s; audit77f73737…123/42+12 pins. B40s active before A preparation, actual separate browser crash372ms, measured autosave5000ms, positive LGP/autosave retained, bound close→native absence/FD release→argv-only2file cleanup→3 raw empty listings across10817ms. B succeeds afterward, same inode/FLOCK/canary and canonical A root/epoch preserved. Legacy A/B fa3c4190…1/103 PASS157.21s/audite2b47872…123/38+13 pins; related50/162 PASS24.26s/typecheck/syntax/diff PASS. Original RED/diagnostics and private verification preserve source snapshots; all own diagnostic pairs/roots retired,9 duplicate temp files cleaned. Strict runtime layout/short TMPDIR/event-only Browser.crash wait fixed; new case budgets240/120/90/70 for both autosave phases and40s B, existing controls unchanged. General traversal/SessionBackup/all workloads/production cleanup/release/admission remain open; all grants false.
- [x] Немодельный тест: держать B активным, явно включить autosave A с измеренным period (по умолчанию выключено), создать A `.autosave`, аварийно завершить browser A, доказать сохранение B, закрыть server A, очистить A и наблюдать отсутствие повторного появления. Окно наблюдения связывать с фактическим autosave period и deadline; 12 секунд исторического probe не превращать в универсальную константу.
- [ ] RED/GREEN lifecycle команд на реальной fs/процессах и disposable Loginom: standalone prepare → повторный prepare → verify освобождают reservations; авария controller с живым child → обычный prepare получает RECOVERY_REQUIRED → recover принимает подтверждённую lineage → cleanup/released. Проверить CAS → crash recovery → повтор с тем же incident; последовательное восстановление A/B; last slot released → crash до admin/judge/server release → повтор завершает только общие ресурсы. Полностью terminal incident идемпотентен; второй recover не применяет stale CAS. Partial recovery A сохраняет общий fence для B/admin/judge. Полную цепочку с новым run завершить в задаче 8.
- [ ] Проверить `bun test test/artifact.test.ts test/profile.test.ts test/lease.test.ts test/isolated-storage.test.ts test/no-artifact-cleanup.test.ts test/transition.test.ts test/user-environment.test.ts`, `bun typecheck`; коммит `fix(evals): close owned server sessions before user storage cleanup`.

### Задача 6. Два supervisor и доверенный административный browser

- [x] Writer refusal diagnostics (2026-10-16): after3 actual native runs stopped before the intended storage RED at status/setup/agent, preserve precise owner-stat/owner-open/transition branch, errno, reader phase, timestamp and observed directory dev/inode/UID/mode in optional ProcessCleanup.writerRefusal. Owner bytes/argv/env are absent; error string/failed status/guard/budget/reconciliation eligibility unchanged. Real-fs missing metadata RED→GREEN; actual supervised external fake CLI receipt lost metadata RED→GREEN. Related30 PASS/3 existing nativeBusy SKIP/83; full supervisor59 PASS/3 nativeBusy SKIP/246 (175.52s), final writer11 PASS/21 (2.93s), typecheck/diff PASS. Reader phase identifies code branch, not the historical writer operation. Original native failures and source snapshots preserved; target hardlink qualification remains open, pending patch SHA3abb1be3… retained privately. Research archival/decommission receipts tracked in blockers; no production cleanup/admission grant.

- [x] UID refusal diagnostics: error сохраняет actual sampled proc-directory UID и best-effort stat birth/state (unknown при read failure), без argv/ослабления guard. TDD read-only false historical claim на actual foreign-UID PID1: old message RED→GREEN1/5 (0.779s), source unchanged/no signaling. Supervisor/writer suites34 PASS/2 existing nativeBusy SKIP/182 assertions148.47s, typecheck/diff PASS. Старый eR7Snq frame этим не восстановлен; новая инструментированная native квалификация требуется отдельно.

- [x] Management cancellation primitive: public management принимает optional AbortSignal и передаёт его в существующий process supervisor, включая inventory path. Actual OS child readiness marker→AbortController: RED ignored signal/timeOut=true→GREEN interrupted=true/timeOut=false/confirmed closure; immutable result reader сохраняет флаги. Target1 PASS/23 (3.41s), typecheck/diff PASS. First combined имел10s timeout: OS fixture обрабатывала SIGTERM, supervisor начинает с SIGINT/30s grace. Fixture исправлена на explicit SIGINT, проверки и10s лимит сохранены. Final combined75 PASS/239 (51.58s),5 repeated isolated PASS/115 (15.27s), typecheck/diff PASS. Это транспорт отмены, не полная SIGINT orchestration или native failed-check ownership.

- [x] Подзадача 6/8: supervisor снимает SIGINT grace timer после подтверждённого выхода команды; полный 30s grace для живой команды сохранён. Отдельный actual subprocess RED: inner cleanup confirmed, но orphan Bun.sleep удерживает host до outer timeout10s; GREEN1 PASS/5 assertions (2.35s). Полный supervisor26 PASS/143 assertions (133.47s), typecheck/diff PASS. Калибровочный tracer отдельно подтвердил исходный симптом STABLE3/3: отчёт готов, host не завершён к20s; collector report600 /tmp/evals-calibrate-sigint-signal-olg1sne8.json. Это таймер ожидания, правила process identity/admission/signaling не менялись.

- [x] Подзадача 6/7 (2026-10-14): writerIdentity различает начальное окно mkdir(.writer)→owner write и release после уже наблюдённого owner. Real-FS RED STABLE 3/3 через public API (owner опубликован через 40ms); GREEN возвращает точную device/inode/nonce без удаления guard. Persistent ownerless guard и symlink остаются отказами. 3 target tests PASS/5 assertions, cold profile/supervisor 95 PASS/315 assertions (139.26s), typecheck/diff PASS. Mixed run с одновременным native smoke дал 94 PASS/1 FAIL (linuxProfileOwners PID532038); narrow cold 3/3 PASS, PID не атрибутирован, причинность bwrap не доказана. Registry/foreign-process proof остаётся открытым.

**Files:** Modify `evals/src/process-supervisor.ts`, `evals/src/process-launcher.ts`, `evals/test/process-supervisor.test.ts`, `evals/fixtures/fake-cli.ts`; Create `evals/test/process-supervisor-integration.test.ts`.

**Interfaces:** Existing `superviseProcess` получает доказанную информацию о других живых launcher контроллера; registry хранит `(pid,starttime,uid,executable identity)` и владение slot/admin, а не строки argv.

- [x] RED: одновременно запустить два настоящих supervisor с одним browser bundle; fixture B создаёт новые grandchildren без `--user-data-dir`, меняет process title и reparent. Cleanup A подтверждён, B жив и продолжает писать свой heartbeat; чужие процессы не сигналятся и не объявляются своими.

```ts
expect(a.processCleanup.status).toBe("confirmed")
expect(a.processCleanup.unknownProcesses).toEqual([])
expect(await Bun.file(bHeartbeat).text()).not.toBe(beforeCleanup)
expect(a.processCleanup.processes.some(item => item.pid === bRootPid)).toBe(false)
```

`a` — результат существующего `superviseProcess`; heartbeat/root PID принадлежат fixture и проверяются настоящим `/proc`, без monkeypatch. Первый helper RED устойчив 3/3: exact A-unknown = B-allowed/subreaper, B cleanup confirmed. Уточнение fixture: Bun process.title на хосте не меняет /proc; настоящий Node с тем же executable bundle доказал пустой cmdline. Node tracer на baseline supervisor RED (unknown helper), registry GREEN 1 PASS/10 assertions (13.81s); полный supervisor regression 22 PASS/109 assertions (111.42s), typecheck/diff PASS. Registry process-local и private: только superviseProcess публикует spawned launcher/allowed ancestry, каждый peer сверяется с fresh snapshot; owner slot/admin/judge — метаданные, не authority. Третий trusted admin и negative PID/unknown gates ещё открыты. Третьим участником повторить этот сценарий с trusted admin browser.

- [x] Запустить `bun test test/process-supervisor.test.ts -t "parallel"` (RED). Добавить минимальный registry известных launcher и их доказанных цепочек потомков; убрать только воспроизведённую ложную принадлежность. Непроверяемый PID остаётся unknown, argv/PGID/path не разрешают исключить процесс. Дополнительный unmanaged outside-profile RED: было confirmed лишь по argv; GREEN удаляет этот exemption, сохраняет процесс живым/unknown и не включает в owned. 4 target tests PASS/21 assertions (23.77s), typecheck/diff PASS; PID/birth/executable gates не ослаблены.
- [x] Подзадача 6: настоящий kernel PID reuse в отдельной PID+user namespace с CAP_CHECKPOINT_RESTORE, host namespace IDs требуют отличия до ns_last_pid write. Retained failed owner (private evidence write fault) имеет тот же recycled launcher PID20, UID/device/inode/PGID/SID, но новую birth; signalProcess old identity отказывает, B завершает exit0/confirmed и не получает stale peer claim. 1 PASS/11 assertions (1.69s), typecheck/diff PASS, pid-reuse.json private read-back PASS; existing birth guard не менялся ради qualification. Root UID0 только внутри actor-owned user mapping; global kernel PID counter/чужие процессы не затронуты.

- [x] Подзадача 6: admitted peer B становится unreadable через настоящий PR_SET_DUMPABLE. Public two-supervisor RED сохранял stale peer claim в failed A receipt; GREEN очищает peerProcesses на failed fresh observation, delivery/identity refusal сохранён, A не объявляет B своим, B heartbeat/exit0 сохраняются. Target1 PASS/8 assertions, полный supervisor24 PASS/126 (116.45s), typecheck/diff PASS. Неподтверждённый scan не является новым доказательством peer ownership.

- [x] Подзадача 6: новый reparented helper B появляется после выхода launcher A, пока A выполняет cleanup; подтверждён physical ordering по exit marker/helper PID mtime/final verification. Node browser fixture задерживает spawn на2800ms, parent исчезает, helper очищает argv; A сохраняет heartbeat/birth B и исключает его из signals, отдельный abort B подтверждает ownership/cleanup. Fixture RED (нет exit marker)→GREEN двух timing variants2 PASS/22 assertions (27.15s); полный supervisor25 PASS/138 assertions (129.42s), typecheck/diff PASS. Production supervisor не менялся; authenticated admin reconnect остаётся отдельным gate.

- [x] Подзадача 6: свежая kernel parent chain отделяет потомков доказанного peer от кандидатов A, включая ещё не admitted промежуточный процесс B; signal authority не расширена. Исходный sibling delay0 flaky 2/3 FAIL; новый deterministic refused-child RED→GREEN подтверждает cleanup A, сохранность child и quarantine B. После исправления оба кейса 5/5 PASS (10 tests/75 assertions); полный supervisor+process resources32 PASS/207 assertions (142.10s), typecheck/diff PASS. Native current-code qualification выполняется отдельно.

- [ ] RED/GREEN: PID reuse, исчезновение parent между чтениями, unreadable `/proc`, новый descendant после scan, abort A во время работы B, административный reconnect. Сохранять порядок signals и возможность завершить cleanup внутри CLI до уничтожения namespace launcher.
- [x] Подзадача 6: observations содержит отдельные max_start_delay_ms и max_gap_ms по monotonic clock. Scheduled timestamp сохраняется до входа actual proc scan, предыдущий actual start — до следующего; max_duration_ms сохраняет прежний смысл. Public native two-child test с реальным 400ms event-loop stall: RED (полей нет)→GREEN1 PASS/6 assertions; lower bounds delay>=100ms/gap>=300ms. Unit_after_exit не выдаёт skipped polls за proc scans. Broad process/profile/CLI/judge/admin: 185 PASS/619 assertions (263.01s), typecheck/diff PASS; browser/live workload measurement остаётся следующим gate.

- [x] Отдельно измерить задержку **между запланированным и фактическим запуском** proc observations и разрыв между scans под нагрузкой двух слотов; `observations.max_duration_ms` измеряет время самого scan и не заменяет это измерение.
- [ ] Проверить `bun test test/process-supervisor.test.ts`, `bun typecheck`, затем real Chromium немодельный smoke. Если узкие исправления не доказывают границу, фиксировать процессный blocker live; ACL Loginom не использовать как объяснение безопасности процессов.
- [x] Подзадача 6/2: native installed gate воспроизвёл ADMIN_RUNTIME_INVALID до dispatch, так как manifest chrome-sandbox имеет полный mode04755 (observed root:root04755). Harness runtime validator принимает 0..07777 и сравнивает все permission bits, не отбрасывает SUID; потеря SUID даёт ADMIN_RUNTIME_MODE. Public real-FS RED→GREEN, 23 preflight tests/48 assertions и typecheck PASS. Fixture использует /bin/chmod: Bun chmod маскирует special bits. Chromium smoke следующий, live admin не квалифицирован.

- [x] Подзадача 6: single installed Chromium nonmodel smoke в одной чистой bwrap PID/net boundary; host FS read-only, только собственный proof root writable. Bundled Node+Playwright/browser проверены полным manifest inventory; root helper04755 сохранён. 1 PASS/9 assertions (3.12s), 13 owned processes/origins launcher-cli-parent-subreaper, 1 browser binding, unknown=[], final[0,0]. Private receipt /home/kiselev/.local/state/loginom-evals/parallel/process-proof-H3itV4/single.json read-back PASS; max_start_delay_ms4.50/max_gap_ms104.37/scan_duration4. Loginom/admin RPC и модель не вызывались, liveQualified=false. Parallel/trusted real admin gate остаётся следующим.

- [x] Подзадача 6: native три trusted Node/browser launcher (A/B/admin-role) в одной чистой PID/net boundary; abort A сохраняет heartbeat/owned exclusion B+admin, admin-role закрыт/reconnect пока B работает, cleanup B сохраняет новый admin heartbeat. 2 integration PASS/25 assertions (9.44s), четыре receipts confirmed/unknown=[]/final[0,0], каждый13 owned и1 binding. Private parallel.json read-back PASS; max scheduled→actual delay6.67ms/gap106.55ms/scan9ms. RED3/3 FAIL: stale-key TypeError2/3 и отдельный stdin delivery1/3; source rechecks entry после fresh scan (исчезнувший peer не signal authority). Fixture stop сначала EOF, затем AbortSignal: не искусственный abort transport. Guard ошибки доставки не ослаблен. Cold supervisor+parallel48 PASS/279 assertions (231.42s), typecheck/Node --check/diff PASS; authenticated Loginom admin bridge, actual PID reuse и live model load остаются открытыми.

- [x] Подзадача cleanup/receipt (2026-10-14): после native2/25 и real PID reuse1/11 сохранены три private proofs, attached к current candidate receipt как processEvidence scope nonmodel-native-browser-and-kernel-pid-reuse-only/liveQualified=false, SHA каждого и read-back. Удалены5 собственных superseded native scopes +16 launcher capsules только после metadata/inode/UID/mode audit и terminal private PID namespaces; host PID signals0. superseded-scopes.json600 read-back PASS; proof JSON, logs и текущая candidate installation сохранены.

- [x] Подзадача current-code process qualification: после fresh-peer guard повторены native2 PASS/25 (8.98s; PID case skip не засчитан), отдельный kernel PID reuse1 PASS/11 (1.69s). Current candidate processEvidence с SHA трёх proofs/read-back указывает process-proof-refresh-Iv7Was и tested harness31f8392608, liveQualified=false. Shared model status/public pins не изменены; authenticated admin bridge не квалифицирован. Старые statements времени описывают прошлые наблюдения; current proof set — эта директория.

- [x] Подзадача current-code process qualification ec14eb39d6: native single/parallel2 PASS/25 assertions (14.29s), отдельный real kernel PID reuse1 PASS/11 (1.70s) в private PID/user/net/mount boundaries. Все cleanup confirmed/unknown=[]/final[0,0]. Candidate processEvidence обновлён тремя SHA/read-back в process-proof-peer-I4B4Aa; предыдущий receipt сохранён, liveQualified=false. Authenticated Loginom/admin и OAuth gates остаются открытыми.

- [x] Настоящие Bun/PID fixtures остаются в unit `process-supervisor.test.ts`; bundled Chromium, bwrap и trusted admin scenario — в `process-supervisor-integration.test.ts`. Запустить его отдельно на этом хосте с receipt и доступным установленным prod runtime; shared OAuth не требуется.
- [x] Коммит `fix(evals): preserve process ownership across parallel supervisors`: первый registry tracer завершён; остальные gates задачи 6 выше сохраняют отдельные открытые checkbox.

### Задача 7. Потребить временный shared OAuth, сохранив независимую авторизацию судьи

- [ ] Actual judge launch qualification: current PATH `codex` is a VPN/systemd wrapper with hardcoded Desktop CODEX_HOME, overriding the dedicated env; supervised login-status also rejects bash executable identity. Status exit0 is not dedicated-home auth evidence. Preserve VPN restrictions; require approved home-preserving launcher and positive process containment, plus cleanup/recovery of retained judge-status-A00yuH. Diagnosis/source SHA in eval_parallel_blockers.md; no live judge/model calls admitted.

- [x] Actual configured shared-store status control 2026-10-15: pinned candidate binary/manifest SHA и shared-oauth-v1 проверены; real `assertAuth` admission, затем два отдельных CLI в bubblewrap `providers status` дали ready с теми же generation/principal SHA, refresh_required=false. Overlap5802ms, общий auth.json.lock device/inode неизменён; оба process cleanup confirmed/capture complete. Private receipt actual-shared-status-0WIqV1/receipt.json600 SHA b00e0ba6103b7706317a0d606f3ea74df3ee817f1cc4d2cc95e1a05e05d77fd8/read-back; helper setup errors до sandbox spawn убраны по отдельному cleanup audit, временные profiles/workspaces удалены после proofs. Это реальная schema/consumer/lock проверка; remote token validity, forced refresh, cancellation/uncertain refresh, model dispatch и judge live не квалифицированы.

**Files:** Modify только harness `evals/src/cli.ts`, `evals/src/sandbox.ts`, `evals/src/profile.ts`, `evals/src/preflight.ts`, `evals/test/cli.test.ts`, `evals/test/sandbox.test.ts`, `evals/test/profile.test.ts`, `evals/test/judge.test.ts`, `evals/test/preflight.test.ts`; Create `evals/test/shared-oauth-integration.test.ts`. Product integration и её файлы принадлежат основному чату.

**Interfaces:** Consumes установленный CLI capability `shared-oauth-v1` и canonical `auth.sharedDir`; передаёт `LOGINOM_AI_AGENT_SHARED_AUTH_DIR` и обязательный `LOGINOM_AI_AGENT_EXPERIMENTAL_WEBSOCKETS=false` агентским и management процессам; judge использует отдельный `judge.codexHome`.

Продуктовый prerequisite выполняется основным чатом на этой машине до GREEN shared
sandbox и live задачи 10. Задачи 1–6 и fixture-реализация 8–9 его не ждут: для
немодельной подготовки есть установленный `0.1.17-prod` (source `5588651a…`) без
`shared-oauth-v1`, он не допускается для live v2 model run.

- [x] Зафиксировать границу коммитов до интеграции: временный блок переносимых OAuth-зависимостей, затем отдельные собственные изменения `evals/` и документации. Продуктовая работа использует `cherry-pick -x` и сохраняет таблицу source SHA → local SHA, исходную базу, порядок и разрешения конфликтов в `evals/docs/parallel-users-contract.md`. Не добавлять evals-логику в импортируемые коммиты, не amend/fixup/squash-ить с ними последующие адаптации.
- [x] Подзадача 7 (2026-10-14): fresh clean candidate 04ff82be4d собран в candidate-artifact-install-fix; archive roundtrip и --shared-oauth verifier PASS. Public installCli в candidate-home PASS, installed verifier PASS, native chrome-sandbox root:root/04755 read-back. Private durable candidate-receipt.json 0600 сохраняет installed binary/manifest/source pins, capabilities=[shared-oauth-v1], liveQualified=false. Host full suite 336 PASS/7 SKIP/2080 assertions (113.75s); model login/forced refresh/bwrap/judge auth/live не квалифицированы. Первоначальные собственные artifact/archive/checksum удалены после read-back новых pins; установленный candidate и новая сборка сохранены.
- [ ] Env filters, mounts, auth admission, lifecycle и тесты реализовать поверх установленного CLI внутри `evals/`. Не копировать shared store/refresh/lock и не импортировать приватные исходные модули продукта как runtime-зависимость harness. Если существующего контракта действительно недостаточно, записать конкретный пробел и выделить минимальную продуктовую правку в отдельный коммит основного чата с тестом и планом поставки upstream; не скрывать её внутри временного cherry-pick.
- [ ] Учесть поздний round4 shared-oauth: exact installed `597592f5d53f86beb69ffe318af2d4db52c5f416` принят для 8 локальных CLI с overlap 3464 мс и ограничениями наблюдаемости (`956c81fea7390451d51d7a9df069829c3adc403a:docs/testing/loginom-ai-agent/multica-mas.md:130–148`). Это устраняет прежнее blanket NOT_READY, но не доказывает forced refresh или новый evals/bubblewrap: кандидат после переноса квалифицируется отдельно.
- [x] Основной чат создаёт отдельную ветку/worktree от подтверждённой `loginom`, переносит `cherry-pick -x` в порядке зависимости `dfd2b0df2de6b60f529973f35fcccc59feceef5f`, `ba919629f966e23670ff0a02720057067adbb040`, `bd4951803532db3f51c1b5a66a864038d88865c3`, **`66f0956bc9f16ee580b20f3cf98e368857048f27`**, **`3bcf645a7363b41aed709b985a63758431abeee6`** либо подтверждает их уже слитые эквиваленты. Последний commit исправляет фокус password при входе в Loginom и входит в принятый round4 artifact; включён обязательной отдельной product-зависимостью, не evals-адаптацией. Сверить refs перед переносом; если продуктовая работа уже поставила кандидат, не выполнять второй cherry-pick.
- [x] Подзадача 7 (2026-10-14): отдельный managed worktree evals-oauth от loginom@38ee045e79; пять dependency cherry-pick -x сохранены в собственных commits, mapping/base/order/conflict resolution записаны в parallel-users-contract.md. Product export conflict сохраняет skills + cli-capabilities; остальные четыре без конфликтов. Первый clean candidate build/archive roundtrip и --shared-oauth verifier PASS; установленный candidate ещё не квалифицирован. Agent 75/Product 8/runtime 5 tests + Agent/Host/Product typecheck PASS. Public installer потерю special mode bits воспроизвёл STABLE 3/3; отдельный product fix 04ff82be4d с RED→GREEN (9 tests/69 assertions), fresh rebuild выполняется.
- [x] Из `packages/loginom-host` нового worktree собрать Linux standalone: `LOGINOM_AI_AGENT_NODE_SOURCE=/home/kiselev/.local/share/loginom-ai-agent-acceptance/package-docs-20261006/node-v24.19.0-linux-x64/bin/node LOGINOM_AI_AGENT_BROWSER_SOURCE=/home/kiselev/.loginom-dock/runtime/browsers /home/kiselev/.bun/bin/bun script/build-cli.ts /home/kiselev/.local/state/loginom-evals/parallel/candidate-artifact`. Проверить наличие npm рядом с build Node; runtime `resources/loginom/bin/node` не заменяет build distribution. Artifact path должен быть новым и вне checkout; существующий результат не перезаписывать.
- [x] Выполнить перенесённый verifier: `bun script/verify-cli-candidate.ts /home/kiselev/.local/state/loginom-evals/parallel/candidate-artifact <absolute-worktree> --shared-oauth`. `<absolute-worktree>` — фактический путь созданного product worktree из receipt, единственный динамический аргумент; verifier старого prod флаг не поддерживает. Проверить manifest/source/binary hashes, HTTP-only env и password-focus regression.
- [x] Установить через публичный `installCli(artifact, destinationHome)` из `src/cli-install.ts`, передав `/home/kiselev/.local/state/loginom-evals/parallel/candidate-home`; каталог заранее 0700. Запуск из `<worktree>/packages/loginom-host`: `bun -e 'const { installCli } = await import("./src/cli-install.ts"); console.log(JSON.stringify(await installCli(process.argv[1], process.argv[2])))' /home/kiselev/.local/state/loginom-evals/parallel/candidate-artifact /home/kiselev/.local/state/loginom-evals/parallel/candidate-home`. Не менять HOME и существующий prod launcher. Штатный installer отдельно запрашивает необходимые root-права sandbox helper. Canonical realpath нового `candidate-home/.local/bin/loginom-ai-agent-cli`, installed root, capability и hashes закрепить в receipt и повторить verifier на installed root с тем же worktree. Только этот кандидат идёт в обе live-приёмки.
- [ ] Учесть известные контекстные расхождения `packages/product/package.json` и `packages/loginom-host/test/cli-manifest.test.ts` на исследованной базе. Это работа product integration; её результат — manifests, source SHA, binary SHA, capability, результаты сборки/профильных тестов, не лишь список коммитов.
- [ ] RED: `agentCommand` сохраняет разрешённый shared directory, судья его не наследует; bubblewrap видит один общий inode каталога/lock и не видит соседние профили, controller state и admin credential file. `assertAuth` shared-mode не принимает local `auth.json` вместо отсутствующего shared store.

```ts
expect(command.env.LOGINOM_AI_AGENT_SHARED_AUTH_DIR).toBe(sharedDir)
expect(judgeEnv.LOGINOM_AI_AGENT_SHARED_AUTH_DIR).toBeUndefined()
expect(agentVisiblePaths).toContain(sharedDir)
expect(agentVisiblePaths).not.toContain(adminCredentialsFile)
expect(agentVisiblePaths).not.toContain(otherProfile)
```

`command`/`judgeEnv` берутся из существующих публичных builders; `agentVisiblePaths` — результат реального sandbox fixture, не списка, повторяющего код mount builder.

- [x] Подзадача 7 (2026-10-14): agentCommand передаёт только настроенный sharedDir v2, parent env не даёт grant. Sandbox проверяет canonical private owner/root 0700 и flat regular files 0600 без symlink/hardlink, затем writable bind всего каталога. Два actual bwrap/Python потребителя видят одинаковые directory/lock dev:ino и atomic replacement; controller canary/history/соседний profile скрыты. RED→GREEN через public builders и реальные FS; 13 shared/sandbox tests PASS/57 assertions (8.02s), 6 builder/management tests PASS/20 assertions, 25 parallel controller tests PASS/160 assertions (117.42s), typecheck/diff PASS. Opaque fixture проверяет bind, не model OAuth/schema/forced refresh; assertAuth shared admission и installed-candidate refresh остаются открытыми.

- [ ] Запустить RED `bun test test/cli.test.ts test/sandbox.test.ts test/profile.test.ts test/judge.test.ts test/preflight.test.ts`; GREEN: оба env-фильтра, writable bind **всего** shared dir, guarded shared auth admission и сохранность store при archive/recovery/reset. Shared dir 0700, ordinary files 0600, canonical owner, без symlink/hardlink; отдельно от profiles/history/work/results/install/controller secrets.
- [ ] Первый вход выполнить один раз после создания private `onboarding/profile`: `LOGINOM_AI_AGENT_SHARED_AUTH_DIR=/home/kiselev/.local/state/loginom-evals/parallel/model-oauth LOGINOM_AI_AGENT_CLI_PROFILE=/home/kiselev/.local/state/loginom-evals/parallel/onboarding/profile LOGINOM_AI_AGENT_EXPERIMENTAL_WEBSOCKETS=false /home/kiselev/.local/state/loginom-evals/parallel/candidate-home/.local/bin/loginom-ai-agent-cli providers login --provider openai --method "ChatGPT Pro/Plus (headless)"`. Без shared env это был бы локальный login и prerequisite не выполнен. Штатное внешнее подтверждение аккаунта владельцем обязательно, если действующей авторизации нет. Harness автоматизирует подготовку и проверку; не обещает самостоятельно пройти согласие пользователя. Копирование auth.json без metadata/login generation не заменяет вход.
- [ ] Два реальных sandbox-потребителя на одном host/filesystem: согласованный refresh, atomic rename, общий inode lock, cancellation и uncertain refresh. Не удалять `refresh-pending.json`; uncertain refresh запрещает модельный dispatch до штатного восстановления после остановки потребителей. Model requests не сериализовать глобальным OAuth lock.
- [ ] Shared installed-candidate/bwrap/refresh сценарии выполнять в `test/shared-oauth-integration.test.ts`: `bun test test/shared-oauth-integration.test.ts` с закреплённым candidate receipt. Обычные cli/profile/judge/preflight тесты проверяют env/receipts/fs через разрешённые fixtures и не требуют установленного shared кандидата.
- [x] Подзадача 7 (2026-10-14): v2 agentCommand выставляет HTTP-only false независимо от parent opt-in; legacy builder сохраняет прежние четыре ключа. Sandbox whitelist сохраняет false; явный non-false отвергает до FS admission. RED→GREEN через public builder, actual fake management child и реальный bwrap/Python env probe; parent password не передаётся. 5 builder/management tests PASS/18 assertions, 10 sandbox tests PASS/44 assertions, typecheck/diff PASS. Supported-switch/candidate admission и transport receipt ещё требуют реализации; live HTTP transport этими probes не квалифицирован.
- [ ] HTTP-only switch `66f0956bc9f16ee580b20f3cf98e368857048f27` обязателен. Провести `LOGINOM_AI_AGENT_EXPERIMENTAL_WEBSOCKETS=false` через оба фильтра (harness и sandbox), включая management; без явного false/поддержанного switch admission запрещён. RED/GREEN проверяет фактический env дочернего процесса и transport receipt. Это product dependency выбранного режима, отдельная от Loginom user auth.
- [ ] Подготовить `judge.codexHome=/home/kiselev/.local/state/loginom-evals/parallel/judge-codex` (0700, canonical private directory), запретить совпадение/пересечение с Desktop `~/.codex`, agent profiles/model store. Владелец однократно выполняет `CODEX_HOME=/home/kiselev/.local/state/loginom-evals/parallel/judge-codex codex login --device-auth`, затем `codex login status` с тем же prefix. Существующий Desktop auth не копировать. Отсутствующий judge auth → отдельное AUTH_REQUIRED; harness не автоматизирует согласие аккаунта.
- [ ] Harness задаёт `CODEX_HOME` только judge children через `judge.env`; сам Desktop и окружение родительского shell не меняются. Исправить `codexInfo` в `preflight.ts`: проверять тот же effective `judgeEnvironment(judge.env)`, что используется в `codex exec`, а не `process.env.CODEX_HOME`. RED/GREEN: Desktop auth есть, judge-home пуст → отказ; правильный отдельный home передаётся version/exec, но не agent/admin child. Host-global lease защищает только cooperating harness runs и не заменяет отделение от Desktop.
- [ ] Сохранить условность judge admission: `--skip-judge` и code-only node-evals не требуют judge auth и не берут его lease. Это проверить отдельно от отсутствующего model OAuth; для live agent shared/model admission остаётся обязательным. Standalone немодельная подготовка не вызывает модель или судью.
- [ ] Проверить тесты выше и `bun typecheck`; коммит `feat(evals): admit shared OAuth candidates in isolated slots`. Настройки и credentials `codex exec` сохраняются отдельно; его rate/refresh limits всё ещё требуют своей приёмки.

#### После слияния shared-oauth в loginom

- [x] Подзадача 7 (2026-10-14): current installed eb85403ce4 прошёл pinned schema/protocol smoke: public initialization создаёт marker перед local auth; valid local credential не заменяет отсутствующий shared store. Два concurrent real bwrap supervisor вызова в разных profiles/workspaces дают ту же generation/principal metadata и confirmed cleanup; permanent lock dev:ino сохраняется, uncertain marker/auth bytes остаются. 4 PASS/29 assertions (20.29s), typecheck/diff PASS; publicStatus=true/bubblewrapStatus=true в private receipt и read-back. Fixtures содержат только synthetic AuthInfo: live bubblewrap/liveOAuth/forcedRefresh=false, реальная OAuth/refresh qualification остаётся открытой. Initial PROFILE_FORMAT_INVALID подтверждён direct3/3 и исправлен подготовкой fixture; FS 0644 задаётся chmod независимо от umask077.
- [x] Подзадача 7: model-oauth/judge-codex/onboarding/onboarding-profile directories подготовлены и metadata-only read-back подтвердил canonical owner1001/mode0700. Model и judge auth.json отсутствуют; owner device/headless consent остаётся внешним входом, никаких credential files не создано.

- [x] Подзадача 7 (2026-10-14): fresh clean candidate eb85403ce4/candidate-artifact-status собран, archive roundtrip/source+installed verifier PASS; штатный uninstall/install заменил только собственный candidate-home. Current private receipt содержит новые pins, read-back и root:root/04755 PASS; previous receipt/artifact/archive сохранены до protocol qualification. eb85403ce4 — отдельная product адаптация canonical private profile root capability probe, 8 Host tests PASS/31 assertions и typecheck PASS. Installed protocol smoke отказал STATUS_INVALID вместо ожидаемого OAuth refusal; publicStatus/bwrap/liveOAuth/forcedRefresh=false, причина ещё не доказана. TDD исследование продолжается.

- [x] Подзадача 7 (2026-10-14): assertAuth shared-mode вызывает только публичный providers status, требует совпадающие shared grant/HTTP=false, verified version/provider/generation/principal hash/refresh boolean и successful exit. Local credential и custom-provider shortcut не используются вместо shared status; невалидный ответ/несогласованный exit отвергается без raw output. RED local auth ошибочно принят → GREEN отказ; готовый protocol receipt возвращается без создания local auth. 105 profile/cli tests PASS/332 assertions (118.70s); финальные 4 shared-admission tests PASS/16 assertions (8.16s), typecheck/diff PASS. Protocol peer — явный fake CLI с real supervisor/FS, не fake admin; installed CLI status и live auth ещё не квалифицированы.

- [x] Подзадача 7 (2026-10-14): конкретный public-contract gap закрыт отдельной product-адаптацией 87c7d497d6: providers status --provider openai --format json использует locked snapshot, возвращает generation/principal hash/refresh requirement без tokens; local auth не заменяет shared, uncertain marker остаётся. RED unknown command → GREEN; 26 command/store/plugin/profile tests PASS/124 assertions (113.13s), Agent typecheck/diff PASS. Upstream delivery и граница коммитов записаны в contract. Installed candidate receipt всё ещё 04ff82be4d; fresh build/install/protocol acceptance нового commit остаются открытыми.

- [x] Подзадача 7 (2026-10-14): codexInfo проверяет auth.json в том же effective judgeEnvironment, что передаётся --version. Изолированный public preflight RED принял empty judge home при наличии parent fixture auth; GREEN отвергает, родительский файл сохранён. Fixture main задаёт judge.env до judgeInfo и использует его для exec: actual fake --version RED получил null, GREEN version/exec получают exact leased home. 58 judge/preflight tests PASS/163 assertions (29.55s), parallel gate 1 PASS/13 assertions (16.34s), skip-judge occupied-home 1 PASS/2 assertions; typecheck/diff PASS. Это fixtures без настоящего Codex OAuth; private-home/live AUTH_REQUIRED admission остаётся открытым.

Эти шаги снимают временную зависимость перед итоговой интеграцией evals. Они 7не
разрешают переписывать текущую историю или изменять стенды в рамках подготовки
документов.

- [ ] Зафиксировать новую базу `loginom`, старый tip evals и таблицу переносов. Убедиться, что upstream содержит эквивалентные store/lock/refresh, hardening, cache isolation, capability и, обязательный HTTP-only transport switch и password-focus fix. Учитывать squash/rework: одного совпадения patch-id или названия ветки недостаточно. Отдельно проверить судьбу каждого дополнительного продуктового исправления.
- [ ] Сохранить старый tip отдельным ref и защитить незавершённые изменения. Предпочтительный путь — новая чистая интеграционная ветка от подтверждённой `loginom` с переносом только собственных evals/docs-коммитов по явному списку. Альтернатива для изолированной ветки — rebase с исключением известных dependency commits. Не применять широкий диапазон вслепую и не рассчитывать только на автоматическое удаление дублей Git. Уже слитую продуктовую функциональность не удалять через revert; опубликованную общую историю не переписывать.
- [ ] Исключить только временные копии, уже поглощённые upstream. Не поглощённое необходимое продуктовое исправление оставить отдельным видимым коммитом/зависимостью с проверкой; не удалять его ради формально чистой истории. Постоянные адаптации `evals/` и их тесты сохраняются.
- [ ] Сравнить старую и новую серии через `git range-diff`, проверить итоговый diff относительно новой `loginom`. Ожидаются собственные `evals/` и согласованные документы; изменения продуктовых файлов допустимы только как явно перечисленные необходимые остаточные исправления. Для конфликтов сохранить разбор того, как удержано поведение; отсутствие текстового конфликта не заменяет проверки.
- [ ] Собрать/получить установленный binary новой продуктовой базы и проверить manifest/capability. Повторить `bun test test/cli.test.ts test/sandbox.test.ts test/profile.test.ts test/judge.test.ts test/preflight.test.ts` и `bun typecheck` из `evals/`, интеграционные проверки shared store/refresh/изоляции и приёмку 2 → 1 из задачи 10 для нового кандидата. Обновить source/binary/manifest pins и checkpoint; исторические результаты, auth store и profiles не сбрасывать. Итоговый PR содержит собственные evals-доработки без повторно переносимого OAuth.

### Задача 8. Общая очередь и независимый lifecycle слотов

- [x] После actual exit130/interrupted=true topology cause установил Unix socket Chromium: архив сохраняет socket object через rename/dev/inode/type/mode и fsync каталога, не открывает его как файл. Real stopped-child socket RED ARCHIVE_TOPOLOGY→GREEN; полный archive12/78 PASS17.29s, typecheck/diff PASS. File/socket hardlinks и остальные special files запрещены; native полный finalizer ещё проверяется.
- [x] Native continuation после admin reconnect: setup→confirmed dispose первого admin→новый admin→check в том же профиле→sealed registry/archive→two targeted closes/absence. RED MANAGEMENT_SESSION_UNKNOWN122.61s сравнивал proxy ID между historical snapshot contexts; collector теперь сопоставляет доказанный native tuple и отказывает duplicate tuple в каждом snapshot. Native1/39 PASS129.82s, private999b11fc... audit124/14/read-back SHA6c215383.../terminal84eb06ca..., exact own pair/root absent. Related management5/73 PASS30.98s, typecheck/diff PASS. LiveQualified/storage/release/admission false; actual interruption квалифицирована отдельным continuous-admin control.
- [x] Native interrupted-finalizer control требует фактический interrupted=true: exact supervised CLI birth/executable приостановлен до native row, SIGINT pending подтверждён до guarded SIGCONT. После socket fix native setup→exit130/interrupted=true→sealed registry→durable archive→two targeted closes→fresh absence→confirmed admin closure PASS1/35 (116.68s). Private8196b708... audit124/12/read-back, terminal SHA96810139..., audit SHA102495e2...; own pair/root absent. Model/judge calls0, storage/release/admission grants false; прежний47d... root/pair удалены после qualified audit178/free custom guards/committed archive, postcheck SHAe9b5d749...; normal slot release не выдавался.
- [x] ARCHIVE_TOPOLOGY сохраняет в cause same-lstat path/kind/POSIX type/mode/nlink/UID/GID/dev/inode; native fixture пишет только эти metadata в private failure receipt. Actual external hardlink RED missing cause→GREEN, обе names/bytes сохранены/no journal. Archive11/69 PASS18.02s, typecheck/diff PASS. Refusal/exit2/move/release policy unchanged; новый фактический interrupted failure остаётся отдельной квалификацией.
- [x] Fixture home release требует sealed judge inventory; release receipt связывает captured SHA и все process proofs. Actual RED sealed=false after release→GREEN sealed=true/source match; unknown cleanup сохраняет fence. Target2/15 PASS30.18s, full current main/recovery/offline-admission31/233 PASS351.90s, typecheck/diff PASS. Исторические captures не переписываются; resource aggregation/live private home open.
- [x] Judge inventory seal: held guard, полная shared-qualifier проверка и stable source SHA; concurrent launch/seal и late launch refused. Actual short child observed planned; unknown-state RED dispatched→GREEN no marker. Старые offline snapshots unsealed без переписывания sources. Judge/process/offline-environment57/267 PASS111.48s, typecheck/diff PASS; fixture finalizer отмечен отдельно.
- [x] Fixture version и judge exec используют один protected pre-spawn process inventory под фактическим home lease. Finalizer читает все canonical qualified entries, включая version, вместо glob только attempt outputs; failed sources удерживают fence. Actual main RED missing inventory→GREEN two births/version stdout/canonical exec SHA/full release sources; inventory/occupied/unknown3/17 PASS29.90s, typecheck/diff PASS. Sealed resource composition и остальные actors open.
- [x] Fixture judge admission берёт home lease до --version; BUSY не запускает даже version process. Ошибка judge admission закрывает уже полученные OS guards без ложного release. Actual held-home RED version write before BUSY→GREEN; occupied/skip-judge/unused-model3/9 PASS15.20s, typecheck/diff PASS. Process registry version/exec отмечен отдельно; production admission gated.

- [x] Подзадача 7/8: judgeInfo/judgeVersion и preflight получают общий AbortSignal; calibrate, rejudge и обычный run передают его в оба version probes. Rejudge устанавливает SIGINT handler до preflight и снимает в finally. RED active judgeInfo возвращал metadata после abort, pre-aborted preflight запускал probe, judge-only выходил130, run продолжал HTTP admission после Ctrl+C. GREEN actual Bun/fake-codex public main tracers для calibrate/judge-only/run: отказ2 до новых measured config/calibration, final own processes00, прежний summary/backup неизменён. Judge/preflight/run/rejudge/calibrate/admission117 PASS/661 assertions (147.18s), typecheck/diff PASS. Native OAuth, остальные Loginom admission/probe owners и explicit recovery остаются отдельными gates; неизвестный offline outcome сохраняет reservation.

- [x] Подзадача 7/8: calibrate устанавливает/снимает собственный SIGINT handler в finally, передаёт signal активному judge, после отмены не начинает новые positive/negative/near-miss вызовы; сохраняет interrupted JSON/report и exit1. Actual subprocess RED завершался130 без отчёта → GREEN1 PASS/11 assertions (3.39s), process-cleanup confirmed/capture_complete/final00. V2 offline tracer с настоящим temporary home flock: SIGINT→confirmed cleanup→released journal/reservation→новый run с новым token/revision1 PASS/13 assertions (6.14s); неизвестный cleanup сохраняет прежний карантин. Handler снимается после success и actual preparation EEXIST. Calibrate/rejudge/judge-environment39 PASS/306 assertions (90.19s), typecheck/diff PASS. OAuth и прерывание version/admission probes остаются отдельными gates; Loginom/model вызовов здесь нет.

**Files:** Create `evals/src/scheduler.ts`, `evals/test/scheduler.test.ts`; Modify `evals/src/run.ts`, `evals/src/judge.ts`, `evals/test/run.test.ts`, `evals/test/judge.test.ts`, `evals/src/lease.ts`, `evals/test/lease.test.ts`, `evals/fixtures/fake-cli.ts`, `evals/fixtures/fake-codex.ts`.

**Interfaces:** Produces `Job`, `buildJobs`, `runSlotQueue`; consumes ready environments, proven cleanup receipts и существующий `runAttempt`/`afterAttempt`. Retry остаётся внутри одного `execute(slotId, job)`.

В `judge.ts` добавить `createJudgeGate(): (input: Parameters<typeof judgeTask>[0]) => Promise<Judged>`. Один gate создаётся на run и охватывает весь `judgeTask`, включая его внутренний retry. Он не сериализует агентов, не создаёт отдельный pool/очередь судей и не освобождает ожидающий слот.

- [x] RED: точный порядок очереди и отсутствие барьера:

```ts
expect(buildJobs(["slow", "fast"], 2)).toEqual([
  { index: 0, taskId: "slow", attempt: 1 },
  { index: 1, taskId: "fast", attempt: 1 },
  { index: 2, taskId: "slow", attempt: 2 },
  { index: 3, taskId: "fast", attempt: 2 },
])
```

- [ ] Запустить `bun test test/scheduler.test.ts` (RED); GREEN: очередь резервирует индекс синхронно до await; результат кладётся по `job.index`, не в `attempts[attempts.length - 1]`. Ожидать завершение всех pipeline при любом rejection; один итоговый writer summary.
- [x] Подзадача 8: public buildJobs/runSlotQueue (независима от bootstrap) — round-major, synchronous reservation, stable results by index, no round barrier, slot quarantine/all-quarantined/unassigned, abort before/during dispatch, drain всех active pipelines перед AggregateError. 7 public-interface RED/GREEN tests; вместе с admin/preflight/CI 48 PASS/111 assertions и typecheck PASS. Callback описывает весь pipeline; реальный runAttempt/retry/summary writer и judge gate ещё не подключены.
- [x] Дополнить fake-cli сценариями `parallel-slow`, `parallel-fast`, `parallel-infra-retry`, `parallel-cleanup-failure`. Задержки и контрольные выходы задаются по существующему `EVAL_TASK_ID`, переустановленному после фильтра; не полагаться на отфильтрованные env. Fake judge использует существующий `EVAL_JUDGE_COMMAND`.
- [ ] Через публичный `main` доказать временными метками: fast attempt 2 начинает работу до завершения slow attempt 1; retry исходной logical attempt остаётся на том же slot_id и архивирует `infra_retry.initial`; history/workspaces не пересекаются. Пользователь, профиль и context не создаются заново между попытками.
- [x] Реализовать отдельный fixture admission для `main(argv, env, { fixture: { slots, lockRoot } })`: третий аргумент — только программный test seam, production entrypoints его не принимают из argv/env/config. Допустим лишь `EVAL_CLI_MODE=fake` + `EVAL_ARTIFACT_SOURCE=dir:<temp-root>`; slots имеют отдельные реальные temp profile/work/history/storage roots, синтетическую server identity и те же lease/scheduler/report/archive функции. Под slot artifact source выбирается `<temp-root>/<slot_id>`, scopes не пересекаются. Ни Docker, ни admin, ни bwrap не вызываются; fixture receipt явно `liveQualified=false`. Binary/source mode с этим аргументом, fixture-marker из обычного CLI и общий writable root двух слотов отвергаются. Dry-run валидирует/строит jobs без claims о readiness. Так очередь тестируется без fake-admin и без shared OAuth кандидата.
- [x] Подзадача 8/9 (2026-10-14): per-run controller journal/lease/cleanup/archive receipts не перезаписывают чужой active command. RED доказал потерю commandId/epoch при BUSY второго main; GREEN сохраняет exact admitted journal, первый pipeline завершается. Summary содержит lease_receipt/cleanup_receipt каждого slot, тесты читают адресную evidence. 46 main/slots/archive tests PASS/226 assertions (87.20s), typecheck/diff PASS; production v2 всё ещё закрыт до real admission.
- [x] Подзадача 8/9: два consecutive actual Bun controller runs получили SIGINT с двумя активными fake CLI, оба слота drain/archive/release confirmed, по 2 interrupted attempts без новых assignments. Первый run с recovery только A дал interrupted_cleanup.recovered=true (B=false), второй без recovery — false; non-interrupted infra retry остаётся null. Исправлена ошибочная exit 1 классификация clean interruption. 2 targeted tests/22 assertions PASS (18.01s), legacy main 25 PASS/214 assertions (21.82s), typecheck/diff PASS. Browser/admin и SIGINT во время judge/cleanup требуют отдельных проверок.
- [x] Подзадача 8: main controller снимает свой SIGINT handler в finally при success/error admission; retired controller больше не удерживает обработчик. 2 public lifetime tests/4 assertions PASS; 2 actual legacy CLI SIGINT tests/13 assertions PASS (6.89s), typecheck/diff PASS. Parallel interruption/judge/cleanup receipts ещё не квалифицированы этими проверками.
- [x] Подзадача 8: fixture storage удаляет только явно скопированные own attempt files после committed profile archive, подтверждая private root inode/owner и content hash; legacy dir-source не меняется. Real fs.watch подтвердил archive commit до unlink, foreign.lgp сохранён (5 assertions PASS). Изменённый source после artifact copy сохраняется, measured judged outcome остаётся в summary, reservation retained; durable pending cleanup запрещает deletion/next admission до dispatch (6 assertions PASS). 24 main/archive tests PASS/166 assertions (82.47s), typecheck/diff PASS. Это synthetic FS scope, не Loginom session/backup qualification.
- [x] Подзадача 8: one judge gate подключён к fixture main/runAttempt; actual generated package/save receipt передаются реальным fake-codex. RED interleaved start/start/end/end → GREEN start/end/start/end, overlap агентов, per-slot package paths, private judge CODEX_HOME. 1 PASS/12 assertions (15.04s); 64 main/judge/report tests PASS/258 assertions (75.18s), typecheck/diff PASS. Host-global judge lease/live OAuth и artifact storage cleanup не квалифицированы.
- [x] Подзадача 8: clean stop отличается от quarantine в public runSlotQueue; main после CLI exit 2 и confirmed cleanup закрывает/выпускает A, B завершает очередь. Fixture summary хранит closed/quarantined/planned без claims о live. RED→GREEN, 18 queue/fixture tests PASS/98 assertions (40.40s), typecheck PASS. Interrupt/judge integration и host-global judge admission ещё впереди.
- [x] Подзадача 8: fixture main quarantine — real changed-writer failure A сохраняет measured completed + failed cleanup и retained reservation; B drain оставшихся 3 jobs и independent release. RED (общая остановка ошибочно оставляла B лишь одну попытку) → GREEN 1 PASS/9 assertions и typecheck PASS. All-quarantined сохраняет 2 measured attempts без dispatch третьей; common infra archive writer EEXIST останавливает assignments, drain B, не стирает measured infra outcome, сохраняет A fence и освобождает B. 9 fixture tests PASS/69 assertions (35.36s), typecheck/diff PASS. Clean stop/interrupt/judge ещё выполняются.
- [x] Подзадача 8: public main infra retry остаётся внутри pipeline и того же slot_id/profile/workdir; durable archive обоих исполнений и infra_retry.initial сохраняются отдельно. RED→GREEN 1 PASS/8 assertions, collector 3/3 повторов PASS; legacy infra-retry 11 PASS/79 assertions (50.66s), typecheck PASS. Повторный общий fixture suite ранее отказал в profile ownership на transient PID30254/30585: оба исчезли до инспекции, точная принадлежность не установлена; guard не изменён/не ослаблен, чужие процессы не тронуты. Полный regression остаётся шагом 10.
- [x] Подзадача 8: programmatic fixture main запускает два real fake CLI pipeline через общую очередь, actual slot leases и durable profile archive; 4 diagnostic attempts, временные метки подтверждают fast round 2 до окончания slow round 1, отдельные roots/auth preservation. 5 fixture tests: real pipelines, dry-run round-major plan без processes/leases/profile mutation, overlap до writes, binary/source/обычный CLI rejection. Вместе с legacy main/scheduler 37 PASS/272 assertions (31.44s), typecheck/diff PASS. Live qualification отсутствует; retry, quarantine и judge integration ещё проверяются.
- [ ] Тесты `main` используют настоящий `fake-cli.ts`/`fake-codex.ts`, разрешённый локальный fixture endpoint и temp lock root; production `main(argv, env)` всегда использует константу lock root и реальный v2 admission. Проверить в unit CI без Docker и `/var/lib`; полноценные prepare/recover/run chains остаются в `parallel-lifecycle-integration.test.ts` и не выдаются за fixture PASS.
- [x] Подзадача 6/8 (2026-10-14): judgeTask запускает codex через существующий continuous process supervisor; legacy judge-events/stderr paths сохранены, per-invocation private process evidence записана. RED оставлял actual fake-codex child живым после verdict; GREEN drain подтверждён по PID в process proof (4 assertions). Unknown process proof запрещает verdict/retry и сохраняется после второго invocation; runAttempt сохраняет measured completed, отмечает failed cleanup и stop. 78 judge/legacy-main/parallel-main tests PASS/452 assertions (131.10s), typecheck/diff PASS. Host judge lease и gate poisoning/global stop при unknown остаются следующими шагами; реальный codex/helper/CDP lifecycle ещё не квалифицирован.
- [x] Подзадача 8 (2026-10-14): unknown judge cleanup poisons per-run gate; waiting/future invokes возвращают attempts=0 без новых children. RunAttempt пишет judge_cleanup_unconfirmed, общий queue controller прекращает assignments и drain активных pipelines. RED запускал лишний parallel-z-next после uncertainty A; GREEN сохраняет measured A, здоровый no-artifact B завершается/release, A fence retained. 80 judge/run/parallel-main tests PASS/461 assertions (139.90s), typecheck/diff PASS.
- [x] Подзадача 8 (2026-10-14): acquireJudgeLease использует canonical private CODEX_HOME и default globalLockRoot; ключ не зависит от Server ID. Actual Bun child с alias и другим server journal получает BUSY; SIGKILL holder оставляет RECOVERY_REQUIRED. Fixture main берёт lease до profile/agent admission, после drain проверяет все private judge process proofs и durably выпускает lease. Другая server identity с тем же home отвергается до agent dispatch; после release новый run допускается. skip-judge не берёт занятый judge home; failed model admission освобождает unused judge reservation; unknown cleanup сохраняет retained home fence. 79 lease/judge/parallel-main tests PASS/309 assertions (134.34s), typecheck/diff PASS. Production main пока fail-closed; реальный codex/home auth и live global-root admission ещё не квалифицированы.
- [ ] RED/GREEN host-global lease canonical judge CODEX_HOME в `/var/lib/loginom-evals/locks`: два controller/run с разными server IDs и одной judge-home конфликтуют до dispatch. Брать вместе с общим admission; отпускать только после подтверждённого завершения собственных judge-процессов. Пропавший PID не разрешает stale takeover. Проверить двумя настоящими Bun-процессами в `test/lease.test.ts`; model OAuth flock остаётся независимым.
- [x] RED/GREEN judge mutex на двух фактических `fake-codex.ts` child processes: интервал вызова судьи B начинается после завершения A, а интервалы агентов могут перекрываться. Abort B в ожидании не запускает `codex exec` и даёт **новый исход gate** в существующем типе `Judged`: `{ok:false,error:"interrupted before judge",attempts:0}`; измеренный исход агента сохраняется. Ошибка/timeout/abort A освобождают mutex в finally, B может продолжить; shared OAuth/Loginom/admin env в judge не появляются. Проверка: `bun test test/judge.test.ts -t "gate"`.
- [x] Сверка judge mutex (2026-10-15): existing actual fake-codex gate10 PASS/43 assertions (18.02s), включая overlap refusal, cancelled waiter attempts0, retry, prepare exception, error/timeout/abort and filtered judge home/env. Исходный gate реализован ранее; новый RED не заявляется. Флаг основного пункта синхронизирован; host-global/native auth и active-slot recovery не квалифицируются. Private native-two-users-6ebb9781.../verification.json хранит exact log600.
- [x] Подзадача 8: createJudgeGate сериализует весь judgeTask/retry, cancelled waiter возвращает attempts=0 сразу, сохраняя predecessor для следующего судьи; finally освобождает после completion/rejection. 8 real fake-codex gate tests/36 assertions: интервалы, cancelled B→C, retry, prepare exception, exit/timeout/abort, judge CODEX_HOME и filtered auth/admin env. 82 judge/scheduler/CLI/transition tests/490 assertions и typecheck PASS (213.12s). Gate ещё не подключён к v2 main; overlap агентов/summary и host-global judge lease не доказаны этим тестом.
- [ ] Интеграционные GREEN-цепочки через публичные команды: `prepare → prepare → verify → run`; `crash harness → RECOVERY_REQUIRED обычного run → recover каждого retained слота → новый run`. Новый run получает новый token и повторяет admission, не продолжает старые измерения; crash между durable release и unlock не оставляет вечный BUSY. При живом run внешний recover даёт BUSY без изменения ownership. В unit-сценариях агента/судью заменяют только разрешённые fixtures; server lifecycle проверяется в реальном non-model adapter окружении.
- [ ] RED/GREEN матрица: карантин A оставляет B очередь; карантин всех → exit 1 + summary, невыданные пары не measured; stop=true без cleanup failure останавливает A и позволяет clean lease release; общий writer failure блокирует новые assignments и дожидается активных; Ctrl+C во время agent/judge/cleanup не стирает уже измеренный результат и запрещает retry.
- [ ] Проверить `bun test test/scheduler.test.ts test/run.test.ts test/transition.test.ts test/judge.test.ts test/lease.test.ts`, `bun typecheck`; коммит `feat(evals): dispatch a shared queue across reusable user slots`.

### Задача 9. Summary, отчёт и node-evals без потери старых runs

**Files:** Modify `evals/src/report.ts`, `evals/src/compare.ts`, `evals/src/rejudge.ts`, `evals/src/node-runner.ts`, `evals/src/node-evals.ts`, `evals/script/run-node-evals.ts`, `evals/test/report.test.ts`, `evals/test/compare.test.ts`, `evals/test/rejudge.test.ts`, `evals/test/node-runner.test.ts`, `evals/test/node-evals.test.ts`, `evals/test/node-evidence.test.ts`.

**Interfaces:** `AttemptResult.slot_id?`, `RunSummary.config.parallel?`, `RunSummary.slots?` допускают чтение исторических summary; отсутствие config.parallel → 1. Все новые writers обязаны записывать config.parallel, slots и slot_id, включая N=1; legacy singleton получает slot_id `default`. У каждой новой записи slots безопасные identity, profile/history references, status и cleanup receipt. Никаких административных секретов или browser state.

- [x] Подзадача 9 (2026-10-14): existing infra-retry test ожидал прежний report layout без slot column. STABLE RED 3/3 на одной строке при PASS семи предыдущих semantic checks; ожидание обновлено на task/attempt/default/infra_error, assertions denominator/attempt count/launches/duration не ослаблены. 11 infra-retry tests PASS/79 assertions (53.66s), typecheck/diff PASS. Два context-dependent lifecycle failures полного unit прогона остаются в расследовании.
- [x] Подзадача 7/9: rejudge/calibrate передают explicit judge.env в исполнение, как preflight/--version; private CODEX_HOME не теряется. Два public real fake-codex tracers RED (version home совпадает, execution undefined)→GREEN:17 rejudge/calibrate PASS/177 assertions (20.30s), typecheck/diff PASS. Авторизация судьи не заимствована; live login и global judge lease для этих entrypoints остаются gates.
- [x] Подзадача 8/9: rejudge снимает собственный SIGINT handler в finally после завершения и exception; repeated offline invocation не оставляет старые AbortControllers. Public RED сохранял handler после success; GREEN1 PASS/4 assertions включает actual EISDIR result persistence failure. Полный rejudge13 PASS/77 assertions (16.51s), typecheck/diff PASS; actual interrupted judge/cleanup остаются отдельными gates.
- [x] Подзадача 9: saved config редактирует все explicit judge.env values в <set>/<unset>, сохраняет keys, исходный config для runtime не изменяется. Public calibrate RED раскрыл synthetic OPENAI_API_KEY в config.json; GREEN47 calibrate/rejudge/run PASS/429 assertions (55.72s), typecheck/diff PASS. Environment delivery/home qualification сохранены; будущие live slot/admin secret gates остаются отдельными проверками.
- [x] Подзадача 7/9: offline rejudge/calibrate используют существующий per-command judge gate. После actual process-proof persistence failure новый native judge не запускается; judgedFields сохраняет judge_cleanup_unconfirmed, измеренный completed исход агента не меняется. Rejudge RED продолжал second judge и терял flag→GREEN1/5; calibrate RED запускал4 judges после uncertain first→GREEN85 judge/run/rejudge/calibrate PASS/557 assertions (87.86s), typecheck/diff PASS. First confirmed outcome не заменяет cleanup proof; межпроцессный CODEX_HOME lease/admission ещё не квалифицирован.
- [x] Подзадача 7/9: public loadJudgeEnvironment читает private v2 slots metadata, возвращает только canonical codexHome/stateDir; отсутствие Loginom admin credentials не блокирует offline judge. Общие private file/schema/canonicalization helpers переиспользуются full loadSlots; canonical alias overlap/private directory guards сохранены. RED отсутствовал export→GREEN21 slots/loader PASS/41 assertions (0.52s), typecheck/diff PASS. Production offline entrypoint/lease пока не подключены. Тесты требуют umask022 для intentional public0644 fixture; log остаётся600.
- [x] Подзадача 7/9: judge gate сохраняет fence при exception после допуска invoke (actual EISDIR при записи stdout завершившегося fake-codex), без новой попытки. Подготовка остаётся до допуска: её исключение сохраняет EvalFailure/task-id и освобождает очередь. Initial broad catch был code regression: collector подтвердил два existing failures3/3; source исправлен, assertions не ослаблены, bisect не нужен для uncommitted cause. Target2 PASS/6, broad judge/rejudge/calibrate/run86 PASS/560 assertions (86.37s), typecheck/diff PASS; private signal report /tmp/evals-judge-gate-signal-rd8glicw.json600. Это local gate, не global lease/actual OAuth qualification.
- [x] Подзадача 6/7/9: judgeInfo/preflight используют общий judgeVersion через superviseProcess, execution timeout10s со штатным cleanup, точные origins и confirmed/capture-complete cleanup перед metadata. Physical fake-codex version child RED продолжал жить при уже возвращённой версии; GREEN target4 PASS/9 assertions, exact birth проверен, RED child self-expired без PID-only signals. Missing binary regression (raw ENOENT вместо EvalFailure) collector3/3 подтвердил; normalizer восстановлен, тест не ослаблен. Broad judge/preflight/rejudge/calibrate/run110 PASS/610 assertions (120.21s), typecheck/diff PASS; live native Codex/auth/global lease остаются следующими gates.
- [x] Подзадача 7/9: production main для v2 offline modes вызывает runOfflineJudge: private metadata→native auth prerequisite→private command journal→host-global canonical CODEX_HOME lease→version/exec→confirmed release proof либо retained reservation. Default lock root фиксирован; unit parameter temp root не поступает через CLI/env/config. Core rejudge/calibrate возвращают judgeCleanupConfirmed, calibration rows сохраняют uncertainty flag; quality failure не определяет release. RED absent wrapper, retained after successful calibration и ignored missing slots file→GREEN106 environment/rejudge/calibrate/lease/config PASS/482 assertions (70.64s), typecheck/diff PASS. Actual fake-codex+flock/fs: BUSY до probe/results, повтор с new token/revision, explicit home override, uncertainty→quarantine→RECOVERY_REQUIRED без нового child, historical metadata preserved. Missing native auth RED запускал version/создавал reservation→GREEN отказ до обоих, без secret creation. Native Codex OAuth/exception recovery ещё не квалифицированы; default-root proof ниже выполнен в private namespace с fake-codex; это не Loginom/model readiness.
- [x] Подзадача 7/9: v2 native judge auth admission проверяет только lstat metadata до lease/probe: regular current-UID file0600/nlink1. Auth bytes не читаются; symlink/hardlink/public file отвергаются, borrowed canary сохраняется. RED existence-only допустил symlink и исполнил fake command→GREEN12 environment tests/50 assertions (8.43s), typecheck/diff PASS. Missing file сохраняет прежнюю diagnostics, no probe/no reservation; все негативные auth fixtures inert, native OAuth login не подменяется.
- [x] Подзадача 7/9: exception до подтверждённого release сохраняет offline journal quarantined/command-failed и retained reservation. Actual proof rename EISDIR после завершившегося fake-codex RED оставлял intent→GREEN13 module PASS/56 assertions (10.91s), typecheck/diff PASS. Completed calibration output сохранён, повтор RECOVERY_REQUIRED до нового child. После успешного release catch не публикует ложный quarantine; release proofs/exception recovery остаются отдельными gates.

- [x] Подзадача 7/9: offline run locator пишется/fsync до evaluation judge через awaited calibrate/rejudge allocation observer; quarantine после result/release-proof persistence exception сохраняет runDir, reservation retained, повтор RECOVERY_REQUIRED без нового child. TDD RED lost completed runDir/null incomplete run→GREEN; actual calibration EISDIR/running journal и historical rejudge result failure проверены. Broad calibrate/rejudge/offline39 PASS/1FAIL (99.04s): мой новый rejudge-control был ошибочно вставлен в calibration test, ReferenceError dry stable3/3 у collector; перенесён без ослабления assertions. Corrected offline15 PASS/81 (23.08s), typecheck/diff PASS; остальные25 broad tests прошли на том же runtime. Preflight/version inventory, crash ownership и explicit recovery остаются открытыми.

- [x] Подзадача 7/9: offline command-bound process inventory создаётся private/fsynced до admission; trusted runtime context проводит оба version probes и evaluation judge через assertHeld→planned unique owner→supervisor→confirmed/unconfirmed proof. Отдельные private fsynced snapshots привязаны к commandId/owner/lifetime и semantic SHA256(JSON.stringify(parsed proof)); повторный rejudge не меняет старую source reference. Existing capture paths/uncertain-persistence fixtures сохранены, missing/mismatched proof не получает confirmed. Runtime context не сериализуется в saved config. TDD RED missing inventory/context leak/rejudge rewrote old proof→GREEN. Broad judge/preflight/calibrate/rejudge/offline103 PASS/515 (158.94s) до snapshot fix; final offline15 PASS/116 (26.48s) с actual planned/unknown/private mode/old hash controls, typecheck/diff PASS. Active-crash live ledger, readonly qualification/explicit recovery и native auth ещё открыты; inventory alone не освобождает reservation.

- [x] Подзадача 7/9: readJudgeProcessInventory readonly проверяет private canonical root/source, exact command/producer/owner, unique entries и child snapshot path/semantic SHA; continuous capture/observations, complete launcher/process identity и две ordered final00 после actual exit. TDD RED missing export/exit after final00/reordered passes/zero observations→GREEN. Actual supervisor/flock/fs controls: foreign command/producer, changed proof hash, duplicate/planned/foreign pointer; реальная offline calibration квалифицирует оба version probes и evaluation judge. Qualification/offline16 PASS/128 (26.05s), typecheck/diff PASS; мои tmp roots очищены после confirmed cleanup. Текущая liveness/active-crash completeness, recovery-only orchestration/CLI и native auth ещё открыты; readonly не выдаёт release/signal/delete grants.

- [x] Подзадача 7/9: recoverOfflineJudge core для closed-proof offline incident: actual dead controller→captured CAS→recovery-only→original owner/command/lineage qualification→same-boot current PID/birth readback→confirmed release proof. Не выполняет signal/delete/model/probe. TDD RED absent module/stale terminal replay/null released tuple→GREEN. Actual fake-codex/Bun/fs/flock: foreign CAS refused; planned entry сохраняет recovery-only и RECOVERY_REQUIRED; после исправления source новый owner продолжает original incident через explicit lineage, releases/new run. Calibration bytes/calls сохранены; terminal replay до/после нового run не меняет current reservation; malformed terminal tuple rejected. Recovery/qualification/offline/lease39 PASS/202 (32.00s), typecheck/diff PASS. CLI, active-child reconciliation, crash release→terminal-marker gap и реальная auth ещё открыты.

- [x] Подзадача 7/9: readResourceReservation читает выбранный key в private canonical lock root через существующий reservation/lineage validator, без acquire/CAS и без изменения bytes. Root guard вынесен в общий requireLockRoot с прежними проверками. TDD RED missing export→GREEN; empty/actual retained readback/unchanged bytes/public root refusal. Lease23 PASS/60 (1.59s), typecheck/diff PASS. Readback не выдаёт release authority; используется для согласования release→marker gap.

- [x] Подзадача 7/9: release→terminal-marker persisted-state reconciliation: восстановление quarantine/intent journals после actual release воспроизводило LEASE_CAS_STALE. Validated released reservation/lineage + exact releaseEvidence SHA согласуют старые journals без нового CAS и без изменения reservation. Fresh acquireJudgeLease выполняет private finalization predicate под тем же OS guard до overwrite/admission; incomplete marker → RECOVERY_FINALIZATION_REQUIRED до любых probes, changed proof reason/hash не обходит gate. TDD RED stale replay/new run overwrote tombstone/changed reason admitted→GREEN. Recovery/qualification/offline/lease40 PASS/212 (31.45s), typecheck/diff PASS; calibration/calls/reservation bytes preserved. CLI и active-child reconciliation ещё открыты; fixture — воспроизведение persisted crash boundary, не новый SIGKILL timing claim.
- [x] Подзадача 7/9: offline recovery CLI `parallel-env.ts recover --config --incident --out` получает актуальную reservation по исходному command journal, проверяет lineage и передаёт captured CAS в recovery core; terminal replay после нового run не меняет current ownership. Token/revision не передаются через argv; fixed globalLockRoot не переопределяется env/CLI. Output — новый private каталог и fsynced receipt, защищённые roots отвергаются. TDD RED missing resolver/script → GREEN; actual Bun/bwrap/flock recovery-only retry → released, old calibration/calls preserved. CLI/recovery/qualification/offline/lease41 PASS/216 assertions (32.78s), typecheck/diff PASS. Fixture Bun startup panic воспроизводился 3/3; минимальные namespace probes установили необходимость отдельного `/dev`, добавлен `--dev /dev` без ослабления assertions. CLI пока принимает только проверенный offline command incident; slot/admin recovery, prepare/verify/status и active-child reconciliation остаются открытыми.
- [x] Подзадача 1/7: v2 directory graph защищает постоянный globalLockRoot вместе с controller/auth/profile/history/workspace roots. Profile=guards root, ancestor или descendant отклонён до filesystem mutations/mounts; тот же validator применяется к lexical/canonical graphs. Public parseSlots RED принимал guards как writable profile→GREEN94 slots/config/sandbox/environment PASS/308 assertions (19.21s), typecheck/diff PASS. CI только сравнивает path metadata, fixed /var/lib не создаёт/меняет; runtime lease layout не перемещён.
- [x] Проверить old summary без новых полей без миграции, прежний compare/rejudge quality denominator и сохранение slot/time/retry metadata. Три новых public checks: legacy main→summary без slots/parallel/slot_id→judge-only (total3/evaluated3/mean33.3); actual two-slot main с infra retry→judge-only (total2/evaluated2, initial evidence и duration сохранены); compare analysis legacy vs slots+retry идентичен legacy vs legacy (total6/evaluated6, время initial учитывается отдельно). Existing implementation уже сохраняет этот контракт; production RED не заявлен. Target2 PASS/24 assertions и broad report/compare/analysis/rejudge86 PASS/337 assertions (24.38s), typecheck/diff PASS; два distinct slot IDs и summary.prev проверены.
- [x] Подзадача 9 (2026-10-14): runNodeEvals программно передаёт fixture options в общий main/loadConfig; N=2 code-only/no-artifact — FAIL без judge, generic summary не переписывается. Actual fake CLI с одинаковыми session/operation/file names в двух profile roots пишет разные observed values; collectors выбирают working profile/history по attempt.slot_id, configured archive сверяется с committed private manifest/profile. Public wrapper RED→GREEN 2 tests/14 assertions; native wrong-profile rejection подтверждён actual archiveProfileEvidence. 59 node runner/native/text-import/code-verdict/parallel-main tests PASS/384 assertions (129.69s), CLI help/unknown flag subprocess 5 assertions PASS, typecheck/diff PASS; helper extracted только для общей fixture setup. Unknown slot tamper/legacy new writers/report остаются следующими шагами.
- [ ] RED: node evidence для одинаковых session/file names в разных архивных roots выбирает профиль по `attempt.slot_id`, а старый run использует прежний `config.profileDir`:

```ts
expect(aEvidence.profile).toBe(aHistoryProfile)
expect(bEvidence.profile).toBe(bHistoryProfile)
expect(aEvidence.nativeValue).toBe("A")
expect(bEvidence.nativeValue).toBe("B")
expect(legacyEvidence.profile).toBe(legacyProfile)
```

Тест создаёт два настоящих минимальных архивных каталога с различимой evidence и вызывает существующие публичные collectors через `runNodeEvals`; не заменяет collectors моками. Generic summary остаётся неизменённым после code-only validation.

- [x] Подзадача 9: public validateNodeRun отклоняет unknown slot_id даже при measured failed outcome; duplicate match и missing table при parallel>1 тоже ERROR/2. RED принимал failed как FAIL/1 и выбирал первый duplicate. GREEN requireNodeEvidenceSlot — единый sync selector для wrapper до collection и standalone validator; legacy summary без slots/parallel остаётся на прежнем пути. 28 node-evals/evidence/runner PASS/90 assertions (18.77s), typecheck/diff PASS; fixture wrapper сохраняет per-slot archive binding и completed runDir при postprocessing error.

- [x] Запустить RED `bun test test/report.test.ts test/compare.test.ts test/rejudge.test.ts test/node-evals.test.ts test/node-evidence.test.ts`; GREEN: дополнить readers и выбирать профиль/архив через таблицу slot_id, отказать при неизвестном id, не подставлять первый профиль.
- [x] Обновить help `script/run-node-evals.ts` для `--parallel` и slots. Строгий parser общий: `src/node-runner.ts` вызывает `loadConfig`, расширенный задачей 1; отдельный parser wrapper не создавать. В `node-runner.test.ts` проверить subprocess `--help`, допустимый parse `--parallel 2` и отказ неизвестного флага. `--dry-run` node runner по-прежнему отвергает; не использовать его для положительного wrapper smoke. Добавить программный `runNodeEvals(argv, env, options?)`, передающий fixture options задачи 8 в `main`; из CLI options не поступают. Fake v2 GREEN — через этот публичный интерфейс, полный subprocess с `--parallel 2` — через живую команду раздела 5 в приёмке. Проверить `bun test test/node-runner.test.ts test/node-evals.test.ts`.
- [x] Подзадача 9 (2026-10-14): новые main singleton summaries всегда содержат config.parallel=1 и slots.default с username/profile/history/workspace references, cleanup receipt и planned/closed/quarantined state. Legacy v1 metadata не выдаётся за v2 live qualification. RED→GREEN через public dry-run main; 33 legacy-main/node-runner tests PASS/259 assertions (37.36s), typecheck/diff PASS. Judge-only rewriter исторических metadata и per-slot leftovers ещё требуют проверки.
- [x] Подзадача 9: new singleton runAttempt пишет slot_id="default" по принятому контракту (вместо ошибочно добавленного "legacy"); старые summaries/типовые readers остаются совместимыми. RED→GREEN через public main --dry-run --repeat 2; 60 run/report/compare tests PASS/319 assertions (21.39s), typecheck/diff PASS. Per-slot node evidence mapping и aggregated storage leftovers ещё не реализованы.
- [x] Подзадача 9 (2026-10-14): final fixture storage inspection проверяет canonical private root binding каждого active slot до release. Собственные run leftovers фиксируются per-slot и агрегируются как slot_id/name; nonempty/unknown storage сохраняет reservation и durable deletion/next-admission=false, B cleanup/release остаётся независимым. Missing source A даёт aggregate null + per-slot error, а B detail остаётся []. 2 real-FS main tests/12 assertions PASS и typecheck PASS; RED на исходном main с исправленным diagnostic fixture подтверждён отдельно. Targeted regression: 79 tests PASS/481 assertions (147.60s), typecheck/diff PASS; live server inventory/backup collector всё ещё ждёт qualification.
- [x] Подзадача 8/9 (2026-10-14): проверка собственного fixture storage выполняется после каждой pipeline cleanup до следующего dispatch/retry. При leftovers/unknown inspection сохраняются измеренный outcome и committed profile archive, cleanup становится failed, admission/deletion flags=false, очередь quarantines slot. Public main RED: repeat=2 запускал обе попытки; GREEN: одна попытка, второй trace отсутствует, receipt/archive сохранены. 3 tests PASS/19 assertions; parallel-main regression: 24 PASS/154 assertions (129.06s), typecheck/diff PASS. Live storage collector не квалифицирован.
- [x] Подзадача 9 (2026-10-14): report сохраняет per-slot root/leftovers/listing-error detail при aggregate=null; healthy empty B показан отдельно от неизвестного A. Recover guidance выводится и для failed listing, scoped/shared broad rm не генерируется. RED→GREEN public renderReport, 38 report/compare tests PASS/117 assertions, typecheck/diff PASS.
- [x] Подзадача 9 (2026-10-14): public fixture main сохраняет единственный user root в loginom.storage_dir при N=1; N>1 оставляет null, все active/planned roots записывает per-slot. Legacy top-level container/image_digest path сохранён. RED→GREEN dry-run N=1/N=2: 6 assertions; run/report/compare regression: 64 PASS/337 assertions (23.38s), typecheck PASS. Live v2 admission ещё недоступен.
- [x] Подзадача 9 (2026-10-14): runNodeEvals сохраняет completed runDir при ошибке postprocessing/evidence write, pre-dispatch errors остаются runDir=null. RED→GREEN через public wrapper и actual native-crosstable.json directory collision от sanctioned fake CLI input; generic summary/outcome остаётся completed/confirmed, code-verdict не записан. 8 node-runner tests PASS/44 assertions (18.26s), typecheck/diff PASS.
- [x] Сохранить прежние top-level `loginom.container/image_digest`; для N>1 `storage_dir=null`, per-slot root хранится в slots; при N=1 сохраняется единственный user root. Новые singleton runs записывают `slot_id="default"`, старые результаты без slot_id читаются по прежнему пути. Агрегированный `storage_leftovers` остаётся `null`, если листинг любого нужного пространства не удался; детализация per-slot показывает причину.
- [x] Сохранить тип и смысл `interrupted_cleanup: { recovered: boolean } | null`: `null`, если нет попыток `status === "interrupted"`; иначе `{ recovered: interruptedAttempts.some(item => item.profile_recovered) }`. RED/GREEN: обычный recovery без interruption оставляет null; прерванная без recovery даёт false; несколько прерванных дают OR независимо от порядка завершения; recovery непрерванной попытки не влияет. Это не индикатор успешности cleanup; ошибки остаются в `slots`, `environment_cleanup`, `stopped_reason` и exit code.
- [x] Подзадача 9 (2026-10-14): scoped/shared report показывает parallel, wall time отдельно от прежней суммы agent duration, slot state/cleanup receipt и slot_id возле logical attempt. При scoped metadata/N>1 broad rm command заменена на адресное parallel-env recover с сохранённым incident/lease receipt; historical report без slots сохраняет старый формат. 37 report/compare tests PASS/113 assertions, typecheck/diff PASS. Runtime recovery команда ещё ждёт real admission и не квалифицирована этим report test.
- [x] Удалить опасную сгенерированную команду `rm eval-*` из нового shared-server отчёта; вместо неё предложить адресный `parallel-env recover` с incident/lease receipt. Отчёт включает parallel, длительность run и сумму agent time, slots/quarantine; `failure_kinds.provider` уже существует, не добавлять второй несовместимый счётчик.
- [x] Operational binding correction (2026-10-15): 148d40e4de masking changed canonical session/artifact/revision values. Existing text-import runner failed stable3/3 with invalid archive ID; focused public runAgent RED confirmed session/path/hash/revision drift. Preserve these bindings, mask free-form finalText/errors/errorTexts/node receipts/tool errors. GREEN5 PASS/34 + original runner1 PASS/5; composed CLI/run/node/calibrate/diagnostics87 PASS/592 (189.32s), typecheck/diff PASS. Original broad109 PASS/1 FAIL retained, full package/native not claimed. Private output-composition-ca741207-00a7-4821-aa53-fc4c9407dd47/audit.json SHA cf6d0929aff36faa062308901fb562e02c6563df3b32905dcac978b6b20ef0d0.
- [x] Known credential output boundary (2026-10-15): actual runAgent child emits distinct slot/admin/Dock canaries across chunks; live persisted files and final free-form parsed/run fields masked. RED→GREEN also covers quoted JSON/URI/split UTF-8, cancellation/incomplete JSON, depth20000 and secrets crossing stderr20/node8192 truncation. Numeric cost/tokens/429 and cleanup proofs preserved. Final CLI+sanitizer40 PASS/172 (86.43s), related CLI/supervisor/agent evidence71 PASS/359 (239.02s), typecheck/diff PASS. Private /home/kiselev/.local/state/loginom-evals/research/evidence/output-redaction-fca222ed-f85a-448d-badd-dabdff684e3e/audit.json; full native active-secret collection remains separate.
- [x] Подзадача 9 (2026-10-15): prepareFixture передаёт configured Loginom/Dock/provider cleanupSecrets каждому active command, включая diagnostics. Public main N=2 с приватными fake-state canaries RED раскрыл stderr, GREEN1 PASS/8 assertions (17.37s); закрыты оба слота, просканированы все run files. Секреты не добавляются в inputs/results; admin file и inactive credentials не читаются. Итоговый контроль1 PASS/8 (17.46s). Initial broad109 PASS/1 FAIL выявил binding regression148d, исправленную964d70553f; current composed87 PASS/592 (189.32s), typecheck/diff PASS. Node wrapper help/common parser/programmatic --parallel подтверждены всеми8 cases этого набора; реализация существовала, новый RED не заявляется. Private output-composition-ca741207 audit cf6d0929...;16 temporary logs archived0600/read-back and removed. Native active-slot/admin secret collection остаётся открытым.
- [x] Snapshot repeated-secret masking (2026-10-15): public redact RED обнаружил known Loginom/Dock/provider credentials в URL соседних config fields, несмотря на <set> в собственных password/apiKey. Повторно применён existing known-secret sanitizer к snapshot copy; literal/URI variants скрыты, original runtime config и marker/numeric values сохранены. GREEN2 PASS/14 assertions (85ms); composed87 PASS/592 (189.32s), typecheck/diff PASS. Общий run/calibrate snapshot caller сохранён, controller/private config не сериализуется; native all-active/admin collection остаётся открытым. Evidence output-composition-ca741207 audit cf6d0929..., source hashes/read-back verified.
- [ ] Маскировать все разрешённые credentials активных слотов и admin secrets до записи errors/stdout/config snapshot; секреты неактивных слотов не читать. `redact` не сериализует полный controller/private config. Кодовый тест с различными canary secrets проверяет results и diagnostics после успешного/ошибочного setup и cleanup.
- [x] Проверить тесты выше, `bun test test/node-native.test.ts test/text-import-evidence.test.ts` для затронутых collectors и `bun typecheck`. Коммит `feat(evals): preserve reporting and node evidence across slots`.

Проверка завершённых reporting/node-evidence пунктов 2026-10-15: текущие report/compare/rejudge/node-evals/node-evidence/node-native/text-import-evidence —89 PASS/449 assertions (79.79s). Дополнительные actual fixture main checks singleton/default metadata, consecutive interrupted runs и infra retry —4 PASS/48 assertions (50.93s), private management-registry-20261015/report-slot-metadata.log. Реализация поведения существовала до этой сверки; новый RED не заявляется. Legacy readers и quality denominator сохранены; неизвестный/неоднозначный slot отклоняется; shared report не генерирует broad delete. Credential canary matrix, полный live runtime и итоговая приёмка остаются открытыми.

### Задача 10. Немодельная и затем живая приёмка

- [x] Run-level limit gate: measured checkpoint сохраняет normalized `limit_evidence` в AttemptResult, также в `infra_retry.initial`/archive и после измеренной ошибки; `parallel_limits` агрегирует все выполненные runs, включая interrupted. Известный429 сохраняет failed после successful retry; missing/partial coverage incomplete. Report выводит отдельную проверку, quality/cost/exit code не переписываются, judge-only сохраняет metadata. TDD actual fake CLI initial429→exit1 infra→exit0 completed: metadata missing RED→GREEN1/8 (13.21s), warning RED→GREEN; final retry controls2/22 PASS33.63s. Report/compare/policy108/436 PASS0.193s, run/rejudge43/334 PASS105.46s, extended current rejudge1/16 PASS20.33s, typecheck/diff PASS. Private limit-aggregate-198c93eb-d4d9-47f5-9df1-12866a7bfdc4/verification.json SHAebcee9a1b425adc590b523fee6acaa4eda09e252df1286448c979aab70890e1f;7 RED sources read back, own old RED root removed after closed proofs/fresh absence, signals0. Full hidden transport/judge/Dock coverage, resource/licence/source-qualified runtime admission остаются open; model/native Loginom/live judge calls0.

- [x] CPU interval budget metrics: host cpu.utilization_percent из adjacent counters и container cpu.cores из exact Docker counter/read clock; дробные clocks/cores сохраняются, guest не суммируется повторно. Docker read/counter связаны с raw snapshot, timestamps ограничены measured frame; gaps/reset/unknown/epoch drift дают missing, positive exceedance имеет приоритет. Legacy receipts без derived rates читаются с пересчётом, tampered values refused. TDD RED missing API/invalid clock/actual fractional sampler/native missing read/timestamp schema/foreign frame → GREEN104 resource/policy/collector/Docker PASS/780 (37.20s), typecheck/diff PASS. Реальные host1000ms и owned bounded Docker1000ms controls, quota не меняется. Full unit ранее стартовавшего набора:880 PASS/3SKIP/0FAIL4597 across68 files (928.29s); новые CPU cases входят в отдельный104-test regression. Mandatory all-scope thresholds/quotas и production/live binding ещё open.

- [x] Provider visible-limit producer: parseEvents сохраняет только explicit APIError.data.statusCode=429 в limitEvidence; raw message/responseBody не копируются. Последующий text/step_finish и exit0 не стирают event. Coverage provider/Dock/judge остаётся unavailable, поскольку headless JSON не показывает все retry/transport diagnostics; отсутствие события не даёт PASS. TDD RED missing metadata→GREEN; negative textual/string-status/foreign-error/empty controls. Actual Bun child→supervisor→JSONL→run.json persistence подтвердил failed limit gate и preserved original exit/text/cost/errors. Target3 PASS/17; CLI/report/fixture parallel/policy118 PASS/563 assertions (223.25s), typecheck/diff PASS. Intermediate hidden retries, provider quota/Dock/judge diagnostics и полный runtime aggregate ещё открыты.

- [x] Retained process source → resource lifetime: readResourceProcessWindows проверяет private canonical proof source, semantic SHA, exact owner/producer PID, continuous confirmed capture, complete launcher identity, ready=true и две ordered final00 после actual exit. Общая qualifyClosedProcessEvidence используется также offline judge inventory без дублирования validator. Coordinator с processProofs использует persisted dispatch→exit окна вместо inline processWindows; producer PID проверяется в каждом active frame. При frozen manifest требуется proof каждого выбранного slot ID; empty inventory/отсутствующий B incomplete. TDD RED absent reader/changed producer frame passed/inline unverified window ignored source/unready proof accepted/empty actor manifest passed → GREEN. Actual Bun supervisor + collector1000ms/private read-back: N=1 A proof positive, N=2 missing B negative; wrong owner/producer/hash/duplicate source refused. Resource/qualification/offline/recovery80 PASS/570 assertions (40.10s), typecheck/diff PASS; собственные roots удалены после confirmed cleanup. Это captured-reference qualification: полный durable inventory всех runtime actors/попыток и production binding ещё открыты; сигналы/delete/recovery authority не добавлены.

- [x] Resource scope manifest: freezeResourceManifest выбирает первые N slots из canonical slots file, сохраняет все controller/profile/work/history paths, обе role/full-ID/image/startedAt/name/nonce/purpose identities, cgroup view, cadence1000ms и captured бюджет. Exclusive0600/private700/fsync + source SHA; read-back проверяет schema/run/time/hash и исходный budget. Whitelist projection исключает дополнительные private fields; output в profile/work/history/auth/judge/guards запрещён. checkResourceEvidence при manifest берёт coverage paths/containers, view и budget из сохранённых bytes, caller не сокращает их до пустого списка. TDD RED absent exports/private-field leak/empty caller containers passed/profile output allowed → GREEN; actual host collector1000ms/raw/summary плюс normalized container metadata controls, N=2→N=1 selection, invalid/duplicate/foreign identities. Resource evidence/summary/policy/process63 PASS/405 assertions (8.68s), typecheck/diff PASS. Container metadata здесь нормализованные input receipts, не live Docker qualification; полный actor inventory, mandatory thresholds/quotas, production dispatch binding и immutable live manifest остаются открытыми. Без manifest сохраняется прежний declared-only component API.

- [x] Actual supervisor lifetime producer: optional ProcessCleanup.lifetime содержит producer PID/owner/exact launcher identity, timestamp перед spawn и actual exit event; unknown exit=null, pre-aborted без dispatch не получает receipt. Новый process-cleanup.json0600/file fsync сохраняет normal/interrupted lifetime. TDD RED absent lifetime + Bun.write игнорировал mode для string output→GREEN explicit open/write/sync. Producer2 PASS/15; supervisor/process34 PASS/235 (147.78s), typecheck/diff PASS. Actual collector1000ms до dispatch → persisted full launcher window → summary/coordinator1 PASS/3; own root очищен после confirmed cleanup. Полный mandatory actor inventory, immutable receipt/source binding в production и live admission ещё открыты.

- [x] Process-window coordinator binding: checkResourceEvidence применяет processTimeline к тому же verified raw bundle, требует exact unique coverage owner/birth ↔ processWindows inventory. Missing/foreign/duplicate window и duplicate declared owner incomplete. RED отсутствовал named check/omitted window passed/duplicate inventory passed→GREEN. Actual two-supervisor1000ms raw→summary→coordinator PASS плюс отрицательные inventory controls; resource source/summary/policy/process/integration71 PASS/554 (22.88s), typecheck/diff PASS. Пустой owner inventory оставлен для declared-only host smoke; mandatory production inventory и durable launch-to-exit receipts ещё требуются.

- [x] Declared process lifetime policy: assessProcessResourceTimeline проверяет bracket/cadence и exact owner/launcher birth с verified RSS/CPU во всех frames указанного active window; missing/unverified scope либо окно без наблюдений incomplete. TDD RED missing export→GREEN, 12 policy assertions. Два actual supervisor owner/collector1000ms проверены в measured active subwindow; независимый cleanup A сохраняет B. Process/policy39 PASS/251, typecheck/diff PASS. Durable launch-to-exit receipts, coordinator binding и обязательный inventory всех actors ещё открыты.

- [x] Server filesystem semantic binding/reducer/coverage: shared serverStorageBinding сверяет parent и independent storage по ID/image/name/startedAt/PID/owner kind/nonce/purpose и stable running flags; mismatch не получает numeric credit, partial identity остаётся unknown. Per-container/epoch/path series min/peak/delta/missing сохраняют raw source. Coverage требует ровно один UserStorage/SessionBackup entry с четырьмя safe byte/inode counts; known storage mismatch failed даже рядом с missing RAM, unavailable/duplicate/missing roots incomplete. RED missing reducer series/partial identity/missing storage→GREEN; summary10 PASS/28, coverage18 assertions. Actual16MiB collector→schema→summary oracle и legacy derived-series read-back:50 assertions PASS; old file не переписывается, forged present series отвергается. Resource93 PASS/683 (27.10s), typecheck/diff PASS. Full mandatory manifest/actor lifetime/production/live gates остаются открытыми.

- [x] Server storage periodic raw/schema binding: collectHostResources помещает independent storage snapshot (с собственной selected inspect/epoch/filesystems) только в Server frame; Studio storage=null. Metadata не склеивается с чужой epoch; semantic credit остаётся отдельным следующим gate. Actual bounded-container collector RED missing storage→GREEN; закрытый private JSONL содержит16MiB, env canary отсутствует. Source schema RED принимал malformed storage bytes→GREEN отвергает до summary output; wrong epoch flag/ID/PID/filesystem-array controls PASS. Actual integration46 assertions PASS; resource/policy/Docker/namespace91 PASS/666 (29.69s), typecheck/diff PASS; legacy absent/null storage остаётся unknown. Reducer/coverage binding ещё требуется.

- [x] Server filesystem primitive: sampleServerFilesystems связывает fixed UserStorage/SessionBackup statfs с exact immutable container ID/image/name/nonce/purpose и running/PID/startedAt до/после read-only Docker exec. Env-i stat/timeout, числовые safe byte/inode projections без Config.Env/content reads; unknown root не заменяется host filesystem либо0 и не скрывает healthy root. Actual pinned-image disposable tmpfs16MiB/sentinel: RED missing export и partial root erasure→GREEN31 assertions; wrong nonce/Studio/short ID controls PASS, typecheck/diff PASS. Exact ID/image/nonce cleanup удалил только собственный container/volumes; live Loginom отсутствует. Resource/policy/Docker/namespace91 PASS/651 (27.83s), typecheck/diff PASS; periodic frame/schema/summary/coverage binding ещё требуется.

- [x] Full current regression6068b57b65:911 PASS/16SKIP/0FAIL4663 assertions,927 tests/74 files (1045.92s), exit0; bun typecheck/diff PASS. Private log0600 /tmp/evals-parallel-full-6068b57b65-f6EKYA.log SHAac38904460efec3463a9c3155cd0380245e8ddc55df64f2f349f80a6d8400c72/stable metadata read-back PASS. Диагноз writer initialization дополнен post-fix result; runtime guards не ослаблены. Opt-in/nativeBusy SKIP не засчитаны в native/live admission; полный regression после production интеграции и все реальные gates ниже остаются открытыми.

- [x] Full regression baseline f247ee87e4:909 PASS/16SKIP/2FAIL4661 (1044.47s). Две stable5/5 ошибки writer initialization — outdated expectations после intentional c183a97e38. Test-only fix сохраняет exact first-owner identity, directory/symlink refusal и already observed replaced-owner release fence; writer-identity10 PASS/17 и initialization5/5 (15 PASS/30), typecheck/diff PASS. Диагноз в evals/docs/2026-10-14-writer-initialization-diagnosis.md. Post-fix full rerun ещё требуется; SKIP не считается native/live PASS.

- [x] Frozen declared resource budget: freezeResourceBudget создаёт exclusive0600/private700 fsynced документ с automatic fixed_at/run_id и detached validated bounds; возвращает source SHA. readFrozenResourceBudget сверяет captured SHA/private source, run и timestamp строго до dispatch. checkResourceEvidence потребляет budget file+pre-run SHA, не post-run inline bounds; budget_source сохраняется в результате. Actual fs RED→GREEN freeze/read/no-overwrite/hash/timing/invalid-bound controls:2 PASS/22; source/summary/policy53 PASS/276, actual1000ms coordinator smoke PASS/12, typecheck/diff PASS. Полный required-scope manifest, выбор live thresholds/quotas и production dispatch binding остаются открытыми. Admin/model/judge files metadata-only повторно проверены: отсутствуют.

- [x] Resource incident gate: рост cgroup oom/oom_kill и Docker oom_killed=true отвергают resource evidence независимо от бюджета/итогового running epoch. Counter_increases для memory_events сохраняет known positive transitions даже после reset; unchanged historical nonzero baseline не считается новым OOM. Reset/gap/single observation и absent Docker boolean — incomplete; applicability/all-null coverage остаётся у cgroup gate. Пять redacted receipt RED→GREEN PASS/15, gate wired в checkResourceEvidence; actual1000ms smoke PASS/11. Summary/source/policy51 PASS/252 плюс historical optional-field/tamper5 assertions, typecheck/diff PASS. Старые summary читаются без переписывания; returned derived fields пересчитаны из raw bytes. Live acceptance не заявляется.

- [x] Resource evidence coordinator: checkResourceEvidence применяет timeline1000ms, declared scope coverage, qualified-view cgroup policy и budget к одному verified raw bundle; сохраняет поимённые checks/source hash. Known failure имеет приоритет над incomplete. Actual owned-command/collector smoke:11 assertions PASS, включая missing budget, exceeded budget + unbracketed window, wrong run и changed source; typecheck/diff PASS. Declared-only component gate не выдаёт live admission: mandatory frozen manifest, lifetime/incident coverage и остальные acceptance gates ещё открыты.

- [x] Verified raw resource bundle: readResourceEvidence возвращает samples вместе с receipt из одного private source read/parser после expected path/run/phase, SHA и recomputed-summary checks. readResourceSummary сохраняет прежний output. Actual host/source TDD RED missing export→GREEN; returned mutation не меняет raw bytes/read-back, changed source отвергается. Evidence/summary/policy45 PASS/234 assertions, typecheck/diff PASS. Coordinator может применять coverage/timeline к тем же проверенным bytes; сам acceptance gate ещё открыт.

- [x] Resource temporal policy: ordered sequence и monotonic elapsed/observed clocks должны охватывать actual dispatch→confirmed cleanup; interval соответствует frozen cadence, missed intervals и whole gaps не принимаются даже при missed_intervals=0. Unknown clocks/неполное окно — incomplete, reversed execution window — failed. Три RED→GREEN policy tests PASS/16; actual owned Bun command + periodic1000ms collector PASS/4, typecheck/diff PASS. Собственные temporary samples удалены после закрытия collector. Policy не заменяет frozen manifest, process lifetime coverage и coordinator binding.

- [x] Durable sampler smoke at56e96130ee (runtime5c9f312333): private evidence/resource-proof-ozd6NS/{intent,before,process,container,after}.json + run.jsonl и receipt.json0600. env -i PATH-only/bun --no-env-file, credential-prefixed keys0. 3 actual frames/1000ms/missed0; host/self/bounded pinned Server-image shell controls PASS, exact cleanup и HTTP404/fresh read-back всех6 hashes PASS. Receipt SHA4aee253363151ccb0be2fa3f7bbdf933075f87bc58a7f39deee09f897fbb079e, scope nonmodel-bounded-container-and-self-only/liveQualified=false. Superseded cSHgaZ удалён после metadata/hash/inventory checks, audit сохранён (signals0). Studio/Loginom/browser/judge/licence/model/budgets/acceptance этим не квалифицируются.

- [x] Container cgroup связан с observed Docker host PID и стабильным повторным inspect (started_at/running/PID/image/name/owner labels). Frame содержит epoch_stable и leaf/ancestor counters; changed/missing epoch либо неверный nonce оставляют cgroup unknown. Actual bounded container подтвердил kernel memory.max64MiB, cpu.max ratio0.25, OOM/throttling; удалённый ID неизвестен. RED missing cgroup → GREEN; 29 resource tests PASS/259 assertions (17.24s), typecheck/diff PASS. Это resource binding, не Loginom serverEpoch/session admission.

- [x] Cgroup sampler сохраняет ancestor chain от parent до / и observed cpu.max (quota/period, literal max), memory/swap limits и доступные counters каждого scope. Malformed/noncanonical membership не превращается в guessed sysfs path; absent quota=null. На этом хосте leaf quota отсутствует, /user.slice/max100000 прочитан; root fields также могут отсутствовать. Actual private mount mask ancestor cpu.max сохраняет unknown с диагностикой. RED missing ancestors → GREEN; 29 resource tests PASS/251 assertions (16.11s), typecheck/diff PASS. Shared ancestor counters не приписываются одному slot; effective budget/receipt validation ещё не реализованы.

- [x] Private summary persistence/CLI: после закрытия JSONL создаётся exclusive0600 .summary.json со source SHA, run/phase и reducer output; file/parent fsync, private source binding и stable file metadata. Actual sampler RED→GREEN, malformed host counters отказывают до output; existing bytes/inode и source aliases/public mode сохранены/отвергнуты. Полный resource/Docker/namespace набор42 PASS/321 assertions (20.84s), typecheck/diff PASS. Сам receipt не выдаёт acceptance PASS; глубокая receipt/coverage/licence/budget validation и coordinator binding ещё открыты.

- [x] Summary scoped series: Server/Studio по full ID+started_at, processes по producer PID/owner/PID/birth, I/O по device/op, cgroup leaf/ancestors отдельно без суммы shared load. Unverified epochs/identities и внутренние отсутствующие frames остаются missing; counter reset исключает delta. Пять дополнительных receipt RED→GREEN: summary8 PASS/23 assertions; resource regression34 PASS/224, typecheck/diff PASS. Counts scoped series ограничены первым/последним наблюдением данной identity; сами source frames и acceptance coverage ещё требуют отдельной проверки.

- [x] Summary primitive для host/filesystems: min/peak/delta по памяти, swap, raw CPU ticks и каждому disk/inode path; observed/missing без подстановки нуля, missed intervals/max elapsed gap. Reset CPU counter даёт delta=null и counter_resets. Три redacted receipt RED→GREEN: 3 PASS/9 assertions; с host collector16 PASS/102, typecheck/diff PASS. Исходные samples неизменны; private persistence, container/process/cgroup series и acceptance gates ещё открыты.

- [x] Process-local resource producer: supervisor публикует defensive copies только своих admitted identities; periodic callback читает birth-checked RSS/CPU/cgroups. Actual A/B child tests подтверждают metrics обоих, неизменность приватной identity после mutation public copy, independent A drain/B survival и unavailable/null после evidence IO failure. Standalone CLI сохраняет processes=null. RED missing export/frame binding→GREEN; resource suite26 PASS/201 плюс Docker/private namespace5 PASS/75, typecheck/diff PASS. Acceptance coordinator/normal main binding ещё открыты.

- [x] Process sampling primitive: RSS bytes и raw CPU ticks по trusted ProcessIdentity; повторная проверка birth/executable inode+device/UID/PGID/SID и cgroup path вокруг чтения. Не читает environ/cmdline/profiles и ничего не сигналит. Changed identity и завершённый actual Bun child дают unknown/null, а не нулевую нагрузку. RED missing export/cgroup → GREEN; вместе с host/CLI/Docker 27 PASS/228 assertions (17.58s), typecheck/diff PASS. Owner label передаёт caller; runtime ownership admission и periodic producer binding пока не подключены.

- [x] Resource CLI читает private ready pair journal, связывает Server/Studio по exact IDs/image/name/nonce/purpose и пишет periodic containers вместе с host. Выбранный Docker inspect возвращает limits, started_at/running/OOM/PID без Config.Env; absent journal даёт containers=null, invalid journal — отказ до output. Actual bounded shells на обоих pinned images, SIGINT, несовпадение nonce при healthy container, env canary и private metadata drift: 24 tests PASS/185 assertions (16.24s), typecheck/diff PASS. Это synthetic pair journal и реальные OS/Docker counters; Loginom/license/live acceptance не заявляются.

- [x] Docker sampling primitive: полный immutable ID, фиксированный local socket, negotiated API и one-shot stats; CPU/RAM/PIDs/I/O и исходный API body, неизвестные counters=null. Actual disposable bounded container и удалённый ID: 20 resource/CLI/integration tests PASS/131 assertions (7.44s), typecheck/diff PASS. Engine1.48 без поля id квалифицирован; limits не изменяются, cleanup проверяет exact ID/image/nonce. CLI binding Server/Studio, inspect limits/OOM и общий acceptance gate остаются открыты.

- [x] Подзадача 10: sampleCgroupResources читает фактический unified /proc/self/cgroup и cpu.stat, memory.events/current/max, memory.swap.current/max из фиксированного sysfs. Сохраняет CPU usage, доступные throttling counters, OOM/oom_kill и bytes/explicit max; недоступные поля=null с component diagnostic. На текущем collector cgroup throttling отсутствует и не заменён нулями. RED missing export и отсутствующее CLI поле → GREEN; actual private bwrap masks memory.current/events подтверждают unknown при сохранном CPU usage. Collector JSONL содержит host.collector_cgroup с observed path; 18 host/CLI/integration PASS/111 assertions (5.12s), typecheck/diff PASS. Это scope самого collector (на этом хосте общий app scope), не доказательство quota/OOM выбранных Server/Studio/agent owners; ancestor limits, их counters и controller binding остаются открыты.

- [x] Подзадача 10: script/sample-parallel-resources.ts реализует host-only CLI --config/--out/--interval-ms(default1000), optional --run-id/--phase(before|run|after). Без labels записывает null, не угадывает связь с run. Read-only loadResourceSlots проверяет private config/schema/canonical graph/stateDir без чтения admin credentials и без readiness; missing profile остаётся неизвестным statfs. CLI запрещает evidence в agent/work/history/auth/judge/config/admin/global-lock roots и отказывает с известными credential env prefixes до config IO. Actual trusted-supervisor SIGINT/SIGTERM, nullable base interface, profile exposure и четыре env canaries: CLI7 PASS/40; resource/slots/integration35 PASS/132 assertions (5.17s), typecheck/diff PASS. Native Docker/owned process/cgroup counters, full controller binding и acceptance не квалифицированы этим host-only smoke.

- [x] Подзадача 10: collectHostResources периодически сохраняет только реальные последовательные frames в exclusive JSONL0600/private canonical parent0700, fsync directory entry и каждого frame. Metadata содержит run/phase, monotonic elapsed/duration и missed_intervals; задержка не создаёт вымышленные samples. Abort завершает текущую запись, снимает timer/listener и закрывает FD. RED missing export, public parent и zero interval → GREEN; existing evidence сохраняет bytes/inode, EEXIST нормализован без raw filesystem diagnostic. Actual observer event-loop stall80ms квалифицирует gap counter; host/fs/private namespace8 PASS/47 assertions, typecheck/diff PASS. Это программный host collector; CLI/controller wiring, Docker/owned processes/cgroup counters и peak/min/delta acceptance остаются открыты.

- [x] Подзадача 10: public sampleHostResources читает raw aggregate CPU ticks из /proc/stat, MemTotal/MemAvailable/SwapTotal/SwapFree в bytes и capacity/free bytes/inodes через statfs для заданных roots. Не читает их содержимое и не меняет файлы. RED missing module и missing filesystem ENOENT → GREEN2 real-host/fs tests/22 assertions. Отдельный actual bwrap PID/net/mount namespace с недоступными /proc/stat и /proc/meminfo: RED EACCES обрывал frame → GREEN сохраняет CPU/memory=null, fixed diagnostic codes и здоровый filesystem1 PASS/5 assertions; всего3 PASS/27, typecheck/diff PASS. Integration исключена из обычного test:unit существующим pattern. Это host sampling primitive; периодический CLI/закрытый JSONL/run-phase/gap-summary, Docker/owned processes/cgroup counters и budget/licence acceptance остаются открыты.

**Files:** Create `evals/script/check-parallel-users.ts`, `evals/script/sample-parallel-resources.ts`, `evals/test/parallel-users-acceptance.test.ts`, `evals/test/parallel-acceptance-integration.test.ts`; Modify `evals/docs/parallel-users-contract.md`; Create `docs/testing/loginom-ai-agent/reports/2026-10-13-parallel-users-acceptance.md` при фактическом выполнении, с реальной датой вместо переписывания исторических отчётов.

**Interfaces:** `check-parallel-users --config <file> --out <private-dir> --mode non-model` выполняет реальные сценарии доверенным контроллером и возвращает безопасный receipt; он не вызывает модель/судью. Ресурсный collector `sample-parallel-resources.ts --config <file> --out <jsonl> --interval-ms 1000` работает на фактическом runner host, не вызывает модели и принадлежит trusted supervisor приёмки; стартует до run и завершается после его cleanup. Paths в командах ниже — будущие paths подготовленной среды.

- [ ] RED: схема receipt требует поимённые проверки и положительные controls; «все отрицательные операции завершились ошибкой подключения» не принимается как isolation PASS. Требуются реальные server/user identities, успешная своя операция, failed чужая и неизменность B hash/heartbeat.
- [ ] Немодельная приёмка на новой паре приёмки задачи 1а на `lg-pc-75`: prepare дважды; A/B одновременно пишут одинаковые basename; A не может read/write/copy/import/export в B и общие места записи через обычный, абсолютный и `../` пути; проверить обратное B→A. Добавить пробелы, tab/newline, Unicode, ведущий дефис, dotfiles, вложенные файлы, `.autosave` и открытый пакет.
- [ ] Во время активности B выполнить обычный cleanup A; затем crash browser A и повторный safe cleanup. Проверить session close/read-back, прекращение операций и package locks, отсутствие регенерации после подтверждения, сохранность hash B и его успешное продолжение. Обязательна квалифицированная backup policy из задачи 4: адресность непустого SessionBackup либо доказанное безопасное отключение.
- [ ] Проверить агентской sandbox-командой попытки прочитать admin credential/state/browser-profile, соседние profile/history, controller env и Docker socket; результат — denied/absent. Собственная Loginom connection и единый model OAuth store доступны ровно по выбранному контракту. Проверить admin browser без доступного CDP listener.
- [x] Licence client boundary audit (2026-10-15):1817 JS files локальной закреплённой client copy хэшированы,6 прежних primary hashes сверены. После comment stripping30 candidate files дают license-agreement/third-party text UI, session keepalive и unrelated analytics quotas; supported capacity readback не квалифицирован. Identifier search не является AST/server API coverage и не доказывает отсутствия другого licensing API. Private licence-client-surface-58d2bf88...json SHA c0f3fe431efaa3781921552a5602e49cd2f57f7699c6c004b8b4ea4d8f7ca3df; runtime/key/serial reads0. New native A/B1/16 не заменяет issuance/type/max/unlimited/scope gate, он остаётся открытым.
- [ ] До live проверить реальную выдачу лицензии Loginom и допустимые одновременные пользовательские/административные сессии: readback через квалифицированный экран лицензирования/административный Playwright adapter плюс немодельное одновременное подключение выбранных users. Сохранить безопасный receipt типа лицензии/лимита и фактического session count, без лицензионных ключей. Доступность сетевого сервера лицензий и прежний успешный вход по отдельности не доказывают допуск двух слотов. Неизвестный лимит/отказ выдачи оставляет соответствующую приёмку неполной/неуспешной.
- [x] Read-only Guardant boundary (2026-10-15): официальный Loginom Linux guide указывает IP_NAME/порт3185; configured research host и монитор доступны.15 HTTP observations,13 clients (все «По копиям»,10 loginomd.exe/3 loginomd),12 module rows; Enterprise37/50 не квалифицирован как browser-session limit. Own hostname exact match0, container identity bookends совпали. Private licence-monitor-96ee8d5e-987d-43b9-85f3-579effdc789e/observation.json600 SHA478a91af8c188a614986a9672c25f0215fec27f30686f5ce32a5093843f33a56 read-back PASS; raw HTML/query key IDs не сохранены, serial-number pages/settings/rescan/restart0. Actual issuance/user count/scope и общий licence gate остаются открытыми; подробности в eval_parallel_blockers.md.
- [x] Статическое покрытие frozen resource budget: freeze/read manifest требуют host CPU max≤100, RAM/swap minima, CPU/RAM maxima exact Server/Studio generations, bytes/inodes minima всех выбранных host paths и обоих Server roots. Поочерёдное исключение каждого из25 bounds, wrong direction/zero headroom/foreign epoch, forged thin manifest и N=1→N=2 дают отказ до публикации без изменения evidence. TDD RED→GREEN; 104 resource/policy/native Docker PASS/844 assertions (32.85s), bun typecheck/diff PASS. Fixture metadata regression отдельно воспроизведён3/3 и исправлен без ослабления guard. Live thresholds, actors/cgroup quotas и production readiness остаются открыты.

- [ ] Закрепить перед run ресурсный бюджет и лимиты в acceptance manifest: CPU/cgroup quotas, RAM/swap limits, минимальный MemAvailable и свободное место для server storage, profiles/archives/results, доступные ограничения model/Dock/judge и число одновременных сессий. Пороговые значения выбрать по фактическому runner и зафиксировать **до** попыток; их нельзя подгонять под результат. Readiness проверяет эти условия до первого dispatch.
- [x] Native census reader использует существующий management finalization receipt и его hashes command/admin inventory: проверяет run/slot/container generations, phase finalizing, все management inventories через shared qualifier и каждый закрытый admin, возвращает все canonical proofs/windows/sources со stable read-back. Дополнительного inventory/state нет; readonly admin readers требуют только controller.stateDir. Native RED undefined API133.44s→GREEN reconnect1/43 PASS127.39s; private3abc0393... audit135/15/read-back SHA291ab590.../terminale837d1e6..., exact pair/root absent. Related admin/management29/160 PASS35.79s, typecheck/diff PASS. Frozen command journal binding и mandatory coordinator consumption отмечены следующим шагом; полный resource/production admission не квалифицирован.
- [x] Resource manifest требует canonical commandJournal внутри stateDir, фиксирует его до заданного окна; checkResourceEvidence с manifest требует native census из canonical finalizer receipt, выводит все management proofs/admin windows и source refs. RED отсутствовали field/gate→GREEN; unit missing/foreign/hash/negative-codec/unsafe journal controls19/303 PASS20.13s. Native reconnect composition1/50 PASS134.93s: both CLI/admin sources, wrong producer/container generation refusal, census gate passed, полный resource admission incomplete на after-only frames/missing agent inventory. Private063235e0... audit148/21/read-back SHAef6fa649.../terminal086d5028..., exact pair/root absent. Typecheck/diff PASS. Полные before/during/after run resources, native runtime binding и budgets/quotas остаются отдельной приёмкой.
- [x] Frozen resource manifest требует явный judge enabled/skip intent и canonical home; enabled home входит в filesystem coverage/budget. Admission выводит все judge proofs из непустого sealed canonical stateDir/runId/judge-processes.json с captured SHA/shared closure qualifier. Actual two-supervisor RED passed без census→GREEN incomplete; canonical proof/source audit, missing mode/home-budget, foreign/path/hash/producer/open/empty/skip mismatch controls. Два полных файла19/292 PASS20.12s, typecheck/diff PASS. Declared-only API сохранён; native management/admin census, runtime integration и полная resource readiness остаются открыты.
- [x] Resource coordinator с frozen manifest требует sealed eval-agent inventory каждого выбранного slot по canonical stateDir/runId/slot path и captured SHA. Process sources всех его entries выводятся через общий closure qualifier; caller не может исключить короткий запуск из покрытия. Отсутствующий/повторный/чужой inventory, изменённый hash и unsafe run path отказывают. Declared-only component API без manifest сохраняется; полный management/admin/judge census и production readiness остаются отдельными gates. Actual two-supervisor RED ignored inventory→GREEN; missing/duplicate/foreign/path/SHA/producer/unsafe-run controls. Related38/338 PASS20.21s + policy/sampler/collector/judge58/350 PASS12.94s; typecheck/diff PASS. Boundary null-cgroup refusal сохранён; stdin handshake двух observed frames сохраняет full-gate assertion.
- [x] Eval-agent inventory подключён к runAgent/fixture slot context: initial/retry сохраняются отдельными canonical sources в private controller state, sealed перед release здорового slot. Actual fixture RED missing agent-processes-a.json→GREEN1/13 PASS19.06s; обе launcher births/SHA совпали с исходными moved/current receipts. Unknown slots сохраняют открытый inventory/fence; main/live admission и полный resource coordinator ещё не квалифицированы.
- [x] Per-slot eval-agent inventory primitive: protected planned receipt до actual spawn, independent private canonical process proof, sealed reader с owner/producer/SHA/continuous qualifier; concurrent launch/seal и late spawn refused. Real short CLI прочёл planned before its own work; cold1/10 PASS2.40s, typecheck/diff PASS. Fixture wiring отмечен отдельно; полное покрытие admin/management/judge и resource coordinator ещё open.
- [x] После фактического CLI сохраняются exit/stdout при отказе canonical proof copy/final inventory publication либо потере held lease. Возвращается failed cleanup без переписывания native proof; actual child fs/guard controls RED3 FAIL→GREEN4/33 PASS5.98s, seal refused. Current agent/resource/main-retry6/69 PASS36.14s, typecheck/diff PASS. Original planned/fence retained; pre-dispatch refusal не скрывается.
- [x] Многофайловые test scripts передают Bun --isolate: intentional failed scopes остаются в process-local registry своего файла, без изменения production proof guard. Shared-cache RED66/1 → isolated resource gate PASS; smoke2 files2 PASS. Весь isolated related набор62/5/1error (411.75s) не green: два30s timeout, observed PID457454 ownership/EACCES и unattributed judge-version refusal; cold primitive PASS. Полный исход сохранён в contract, дальнейшие проверки не приравниваются к full regression.
- [x] Fixture lifecycle после agent inventory: crossing/quarantine бюджеты60s, failure roots retained; unchanged assertions прошли30.51s/51.86s. Fault injector RED10s preparation wait→удаление живого root→чужой ENOENT в следующем test; GREEN bounded30s dispatch wait, early rejection handling, pending main awaited before teardown, root удаляется после успешных assertions. Unknown-judge+retry2/19 PASS37.28s без unhandled error. Production/peer deadlines не менялись; предыдущий JUDGE_VERSION_UNCONFIRMED не атрибутирован этой отдельной race.
- [x] Independent-queue test использует input-only bounded same-run peer-trace gate вместо предположения whole fast pipeline<3s. Native OS fake slow#1 ждёт trace fast#2 и сохраняет его PID; исходный order/4 PIDs/auth/DB/archive assertions сохранены. RED missing peer PID→GREEN1/16 (23.35s), typecheck/diff PASS. Production queue/sleeps/deadlines остальных сценариев unchanged; full parallel-run25/164 PASS260.21s, затем atomic trace publication и current targets3/33 PASS51.92s. Исходные failed logs сохранены; listing30s timeout не повторился.
- [x] Новые attempt и infra-error directories создаются0700: фактические initial/retry process-cleanup receipts читаются через публичный readResourceProcessWindows без копирования или ослабления reader. Fixture main RED RESOURCE_OUTPUT_PRIVATE→GREEN1/11 (19.59s), два разных launcher births с тем же slot a, typecheck/diff PASS. Related57:55 PASS/2 FAIL/459 assertions341.77s; target retry также PASS15.70s, отказы — existing round-crossing fixed-sleep assumption и explicit30s listing timeout (diagnosis open). Существующие directories/results не chmod; полнота run actor journal ещё open.
- [x] Source-qualified process lifetime с frozen manifest должен целиком входить в объявленное окно run. Actual two-supervisor RED принял прежние полные proofs для суженного run window→GREEN RESOURCE_PROCESS_RUN_WINDOW_MISMATCH; правильное полное окно PASS. Target1/13 (4.92s), related86/606 (26.47s, runner30s), typecheck/diff PASS. Это temporal binding, не полнота actor journal.
- [x] Frozen resource coordinator требует proof каждого фактически наблюдавшегося supervisor owner/launcher birth/producer, включая judge/admin/management. Actual two-supervisor RED с опущенным judge proof дал ложный PASS→GREEN incomplete; оба source-qualified proofs дают PASS (target1/12,5.14s), related86/605 PASS21.45s с runner30s, typecheck/diff PASS. Component declared-only API сохранён; runtime journal для actors между samples/полного attempts inventory ещё открыт.
- [ ] Реализовать read-only сбор до, во время обоих runs и после cleanup с интервалом 1 с: host CPU из `/proc/stat`, MemAvailable/swap из `/proc/meminfo`, свободный диск/иноды через statfs, Server/Studio CPU/RAM/PIDs/I/O через Docker stats/inspect, process RSS/CPU доверенных CLI/browser/judge owners и cgroup OOM/throttling counters. Сохранять timestamps/run/phase, исходные samples и сводку peak/min/delta в закрытом evidence; пробелы измерений отмечать, отсутствие данных не трактовать как нулевую нагрузку. Collector не должен наследовать admin/model credentials или читать содержимое профилей.
- [x] Anchored cgroup coverage policy: expected qualified global runner view сравнивается с captured namespace/root dev/inode; known mismatch остаётся failed рядом с unknown evidence. Canonical bound path и exact ordered parent→root chain обязательны. CPU usage обязателен; known active non-root cpu/memory controllers требуют quota/throttling/OOM/memory/swap fields, inactive local interfaces остаются null без0/max подстановки; contradictory controller/interface state — incomplete. Пять actual host/redacted mutation RED→GREEN:5 PASS/25; actual bounded Docker positive и namespace wrong-view controls PASS. Full resource/policy/Docker/namespace77 PASS/544 (19.79s), typecheck/diff PASS. Expected global view должен быть реально квалифицирован и frozen до actor namespaces; manifest/coordinator/temporal binding и actual admission ещё открыты.

- [x] Cgroup observer view fingerprint: actual /proc/self/ns/cgroup и sysfs hierarchy root dev/inode записываются вместе со scope, недоступный fingerprint=null+diagnostic. Actual sysfs RED→GREEN; private CG namespace control различает inherited global root и aligned virtual-root identity при одинаковом proc path=/. Malformed fingerprint отказывает до summary output. Full resource/policy/Docker/namespace72 PASS/516 (21.42s), typecheck/diff PASS. Это capture metadata: full-runner qualification/immutable expected view и applicability остаются отдельными gates, inode/namespace values не захардкожены.

- [x] Cgroup proc/sysfs membership binding: canonical proc path допускает counters только если matching cgroup.procs содержит target PID и proc membership подтверждена до/после чтения. Private cgroup namespace RED воспроизвёл ложное чтение inherited global root по namespaced path=/; GREEN сохраняет unknown. Aligned virtual-root positive control сохранён. Real owned child exit во время blocked FIFO counter read RED→GREEN также отказывает, ancestors=null; sysfs/limits/foreign processes не менялись. Namespace/exit2 PASS/17; full resource/policy/Docker/namespace71 PASS/507 (23.32s), typecheck/diff PASS. Local view binding не доказывает полноту hidden ancestors; global hierarchy/root applicability и temporal manifest остаются открытыми.

- [x] Cgroup controller availability metadata: leaf/ancestors сохраняют actual cgroup.controllers tokens, unreadable file — null+CGROUP_CONTROLLERS_UNAVAILABLE. Existing quota/throttle null не заменяются0/max. Actual sysfs RED→GREEN и private namespace EACCES control; malformed controller metadata отказывает. Runner leaf observed memory+pids безcpu; /user.slice имеетcpu и cpu.max=max100000. Kernel docs подтверждают usage fields без controller, отдельные local CFS stats при включённом controller и non-root limit interfaces; applicability/root-view qualification остаётся следующим шагом. Full resource/policy/Docker/namespace69 PASS/490 (19.95s), typecheck/diff PASS, limits/controllers не менялись.

- [x] Resource presence/binding policy: assessResourceCoverage требует host CPU/memory/swap и все заданные filesystem capacities в каждом sample, exact Server/Studio role/ID/image/name/startedAt/nonce/purpose и числовые CPU/RAM/PIDs/I/O. Для каждой ожидаемой owner launcher generation требуется хотя бы один observed snapshot с verified RSS/CPU и launcher PID/birth. Actual host + two admitted supervisor controls RED→GREEN; A drain оставляет coverage B независимой. Policy/producer/evidence33 PASS/220 assertions (2.54s), typecheck/diff PASS. Это presence/binding gate: обязательный полный manifest, temporal coverage, cgroup applicability/limits/counters ещё открыты; empty requirements не используются для live qualification.

- [x] Resource component schema: malformed cgroup counters/quota, process RSS/CPU/identity/verified и container epoch/inspect/counters/I/O отказывают до summary output. Nullable unavailable fields не превращаются в0; Docker projections больших integers сохраняются с raw_stats и не получают safe numeric credit. RED→GREEN actual host/cgroup + admitted supervisor process + real bounded Docker controls; source evidence8 PASS/47, full resource/policy/Docker/namespace65 PASS/456 (20.47s), typecheck/diff PASS. Эти dtype checks не доказывают обязательную scope coverage, identity binding к manifest или applicability отсутствующих controller fields.

- [x] Resource receipt source integrity: readResourceSummary получает expected samplesFile/runId/phase от controller, отказывает на изменённый declared path до открытия replacement, проверяет private source metadata/SHA и пересчитывает summary. Changed bytes/summary либо forged run/phase отказывают без переписывания evidence. Actual host source RED→GREEN и read-back controls:6 evidence tests/33 assertions. Writer/reader используют общий private IO/parser; resource/policy/Docker/namespace regression63 PASS/429 assertions (20.87s), typecheck/diff PASS. Это integrity gate; component schema, обязательная scope coverage и frozen manifest/coordinator ещё открыты.

- [x] Declared resource budget policy: version1 bound list связывается с run_id и fixed_at строго до startedAt; после-start/equal timestamp и чужой run дают failed, unknown time/invalid bounds — incomplete. Observed minimum/peak вне min/max дают failed; missing samples/series/intervals или counter reset — incomplete, известное превышение сохраняет приоритет. Пять receipt/reducer RED→GREEN:5 PASS/27 assertions; весь policy18 PASS/95, с summary/private evidence29 PASS/138, typecheck/diff PASS. Проверяет только заданные bounds: обязательные CPU/cgroup/RAM/swap/filesystem scopes, raw source integrity и фактический pre-run manifest ещё требуют wiring/coverage gates.

- [x] Licence receipt policy: assessParallelLicence связывает version1 normalized receipt с точными Server/Studio IDs/startedAt/serverEpoch/config hash и выбранными distinct users. Требуются confirmed issuance/readback, licence type, known positive limit либо явно observed unlimited, scope=all_sessions, фактические users+admin counts. Missing/unknown/inconsistent evidence — incomplete; bound explicit denial, epoch mismatch и exceeded count — failed. Семь дополнительных redacted receipt RED→GREEN; limits+licence13 PASS/68 assertions, вместе с summary/private evidence24 PASS/111, typecheck/diff PASS. Никакого Loginom RPC/auth: qualified licence producer, другие counting scopes и live concurrency всё ещё требуют реальной проверки.

- [x] Limit receipt policy: assessParallelLimits сохраняет failed для промежуточных provider/Dock/judge rate/quota/HTTP429 и classified Loginom licence/session limit, host OOM/ENOSPC. Неполная coverage или malformed events дают incomplete; известный отказ имеет приоритет. Видимый429 не скрывается kind=other, raw diagnostics не возвращаются, quality attempts неизменны. Шесть redacted receipt RED→GREEN:6 PASS/35 assertions; с summary14 PASS/58, typecheck/diff PASS. Это policy/schema gate, не доказательство фактической coverage; transport producer/coordinator и resource/licence/budget gates ещё открыты.

- [ ] RED/GREEN receipt validation: отсутствующие samples/лицензионное доказательство, превышение зафиксированного бюджета, OOM/ENOSPC либо классифицированный rate/quota limit дают отдельный failed/incomplete acceptance gate. Использовать обезличенные input receipts и настоящий sampler smoke без модели; результат quality attempts не переписывать.
- [ ] Schema/receipt validation остаётся в `parallel-users-acceptance.test.ts`. Реальный sampler/Docker/двухпользовательские сценарии — `parallel-acceptance-integration.test.ts`, отдельный запуск `bun test test/parallel-acceptance-integration.test.ts` с private receipt. Обычный CI не требует этой пары или административных credentials.
- [ ] Подготовить immutable manifest живой приёмки: harness/source SHA, installed CLI/manifest/binary hashes, Server/Studio digests и IDs/epoch, tasks snapshot, агент `openai/gpt-6-luna/high`, судья `gpt-6-sol/xhigh`, transport, judge prompt/schema hashes, Dock skill/manifest hashes, ACL/backup policy, список slot identities и timeout. Проверить соответствие фактических model/reasoning обязательным pins в обоих runs. Секретов в manifest нет.
- [ ] Запустить сначала два слота на фиксированном небольшом наборе минимум из двух задач с повторами, достаточными для подтверждения перекрытия. Затем на тех же pins и новой чистой run directory запустить один слот. Зафиксировать фактические retries, ошибки провайдера/судьи, cleanup, архивы, общее wall time и не приписывать качеству изменение denominator.
- [ ] Успех приёмки **выбранной параллельности** требует полноты resource/licence evidence, соблюдения заранее заданного бюджета, отсутствия OOM/ENOSPC, отказов лицензии/session limit, HTTP 429 и иных выявленных provider/Dock/judge rate/quota limits. Проверять также события промежуточных попыток и доступные transport diagnostics: успешный ответ после retry не стирает лимит. Недоступная наблюдаемость фиксируется как ограничение, а не доказанное отсутствие 429. Run с ограничением провайдера сохраняется со своими исходными результатами, но не получает PASS parallelism; изменение N/бюджета оформляет новую квалификацию, а не повтор ради PASS.
- [ ] Отдельно подтвердить согласованный shared OAuth refresh двух CLI; smoke на неистёкшем token это не заменяет. Auth failure судьи исследовать отдельно. Не менять metadata начатых LAB-серий, не подключать к новым пользователям их старые broad-cleanup executors.
- [ ] Полный regression после интеграции: `bun test` и `bun typecheck` из `evals/`, затем перечисленные немодельные/live commands. При неготовой текущей среде сохранить конкретный blocker и невыполненные шаги, не объявлять приёмку успешной по историческим JSON.
- [ ] Коммит сценариев `test(evals): accept shared-server user isolation and parallel lifecycle`; evidence commit содержит только обезличенный отчёт и pins, не private profiles/results/secrets.

### Задача 11. Сверить фактические команды и результаты приёмки

**Files:** Modify `evals/AGENTS.md`, `evals/README.md`, `evals/.env.example`, `evals/docs/2026-10-07-analytic-evals-isolation-plan.md`, `evals/docs/2026-10-07-eval-tests-runtime.md`, `evals/docs/node-evals.md`, `evals/docs/evaler-orchestration.md`, `docs/superpowers/specs/2026-09-18-evals-design.md`, `docs/testing/loginom-ai-agent/parallel-evals.md`.

**Interfaces:** Нормативные правила и каркас runbook уже обновлены задачей 0. Здесь сверяются реально реализованные commands/receipts, ссылки на design/plan и acceptance report; новые правила допуска/cleanup на финальный этап не откладываются. Старые release/series reports сохраняют исходные пути, версии и результаты.

- [x] Частичная сверка current public commands (2026-10-15): script routes recover отдельно для pre-CLI preparation и offline judge; status readonly, prepare/verify blocked ready=false, main production slots closed. Исправлены текущие неверные only-offline claims в плане/контракте/runbook; исторические шаги сохранены. Public CLI+preparation/mixed lease recovery12 PASS/70 assertions (26.51s), без qualification active-child recovery/readiness. Private native-two-users-6ebb9781.../public-recovery-verification.json. Полная сверка оставшегося интерфейса/приёмки ниже открыта.
- [ ] Сверить утверждённые в задаче 0 интерфейсы с реализацией: команды/флаги, выходные коды, ownership/release receipts, archive/cleanup state, node-evals и legacy rejection. Исправить примеры и пути; неожиданное изменение нормативного контракта возвращает работу в задачу 0 до нового изменения поведения.
- [ ] Добавить фактические SHA/manifest pins, отчёт приёмки 2 → 1, resource/licence/limit receipts и оставшиеся ограничения. Только реализованные и проверенные операции снять с пометки «планируется». Исторические runbooks/reports сохраняют версии и факты своего окружения.
- [ ] Проверить документальные свидетельства перехода: прежние исполнители исключены, v2 marker отвергается legacy cleaner, цепочки prepare/recover/run проходят без утечки reservations. Это проверка уже принятого контракта, не первая формулировка правил миграции; действующие серии автоматически не перенастраивать.
- [ ] Подготовить checkpoint ≤20 строк: SHA/pins, выполненные проверки, невыполненные gates, следующий шаг. Не переносить туда сырые логи или предположения.
- [ ] Проверить покрытие каждого требования дизайна задачей/тестом, отсутствие придуманных RPC signatures и якобы выполненных проверок, `git diff --check`; коммит `docs(evals): document parallel user setup and recovery`.

## 5. Будущие команды оператора

**Сейчас реализованы readonly `status`, `prepare`/`verify` с отказом readiness до live qualification и `recover` для offline judge и ограниченных pre-CLI unactivated preparation incidents с подтверждёнными sources/lineage. Active eval-slot recovery и production dispatch ещё не реализованы полностью. Остальные команды и флаги этого раздела пока проектируются; acceptance config сохранён; готовность acceptance pair ещё не подтверждена.** Впоследствии `run.ts` сам вызывает prepare/admission перед первой попыткой и повторно использует run context. Отдельные команды предназначены для проверяемой подготовки, диагностики и восстановления, а не для ручного редактирования пользователей.

```bash
cd /home/kiselev/git/loginom-ai-agent/evals

# После bootstrap владельца и реализации задачи 1а: создать новую acceptance pair.
bun run script/parallel-pair.ts create --config /home/kiselev/.local/state/loginom-evals/parallel/slots.json --purpose acceptance --out /home/kiselev/.local/state/loginom-evals/parallel/evidence/pair-create

# Один проверенный установленный кандидат используется подготовкой и всеми прогонами.
export EVAL_CLI_MODE=binary
export EVAL_CLI_BIN="$(readlink -f /home/kiselev/.local/state/loginom-evals/parallel/candidate-home/.local/bin/loginom-ai-agent-cli)"
export EVAL_AGENT_MODEL=openai/gpt-6-luna
export EVAL_AGENT_VARIANT=high
export LOGINOM_AI_AGENT_EXPERIMENTAL_WEBSOCKETS=false
export JUDGE_MODEL=gpt-6-sol
export JUDGE_REASONING=xhigh
export EVAL_TASK_TIMEOUT_MS=900000
export EVAL_JUDGE_TIMEOUT_MS=300000

# Одной командой подготовить пользователей, ACL, личные roots, профили и receipts.
bun run script/parallel-env.ts prepare --config /home/kiselev/.local/state/loginom-evals/parallel/slots.json --parallel 2 --out /home/kiselev/.local/state/loginom-evals/parallel/evidence/prepare

# Повторная подготовка: те же identities, пароли/история/чужие файлы сохранены.
bun run script/parallel-env.ts prepare --config /home/kiselev/.local/state/loginom-evals/parallel/slots.json --parallel 2 --out /home/kiselev/.local/state/loginom-evals/parallel/evidence/prepare-again

# Status: read-only состояние. Verify: немодельная проверка без исправлений конфигурации.
# Verify может открыть/закрыть свои probe sessions и сохраняет это в receipt.
bun run script/parallel-env.ts status --config /home/kiselev/.local/state/loginom-evals/parallel/slots.json --out /home/kiselev/.local/state/loginom-evals/parallel/evidence/status
bun run script/parallel-env.ts verify --config /home/kiselev/.local/state/loginom-evals/parallel/slots.json --parallel 2 --out /home/kiselev/.local/state/loginom-evals/parallel/evidence/verify

# Приёмка действует только на явно выделенных тестовых пользователях этого config.
bun run script/check-parallel-users.ts --config /home/kiselev/.local/state/loginom-evals/parallel/slots.json --out /home/kiselev/.local/state/loginom-evals/parallel/evidence/non-model --mode non-model

# Обычный harness: автоматически prepare -> all-slot admission -> dispatch.
EVAL_SLOTS_FILE=/home/kiselev/.local/state/loginom-evals/parallel/slots.json EVAL_CLI_MODE=binary EVAL_RESULTS_DIR=/home/kiselev/.local/state/loginom-evals/parallel/results/two bun run src/run.ts --parallel 2 --tasks tasks/analytic --only sales-by-category,inventory-by-category --repeat 3

# Те же pins, новый results root, один слот.
EVAL_SLOTS_FILE=/home/kiselev/.local/state/loginom-evals/parallel/slots.json EVAL_CLI_MODE=binary EVAL_RESULTS_DIR=/home/kiselev/.local/state/loginom-evals/parallel/results/one bun run src/run.ts --parallel 1 --tasks tasks/analytic --only sales-by-category,inventory-by-category --repeat 3

# Адресное recovery использует сохранённый incident; неизвестная identity запрещает delete.
bun run script/parallel-env.ts recover --config /home/kiselev/.local/state/loginom-evals/parallel/slots.json --slot a --incident /home/kiselev/.local/state/loginom-evals/parallel/controller/incidents/a.json --out /home/kiselev/.local/state/loginom-evals/parallel/evidence/recover-a

# Кодовые node-evals используют тот же admission и slot_id для закрытых архивов.
EVAL_SLOTS_FILE=/home/kiselev/.local/state/loginom-evals/parallel/slots.json EVAL_CLI_MODE=binary EVAL_RESULTS_DIR=/home/kiselev/.local/state/loginom-evals/parallel/results/nodes bun run script/run-node-evals.ts --parallel 2 --only crosstable-fixed-sum,crosstable-sliding-average
```

Команды закрепляют две существующие аналитические задачи и по три повтора: 6 logical attempts на двух слотах, затем 6 на одном. По решению владельца все новые eval-прогоны используют агента `openai/gpt-6-luna/high` и судью `gpt-6-sol/xhigh`. Эти обязательные pins действуют также для приёмки N=2 → N=1; исторические runs сохраняются. Набор/model/judge/timeouts фиксируются до обоих runs в immutable manifest; изменение требует новой приёмки. Launcher кандидата проверяется по canonical realpath и SHA receipt задачи 7; пути выше появятся только после его установки. До задачи 7 немодельные задачи 1–6 используют существующий prod CLI, но не получают shared/model admission. Dock endpoint/credential подаются через private env contract (`LOGINOM_DOCK_BASE_URL`, `LOGINOM_DOCK_API_KEY`); секреты не пишутся в manifest/argv. `verify` не исправляет конфигурацию; созданные проверки user sessions учитываются и закрываются.

## 6. Оставшиеся недоказанные вопросы

1. Production-идентичность server session и её привязка к конкретному CLI/management запуску, включая reconnect и несколько соединений одного пользователя. Экспериментальный display name недостаточен.
2. Адресное обращение с **непустым** SessionBackup либо доказанное поддержанное отключение; текущее evidence содержит `NOT_REPRODUCED`.
3. Полностью автоматическая повторная подготовка ACL/Everyone/users/profiles на реальном адаптере, сохранность чужих данных при partial/unknown outcome.
4. Многопроцессное владение Chromium у двух supervisor и trusted admin; process observation gaps под фактической нагрузкой.
5. Два агента в реальном bubblewrap с временным shared OAuth кандидатом, согласованный refresh и отдельная пригодность судьи `codex exec`.
6. Полный параллельный LLM-eval на двух слотах, затем single-slot и node-evals через те же контракты. Немодельные JSON этого не доказывают.

## Checkpoint

1. 2026-10-13: реализация в evals-parallel, рабочая база b54455e187fb0a728787263e17a1adc828d77221.
2. Задача 0: контракт v2/runbook и все нормативные ссылки синхронизированы; live не квалифицирован.
3. Работа перенесена в worktree 96cd после переключения общего checkout другим агентом; семь чужих untracked сохранены.
4. Соседняя node-selection сессия: отдельный worktree 4118, общий dev/legacy стенд не менять.
5. Семь SHA-256 evidence проверены; исторический немодельный опыт не заменяет приёмку harness.
6. Cleanup: writers/management → durable archive → server close/readback → свои files/backups → release.
7. Standalone выпускает reservations; crash сохраняет durable fence до recovery-only CAS/proofs.
8. Непустой backup/session identity/supervisor/OAuth/LLM N=2→N=1 остаются gates.
9. c972e05ac5: fixture main/actual leases/archive, same-slot retry, quarantine/clean stop, gate и SIGINT реализованы; liveQualified=false.
10. Проверки: 64 main/judge/report, 24 main/archive, 60 legacy/report/compare PASS; SIGINT 2 runs/2 slots и OR metadata PASS; typecheck/diff PASS.
11. Full unit 595/3skip/0fail — прежний frozen factory checkpoint, не последняя full-suite проверка; Docker factory 24 assertions PASS.
12. Permanent research6ae20e683182/ff3ce5974e67 retained. Native causal binding + empty pending-session CloseSession(proxy,5000)/fresh absence PASS; own-renderer logout fault injection, retained name/time refusal and repeat verified. Current60 admin/native/codec/preflight PASS/271 (77.49s), typecheck/diff PASS; native-user-d3ec9d6a... evidence. Qualification=false. Next durable ledger/parent authority/reconnect/active packages/backup/CLI crash. e3H9B4/admin-fYV8vv incidents retained.
13. Historical slot/history/fence milestones: wrapper8, main24, report38, singleton64 PASS; current reader/process qualifications — пп17–18. Real admission/prepare ledger и actual SIGINT judge/cleanup открыты.
14. Product worktree evals-oauth@04ff82be4d: five cherry-pick -x + independent installer fix; dependency lineage/diagnosis в contract.
15. Historical full6068b57b65:911 PASS/16SKIP/0FAIL4663 (1045.92s), typecheck/diff PASS; log0600 SHAac38904460efec3463a9c3155cd0380245e8ddc55df64f2f349f80a6d8400c72/read-back. Test-only writer initialization fix сохраняет directory/symlink/observed-owner refusal; прежние failures/diagnosis сохранены. Opt-in/nativeBusy SKIP и production/live gates open.
16. Cold parallel module: 25 PASS/160 assertions (114.56s); 36 proof versions/31 paths/43 PID:starttime, live birth matches=0. Два historical lifecycle failures не воспроизведены; PID344630 не атрибутирован. Probe/collector завершены; safe logs600 /tmp/evals-parallel-cold-signal-msu69vi4.{events,proofs}.jsonl.
17. Installed eb85403ce4: shared-schema bwrap4 PASS/29, native2 PASS/25 + kernel PID reuse1 PASS/11; candidate processEvidence3 SHA/read-back in process-proof-refresh-Iv7Was, live=false. Late peer helper b0074eec50: full supervisor25 PASS/138; private static admin12 descriptors/8 hashes, container removed.
18. Offline env/SIGINT/readers/redaction/uncertain-cleanup gates verified. SIGINT grace5ec3e472b7: supervisor26 PASS/143; calibrate955f8fc409+offline home release/reuse39 PASS/306. Judge version cancellation/early rejudge SIGINT:117 PASS/661, typecheck/diff PASS; other Loginom probe owners open. Cleanup audit late-peer-red-cleanup.json600 read-back, own RED root removed/signals0.
19. Resources: frozen scope119e1f24f3 + retained native process source→full lifetime/coordinator;80 PASS/570 (40.10s), typecheck/diff PASS. Semantic SHA/owner/producer/ready/final00 qualification shared with judge; actual collector1000ms, N=1 A proof positive/N=2 missing B incomplete. Next: full actor/attempt inventory, required thresholds/quotas, production binding and limits producers; full/live gates open.
20. 2026-10-16: archive f275e7c182/133885511f/08c78cc863 committed; Docker3/50 PASS171.99s. Native2203 old-baseline timeout before RED remains unproven, private source/actor/cold recovery-only archive+fresh admin/SDK evidence retained; own fixture retired audit708c23f4… (normalRelease=false). Focused archive RED e1831FAIL/11/162.53s → finalizer v3 GREENd9a1bf27…1PASS/32/187.16s; audit7a2b69e7…80 refs/9 regular+binary/symlink/NUL/SQLite,23pins/20snapshots, own3 IDs/root absent. Related15/166 PASS63.16s/typecheck/diff. New caller code+test not yet committed; FD/topology1f474d72…1/43 PASS214.58s/audit7da6f7bf…90refs + literal-negative9c4a10dc…; own3 IDs/root absent. Browser regression handle80588/evidence721dbb5b… running at240s;13 temporary duplicates preserved/removed. Do not edit pinned sources while native handle live. Full cleanup/SessionBackup/licence/resources/OAuth/judge/LLM N2→N1/node/recovery/admission remain open/both grants false. Foreign typo/review and older incidents preserved.
<!-- original-end docs/superpowers/plans/2026-10-13-evals-parallel-users.md -->

<!-- original-begin evals/docs/parallel-users-contract.md sha256=6bd7a3460f7a5eb5113b74c4ebca2ab88a2de2777b004e7f6b3604201cc28761 -->
# Контракт параллельных evals по пользователям

Принят 2026-10-13. Реализация выполняется по [плану](../../docs/superpowers/plans/2026-10-13-evals-parallel-users.md)
и [дизайну](../../docs/plans/2026-10-11-evals-parallel-design.md). Этот контракт
нормативен до изменения кода; наличие документа не подтверждает готовность v2.
Private CleanupReceipt включает leaseToken/serverEpoch: release сверяет их с
текущим SlotLease; close только освобождает OS guards, сохраняя reservations.
`recoverSlotLease` принимает исходный slot manifest только через текущую проверенную
lineage и CAS каждого user/profile resource. Его `recoveryOnly=true` запрещает
новое provisioning и probe admission. Незавершённый recovery сохраняет reservations;
повтор от исходного incident возможен после подтверждённого выхода владельца.
Это primitive владения: публичная recovery-команда и terminal cleanup ещё открыты.
Фактические проверки и ограничения записываются в [runbook](../../docs/testing/loginom-ai-agent/parallel-evals.md).

Resource sampler хранит неизвестные host/cgroup/container counters как null.
Docker primitive использует immutable full ID и фиксированный local Unix socket;
исходный stats body сохраняется вместе с проекцией counters. Его bounded-container
smoke не подтверждает live Loginom/resource acceptance. CLI связывает Server/Studio
с private ready pair journal и повторно проверяет selected inspect identity/owner
labels перед проекцией counters; Config.Env не читается. Missing journal означает
неизвестный scope, invalid journal запрещает output. Полнота owned-process/cgroup
coverage и итоговый live acceptance gate ещё требуют квалификации.
CLI закрывает raw JSONL перед exclusive private summary с source SHA,
min/peak/delta и missing/reset counts; исходные frames сохраняются. Summary
разделяет container epochs/process births и не складывает shared ancestors;
наличие summary не доказывает полноту наблюдений или успешную приёмку.
Для CPU-бюджета `host/cpu.utilization_percent` использует приращения первых
восьми `/proc/stat` counters, исключая idle/iowait; отдельные guest counters
повторно не складываются. `container:<ID>:<startedAt>/cpu.cores` — приращение
Docker CPU nanoseconds на интервал его `read` timestamps, без нормализации по
quota/online CPUs. `cpu.read_at` сверяется с тем же raw Docker snapshot/counter;
оба timestamps должны попадать в соответствующие measured frames. Пропуск,
сброс, неизвестный/повторный clock или смена epoch дают missing, а не нулевую
нагрузку. Наблюдённое превышение бюджета имеет приоритет над неполнотой других
интервалов. Старые receipts без derived rates проверяются и пересчитываются из
raw bytes без переписывания; отсутствие container read clock не даёт CPU credit.
Смысл полей и возможность уменьшения iowait описаны в
[документации ядра](https://docs.kernel.org/filesystems/proc.html#miscellaneous-kernel-statistics-in-proc-stat).
Readonly receipt verification получает expected source path/run/phase от
controller, сверяет private source bytes/SHA и пересчитывает summary;
изменённый receipt не выбирает произвольный source и не изменяет raw evidence.
readResourceEvidence возвращает receipt и validated raw samples из одного
проверенного чтения; readResourceSummary сохраняет прежний формат ответа.
Temporal policy требует ordered samples с неизменным interval и monotonic elapsed,
без missed intervals или whole gaps; observed timestamps охватывают dispatch до
подтверждённого cleanup. Неизвестные clocks или неполное окно дают incomplete.
Actual one-second owned-command smoke проверен; frozen manifest/coordinator
и coverage всех actor lifetimes ещё требуют реализации.
assessProcessResourceTimeline требует наблюдение exact owner/launcher birth с
verified RSS/CPU в каждом frame внутри указанного окна, а также bracket/cadence.
Missing scope или окно без наблюдений дают incomplete. Проверены два настоящих
supervisor owner в измеренном active subwindow. ProcessCleanup.lifetime сохраняет
producer PID, owner и exact launcher identity, timestamp перед spawn и timestamp
actual launcher exit; отсутствие dispatch не создаёт lifetime, unknown exit=null.
Новый process-cleanup.json создаётся0600 и file fsync, interrupted lifetime также
сохраняется. Actual complete dispatch-to-exit window проверен через collector1000ms,
summary и coordinator; receipt alone не выдаёт cleanup/recovery authority.
Coordinator принимает processWindows и требует ровно одно окно
для каждого уникального owner/birth из coverage; пропуск, подмена или дубль дают
incomplete. Пустой declared owner inventory допустим только для component smoke;
обязательный production inventory определяется отдельным manifest.
checkResourceEvidence читает единый verified bundle и возвращает поимённые
timeline/coverage/processTimeline/cgroups/budget/incidents checks с source SHA. Known failed check имеет
приоритет над incomplete; source-integrity errors запрещают результат.
Это проверка declared resource scopes, не полный live admission: mandatory
frozen manifest и licence/limit/lifetime gates проверяются отдельно.
OOM gate отвергает рост memory_events.oom/oom_kill или Docker oom_killed=true;
memory_events series дополнительно сохраняют counter_increases, чтобы поздний
reset не стирал известное событие. Reset/gap/single observation либо unknown
Docker boolean дают incomplete. Applicability/полностью unknown counters остаются
предметом cgroup coverage. Historical summary без этого optional derived field
проверяется по прежним полям; новый результат пересчитывается из raw source,
старые файлы сохраняются. Подменённое присутствующее поле отвергается.
freezeResourceBudget фиксирует declared bounds в новом private/fsynced файле
с run_id/automatic fixed_at и возвращает SHA. Контроллер сохраняет этот SHA до
dispatch; readFrozenResourceBudget после run сверяет исходные bytes, private
metadata, run и fixed_at строго до startedAt. checkResourceEvidence принимает
budget file+captured SHA либо null (incomplete), сохраняя budget_source в result.
Файл не перезаписывается; изменение caller bounds не меняет frozen snapshot.
Этот механизм ещё не выбирает live thresholds и не заменяет mandatory manifest.
sampleServerFilesystems читает только fixed UserStorage/SessionBackup capacity
в подтверждённом Server container: exact ID/image/name/owner labels и running
PID/startedAt проверяются вокруг read-only stat probe. CLI environment PATH-only,
stat environment очищен; неизвестный root даёт null, healthy root сохраняется.
Host filesystem не подставляется. Primitive проверен на bounded pinned image
с tmpfs/sentinel; summary/coverage и live admission ещё не wired.
Periodic collector сохраняет independent storage snapshot в Server frame,
Studio storage=null. Source schema проверяет metadata/capacity types и сохраняет
nullable unknown; повреждённый storage не получает summary output. Sub-snapshot
может наблюдать иной epoch, поэтому shared serverStorageBinding сверяет ID,
image/name/startedAt/PID/owner kind/nonce/purpose и оба stable running flags
до numeric credit. Incomplete identity не считается matching.
Reducer хранит separate container/epoch/filesystem series; coverage требует
ровно один UserStorage и SessionBackup с полными byte/inode counts. Known
mismatch даёт failed, unavailable/missing/duplicate roots — incomplete.
Historical summary без новых derived filesystem series читается без изменения
файла; returned result пересчитывается из raw source. Подмена present series
отвергается. Full manifest/lifetime/live gates этим не квалифицируются.

readResourceProcessWindows получает captured private source references и
возвращает dispatch→exit windows после semantic SHA/owner/producer/continuous
closed-proof qualification. Общий validator используется и judge inventory;
launcher.ready=false отвергается. Coordinator с processProofs использует эти
окна, проверяет producer PID в каждом active frame и сохраняет source references.
С frozen manifest требуется native proof каждого выбранного slot ID; отсутствие
proof B при N=2 даёт incomplete. Это минимум выбранных slots, полный inventory
всех attempts/admin/management/judge actors требует runtime journal integration.
With a frozen manifest, every supervisor scope actually present in the raw samples
requires a source-qualified process window with exact producer PID, owner kind/id
and launcher PID/starttime. Omitting an observed judge/admin/management actor from
both declared coverage and proofs now gives RESOURCE_OBSERVED_PROCESS_PROOFS_INCOMPLETE.
The real two-supervisor control first returned a false PASS, then incomplete after
the guard; including both proofs passes (target1/12,5.14s). Related86 tests/605
assertions PASS21.45s with runner --timeout30000; the default run had85 PASS and
one5s manifest-test timeout. Isolated unchanged manifest control passed93
assertions in4.78s. That control has at least77 explicit sync operations on the
full path; precise stall stage/cause was not measured. Production deadlines,
internal cadence/frame deadlines, fsync and assertions are unchanged. Typecheck
and diff checks passed. This does not detect
an entire actor lifetime between samples; the runtime journal integration remains
mandatory for full inventory. Component declared-only checks keep their scope.
Readonly qualification не выдаёт signal/delete/recovery grants.

Resource scope manifest фиксируется через freezeResourceManifest до dispatch:
первые N canonical slots, все controller/profile/work/history paths, обе
container role/ID/image/epoch/ownership identities, cgroup view, cadence1000ms и
source SHA ранее сохранённого бюджета. Private exclusive/fsynced документ
содержит только разрешённые metadata. readFrozenResourceManifest сверяет
schema/run/time/hash и budget source. checkResourceEvidence с manifest берёт
paths/containers/view/budget из него; inline caller не сокращает required scopes.
Freeze и повторное чтение manifest требуют явные статические пороги: максимум
host CPU (0 < maximum ≤ 100), минимум available RAM и swap, максимумы CPU cores
и current RAM каждой container generation, минимумы bytes/inodes каждого
выбранного host path и обоих server storage roots. RAM/disk headroom положительный;
swap minimum=0 допустим для системы без swap. Порог с неправильным направлением,
пропущенным scope или другой epoch не заменяет требуемый bound. Неполный бюджет
даёт RESOURCE_BUDGET_SCOPES_INCOMPLETE до публикации manifest. Эти проверки не
выбирают live значения и не заменяют budgets/limits динамических actors/cgroups.
Это frozen resource contract: input container metadata требуют независимой
runtime qualification, полный actor inventory/thresholds/quotas и production
binding ещё открыты. Полный immutable live manifest включает также pins и другие
acceptance prerequisites, перечисленные в плане. Без manifest component API
остаётся declared-only и не доказывает live admission.

## Конфигурация и граница режимов

Без `EVAL_SLOTS_FILE` действует legacy singleton с marker v1 и эксклюзивным
endpoint. С файлом версии 2 `--parallel N` выбирает первые N слотов, default 1.
Все записи файла проверяются до dispatch: уникальные id/username, безопасные
logins, абсолютные непересекающиеся canonical profile/workspace/history roots,
отдельные controller/admin/auth/judge/install paths. N больше числа слотов,
v1-файл, N>1 без файла и неисправный выбранный слот запрещают допуск.

V2 использует один выделенный Server и общую Studio, отдельного Loginom user
на слот и независимые профили/историю. Поля slots v2 и публичные интерфейсы
зафиксированы в разделе 2 плана. В JSON нет паролей. `--keep-storage` и
`--reset-profile` в v2 запрещены; восстановление адресно через recover.
N>1 запрещён для judge-only/calibrate и с `EVAL_NODE_OPS_CONFIG`,
`EVAL_NODE_STAND_LEASE`, `EVAL_HARNESS_LEASE_RECEIPT` до чтения private config,
создания run directory и других побочных действий.

На новом сервере существует только `/workdir/.loginom-evals-isolated.json`
с `kind: loginom-evals-users`, `version: 2`, полным container ID и owned inventory.
Старый `checkIsolatedStorage` обязан отвергнуть его. Совместимый marker v1 рядом
не создаётся; старые broad-cleanup executors на этой паре запрещены. Dev/legacy
контейнеры, исторические results и pins начатых серий сохраняются.

## Владение и самостоятельные команды

Host-global root — `/var/lib/loginom-evals/locks`, private 0700, owner текущий
пользователь. Разовый bootstrap владельца описан в плане; prepare только
проверяет его и не вызывает sudo. CLI не принимает env/config override root;
публичные lock-функции принимают root параметром, тесты используют temp.
`controller.stateDir` — private журнал, не альтернативное место глобальных locks.

OS guards — exclusive flock на постоянных файлах, CLOEXEC, единый порядок keys.
Server key использует полный container ID; user key — ID и точный login/kind;
profile и judge keys — canonical paths. Server generation и stateDir не входят
в обходной ключ. Разные stateDir/servers конфликтуют по общим profile/judge keys.
Guard автоматически освобождается после crash, durable reservation сохраняется.
Reservation содержит token/revision, command/run/slot, boot ID, PID/starttime,
server generation, inventory и canonical journal; записывается до side effects.
Исчезновение PID и timeout не разрешают stale takeover.

- `status`: чтение snapshots без входа в Loginom, takeover и admission.
- Standalone `prepare`/`verify`: acquire, проверка, завершение собственных
  probe/management/admin sessions и процессов, evidence и durable released,
  затем закрытие guards. Verify не исправляет конфигурацию. Readiness receipt
  не резервирует среду; следующий run заново приобретает владение и admission.
- `run`: сохраняет владение между подготовкой и dispatch; выпускает чистые
  user/profile reservations независимо от исхода других слотов. Server fence
  остаётся unresolved до завершения всех retained слотов и admin finalization;
  judge-home выпускается после завершения всех собственных judge processes.
- `recover --slot --incident`: BUSY при живом controller; при crash — те же
  guards, проверка всей lineage и актуального owner по boot ID/PID/starttime,
  CAS ожидаемых token/revision в новый recovery-only epoch. Потерянный журнал,
  чужая lineage или старый CAS запрещают takeover. Recovery не разрешает
  dispatch/delete без новых proofs. Повтор после crash самой recovery сверяет
  актуальную цепочку. Released слот не очищается повторно; общие retained
  ресурсы incident завершаются отдельно. Чужое новое владение не принимается.

## Сессии, архив и очистка

Controller владеет одним trusted административным browser context/run и
сериализует мутации; слоты не получают admin handles/credentials. Все соединения
setup/check/runtime/recovery, включая pending disconnect, учитываются в journal.
`summary.session_id` относится к агенту, не к Loginom session.
Server epoch — versioned hash full ID/StartedAt/host boot ID/daemon PID/starttime;
reconnect browser не подменяет эпоху daemon.

Managed row не имеет доказанного Guid/UserID. Close разрешён только после
квалификации сопоставления epoch + leased username + exact Name/CreateTime
со свежим proxy и отрицательными race tests. Display name/префикс и
PendingDisconnect недостаточны; `activeOperations:null` не означает ноль.
Невозможность доказать identity даёт `SESSION_IDENTITY_UNSUPPORTED`, карантин
и сохранение файлов. Capability adapter подтверждается задачей 2 на research pair.

Обязательный порядок: завершить собственные локальные writers/management →
сохранить artifact/results и durable архив history/БД/WAL/SHM/inputs с hashes →
закрыть все доказанно собственные server sessions → readback прекращения операций
и locks → удалить только свой user root/доказанные backups → inventory/readback →
durable release. Browser exit/CloseSession response/пустая папка не заменяют
closure proof. Имена файлов, hidden/вложенные файлы и `.autosave` не ограничены
regex login; обход NUL-safe и не следует symlinks. Общая очистка UserStorage и
SessionBackup и restart сервера для восстановления слота запрещены.

SessionBackup gate требует непустого положительного опыта: либо доказанная
адресность owner/session/epoch и cleanup A с сохранением B, либо поддержанное
безопасное отключение, проверенное при crash/recovery. Неизвестный общий backup
запрещает новый dispatch всего run. Неопределённый cleanup сохраняет данные,
evidence и соответствующие reservations; здоровые слоты продолжают, если их
безопасность доказана. Новый loginom check после deletion до admission запрещён.

## Исходы и совместимость

Admission failure до первой попытки: exit 2, безопасный preparation receipt
без measured summary. Карантин после dispatch: summary, stopped_reason, exit 1.
Первый SIGINT прекращает dispatch/retry, прерывает agent/judge и ожидает cleanup;
безопасная пользовательская остановка даёт exit 0. Второй SIGINT — exit 130,
без гарантии summary, незавершённые reservations сохраняются.

Очередь общая, round-major, без барьера кругов; слот занят до конца cleanup.
Infra retry один, после cleanup на том же слоте, заменяет результат по job index;
quality FAIL не повторяется. Неназначенные jobs не получают измерений.
Судья выполняется под одним run-local mutex и host-global canonical CODEX_HOME
lease; abort ожидания не меняет уже измеренный исход агента.
Offline controller сохраняет selected/allocated run directory в private журнале
до evaluation judge; calibrate/rejudge ждут эту запись. При result/release-proof
persistence exception карантин сохраняет locator, reservation остаётся retained
и следующий запуск запрещён. Preflight/version probes могут предшествовать
allocation. Offline command journal содержит private processInventory: version
probes и evaluation judge публикуют planned owner с commandId до dispatch под
assertHeld, затем confirmed/unconfirmed с отдельным fsynced proof snapshot.
Hash proof вычисляется от JSON.stringify(parsed proof); сам inventory ещё не
выдаёт recovery authority. Snapshot предыдущей команды сохраняется после rejudge.
Runtime processEvidence исключён из saved config. readJudgeProcessInventory
проверяет private root/source, exact command/producer/owner, snapshot path/hash,
continuous capture с observations, valid launcher/process births и две ordered
empty verification после actual exit. Unknown/planned/changed proof отвергается;
это readonly закрытых snapshots, не release authority. Текущая liveness,
active-crash lineage/полнота inventory и explicit recovery ещё требуются.
recoverOfflineJudge для offline home получает recovery-only CAS по captured
token/revision/incident lineage, квалифицирует closed inventory исходного owner
и проверяет current PID/birth при том же boot. Unknown/planned/live запрещают
release; функция не посылает signals и не удаляет files. Confirmed private proof
освобождает reservation, results сохраняются. Terminal marker позволяет readonly
replay после нового run без stale CAS. Active-child reconciliation остаётся открытым.
Released reservation без terminal marker согласуется по validated reservation
lineage и captured releaseEvidence SHA: обновляются только старые journals,
повторный CAS не выполняется. Пока finalization не подтверждён, acquireJudgeLease
под OS guard запрещает новый owner до probes и сохраняет tombstone. Изменённый
release proof не обходит gate сменой reason. Fixture воспроизводит persisted
release с прежними quarantine/intent journals. Offline CLI:
`bun run script/parallel-env.ts recover --config <slots.json> --incident <judge-command/journal.json> --out <new-private-dir>`.
Команда выводит только status/journal/proof и сохраняет private receipt; выбирает
актуальный CAS через original incident lineage, без token/revision в argv.
Global lock root фиксирован; out требует canonical parent700 и новый каталог700,
пересечения с protected roots запрещены. Эта offline-ветка принимает command
incidents с qualified closed proofs. Общая команда также принимает ограниченные
pre-CLI unactivated preparation incidents по отдельному контракту lineage и
finalization ниже. Readonly status и blocked prepare/verify реализованы;
active eval-slot/admin recovery, readiness и production dispatch ещё открыты.

Score/oracle/denominator/compare не меняются. Новые runs добавляют optional
`config.parallel`, `attempt.slot_id` (также initial retry) и `slots`; legacy
singleton получает `default`, старые файлы читаются как N=1 без переписывания.
При N>1 общие profileDir/username/storageDir и summary storage_dir — null.
Storage leftovers — null при неизвестном листинге; иначе при N>1 строки
`slot=<id>;path=<JSON-encoded relative path>`, при N=1 прежний формат.
Node-evals выбирает закрытый архив по доверенному slot_id; неизвестный ID
даёт ошибку без fallback. Compare/rejudge/judge-only сохраняют metadata offline.
`interrupted_cleanup` — `{recovered: boolean} | null`: null без interrupted
попыток, иначе OR profile_recovered только interrupted попыток. Recovery обычной
попытки не меняет поле; оно не является доказательством безопасного cleanup.

## Авторизация и приёмка

Admin credentials/cookies/private journals вне mounts/env/results агента и
судьи. Bubblewrap, installed-binary admission, process identity и запрет внешнего
CDP/inspector сохраняются. Shared model OAuth RW-store — отдельное исключение,
не копия токенов по слотам. Judge использует private CODEX_HOME, не Desktop home;
при skip-judge/code-only его auth/lease не нужны. OAuth-кандидат — продуктовая
зависимость; собственные адаптации остаются в evals отдельными коммитами.

Known-output masking (2026-10-15): `runAgent` передаёт только явно разрешённые
`cleanupSecrets` в supervisor. До записи stdout JSONL маскируются строковые
значения, stderr фильтруется по байтам с сохранением границ chunks/UTF-8;
учитываются literal, URI и JSON-escaped варианты. Незавершённый/malformed JSON
задерживается до EOF, глубокие диагностические значения после 40 уровней
заменяются `[omitted]`. Parsed free-form поля и stderr маскируются до усечения
квитанций/20 строк. Измеренные counters/cost/429 классифицируются по исходному
потоку; process cleanup proofs не переписываются. Проверка не читает auth store
или credentials неактивных слотов. Полный native сбор секретов активных слотов
и admin остаётся отдельным незавершённым gate.

Operational binding regression (2026-10-15): `148d40e4de` применял masking ко всем
parsed strings; короткий synthetic credential совпал с частью публичного SDK
session ID, и `[redacted]` сделал archive ID недопустимым. Existing text-import
runner отказал стабильно 3/3. `AgentRun` сохраняет исходные session/artifact paths,
revision и manifest hash для fetch/archive/readers, маскирует finalText,
errors/errorTexts, node receipts и tools.error. Public binding RED→GREEN и
исходный runner GREEN; полная связанная CLI/run/node/calibrate/diagnostics проверка
87 PASS/592 (189.32s), typecheck/diff PASS. Private output-composition-ca741207
audit SHA cf6d0929aff36faa062308901fb562e02c6563df3b32905dcac978b6b20ef0d0
содержит первоначальный 109 PASS/1 FAIL и 3 stable воспроизведения; полный package
regression и native admission этим не подтверждены.

Fixture output policy (2026-10-15): каждый active slot command получает configured
Loginom/Dock/provider `cleanupSecrets`, включая diagnostic archive path. Public
main N=2 RED раскрыл raw stderr; итоговый GREEN1/8 (17.46s) проверил оба закрытых
слота и все run files. Canary inputs остаются в private fake controller state,
в task inputs не добавляются; admin/inactive credentials не читаются. Native
active/admin collection остаётся открытым. Node wrapper help, strict parser и
programmatic --parallel уже реализованы и подтверждены8 node-runner cases внутри
composed87-test набора; source реализации не менялся при этой сверке.

Snapshot copy masking (2026-10-15): `redact(config)` также маскирует known
Loginom/Dock/provider значения, повторённые в других строковых config fields,
включая URI variants в URLs. Password/apiKey markers сохраняются; runtime config
не изменяется. Public RED→GREEN2/14, общий run/calibrate caller и composed87/592
PASS, typecheck/diff PASS. Private controller config не добавлен в snapshot.

Новые eval-прогоны: агент `openai/gpt-6-luna/high`, судья `gpt-6-sol/xhigh`.
Приёмка на lg-pc-75: новая acceptance pair и отдельная research pair, затем
немодельные ACL/crash/cleanup/supervisor/backup gates, полный LLM N=2 → N=1
с неизменными manifest/pins/tasks/rubric/timeouts, node-evals и legacy readers.
CPU/RAM/диск/лицензия/сессии фиксируются до run и наблюдаются во время и после.
OOM/ENOSPC, license denial, rate/quota/429, включая промежуточные retries,
не дают PASS. Skip integration не считается PASS; исторические результаты
и начатые серии не пересуживаются ради прохождения новой приёмки.

### Временный candidate shared OAuth — 2026-10-14

Текущий installed candidate: `eb85403ce41a70be857bf8951ef33ac2b0d8506f`, version `0.0.0-dev-202610140002`, clean source tree `f6dce3ac18b6323c934f69f97e2af26f83713384b084a40c79ea5e53807b828a`. Artifact `candidate-artifact-status`, archive SHA-256 `996f387c526378170e4ad9dca18d0bceb1658a31148badf6e3c33f267b3dcd3f`; build/roundtrip/source+installed verifier PASS. Canonical binary `/home/kiselev/.local/state/loginom-evals/parallel/candidate-home/.local/share/loginom-ai-agent-cli/0.0.0-dev-202610140002-dev/bin/loginom-ai-agent-cli`; binary SHA-256 `0f2836c22e70f5856be33582fd3203d26f929323d982a1b5af5af63fe0ab1e1a`, manifest SHA-256 `e67c5c15fbef5d950bfc463056c6d16e75c40534794ae868cffa9d67cfdea9b5`. Public uninstall/install заменили только собственную installation; previous receipt сохранён как candidate-receipt-04ff82be4d.json, После qualification удалены только собственные superseded candidate-artifact-install-fix и archive/checksum 0.0.0-dev-202610132249; current artifact/archive/installation и previous receipt сохранены. Current private receipt read-back и sandbox helper root:root/04755 PASS. Product adaptation eb85403ce4 задаёт capability probe существующий canonical private root (RED→GREEN, 8 Host tests/31 assertions и typecheck PASS), чтобы cooperating /proc guards могли идентифицировать probe; historical PROFILE_BUSY этим не атрибутирован. Installed schema/protocol smoke: 4 PASS/29 assertions (20.29s), два concurrent bwrap supervisor windows, одинаковая generation/principal metadata и сохранный lock dev:ino, обе cleanup confirmed. Local auth не заменяет shared, uncertain marker и auth bytes сохраняются. Receipt read-back: publicStatus=true и bubblewrapStatus=true; live bubblewrap/liveOAuth/forcedRefresh=false. Использовались только synthetic AuthInfo, провайдерный обмен и модельный run не квалифицированы. Первый отказ STATUS_INVALID был fixture defect: nonempty unmarked profile даёт PROFILE_FORMAT_INVALID (direct 3/3 FAIL); публичная инициализация перед local auth исправила fixture. Writer initialization race отдельно исправлен c183a97e38: RED3/3→GREEN, cold profile/supervisor95 PASS/315 assertions. Mixed /proc PID532038 failure остаётся context-dependent и не атрибутирован. Последующие абзацы сохраняют pins предыдущих этапов, не описывают текущую installation.

`providers list` не подходит для shared admission: credential view скрывает generation и не проверяет uncertain refresh. Минимальная отдельная product-адаптация `87c7d497d64f72f49a70e949f13712e5b383029d` в managed worktree `evals-oauth` добавляет публичный `providers status --provider openai --format json`. Ответ `shared-oauth-status-v1` содержит только status, generation, principal_sha256 и refresh_required; not_ready содержит безопасный code и exit 2. Проверка использует существующий locked snapshot/reconciliation; store/refresh не копируются в harness. Нет fallback на local auth; uncommitted pending marker и auth bytes сохраняются. Source command/store/plugin/profile tests: 26 PASS/124 assertions (113.13s), Agent typecheck PASS. Это отдельный commit после импортов и installer fix, для отдельной upstream поставки; основной checkout не изменён. Установленный ниже candidate 04ff82be4d ещё не содержит status: нужен fresh build/install/verifier и отдельное немодельное protocol/bwrap evidence, а live OAuth остаётся отдельным gate.

Отдельная ветка `evals-oauth`, worktree `/home/kiselev/.codex/worktrees/evals-oauth/loginom-ai-agent`, база `loginom@38ee045e79720d363a35666484f17804162b55a1`. Общий checkout и ветки других агентов не изменялись. Импорт выполнен строго `cherry-pick -x` в указанном порядке; evals-код не добавлен в импортируемые коммиты.

- `dfd2b0df2de6b60f529973f35fcccc59feceef5f` → `ede16ba7f91786a584608a97dac98e57341e33be`.
- `ba919629f966e23670ff0a02720057067adbb040` → `80c3d7a60410b456beae92d9ff2830f0d58ee61c`.
- `bd4951803532db3f51c1b5a66a864038d88865c3` → `c8106ca501178dc1193d0df3e7534cd1a34a9d67`.
- `66f0956bc9f16ee580b20f3cf98e368857048f27` → `37ccccdd0a7f6186e78663421ee7bcfb84afb6a5`.
- `3bcf645a7363b41aed709b985a63758431abeee6` → `694c1d3a4cae1f2529543333502a63ada2689805`.

Единственный конфликт первого переноса: `packages/product/package.json` содержит обе независимые записи exports `./skills` и `./cli-capabilities`. Остальные переносы применились без конфликтов; авто-слияния не заменяют проверки. Последующие адаптации должны оставаться отдельными коммитами, без amend/fixup/squash импортов. Candidate build/install/manifest/bubblewrap/refresh и live qualification ещё не завершены. Existing development CLI, historical results и ранее установленный CLI не заменяются.

Отдельная адаптация после импортов: `04ff82be4dd97284ea2ee92b26598425bd523988` — public installer сохраняет special mode bits после Bun fs.cp, до строгого manifest validation. Failure STABLE 3/3: только chrome-sandbox 04755→0755, SHA-256 не изменён. Public installer RED→GREEN на настоящей FS; 9 installer/manifest/capability tests PASS/69 assertions, Host typecheck PASS. Новая сборка создаётся в `candidate-artifact-install-fix`; прежний artifact не перезаписывается. Эта правка не amend импортов; upstream delivery — отдельный cherry-pick этого commit после интеграции OAuth в loginom и проверки соответствующего installer, без автоматической правки общего checkout. Native macOS acceptance остаётся отдельной.

Проверки prerequisites: Agent 75 PASS/291 assertions (117.00s), Product 8 PASS/31 assertions, runtime connection-check 5 PASS, Agent/Host/Product typecheck PASS. Ошибки первого запуска были setup: root Bun install не устанавливает nested client npm dependencies (yaml import STABLE 3/3), а startup tests требуют LOGINOM_AI_AGENT_TEST_NODE с pinned Node. После npm ci --ignore-scripts и явного Node failures исчезли; source tests не ослаблены. Исходный unnamed failure отдельно не атрибутирован. Live OAuth/forced refresh/bubblewrap и Loginom acceptance этими тестами не квалифицированы.

Установленный candidate 2026-10-14: build/archive roundtrip, source verifier и installed verifier с --shared-oauth PASS. Canonical binary `/home/kiselev/.local/state/loginom-evals/parallel/candidate-home/.local/share/loginom-ai-agent-cli/0.0.0-dev-202610132249-dev/bin/loginom-ai-agent-cli`; binary SHA-256 `a974f9725bfb8080f861ece22efe235909cdff2e3efae5641a78b51b621e8a76`; manifest SHA-256 `d2fb17196d0c443f6aef72cc7cb2927c47ada5f7896d8ce7eaba61232f7c42a3`; source tree SHA-256 `0d2ba922694c593673a2a3efcc6b14fd56bc6630a2a31b193141ecd1267f026b`. Private durable receipt: `/home/kiselev/.local/state/loginom-evals/parallel/candidate-receipt.json` (0600), read-back PASS; chrome-sandbox owner root:root, mode 04755. Новый artifact `candidate-artifact-install-fix`, version `0.0.0-dev-202610132249`; исходный неподходящий installer candidate больше не используется. Host full suite 336 PASS/7 SKIP/2080 assertions (113.75s). Capability/build/install не являются live OAuth, refresh, bwrap или Loginom qualification.

### Process registry tracer — 2026-10-14

Два настоящих superviseProcess делят browser executable. A-unknown helper совпал с B-allowed/subreaper по PID/starttime, RED3/3; Node fixture отдельно меняет видимый /proc cmdline и подтверждает reparent. На baseline supervisor Node tracer FAIL; private process-local registry даёт PASS1/10 assertions: A cleanup confirmed, B heartbeat/birth сохранны, B отдельно cleanup confirmed. Registry доступен только supervisor, labels slot/admin/judge не подменяют ancestry. Для исключения peer требуются fresh live launcher и exact fresh identity его allowed entry; stale/reused/unreadable identities не разрешают исключение. Module regression 22 PASS/109 assertions (111.42s), typecheck/diff PASS. Диагноз: отсутствовала меж-supervisor ownership информация, а не терялась ownership B; baseline 72a9a580f3 воспроизводит Node tracer FAIL (первый introducing commit не устанавливался). Unmanaged native process с внешним data-dir теперь остаётся unknown/живым: RED confirmed→GREEN failed, без signals или owned claim. Positive parallel/profile-conflict и negative unmanaged: 4 PASS/21 assertions, typecheck/diff PASS. Третий admin browser, observation gaps и Chromium/live квалификация ещё открыты.

Timing evidence отдельно хранит monotonic scheduled→actual proc-start delay и actual-start→next-actual-start gap; длительность scan сохранена отдельно. Controlled two-native-child 400ms stall: RED→GREEN1/6, delay>=100ms/gap>=300ms. Broad process/profile/CLI/judge/admin185 PASS/619 assertions (263.01s), typecheck/diff PASS. Это проверка механизма измерений; Chromium и model workload требуют своих receipts.

Native installed preflight обнаружил отдельную несовместимость permission modes: product manifest сохраняет chrome-sandbox04755, harness раньше принимал лишь0777. Validator теперь сравнивает полный07777 mask и отказывает при потере SUID (не нормализует manifest до0755). Real-FS RED→GREEN, 23 preflight PASS/48 assertions, typecheck PASS; observed current candidate helper root:root04755. Первый native gate отказал до dispatch; запуск Chromium проверяется отдельно.

Installed Chromium single nonmodel gate: чистая общая bwrap PID/net boundary, root read-only, собственный private proof root RW. Public verifyAdminRuntime проверил полный installed inventory и manifestHash e67c5c15fbef5d950bfc463056c6d16e75c40534794ae868cffa9d67cfdea9b5. 1 PASS/9 assertions (3.12s), 13 owned processes, 1 binding, unknown=[], final[0,0]; receipt process-proof-H3itV4/single.json read-back PASS, liveQualified=false. Loginom и провайдерных вызовов нет. Этот gate не заменяет три concurrent launcher и настоящий authenticated admin bridge.

Native concurrent process gate (common clean PID/net namespace): A/B/admin-role contexts используют один pinned Chromium. Abort A сохраняет heartbeat и чужие ownership records B/admin; admin-role close/reconnect при живом B и cleanup B при живом replacement подтверждены. 2 PASS/25 assertions (9.44s), четыре13-process receipts confirmed/unknown=[]/final[0,0]. Durable process-proof-H3itV4/parallel.json read-back PASS; max scheduled→actual start6.67ms, gap106.55ms, scan duration9ms. Scope — trusted Node browser process boundary, без Loginom/provider calls, liveQualified=false. Authenticated AdminConnection bridge и LLM нагрузка этим не квалифицированы.

Native RED3/3 имел два независимых симптома: stale candidate key TypeError2/3 после peer resolution; fixture abort stdin вызывал guarded Command stdin delivery failed1/3 при unknown=[]/owned_remaining0. После fresh scan цикл сигналов заново требует ledger entry; исчезнувший peer key не разрешает signal. Fixture перед AbortSignal закрывает private input EOF; failure guards delivery/ownership сохранены. Native GREEN2/25; cold supervisor+parallel48 PASS/279 assertions (231.42s), typecheck/Node --check/diff PASS.

Actual kernel PID reuse qualification: в отдельной PID/user namespace (host IDs проверены отличными) ns_last_pid заставил новый launcher получить прежний PID20. UID/exe device+inode/PGID/SID совпадают, starttime различается; old signalProcess identity отказала в SIGKILL, новое B завершилось exit0/confirmed без stale peer claim. Предыдущий owner retained failed из-за controlled evidence persistence fault. 1 PASS/11 assertions (1.69s), typecheck/diff PASS; pid-reuse.json read-back PASS содержит namespaces/uid map. Менялся только isolated kernel counter, liveQualified=false; production birth guard не менялся.

Current private candidate receipt содержит processEvidence: scope nonmodel-native-browser-and-kernel-pid-reuse-only, liveQualified=false, SHA/paths трёх durable process proofs; read-back PASS. После qualification удалены5 своих superseded native scopes и16 capsules; inode/UID/mode/metadata audit superseded-scopes.json600 сохранён и прочитан обратно. Namespace PIDs с host не сигналились; current candidate, proof JSON, failure logs и private cache сохранены.

Fresh peer refusal: настоящий admitted B переключает PR_SET_DUMPABLE, A получает failed observation и не сигналит B; stale peerProcesses после такого scan очищается. RED stale claim→GREEN1/8, B heartbeat/exit0 сохранён; полный supervisor24 PASS/126 assertions (116.45s), typecheck/diff PASS. Receipt failed не публикует старую peer identity как свежую.

Node evidence selection теперь едина для collector wrapper и standalone validator: requireNodeEvidenceSlot допускает ровно один matching slot; unknown/duplicate и missing table при parallel>1 дают ERROR/2 до first-profile fallback. Standalone failed attempt с unknown slot раньше принимался как measured FAIL/1; RED→GREEN. Legacy summary без новых metadata сохраняет прежний путь. 28 node-evals/evidence/runner PASS/90 assertions (18.77s), typecheck/diff PASS; generic summary не переписывается.

Admin static source inspection (2026-10-14): exact Studio69ce44ac image, собственный created container networknone/read-only/capdropALL без start/ports, только public Apache htdocs. Private admin-source-4905babb/rpc-inventory.json600 read-back содержит12 interfaces/8 source hashes. Подтверждены Session.Guid, bg.objectId selector gettermethod5, UI key по cached object ID и CloseSession с observed SessionInfo proxy/timeout; users Add/Delete/SetPassword/role flags, shared Permissions.Add/Delete. CLI session GUID и managed object ID пока разные неквалифицированные domains; не приравнивать их и не закрывать по Name/CreateTime. Real correlation/epoch/reconnect/close-readback ждут Loginom qualification. Собственный контейнер b06bfcdea62b… удалён после fresh ownership/state checks, никогда не стартовал; private sources сохранены. Dev/legacy containers и credentials не использовались.

Current-code process proof set обновлён после fresh-peer failure guard: native2 PASS/25 (8.98s), отдельный kernel PID reuse1 PASS/11 (1.69s), без зачёта integration skip. Candidate receipt processEvidence теперь содержит tested harness31f8392608 и SHA/paths process-proof-refresh-Iv7Was/{single,parallel,pid-reuse}.json, read-back PASS/liveQualified=false. Public/shared model product pins сохранены. Прежние timing numbers относятся к предыдущим наблюдениям; для текущего кода использовать этот proof set.


parseEvents сохраняет safe limitEvidence для visible APIError.data.statusCode429;
raw message/responseBody исключены из этого metadata. runAgent сохраняет его в
run.json вместе с прежними исходными полями. Поздний ответ/exit0 не стирает
known event; assessParallelLimits возвращает failed. Headless JSON не даёт полной
transport/retry visibility, coverage остаётся unavailable и без события даёт
incomplete. Этот producer не доказывает отсутствие hidden limits.

Measured AttemptResult теперь сохраняет optional `limit_evidence`, включая
исходный infra retry и failure checkpoint. `summary.parallel_limits` оценивает
все actual runs, включая interrupted; missing/partial coverage остаётся
incomplete, известный visible429 остаётся failed после успешного retry. Report
показывает эту проверку отдельно; quality/status/cost/exit code сохраняются,
judge-only сохраняет original metadata. Legacy summaries не мигрируются.
TDD actual fake-child retry и report warning RED→GREEN; final retry2/22 PASS,
report/compare/policy108/436 и run/rejudge43/334 PASS, extended rejudge1/16 PASS,
typecheck PASS. Private limit-aggregate-198c93eb... verification SHA
ebcee9a1b425adc590b523fee6acaa4eda09e252df1286448c979aab70890e1f. Эти
нормализованные наблюдения не доказывают full transport coverage/live admission.


Native admin inspect сохраняет private session-observations.json при
qualification=false: exact ServerIdentity, собственный Session GUID/proxy ID,
managed row IDs, pendingDisconnect/packageCount, observed creation time либо
null. Whitelist исключает дополнительные поля. GetObjectId вызывается после
await Session; cached ID не считается обязательным prior state. Прямого
GUID/proxy↔managed-ID соответствия пока нет; public inspect сохраняет отказ
SESSION_IDENTITY_UNSUPPORTED. Observations не выдаёт close/delete authority.

Поддержанный own Session→IBGManagedSessionInfo scope lookup возвращает null на
research; observations сохраняет managedObjectId:null. Обычный Session proxy ID
не подставляется вместо неизвестного managed ID. Это один отрицательный control,
не доказательство отсутствия других supported способов linkage.

Обратный managed row→IBGCustomDeductorServerSession scope lookup также вернул
null для всех observed rows на research. Row sessionGuid:null сохраняет
недоступность linkage; username/proxy ID не используются вместо неизвестного
GUID и не разрешают close/delete.

Read-only ownSession observations сохраняет проверенные boolean IsAdmin и
IsDesigner отдельно. Bootstrap research account фактически IsAdmin=true,
IsDesigner=false; наличие административной роли не подтверждает возможность
создать пакет. Пакетный linkage probe требует подготовленного design user;
bootstrap rights не изменяются для такого опыта. Экспериментального probe-session
в production allowlist нет. Эти flags не заменяют session ownership proof.

User read-back использует Session.GetUsers(), GetEnumerator(dukUser=1),
MoveNext/Current и штатный awaited cast к IBGDeductorUser. Enumerator освобождается
через ReleaseObject, как в Studio AdminUtils. Observations сохраняет только
objectId, exact Name, UserKind=0 и boolean IsAdmin/IsDesigner/IsViewer/Blocked/
UseGlobalFileStorage/SchedulerFullAccess. Собственный CurrentUser записывается
по exact username и object ID; actual enumerated row совпал с ним (4 users,
один exact match). Это readonly capability, не доказательство стабильности ID
между contexts, account ownership, AuthMode/password или effective group ACL.

Shared-directory read-back использует GetSharedDirectories/GetEnumerator и
Permissions.GetEnumerator с MoveNext/Current; оба уровня enumerators освобождаются.
Private whitelist: directory objectId/name, grant principal objectId/name/UserKind
(0 user, 1 group, 2 standard group). Research actual snapshot содержит две shared
directories и по одному grant Everyone/UserKind=2. Read-only enumeration не
подтверждает write semantics, возможность Delete/Add, удаление этих grants или
effective isolation. До допуска design user нужны scoped mutation/read-back
под guards и реальные negative access tests. Session qualification остаётся false.

User mutation принимает SlotLease, не отдельный SlotDefinition. До command intent
readUserPreparation проверяет held guards, configured slot/canonical credential
path, durable staged nonce/endpoint/identity и credential SHA; secret не
создаётся и не восстанавливается reader. После ожидания очереди проверка
повторяется перед dispatch; изменение staged metadata запрещает RPC. Payload
связывает slot, private credential path, preparation nonce и desired/secret SHA.
Закрытый lease в actual native bridge даёт LEASE_NOT_HELD без reconcile-user
в journal. Это preflight gate; реальный account create/update/ACL/unblock и
неизменность секретных байтов внутри driver перед mutation ещё требуют реализации.

Native wire reconcile-user phase blocked проверяет private credential SHA до
dispatch и all-kind name collision, затем Add/Blocked/getter read-back. Supplied
owner observation содержит exact name/UserKind/objectId/preparationNonce; repeat
принимает только уже blocked account. Unknown после Add сохраняет uncertainty.
Перед Add enumerator освобождается немедленно через ReleaseObject(..., true):
deferred disposal оставлял read lock и приводил к timeout. Ready phase и parent
ownership manifest пока закрыты; native capability proof не является admission.

Wire configure phase для supplied owner требует Blocked=true. Local AuthMode,
password при смене режима/SHA и design flags меняются последовательно; getter
read-back подтверждает IsAdmin/IsViewer/UseGlobalFileStorage/SchedulerFullAccess/AllowPublish=false,
IsDesigner=true и uamLocal=1. Blocked сохраняется. Unchanged local credential
не вызывает AuthMode/password setters (native call-site telemetry). Все inspect
enumerators освобождаются immediate: read-only inspect не оставляет read lock
перед следующей mutation. Parent должен подтвердить protected ownership и idle
closure до применения к ранее activated account; один Blocked getter этого
не доказывает. ACL/unblock/admission пока не квалифицированы.

Wire acl phase читает все shared dirs и grants, сверяет полный normalized
expectedPolicy до Delete и снимает только Everyone/UserKind2 и exact own
name/UserKind0/objectId grants. Same-name own principal с другим ID даёт отказ
до mutation. Оба enumerators освобождаются immediate до записи. После Delete
read-back должен точно совпасть с исходной policy без выбранных grants; чужие
grants сохраняются. На disposable pair фактически сняты2 Everyone grants,
shortened policy refused и второй вызов removed0. Это native capability:
parent global configuration guard/ownership и effective negative access proof
ещё обязательны; account остаётся blocked, ACL phase его не активирует.

claimUserOwnership публикует exclusive private user-<slot>.json под held lease.
Источник — confirmed reconcile-user creation journal внутри controller state:
id/filename, exact identity, desired payload SHA и reply SHA должны совпасть.
Claim связывает staged generation, exact Name/UserKind, controller userKey и
наблюдённый native objectId; objectId не объявляется immutable account ID.
Повтор сохраняет inode; иной claim не перезаписывается. readUserOwnership
перепроверяет source semantic SHA и reconstruction исходного creation reply,
staged credential binding и held lease. Эти fs/evidence codec проверки ещё
не являются full native parent integration или подтверждением current idle.

`verifyParallelPair(file, expectedIdentity)` читает существующий private ready
pair journal, проверяет daemon ID, полные resource IDs/labels/names, pinned
images, topology/no mounts/restart policy, marker v2 и canonical inventory,
Python-disabled XML, DNS/proxy/served wsproxy и текущий ServerIdentity.
Journal повторно проверяется после наблюдений; функция не создаёт/изменяет
контейнеры или state. Parent reconcile-user вызывает guard до command intent
и dispatch. Missing journal отказал до RPC на held native preparation.

Native factory fixture проверил healthy read-only round trip, stale epoch,
marker с `../` и Python-enabled refusal, восстановление исходных bytes и
неизменность dev пары:12 PASS/76 assertions (28.55s). Native parent gate:
1 PASS/3 assertions (6.48s); связанные codecs/preflight54 PASS/148 (6.75s),
typecheck/diff PASS. Это infrastructure/config guard; server-run fence,
protected user inventory publication и effective ACL/idle proof остаются
обязательными отдельными границами перед полным prepare/admission.

Wire activate phase принимает exact owner/credential hash и полный expected
shared-directory snapshot. До снятия Blocked проверяет local auth, design
flags, запрет publish/admin/global storage/scheduler и отсутствие всех shared
grants; policy drift/unknown не получает mutation. После setter проверяет
account identity/Blocked=false и policy снова. Повтор не вызывает setter.
Это ограниченная capability для немодельного research probe; parent ready
reconcile/prepare/dispatch пока не вызывает её. Effective negative ACL, physical
root marker и session/backup lifecycle остаются открытыми. Native disposable
fixture: activation/reuse PASS, existing Everyone и missing configured secret
SHA отказали;43 assertions/21.69s, typecheck/diff PASS.

Fixed wire session-probe допущен только для exact active configured account и
проверенной пустой shared policy. Отдельный context того же supervised native
browser логинится как design user, читает CurrentUser/Session.Guid/proxy ID,
создаёт/закрывает ровно один пакет штатными RPC; admin manager snapshots
сохраняют before/opened/withPackage/afterPackage. В native fixture единственная
новая row удержала objectId/Name/CreateTime при Count 0→1→0. Whitelist
наблюдения сохранены private; qualification=false до negative close/reconnect
и durable ledger. Общий inspect/parent close не выдают authority по этому
research observation автоматически.

Native fixed probe теперь сохраняет afterDisconnect и volatile binding keyed
по command proofId. Ограниченный close-session read-back принимает только exact
binding; fresh account ID/epoch/manager inventory должны подтвердить отсутствие
известной сессии и по observed ID, и по Name/CreateTime после writer context
closure. Ответ observed_absent отличает этот путь от исполнения CloseSession.
Foreign/missing proof и changed tuple отвергаются. Retained row остаётся
unsupported до отдельной native mutation qualification. In-memory map не
заменяет durable ledger/recovery и не выдаёт общей readiness.

Physical pair marker проверяется как regular non-symlink file до cat/JSON
validation. Native symlink с тем же допустимым содержимым отказал PAIR_MARKER;
fixture восстановила исходный marker до own pair destroy.12 pair tests
PASS/77 assertions (26.74s), typecheck/diff PASS. Это не публикация user root
и не квалификация остальных POSIX metadata/links.

Known fixed-probe retained session закрывается только через fresh matching
proxy при unchanged account ID/epoch/Name/CreateTime, Count0 и
PendingDisconnect=true после writer context closure. manager.CloseSession
ack сопровождается fresh absence до прежнего deadline; uncertain write
остаётся unknown. Disposition rpc_closed отличается от observed_absent.
Fixed session-crash-probe suppresses только собственный client onpagehide
logout для native fault injection; CLI SIGKILL этим не квалифицирован.
Native retained-row name/time refusal и actual RPC+repeat verified:
60 admin/native/codec/preflight PASS/271 (77.49s), typecheck/diff PASS.
Volatile binding не даёт authority после нового admin context/recovery.

Activation lifecycle fence (2026-10-15): stageUserActivation под held lease
связывает private/fsynced activation-<slot>.json с preparation generation,
credential SHA, user key/native observed ID/epoch и creation source SHA до
unblock. Reader повторно проверяет immutable sources и schema; repeat сохраняет
nonce/bytes/inode, foreign intent не перезаписывается.

Creation claim хранит исходный snapshot everActivated=false. Effective
readUserOwnership консервативно возвращает true при любом activation journal:
planned или malformed запись не разрешает считать account никогда не активным.
readUserActivation отдельно проверяет содержимое. Parent blocked-create
отклоняет такой account USER_IDLE_UNCONFIRMED до RPC; serialized reread
отклонит intent, появившийся после исходного ownership read. Ledger не удаляется
по одному Blocked getter. Native parent activation ещё не подключена и обязана
вызывать stage до mutation; это local FS lifecycle, не live activation proof.
49 user/admin/slots PASS/151 assertions (1.69s), typecheck/diff PASS.

Management session ledger (2026-10-15): record/readServerSession связывают held
composite lease/token/slot/run command, preparation+activation generation,
protected account key/observed ID и verified native probe reply с private
command source (id/path/identity/payload+reply/semantic SHA). Проверяется ровно
одна новая managed row и одинаковые ID/Name/CreateTime на Count0→1→0.
Whitelist payload/reply сохраняются private/fsynced для повторной верификации;
state=observed, actor=management, attemptId=null. Source drift и подмена lease
manifest отказали. Это первоначальный management codec, не CLI/setup/check
ledger и не durable recovery authority.

Parent observeOwnedSession требует held preparation/ownership/activation,
повторяет их validation внутри serialized dispatch и сохраняет ledger до
возврата binding. Command intent уже fsynced до native producer. Native closed
lease RED missing method→GREEN1 PASS/27 (6.59s), journal без mutation.
Codec/slots/admin49 PASS/157 (1.73s), typecheck/diff PASS. Положительный native
parent producer ещё не квалифицирован; wire probe evidence предыдущей стадии
этого не заменяет. Parent close/confirmed close state и crash recovery далее.

Management close ledger: recordServerSessionClosed сохраняет отдельный private
fsynced terminal receipt. Source должен быть confirmed close-session из того же
command directory, с exact original proofId/binding/epoch, desired+reply SHA и
semantic source SHA. readServerSession повторно проверяет обе source цепочки
и возвращает effective closed state; corrupt/null terminal и changed source
не разрешают release/admission. Original observed record сохраняется.

Parent closeOwnedSession читает held generation-bound ledger, проверяет current
server identity и принадлежность native context; beforeSend перечитывает ledger
и pair guard. После confirmed native reply пишет terminal proof. Closed state
идемпотентен после fresh identity check. Generic close без proof не расширен.
Data-only fs/flock tests49 PASS/163 (2.14s); native closed lease RED missing API
→GREEN1 PASS/28 (7.07s), typecheck/diff PASS. Положительный native parent close,
recovery lineage, real CLI/setup/check producers и active packages ещё open.

`AdminConnection.inspectPolicy()` читает native shared-directory ACL с fresh
ServerIdentity и сохраняет наблюдение без user mutation. Возврат policy не означает
квалифицированную session identity или effective ACL; `inspect()` сохраняет свой
строгий session gate.

Held slot ownership включает точное содержимое private composite manifest и обе
resource reservations. Его подмена снимает held authority до provisioning/release;
release проверяет manifest до первого resource tombstone.

`configureOwnedUser` допускает только never-activated protected user под normal
held lease. Подтверждённая LocalAuth/safe design конфигурация сохраняется с
source journal SHA; повтор использует её secret hash, затем проверяет native
read-back. Первая установка без password write не считается подтверждённой.
Это configure phase; positive parent lifecycle и общий admission ещё открыты.

Parent административные мутации требуют переданный held server resource lease
с ключом полного container ID и точной ServerIdentity; recovery-only server
ownership разрешает cleanup close, но запрещает user provisioning. Readonly
inspect не требует этого допуска. `reconcileOwnedAcl` получает свежий snapshot,
проверяет сохранение сторонних grants и возвращает canonical hash/source proof;
это staged ACL, ещё не effective-access или readiness gate.

`reconcileUser` последовательно выполняет blocked creation/configuration/ACL
в одном fenced admin context. Полученные user/ACL hashes описывают staged user;
активация выполняется readiness controller после physical/effective-access gates.
Чужое существующее имя отвергается до claim и настройки account.

Research fixed package-crash probe attests one empty package after closing its
writer context. Its private volatile binding permits native close of that exact
pending Count1 row; ordinary probes retain the Count0 requirement. Fresh account
and tuple checks plus RPC absence remain mandatory. Production parent session
ledger does not accept this phase; arbitrary operations/CLI crash/backup/recovery
authority remain unqualified.

`parallel-env status --config <slots.json>` выводит readonly snapshot metadata
пары и server/judge/user/profile reservations без login или takeover. Двойное
чтение сообщает `snapshotChanged`; `admission:not_verified` сохраняется даже
при recorded pair phase ready. Status не читает credentials, не создаёт output
и не принимает --out/--incident. Live readiness остаётся отдельным gate.

Новый slot-resource-release proof связывает composite locator и semantic SHA
cleanup source. Следующий normal acquire проверяет composite released под guard;
missing tombstone даёт RECOVERY_FINALIZATION_REQUIRED. finalizeReleasedSlot
берёт оба resource guards, сверяет уже released reservations/proofs и дописывает
только composite tombstone без ownership CAS или нового permission на cleanup.
Source drift/foreign run/partial released+retained state сохраняются и запрещают
finalization. Recovery-only resources после подтверждённого release согласуются
с исходным incident по полной lineage: оба proofs должны иметь общий composite
и cleanup source. Finalizer дописывает recovery tombstone и original releaseReceipt;
normal acquire ждёт original acknowledgment. Повторная финализация идемпотентна.
Native cleanup producer и полная команда slot recovery ещё открыты.

Partial slot release допускает новый recovery-only epoch ранее released
resource только при private slot proof, незавершённом composite incident,
неизменном cleanup SHA и точном generation/inventory. Эта проверка повторяется
под resource guard перед CAS; generic recovery released resources не принимает
без slot-specific callback. Live owner/source drift сохраняют прежнее владение.
Это admission восстановления, не повторное model admission или delete grant.

`inspectUserStorage` выполняет readonly observation выбранного configured slot:
verified pair/epoch и inventory owner nonce, canonical ancestors/root, stable
device/inode и fs UID/GID service PID1. NUL-safe traversal сохраняет unusual
имена и metadata; symlink не раскрывается, hardlink/foreign ownership/unknown
type отказывают. Это observation без delete/release/readiness authority.
Native Docker controls проверены с synthetic inventory. `prepareUserStorage`
публикует новый root под held normal slot/server leases и protected never-activated
account ownership. Private planned→created→published journal связывает source,
generation и physical device/inode/fs owner. Existing unowned root не принимается;
planned intent не даёт права присвоить оставшийся после unknown mkdir каталог.
Inventory меняется через SHA-bound atomic rename после проверки journaled inode.
Matching private600/single-link temporary marker либо уже опубликованный marker
согласуются из created состояния без повторного mkdir; conflicting/symlink temp,
null journal или заменённый inode сохраняют прежнее владение без публикации.
Epoch перечитывается перед mutations. Результат — observation, не ready receipt.
Эта граница проверена на native Docker filesystem с data-only account authority;
positive native parent account→root/effective ACL и full prepare/cleanup ещё open.

`runAttempt` принимает внутренний SlotStorageContext и использует v2 ветку
checkIsolatedLoginom: normal held lease, protected preparation/account, published
storage journal с точным physical inode/owner и immutable source. Проверяется
только собственная пустота; данные B не запрещают начало A. Config/command profile,
workspace, username/URL/container/root связаны с context до CLI dispatch; binary
slotsFile без context refused. Native Docker/data-only account fixture проверяет
этот guard через actual fake CLI; native sessions/full readiness этим не доказаны.
Production main admission остаётся закрытым до остальных lifecycle gates.

В slot-context runAttempt сохраняет LGP/result evidence, откладывает
cleanupArtifact и удаление orphan CSV. storage-cleanup остаётся pending с
removed=false/verified_absent=false; cleanup.json явно сохраняет неизвестное
serverSessions и оба запрета storageDeletionAllowed/nextAdmissionAllowed.
Legacy afterAttempt отказывает SLOT_CLEANUP_REQUIRED до management commands,
архива/широкой очистки и сохраняет эти запреты в окончательном receipt; measured
outcome не переписывается из-за незавершённого cleanup. Следующий attempt
отвергает оставшиеся файлы. Положительный session-close/scoped-delete executor
ещё необходим; эти negative gates не дают release authority.

closeOwnedSession после смены admin context передаёт adopt только после полного
readServerSession под held lease. Adopt связывает private canonical session receipt
и semantic SHA; driver повторно проверяет UID0600/single-link/parent0700, identity,
binding и исходный confirmed command с desired/reply/source hashes. Новый context
получает свежие native account/manager proxies и применяет прежние exact tuple,
Count0/pending и bounded absence checks. Username не заменяет proof. Допускаются
только обычные session-probe/session-crash-probe; package/backup и произвольные
active-session claims не получают adoption authority. Closure journal нового
context связывает adopt receipt/SHA; старый same-context payload сохраняется.
Full parent provisioning/admission и Session CAS recovery ещё требуют интеграции.

Initialized admin dispose ожидает собственный rpc.TBGSession.Disconnect Task
до browser closure. В pinned Studio connector Dispose/Disconnect возвращает
void и запускает RPC disposal фоном; его await не является нужным барьером.
Driver отвечает transportDisconnect=confirmed только после ожидаемого Task;
parent сохраняет это поле и quarantines initialized connection без подтверждения.
Native independent-observer Count0 admin control подтверждает исчезновение
causally new peer row и сохранность первого admin. Transport confirmation
сам по себе не меняет slot serverSessions/storage/admission grants.

### Native own-storage positive control

Fixed research phase `session-storage-probe` использует тот же causally bound
non-admin designer login и native session snapshots, что session-probe. Пакет
сохраняется под фиксированным `access-probe.lgp` через `Session.SavePackageAs`,
читается через `Session.FileStorage.OpenFile` (fomRead/shareDenyNone) и
`ReadBuffer(Uint8Array)`, копируется `CopyFile(source, target, false, false)`
в `access-copy.lgp`; `GetFileInfo.Size` подтверждает размер копии. Stream/info
освобождаются `ReleaseObject(..., true)`, пакет закрывается штатно, session
проходит существующий exact tuple/close gate. Ни пути, ни JS от caller не
исполняются. Методы/сигнатуры проверены по pinned Studio bg.model.rpc.js и
bg.rtl.rpc.js (file storage interface277, CopyFile926, stream ReadBuffer1285),
client FileDownloader.js и CopyPasteManager.js; native control подтвердил
два физических файла2290 bytes с совпадающим SHA-256. Evidence private600:
`research/evidence/native-user-b4aaf4ce-b2a7-4972-b12f-bbfb1649a29f/storage-probe.json`.
Это positive own-root capability, `liveQualified=false`; соседние/shared
операции, imports/exports, concurrent B и production readiness ещё открыты.

Research `session-storage-probe` допускает дополнительный `peer:{name,objectId}`
только с canonical slot username. Native admin заново перечисляет users, требует
одного exact Name/UserKind0/objectId, awaited cast IBGDeductorUser и Blocked=false
до evaluated login. Caller paths/JS не принимаются. Peer probe использует другие
фиксированные собственные имена, чтобы не сталкиваться с первым positive control.
Под evaluated identity выполняются read/CreateFile+WriteBuffer/copy-out/copy-in
к существующему peer `access-probe.lgp`: `/<peer>`,
`/workdir/UserStorage/<peer>`, `../<peer>`. Rejection/CopyFile=false фиксируются
пооперационно; последующий успешный OpenFile своего пакета исключает потерянное
соединение как единственное объяснение. Это observation отказа, не точный
диагноз серверной ACL-ошибки. Native A→B/B→A control также проверяет неизменность
SHA обоих peer files и NUL-safe directory entries, отсутствие partial new files;
foreign peer identity и traversal name отвергаются. Evidence private600:
`research/evidence/native-user-dfb3a33f-9f9f-402b-9f18-7fbbbfdf9c15/storage-probe.json`.
Этот receipt покрывает соседние roots; shared directories и component operations
проверяются отдельными controls ниже. Concurrent heartbeat остаётся открытым.
В production parent эти research phases не подключены и не дают ready/release.

Тот же native research probe проверяет shared directories из exact read-back
policy: только canonical basename names, остальные topology требуют отдельной
квалификации (ADMIN_CAPABILITY_UNSUPPORTED до probe). Для pinned image
наблюдались common/temp, physical roots `/workdir/UserStorage/common` и `/workdir/UserStorage/temp`.
Перед отрицательными операциями тест создаёт там копии настоящего собственного
пакета и проверяет SHA; это data-only filesystem control, не native admin login.
A и B после удаления Everyone grants отвергают все четыре операции по virtual,
absolute и `../` paths; shared/peer file hashes и NUL-safe entries остаются
неизменными. Всего72 отрицательные операции с native own-root positives до/после.
Copy-out destinations остаются валидными собственными basenames. Конкретный
код серверной ACL ошибки не утверждается. Component import/export проверяются
отдельно ниже; unusual names и одновременный heartbeat B остаются открытыми.

Latest shared+neighbor control: private600 `research/evidence/native-user-d0a06c5b-7a61-4119-a120-5363660337a3/storage-probe.json`, SHA256 `10dc8b38624e6cdb53913d67076c6e000bf2ac36262b0390bc81d4a2d9e9f3c6`. Shared sentinels independently match the native positive package SHA. Unsupported traversal shared policy names refuse before probe. Native1 PASS/108 (40.91s);60 admin/user/slots PASS/260 and typecheck/diff PASS. Three superseded own artifacts removed only after process proofs and exact pair absence; audit retained beside this receipt.

### Native server-component positive control

Fixed research phase `session-component-probe` принимает стандартный configured
user/ownership/policy payload без paths или JS. Под non-admin designer открывает
собственный `component-probe.lgp`, выполняет `Activate(0)`, ждёт Finished в request
deadline, сохраняет Finished/Failed и освобождает activation proxy. Используется
настоящий frozen storage fixture: ImportTextFile→Group→ExportTextFile. Входные
Новый вход A2/A7/B11 даёт физический TSV `Item\tQty|Сумма`, A9/B11, проверенный отдельным
literal oracle. Новый input отличается от исходного dataset и подтверждает пересчёт;
прежний artifact fixture CSV имеет другую wire форму и сохранён.
Package/session проходят существующий causal 0→1→0 close/dispose gate. Private600
receipt `research/evidence/native-user-df89ab92-6932-4ef5-829f-481efa571bb3/component-probe.json`,
SHA256 `8ba4b3e821a01ae56a3141ff522e77000a5e0ddeb733418e23426d7766cfc92d`;
native process confirmed, pair independently absent. Это positive server execution,
`liveQualified=false`; import/export neighbor/shared negatives и runtime readiness
этим не квалифицированы.

Shared import/export extension использует public native chain
`ModelUnits.getItem(0).ModelUnit.WorkFlow` (Item wrapper interface903,
PackageModelUnit907, workflow908), не QueryInterface коллекционного Item.
Для frozen fixture требуется один module/три Nodes; Import0 и Export2 приводятся
к IBGImportTextFile/IBGExportTextFile. Перед сменой FileName полностью ожидается
`DeactivateAllAsync()` work item Finished/Failed и освобождается его proxy.
`set_FileName`+`UpdateConfiguration` и getter read-back предшествуют Activate(0).
Ровно12 shared paths/operations требуют Finished=true, Failed=true и status
целевого node `TBGModelNodeStatus.mnsInactiveError`(3). Ошибка другого node или
незавершённая activation не получает denied credit. Перед/после negative matrix
own execution успешен; shared input bytes/SHA и NUL-safe entries проверяются
независимым Docker observer. Исходные common/temp sentinels существуют и содержат
тот же корректный CSV, что own positive. Результат описывает observed rejection,
точный ACL exception code не утверждается. Latest private600 receipt:
`research/evidence/native-user-29beba5b-138e-4c0a-bef8-1f60ee981ece/component-probe.json`,
SHA256 `36529410d2723843c24a84b306f62e666c21b4f37b1d5df72c8cbeb2392bfe78`.
Neighbor component operations, live concurrency и parent readiness остаются open.

### Bilateral component isolation

`session-component-probe` теперь принимает тот же необязательный exact peer,
что FileStorage probe. В trusted native context до evaluated login проверяются
peer Name/UserKind0/objectId/Blocked=false; arbitrary paths/JS не принимаются.
Для peer и shared roots проверяются virtual/absolute/../ import/export paths,
используется тот же Finished/Failed/target node status3 gate.

Два настоящих non-admin designer accounts выполняют разные datasets: A2/A7/B11
даёт A9/B11, B3/B8/B19 даёт A11/B19. Own positive и continued pipeline каждого
успешны. На каждого actor18 negatives, всего36; перед/после матрицы independent
Docker observer сверяет NUL-safe SHA всех файлов и состав всего target/shared
root. Проверка включает существующие ненулевые корректные peer/shared CSV и
не пропускает частично созданный forbidden output. Accounts готовятся общим
real-native fixture helper, без fake administrator и ротации первого account.

Private600 receipt:
`research/evidence/native-user-bf9b3dfc-4a72-4614-87f5-e46ec7fd10aa/component-probe.json`,
SHA256 `ae86e6f17a70c3d9ee4759d98fbfc48d377825253f5d0a31e3ad9cf76665ca73`.
Там actors A/B с отдельными output SHA, peer и native activation/status evidence.
Native process/dispose confirmed; exact pair independently absent.
Это sequential isolation control, `liveQualified=false`. Unusual filenames,
concurrent heartbeat, production lease/readiness/cleanup integration ещё открыты.

### Native unusual filename positive controls

Fixed FileStorage probe создаёт собственные access-positive/access-peer-positive
directories и nested subdir; семь basenames покрывают space, tab, newline, Unicode,
leading dash, dotfile и nested path. Native CopyFile/OpenFile/ReadBuffer проверяют
пакетные копии, CreateFile/WriteBuffer записывают соседний `.write` canary с byte65,
writer/reader proxies освобождаются синхронным ReleaseObject. Для обоих настоящих
users independent Docker `sha256sum -z --` получает filenames отдельными argv:
все14 package copies совпадают с собственным source SHA, все14 write canaries —
с SHA байта A. Newline/tab не разбиваются по строкам.

Private600 receipt с positive A и peerPositive B:
`research/evidence/native-user-25ff20ac-bed1-4833-b7d4-5a6c22a7d6c0/storage-probe.json`,
SHA256 `18b5183c728d3a906389c6550397217b9212af951a18b036bbbdf4590a2c4e41`.
Native1 PASS/118 (38.29s), admin/user/slots60 PASS/260, typecheck/diff PASS;
process/dispose confirmed и exact pair independently absent.
Это positive filename capability; unusual neighbor/shared negatives и native
component filename matrix ещё открыты, `liveQualified=false`.

Unusual FileStorage negative matrix расширена на normal +7 native-qualified
filenames:576 operations (2 actors×9 path scopes×8 filenames×4 operations).
Peer/shared trees содержат реальные копии own native positive files. Read и
copy-out используют соответствующий существующий basename; write/copy-in
пишут новые sibling targets с теми же `.write`/`.lgp` extensions, что positive
controls. Copy-out target — валидный собственный basename. Independent Docker
observer сравнивает NUL SHA всех файлов и NUL-safe entries всего peer/shared root,
включая partial output; line splitting для filenames не используется. После
negative matrix own OpenFile продолжает работать. Private600 final receipt:
`research/evidence/native-user-f3ff04ae-7e83-4f90-91b7-e0361c798628/storage-probe.json`,
SHA256 `c912749eea012da5e1f50dbdad79560545b4f450f6a65565f9bae5651bb6357e`.
Native2 PASS/197 (71.73s), unit60 PASS/260, typecheck/diff PASS; process/dispose
confirmed, exact pair independently absent. Autosave suffix, unusual component
paths, concurrency/cleanup и production binding остаются отдельными gates.

Autosave suffix `copy.lgp.autosave` добавлен восьмым special filename. Own
FileStorage copy/read/write controls и NUL SHA проходят; matrix648 denials
(2×9 scopes×9 filenames×4 ops) сохраняет все peer/shared files. Это копия пакета
под suffix-case, не native autosave generation или SessionBackup proof.
Actual native autosave/SessionBackup research остаётся отдельным gate.
Private600 receipt `research/evidence/native-user-b643d721-aa5f-4e29-947a-78e238db1817/storage-probe.json`,
SHA256 `b75f68ce2ccd2f293e727da9251af647d80ecc5b5862c2fb47992c644e02b45a`;
native1 PASS/118 (36.85s), typecheck/diff PASS, process confirmed и exact pair absent.

### Unusual component filenames

Fixed component probe перебирает normal +8 CSV names (space, tab, newline,
Unicode, leading dash, dotfile, nested path, autosave suffix). Для каждого case
сначала выполняет собственный pipeline и фиксирует native Finished/Failed,
FileName getter read-back и выбранный output path; independent Docker reader
проверяет каждый из18 outputs по разным A/B literal oracles. Положительный
результат требуется до соответствующих negative cases.

Common/peer input и output parent directories существуют до probe. Смена
источника/назначения объединена в native configure boundary: complete
deactivation→set FileName→UpdateConfiguration→exact read-back. На каждый actor
162 neighbor/shared import/export cases, всего324; каждый требует Finished=true,
Failed=true и целевой node status3. После matrix native pipeline возвращается
к своему исходному input/output и успешно завершается. Full NUL SHA и topology
всех peer/shared files неизменны. Изменений deadline/supervisor timeout нет.

Private600 receipt:
`research/evidence/native-user-5135776a-763c-45a0-a4c9-fb5330826961/component-probe.json`,
SHA256 `0d9aba6dd7d76d32dbbda666622ccf62041702de9d2f3837738eb98afe1182de`;
actors содержат9 native positives и162 negatives каждый. Native1 PASS/97
(57.85s), process/dispose confirmed, exact pair independently absent.
Файловый autosave suffix не подтверждает SessionBackup; concurrent heartbeat,
production preparation/readiness/recovery/cleanup остаются отдельными gates.

Final adjacent regression:2 native PASS/215 (93.43s),60 admin/user/slots PASS/260
(3.16s), typecheck/diff PASS. FileStorage648 denials и component324 denials
проверены вместе. Три superseded own green logs удалены; private600 audit
`native-user-5135776a-763c-45a0-a4c9-fb5330826961/superseded-logs-cleanup.json`
сохраняет их SHA и replacement log. Старые retained incidents не менялись.

### Unactivated user observation

`AdminConnection.inspectUnactivatedUser(lease, secretFile)` — read-only input для
будущей standalone finalization. До secret read требуется held slot + exact server
fence; protected preparation/ownership и отсутствие любого activation marker
перечитываются перед serialized inspect и после него. Fresh pair/epoch и native
admin role обязательны. Допускается account absence без ownership claim либо
exact native Name/UserKind0/objectId с Blocked=true по protected creation claim.
Foreign/missing/drifted claimed account и возможные matching user-session names
дают отказ. Generic `inspect()` сохраняет SESSION_IDENTITY_UNSUPPORTED: этот
метод не квалифицирует ownership произвольной серверной сессии.

Private observation связывает slot/token/preparation nonce/ownership source,
полный whitelisted native inspect reply и private confirmed command (version,
kind, ID, op, expected identity, desiredHash/replyHash/semantic source SHA). Return
содержит только account summary и source path/SHA. Команда не изменяет users,
не открывает evaluated-user session и не выдаёт readiness/delete/release rights.
`readUnactivatedUserObservation` повторно проверяет private canonical source и
каталог admin0700, held configured slot/token, protected preparation/ownership,
absence activation и exact inspect command/reply/receipt SHA. Account summary и
отсутствие возможных user-session names вычисляются из raw observation; строки
summary сами по себе не принимаются. Unknown command, иной token, public admin
directory, foreign account и matching session отклоняются, включая заново
хэшированные artifacts. Reader не изменяет источники. Producer возвращает
результат только после этого read-back. Local-writer/archive/admin-finalization и
terminal cleanup binding ещё open; observation не является release capability.

Native RED missing method→GREEN: account absent до creation и exact owned blocked
после повторной preparation; server fence refusal до secret/inspect, foreign
bootstrap account refusal, invalid activation canary refusal без нового RPC.
Canary не dispatches activation и удаляется самим тестом до native preparation.
Reply/command/receipt SHA проверены independently; native3 PASS/69 (59.24s),
unit60 PASS/260, typecheck/diff PASS. Private600 evidence:
`research/evidence/native-parent-061bb77b-fc50-4dff-a0f5-acb5e4da571b/blocked-preparation.json`,
SHA256 `3b57d1ebbb10111a592e0d430ada84cd2ba4ac168bfe5735fa4e354532e3c638`.
Admin transport/process completion confirmed; exact pair independently absent.
Existing native parent test всё ещё использует явно test-only unactivated release.

Reader validation:88 unit PASS/353 (5.27s),3 native PASS/69 (60.97s),
`bun typecheck` и diff PASS. Private native-parent-1de4cfc5-caa7-4b08-9f63-001a70ec2156
receipt SHA256 `6f2e3d0ca3de172848f26f83803885a14cd833530470fbe0753850b65f521f96`;
actual admin disconnect/process confirmed, exact disposable pair independently absent.

### Admin finalization source

`dispose()` сохраняет фактический whitelisted reply и semantic SHA исходного
dispose command в private `connection.json`. `readAdminFinalization` проверяет
canonical admin0700/receipt600, exact identity, confirmed initialization/dispose и
native transportDisconnect, confirmed command/reply/hash и его время внутри
наблюдённой lifetime. Existing `qualifyClosedProcessEvidence` требует continuous
capture, exact producer PID и admin directory owner, launcher ancestry и две
проверки отсутствия собственных процессов после завершения. Reader только читает
источники и возвращает их SHA; не выполняет takeover/delete/release. Caller
finalizer обязан связать этот source с inventory исходной команды и её lineage.
Старые receipts без dispose source не получают задним числом новое доказательство.

TDD missing export и command timestamp outside process lifetime RED→GREEN.
90 unit PASS/373 (8.40s),3 native PASS/69 (57.76s), дополнительный preserved
native1 PASS/21 (36.36s), typecheck/diff PASS. Private600
`research/evidence/native-parent-d0b109ca-9a5d-4ef9-9dfd-fd9ada3b2e0d/blocked-preparation.json`
SHA256 `3c780acaf1e8be306e1b072761460e247253dbcb527a221ea063cd69074210a8`
содержит full receipt+dispose command; receipt/command/reply SHA independently
совпали. Exact own pair independently absent; external retained incidents preserved.

### Command admin process inventory

Controller передаёт `processInventory` в `openLoginomAdmin`. Существующий
private inventory связывает commandId/journal/ServerIdentity. Под exact held
server fence новый admin directory и producer PID записываются до запуска
`superviseProcess`. Записи одного inventory сериализованы внутри процесса;
server OS guard исключает другого владельца. Connection receipt содержит ту же
привязку inventory/journal/commandId. Failed start оставляет регистрацию и не
превращается в доказательство пустого набора процессов.

`readAdminProcessInventory` проверяет finalization каждой записи и source SHA,
отвергает duplicate directories/foreign producer/command, затем перечитывает
inventory. Starting/unknown connections не подтверждаются. Outer finalizer ещё
должен связать inventory с resource lineage, CLI/probe owners, archive и storage
proofs. Старые receipts без привязки inventory этим путём не квалифицируются.

Inventory validation:90 unit PASS/379 (9.07s),3 native PASS/71 (59.56s),
typecheck/diff PASS. Private600 native-parent-3f77ff84-0f9f-47e3-a0e2-76a8a22fa59a
receipt SHA256 `b628d2c7ea7ffd157fc095cac8587f6d260542b3943aef83e36a14cf3b018038`
сохраняет inventory/connection/dispose sources; три SHA independently matched,
exact pair independently absent. Test inventory basename `admin-processes.json`
конфликтовал с prefix lookup каталога; исправлен на `processes-admin.json`.
Неуспешный own fixture jkdzDM сохранён и описан в blocker file; его старый
receipt не получает новую command binding задним числом.

### Normal unactivated preparation finalization

`finalizeUnactivatedEnvironment` завершает normal held environment только для
private command kind `unactivated-preparation` с exact commandId/identity/slotIds,
phase `unactivated` и обязательным admin process inventory. Slot manifests должны
указывать на этот journal; recovery-only ownership этим путём не завершается.
До CLI admission новый command producer обязан durably сменить phase. Этот
finalizer не принимает `cli_admitted` и не закрывает активированные accounts.

Под held server fence `sealAdminProcessInventory` переводит journal в
`finalizing` через ту же очередь, что регистрирует admin processes. После seal
новые connections команды отвергаются до runtime/secret/launch. Для этого kind
нельзя открыть admin без объявленного inventory. Concurrent seal допускает один
переход; stale command hash или closed lease дают отказ без переписывания journal.

Finalizer подтверждает exact owned Blocked account и never-activation, фиксирует
native no-matching-session observation, архивирует каждый профиль через durable
archive producer, затем закрывает admin transport/processes. Проверяются все
зарегистрированные owners, в том числе directory исходного observation. После
этого повторно проверяются protected user/storage sources, native root inode и
пустота только собственного storage, committed archive и sealed journal. Slot
cleanup содержит source SHA, а не принятые от вызывающего кода terminal flags.
Реальный `SlotLease.release` публикует tombstones; server release следует только
после всех выбранных слотов. Root/files не удаляются. Любой отказ сохраняет
неразрешённые reservations; внешний recover и авария в середине release требуют
отдельной reconciliation. Sealed journal — admission fence; terminal completion
публикуется в slot/server release proofs.

Это pre-CLI finalization primitive для standalone prepare, а не readiness.
Публичные prepare/verify, active CLI/probe inventory, recovery-only finalization,
SessionBackup policy и модельная приёмка остаются открытыми.

Finalizer TDD missing module/unsealed completion/missing inventory before runtime
RED→GREEN.102 unit PASS/457 (15.27s),3 native PASS/81 (61.19s), typecheck/diff
PASS. Current native parent test использует production finalizer вместо test-only
cleanup flags. Native canary архивирован до dispose; cli_admitted отказал без
переноса canary; соседний filesystem B control сохранил bytes (не active B).
Private600 native-parent-b6417f5a-a733-45c0-b6b0-5b0a5f3249c2 receipt SHA256
`455426c0296b2958cda7fdd5ac15e71fd981ce4ec9415cdcc78e8ba2235279bf`
содержит command/cleanup/archive/observation/command/inventory sources; независимый
пересчёт всех SHA и archive≤dispose совпал, slot released/server proof confirmed,
exact own pair independently absent. Four superseded own green logs удалены с
private audit; retained incidents не изменялись.

### Standalone preparation controller

`prepareEnvironment({ slotsFile, parallel })` загружает canonical private config,
проверяет owned pair и свежий epoch, записывает command intent/admin inventory,
затем получает единый набор server/user/profile reservations. Один admin context
создаёт или переиспользует только owned blocked users, конфигурацию и published
root. Native configuration read-back определяет changedPasswords; generation,
native user ID и secret сохраняются при повторе.

Текущая session capability не квалифицирована: native `inspect` возвращает
`SESSION_IDENTITY_UNSUPPORTED`. Контроллер выпускает preparation receipt с
`code:2`, `ready:false`, `status:blocked` и фактической причиной, после production
unactivated finalization. Если session gate будет пройден, остальные обязательные
CLI/effective-access/backup/fingerprint gates всё ещё запрещают readiness через
`PREPARATION_READINESS_UNPROVEN`. Оцениваемый CLI, модель и судья не запускаются.
Ошибка provisioning сохраняет private failed receipt и unresolved reservations;
нет возврата частично подготовленного окружения как готового. Полный public CLI,
verify и crash/recovery reconciliation ещё не завершены.

Prepare controller TDD missing module RED→GREEN.105 unit PASS/465 (13.75s),
native1 PASS/9 (59.63s), typecheck/diff PASS. Actual N2→N1 сохраняет A nonce,
userKey/native ID; changed users/passwords2→0, normal reservations released,
ready:false/code2 с SESSION_IDENTITY_UNSUPPORTED. Private600
`research/evidence/native-standalone-32e214cf-061a-4b14-b946-4b73fe4eccf7/preparation.json`
SHA256 `aba025a4c9c4aa7b9592dc9aac155b22f7701e610d658903b4e0f6dedeec1ff6`
сохраняет command/admin inventory/server/slot cleanup/archive/observation sources.
23 independent source/status checks совпали; exact own pair independently absent.
Это не model N2→N1 acceptance и не full readiness.

### Public prepare command

`parallel-env prepare --config <private-slots.json> --out <new-private-dir>`
использует default global fences; `--parallel N` выбирает первые N slots, default1.
Output не пересекает configured roots/config/credentials/global lock root; parent
canonical/UID700, directory новый0700, receipt600. Проверка output предшествует
runtime и preparation. CLI пишет JSON/receipt с ready:false и exit2 при
неквалифицированном admission; ошибка подготовки сохраняет failed receipt без
measured summary. Status/offline judge recover продолжают прежние semantics.

TDD unsupported command/unsafe output и missing error receipt RED→GREEN.
97 unit PASS/430 (12.91s), native1 PASS/14 (75.44s), typecheck/diff PASS.
Actual default global root API N2→N1→public CLI N1 сохраняет generation/native
ID и пароль; все normal reservations released. Native public stdout совпал с
receipt600, output содержит только receipt.json, exit2/ready:false с фактическим
SESSION_IDENTITY_UNSUPPORTED. Private600 native-standalone-f5f14267-46e2-45c4-bc0d-248e35ddbd63
receipt SHA256 `e09a44ce257ef8b960c043aa8e3fd27a9f01c2bf517219b694d98eafc48738cd`
содержит все3 preparation/source sets;36 independent checks совпали, exact pair
independently absent. Verify/full readiness и recovery не объявлены готовыми.


### Management process inventory

`AgentCommand.managementEvidence` связывает управляющие команды с held normal
slot lease и private journal phase `cli_admitted`. Inventory публикует planned
entry до запуска; owner содержит command/slot/уникальный запуск. После supervisor
сохраняется private continuous process proof с producer PID, launcher identity
и двумя final absence passes. Reader повторно проверяет metadata/source SHA и
все предыдущие proofs; unconfirmed/planned/source drift не дают closure.

Сохраняются только whitelist operation pairs: loginom setup/status/check/recover
и providers status. Аргументы и stdin не входят в inventory; произвольная
operation отвергается до dispatch и записи. Закрытый/recovery-only lease, чужой
profile и capture directory внутри profile не дают admission. Legacy management
без нового evidence сохраняет прежний путь. Process closure не означает server
session closure и не разрешает storage deletion/release.

Installed pinned CLI status на собственном пустом профиле:1 PASS/5 assertions
(2.86s), unconfigured/hasApiKey=false, continuous capture confirmed. Это control
реального CLI процесса с data-only slot authority; Loginom login, модель и судья
не запускались. Общая fixture с auth.json без cli-profile marker исправлена в
нативном тесте: CLI сам создаёт marker в пустом fresh profile.

TDD operation dispatch guard RED→GREEN;146 related unit PASS/552 assertions
(60.94s), typecheck/diff PASS. Five obsolete own native fixture roots removed
after exact PID/starttime absence and continuous proof checks; private audit
`research/evidence/management-native-draft-cleanup-20261015.json` SHA256
`7ddeac08523dfd1a8e3fcfed0d6fb29e01c5f828413e4bdb54ea545d91e51c6b`.


### Read-only standalone verification

`verifyEnvironment({slotsFile, parallel})` и public `parallel-env verify --config
<private-slots.json> --out <new-private-directory> [--parallel N]` используют
тот же command/admin inventory и grouped leases, что prepare. Verify перечитывает
protected preparation, ownership/configuration sources; reconcile-user, password
rotation и user-root publication не вызываются. Native observation/finalization
проверяет owned blocked account, отсутствие sessions, private profile archive
и published empty root, затем выпускает normal slot/server reservations.

Текущий verify предназначен для уже подготовленного never-activated окружения;
он сохраняет ready:false/code2, пока actual session/backup/effective-access/CLI
readiness не квалифицированы. Отсутствующие/неполные sources или activated owner
не исправляются; uncertainty сохраняет reservations для recovery. Выходной
receipt kind environment-verification; ошибки до runtime создают private failed
receipt без measured summary. Это ещё не full readiness и не recovery.

TDD missing API/unsupported CLI RED→GREEN.98 unit PASS/418 (6.52s),8 CLI
PASS/41 (0.415s), native1 PASS/21 (88.08s), typecheck/diff PASS. Actual
prepare2→prepare1→public prepare1→public verify1 сохранил10 protected markers
byte-SHA; native verify operations только init/inspect/dispose, changed users
и passwords пусты, normal reservations released. Private600 evidence
`native-standalone-9dfdd704-9c20-48a5-b339-5138d29fedea/preparation.json`
SHA256 `112b6df4398d2232e5c48b5b9c62f286f757d6166c257b92708be6d789011307`
содержит4 source sets;34 independent hash/status checks и exact pair absence
PASS. Ready:false/code2 с фактическим SESSION_IDENTITY_UNSUPPORTED.


### Never-created account finalization

Normal `finalizeUnactivatedEnvironment` также завершает staged preparation, если
свежий native inspect подтверждает account:null и отсутствие sessions. Protected
preparation/secret сохраняются; profile archive commits предшествуют admin dispose.
После подтверждённого disconnect/process inventory повторно проверяются sources,
отсутствие activation/ownership, storage publication/reservation и физического root.
`inspectAbsentUserStorage` читает exact configured slot/current verified pair,
canonical ancestors и marker без claim этого username; существующий path, включая
dangling symlink, даёт отказ. Marker и ServerIdentity повторно проверяются.

После подтверждённого отсутствия root выпускаются normal slot/server reservations.
Ничего на сервере не удаляется, credentials и соседний root сохраняются. Это
только never-created normal ownership: private reserved/created root, unknown
provisioning, recovery-only leases и partial terminal reconciliation остаются
отдельными задачами. Readiness не появляется.

Absent storage inspector TDD missing API RED→GREEN: native pair1 PASS/46
(34.37s). Native unused+owned finalization2 PASS/39 (59.74s), source-complete
unused rerun1 PASS/8 (22.20s),98 unit PASS/418 (6.90s), typecheck/diff PASS.
Private600 `native-unused-ae4d5c22-e15e-4e38-bc94-d849a3d348bb/finalization.json`
SHA256 `0294cfa0166a29769c01388f5da8b3f438222d1013a5886ac212488e4bb6548d`
сохраняет original observation/command, inventory/admin receipt/dispose command,
continuous process proof, archive и slot/server terminal receipts.16 independent
checks подтвердили source hashes, process qualification, archive-before-dispose
и отсутствие exact own pair. Старые recovery-only incidents не изменены.


### Preparation failure finalization

Если prepare/verify отказывает после открытия admin context, controller проверяет
journal phase. Пока phase=unactivated, он вызывает тот же normal finalizer до
dispose/закрытия guards. Released публикуется только после полного existing
archive/native observation/process/root/lease release пути. Неопределённый
finalizer даёт finalization.status=unconfirmed и сохраняет reservations. Уже
sealed/finalizing journal повторно не исполняется; original admission error
остаётся reason failed receipt.

`EnvironmentFailure` содержит ссылку на private controller receipt. CLI перечитывает
этот receipt и сохраняет его целиком в private output, поэтому actual cleanup
result не теряется при переводе исключения в exit2. Ошибка до controller receipt
тоже явно указывает finalization:unconfirmed; это не утверждение об acquired либо
released ownership. Measured summary и readiness при отказе не создаются.

TDD missing failure finalization status RED→GREEN.98 unit PASS/418 (6.90s),
8 CLI PASS/41 (0.465s), native1 PASS/24 (97.76s), typecheck/diff PASS. Actual
prepare2→1→public prepare1→failed verify missing configuration→verify1: error
USER_CONFIGURATION_UNCONFIRMED, failed receipt finalization released, следующий
verify получает ownership. Test восстанавливает exact configuration source;10
protected markers затем совпадают, readiness остаётся false. Private600
`native-standalone-56819dc0-0c24-480c-acee-8b0c6aa4747d/preparation.json` SHA256
`945a9ce16f1241ec68fffa6ab7152bf39fda6f4b6401679ea87fbfa185b059c0`
содержит5 source sets;41 independent checks и exact own pair absence PASS.


### Whole-preparation recovery ownership

`recoverPreparationLeases(file, identity, incident, lockRoot)` принимает exact
private pre-CLI command kind unactivated-preparation/phase unactivated либо
finalizing и configured prefix slots. На каждый slot требуется ровно один
original retained manifest с тем же journal/command/identity/slot. Server
reservation и все последующие recovery journals должны продолжать эту lineage.
Новый private recovery intent и admin inventory предшествуют server CAS; slot
CAS выполняются последовательно под held server fence. Каждый результат остаётся
recovery-only; никакого нового provisioning/CLI/delete/release grant нет.

При ошибке уже принятые reservations сохраняются, guards закрываются. Повтор
после выхода recovery controller принимает исходный incident и продолжает CAS
lineage. Live current owner отказывает BUSY. Полностью/частично released slots
этот начальный API пока не принимает: terminal reconciliation отдельна.

TDD missing module RED→GREEN.69 related unit PASS/311 (5.22s), real exited
original→recovery→second recovery target1 PASS/8 (0.534s), typecheck/diff PASS.
Revision3 связывает оба прежних server owners/journals; оба slots recovery-only,
preparation refused, live retry не меняет reservations. Native cleanup/release
и public recover ещё не квалифицированы.


### Recovered pre-CLI finalization

Existing unactivated finalizer принимает recovery-only server/slots только через
exact9-key unactivated-recovery command, original7-key command/hash, explicit
slot incidents/recovery receipts и actual server lineage. Все прежние controller
admin inventories проверяются с original producer PID и continuous closure;
при том же boot ID выполняется fresh PID/starttime scan. Неизвестный или живой
process не разрешает archive/release. Sources перечитываются после current native
admin dispose, перед releases. Recovery admin launch требует explicit inventory
и unactivated phase; seal запрещает новые connections до runtime.

Далее действует существующий native blocked/absent account, no sessions, archive,
owned/absent root путь. Cleanup сохраняет recoveryProcessInventories. После
release recovery slot receipt original incident дополняется через
finalizeReleasedSlot; server release следует за всеми slots. Provisioning и CLI
при recovery-only по-прежнему запрещены.

TDD old normal finalizer refusal и missing recovery inventory before runtime
RED→GREEN.91 unit PASS/388 (7.17s), native1 PASS/6 (42.50s), typecheck/diff PASS.
Native exited controller/blocked account/history/B canary qualified; green pair
removed. RED fixture /tmp/evals-recover-preparation-CrWNk2 остаётся для public
recover/resumption. Полная source capture, CLI command, idempotency и partial
terminal reconciliation ещё open.


### Public pre-CLI recover

`parallel-env recover --config <private config> --incident <original prepare
journal> --out <new private directory>` распознаёт unactivated-preparation
incident, перечитывает config/pair/identity и выполняет recovery-only CAS + native
finalizer. Phase cli_admitted/active account не получают этот путь. Exit0 и
status released означают только cleanup; ready:false сохраняется. Failure
receipt явно unconfirmed/exit2; private controller receipt сохраняется целиком
при известной ссылке. Offline judge recovery сохраняет прежний route.

TDD wrong offline-judge routing RED→GREEN.100 unit PASS/433 (7.00s), offline
judge2 PASS/37 (7.29s), typecheck/diff PASS. Public command принял сохранённую
RED fixture CrWNk2 после выхода первого recovery owner. Проверены sources двух
прежних controllers, continuous proofs/fresh absence, original terminal slot,
archive canary и B bytes. Private600 `native-recovery-red-resume-20261015/qualified-recovery.json`
SHA256 `49794de02d5a9ab022c1128aa0d62521054ed81ec2ac8bb4e171d3930d315895`;
31 independent checks, cleanup-audit и exact own pair absence PASS. Own pair
удалена через destroyPair после release, test root удалён. Это public cleanup
never-activated incident; fully terminal idempotency и partial-release
reconciliation ещё необходимы. Старые incidents не затронуты.

После recovery extension обычный native parent path также PASS:1/31 assertions
(41.16s), log600 /tmp/evals-recovery-normal-regression-native.log.


### Durable recovery completion and historical repeat

После slot/server release и private result receipt recovery пишет отдельный
`<original incident>.completion.json`. Он связывает original command/result
source hashes, identity и полный immutable closure source set: server/slot
cleanup, commands, observations/ownership creation command, archive manifests,
все prior/current inventories, connection/dispose receipts. References private,
canonical, внутри controller state; source drift даёт отказ.

При наличии completion повтор возвращает historical already_released до CAS
и admin runtime, сохраняя ready:false. Проверка completion не получает
provisioning/delete/admission grant и не зависит от нового владельца тех же
resources. Неверный completion не превращается в попытку takeover. Crash между
releases и durable completion пока требует отдельной terminal reconciliation.

Actual repeat PREPARATION_RECOVERY_SLOT_UNCONFIRMED RED→GREEN.100 unit PASS/433
(7.15s), native1 PASS/14 (55.47s), typecheck/diff PASS. Repeat с unreadable
CLI runtime не создаёт controller state files; изменённый server proof refused.
Следующий owner держит server/user/profile reservations, historical repeat
сохраняет все3 bytes, затем next normal finalization released. Private600
`native-recovery-2a249859-79fc-4310-a7c6-492f75cd8163/recovery.json` SHA256
`f8a75284863bf67c3d30bc2072bb99449628ca7d1ec4ef22dad68fad38b9b9f9`;14
retained source hashes и exact pair absence PASS. Superseded own green log
удалён после private audit/read-back; RED и current qualified logs сохранены.


### Released-server reconciliation before completion receipt

При отсутствии completion recovery берёт только server resource guard и
проверяет current released row. Его identity/token/revision/release evidence
связываются с original command либо его recovery lineage, sealed journal и
server finalization. Все slot resource proofs/tombstones проверяются через
finalizeReleasedSlot, admin inventory — через continuous-proof reader. Затем
восстанавливаются result/completion; CAS, Loginom runtime и новый slot ownership
не нужны. Fully completed normal preparation также получает historical
already_released. Corrupt evidence не допускает восстановления metadata.

Этот путь требует current released server cohort; server-retained и mixed
partial releases пока требуют дальнейшей reconciliation. После durable
completion исторический repeat по-прежнему не зависит от нового владельца.

TDD native persisted boundary (удалены только result/completion после actual
release) RED→GREEN.100 unit PASS/433 (6.79s), native1 PASS/23 (56.50s),
typecheck/diff PASS. Public CLI с unreadable runtime восстановил оба byte-identical;
corrupt released-server proof не восстановил ни один. Normal completed prepare
и repeat, unchanged next3 reservations qualified. Private600
`native-recovery-c45ef966-a344-45b0-bb97-6190863f4d05/recovery.json` SHA256
`d14762e0820b27b24b617e5488eb53fcd110be2a2692fb96e87c39e8c997e0fd`:14
closure source hashes + original/result hashes совпали; exact own pair absent.
Это не реальный SIGKILL в данном окне; такой crash case остаётся открытым.


### Retained common fence after every slot has released

Если все original slot manifests released, а server reservation ещё retained
либо recovery-only, recovery не принимает user/profile ownership заново.
Он проверяет original prefix/identity/lineage, сохраняет новый common recovery
intent/empty inventory и выполняет только server CAS. Inventory seal запрещает
новые admin admissions. Все prior controller inventories/continuous proofs и
fresh PID/starttime absence проверяются до и после проверки slot terminal
proofs. Pair/command reread предшествует server release. Old history archive
и slot cleanup повторно не создаются; confirmed source refs входят в новый
global proof/completion. Неполные process proofs оставляют server recovery-only.

Реальный native late write fault (directory вместо server receipt, EISDIR),
затем controller SIGKILL137 после slot releases: RED old recovery refusal→GREEN.
100 unit PASS/433 (8.42s), native tail+base2 PASS/33 (117.16s), typecheck/diff
PASS. Capture canary false отказывает; восстановление exact known receipt и
retry выпускает только server. User/profile bytes и revisions1 сохранены,
archived canary читается, new admin directory не создаётся при unreadable
CLI runtime. Private600 `native-tail-2fb30702-17ea-46fa-b9b2-5b4deae2f28b/tail.json`
SHA256 `243a1648ebb63ff3caa08c36dac2d0117802ed22f9814fa5730da128df1de2ff`:
14 source hashes/result verified, exact pair absent. RED fixture n4IMAF также
выпущена публичным API;12 sources/24 audit checks, qualified-tail SHA256
`528096e030f8ce44ccb1db849d006c4241af50499162a64a1598325c7ed9d0d5`,
штатный destroy/root cleanup с private audit. Other incidents preserved.
Mixed partial A/B и другие crash windows пока open.


### Mixed preparation ownership checkpoint

Whole-preparation adoption теперь принимает mixed original manifests: released
slot проверяется через finalizeReleasedSlot под held server recovery-only fence,
его cleanup source SHA сохраняется в completedSlots; CAS выполняется только для
retained slots. Новый mixed command имеет10 keys, descriptor записывается до
следующего adoption. Released user/profile rows не переписываются.

TDD released A rejection RED→GREEN. Real OS exited controller/fs/flock +
data-only release codec: A bytes unchanged, pending B adopted, server held.
101 unit PASS/438 (7.30s), typecheck/diff PASS. Владение само по себе release/dispatch
grants не выдаёт; native finalization описана ниже.

### Mixed pre-CLI finalization и прежний архив

Native finalizer принимает completedSlots только после проверки исходных slot
release proofs, cleanup SHA и точного pending subset. Итоговые slot refs следуют
порядку config. Если оба resource tombstones уже released, missing composite
согласуется через finalizeReleasedSlot без нового slot CAS. Неопределённые proofs
сохраняют общий fence.

Recovery ищет прежний archive manifest по original slot incident и предыдущим
recovery journals в profile lineage. Единственный найденный manifest повторно
проверяется archiveProfileEvidence (в том числе intent); committed archive
сохраняется, новый пустой не подменяет историю. Несколько источников или чужой
profile/history root дают отказ.

TDD: native mixed10 отвергался старым finalizer; missing composite повторно
захватывал A; missing result/completion после mixed recovery давали
PREPARATION_COMPLETION_UNCONFIRMED. Исправления проверены по отдельным RED→GREEN.
113 related unit PASS/512 (19.26s), descriptor unit3 PASS/25 (1.65s), typecheck/diff
PASS. Sequential native1 PASS/18 (82.52s): original controller SIGKILL137 после
release A/отказа B; первый recovery отказал B canary и сохранил server fence;
retry завершил B, resource bytes A не изменились, original history-b сохранена.
После удаления только result/completion metadata восстановилась byte-identical
с unreadable CLI runtime, без новых controller files/изменения server row.

Private600 `native-mixed-c6167cfe-f281-48ba-9b00-a5139c305a3e/mixed.json`
SHA256 `d71d7ca4d91e05b5ab5edd5a98bd3dfb79f4c735681bfc3ce0a229839a6ad8b9`:
23 source hashes verified, exact pair absent. Original RED izBc4f также
завершена public CLI,23 sources/36 audit checks, штатный destroy/root removal;
`native-mixed-red-resume-20261015/qualified-mixed.json` SHA256
`43a5ab7685db5a5e416f208e761f57876b4d3dd89de3351069e37811cd841336`.
Один concurrent own browser run получил unknown-process quarantine; incident
dyI2ST сохранён в blockers, его proof не переписан. Partial resource release,
active CLI sessions и остальные readiness gates остаются открытыми.

### Partial resource release и падение recovery controller

Native B release проверен реальным EISDIR при записи второго resource proof:
profile row уже released, user row retained, A полностью released. Original
controller завершён SIGKILL137. Новый recovery-only owner принял оба ресурса B
с revision2 и завершён вторым SIGKILL137 до admin dispatch. Public retry от
original journal прошёл существующий production путь: оба B rows released с
revision3/lineage2, A bytes неизменны, original committed history-b reused.
Последующее missing result/completion reconciliation не потребовало runtime.

Native1 PASS/19 (62.30s), typecheck/diff PASS. Новый сценарий квалифицирует
существующее поведение, production edits для него не потребовались. Private600
`native-mixed-55aff707-20d5-4974-bfc8-8cb944c4e825/mixed.json` SHA256
`5d6342704929af7ef91a1052c5e0ae39ededce88f5a92a6406d82a04615015f1`:
21 source hashes,31 независимая проверка в partial-audit.json, exact pair absent.
Active CLI writers/сессии/backup и остальные crash windows этим не проверены.

### Immutable native session inventory

`AdminConnection.inspectSessionInventory()` сохраняет отдельный command-bound
whitelist snapshot с sessionIdentityQualified:false, в отличие от diagnostic
latest-view session-observations.json. Последующий inspect не меняет snapshot.
`readAdminSessionInventory` проверяет private/canonical admin root, source SHA,
exact identity/schema, unique remote row IDs, native inspect command SHA,
desired/reply hashes и ordered command timestamps. SessionGuid и CreatedAt
могут быть null; activeOperations всегда unknown/null. Это наблюдение, без
ownership/close/delete/readiness grants; generic inspect остаётся fail-closed.

TDD missing API/export RED→GREEN; malformed/changed sources, wrong epoch и
negative count refused.92 unit PASS/396 (15.58s),1 installed CLI SKIP; native1
PASS/57 (15.48s), typecheck/diff PASS. Два immutable snapshots и command hashes
проверены с continuous native admin closure; research pair не изменялась.
Private600 `native-session-inventory-6cfbb015-71ba-493d-b20c-adb94d632330/snapshots.json`
SHA256 `354e282c8e435279c017a08655ee81a195904962c357651a77564b68fea801b3`.
Actual CLI user-session correlation и durable runtime session ledger ещё open.

### Management process и before/after observations

При переданном trusted admin `superviseManagementProcess` получает immutable
before snapshot до dispatch и сохраняет его ref в planned entry. After snapshot
добавляется только после qualified continuous local process closure. Reader
проверяет обе native source chains с exact controller root/ServerIdentity,
сравнивает command interval с actual process lifetime и отказывает при обратном
порядке либо изменённом source. Snapshot поле optional для прежних process-only
records; sessionIdentityQualified остаётся false, release grants не добавлены.

TDD actual installed CLI status не имел snapshots RED→GREEN; native2 PASS/16
(17.10s), final source-complete native target1 PASS/12 (14.67s),166 unit PASS/612
(72.67s), typecheck/diff PASS. Native installed controls находятся в
parallel-lifecycle-integration.test.ts. У неподготовленного CLI status нет
пользовательской Loginom session: это проверка wiring/process/native observations,
а setup/check/recover session attribution, parent activation и active cleanup
остаются открытыми. Research admin process closure confirmed, own fixture removed.
Private600 `native-management-sessions-5a141ba0-0109-4bd0-97f3-80dc8f980d64/management.json`
SHA256 `65b242b94c7379ef1df3b0a167117b8e2859faf63ae39c7e83874591a34bc745`:
16 independent checks связывают manifest/process proof, both snapshots/commands,
intervals и admin connection/dispose/continuous closure. Нет model/judge calls.

### Native CLI observations during execution

Trusted admin sampler пишет новые immutable session snapshot refs в planned
management entry, пока supervisor выполняет CLI. После завершения сохраняются
observations, пересекающие controller process lifetime; reader проверяет эти
source chains/identity/unique refs/intervals. При ошибке sampler actual process
settlement всё равно ожидается, запись остаётся unconfirmed. Legacy records
без during читаются с пустым массивом и не получают новых grants.

Реальные installed CLI setup и check проходят с browser.state=verified на
disposable native account (wire creation/configuration/ACL/activation). Для
каждой команды observed ровно один новый managed ID, отсутствующий в baseline,
с неизменными Name/CreateTime и Count0. Setup eval-a:3 и check eval-a:4 остаются
pending после CLI exit; их нельзя считать closed. Fixture использует data-only
slot authority для внешнего native research, production activation/session
ownership ledger/close/readiness ещё open. Native CreateTime отличается от
controller clock на3ч: использовать только opaque equality, не host-time bounds.
Controller command timestamps отдельно проверяются относительно process proof.

TDD missing during RED→GREEN;166 related unit PASS/612 (77.76s), extended reader
target1 PASS/17 (2.30s) с out-of-window/duplicate refs controls; final native3
PASS/35 (90.82s), typecheck/diff PASS. Private600
`native-cli-sessions-4c5a22e9-8f43-413c-8067-f0836648432a/cli.json` SHA256
`baf21b38296da5a8d3b805fc87287edab79808265a647c9540b2ed67c152ccb7`:
25 setup+28 check during observations,192 independent source/process/admin/wire
closure checks, exact own pair/root absent. No model/judge calls. Recover-created
sessions и positive targeted CLI-session close остаются отдельными gates.

### Immutable management command outcome

Каждый новый management process сохраняет private `management-result.json` с
identity/command/slot/lease/profile/owner/operation, actual process-proof reference,
exit code/interruption/timeout и SHA256 raw stdout. Reply сохраняется только как
whitelist url/username/hasApiKey/ok/known code/browser state; credentials и
произвольные поля не копируются. Raw stdout не архивируется этим receipt.
Inventory содержит result source SHA; reader проверяет exact context/schema,
process binding и whitelist. Старые process-only records без result остаются
совместимы и не получают подтверждённого command outcome.

TDD missing result RED→GREEN; changed source rejected, password canary absent.
Target1 PASS/20 (2.83s),166 related unit PASS/618 (64.62s), native setup/check1
PASS/20 (65.73s), typecheck/diff PASS.
Native сравнивает stdout SHA с actual returned bytes и получает browser verified
для обеих команд. Private600
`native-cli-sessions-13c29bbe-7605-40db-abb4-2293c2aa8d94/cli.json` SHA256
`8ef0738db7f18dec6ca07d68dfec3c98cd4a577b0e4f5792c2eba781de3f777c`:
result source/process SHA links и192 full source/closure audit checks PASS;
own pair/root absent. Это prerequisite для ownership ledger; production
activation, positive targeted close и full readiness ещё открыты.

### Protected sources в native CLI fixture

Fixture получает staged secret/nonce через production preparation API, связывает
actual native blocked creation с `claimUserOwnership`, configure reply с
`recordUserConfiguration`, пишет activation intent до wire activation. Native
command journal лежит внутри controller root; после closure его exact receipts
копируются в private evidence вместе с authority metadata (без raw credential).
Existing APIs прошли эту композицию без production edits. Temp slot locks и
external wire adapter здесь не заявляют production activation/active release.

Native1 PASS/22 (53.97s), typecheck/diff PASS. Private600
`native-cli-sessions-f7fddcee-1366-4627-bbbe-289510420cf6/authority.json` SHA256
`390717aa9e0de0490e14f57c8ea98c50ff77bd7b4b3d4010537d7061bc7d78e7`:
19 source/generation/user-ID checks PASS. CLI SHA256
`7d4a85d976fb3702de8344fa72ee4bd6c4ba32795c5b67bab98458a46bb0af7f`,
195 full source/closure checks PASS, exact own pair/root absent. Следующий
ledger должен сохранять frozen descriptor каждой management-команды: mutable
whole-inventory SHA меняется при append и не должен инвалидировать старую сессию.

### Durable management-session ownership ledger

`recordManagementSession` / `readManagementSession` связывают held normal slot
lease, protected preparation/user generation/activation, verified CLI outcome и
continuous process proof с exactly one новой own managed row относительно
before snapshot. Setup использует свой exact process/result; check — preceding
verified setup того же profile/username/endpoint. Remote ID/Name/CreateTime
остаются неизменными в observed window, Count0; after row не может сменить
identity. Actor содержит run/slot, management owner/operation и attemptId:null.

Frozen process и connection descriptors входят в private session record.
Общий `readManagementProcess` qualifier проверяет frozen sources по тем же
правилам, что live inventory. Поздний append не инвалидирует старую запись;
exact retry сохраняет её, changed binding отказан. Kind owned-management-session
сохраняет immutable state observed; effective closed читается из отдельного terminal receipt (см. ниже). Failed CLI/recover/status sessions
и recovery-only lineage остаются открытыми. Native CreateTime остаётся opaque,
sessionGuid не выдумывается. Общая readiness не изменена.

TDD missing module RED→GREEN; exclusive native1 PASS/31 (52.46s),166 related
unit PASS/618 (68.88s), typecheck/diff PASS. Private600
`native-cli-sessions-429167f3-9b12-4ccd-aa10-ae3899687aba/cli.json` SHA256
`b9d9e6a26bb80fbcf8c19fe5626c95218a68428cd00e36451263fe0a99954e71`:
204 independent source/generation/actor/closure checks, own pair/root absent.
Предыдущий combined native+unit run получил EACCES на фоне proc-denial control; точный PID не атрибутирован:
fixture00q2hZ retained в blockers. Native browser qualification выполнять
отдельно также от unit suite с nondumpable/proc controls; proof не ослаблен.

### Targeted close of actual CLI management sessions

`closeManagementSession` uses the normal held slot ledger and current server
identity. Serialized dispatch rereads protected/frozen sources and verifies the
pair under the held server fence. Native adoption validates the immutable
management claim, user generation/activation, process/result and native snapshot
hashes before fresh account and row inspection. Only the exact pending Count0
row can close; ambiguity or changed identity refuses the operation.

An immutable observed ledger remains separate from its private close receipt.
The latter binds the original ledger semantic SHA and actual confirmed close
command/reply. Reading reconstructs both chains. A confirmed repeat performs
no RPC and preserves terminal bytes. This covers successful setup/check and explicitly interrupted check after a
verified setup (see below), normal ownership only; recovery, failed CLI and active attempts
remain open. SessionBackup and production readiness are not qualified.

Native source-adoption RED→GREEN1 PASS/37 (53.17s): closing check preserves
setup, then setup closes and an exact retry sends no command. Private600
`native-cli-sessions-9ed7c989-708e-4c07-a8d4-21bb1707518c/cli.json` SHA256
`31dbf23adf28c9cbf7808891a2e5467c59d3d634e3bccf8660f799febe991724`;
221 independent source/closure/cleanup audit checks. Terminal receipts and
actual close commands are retained in closed-sessions.json; own pair/root absent.

Final native source-corruption regression1 PASS/39 (55.39s): null terminal
and changed close-command replyHash refuse; exact restored sources read back.
153 related unit PASS/633 (62.13s), typecheck/Node syntax/diff PASS. Final
private600 native-cli-sessions-25f6d5cd-06c2-4c3b-bbd2-d6e6fa2acdbe/cli.json
SHA256 254bec2fac4bbf48ebabf6f793341a00c3d490a8e2c101f22f8dc9651139fb2f;
212 source/close/cleanup audit checks, exact pair and root absent.

### Parent activation prerequisite

`activateOwnedUser` admits only a normal held slot with protected preparation,
owned native account and confirmed configuration. Its published physical root
must match the protected generation and native inode/device/owner, be empty,
and coexist with a full empty shared-directory policy. Only then is the
activation intent persisted. Serialized fenced dispatch rechecks sources and
physical storage; native activation checks exact account, LocalAuth, safe roles
and full ACL before and after unblocking. A private activation receipt binds
nonce/user generation and the actual command/payload/reply semantic hashes.

Repeat calls preserve intent nonce and configuration/password; the native reply
reports activated:false after the first confirmed activated:true. This per-user
primitive grants no all-slot readiness, production dispatch or cleanup release.
The preparation journal stays non-ready; activation intent fences the
unactivated finalizer. Failed/unknown activation retains its evidence.

Missing API RED→GREEN native1 PASS/10 (40.76s); final native2 PASS/71 (44.48s)
includes missing owner/configuration/root, dirty root and closed/recovery-only
lease refusals.67 related unit PASS/328 (5.47s), typecheck/diff PASS. Private600
native-parent-activation-c7e5cde7-2c2f-4afa-8eff-d0a12b556f2b/activation.json
SHA256 80b317a3e940c978a34c1e61d8b7fa48670638ce0a27392fcf566cc74bfe0c46;
28 source/closure/cleanup audit checks; exact own pair/root absent. Earlier own
RED fixture dGorw5 was recovered through public recoverUnactivatedPreparation,
released, destroyed and removed; private recovery evidence preserved. The
permanent research pair and other incidents were not changed.

### Composed parent and installed CLI qualification

The disposable native CLI fixture now provisions through the public trusted
parent APIs: createBlockedUser, configureOwnedUser, reconcileOwnedAcl,
prepareUserStorage and activateOwnedUser. The same fenced administrative context
then observes actual installed setup/check, persists the ownership ledger and
closes each exact session. Raw wire provisioning has been removed. Evidence
retains protected storage/activation receipts and their actual source commands.

Missing parent activation receipt RED→GREEN native1 PASS/33 (59.50s),
typecheck/diff PASS. Existing retry, corrupted source/terminal and peer-row
preservation controls remain. Private600
native-cli-sessions-d31c525d-97b8-47e1-a742-2bffa28585b2/cli.json SHA256
015203931b70d774bc0e85afe4c1be421e51e19708ab6dd7e4124f7a1ad2ba49;
240 source/generation/process/closure/cleanup audit checks, own pair/root absent.
This is normal management composition under temporary research slot authority;
production preparation, release, failed CLI/recovery lineage, active attempts
and SessionBackup remain unqualified. Model/judge calls remain zero.

### Configured status and no-op recover observations

Actual installed status and recover with no pending recoveries now run through
the same protected native fixture. Their private evidence retains whitelisted
view state plus immutable result, continuous process and native snapshot source
chains. No new user rows were observed during or after either command, and
recordManagementSession refused ownership. Appending both commands preserved
the earlier setup/check ledgers and subsequent exact targeted close.

The product schema makes recoveries optional; an absent field denotes no
pending entries. Observed starting/browser:unknown remains unchanged and grants
no readiness. This qualifies metadata/no-op behavior only; pending recovery and
failed CLI session ownership still need their own proofs.

Native1 PASS/47 (69.85s), typecheck/diff PASS. Private600
native-cli-sessions-1c1a6e34-8600-4dbb-a3d2-0078e9044f9c/cli.json SHA256
5f8fdbeef7a76e078a1bc305d287c1551e6ba0cc8d0d3fa6f6595b0302883619,
with readonly.json;295 source/close/cleanup audit checks, own pair/root absent.

### Management cancellation transport

`management` accepts an optional AbortSignal and forwards it to the existing
process supervisor, including the durable inventory path. An actual OS probe
waits for its own readiness marker before cancellation; confirmed process
closure and immutable interrupted:true/timedOut:false result are required.
Signal forwarding does not grant session ownership, readiness or full-run SIGINT
orchestration. Native interrupted-check ownership remains the next gate.

RED ignored signal reached timeout; forwarding makes the target pass1/23
(3.41s). The first combined run timed out because the cooperative probe handled
only SIGTERM while the supervisor starts with SIGINT and a30s grace period.
The probe now explicitly handles SIGINT; its10s limit and all assertions remain.
Final combined75 PASS/239 (51.58s), five isolated repeats PASS/115 (15.27s),
typecheck/diff PASS. No supervisor timing or ownership predicates changed.

### Interrupted native check ownership and close

A check interrupted after its newly created own native row is observed can
leave a pending Count0 session despite confirmed local process closure. Its
ledger may now qualify ownership using a preceding verified setup of the same
protected profile/user/endpoint, continuous process evidence and exactly one
stable new native row. The narrow path requires interrupted:true and
timedOut:false. Successful setup/check requirements remain intact; ordinary
failed results, timed-out checks and failed setup do not enter this path.
Ownership authorizes the existing exact pending Count0 native close only and
grants no readiness, storage deletion or release authority.

The native fixture watches immutable during snapshots, aborts only after a new
own row appears and settles both the child and observer. Actual exit130 has
reply:null and confirmed local closure; the server row remains pending.
RecordManagementSession initially rejected this source (RED). Final GREEN1
PASS/57 (92.23s) closes that row while preserving both earlier setup/check rows.
The two original sessions then close normally. Data-only result controls around
the actual frozen sources refuse interrupted:false and timedOut:true; original
producer receipts are restored before real ownership and close.68 related unit
PASS/351 (9.06s), typecheck/Node syntax/diff PASS.

Private600 native-cli-sessions-a0b79119-6a44-4835-9d0c-fc6527b61503:
cli.json SHA256 95d81ad09927e5a4a7283fa5827afec861518dd1046bd08d1f64ac1324ceab65;
cancelled-check.json SHA256 6475d81993cb19d96cb97b95740d4adc2a6e2f65e502a61b3d7291991b898aaa.
The audit retains semantic hash links to authority/readonly/cancelled/terminal
artifacts and performs346 source/process/close/peer/cleanup checks; own pair and
root are absent. Recovery-only lineage, failed setup, timeout, pending recovery,
active attempts and SessionBackup remain separate gates. Model/judge calls0.

### Durable registration of management inventories

Before dispatch, the producer persists one command-level managementInventories
entry binding the exact inventory file, slot, lease token and profile. Journal
updates are serialized across parallel slots. Reuse preserves command bytes;
an alternate file for the same slot or overlapping inventory/profile/token
binding refuses admission. Files and schema remain private and canonical.
The registry makes producer evidence discoverable; it does not qualify process
closure, session identity, archive, deletion or release by itself. Legacy
source readers remain compatible; future finalization must independently
validate every registered source and refuse unknown sessions.

The `test` and `test:unit` scripts use a30s default runner budget for real durable
filesystem transactions. Their assertions, production operation deadlines and
longer native test budgets remain unchanged; direct `bun test` needs an explicit
`--timeout 30000` for the same default. This does not qualify live admission.

`sealManagementProcessInventory` seals one normal slot under its held server and
slot leases, serialized with producer registration. Its private sidecar binds
the exact inventory SHA and command/epoch/token/profile. A live producer refuses
sealing; repeat preserves the receipt, and inventory drift refuses all readers.
Further commands for that slot stop before CLI dispatch while peers retain
admission. This local producer fence grants no storage deletion or release;
the all-slot finalizer and SessionBackup gate remain mandatory.

`archiveManagementSlot` uses that fence and the existing durable profile archive
to commit one normal management slot while peers continue. Its private receipt
binds the slot/token/epoch, producer seal, inventory and profile manifest SHA.
History, DB/WAL/SHM and inputs move before server close; credentials remain in
the profile. Replay preserves both receipts, and later all-slot finalization
reuses the same archive. Server sessions and reservations stay held, with
storageDeletionAllowed=false and nextAdmissionAllowed=false. The fake CLI and
actual OS peer barrier qualify local composition. Native A/B also qualifies
seal/archive/accounting/close A inside active B lifetime and preserves B for a
fresh successful check; the earlier failed UID observation remains retained.

Management session accounting also accepts a separately sealed slot while the
command remains cli_admitted. The inventory reader exposes the validated seal
source; the collector rechecks it before returning. An unsealed slot still
refuses accounting, unknown same-user rows still refuse closure, and peer-user
rows remain outside that slot's claims. The finalizing all-slot path is retained.
Data-only snapshot tests qualify the source gate. Exact-source native A/B
passed1/19 (168.88s); independent read-back verifies649 checks over192 source
files, all four CLI and admin continuous closures, same A archive reuse and exact
own pair/network/root absence. Private native-two-users-4a143678... audit SHA
dd7acfd3197a7164153e1acdf2ff884ddc41726794123191d861c1e20fb7684a.
This covers normal Count0 management sessions; full attempt cleanup/recovery,
SessionBackup, storage deletion, release and live admission remain open.

UID-change refusals retain the sampled `/proc/PID` directory UID and a best-effort
stat birth/state without exposing argv. Failed diagnostic reads stay unknown;
the refusal still fails process qualification. These samples do not establish
an atomic identity or retrospectively qualify an earlier failed process proof.

`finalizeManagementSlot` owns normal per-slot archive/accounting/close ordering.
It commits the archive before its fresh complete accounting and first close,
requires fresh closed-session read-back and revalidates the archive before the
private terminal receipt. The shared admin remains live for peers. Receipt refs
bind the slot/token/epoch, archive, inventory, snapshots and both session sources;
they grant no deletion, release or next admission. This covers normal management
Count0 sessions, with attempt actors and uncertain-close recovery still separate.
Native TDD missing API RED→GREEN1/20 (164.00s), related29/126 PASS37.89s and
typecheck PASS. Private native-two-users-33d08445... audit SHA
681f789752552be70ba11d822edfab3353070d1f2551ba9449330ec4e734ee20 verifies628
checks/181 sources, active B survival/fresh check, all four CLI/admin closures,
global archive reuse and exact own pair/network/root absence.

The actual OS child independently reads its registration before executing.
Missing registration RED→GREEN1 PASS/27 (3.54s); parallel owners2 PASS/30
(5.10s), related69 PASS/358 (16.61s), typecheck/diff PASS. Cold native1 PASS/56 (193.44s),181 source/closure/cleanup audit checks;
exact own pair/root absent. Three isolated new-scratch repetitions reproduced the
10s runner timeout twice; the passing repetition took9.21s for that test.
Only the two module-level test guards became30s. The final targeted module
passed2/30 (16.19s; first test10.45s); typecheck PASS. All newly created temporary data uses
TMPDIR=/home/kiselev/storage/tmp per the current workspace instruction;
verification logs and audit artifacts are retained in private research evidence.

The native cancellation fixture retains producer evidence before assertions.
A cooperative SIGINT may settle with exit0 while interruption remains recorded;
exit130 is not a required cancellation contract. A completed check may also win the abort race; that outcome must retain exact
verified success/exit0, not a failed or uncertain response. Interruption grants
no readiness.
Data-only non-interrupted failure/timeout controls explicitly use failed
exit130/reply:null, then restore the actual producer receipts before real close.
An initial native case exceeded its old aggregate200s limit during pair-factory
teardown after all56 assertions and confirmed admin closure. Public destroyPair
resumed the recorded destroying phase, confirmed destroyed and removed only its
own root; the recovered sources passed162 audit checks. That timed-out test is
not a PASS. The fixture now budgets360s for five individually bounded CLI calls
plus native lifecycle; CLI60s, RPC30s and supervisor grace/identity guards remain
unchanged. A separate cold run is required for a passing fixture result.

Cold registry source: private600 native-cli-sessions-1d3cde44-d95a-4a2c-b866-1ae1ac9ad481/registry.json
SHA256 989e512f8f29ce9a90c9e1e991c99cfc87d9ae1fbcf5be74d8fe365935de2e37.
The audit links seven artifacts including actual final inventory, native
observations and terminal commands. New scratch related tests exceeded default
5s and explicit10s guards in6 cases. The related rerun with30s runner guards passed69/358 (94.19s);
functional checks,3s process deadlines,2s cancellation marker deadline and all
production deadlines remain unchanged. The underlying slowdown is not attributed. Previous old-scratch69/358 PASS
is retained as historical evidence, not a claim about the new scratch run.

Final exact-source cold verification:1 PASS/57 (183.05s), private600
native-cli-sessions-08dac3a1-1747-4965-b0d9-df324cb53563/registry.json
SHA256 f266cea3f13072a740b8ae6132ce149d9d9560ea03bc1bb9fa326e82e260d4d6.
The independent audit passed177 checks across seven linked artifacts; exact own
pair/root are absent. The completed-success cancellation race occurred in this
run; the earlier1d3cde44 source retains the actual interrupted outcome.

### Management admission seal

`sealAdminProcessInventory` accepts the held normal slot set for a command in
cli_admitted. Under the admin inventory lock and the management registration
queue, it validates exact command hash, server identity/current producer, complete
slot set and original composite manifests. Each registered file must bind one
held slot/token/profile; all process proofs must qualify, with unique owners and
proof files. Active or changed producers prevent the transition.

Only after these checks does phase become finalizing with frozen managementSources
hashes. Registration shares the same queue: a producer waiting for registration
sees finalizing and refuses before dispatch. New admin admission also remains
sealed. The pre-CLI unactivated path remains unchanged. This transition grants no
session ownership, archive, deletion, readiness or lease release. Recovery-only
management finalization remains unsupported.

TDD: two actual OS slot producers first failed at the old phase gate; GREEN1/8.
A duplicate process-proof control then reproduced an accepted ambiguous source
(RED), now rejected before journal mutation (GREEN1/10). Full held-slot/hash,
active-producer and post-seal dispatch controls passed25 unit/120 (26.71s).
The live OS probe stays alive1s for durable subreaper CLI admission. An earlier
short probe ended with a retained pending CLI identity and correctly failed the
continuous proof; no ownership rule or deadline was weakened. Final-source expanded
regression passed69/370 (105.74s), typecheck/diff PASS. Native seal qualification
passed1/62 (186.23s), separately from all unit suites. The independent audit
passed184 checks across eight linked artifacts; own pair/root are absent.
New CLI/admin admission fails before dispatch, while the existing trusted admin
retains the ability to close proven owned sessions.

Private600 native-cli-sessions-5317c73a-d9aa-4c0f-b16f-6637328f4169/sealed.json
SHA256 e17d353f25a16dc5fdeb53094f834ab9108fe736cf648e720763ec3538200d45.
The native fixture still exercises separate close primitives; an activated
all-owner finalizer with archive-before-close remains the next step.

### Sealed management profile archives

archiveManagementEnvironment validates the exact finalizing normal command, full
held slot set/original manifests and every frozen inventory/process source. All
profiles must pass pending recovery/writer checks before the first profile move.
The existing durable archive engine then commits each private management-token
archive and writes one private receipt binding sealed command, sources, slot tokens
and archive manifest hashes. Exact repeat preserves the committed receipt.
Settings remain in the profile and all reservations remain held. This API neither
closes server sessions nor grants deletion, readiness or release.

TDD missing public API RED→GREEN1/36; a pending B profile initially allowed A to
move (RED), now all-profile preflight prevents that move (GREEN1/38). Related
archive/admin/process36 PASS/212 (41.87s), final typecheck PASS. Final source
tamper/archive/recovery16 PASS/161 (57.11s), typecheck/diff PASS. Native
archive-before-first-close qualification passed1/67 (171.08s), separately from
unit suites. The native fixture now archives before its first session close.
Its data-only canary verifies actual profile movement; all CLI/session operations
remain genuine. A fresh observation retains all three own rows after archive
commit. Subsequent targeted close receipts preserve both earlier peer rows until
their own closes.

Private600 native-cli-sessions-e3acc33c-c586-43e4-baca-d812986b460d/archived.json
SHA256 de0c6b491f9c3dd8cdf5bed7b871c8bc9bbc8604b2f716b932c9940454586369.
The independent audit links nine artifacts and passed188 process/source/archive
manifest/order/session/cleanup checks; exact own pair/root are absent. Automated
all-owner session accounting and unknown same-user refusal remain the next
finalizer step; backup/storage/recovery gates still prohibit release.

### Complete normal management session accounting

collectManagementSessions consumes one held normal slot, a finalizing inventory
whose semantic hash is frozen in the command, and an immutable native observation
after all recorded local lifetimes. It derives every setup/check ownership ledger
through the existing qualifier, including the narrow interrupted-check case.
Readonly outcomes require successful non-interrupted/non-timeout completion.
Every historical same-user row must match its exact causal proxy ID, Name,
CreateTime and zero package count. Fresh rows use a unique Name/CreateTime tuple
under the qualified owned user and current server epoch; proxy IDs may differ
across admin contexts. Closed ledgers cannot account for current rows. Duplicate
IDs, remote bindings or identity tuples refuse accounting. User matching follows
the existing case-insensitive Loginom guard and catches a bare username as well
as username:sequence. Peer users remain outside this slot's ownership.

Accounting rechecks command/inventory hashes before return and grants no close,
archive, deletion, readiness or release authority. It does not qualify failed
setup, timeout, pending recoveries or recovery-only lineage.

Native missing API RED occurred after46 assertions (153.66s). A separate GREEN
attempt failed before this API on setup's continuous Writer owner unavailable
proof; retained root/source/failed public writer-settlement are in blockers.
Casefold unknown-current-row codec reproduced an accepted EVAL-A:9 (RED), now
three case/bare/prefix controls and peer preservation pass3/6. Related37 unit
PASS/185 (48.89s), typecheck/diff PASS. Final exact-source cold native qualification passed1/71 (185.02s); it does
not repair or override the earlier writer proof. Unknown-row
and nonzero-package controls in that fixture are explicitly data-only around
genuine native snapshot sources, restored before any actual server close.

Private600 native-cli-sessions-333b6dc5-ed1b-4368-80d2-04477e2890d1/accounted.json
SHA256 3b79a699bb0ab24a4b2a1521bd4a114af25b8899a32f114189bfaeb5408c5a24.
The audit passed217 checks across ten linked artifacts: complete inventory and
fresh observation, three observed ledger hashes matching later close authority,
archive-before-close and exact own pair/root absence. The fixture still calls
targeted close primitives explicitly; an all-slot finalizer must consume this
accounting for every slot before any close. Actual unknown external-session
acceptance, backup/storage and recovery gates remain open.

### Normal management environment finalizer

finalizeManagementEnvironment seals cli_admitted when needed, archives every
profile, collects every selected normal slot against one fresh immutable native
observation, and only then closes each exact ownership ledger. It requires a
registered inventory for each selected slot. A fresh post-close observation is
reconciled with all closed ledgers; unknown rows refuse confirmation. Admin
disposal and every registered admin continuous process proof precede receipt
publication. Pair identity and the entire archive are revalidated after closure.

The private finalization receipt binds command, archive, before/after snapshots,
admin inventory and observed/closed session hashes. Status sessions_closed grants
no storage deletion or next admission; both fields remain false and all leases
remain held. This is the normal management phase; recovery-only/mixed failures,
backup/storage release and active attempts keep their separate gates.

Native missing API RED50 (184.91s)→GREEN1/53 (291.45s). All three previously open
sessions close through this API; held server/slot guards remain valid.
Private600 native-cli-sessions-fa2f4727-507c-48b1-8e6a-f92d099ac8bb/finalizer.json
SHA256 9b4f5f11e7199caddd884dca7a57fa1126560689eec29201dfde98b0bfa2b60a.
The independent audit passed251 checks across eleven artifacts, including exact
archive/ledger bindings, all3 rows before the API, close→absence→dispose ordering
and own pair/root absence. Typecheck/diff PASS.

A separate real unregistered client negative passed1/56 (211.19s). A genuine
sixth check used the legacy client path outside the frozen producer inventory
before archive; the fresh server list contains four same-user rows. Finalization
refuses MANAGEMENT_SESSION_UNKNOWN before any close. Three known and one unknown
rows retain exact identity/count; no close-session command, closed terminal or
successful finalization receipt is created. Held leases remain valid.

Private600 native-cli-sessions-9a6be541-6bcc-4712-813e-6737fc90062b/unknown-finalizer.json
SHA256 513d1323ebd50f31d587b1c6ff2caa9f649ad4b196bbf544d1d50d2498325e36.
The negative audit passed155 checks across nine linked artifacts, including all
six local continuous process proofs, actual new-row baseline difference, archive
and observation chains, zero close commands and own pair/root absence. These
are genuine native rows; earlier data-only snapshot controls remain separate.
Multi-slot native acceptance and backup/storage release remain open.

Final related regression:53 PASS/346 (104.22s) across management accounting,
process evidence, admin, archive, preparation recovery and user ownership;
typecheck/diff PASS. The normal-path finalizer is implemented; this does not
qualify multi-slot native admission or backup/storage release.


Controlled retained-package ownership and reconnect close (2026-10-15)

The parent observation API accepts an optional fixed `retained-package` mode.
Its native probe creates one empty package without execution, closes only its
own writer context and records Count0→1→1 plus exact pending=true/Count1 after
disconnect. The private parent ledger and reconnect driver both validate this
trace. Only that phase grants Count1 close; normal management claims retain
Count0. Fresh account/epoch/Name/CreateTime checks and bounded absence remain
mandatory. This does not authorize arbitrary active operations or storage deletion.

TDD producer ordinary-phase RED→native1/14 PASS70.65s; reconnect source rejection
RED→native1/16 PASS97.50s, including repeat, fresh absence and both admin process
closures. Private600 native-parent-activation-576bd87a-1f61-42d5-a3f4-3c09e0b822f1
retained-close.json SHA256 c1ef86c7a8b08c6f5abb8fda097ae9a7a1f6e78259a794f4c7c1377287e0b20f.
Independent audit34 checks/5 source artifacts PASS; exact own pair/root absent.
Related37 tests/193 assertions PASS40.78s; unchanged native wire/Count0/reconnect
matrix1/118 PASS72.21s; typecheck/diff PASS. SessionBackup,
CLI SIGKILL, concurrent user B and arbitrary active operations remain open.


Native targeted close with an active peer (2026-10-15)

A dedicated two-user fixture closes only A's retained empty-package session while
B's independently supervised design browser owns a changed named package.
B remains Count1/pending=false in fresh manager observations before and after
A CloseSession; B then completes its native probe, preserves a canary SHA and
produces a nonzero autosave. This qualifies session-close noninterference only.
Storage deletion/regrowth, positive SessionBackup and full live admission remain open.

Managed-row proxy IDs differ across admin contexts for the same exact Name and
CreateTime. The native account and epoch remain bound. Use the qualified full
identity tuple across contexts; require stable proxy IDs within one observation
context. Historical causal/source guards must remain intact. Fresh accounting
now uses the unique qualified tuple; the historical causal proxy/source guards
remain strict. Proxy IDs are not an immutable Session identity.

Native1/78 PASS82.84s; typecheck/diff PASS. Private600
native-user-06b1d620-2a59-40c4-a818-78ba0fe81140/peer-survival.json
SHA256 d96f30d2bebfd6ec770c814ca281945df419d6ce7d1567ed00591fd8941933af.
Audit31 checks/3 sources confirms ordering, native account, both continuous admin
closures and exact own pair/root absence. Fixture-only active-user budgets cover
two logins and2 actual autosave periods; existing normal reconnect and production
deadlines are unchanged. Earlier failures exposed observation after B had ended,
insufficient fixture lifetime, an invalid cross-context ID assertion and teardown
masking. Safe primary diagnostics now persist before teardown; both retained
failed fixtures were removed via public destroyPair after qualified local closure.

Docker read failure diagnostics (2026-10-15): PAIR_DOCKER_READ keeps exit2 and
adds only a safe docker object with operation, numeric exitCode and timedOut.
No argv, stdout or stderr are attached. The existing20s command deadline and
mutation/read-back policy remain unchanged. A real missing-container inspect
reproduced missing metadata (RED) then passed1 test/3 assertions (1.60s); pair
unit11/45, typecheck/diff PASS. No container was created or removed by this test.

Normal reconnect admission before sealing (2026-10-15): both openLoginomAdmin
phase guards accept normal cli_admitted while preserving finalizing and recovery
CLI refusal. The existing held fence, epoch/runtime verification and serialized
register-before-spawn inventory remain mandatory. Public real-fs pre-runtime
RED received SEALED before the missing-runtime check; GREEN1/9 and full admin
24/87 PASS8.91s, typecheck/diff PASS. This test grants no native connection or
registration qualification by itself; the native handoff below qualifies that path.


Sequential native management reconnect (2026-10-15)

A fresh independently supervised admin starts after the first admin's confirmed
closure and before inventory sealing. Actual setup and a completed check supply
two causal ledgers. Both fresh proxy IDs differ while qualified user/epoch/Name/
CreateTime remain equal. The collector accepts those unique tuples and refuses
an extra unknown row, nonzero package count and a duplicated tuple. Historical
IDs and source hashes remain mandatory. The finalizer archives, targets both
owned sessions, confirms fresh absence, then closes the replacement admin; both
continuous closures remain in the final inventory. The terminal receipt grants
neither storage deletion nor next admission; the leases remain held in the test.

Native RED MANAGEMENT_SESSION_UNKNOWN218.39s → GREEN1/38 assertions145.30s.
Private600 native-cli-sessions-59b958c6-adfe-44e7-9b32-f4f5ef7949e4/finalizer.json
links terminal SHA25632005ebddb881422099d6c6bd4b02882fd62ecbafc8a386d3110aed323255eb5.
The audit passed145 checks across15 artifacts and read-back: frozen source hashes,
full native owner/epoch bindings, changed proxies, exact adopted close authority,
archive-before-close, sequential admin lifetimes and exact pair/network/root
absence. Docker network disconnect/destroy events independently link both exact
container IDs to the deleted network; successful same-daemon listings confirm
absence. Post-run source hashes/mtimes are recorded separately; no missing
controller journal is synthesized.

Related39/262 PASS66.19s uses runner --timeout30000 for durable filesystem tests;
its unchanged assertions/fsync passed beyond the old5s budget (6.6/10.8s). The
subsequent admin suite passed24/87 in8.91s, typecheck/diff PASS. The read-back test
now gives its new RPC a fresh absolute deadline. Production20/30/60s deadlines
are unchanged. Reconnect isolates completed setup/check; readonly/cancellation
remain separate cases. Additional CLI continuation after an admin handoff is not
qualified by this end-of-management test; historical cross-context accounting
remains a separate gate. ARCHIVE_TOPOLOGY after an actually interrupted check and
the retained writer/proc incidents remain open. SessionBackup, scoped storage
cleanup/release and full model/judge admission are still unqualified.


Live native cancellation hint (2026-10-15)

The test-only observer reads the mutable management manifest as a hint, because
an open descriptor can have nlink0 after a producer's atomic rename. A real
filesystem control confirmed that mechanism; it does not attribute every
LEASE_FILE_PRIVATE predicate from the historical run. Immutable observation
receipts and the settled manifest still pass the normal strict readers before
ledger/close authority. Production receipt readers and deadlines are unchanged.
Native observer RED LEASE_FILE_PRIVATE → finalizer GREEN1/53 in174.94s; the check
completed before abort (exit0/interrupted=false/timedOut=false). This does not
qualify an actual interrupted check or resolve historical ARCHIVE_TOPOLOGY.
Private native-cli-sessions-70a965d2-d5ad-4a7e-a08c-867e05d4e394 retains eleven
artifacts; audit154 checks/read-back passed. Terminal SHA256
2f1da0101ea409ef44fab1c7fd9d04047c5074700fc0002042e156e7b5427475 binds three
owned session closes, durable archive before close, fresh absence, five confirmed
CLI closures and one admin closure, with no storage/admission grant. Same-daemon
Docker listings and lstat confirm exact pair and temporary root absent.


Frozen process windows are contained by the declared run window. A qualified
proof whose dispatch precedes run startedAt or whose exit follows finishedAt
returns failed RESOURCE_PROCESS_RUN_WINDOW_MISMATCH. Source integrity and exact
owner/producer/launcher checks remain mandatory. The real two-supervisor test
previously passed after narrowing the declared run to its final timestamp; it
now rejects that temporal mismatch and accepts the complete window. Target1/13
PASS4.92s, related86/606 PASS26.47s with runner30s, typecheck/diff PASS. Component
declared-only subwindow behavior is unchanged; full runtime actor journal and
pre-spawn admission remain separate unfinished gates.


New attempt directories and infra-error archives are created0700 so the normal
private resource proof reader can qualify both the original CLI call and its
retry in place. Existing directories and historical runs are not chmodded. An
actual fixture main retry first failed RESOURCE_OUTPUT_PRIVATE, then passed the
public readResourceProcessWindows for two distinct launcher births of slot a
(target1/11,19.59s; typecheck/diff PASS). This qualifies those persisted process
sources; it does not yet supply a complete pre-spawn run actor inventory.

Related main/parallel/resource run:55 PASS/2 FAIL/459 assertions341.77s; the retry
case also passed15.70s. Remaining failures are the historical fixed-sleep
round-crossing assertion and an explicit30s slot-listing test timeout. The
former assumes complete fast recovery/archive/receipts within the slow CLI's3s
sleep; queue execute includes that durable cleanup and promises no such3s bound.
No production queue/deadline change or successful full regression is claimed.


The independent-queue fixture now supplies parallel-round-crossing.json only to
the slow task. Slow#1 waits at most10s for the actual fast#2 trace in either
owned workspace root of the same run, then records that process PID. Missing or
ambiguous peer traces fail; there is no sleep/success fallback. The original
start-before-finish, four unique PIDs and archive/auth/DB assertions remain.
This removes the unsupported assumption that the whole fast recovery/archive
pipeline finishes within the slow fixture's fixed3s delay. RED missing peer PID
→GREEN1/16 in23.35s; typecheck/diff PASS. Production queue and other scenarios'
deadlines/delays are unchanged. The separate listing case passed an unchanged
isolated rerun1/6 in11.48s; its earlier30s timeout cause remains unattributed.

The full parallel-run module then passed25 tests/164 assertions in260.21s,
including both former failures with unchanged explicit30s case limits. Trace
publication now writes a temporary file then atomically renames it, so the live
peer never reads partially published JSON. After that refinement the crossing,
listing and retry targets passed3/33 in51.92s; typecheck/diff PASS. Historical
55/2 logs remain unchanged. The single listing timeout did not recur across
isolated, complete-module and final target reruns; its exact cause is not
attributed. A new full repository/package regression has not been claimed.

Per-slot eval-agent inventory now records a planned entry under the held slot
lease before the actual supervisor can spawn. Each launch gets its own private
controller directory and a canonical copy of the original continuous process
proof; moving an initial attempt into infra-error does not change that source.
The sealed reader rechecks command/slot/producer, source SHA, private topology
and the shared continuous closure qualifier. Concurrent launch/seal and late
launch are refused. Unconfirmed entries retain the open inventory/fence.
Fixture runAgent consumes this producer; healthy slots seal it before release.
This is agent-process evidence, without storage/release/admission authority.

Actual short CLI observed its planned entry before its own work; cold1/10 PASS
2.40s. Actual main retry RED missing inventory→GREEN1/13 PASS19.06s; the later
related run also passed29.79s and matched both canonical launcher births/SHA
against moved/current original proofs. Typecheck/diff PASS. Full resource actor
aggregation, production main admission and live qualification remain open.

Related shared-cache run:66 PASS/1 FAIL/389 assertions400.40s; missing proofs
for earlier intentionally failed CLI scopes were correctly refused. Test scripts
now use Bun --isolate (0026c5ecd6), preserving the production registry/guard.
The isolated related run passed that resource gate but ended62 PASS/5 FAIL,
1 unhandled error/379 assertions411.75s: crossing and quarantine hit explicit30s;
clean-stop refused profile-owner PID457454, and the agent primitive baseline
refused EACCES /proc/457454/exe. Its subsequent cold rerun passed. A separate
JUDGE_VERSION_UNCONFIRMED source was not saved, so it is not attributed to that
PID. The PID was absent on later readback; no ownership inference or signal is
permitted. Exact timeout phases were not preserved by old fixture teardown.
Private logs agent-process-inventory-{related,isolated,cold}.log under
management-registry-20261015 retain these outcomes. No full-suite PASS is claimed.

The two four-attempt fixture tests now budget60s and retain their exact root on
failure. Their unchanged assertions passed in30.51s (crossing) and51.86s
(quarantine), both beyond the former30s limit. The same targeted command ended
3 PASS/2 FAIL/43 assertions117.24s: the unknown-judge fault injector gave up
waiting for preparation after10s, then deleted its root while main was still
running. Its pending rejection opening judge-unused.json appeared in the next
retry test (ENOENT of that other root), not as a retry ownership failure.

That fault-injection fixture now waits at most30s for dispatch, handles early
main rejection, awaits the pending main in finally and removes its root only
after successful assertions; its total budget is60s. Real unknown-judge then
retry controls passed2/19 in37.28s with no error between tests. Original
quarantine/remaining-slot/retained-judge assertions remain. Production deadlines,
10s peer gate and cleanup policy are unchanged. The earlier unattributed
JUDGE_VERSION_UNCONFIRMED/EACCES signal is not retroactively explained by this
separate observed teardown race. Logs agent-inventory-fixture-controls.log and
agent-inventory-fault-drain-green.log preserve both outcomes.

Frozen resource admission now requires a sealed agent inventory for every
selected slot. Its expected file is state_dir/run_id/agent-processes-<slot>.json;
unsafe run paths, duplicate/foreign slots and alternate files are refused before
opening a replacement. The reader binds captured semantic SHA, command/slot and
producer, then derives every process source through the shared closure reader.
These sources are combined with other declared actor proofs; callers cannot
remove one agent launch by shortening processProofs. Missing inventories return
RESOURCE_AGENT_INVENTORIES_INCOMPLETE. Both process_sources and qualified
agent_inventory_sources are returned for audit. Declared-only calls remain
compatible. Complete management/admin/judge census and production main remain open.

TDD actual two-supervisor RED: sealed slot proof was ignored and returned
RESOURCE_SLOT_PROCESS_PROOFS_INCOMPLETE instead of checking the observed judge.
GREEN derives that proof, accepts the complete process window and refuses
missing/duplicate/foreign/path/hash/producer/unsafe-run controls. Related38/338
PASS20.21s across5 files; policy/sampler/collector/judge58/350 PASS12.94s across4;
typecheck/diff PASS. These are component checks, without live admission authority.

During this change the retained Gj27dk fixture captured a real boundary refusal:
judge launcher487344:140855147 was unverified with null cgroup in frame4 at
13:32:32.374Z,11ms before its persisted exit32.385Z. Earlier active frames were
verified. This correctly makes the full resource gate incomplete; no null was
replaced with zero. The fixture now releases its actual stdin-waiting children
after two fully observed active frames, retaining the original full-gate PASS
assertion, baseline and final bracket,1000ms interval and all ownership checks.
A diagnostic baseline regression returned RESOURCE_TIMELINE_UNBRACKETED before
the original baseline wait was restored. Final target1/14 PASS5.05s, then the
related run included all additional refusal controls. Failed roots retain their
sources until a separate exact-own synthetic-fixture cleanup audit.

Synthetic-only cleanup completed for Gj27dk, lpnecH and old retry StJZ4H.
The shared qualifier accepted all9 original/canonical continuous proof files;
fresh PID:birth checks found no matching live identities. All141 source files,
including raw samples and the interrupted reservation temporary, were copied
and read back in private600 closed-synthetic-units-full.json (SHA256
03e7111569c35b5a9f9788486f2394d758090d01204869a570432aa3358e4d07).
Free custom test OS guards were held while exact-root ownership and every
source byte hash were rechecked and the three temporary roots removed. Private
closed-synthetic-units-removal.json readback confirms3 roots/signals0 and no
native authority. The superseded subset audit was removed only after checking
that the full copy contains all its exact documents/proofs. EACCES aeGGa8 and
every retained native incident/permanent pair remain untouched.

Readonly licence source boundary: installed public bg/about/About.js selects
Session.Version.SerialNumber and PlatformEdition; its expiration display is
explicitly null. The exact IBGDeductorServerVersion exposes only ExpirationDate
1930, IsWindows1931, PlatformEdition1928 and SerialNumber1929. This identifies an
edition readback candidate, without a capacity getter in that interface. It
does not prove absence of another licensing API or an actual concurrent-user
limit. No runtime serial/key was read. Private licence-primary-boundary.json600
contains6 source hashes/descriptors, readback and file SHA256
55591cdf9b45a76e967f11caff23e1be1a8674315aab814ef9a32b7b895b826f.
Live edition/assignment/capacity and simultaneous-user qualification remain open.

Current affected-file regression at68d92ab783:67 PASS/0 FAIL/406 assertions
402.32s across CLI, main fixture, process resources and agent inventory, with
--isolate. This supersedes neither historical failed logs nor the remaining
native/full-package qualification. Log agent-inventory-current-regression.log.

Post-dispatch inventory IO and held-lease failures now preserve the measured
CLI exit/stdout. A narrow publication exception boundary marks returned cleanup
failed, keeps the source native proof unchanged and retains the planned/open
inventory when publication cannot finish. Held authority is rechecked before
canonical copy and final publication. Pre-dispatch refusal still throws before
any measured CLI result exists. Fixture cleanup receives failed status and
retains its fence; this creates no storage/release grant.

Three actual child controls independently replaced the canonical proof with a
directory, replaced inventory with a directory, or replaced its custom test
guard inode. RED3 FAIL exposed post-dispatch EISDIR/EISDIR/LEASE_GUARD_CHANGED;
GREEN preserved exit0/stdout with failed cleanup, qualified the unchanged native
capture and refused seal in every case. Primitive4/33 PASS5.98s; after the final
unknown-safe assertion adjustment, current agent/resource/main-retry targets
6/69 PASS36.14s, typecheck/diff PASS. Earlier67-test regression is the preceding
version, without this last delta. Logs agent-inventory-result-retention-{red,green}
and agent-inventory-final-targets retain evidence; own fault roots were removed
only after the original continuous capture qualified and custom guard closed.

Fixture main now acquires its judge-home lease before judgeInfo/--version, as
well as before the first agent. Inputs/rubric hashing happens before acquiring
contexts; a judge admission rejection closes acquired slot/judge OS guards and
retains their durable reservations. Successful fixture draining and legacy
execution keep their existing cleanup paths. Production main is still gated.
Actual held-home RED observed fake --version write before BUSY; GREEN refuses
before that write, keeps holder reservation unchanged and dispatches no agent.
Occupied-home/skip-judge/unused-model-admission controls3/9 PASS15.20s,
typecheck/diff PASS. Logs judge-version-lease-{red,green}. Version/exec process
inventory binding is the next step; lease ordering alone does not qualify the
complete judge runtime census.

Fixture --version and every judge execution now share the existing protected
pre-spawn judge process producer under the acquired home lease. The inventory
is created in private controller state before profile preparation; run passes
that capability to both judgeInfo and task settings. Finalization reads every
canonical entry with readJudgeProcessInventory and the continuous closure
qualifier, instead of globbing only attempt outputs. Its release receipt thus
includes --version as well as all measured/retry judge launches. Failed cleanup
still retains the home fence; source paths remain outside agent mounts.

Actual main RED: successful run had no judge-processes.json. GREEN returned two
distinct qualified births, actual version stdout and a canonical exec source
whose SHA matches the original attempt capture; both sources occur in release.
Inventory/occupied-home/unknown-cleanup controls3/17 PASS29.90s, typecheck/diff
PASS. Logs judge-runtime-inventory-{red,green}. The reused schema keeps its
historical offline-judge-processes kind; this synthetic fixture grants no native
admission or recovery authority. Sealed census consumption by the resource
coordinator and other runtime actor classes remain unfinished.

Judge process inventories now expose a stable source SHA and sealed flag.
sealJudgeProcessInventory requires the held home guard, qualifies every entry,
checks the complete inventory stayed unchanged, durably writes sealed and reads
it back. Concurrent launch/seal and late launch are refused before spawn.
Undefined state on historical offline snapshots remains unsealed and does not
rewrite the source; other unknown states are invalid in both reader/producer.
The closed census is evidence only, without standalone cleanup/release authority.

Actual short judge observed its planned entry before its own work; concurrency,
late-dispatch/source-preservation and historical timeline controls passed.
An additional RED state=unknown actually dispatched a child; GREEN refuses before
the child marker. Judge/process/offline environment related57/267 PASS111.48s
across3 files, typecheck/diff PASS. Logs judge-inventory-seal-{red,green,related}
and judge-inventory-state-red. Fixture finalization still needs to call seal;
resource admission does not yet consume this closed census.

Fixture home release now seals the complete judge inventory and rechecks its
captured SHA before writing inventory_source plus every qualified process proof
to the release receipt. Actual main RED previously returned sealed=false after
release; GREEN returns sealed=true with matching source. Unknown cleanup skips
sealing and retains its home fence. Target2/15 PASS30.18s; complete current
main/recovery/offline-admission31/233 PASS351.90s across3 files, typecheck/diff
PASS. Logs judge-fixture-seal-{red,green} and judge-census-main-recovery.log.
This closes the synthetic judge census; the resource coordinator must still
consume it alongside complete native management/admin sources. Live auth/home
qualification and production model admission remain unchanged gates.

ARCHIVE_TOPOLOGY now carries only same-lstat diagnostic metadata in Error.cause:
path, normalized kind/POSIX type, mode/nlink, UID/GID and device/inode. The native
fixture persists that cause solely for this code in its private failure receipt.
No file contents are read for diagnostics; the original message/exit2 and refusal
before move/publication remain. Actual external hardlink RED lacked cause;
GREEN matches the exact inode/nlink2 metadata while both names/bytes survive and
no journal is created. Full archive11/69 PASS18.02s, typecheck/diff PASS; logs
archive-topology-metadata-{red,green}. The historical missing native topology is
still unknown; this instrumentation is for the next actual failure, without
weakening hardlink/foreign/special-file refusal.

Actual strict interruption control47d5228b... now observed exit130/interrupted=true,
confirmed continuous cleanup, and the same-lstat cause identifies an AF_UNIX
socket at profile/cache/tmp/org.chromium.Chromium.55uJMQ/SingletonSocket
(type0140000/UID1001/nlink1), rather than a symlink or regular hardlink. Root
jothVh and exact disposable pair remain retained. The older f5bf... topology
was lost and is not retrospectively attributed to this object.

The durable archive now recognizes socket objects after its existing settled
profile gate. Rename preserves device/inode/type/mode/size; socket objects have
no file payload to read/fsync, so the containing directory persists their name.
Regular files and sockets still require nlink1, ownership and existing frozen
identity checks; unsupported special files still refuse. A real child creates
a Unix socket and is SIGKILLed before archival: RED ARCHIVE_TOPOLOGY→GREEN
committed move/replay, original name absent, identical socket inode/metadata,
symlink object/DB/auth preservation. Full archive12/78 PASS17.29s, typecheck/diff
PASS. Native archive/finalizer qualification is pending a fresh exclusive probe.

Strict native interrupted-finalizer8196b708-d490-415e-b559-75f4e69547bf now
PASS1/35 (116.68s) after socket fix0961fe343d. The test pauses only its admitted
CLI identity through signalProcess's fresh birth/executable check once its
independent SDK host/browser is observed. It waits for the native new session
row, requests the normal AbortSignal, observes pending SIGINT and always guarded
SIGCONT in finally. The final public result must be interrupted=true (actual
exit130/timedOut=false), with exactly that paused identity in its confirmed
continuous cleanup proof; successful completion cannot satisfy this control.

Setup plus interrupted check produce two distinct qualified origins/owned
ledgers. Sealed census→committed archive→two targeted native closes→fresh absence
and confirmed admin closure pass. Private finalizer-audit.json checks124
conditions/12 private source hashes and exact pair/root absence on the same
Docker daemon; read-back audit SHA102495e2bb65a35411af0cb8cc9049206794bd73c9e3aecfd1f77ec613a3788f,
terminal SHA968101397334a031aeb12097a4db9662082e5e0e323d9fbe6d726286210e3a25.
Typecheck/diff PASS. This qualifies actual interrupted management archive and
closure only: liveQualified=false, storageDeletionAllowed=false,
nextAdmissionAllowed=false, no slot release or model/judge invocation.
The separate47d5228b... root/pair remains retained for scoped cleanup, and the
older f5bf... missing topology remains unknown.

Frozen resource admission now requires explicit judgeEnabled at creation,
persisting judge.enabled/codex_home; a manifest missing this intent is invalid.
Enabled judge home joins filesystem coverage and requires its budget bounds.
The coordinator requires a nonempty sealed inventory at the canonical private
state_dir/run_id/judge-processes.json, captured semantic SHA and the existing
judge reader/shared continuous closure qualifier. It derives every judge proof
and returns judge_inventory_source alongside process_sources. Missing inventory
is incomplete even when a caller supplies an otherwise valid isolated judge
proof; unsealed/empty, foreign path, changed SHA/producer and unsafe run reject.
A skipped judge cannot supply this inventory or an explicit judge process window.
No-manifest declared-scope API keeps its existing component semantics.

Actual agent+judge children run under held leases and independent sealed
inventories. RED previously returned processTimeline passed with only an
isolated judge proof and no census; GREEN requires the census and derives its
canonical proof copy. Frozen intent/home coverage RED→GREEN and missing-mode/
home-budget plus open/empty/skip/foreign/source controls pass. Full current
parallel-process-resources + parallel-resource-evidence19/292 PASS20.12s;
typecheck/diff PASS. Private management-registry-20261015/resource-judge-*.log
retains RED/GREEN/full output. Native management/admin census, full runtime
resource windows/budgets/quotas and production admission remain unqualified;
SLOTS_ADMISSION_UNAVAILABLE/live model+judge calls0 are unchanged.

The reconnect native control now continues CLI work: setup under admin A,
confirmed A disposal, new admin B, check in the same profile, then sealing and
finalization under B. RED f27c606c...1 failure/28 assertions122.61s exposed
MANAGEMENT_SESSION_UNKNOWN: historical check snapshots contained the known setup
session with B's proxy ID, which the collector compared to A's saved proxy ID.
The collector now matches historical observations by the already qualified
server/user Name+CreateTime tuple, requiring zero packages and rejecting tuple
duplicates within every snapshot. Global remoteKey uniqueness is removed because
those IDs have observation-local scope; unique durable origin IDs/native tuples,
all command/result/continuous process proofs, server epoch and CAS remain required.

GREEN999b11fc-5bfc-4d22-85bc-33cf20378923 PASS1/39 (129.82s) proves old admin
closed before next CLI, changed proxy ID with identical native tuple, two CLI
origins/two owned ledgers, archive-before-two-targeted-closes/fresh absence, both
continuous admin closures and exact disposable pair/root absence. Private
finalizer-audit.json124 checks/14 source hashes/read-back SHA6c2153838a71dabe3551ba65c2e448feec6b262e2238237a95de28a66d0a5e31,
terminal SHA84eb06ca040d27e9ef2d2d74f73ff773caae474c3499d1194c3d350ca4b08006.
This does not combine reconnect with actual interruption or grant storage
deletion, slot release, production readiness or live model/judge admission.

Related management-process-evidence + management-sessions5/73 PASS30.98s;
typecheck/diff PASS. Private management-reconnect-regression.log retains output.

The retained47d5228b... socket failure fixture jothVh has now been disposed
without synthesizing normal slot release. Its original setup/interrupted-check/
admin continuous closure proofs and all private source hashes were requalified;
178 audit conditions include two fresh birth-absence passes, exact rejected
socket identity, unchanged server epoch/topology and free original custom guards.
The existing archive primitive committed profile evidence before the factory
destroy. destroyPair reconciled exact nonce/IDs; fresh read-back on the same
Docker daemon confirmed both containers/network and own root absent.
Private retained-fixture-audit.json SHA6e73a3de81f3a628820cdb9acd696650211efeca053a191edd3518c54ec1f038,
removal SHA343265542c43b4571281379e6f04f06b077df36ac2fb610eaf77ab9bcad48d8c,
postcheck SHAe9b5d7493107d467476ab5788d15bf06e9f17c3eb5e27af9078c3f905cf689e7.
Signals0, fixed global lock unlinks0; old EACCES/writer incidents/permanent pair
remain untouched. One-shot audit/disposal helpers are retained privately with
source receipts; their redundant temporary copies were removed after byte checks.

readResourceNativeCensus reads the existing management finalization receipt
rather than publishing another inventory. Its context binds command journal,
run ID, selected slot/profile/lease tokens and both frozen container generations.
It requires finalizing sealed command sources, every management inventory and
every confirmed admin connection from the receipt's captured admin inventory SHA.
Existing management/admin readers and shared continuous qualifier produce all
canonical management proof refs plus complete admin dispatch-to-exit windows
and connection-source refs. Terminal/command/admin index hashes are rechecked
before return. The readonly admin reader signatures now request only the
controller.stateDir actually consumed; no credentials capability is required.

Native reconnect RED96f60785...undefined API133.44s→GREEN3abc0393-57f1-4a60-849a-305c59ef238a
1/43 PASS127.39s. The audit verifies both CLI origins and both sequential admin
windows/sources against original qualified native proofs,135 conditions/15
source hashes/read-back, SHA291ab59098daf7939a5000591b6fb1f425073a243d926029fd553c1b247cf393,
terminal SHAe837d1e6d90afca85557e5d5eb802225e008acacaa48a51a5b172c7186ab616d;
base archive/targeted closure/fresh absence/exact pair-root disposal also pass.
Related loginom-admin + management-process-evidence + management-sessions29/160
PASS35.79s, typecheck/diff PASS. Logs native-resource-census-{red,green}.log and
native-census-reader-regression.log remain private. Frozen journal binding and
mandatory coordinator consumption are the next step; this reader alone grants
no complete resource, storage deletion, slot release or production readiness.

freezeResourceManifest now requires canonical commandJournal within controller
stateDir and persists command_journal with the existing before-window timing
checks. Relative/outside/controller-root journal paths are invalid; older
manifests missing the field do not qualify new frozen admission, and historical
files remain unchanged. checkResourceEvidence requires a nativeCensus for every
frozen manifest, returning RESOURCE_NATIVE_CENSUS_INCOMPLETE when absent. It
derives all management proof windows plus every admin dispatch-to-exit window,
and returns native_census_source/admin_process_sources; callers cannot omit
individual origins from that closed census. The no-manifest declared-scope
component path keeps its previous meaning.

Actual RED lacked the frozen field and native gate; GREEN unit missing/foreign/
hash/negative-codec/unsafe journal controls plus current full resource files
19/303 PASS20.13s, typecheck/diff PASS. Native063235e0-ca81-4677-9705-2854a17fce09
reconnect composition1/50 PASS134.93s confirms both management sources/admin
connections, wrong producer/container generation refusal and coordinator source
read-back. Its real host frames are after-only and its budget is data-only; the
native census check passes while full resource admission remains incomplete
(missing eval-agent census). This does not qualify resources during CLI work,
actual runner thresholds/quotas or production readiness.

Private native-resource-coordinator-audit.json148 conditions/21 source hashes
uses public frozen-manifest/raw-resource readers and revalidates exact pair/root
absence, archive/targeted closure/admin proofs and all native process refs;
read-back SHAef6fa649d17fc10d0d70390fa401507149f7777b5f4ff9e58cb2a8a172f5afb5,
terminal SHA086d5028ffd8472adf6bdcde5474fee2a476f58170372dc63632d4e850ac24fb.
SLOTS_ADMISSION_UNAVAILABLE/live model+judge calls0 remain. Full controller
binding/before-during-after measurements/all runtime actors and actual budgets
still precede live parallelism acceptance.

Further SessionBackup primary inspection (2026-10-15) pins server binary
SHA1fea749d88b89cdf810e7c23496e5ad146728a032abfcd235367c5f1969cdd0a
from the existing image: SessionBackup.cfg/SessionBackupConfiguration and
User/Session map/status/finalization names exist, with autosave event flags.
These names do not establish a file schema or supported creation/disable API.
The JS SavePackageAs formal parameters remain APackage/AFileName only; no
invented backup option is sent. An exact no-follow file check on the unchanged
own permanent research pair observes no /workdir/SessionBackup.cfg, which grants
no disabled-policy credit. Method-symbol/UTF16 lookup supplies no new trigger.
Private backup-binary-primary-audit.json5 source refs/read-back
SHA7219026dd85f79d4aebf24816ffb6fa5465c83d86c0c489849bd5aae268cdc4c
confirms all3 never-started inspection containers absent on the same daemon and
image unchanged; temporary binary copies are removed. No new browser/model/judge
work or permanent-pair mutation. SESSION_BACKUP_POLICY_UNPROVEN remains; the
unsupported configuration is not manufactured from these symbol strings.

Native two-user management qualification (2026-10-15): actual A/B setup lifetimes
overlap under distinct native users/profiles/inventories. After committed archive
of A, targeted close removes its session while verified B CLI is held by SIGSTOP;
B's original session remains. SIGCONT and a fresh B check succeed; the global
management finalizer closes1 A +3 B sessions. The positive case validates existing
implementation, with no newly claimed production RED. Native1/16 PASS167.84s and
typecheck/diff PASS. Independent private source audit584 checks over177 captured sources
qualifies4 CLI +1 admin continuous closures, exact archive-before-close within B
lifetime and new B check after close. SHA0ea06a6ad25f942d1553f7b59fd9fa1e188d7a449aa3f2e352e5d2064a82eea6;
verification1c363ada3c90bfd5d812738952dab045fa30a030af21e722ebdf7d3529c2df57
in native-two-users-6ebb9781-90c4-4057-9241-0f688b7f8c16. Exact pair/network/root
are absent on the unchanged Docker daemon. Safe JSON sources exclude private
credential files/admin browser profiles;4 temporary logs/helpers copied0600,
read-back verified, then removed. This is management/session independence, with
storageDeletionAllowed=false and nextAdmissionAllowed=false. Storage deletion,
normal release, global readiness, full resources/licence and SessionBackup
qualification remain open; no model/live judge calls. Old incidents are retained.

Private configuration/bootstrap (2026-10-15): both persistent slots.json already
existed0600. Acceptance matches the approved JSON; research names/network/port/
roots and bootstrap-file inode are distinct. Public loadSlots(...,2) validates
both without reading credentials/auth stores. Initial canonical-path audit found
12 absent profile/work/history leaf directories under existing private parents.
Under4 actual global profile OS guards, with every durable reservation absent,
operator bootstrap created12 empty0700 directories and fsynced their parents.
Reacquiring the same guards confirms empty/inode stability,26 existing private
paths, unchanged configuration bytes and no reservation changes. Fixed global
guard files remain. No Server/user/CLI or authentication state was changed.
Private slot-directories-postcheck.json SHA78d0039f40e7b3b5cf8ad5b00db120322e8ae9692a1fd85b1629be918a40a4ce
and post-bootstrap config audit3310afcc3b55f865db96a5f1b5c1bf5df2e101b815c2a0b622107f3d4ff7dde2
retain before/after hashes and three archived helpers in native-two-users-6ebb9781.
Acceptance pair journal is still absent; readiness=false. This records initial
private filesystem preparation, with no new public command or auth/licence/
SessionBackup qualification. Existing data and retained incidents are preserved.

Hard-crash backup observation дополнена paired graceful control: native
pending Count1/modified named package/autosave5062 bytes с period5000 и
keepAlive1800000, old admin disconnect/continuous closure перед SIGKILL exact
own disposable daemon CID. Docker state137/OOMKilled=false; после restart
сохранились CIDs, изменились StartedAt/epoch, новый admin init/inspect/dispose
и continuous closure confirmed. Pre-crash backup list пуст; post-kill и
post-restart physical copies пусты, post-restart cfg absent. TDD oracle RED graceful0≠137→GREEN paired2/146 PASS147.83s, typecheck
PASS. Hard native-user-831bf8d0... audit SHA
7678658c18976971879db5dc3c56d1f906a0b2dc1ed0f2b736a6985adcf03f4e
проверяет24 checks/32 sources; verificationfa28c0dd... перечитала96 sources
трёх controls и exact own pair/network/root absence. Recipe не доказывает
positive/disabled backup policy; production admission/grants не изменены.

### Read-only agent session ledger — 2026-10-15

`readAgentProcess(input, id)` validates one confirmed entry in an open or sealed
agent inventory. Its `entrySource: {path, id, sha256}` hashes the selected entry,
not the whole file. Appending another invocation or sealing the inventory does
not invalidate this reference. A planned/unconfirmed selected entry still fails;
the full resource inventory reader still requires sealing and all process proofs.

`recordAgentSessions(file, lease, secretFile, source)` and `readAgentSession(...)`
produce/revalidate private `owned-agent-session` records. The source contains an
immutable process entry reference plus native before/during/after snapshot refs.
Normal lease, admission command/generation, protected preparation/user/activation
and a browser runtime under the leased profile are required. Browser bindings
identify a process in that same closed proof,
a declared runtime directory and an observation inside the process lifetime.
The negative codec tests use a real closed Bun process without any Loginom user
or session; incoherent process/directory/time metadata is refused before reading
user sources. Initial RED reached USER_PREPARATION_CONFLICT; GREEN refuses it as
AGENT_SESSION_BROWSER_UNCONFIRMED and publishes no session ledger.

Snapshots share one admin context; before precedes the process lifetime, during overlaps it and after
follows it. Every new same-user row is derived from these frames; a new after-row
missing from during is refused. Stable exact Name/CreateTime remain identity
values, independent of the controller clock. Reused names or changed identities
are ambiguous. Source drift and recovery-only leases fail closed.

Actor runId is the admission command ID; attemptId is the durable physical CLI
invocation UUID from the process entry. Logical task/repeat/retry mapping belongs
to the controller and does not change quality denominators. The ledger records
observations of browser actors; non-browser/empty accounting and complete baseline
same-user accounting remain separate work. Driver adoption, archived-history
fence, targeted close, recovery and filesystem release have not been added by
this API. The native driver does not accept these records as close authority yet.

TDD missing API RED → selected-entry reader GREEN, including an actual second Bun
child which refuses its own planned entry and reads the completed predecessor.
Native runAgent/bubblewrap/local replay produced one active Count1 session and a
ledger that revalidated before and after inventory sealing. Wrong entry SHA and
invalid snapshot window were refused. Native1 PASS/20 assertions107.77s;
related8 PASS/59 assertions16.07s, typecheck/diff PASS. Private
native-agent-replay-cbed6057-7ae0-4630-ad6c-c715ad896f79/source-audit.json
SHA256 `5b8e2e688422b1af2bf653391f534cb55b0e50f9bb1012ad4855f047a82336bd`
checks94 facts/50 sources,16 overlapping snapshots and12 source/binary pins.
All own pair/network/root resources are absent. No production readiness or live
model/judge qualification is claimed.


### Agent archive-before-close — 2026-10-16

`AdminConnection.closeAgentSession(lease, secretFile, id, archive)` closes a
qualified agent browser session. `archive: {path, sha256}` points to the private
`agent-archive-<physical CLI invocation UUID>.json` in controller state. The
committed profile archive must belong to the leased profile/history directory
and start after actual continuous CLI closure. Missing or earlier archives fail
before dispatch. `readAgentArchive` replays the committed archive validation,
including moved tree identities/content and a clean settled working profile;
the parent repeats this check immediately before the native request.

The driver adopts the immutable agent ledger and validates its normal lease,
protected preparation/user/activation, selected process entry/proof, native
before/during/after sources and archive hash/order. The fresh account and unique
Name/CreateTime tuple must match; the session must be pending disconnect and
retain the qualified post-CLI package count. CloseSession confirmation plus fresh
absence permits a private terminal sidecar tied to the exact adopt/archive and
confirmed command/reply hashes. Repeated close revalidates this terminal result;
read-back after inventory sealing remains valid. Historical terminal validation
reads the immutable archive source without requiring the reused profile to stay
empty. No operation-stop, backup/storage deletion, reservation release or new
admission authority follows from this close API.

TDD: missing export RED, then native driver refusal SESSION_SOURCE_UNCONFIRMED
(19 assertions154.46s), then native1/29 PASS134.46s. Missing/too-old archive
controls dispatched no close RPC. One actual agent Count1 session closed; a
nonempty setup-session baseline remained present. The archived database retains
the original SDK session ID. Related48/233 PASS50.73s, typecheck/syntax/diff PASS.
Private native-agent-replay-d75f5d7a-0a38-4fdb-887f-16b24f89a4b7/source-audit.json
SHA256 `0c35e3dcdbb2531950fb5f9d8153efc94fd695eb1aeedbd14a1963716334280e`
checks1648 facts/66 sources,15 causal snapshots/13 source+binary pins and all
archived tree inode/content metadata. Own pair/network/controller root are gone;
private historyDir from settlement.json remains outside that root, preserving the
original rename-based archive on the same filesystem. Complete same-user
accounting, active finalizer/recovery and production admission remain open.

A/B management regression1/20 PASS164.60s: the shared causal adoption path still
closes A Count0 sessions while B remains active; B subsequently completes a fresh
LOGINOM_CONNECTION_VALID check. Both finalizers retain delete/admission=false.
Native-agent verification.json SHA256
`d0512a31055b7b291f2c3b982f4bd32b83bda07fc59c3022ef9f5782375f1991`
rechecks79 evidence/source-pin hashes and exact own resource absence.

Private native-two-users-79a7ca24-8890-473d-aedb-792c884b62bd/source-audit.json
SHA256 `5d6da801c8ef9bd9da0fdac201118d59426a15a1c608aced638558f85780d1ab`
checks634 facts/183 sources, continuous closures/archive order and exact own
pair/network/root absence.


### Combined management/browser-agent accounting — 2026-10-16

`collectSlotSessions(file, lease, secretFile, sources, observation)` accounts for
normal management and browser-agent actors together. Sources identify the
management inventory and optionally `{file, observations}` for the agent
inventory. The command journal must register the exact agent file/slot/token/
profile binding. The agent inventory must be sealed with qualified continuous
proofs, and each invocation must have one immutable observation window. Missing
windows, duplicates and sources from another inventory fail before accounting.
`readAgentSessionInventory` revalidates/records these causal ledgers and binds
all native snapshots to the sealed inventory source.

Every same-user row in management and agent historical snapshots must match one
known ledger. Fresh rows require a ledger that remains open; a closed ledger
cannot account for a present row. Exact Name/CreateTime identify a row across
admin proxy contexts, with case-normalized duplicate detection. Management rows
remain Count0; agent package count/pending eligibility belongs to the targeted
close API. The collector requires the fresh observation after all selected CLI
lifetimes, then rechecks command/seals/inventory hashes under the held lease.
It returns separate management/agent records and source references.

The existing `collectManagementSessions` retains its management-only output and
strict refusal for an agent row. Empty/non-browser invocations still require a
separate positive qualification before this collector can support every agent
run. Finalizer, storage/backup cleanup, reservation release and admission are
separate gates.

TDD missing export RED → codec GREEN rejects unknown same-user rows (including
uppercase/bare names) and an unregistered agent inventory, while ignoring peer
user rows. Native1/36 PASS150.78s used genuine CLI setup and runAgent, refused
unsealed/missing invocation evidence and the management-only path, then retained
the setup ledger after agent closure. Private
native-agent-replay-ca96f759-6ac6-4466-aa25-dd64c0c4ef0c/source-audit.json SHA256
`0546e73b94f2e023c1749b023059297d7ff321a252841124712766726224039c`
checks1658 facts/113 sources,20 causal snapshots and15 source/binary pins. Own
pair/network/controller root are absent; the private history archive remains.

Related48 PASS/245 assertions55.60s, typecheck/diff PASS.


### Empty/non-browser agent invocation — 2026-10-16

A qualified closed CLI may have explicit empty `browserBindings` and
`runtimeDirectories`. With a valid before/during/after native window and normal
lease/preparation/user/activation sources, `recordAgentSessions` returns an empty
list when no new same-user row exists. The physical invocation remains present
in the sealed inventory; `collectSlotSessions` still requires its complete
observation window. Baseline/unknown rows remain subject to combined accounting.
Missing/incoherent browser metadata is refused, and any new causal row requires
a qualified browser linkage before a session ledger may be published.

TDD text provider1 FAIL→2/16 GREEN; actual no-browser run refused with
AGENT_SESSION_BROWSER_UNCONFIRMED (8 assertions101.29s), then passed1/16 102.39s.
A negative copy of a genuine browser proof, with only its browser metadata emptied,
initially published a false claim (25 assertions137.36s RED). The new guard refuses
this copy before ledger publication while preserving the original proof. Both
native variants now pass2/55 assertions242.82s; related49/248 PASS58.87s and
typecheck/diff PASS. Empty accounting issues no server close and creates no agent
session ledger; the genuine browser path still closes its retained Count1 row.

A short text run exposed a test-oracle assumption: its main SQLite file was4096
bytes, while the SDK session was committed in an848752-byte WAL (SHM32768).
An independent readonly query on a private copy of all three files found exactly
one matching session with quick_check=ok, and original hashes remained unchanged.
Bun SQLite1.3.14 independently read the same three-file WAL archive as well
(private native-agent-replay-d0452642-edf5-4277-8ea3-9502aa8059fe/
bun-sqlite-wal-audit.json SHAca9c44ae…); original hashes stayed
unchanged. The archive implementation had preserved all files. The native oracle now reads
a private DB/WAL/SHM copy, with temporary copies removed after the query; it never
opens the immutable archive through SQLite. This covers a checkpointed database
and retained WAL without treating absence from the main file as lost history.

Private final browser native-agent-replay-d84be043-e4e6-4e25-a40b-23bd737e9ec0
source-audit SHA256 `ca5c3ea576e414d67c3e31306e28c493704c5e91f1fa7ae5181979cf2585f53f`
checks1648 facts/108 sources/16 causal frames, including omission refusal and
archived tree identities. Final text native-agent-replay-71e4d75c-8149-417c-a7f1-d9901c4ed50b
source-audit SHA256 `06a691321c1ee4cc2ed494e61a6828c9f9e4b07c42576793fc31fdba767f5488`
checks80 facts/58 sources/6 causal frames and no fabricated ledger/close RPC.
Both have15 source/binary pins, exact own pair/network/controller root absence
and retained original histories. Two unused duplicate audit drafts were removed
after verifying retained copies; original native proofs/archives remain intact.

The combined collector currently requires a sealed whole-run agent inventory.
Per-attempt accounting over a completed prefix, normal slot finalization/recovery,
storage/backup release and production admission still require implementation and
qualification. This change grants none of those later stages.

Joint verification199 source/pin/WAL hashes and both exact resource-absence
checks: d84be043…/verification.json SHA256
`5916de3c12158ab05adb13e8743fcc254bd8ba5287c2cc8537b6b6a7cdcafd8a`.


### Durable paused agent prefix — 2026-10-16

`pauseAgentProcessInventory` freezes the completed per-slot prefix without final
run sealing. Under the existing producer exclusion it validates all closed
process proofs, persists `state: paused`, writes a private immutable snapshot and
publishes its reference in the live manifest. New CLI calls fail
AGENT_PROCESS_INVENTORY_PAUSED. A snapshot publication failure leaves admission
paused; repeat reuses/reconciles the same hash/path. An altered snapshot fails
read-back and final sealing. Final sealing preserves the immutable source.

`readAgentProcessBoundary` accepts a valid paused snapshot or a final sealed run.
For a pause it returns the immutable `source` separately from the live `current`
manifest reference. `readAgentSessionInventory` and combined accounting recheck
both references, so a prefix cannot silently change during source validation.
The existing resource inventory reader still requires whole-run sealing and gives
no resource-completeness credit for a pause. The native selected-session driver
accepts paused state with its existing process/user/native-frame/archive guards.

TDD missing API RED → actual two-child prefix/pause/seal and filesystem fault
controls5/52 PASS7.81s. The native text path first refused a paused inventory via
the resource-only reader (9 assertions98.59s RED). Boundary wiring then passed
both native variants2/56 assertions243.49s: the browser archive and targeted
Count1 close occur before final sealing, and the empty invocation retains its
committed SQLite family. Related50/263 PASS51.57s, typecheck/syntax/diff PASS.

Private browser native-agent-replay-149f6bd8-52b3-456c-b5c5-0440bc65be28
source-audit SHA256 `3abbca9bd164e3fc7cb97d1802ea5ee462e5165ebd3bdc35ab006ff5317ed3d6`
checks1650 facts/108 sources/16 causal frames. Private text
native-agent-replay-ae3518db-d41e-48bc-a904-3593e1a3d81f source-audit SHA256
`9a8f9abb4cf943b7601bef85612662244d2151b6f4b68632840f92df12debbc5`
checks91 facts/62 sources/6 frames, including DB/WAL/SHM and one committed SDK
session. Both snapshots remain immutable after final sealing; both15 source/
binary pins and exact own pair/network/controller-root absence are verified.
Original histories remain private outside the deleted temporary roots.

This provides a producer boundary, with no cleanup, deletion, release or next
admission grant. A normal slot/attempt finalizer must use it, finish backend and
storage/backup cleanup, then validate a separate transition out of pause. That
unpause/recovery/orchestration path remains unimplemented; no caller may infer
nextAdmissionAllowed from a paused prefix or sessions_closed alone.

Joint verification200 source/pin read-backs and exact absence of both own pairs:
149f6bd8…/verification.json SHA256
`6d41ac70ca9623d75a2ca6d371d2cf6d293a40682f9b94b3627501dd0610b63d`.


### Normal slot/attempt session finalizer — 2026-10-16

`finalizeSlotAttempt` composes the normal held slot/server leases, current pair,
management seal and paused agent prefix. Before moving profile data it requires
complete observations for every physical invocation and accounts for all
same-user rows. It releases only the qualified stopped writer, commits/replays
the current invocation archive and validates every invocation archive, including
invocations which opened no browser. `readAgentInvocationArchive` provides this
last check without requiring a server-session ledger.

A durable close intent binds the exact prefix, archives, full target set and
native before snapshot before the first RPC. Agent sessions close first, then
management sessions. Fresh complete accounting requires all ledgers closed and
all same-user rows absent. The private terminal binds the intent, archive and
observed/closed sources. Repeating a completed finalization returns its original
receipt source and dispatches no additional close RPC. A pending intent with an
unconfirmed target refuses blind retry; active uncertainty recovery remains
unqualified. The shared admin connection remains with the caller.

The current terminal is version3 and additionally binds the committed server-root
archive described below; the version2 close intent is unchanged.
The receipt is `sessions_closed`, with storageDeletionAllowed=false and
nextAdmissionAllowed=false. It supplies no backend-operation/package-lock,
SessionBackup, storage cleanup, normal release or validated unpause proof.
Production admission and active recovery remain open.

TDD missing-module RED → native browser/text2 PASS/38 assertions269.12s.
Recovery-only and incomplete-observation controls refuse before archival/close
and preserve the original DB and session rows. Related50/263 PASS54.48s,
typecheck/diff PASS. Private browser477594c6-fad5-441e-bd05-d5c219fb965d audit
`696f7948af3af1e667a665154a6c56d0f31805404ad80b4eb6ddb66213d06f26`
checks1789 facts/103 sources/15 causal frames; text1c75c612-72b7-49c4-b8d1-22ff91154c4a
audit `215fe87094725f4dbb388fe125d4316575aafca7a20c5b895442cf11cda73587`
checks186/73/5. Both16 source/binary pins, exact own pair/network/controller-root
absence, admin continuous closure and original archived SDK session are verified.
Browser SQLite includes DB/WAL/SHM; the text invocation has one valid DB. SQLite
inspection uses a private copy and leaves originals unchanged. Test teardown
preserves the root and pair if profile history remains unarchived.

Joint verification220 read-backs/exact absence checks:
477594c6…/verification.json SHA256
`f5ef36009f7cf4496780ded2c656431c7bcc9d6efee89b25063efb6803b95ba8`.


### Native read-only session absence confirmation — 2026-10-16

`confirm-session-absent` validates the same adopted session, protected user,
server generation and frozen process/archive sources as normal close. A matching
live row returns SESSION_STILL_PRESENT before the CloseSession branch. An absent
row returns confirmed/observed_absent. Agent and management closure readers accept
this operation only for that disposition. `closeAgentSession` and
`closeManagementSession` expose the explicit `confirm-absent` mode; normal mode
remains unchanged. The journal permits this read-only operation after an unknown
mutation, while subsequent mutations remain blocked. Transport failure still
requires a working/reconnected channel; this operation does not clear quarantine.

Channel TDD REQUEST_INVALID RED →1/8 GREEN0.752s. Native old-driver refusal RED
18 assertions117.00s → browser/text2/50 PASS297.29s. Each case refuses a real live
management target, completes normal archival/close, then explicitly reconstructs
loss of one close sidecar and the final receipt. Pending normal finalization
refuses; native read-only confirmation reconstructs the sidecar, and finalization
publishes/reuses a terminal without another CloseSession. The browser selects an
agent sidecar; text selects management. This is filesystem receipt-loss fault
injection after actual native RPC, with preserved original receipts. It is not a
SIGKILL, lost wire-response or active recovery-lineage qualification. Automatic
pending-finalizer integration remains separate. Only the expanded native fixture
budget changes180→240s; ordinary native cases and production deadlines stay fixed.

Related50/266 PASS60.53s, typecheck/syntax/diff PASS. Browser6e3edf07-a831-4687-bc0a-edbaf3340ac3
audit `45845c1addb479a0b28f511edce1286f2d5bd5111ea966544349285580b80ee6`
checks1782/116 sources/17 causal frames; text19bc4ebe-6f54-4526-8793-7345ef14e49b
audit `d9c562fc91fab122019f51be0b18aabfeff0802425abbeea5d5a5caaf59941c1`
checks229/92/5. Both16 pins, original archived SDK session and exact own pair,
network/controller-root absence pass. Archive inspection leaves originals intact;
SQLite families can have one DB or DB/WAL/SHM depending on the actual run.
Storage deletion, backend operations/locks, backups, release, unpause and next
admission remain unqualified. Old incidents are unchanged.

Joint verification252 source/pin/exact absence checks:
6e3edf07…/verification.json SHA256
`0c20af3738a43d0861c56bb3086a724ea258f136ed0b3b515a354e67f10cdcf3`.


### Automatic normal pending-attempt reconciliation — 2026-10-16

`finalizeSlotAttempt` now uses only `confirm-absent` when its durable close intent
already exists. It retains the full producer/archive/native accounting and epoch
checks. Missing close sidecars can be rebuilt from confirmed native absence,
then a missing final receipt can be published. A matching live row refuses in the
driver before CloseSession; unknown same-user rows refuse complete accounting.
An already published terminal with a missing close proof still returns PENDING,
so reconciliation cannot silently reinterpret that completed result.

The native receipt-loss tests now call the finalizer directly, with no manual
absence-confirmation step. Both retain the original terminal/sidecar, test the
existing-terminal refusal, remove the terminal and require automatic read-back
and stable repeat. This remains filesystem receipt-loss reconstruction under a
held normal controller, with actual native RPC. Actual lost wire responses,
SIGKILL and recovery-only lineage remain unqualified. Cleanup/deletion, release,
backend operations/locks, backups, unpause and admission remain separate gates.

TDD old pending refusal RED19 assertions119.12s → native browser/text2/50
PASS294.22s. Related50/266 PASS54.90s, typecheck/diff PASS. Production diff3 lines.
Browsereda67412-337b-4523-add1-a7dda8c782ef audit
`2a2c433bcd730a024bec3acee891700db3f764d7ad0695deb58ff5b554bec9ec`
checks1772/112 sources/14 causal frames; text7bcba6eb-debf-49f8-ba94-3964494cab1f
audit `b5d45025f204006354b37e7d005487881d953b8f3b26abfbed2beb386e54b1d7`
checks227/93/6. Both16 pins, no additional close RPC, retained archived SDK session
and exact own pair/network/controller-root absence pass. Joint249 source/pin/
absence checks: eda67412…/verification.json SHA256
`2fd4cc4ae1111efd11933479192fc16a3060724032f48b5ddb56b772f15e5fb3`.


### Read-only native package descriptor tree — 2026-10-16

The installed Studio Dispatcher queries `SessionInfo.PackageInfo` for each
manager collection. The [official Dispatcher documentation](https://help.loginom.ru/userguide/admin/dispatcher.html)
distinguishes user sessions, shared packages and the package pool; user-session
absence alone is therefore insufficient to describe all open package entries.
Primary installed UI/model RPC sources are preserved privately in
native-package-schema-7ba115e0-327c-4a3e-b82d-4c50c7ababf0/source.json SHA256
`c32bff0e8f70849ebaa7e878d195209b2f4c0464a1afdc8e6f30dbb5b259fb6a`.

The driver accepts read-only `inspect` payload `{packages:true}` and returns
`identity` plus `collections`: objectId/name/sessionType/packageCount and package
objectId/name/path/readOnly/referenceCount/progress. Nullable progress preserves
native Percent/StartTime when present. Collection and package counts are read
again after enumeration; drift fails the request. Ordinary inspect remains
unchanged. No package/session is opened, stopped, closed or removed by this mode.

TDD missing collections RED47 assertions50.05s. The first populated response
revealed an invalid test assumption: a user package reports referenceCount=-1.
The installed Dispatcher renderer suppresses negative reference counts. The
wire/test preserve the actual sentinel; it grants no zero-reference credit.
Corrected native1/63 PASS51.41s, admin/preflight48/140 PASS16.60s,
typecheck/node syntax/diff PASS. Named writable `/eval-a/backup-probe.lgp`, idle
Progress=null and real autosave are captured before targeted CloseSession; the
package is absent by path/objectId across all collections afterward.

Private native-user-e8c84277-de3e-434b-af1d-32c80eac870e/source-audit.json SHA256
`efc2a9e1e13630d6d290b311f1ca39af227c61d751869536fb3574ae397c47a1`
checks42 facts/13 sources and5 tested source/binary pins. Original LGP/autosave,
native command/reply hashes, continuous admin closure/transport ACK and exact
own pair/network/root absence pass. Both RED cases retain their actual test
source and native data; their own pairs/roots are absent too.

This qualifies descriptor delivery for an idle named package. Running Progress,
nonempty shared/pool populations, stable root ownership mapping, backend lock/
operation quiescence, durable parent consumption and cleanup admission remain
open. The probe retains cleanupAllowed=false and operationsQualified=false.
The new fixture retains its root/pair if admin closure/transport is unconfirmed;
production and existing native deadlines are unchanged.


### Durable parent package observations — 2026-10-16

`AdminConnection.inspectPackageInventory()` persists the full native wire reply
with its canonical inspect command reference/SHA. `readAdminPackageInventory`
validates the private canonical path, server epoch, complete reply/request hashes,
command window and nested collection/package schema, then rereads both sources.
Counts must match arrays; duplicate collection IDs or package IDs within one
collection fail. Signed native referenceCount and nullable Progress are preserved.
A descriptor may appear across different collections; this grants no ownership,
freshness, operation/lock quiescence, cleanup, release or unpause authority.

Codec missing-module RED→GREEN1/8; inconsistent-tree RED→GREEN1/20 including
forged matching journal hashes, altered epoch/times, unsafe mode/symlink and raw
negative-reference/null-progress controls. Positive Progress here is synthetic.
Native missing-parent API RED44/64.90s; final preconnected-parent named package
control1/67 PASS67.56s, related49/160 PASS21.68s, typecheck/syntax/diff PASS.
Private native-user-9bcdf36b… source-audit SHA256
`0e6fc145fa8c5fadafe0e8eac129a42aa14310894e16764bfbeb5268947af7b0`
checks67 facts/23 sources+6 tested code/binary pins: durable parent replay before
and after actual CloseSession, original named/modified package/autosave, both
continuous admin closures/transport ACKs, exact own pair/network/root absence.

Late parent initialization against a retained Count1 session observed
PendingDisconnect=false and safe SESSION_NOT_IDLE; the initial disconnect
snapshot was true. The preconnected ordering passes without speculative handle
release or weaker close guards. Cause remains unresolved in blockers; this does
not qualify replacement-admin finalization of a retained nonempty session.
All five failed/diagnostic fixtures retain original sources/data and have verified
closures/pair absence. Installed enum source f9e4d339…/source.json SHA256
`0cc2dadf184aba07af8cb30a2fd7b83074a8aca9f651d96f4869d737cfcd5768`
defines client0/self1/shared2/pool3/backup4. Self denotes the observer, not a role.
Running/nonempty shared/pool controls and production cleanup remain open.


### Populated Shared descriptor control — 2026-10-16

The protected research phase `session-shared-probe` creates a native library in
the isolated designer's own storage, closes its direct package handle, and adds
`AddModelPackageLink` from the named/modified root package. Parent and raw admin
observers both see `/eval-a/shared-probe.lgp` in sessionType2 with referenceCount1,
readOnly=false and Progress=null. This raw ReadOnly value does not establish
an effective ACL. Ordinary backup phase retains its existing reply shape.

Unsupported phase RED40/52.93s; first populated control disproved the test's
ReadOnly=true assumption (RED48/66.66s). Corrected ordinary/shared2/138
PASS134.44s; related49/160 PASS24.03s, typecheck/syntax/diff PASS.
Private native-user-6b4a9575… source-audit SHA256
`e5025baf32f86b4548b72ceed1388c014853213730cee7fa23d8bda4d8c73378`
checks74 facts/24 sources+6 tested pins: causal link/path/count, full native
receipts/journals, original library/root LGP/autosave, both admin transport ACKs
and continuous closures, exact own pair/network/root absence. Shared Count0
and referenced library absence are freshly observed after targeted CloseSession
by both admins. Ordinary40574ffb… audit7634c941… checks67/23 sources.

All three new failed/diagnostic fixtures have qualified admin closures and exact
pair/root absence; executed sources and native data remain. The library file was
not copied before the oracle failure; the final fixture retains it. Positive
running Progress, populated Pool, backend operations/locks and production
cleanup admission remain open. This control grants no general quiescence.


### Native package Progress lifecycle — 2026-10-16

The protected research `session-progress-probe` opens a self-contained XML LGP
with one bounded JavaScript node. Its actual native engine source must equal
the readable fixture. Parent package observations run while that native probe
is in flight. They capture non-null Progress (observed percent50), then the same
package objectId/path with Progress=null after successful task completion while
the package remains open, then fresh absence after targeted CloseSession.
Native Finished=true/Failed=false/status4 and full replies/journals are retained.
Native StartTime stays raw; it is not compared with controller clock timestamps.

Missing-phase RED41/53.52s; fixture routing and XML containers corrected. The
fixture retains native-style MD5 ZIP fields and ModelViews Nodes/Links. Initial
running1/52 PASS67.70s; stricter idle RED45/59.70s→retain only the progress probe
package→final1/53 PASS61.95s. Temporary open-error diagnostics were removed.
Related49/160 PASS21.58s, typecheck/syntax/diff PASS. Privatef7fa45bd… source-audit
SHA256 `c33e5b9980b72ea47a6939f6f04efe36d71e319478757f1b45eed8bae32a8e97`
checks69 facts/23 sources+8 tested code/binary/fixture pins. Both admin continuous
closures/transport ACKs, exact own pair/network/root absence and original input
LGP read-backs pass. All six failed/diagnostic fixtures retain executed sources
and input LGP with qualified closures/absence. Intermediate0d2d8fdc…
auditfd2c5ff4… checks67/23 sources before the retained-idle assertion was added.

This qualifies native Progress delivery and its completion transition. Populated
Pool, backend operation/lock quiescence, interrupted work, targeted storage/backup
cleanup and production admission remain open. No cleanup/operation grant follows.


### Populated Pool outlives its creator — 2026-10-16

The guarded research phase `session-pool-probe` accepts only the ephemeral
`eval-pool-probe` account. Its local modes change design1→design/run3, with
admin/global file access false. Normal eval accounts and permanent resources
are unchanged. A source-checked own package is closed before the Scheduler job.
The job is enabled for one manual ForceStart, PeriodNone with its automatic
start one day ahead, startup/missed execution false and stop timeout10s.
ApplyChanges takes `Ref(config)`. Only its returned GUID is deleted after an
actual completed3 log; fresh own-job enumeration must be empty.

After the creator's native session closes, the same package objectId/path still
appears in Pool type3. Actual ReadOnly=false/referenceCount=-1/Progress=null are
preserved without permission/reference-free inference. User-session absence is
therefore insufficient for package quiescence. No global ClearPackagePool call
is made and this test grants no slot cleanup or backend-lock authority.

Missing-phase RED41/54.32s; normal-user/admin permission refusals retained;
mutable Ref and disabled-job corrections; fresh-deletion RED42/62.05s→GREEN.
Final ordinary/Progress/Pool3/174 PASS202.77s; related49/160 PASS22.14s,
typecheck/syntax/diff PASS. Private71f121cd… source-audit SHA256
`c8983e29af999ddabf6e02b77c87fd7127b5d5ebcedc65e78ff54d6b0c0cb700`
checks69 facts/23 sources+8 pins: actual job/user/log, fresh deletion, retained
Pool before/after causal creator close, both admin continuous closures/transport
ACKs, exact own pair/network/root absence and retained input. Ordinaryb04f5f9f…
audit70844392…67/23 and Progress48d3d0d9… audit5f1f3d77…69/23 pass on final
sources. Seven failed/diagnostic fixtures retain executed sources/input and
verified safe boundaries. Initialfac878fb… audit26865189…73/25 remains historical.

Primary enums/UI are preserved in native-pool-schema-f6236ca2…/source.json SHA256
`7a68a6b3c8afab41bc9a01acbf19062fc2daa3b1854fe09f59b227dfa70c5a01`;
installed model RPC source was already frozen. Interrupted work, selected Pool
closure, operation/lock quiescence, storage/backup and production remain open.

### Native selected Pool ClosePackage refusal (2026-10-16)

The guarded research phase `session-pool-close-probe` uses only ephemeral
`eval-pool-probe`. After the owned once-only job completes and its exact GUID
is deleted with fresh empty enumeration, the admin resolves one matching idle
Pool object and calls `manager.ClosePackage(packageInfo, 5000)` once. Native
Loginom refuses with “Не найдена сессия в которой находился пакет…”. A fresh
lookup retains the same object; creator CloseSession also leaves that Pool item.
This is a qualified refusal, not a cleanup primitive.

A second user's retained package is compared in full before the attempt and
after creator closure through one admin observer, then closed separately by
its own cached binding. Managed SessionInfo proxy IDs observed through different
admin observers differ; they are not cross-observer identifiers. Existing
session close ownership checks are unchanged. No global pool clear is called.

Native1/70 PASS68.76s; related49/160 PASS21.98s, typecheck/syntax/diff PASS.
Private63e4e2dc… source-audit SHA256
`17f23462c0b57a6f77072a64780ae85453e5cb3c149c89a668e2bd4848782e12`
checks93 facts/43 sources plus8 pins, both continuous admin closures/transport
ACKs, retained input and exact own pair/network/root absence. The earlier
ordinary Pool control1641d4d8… PASS64.57s has audit8af85dfe…69/23. Unsupported
phase, failed positive expectation, cross-observer oracle and fixture-counter
runs retain their original failures. Production cleanup/delete/unpause/admission
remain blocked. Next investigate PackagePoolSize=0 before work on a fresh pair;
its exposed unsigned setter alone does not prove disabled retention.

### Preventive Pool retention policy research (2026-10-16)

The next Pool implementation path is PackagePoolSize=0 before user work.
The guarded `session-pool-disabled-probe` requires empty package collections and
only the current admin's client/self rows before setting this server-wide value.
On a fresh owned pair, native socket settings read10, the setter writes0, and
immediate and post-job getters both read0. An actual own once-only Scheduler
job completes, its exact GUID is deleted with fresh empty enumeration, and its
package is absent in every collection before and after creator CloseSession.
No global pool clear or server restart is used.

Missing phase RED41/51.90s→native1/54 PASS63.23s. Private2df05c6e…
source-audit SHA256 `ca4df30304e01a5ec3af779da2138c4b08024cc225f89f0fba674d2d963c22a9`
checks70/23 sources+8 pins: actual settings/source/job/log, complete package
bookends, both continuous admin closures/transport ACKs, retained input and
exact own pair/network/root absence. Primary settings UI/RPC manifest
2683f213…/source.json SHAf9292a8b… preserves the supported unsigned setter.

This qualifies a preventive native recipe. Production must still apply it before
user work and bind fresh read-back/drift guards to the frozen server epoch.
It grants no operation/lock, backup, storage deletion or next-admission authority.
Targeted ClosePackage remains unsupported in the recorded Pool control; the
implementation should use the preventive path rather than repeat that RPC.

Same-source default-retention control62335c26…:1/54 PASS66.51s,
audit7e614cb9…74/25 verifies the same package retained after creator close.
Both cases freeze the identical8 code/binary/input pins. Related49/160
PASS21.15s; typecheck/syntax/diff PASS.

### Fenced public Pool policy checks (2026-10-16)

AdminConnection.configurePoolPolicy requires a held retained same-epoch server
fence and its same-command private unactivated-preparation journal. Native
configure-pool refuses nonempty collections or user sessions and sets0 only when
the getter is nonzero. inspectPoolPolicy is readonly and refuses drift. Both
persist the complete native reply with its exact command binding; the independent
readAdminPoolPolicy validates private source, epoch, schema, native observer,
operation, timestamps and hashes. A matching-hash omitted observer is refused.

Native1/48 PASS62.31s: initial readonly drift, phase rejection before RPC,
actual10→0, unchanged repeat and readonly0. Related50/162 PASS22.76s,
typecheck/syntax/diff PASS. Private691caaea… audit SHA256
`5b14827c66c09c56cd235c53a194545f59ab8fe5b5fda5a362c84931f0ce7fa2`
checks51/23 sources+6 pins, both continuous admin closures/transport ACKs and
exact own pair/network/root absence. Native Pool error codes preserve their
POOL_POLICY namespace. Two failed fixture lock collisions were fixed by separating
controller and factory lock roots; original pairs were reclaimed with qualified
closure/transport sources, recovery-only CAS, release and owned factory destroy.
Original failed logs/proofs remain unchanged. Prepare/verify wiring is qualified
in the follow-up below; runtime policy drift/admission guards remain open.

### Pool policy in public environment preparation (2026-10-16)

prepareEnvironment now configures fixed PackagePoolSize=0 before staging or
configuring any selected user. verifyEnvironment only inspects the live value;
both environment receipts contain the bound poolPolicy observation. Overall
readiness remains false with SESSION_IDENTITY_UNSUPPORTED in this control.
These policy observations still do not grant runtime dispatch.

Actual public prepare→verify: missing field RED7/76.03s→native1/16 PASS99.68s.
The helper bridge terminates before both commands; no deadline was raised.
Related CLI/recovery/admin62/232 PASS46.09s; typecheck/syntax/diff PASS.
Private51f765be… source-audit SHA256
`9c6e5d40565159ad8493dd7433181945afdb3c993ea1a2a783b7d4b72c627bd0`
checks83/45 sources+9 pins: actual10→0 before every reconcile-user command,
readonly verification0, three continuous admin lifetimes/transport ACKs, both
unactivated finalizers released and exact own pair/network/root absence.
RED80d294fe… auditbf910e54…35/17 retains the original missing-field receipt and
executed sources with a verified safe boundary. Pre-CLI finalization release is
separate from evaluated-attempt cleanup. Runtime admission must still bind the
frozen policy/fingerprint and detect drift; backend operations/locks, backup
and remaining readiness gates remain mandatory.

### Controlled detached JavaScript execution and stop (2026-10-16)

The research-only session-active-probe uses the existing one-node package and
sets its native engine Code to exact interrupt-probe.js. This bounded CPU loop
runs20s. The activation is unfinished before creator context loss; a fresh
observer still sees the retained pending Count1 session with active Progress.
A natural control observes active→idle before closing it. The stop control
calls the existing bound CloseSession while Progress is active and then observes
complete session/package absence across collections. Existing ownership and
PendingDisconnect guards are unchanged. The observer connects before the probe
supervisor; no deadline was raised.

Final close1/53 PASS61.68s and natural control1/54 PASS79.82s freeze identical9
code/binary/input pins and image manifests. Browser/controller activation-start
to fresh absence spans3051ms for stop and21456ms for natural completion; native
StartTime remains untouched. Related50/162 PASS22.75s, typecheck/syntax/diff PASS.
Private05c609b2… audit SHA256
`48d6b74906a33d26d8253124bfb27a8124b53aa2f9059d19d0e9ef9afc6dcec1`
checks64/25 sources; control0ff79e61… audit
`192a52d358dca035f84f0b9a5872826240621a41a29a965407689746ce1a1540`
checks184/73 sources: full native replies/journals, continuous closures and
transport ACKs for both admins, retained input and exact own pair/network/root
absence. Missing-phase REDcb0aeee0… and the initial natural control retain their
original sources and verified boundaries.

This qualifies one actual JavaScript operation after client-context loss. Actual
CLI crash, simultaneous B activity, backend file descriptors/locks, backup and
storage/no-regrowth plus durable cleanup consumption remain unqualified. The
component evidence keeps operationsQualified=false and cleanupAllowed=false.

### Concurrent native operation isolation during A stop (2026-10-16)

The active-peer fixture runs ordinary designers A/B on one owned pair. A uses
the detached20s source; B uses connected10s peer-probe.js with a successful
work-item result. Both native packages must show Progress before A is stopped.
The existing bound CloseSession removes A; the same B package remains active
through the same observer, then completes with finished=true/failed=false/status4
8108ms after A closure. B's file-canary hash is unchanged and B closes separately
only after this success. All admin connections precede active execution.

Native1/75 PASS83.41s; related50/162 PASS21.52s, typecheck/syntax/diff PASS.
Privateb36aa5a7… source-audit SHA256
`f175c946a4bec5dbc33d6bfbc6c20cc21cda1e88ea019fc50f819fcd3830a464`
checks69/33 sources+11 pins: actual full replies/journals, simultaneous Progress,
B successful continuation, unchanged canary, all three continuous admin closures
and transport ACKs, exact own pair/network/root absence and retained input.
The first missing-phase RED was masked by an incorrect fixture boolean assertion:
the qualifier returns a proof object. That original fixture was settled only
after all three actual closure/transport sources qualified; original failures
remain intact. Peer teardown uncertainty now prevents fixture deletion.
This qualifies native JS/user independence; actual CLI crash, backend FD/locks,
backup/storage/no-regrowth and durable evaluated cleanup/admission remain open.


Pending local recovery and evidence archive (2026-10-16): durable evidence
archival is separate from readiness/admission. With the exclusive profile lease
held, archiveProfileEvidence rejects a writer marker or a live profile process
(two fresh idle observations). Quiescent recovery .tmp/.json and pending connection
files are moved intact as history under the existing inode/hash manifest; this
does not resolve their native effects. assertProfileSettled and admission retain
their strict checks. The finalizer still requires qualified process closure,
committed archive-before-close and exact native session absence, and keeps both
storageDeletionAllowed and nextAdmissionAllowed false. Unit controls cover
pending history, actual argv/env-only live writers, interrupted moves and replay.


Actual CLI consumption of pending-history archive (2026-10-16) is now positive:
real sandboxed CLI, local deterministic provider, native bounded JS execution
through the existing Calculator handler, supervisor interruption on Progress,
fresh backend activity after local closure, committed archive including recovery
.tmp, exact agent/setup session closure and fresh absence. Private d9c44aac…
audits2191 checks/168 sources/26 causal frames and18 source/binary pins. Session
close settled17.661s after the first observed active command and11.704s after
the post-CLI active observation; these intervals are not native RPC durations.
Native1/14 PASS180.97s, all own disposable resources/root absent and history
retained. Both storageDeletionAllowed and nextAdmissionAllowed stay false; hard
crash, backend FD/locks/no-regrowth and full cleanup consumption are still open.


Hard CLI crash follow-up (2026-10-16): the native replay case selected by
`--test-name-pattern 'is killed during server execution'` now sends SIGKILL only
to the unique admitted candidate executable in the exact slot scope, using
signalProcess with a fresh full-identity check. Private intent records identity,
owner/launcher and immutable native Progress trigger. Actual exit137 has neither
timeout nor controlled-interruption flags. Continuous local closure is followed
by fresh backend activity, committed pending-history archive, exact agent/setup
closes and fresh absence; both cleanup/admission grants remain false.
Native1/16 PASS184.30s; private5e699014… auditf8cbd6b2…2239 checks/183 sources,
29 causal frames and18 source/binary pins, SQLite-copy integrity, original archive
objects, admin transport/closure and exact own disposable pair/root absence.
The wrong-abort RED966365c1… failed safely; auditfdcf3641…2223/179 and all own
resources/root absent. Related22/160 PASS30.09s, signal identity/refusal3/6
PASS0.217s. This resolves the controlled hard-CLI-crash component; FD/locks,
no-regrowth, backup, full N2/live runtime and normal admission remain open.


Resolved research archive incidents (2026-10-16): own f5473183…/ZjdFIE,
2f0726d8…/5FqIMa and dc751ee6…/fHXu1g have been decommissioned. Read-only
preflight verified original actor inventories, continuous CLI/management/admin
closures, admin transport ACK and unchanged exact pair epochs. Public CAS acquired
recovery-only server and composite profile/user claims; durable archive preserved
pending history before public factory teardown. Fresh checks prove all9 original
container/network IDs and3 scratch roots absent. Original failed tests, old/new
lineage, factory commands/releases and SDK histories remain in private evidence.
Independent read-back: f547 auditfe65226a…1685/34,2f audit3de7c127…1864/36,
dc audita1f808b2…1875/34 (5424 checks/104 sources total), including original
archive inode/bytes, SQLite private-copy integrity, exact CAS lineage, persistent
global factory release proofs and current absence. Support scripts and9 public
controller source pins are bound to589f32a7ca. This disposal covers dedicated
research namespaces; normalRelease, storageDeletionAllowed and nextAdmissionAllowed
remain false. Production recovery, FD/locks/no-regrowth and live admission keep
their existing gates. Older unrelated incidents were preserved. Four duplicate
temporary logs were removed only after matching retained SHA256 copies.


Native package FD/flock follow-up (2026-10-16): a bounded read-only kernel
observer on the ordinary unprivileged research pair enumerates container
processes, brackets their births, and records scoped FD targets/stat/fdinfo,
raw maps and `/proc/locks`. The collector excludes its own PID. The native
package retains a PID1 sidecar `.progress-probe.lgp.lck`; fdinfo and both kernel
lock snapshots positively identify FLOCK ADVISORY WRITE on its exact inode.
After active bound CloseSession and fresh package absence, both post-close kernel
lock snapshots lack that tuple and no own-root descriptors remain; daemon birth
is unchanged. A directory FD appeared only in the earlier diagnostic sample.
Native1/65 PASS71.90s; private7b3fb852… audit77f25169…82 checks/28 sources+11
source/binary/input pins, both admin closures/transport ACKs and exact own
pair/network/root absence. Source start→native absence3640ms is a controller
observation interval. Related50/162 PASS25.04s, typecheck/shell syntax/diff PASS.
First diagnostic7d37a6a8… preserved its callback-shadowing failure and complete
metadata; audit18791214…82/28 checked teardown and recovered the minimal close
reply only through an exact immutable journal replyHash match. Its resources/root
are absent too. This establishes a positive package FD/FLOCK control. Durable
fenced observation consumption, B-active filesystem controls, no-regrowth and
general workload coverage remain open; operationsQualified and cleanupAllowed
stay false. Final collector repeat7841a66a…1/65 PASS84.80s, auditf6eff982…
82/28+11 pins confirms the same native control with the newline fix (controller
source start→absence5567ms). A separate real child control3193c23f… RED→
4210e0e9… GREEN1/9 PASS30.52s qualifies exact trailing-LF FD targets and a
positive executable mmap; sentinel-preserving readlink fixes shell trimming.
Its independent audit9c9c3af9…61/16 preserves both verdicts/source snapshots
and proves all own resources/roots absent. This is collector visibility, not
a qualification of workload-wide quiescence. One never-started configuration
fixture was removed after retaining its manifest and confirming empty journals.


Fenced kernel snapshot receipt (2026-10-16): `captureServerFiles` and
`readServerFiles` use the shared `src/server-files.ts` collector. A private,
fsynced version1 receipt stores the raw NUL stream and ordered controller times,
exact ServerIdentity, server command/token/revision/journal, slot/token and
collector script SHA. Capture and replay recheck both held leases and current
pair epoch; replay checks the immutable semantic source hash, protocol tags and
single ordered outer boundaries before deriving process/FD/maps/lock data.
`storageDeletionAllowed` and `nextAdmissionAllowed` remain false: this is one
observation, not a session-close, operation-cessation or no-regrowth proof.
Recovery requires a fresh observation under its current fences; old-token data
is not silently adopted. Cleanup consumption remains open; finalizer binding is
described below.


Post-close kernel binding (2026-10-16): a new `finalizeSlotAttempt` terminal
requires `serverFiles`, a source reference produced after its complete native
absence snapshot. The point's controller start time must follow the absence
command's finish. A completed replay reads this exact raw source through
`readServerFiles` under the current fences, preserving the terminal source;
it never replaces a missing or corrupt point with a fresh observation. Existing
terminals without this field fail closed and remain available for explicit
future reconciliation. Pending reconstruction without a terminal captures a new
point after its own fresh absence confirmation. This does not certify cessation
of all operations or no-regrowth; storageDeletionAllowed/nextAdmissionAllowed
remain false, and actual cleanup/recovery/admission still require their gates.


2026-10-16 writer refusal diagnostics: `ProcessCleanup.writerRefusal` optionally
retains the first unavailable-owner observation: lookup operation, reader branch,
errno, timestamp and directory device/inode/UID/mode used by that lookup. It contains
no owner bytes, argv or environment. The reader branch is not proof of the writer's
historical acquisition/release phase. The original error, failed verdict, bounded
wait, guard preservation and reconciliation prerequisites are unchanged. Actual-fs
and supervised-child TDD checks cover missing-owner and EACCES diagnostics plus
receipt persistence;59 supervisor-related PASS/3 existing nativeBusy SKIP/246 assertions and
final writer11 PASS/21, typecheck/diff PASS. Three native storage-finalizer attempts
failed earlier with the same generic writer error in different phases; they do not
qualify the intended hardlink gate. Original proofs/source snapshots and pending
test patch remain private, with exact incidents and research retirement in
`eval_parallel_blockers.md`. No cleanup/admission permission follows from diagnostics.


2026-10-16 finalizer topology fence: after native session absence and its bound
kernel FD point, finalizeSlotAttempt reuses inspectUserStorage with the protected
preparation nonce before terminal publication. Native hardlink RED was accepted by
the earlier code; native GREEN67bf6231 refuses nlink2 before terminal and preserves
raw NUL names/inodes, then accepts unusual own names and a symlink after only the
control hardlink is removed. B canary hash, archive/replay/reconstruction and exact
research teardown pass.1 PASS/39 assertions225.24s, audit324 checks/139 sources/8
causal points+21 pins. Original RED did not retain raw link stat; its successful ln
control and exact source are preserved without reconstructing that observation.
No delete or release is added. Published-inode binding for eventual cleanup,
server-file archival, full operation/mmap/backup qualification and production
admission remain separate gates; both grants stay false.

Browser regression64edcd81 also passes with actual Loginom-created material:
1 PASS/25 assertions237.72s under the unchanged240s budget; audit1902 checks/160
sources/24 causal observations+21 pins. Exact session closure, profile archive,
no duplicate CloseSession and reconstruction remain valid. Related process/session
suites15 PASS/166 assertions61.77s, typecheck/diff PASS. All own test pair IDs and
controller roots are absent; committed SDK/SQLite archives and source snapshots
remain private.8 duplicate temporary logs/helpers removed after retained SHA
read-back. This qualification does not resolve the historical writer blocker.


2026-10-16 own-root file-backed mapping fence: finalizeSlotAttempt reads the
pathname after the five metadata columns of each bound /proc/maps row and refuses
ATTEMPT_SERVER_MAPPINGS_ACTIVE before terminal publication. Space, Unicode and
U+2028 in the pathname are preserved. Native REDfd50f79a accepted a terminal while
an actual copied executable remained mapped after native session absence, with no
own-root FD; five segments matched the physical file inode. Native GREEN672886f3
refuses that condition, then EOF/exit0 plus fresh mapping absence permits ordinary
finalization/replay/reconstruction with the unchanged file inode.1 PASS/37
assertions177.04s; audit309 checks/133 sources/7 causal observations+21 pins.
FD/topology regression4edb2b66:1 PASS/39 assertions192.54s, audit301/133/4 causal+21
pins. Related15 PASS/166 assertions60.46s, typecheck/diff PASS. Existing240s and
holder60s limits remain unchanged. All own resources/controller roots absent,
original failure and SDK/SQLite archives retained.7 duplicate temp files removed
after retained SHA read-back. This is a pathname-scoped snapshot check; anonymous
or relocated mappings and all-operation quiescence remain unqualified. No file
deletion, reservation release or production admission permission is added.


### All-owned server storage archive producer — 2026-10-16

`archiveUserStorage(file, server, slot, id)` is a data-preservation primitive.
It requires the exact held server/slot fences and protected published ownership,
binds the current physical root, and observes the entire root without following
links. NUL-delimited metadata includes root/entry modes, symlink targets and raw
mtime/ctime. Two independent Docker cp tar reads must have identical regular-file
names, sizes and SHA256, and the final physical/metadata snapshot must match.

The private history directory receives `payload.tar` (0600) under a durable
copying → committed journal, with payload SHA256 and per-file hashes. File and
directory fsync plus payload read-back precede committed publication. GNU tar
and sha256sum from /usr/bin:/bin are required for stdin-only regular payload
verification: Bun1.3.14 Archive.files truncates Docker-compatible PAX at Unicode
paths in the observed runtime. No archive members are extracted to the host.
Symlinks remain archive objects, with exact targets in the manifest.

TDD missing-module RED → real Docker filesystem positive1/21 PASS37.89s.
An independent Python tar reader verifies all ten regular files including binary
LGP and pathological UTF-8 names, the neighbor symlink and an empty directory;
source metadata and B canary remain unchanged. The fixture uses data-only
protected account authority and does not create a native Loginom user/session.
`storageDeletionAllowed` and `nextAdmissionAllowed` remain false. Committed
replay, partial-copy recovery and normal finalizer consumption are specified
below; general cleanup remains pending. This producer grants no operation-quiescence
authority.

Related profile/archive/user/agent/management32 PASS/229 assertions63.76s;
package typecheck and diff checks PASS. Private source/control verification
`f6869d56c56d5dd3ed5a32110b786fd4279165dac3f3e140ebb0e9ecaae3e0f2`
is retained; seven temporary duplicates were removed after hash/read-back.


### Committed server archive replay — 2026-10-16

`readUserStorageArchive` verifies a historical committed source under the exact
held server/slot context and protected publication. The directory inode and
private canonical paths, payload regular/single-link UID600 metadata, full tar
SHA256, regular-file sizes and per-file SHA256 must match the source. Source and
context are reread after payload verification. Current server contents are not
needed for this historical proof; it grants no deletion or admission.

A repeated `archiveUserStorage` with the same id also checks fresh physical root
metadata and current regular content against the saved snapshot. A changed or
empty source is refused without replacing the old journal or payload. The
historical reader can still return that original archive after source removal.

Actual Docker RED1FAIL35.44s (prior EXISTS refusal) → GREEN1/7 PASS42.14s.
Added negatives for changed source SHA, foreign context, payload0644, hardlink,
symlink and equal-length byte corruption require no further production changes.
Both full pathological-name and replay/private-boundary tests2/36 PASS91.95s;
package typecheck/diff PASS. Copying reconciliation follows below; recovery-only
lineage and general cleanup remain open, with both grants false.


### Partial server archive reconciliation — 2026-10-16

A `copying` receipt can resume only under the same protected context, physical
root metadata and regular content as its initial intent. The original payload
is retained, including a truncated file or its recorded absence. Recovery writes
a new complete tar into a fresh private history directory; it does not overwrite
the previous payload. `partialCopies` records each expected original payload and
its observed size/SHA256 or absence. Read-back verifies that retained chain as
well as the new full payload. Partial bytes are fsynced before publication.

The shared loader validates every partial path under the current slot's canonical
private `historyDir/user-storage-*/payload.tar` before archive creation. Partial
chains cannot refer to another directory, even if that file is private and its
SHA256 matches. Changed server source is refused without replacing the pending
journal or its material. These are preservation receipts, with both grants false.

The first real-filesystem copying/truncated+absent reconstruction passed1/9 in
61.13s after the prior committed-only reader refused it. A subsequent actual RED
accepted a foreign-history partial (53.16s); shared loader scope checks address
that boundary. Full pathological-name/replay/partial regression3/50 PASS171.99s
includes changed-source refusal with unchanged pending journal/payload; typecheck
and diff checks PASS. Exact RED/final source snapshots and original verdicts are
retained in private evidence; five temporary duplicates were removed after
SHA/read-back.
The fixture reconstructs a copying boundary on actual filesystem; it does not
claim an actual SIGKILL, native Loginom session, recovery-only lease adoption or
full cleanup qualification.


### Normal finalizer consumes server storage archive — 2026-10-16

`finalizeSlotAttempt` now publishes version3 only after native own-session absence,
fenced kernel FD/mapping checks, and committed preservation of the entire owned
server root. The storage producer itself repeats the protected physical/topology
inspection before copying; the pending path no longer duplicates that inspection
outside the producer. Terminal `storageArchive` references the immutable source.
Completed replay reads the historical payload and retains the existing current
root topology check. Reconstructed pending finalization validates the current
root/content against a prior committed archive and reuses that same source.
An old terminal without this source cannot be silently promoted to version3.
`storageDeletionAllowed` and `nextAdmissionAllowed` remain false.

A focused test-only archived variant uses the same native CLI/actual Loginom,
local replay provider, protected user/preparation and240s budget. Existing FD,
hardlink-topology, active/crash and mapped variants retain their own controls.
Native RED e183a9a4…1FAIL/11 assertions162.53s lacked storageArchive. GREEN
d9a1bf27…1PASS/32 assertions187.16s verifies post-kernel archive ordering, stable
replay and missing close-sidecar/terminal reconstruction with unchanged archive.
Both fixtures' own3 IDs/root are absent; histories and exact source snapshots
remain. The GREEN physical NUL-listing and independent tar decoder match all9
regular files, binary LGP input SHA and symlink object. SDK SQLite private-copy
quick_check/session query and original family hashes pass. Audit7a2b69e7… covers
80 immutable/entry source references plus23 pins/20 text snapshots.
Related15/166 PASS63.16s, package typecheck/diff PASS. Existing FD/topology native
regression1f474d72…1/43 PASS214.58s; audit7da6f7bf… verifies90 references, all9
regular payloads,23 pins/20 snapshots, SDK SQLite and own3 resources/root absence.
Additional literal oracle9c4a10dc… verifies FD refusal/exit0, unchanged hardlink
refusal and each regular byte value. Browser regression is running within240s;
general cleanup and recovery-only lineage stay open. The prior2203 timeout was before the new assertion on unchanged baseline;
its cause is unproven, original FAIL is retained and its research fixture is
retired without granting normal release. Details are in eval_parallel_blockers.md.
<!-- original-end evals/docs/parallel-users-contract.md -->

<!-- original-begin docs/testing/loginom-ai-agent/parallel-evals.md sha256=8d9a7d266015fc2ad1c2014f76ed0baf5cfa126d35b4a69444195574a131b9f0 -->
# Runbook параллельных evals по пользователям

2026-10-13: контракт принят, реализация начата; live v2 ещё не квалифицирован.

Текущая сверка интерфейсов2026-10-15: `parallel-env status` читает состояние,
`prepare`/`verify` возвращают ready=false до полной qualification, `recover`
поддерживает offline judge и ограниченные pre-CLI unactivated preparation
incidents с подтверждёнными sources/lineage. Active eval-slot recovery и
production `run` со slots остаются закрыты. CLI/preparation/mixed lease recovery
12 PASS/70 assertions (26.51s); проверка не подтверждает active-child recovery.
Native management A/B setup overlap, targeted close A при живом B и свежий check B
прошли1/16 (167.84s), source audit584/177; delete/admission=false. Исторические
этапы ниже сохраняют прежний фактический статус.

2026-10-15: physical user-root inspection/publication реализованы как внутренние
API под slot/server guards и protected account source; private journal + exact
inode/epoch/marker SHA, crash reconciliation и foreign/symlink refusal проверены.
75 unit/native tests PASS/359, typecheck/diff PASS. Native Docker filesystem controls
используют data-only account authority; public prepare/verify и live readiness
по-прежнему не квалифицированы. SessionBackup/native cleanup/effective ACL остаются gates.
Нормативный источник — [контракт](../../../evals/docs/parallel-users-contract.md),
интерфейсы/команды/gates — [план](../../superpowers/plans/2026-10-13-evals-parallel-users.md).
Команды из плана становятся применимы только после реализации соответствующих
задач; документ не подтверждает готовность скриптов или текущего стенда.

Рабочая база `evals-parallel@b54455e187fb0a728787263e17a1adc828d77221`.
Один исполнитель текущей задачи владеет всеми файлами таблицы владения плана;
сведение run.ts выполняется последовательно. Семь исходных untracked-файлов
не включаются в коммиты; node-selection работает в отдельном worktree 4118.

Многофайловые проверки из `evals/` запускать через `bun run test` или
`bun run test:unit`: оба scripts передают `--isolate` установленному Bun1.3.14.
Отказные CLI-тесты намеренно оставляют failed scopes в process-local supervisor
registry; общий module cache переносил их в следующий файл и корректно давал
RESOURCE_OBSERVED_PROCESS_PROOFS_INCOMPLETE для чужого неполного набора proofs.
Изоляция сохраняет этот production guard и failed scopes внутри файла.
Actual two-file module-cache smoke: без flag1 PASS/1 FAIL, с flag2 PASS;
связанный resource module с flag6 PASS. `[test] isolate=true` в bunfig этого
установленного Bun эффекта не дал. Изоляция не устраняет timeout или ошибку
ownership внутри одного файла и не означает успешную полную регрессию.

Resource coordinator с frozen manifest теперь требует sealed agent inventory
каждого выбранного slot из canonical controller state/runId. Captured SHA и
command/slot/producer проверяются до вывода всех process sources, включая retry;
caller list не исключает записанные запуски. Missing inventory даёт INCOMPLETE.
Component38/338 и policy/sampler/collector/judge58/350 PASS, typecheck/diff PASS.
Полный runtime census остальных actors и production admission ещё открыты.

Fixture judge --version теперь следует после home lease. Version/exec пишутся
в один protected inventory; release требует его seal и сохраняет captured SHA
со всеми canonical proofs. BUSY не запускает version; unknown cleanup удерживает
fence. Judge/process/offline57/267 и current main/recovery/admission31/233 PASS,
typecheck/diff PASS. Старые snapshots остаются unsealed; resource aggregation
этих judge sources и live private-home qualification ещё открыты.

## Подготовка и границы

Целевой host — lg-pc-75/10.200.2.58. Новая пара на отдельной сети и loopback-порту,
отдельная research pair для restart/backup опытов. Dev loginom-net и legacy
loginom-evals-isolated сохраняются. Remote eval-tests/10.200.13.152 и
R/operations/stand.lease — legacy-only; миграция здесь не выполняется.

Bootstrap /var/lib/loginom-evals/locks и private admin/judge auth выполняется
до live; prepare проверяет постоянный lock root без sudo/override. Marker v2
заменяет на новой паре v1, старые broad-cleaners отвергают его. Standalone
prepare/verify должны закрыть собственные sessions/processes и записать release;
readiness не резервирует среду. Run заново acquire/admission. Неопределённость
сохраняет durable reservations, несмотря на освобождение OS guard после crash.
Recover требует incident/lineage/CAS и новых proofs, не удаления lease по PID.

Ctrl+C во время проверки версии судьи теперь передаётся от calibrate/judge-only/run
в supervisor: собственная цепочка завершается, команда отказывает с exit 2 до
нового измеренного вывода; judge-only сохраняет прежний summary. Actual Bun и
fake-codex qualification: 117 tests/661 assertions PASS, typecheck/diff PASS.
Это проверка version admission; live OAuth и другие Loginom probe owners остаются
открытыми. Неопределённый offline outcome сохраняет durable reservation.

Реализован resource collector: raw CPU ticks, MemAvailable/swap,
disk/inodes и пропуски измерений в private JSONL. Он не читает credentials или
содержимое профилей и не требует готовых users. Запускать с очищенным env;
в приёмке collector принадлежит trusted supervisor, отдельная команда пригодна
для диагностического host sampling:

```bash
cd /home/kiselev/.codex/worktrees/96cd/loginom-ai-agent/evals
env -i PATH="$PATH" bun --no-env-file run script/sample-parallel-resources.ts --config /home/kiselev/.local/state/loginom-evals/parallel/slots.json --out /home/kiselev/.local/state/loginom-evals/parallel/evidence/resources-before.jsonl --interval-ms 1000 --run-id acceptance-two --phase before
```

Output parent должен уже быть canonical private0700; existing evidence не
перезаписывается. SIGINT/SIGTERM завершает запись и закрывает collector. После
закрытия JSONL CLI создаёт exclusive0600 `<out>.summary.json` и возвращает
summary_file: source path/SHA-256, run/phase, min/peak/delta, observed/missing
и counter resets. Неподтверждённая epoch/birth не даёт числового sample;
container epochs, process births, cgroups/ancestors и I/O device/op имеют
раздельные серии. Внутренние пропуски между наблюдениями той же identity
учитываются, samples не дописываются. Series counts относятся к наблюдённому
окну identity; acceptance coverage ещё требует отдельной проверки.
Actual sampler/private files/Docker/namespace:42 PASS/321 assertions,
typecheck/diff PASS. Summary не является acceptance PASS. Labels
обозначают заявленный контекст, без flags остаются null и не доказывают связь с
измеренным run. Standalone CLI не подключён к реестру другого процесса: processes=null. Controller
binding и итоговая resource/licence acceptance ещё открыты; этот CLI не выдаёт readiness.

Receipt policy assessParallelLimits отвергает rate/quota/HTTP429 даже перед
успешным retry, а также classified licence/session/OOM/ENOSPC events.
Неполная provider/Dock/judge coverage или malformed event дают incomplete;
известный limit остаётся failed. Сохраняются quality attempts и прежний
failure_kinds.provider. Шесть redacted receipt tests PASS; реальные producers
ещё должны доказать coverage до объявления complete. Этот policy gate не
наблюдает transport и не предоставляет live admission сам по себе.

Licence receipt policy связывает normalized readback с exact Server/Studio
identity и выбранными users; requires known limit (positive integer либо
observed unlimited), all_sessions counting scope и фактическую concurrency
users+admin. Missing/unknown/inconsistent metadata даёт incomplete; bound
denial/epoch mismatch/limit exceeded — failed. 7 дополнительных redacted
receipt tests PASS, полный policy набор13 PASS/68 assertions. Реальный
licence producer ещё не квалифицирован: нет bootstrap admin. Другие counting
scopes остаются incomplete до отдельного подтверждённого контракта; licence
keys и успешная реальная выдача этими unit inputs не создаются.

assessResourceBudget проверяет version1 declared bounds по scope/metric с
nullable minimum/maximum. Budget связан с run_id и fixed_at строго до
startedAt; min/peak violation даёт failed, missing/reset/whole lost interval
— incomplete. Malformed/empty bounds не пропускаются. Policy18 PASS/95
assertions, вместе с reducer/private evidence29 PASS/138, typecheck PASS.
Список обязательных scopes и quotas, source SHA/read-back и фактический frozen
manifest проверяются отдельными gates; этот reducer policy сам не доказывает
полноту бюджета или coverage всего run.

Readonly readResourceSummary требует expected raw samplesFile/runId/phase от
controller. Source path не берётся на доверие из receipt: mismatch запрещает
открытие replacement. Проверяются private metadata, SHA actual bytes и
пересчитанная summary; изменённый header не может переименовать raw run/phase.
Evidence не переписывается. Общий writer/reader/parser regression с
policy/Docker/namespace:63 PASS/429 assertions, typecheck/diff PASS.
Component schema/mandatory scope coverage и frozen manifest/coordinator
остаются следующими gates.

Component decoder дополнительно проверяет dtype cgroup counters/quota,
process identity/RSS/CPU/verified и container epoch/inspect/counters/I/O.
Строка вместо boolean/numeric counter даёт отказ до summary output; null
остаётся неизвестным. Docker unsafe integer projections сохраняются вместе
с raw_stats, reducer не превращает их в точные числа. Actual host, admitted
Bun child и bounded Docker controls:65 tests PASS/456 assertions, typecheck
PASS. Coverage, applicable ancestor/controller fields и manifest binding
проверяются отдельно; malformed данные не считаются отсутствующими samples.

Resource presence/binding policy требует host CPU/memory/swap и заданные
filesystem capacities в каждом sample, exact prepared container epochs и
CPU/RAM/PIDs/I/O. Expected owner задаётся kind/id/launcher PID/birth; нужен
хотя бы один observed snapshot с verified RSS/CPU и живым launcher в members.
Actual A/B supervisor controls показывают независимость B после A drain.
33 policy/producer/evidence tests PASS/220 assertions, typecheck PASS.
Это presence gate: весь active interval, cgroup applicability/counters/quotas
и mandatory frozen requirements ещё должны быть проверены. Диагностические
empty requirements не предоставляют live qualification.

Cgroup samples/ancestors содержат observed controllers list. Unreadable
cgroup.controllers даёт null+diagnostic; старые quota/throttling null
не подменяются0/max. Текущий runner leaf имеет memory+pids, /user.slice
имеетcpu и cpu.max=max100000; root limit files отсутствуют.
[Kernel CPU contract](https://docs.kernel.org/admin-guide/cgroup-v2.html#cpu)
описывает постоянные usage fields, дополнительные local CFS stats при
включённом controller и non-root cpu.max. Это read-only metadata;
applicability и привязка view к hierarchy ещё требуют qualification.
Actual sysfs/private EACCES namespace + resource/Docker/policy regression:
69 PASS/490 assertions, typecheck/diff PASS. Controls/limits не менялись.

Sampler связывает canonical proc cgroup path с sysfs через target PID в
cgroup.procs и повторный proc/membership read после counters. Inherited
global sysfs root в новой cgroup namespace больше не выдаётся за target
scope; target exit во время blocked read даёт unknown+membership diagnostic.
Aligned virtual-root view сохраняет local counters, но не доказывает
видимость внешних ancestors. Реальные namespace/exit controls2 PASS/17;
resource/policy/Docker/namespace71 PASS/507, typecheck/diff PASS.
Global hierarchy/root applicability остаётся отдельным gate;
controllers/limits/foreign processes не изменялись.

Scope view fingerprint хранит observed cgroup namespace ID и sysfs hierarchy
root device/inode; unavailable view=null с diagnostic. Actual CG namespace
control отличает global и aligned virtual roots даже при proc path=/.
72 resource/policy/Docker/namespace tests PASS/516 assertions, typecheck PASS.
Fingerprint предназначен для immutable expected runner view в manifest,
его значение само не доказывает global visibility и не подменяет quota null
значением max. Namespace/inode constants не захардкожены.

assessCgroupCoverage требует qualified global runner view из frozen manifest,
canonical path и полный ordered ancestor chain. Missing evidence — incomplete,
known wrong view — failed. CPU usage проверяется на каждом scope; active
non-root cpu/memory controllers требуют соответствующие interfaces, явно
inactive controller не превращает null в числовой0/max. Root-only applicability
следует [kernel contract](https://docs.kernel.org/admin-guide/cgroup-v2.html#cpu)
только после qualified global anchor. Contradictory availability/interfaces
оставляют gate incomplete. Actual host/Docker/namespace + policies:77 PASS/544
assertions, typecheck/diff PASS. Expected global anchor нельзя выбирать по
непроверенному artifact; producer/frozen manifest/coordinator ещё не wired.

assessResourceTimeline проверяет окно dispatch→confirmed cleanup, ordered sequence,
monotonic elapsed, неизменный interval и отсутствие missed intervals/whole gaps.
Unknown clocks либо неполное окно дают incomplete. Actual supervised Bun command
охвачен real1000ms collector; 3 policy tests/16 assertions и smoke/4 assertions PASS.
Ресурсный regression:81 PASS/564 assertions по семи files, typecheck/diff PASS.
Frozen manifest и process lifetime coverage ещё не подключены к coordinator.

Resource evidence coordinator читает verified raw bundle и применяет named
timeline/coverage/cgroups/budget/incidents checks. Frozen declared budget создаётся
через freezeResourceBudget: новый private/fsynced файл, automatic fixed_at,
captured SHA до dispatch. checkResourceEvidence принимает этот file+SHA и
проверяет bytes/run/time через readFrozenResourceBudget; post-run inline bounds
не дают admission. Изменённые thresholds/source отвергаются, original files
не перезаписываются. Actual fs budget2 PASS/22; policy/source/summary53 PASS/276,
actual1000ms supervised command/coordinator PASS/12, typecheck/diff PASS.
OOM/oom_kill positive transitions и Docker oom_killed отвергают resource gate;
memory_events.counter_increases сохраняет known events после reset. Unknown
observations дают incomplete. Historical summaries без optional field читаются
с пересчётом raw source без переписывания; forged present field отвергается.
Полный mandatory manifest, qualified runner anchor, lifetime coverage, server
storage capacity, licence/limit producers и live dispatch ещё требуют реализации.

Полный текущий regression на6068b57b65:911 PASS/16SKIP/0FAIL,4663 assertions,
927 tests/74 files (1045.92s), exit0; bun typecheck/diff PASS.
Два первоначальных writer initialization failures оказались outdated tests
после intentional c183a97e38; test-only fix сохраняет refusal на directory/
symlink replacement и already observed replaced-owner release.
Диагноз и private log hash: [отчёт](../../../evals/docs/2026-10-14-writer-initialization-diagnosis.md).
Opt-in и nativeBusy SKIP не подтверждают native/live gates; production v2
admission ещё не реализована, Admin/OAuth prerequisites остаются отсутствующими.

Server storage capacity primitive проверен на собственном pinned-image container:
tmpfs16MiB, intact sentinel hash, partial SessionBackup removal, wrong nonce и
invalid role/short ID;31 assertions/typecheck/diff PASS. sampleServerFilesystems
проверяет exact ID/image/name/labels и stable running PID/startedAt до/после probe,
передаёт fixed root paths без shell и собирает только byte/inode counts.
[GNU filesystem stat format](https://www.gnu.org/software/coreutils/manual/html_node/stat-invocation.html)
используется для capacity; [Docker exec](https://docs.docker.com/reference/cli/docker/container/exec/)
наследует container environment, поэтому сам stat выполняется через env-i.
Unknown counters остаются null; отсутствующий root не скрывает healthy root
и не подменяется host FS. Это bounded primitive, не real Loginom storage admission;
Periodic raw frames/schema и semantic summary/coverage теперь связаны с ним:
ID/image/name/startedAt/PID/owner fields и оба stable running flags должны
совпасть. Root metrics разделены по container/epoch/path; unknown не даёт0,
known mismatch отвергает gate, missing/duplicate roots дают incomplete.
Оба storage roots обязательны для Server coverage. Resource93 PASS/683,
typecheck/diff PASS; actual16MiB pipeline и historical summary compatibility
проверены без переписывания raw/old receipt. Mandatory manifest, lifetime,
qualified runner anchor и production/live admission остаются отдельными gates.

JSONL дополнительно содержит host.collector_cgroup: фактический unified cgroup
sampler, CPU usage/throttling, OOM counters и memory/swap current/max. Недоступные
поля остаются null с отдельной диагностикой; explicit "max" означает прочитанный
unlimited limit. Текущий app cgroup общий с другими процессами приложения и не
заменяет counters/limits выбранных Server/Studio/CLI owners или их ancestors.
Host/CLI/private namespace qualification: 18 tests/111 assertions PASS,
typecheck/diff PASS; чужие cgroups и настройки лимитов не изменялись.

Программный sampleContainerResources(fullId) читает one-shot stats по фиксированному
local Docker socket: CPU nanoseconds, RAM/limit, PIDs, доступный block I/O и исходный
API body для сохранения точности больших counters. Unknown=null с диагностикой,
names/short IDs отвергаются. Engine1.48 не возвращает id внутри one-shot response;
binding задаёт полный ID в URL. Disposable bounded container и disappeared-ID
smoke вместе с host/CLI квалифицированы; это не Loginom sessions/resource acceptance.

CLI использует controller.stateDir/pair.json только как private ready ownership
metadata. При отсутствии journal containers=null; invalid/incomplete journal
отвергается до output. Каждая контейнерная запись проверяет full ID/image/name и
owner labels; несовпадение сохраняет inspect diagnostic, counters/raw_stats=null.
Selected Docker inspect хранит CPU/memory/swap/PID limits, started_at/running/OOM и
host PID; Config.Env не читается. Actual CLI с bounded shells на обоих pinned
images и synthetic private journal, healthy wrong-nonce control и env canary:
24 PASS/185 assertions (16.24s), typecheck/diff PASS. Container limits и чужие
ресурсы не менялись; все test containers удалены после exact ownership checks.

sampleProcessResources({identity,owner}) читает только proc stat/status/executable
metadata и cgroup. RSS хранится в bytes, CPU — в raw ticks. Birth, UID, executable
device/inode/path, PGID/SID и cgroup path сверяются повторно; changed/exited process
оставляет counters unknown. Owner label — вход trusted caller, этот primitive не
доказывает admission/ancestry и не сигналит процесс. Process-local sampleSupervisedResources получает defensive copies admitted identities
из supervisor registry, а collectHostResources сохраняет их через явный callback.
Scope с ошибкой наблюдения/evidence остаётся unavailable/null. Actual A/B tests
проверяют metrics, independent cleanup и неизменность signal identity; resource
suite31 PASS/276 assertions, typecheck/diff PASS. Acceptance coordinator и normal
main ещё не подключены; model/Loginom calls не выполнялись.

Cgroup sample содержит ancestors (parent → /), CPU quota/period из cpu.max и
memory/swap limits/counters каждого scope. Это чтение применимой иерархии,
описанной в [kernel cgroup v2](https://docs.kernel.org/admin-guide/cgroup-v2.html),
без изменения настроек. Missing/noncanonical membership и недоступные fields
остаются unknown; literal max сохраняется только после чтения. Shared ancestor
load/OOM не приписывается отдельному slot. Actual proc/sysfs и private ancestor
quota mask: 29 resource tests PASS/251 assertions (16.11s), typecheck/diff PASS.

Container sample дополнительно содержит epoch_stable и cgroup host PID. Repeat
selected inspect после stats/cgroup требует прежние started_at/running/PID/image/
name/owner labels; unverified epoch и неверный pair nonce не разрешают использовать
cgroup как bound scope. Actual bounded container: kernel memory.max64MiB,
CPU quota ratio0.25, OOM/throttling counters; 29 resource tests PASS/259 assertions
(17.24s), typecheck/diff PASS. Это Docker resource epoch, не Loginom serverEpoch.

Durable smoke для harness56e96130ee (runtime5c9f312333):
`/home/kiselev/.local/state/loginom-evals/parallel/evidence/resource-proof-ozd6NS/receipt.json`
(0600, SHA2564aee253363151ccb0be2fa3f7bbdf933075f87bc58a7f39deee09f897fbb079e).
env -i PATH-only, bun --no-env-file, credential-prefixed keys0. Сохранены intent,
before/after host snapshots, self process sample, bounded pinned Server
image shell sample и run.jsonl:3 actual frames/1000ms, missed0. Контейнер удалён
после exact ID/image/nonce check; HTTP404 и hashes/private metadata всех6
evidence files проверены. Scope nonmodel-bounded-container-and-self-only,
liveQualified=false; Studio/Loginom/browser/judge/licence/model/budgets/acceptance
остаются вне этого proof. Текущий self cgroup разделён с приложением. Superseded
resource-proof-cSHgaZ удалён после ownership/hash/inventory checks; закрытый
superseded-cleanup.json прочитан обратно, signals0.

Архив history/БД/WAL/SHM/inputs с hashes предшествует server close/readback.
Удаляются только свои файлы и доказанные backups после closure proof;
restart сервера для слота и широкая очистка запрещены. Admission failure —
exit 2/preparation evidence без summary; карантин после dispatch — summary/exit 1.
`interrupted_cleanup` учитывает только interrupted попытки. Node архив выбирается
по slot_id без fallback. Admin state не попадает в env/mounts/results.

## Проверки и evidence

Задача 0: только документы; git diff --check и локальные ссылки проверяются
перед коммитом. Runtime-тесты и модели для этого изменения не запускались.
Исходные evidence — /home/kiselev/.codex/experiments/loginom-users-20261013-50e5f473/.
Проверенные SHA-256 2026-10-13 (сырые dumps/секреты в git не переносятся):

- cli-evidence.json: `1fa09658e821574852625e7524d3831b77cb84b0fec4d3c424269572716bdb64`
- parallel-evidence.json: `86072234b1d86f601cc1ff69a049642ff7572a5c2376f308f9e2c0201d8a9a8b`
- export-evidence.json: `1cd953fd78fe65ee02119d80673683fabc2a8276b7476172683cfafa85d168c0`
- regeneration-evidence.json: `ef37f1b5243997be0f83bcb4c0e03a0f1ac11ffc31a443a371719c86b3f84ef2`
- safe-cleanup-evidence.json: `5f1284c1f9997cb54d75cad4521150c5c7dd072de6ab6ae3731b8311032a0528`
- provenance.json: `0ac1b6f3b050033c683172b17ba7303353618ea2087ec62b5fae9228f2d78bc7`
- cleanup-receipt.json: `467e067c7cd417c4c2304ccd19771850b8707afe0c7e13d898d024ab081fe79c`

Эти исторические файлы подтверждают немодельный эксперимент, не live harness.
До полного допуска остаются session identity/race, непустой SessionBackup или
безопасное отключение, ACL/Everyone, процессное владение двух слотов/admin,
shared OAuth и полный LLM N=2 → N=1 с агентом gpt-6-luna/high и судьёй
gpt-6-sol/xhigh. Tasks/pins/rubric/timeout неизменны между N=2 и N=1.
Ресурсные/лицензионные лимиты фиксируются до запуска; OOM/ENOSPC/429/quota
и неполное наблюдение не объявляются PASS. Исторические серии сохраняются.

Задача 1, конфигурация: parseSlots/loadSlots, ранние отказы --parallel и временный
SLOTS_ADMISSION_UNAVAILABLE до подключения v2 controller. До переноса проверены
`bun test test/config.test.ts test/slots.test.ts test/run.test.ts`: 88 PASS/0 FAIL,
`bun typecheck` и `git diff --check`. loadSlots принимает optional installRoot
третьим аргументом для проверки пересечения с продуктом; проверяет все записи,
canonical paths и private slots/admin files. Live/модели не запускались.
Durable reservations/OS guards задачи 1 ещё не реализованы.

Общий checkout переключён другой задачей на loginom: шесть собственных файлов
перенесены в worktree 96cd, SHA-256 совпали; исходные tracked bytes общего checkout
восстановлены только для этих четырёх файлов, две свои новые копии удалены. Семь
чужих untracked сохранены. Worktree 96cd закреплён за evals-parallel; здесь дальнейшая
реализация. Dev-зависимости Bun устанавливаются локально для повторных проверок.

После переноса в 96cd повторены те же 88 тестов: PASS/0 FAIL (23.65s), bun typecheck и git diff --check PASS.

Примитивы resource lease: постоянный private OS flock guard, атомарный fsync
reservation/tombstone, matching evidence release, recovery-only CAS token/revision
и incident lineage. SIGKILL освобождает guard, retained запись запрещает обычный
run. Guard FD не наследуется child; живой owner/потерянный journal/подменённый
inode/повреждённая lineage отклоняются. Два recovery процесса не принимают одну
revision. Проверены `bun test test/config.test.ts test/slots.test.ts test/lease.test.ts`:
77 PASS/0 FAIL, bun typecheck/git diff --check PASS. Native проверки — отдельные
Bun процессы, временные private roots, без Docker/Loginom/admin mocks.
SlotLease, server generation binding и полноценная recovery CLI ещё впереди.

SlotLease объединяет user (full container ID + exact login/kind=0) и canonical
profile resources в едином порядке keys. Частичный отказ выпускает только
неиспользованные собственные reservations с durable evidence. Group receipt
хранит полный inventory. close снимает OS guards, сохраняя retained fence;
release требует private confirmed CleanupReceipt с leaseToken/serverEpoch и
process/session/archive/storage/next-admission proofs. Lineage сохраняет прежние
owner/command/identity, включая повтор recovery. Same-ID restart меняет generation
и запрещает takeover; разные servers конфликтуют по общим profile/judge keys.
Проверены `bun test test/config.test.ts test/slots.test.ts test/lease.test.ts`:
89 PASS/0 FAIL, bun typecheck PASS. Full unit ещё выполняется.

2026-10-13: разовый owner bootstrap выполнен через доступный sudo -n вне harness.
/var/lib/loginom-evals/locks проверен 0700/kiselev; private parallel roots — 0700.
Existing directories не перезаписывались. Локальные image IDs Server/Studio
совпали с pins дизайна. Работающие dev containers не менялись. Bootstrap admin
credential и пригодность judge/model auth этим не подтверждены.

Задача 1 завершена целевыми проверками: 90 config/slots/lease tests PASS/0 FAIL,
bun typecheck/git diff --check PASS. Последний цикл дополнительно подтверждает
отказ release при подмене owner snapshot, даже с прежним token/revision.
Полный unit запущен отдельно; его результат ещё не получен. Проверки генерации
здесь используют сохранённые server identity fixtures; настоящая Docker epoch
проверка research pair принадлежит задаче 1а. Live v2 по-прежнему закрыт.

Broad unit run завершён: 582 PASS/3 SKIP/1 FAIL, 586 tests (473.96s). Единственный
FAIL — новый owner-snapshot test. Source/test менялись во время этого процесса;
свежий целевой набор после исправления проходит 90/90. Гипотеза: runner ранее
закэшировал старый lease module и позднее прочитал новый тест. Ни test assertions,
ни код не ослабляются; диагноз проверяется повтором narrow case и frozen full unit.
Skipped writer-settlement/owned-registration checks не объявляются PASS.

Задача 1а начата: pure planPair/usersMarker, 4 tests/typecheck/git diff --check PASS.
Docker argv фиксируют image IDs и ownership labels, отдельную сеть, restart=no,
только loopback Studio port; небезопасные routes/dev network/nonce/ID отклоняются.
Marker v2 начинает с пустого owned inventory до фактической подготовки users.
Create/destroy/reconciliation/readServerIdentity и real integration ещё впереди.

Повтор frozen full unit на f8c31e6006: 587 PASS/3 SKIP/0 FAIL, 590 tests/51 files
(467.41s), exit 0; после него bun typecheck PASS. Narrow owner-snapshot case
независимым collector — 5/5 PASS на неизменном SHA. Текущий код не имеет
воспроизводимого отказа; старый mixed-source run не служит проверкой коммита.
Cache explanation остаётся выводом из времени редактирования/раннего import,
не наблюдением внутреннего кэша Bun. Сами assertions и runtime не ослаблялись.

Permanent RPC sources готовы в /home/kiselev/.local/state/loginom-evals/parallel/studio-source:
bg.model.rpc.js, bg.server.rpc.js, bg.model.js и inventory.json (image/path/SHA).
Pinned Studio image проверен по существующему контейнеру: initial-content не
изменён (docker diff), relevant mounts отсутствуют; контейнер использован только
для чтения. Remote/tmp/local SHA совпали; сохранённые files read-back PASS.
Image 69ce44ac1002 полный ID указан в inventory. Source SHA: 53d043e4a7ee9dcc8006aa8915ca43d83a1df427fa0d73d8ea403357ec61a28f,
e80d141da198b7800c3d212a534eb70bf0853a8dd0dd6381793291532f16ace3,
d3ab87a3aca82985d41a8b9d4b3502c9d8d662204c67c07fb3ff2156d802407a.
/tmp originals и чужие artefacts сохранены; own copy-temp удалён.

CI boundary завершён: test:unit исключает семь новых integration suites помимо
прежних исключений. Публичная команда проверена реальным Bun child в private
package fixture: unit выполняется, семь integration modules не загружаются.
RED без исключений дал exit 1; GREEN — exit 0. Пять ci-boundary/parallel-pair
tests и bun typecheck/git diff --check PASS. Этот fixture не подменяет Docker,
Loginom или admin adapter; живые проверки остаются отдельными integration files.

Epoch core проверен: versioned SHA-256 full container ID/StartedAt/host boot ID/
daemon PID 1/starttime. /proc stat comm может содержать пробелы; volatile CPU/state
не меняют epoch. Malformed stats, unknown exe/cmdline/ID/boot запрещают identity.
Read-only dev observation подтвердило pinned image entrypoint
[/app/loginomd,--run,-workdir=/workdir], PID1 exe/cmdline — /app/loginomd.
Восемь pair/CI tests, bun typecheck/git diff --check PASS. Docker adapter
readServerIdentity и research restart integration ещё не реализованы.

Pure reconciliation unknown create принимает только единственный полный ID с
точным именем и kind/purpose/nonce из сохранённого намерения. Отсутствующий ранее
подтверждённый ID, чужие labels и дублирующееся имя network дают PAIR_OWNERSHIP.
Девять pair tests и typecheck PASS; Docker поведение этим unit не квалифицировано.

Factory create/destroy и readServerIdentity реализованы; CLI всегда использует
/var/lib/loginom-evals/locks. Stable provision keys включают Docker daemon ID
и отдельные names сети/контейнеров; добавляется server full-ID guard. Private
ownership journal хранит image pins/nonce/IDs и mutation intent до Docker argv.
Reconciliation принимает только свои labels/IDs. Unknown create без видимого
ресурса сохраняет fence; copy/start не повторяются при unresolved read-back.
Существующий ready Server автоматически не перезапускается. Destroy проверяет
retained incidents и полные IDs, включая renamed containers, до удаления.

Новый disposable research integration: real create + idempotent create +
readServerIdentity/restart same-ID + legacy cleaner refusal/контрольные A/B hashes +
busy-port/foreign-name refusal + SIGKILL/recovery-only fence + renamed-ID refusal +
destroy. 1 PASS/0 FAIL, 24 assertions, 23.98s. 12 pair/CI unit tests и typecheck PASS.
Dev Server/Studio full ID/StartedAt сравнивались до/после и не менялись. Запуск
explicit EVAL_PAIR_INTEGRATION=1; отсутствие flag — SKIP, не qualification.
Проверка не создаёт browser/CLI/admin sessions, model/judge не вызываются.

Observed pinned bootstrap: /workdir существует, Components.cfg отсутствует;
factory создаёт минимальный XML для Python-disabled до первого start и проверяет
xmllint/read-back. В image присутствуют исходные users/storage материалы;
factory не очищает их. Studio server.json должен быть читаем Apache daemon
(644 внутри контейнера; private 0700 host parent). NetworkID пуст до первого start:
prestart проверяет NetworkMode/alias/mounts/ports, после start — полный network ID.

Постоянные acceptance/research slots.json созданы 0600, отдельные names/ports/roots.
Оба bootstrap admin файла отсутствуют, loadSlots реально отказал SLOT_PATH_PRIVATE
до mutations. [Блокер](../../../eval_parallel_blockers.md) остаётся открыт;
постоянные пары не созданы, admin/route/backup/admission/LLM ещё не квалифицированы.
Три старых own fixtures удалены после destroy/absence и released-reservations
read-back; private receipt factory-development-cleanup.json сохранён в evidence.
Чужой loginom-evals-isolated вновь обнаружен на хосте и сохранён без изменений.

Trusted adapter research: prod CLI root
/home/kiselev/.local/share/loginom-ai-agent-cli/0.1.17-prod, source
5588651a291c59f53d1c14941d5ba768071a0018, sourceDirty=false. Read-only full
inventory проверил 5393 CLI и 4381 resource entries: relative/canonical paths,
SHA-256, mode/link/inventory equality, resource↔CLI manifest mapping и ELF/x64/
executable Node/Chromium. Private admin-runtime-inventory.json хранит receipt.
CLI manifest SHA 797c018f95255f805fa1ee05a2ef4d69e44c723f5b1cd3e0772bbee73855fed8;
resource manifest SHA 12542127ff87bdb6828355bcbc148e6ed729dc1e4a8f03c68cdbc93a454e6baf.
Bundled Node --version v24.19.0; Chromium --version 153.0.8010.12; createRequire
от runtime/client/package.json реально resolve/import playwright-core/index.js
внутри установленного client, chromium.launch — function. Browser не запускался,
профили/default CODEX_HOME/credentials не читались и не менялись. Product verifier
algorithm прочитан из packages/loginom-host/src/cli-manifest.ts; будущий harness
не импортирует monorepo runtime. Source-managed row подтверждает getters Name/
CreateTime, CloseSession(ASession,ATimeout), но это пока не live identity proof.

Factory full-unit diagnosis: первый frozen run дал 594 PASS/3 SKIP/1 FAIL
(458.53s). loadSlots private-file negative fixture запросил mode0644, но мой
shell umask077 (ради logfile) создал фактический0600; validator корректно принял
private config. Independent test-signal-collector: 5/5 PASS при022, 1/1 FAIL при077;
отдельный fs probe подтвердил modes0644/0600. Host default0002 эквивалентен022
для этого fixture. Classification: command/environment, не code regression;
breaking commit не установлен и bisect не требуется. slots runtime/tests не
менялись, assertions не ослаблялись. Повтор полного suite без изменения umask:
595 PASS/3 SKIP/0 FAIL, 598 tests/52 files, 2962 assertions, 457.92s, exit0;
post-suite typecheck PASS. Factory source/test SHA до/после совпали. Private
factory-unit-receipt.json сохранён в evidence; временный logfile удалён после
сохранения результата. Три прежних skipped checks остаются непроверенными.

Task 2 pure selector: ServerSession/selectOwnedSessions реализованы отдельными
RED→GREEN циклами. Возвращается свежая observed row, только при recorded remoteKey,
userKey/username/serverEpoch; mismatches и duplicate identities дают отказ.
Username/display name не заменяет identity. 4 selector tests, вместе с pair/CI
16 PASS; typecheck/diff check PASS. Это сравнение доверенных проекций, не proof
production session identity и не разрешение CloseSession. Driver, JSONL codec,
live composite identity race qualification и административные операции впереди.

Дополнительный RED/GREEN route preflight: planPair принимает только pinned
Studio /app/ и backend alias loginom-server-7.4.2-test. Иной path/alias отклоняется
PAIR_CONFIGURATION при построении плана, до provision mutations. 16 targeted
tests/typecheck PASS; исходный full unit относится к factory commit96338cbc32.

JSONL v1 codec реализован в loginom-admin.ts: строгие header/identity/op checks,
request/reply correlation, 1 MiB byte cap, UTF-8/LF framing, absolute deadlines,
один request in flight. Invalid request отвергается до pipe; expired до отправки
→ not_applied. EOF/timeout/malformed/oversized response → unknown с постоянным
safe code, дальнейшие отправки на этом канале запрещены до reconciliation.
Raw malformed reply и canary secret не попадают в diagnostic envelope.

10 codec tests используют stdin/stdout настоящего Bun child — только protocol
peer, без реализации Loginom RPC/пользователей. Детерминированная segmentation
реальных pipe bytes доказывает UTF-8 framing; wire events доказывают single flight.
С selector: 14 admin tests; pair/CI вместе — 26 PASS, typecheck/diff check PASS.
Это transport qualification, не admin/browser readiness. Runtime verifier,
driver, durable intent и dispose ack/process proof добавлены следующими шагами
ниже; live RPC ещё предстоят. Full unit factory не включает этот codec.

verifyAdminRuntime реализован в preflight. До запуска проверяет CLI artifact
format/source/target, весь declared/actual inventory, SHA-256, modes/links и
canonical containment, resource↔CLI claims и required Node/browser/client payload.
Executable headers ограничены квалифицированным Linux/x64. Hash относится к тем
же прочитанным manifest bytes, которые были разобраны. В памяти/FD остаётся один
file stream при проверке payload; monorepo bundle отвергается.

Девять real-filesystem RED/GREEN tests: valid fixture, changed dependency,
unsafe/undeclared paths, modes, malformed/target manifest, resource mismatch,
wrong ELF, external symlink, checkout bundle. Fixture binaries не исполняются;
они проверяют manifest admission. Вместе с preflight/admin — 35 PASS, typecheck/
diff check PASS. Новый verifier реально проверил установленный prod CLI 0.1.17;
manifest SHA 797c018f95255f805fa1ee05a2ef4d69e44c723f5b1cd3e0772bbee73855fed8 совпал
с прежним private inventory receipt. Browser/admin/model не запускались.

Node-driver добавлен в script/loginom-admin-driver.mjs. Протокол allowlist/serial
requests, safe codes, private credential reader; payload init передаёт только
credential path. Resource/manifest/process.execPath/Chromium hash и package
resolution проверяются до launchPersistentContext. Init использует pinned
Studio selectors Логин/Пароль/Войти и проверяет exact username/IsAdmin; inspector
написан по сохранённому GetSessionsManager/UpdateSessionInfos/SessionInfo RPC.
Эти положительные browser/RPC пути пока не квалифицированы: bootstrap отсутствует.

Real bundled Node rejection integration: 2 PASS/7 assertions (3.04s), generic
execution, dispose без context, missing/malformed credential и mismatch runtime
hash. Canary credentials — только временный format fixture; auth/browser не
вызывались, profile не создан, stdout/stderr без canary. Node --check PASS;
36 preflight/admin/CI tests, typecheck/diff check PASS. Integration исключён из
unit CI, явный flag EVAL_ADMIN_INTEGRATION=1. Это не full trusted adapter acceptance.

ManagedSessionInfo.Count по source — число пакетов, не active operations.
Driver возвращает rawSessions/packageCount и activeOperations=null; composite
identity пока sessionIdentityQualified=false. CloseSession возвращает
SESSION_IDENTITY_UNSUPPORTED, user mutations — ADMIN_CAPABILITY_UNSUPPORTED.
Положительные gate/race tests и AdminConnection ещё предстоят; v2 live admission
остаётся закрытым.

Supervisor расширен потоковыми stdin/stdout. Три последовательных обмена через
настоящий child и его EOF завершаются confirmed process proof; зависший consumer
ограничен deadline и даёт failed/capture_complete=false. Protocol stdout уходит
consumer, не в diagnostic output. Все 21 supervisor tests/98 assertions PASS
(98.25s), typecheck/diff check PASS. Browser admission для admin ещё предстоит.

createJournaledAdminChannel сохраняет private exclusive intent до pipe, fsync
файла/каталога; payload/reply сохраняются только как SHA. Outcome становится
durable до возврата confirmed. Unknown и retained intent нового канала запрещают
mutation replay; inspect/dispose разрешены для read-back/закрытия. Ошибка result
persistence либо подмена journal directory дают unknown, прежний intent и чужие
данные сохраняются. Пять real-pipe/filesystem RED/GREEN tests; 41 admin/preflight/
CI tests и typecheck PASS. Это не reconciliation proof и не server cleanup fence.

openLoginomAdmin теперь связывает verified installed Node с journaled channel и
continuous supervisor. Context/profile/journal создаются private отдельно от
слотов; RPC serialized, Docker identity сверяется до init/операций и после успешного
init. Public AdminConnection пока fail-closed для неквалифицированной session
identity/user mutations. Общий controller lease/ownership admission добавляет
следующая задача; adapter сам не заменяет server fence.

Dispose требует data.disposed=true, EOF, exitCode=0 и confirmed/capture_complete
process proof; idempotent promise сохраняет единственный результат. После ack
закрывается stdin, затем ожидается supervisor и лишь потом отменяется reader:
преждевременная отмена stdout ошибочно давала Output transport failed. Continuous
supervisor допускает lifetime без общего timer (null); RPC deadlines и abort
остаются ограниченными. Реальный regression: 21 tests/99 assertions (97.39s) PASS.

Actual Node/Docker bridge rejection: 3 integration tests/17 assertions PASS
(19.49s). Собственная disposable pair; missing credential/parent даёт private code,
init not_applied и dispose confirmed, durable connection receipt/command journals
проверены, two-pass owned_remaining=0, bundled Node identity присутствует, browser
bindings пусты. Stale epoch отвергается до создания context. Собственные Docker/
temp artifacts удалены после проверки. 41 targeted tests, typecheck, Node --check
и diff check PASS. Это отрицательная квалификация до browser launch; bootstrap,
положительный admin login/RPC, crash registry и live acceptance ещё не доказаны.

Независимая очередь scheduler.ts реализует round-major jobs и синхронный claim
перед await всего slot pipeline. Healthy slot продолжает очередь без барьера;
quarantined прекращает claim, abort/ошибка останавливают новые assignments.
Results упорядочены по job.index; AggregateError возвращается только после drain
всех запущенных pipelines. 7 public-interface tests/20 assertions PASS; вместе
с admin/preflight/CI — 48 PASS/111 assertions и typecheck/diff check PASS. Это core
очереди: реальный main/runAttempt/retry, judge gate и summary writer ещё не связаны.

Повторное открытие admin journal проверяет schema, operation/identity, desired SHA
и intent timestamp; terminal state дополнительно требует reply SHA/settledAt.
Запись confirmed без reply evidence даёт ADMIN_JOURNAL_INVALID до mutation.
Real pipe/fs RED/GREEN; последние 49 targeted tests/113 assertions, typecheck/
diff check PASS. Unknown/recovery admission этим не снимается.

createJudgeGate сериализует весь judgeTask вместе с подготовкой/oracle и его retry.
Cancelled waiter возвращает interrupted before judge/attempts=0 без child/setup;
последующие вызовы всё ещё ждут его predecessor. Active abort не освобождает gate
до завершения judgeTask. Finally освобождает gate также после prepare exception.
Gate создаётся для одного run; host-global judge lease остаётся отдельной задачей.

8 real fake-codex gate tests/36 assertions PASS: непересекающиеся start/end,
cancelled B перед C, целый retry A до B, prepare exception, exit/timeout/abort и
отсутствие погибших A в /proc после drain и начало B после completion A. Fake interval log содержит только
PID/dir/event/epoch milliseconds. В наблюдаемом Bun hrtime оказался относительным
к запуску процесса, поэтому межпроцессные интервалы используют Date.now и порядок
start/end events. Изолированный child подтвердил judge CODEX_HOME без наследования
model OAuth, agent profile, Dock/admin environment; действующая judge auth этим не
проверялась. 82 judge/scheduler/CLI/transition tests/490 assertions, typecheck и
diff check PASS (213.12s). Fake fixtures удалены; v2 main ещё не подключён к gate.

archiveProfileHistory получил optional historyDir; legacy default вычисляется от
canonical profile, как прежде. Explicit root должен быть абсолютным/canonical с
существующим canonical parent и не пересекаться с profile. Same/inside/ancestor и
symlink parent отвергаются PROFILE_HISTORY_ROOT до mkdir/перемещений, история и
чужой sentinel сохраняются. 5 новых real-fs RED/GREEN cases; 9 archive tests/35
assertions, полный profile suite 61 PASS/166 assertions (25.32s), typecheck/diff
check PASS. Новый slot caller/sandbox ещё не связан; rollback legacy архива не
заменяет durable move journal и SIGKILL reconciliation из задачи 5.

ensureProfile в v2 (config.slotsFile) проверяет exact url/username существующего
configured profile до setup/config replacement. Отсутствующий/чужой field даёт
PROFILE_CONNECTION_MISMATCH; unconfigured остаётся веткой начальной подготовки.
Legacy callers без slotsFile не требуют новых полей. URL/username подтверждены
read-only исходниками connection-service.view и loginom-management status;
это описание сохранённых settings, не доказательство live Loginom identity/ACL.

4 real fake-CLI RED/GREEN cases (foreign/missing username/url) сохранили config,
setup не вызван; reuse case дважды получил status, не вызвал setup и сохранил
generation/cli-profile. Весь profile suite 66 PASS/188 assertions (29.22s),
typecheck/diff check PASS; новые private fixtures удалены. Fresh setup response/
read-back и full prepare receipt ещё предстоят. Bootstrap paths и planned
candidate-home launcher повторно проверены metadata-only: отсутствуют.

Fresh v2 ensureProfile проверяет setup ack, затем запускает отдельный status для
read-back exact url/username; agent config записывается лишь после обоих совпадений.
Exit=0/правильный ack с чужим saved state не считается binding. Fake CLI читает
stdin-json и сохраняет только URL/username/hasApiKey, без password/apiKey values;
EVAL_FAKE_SETUP_FILE — data-only fixture для раздельных reply/state.
RED/GREEN foreign ack и false ack→foreign saved state сохранили agent config;
positive setup→status→reuse вызвал один setup. 8 v2 cases/32 assertions; 121 profile/
config tests/366 assertions, typecheck/diff check PASS (32.65s). Private fixtures
удалены. Durable prepare intent, actual connection/session и user/ACL qualification
не подменяются этой проверкой сохранённых settings.

archiveProfileEvidence(profile, archive, journal) — новый файловый примитив v2
в profile-archive.ts. Caller предварительно держит profile lease и выбирает private
archive target/controller journal; этот примитив не выдаёт lease/readiness и не
делает server delete. Reuses exported profileHistory/assertProfileSettled; legacy
archiveProfileHistory сохраняет прежние semantics/default.

До rename сохраняется durable intent с root inode/device и recursive content/type/
mode/UID hashes. Preflight согласует source/target каждого root, запрещает ambiguity,
changed profile/target и symlink ancestors. Затем fsync moved files/dirs, source/
target parents, archive tree/root parent, private committed receipt. Recovery
использует те же manifest/target; committed reuse проверяет data/root и не создаёт
пустой новый manifest. Ошибка сохраняет originals/partial archive и intent.

11 real fs/process tests/69 assertions PASS. SIGKILL: child останавливается реальным
SIGSTOP по fs.watch первого rename, проверены T-state, частичный перенос и intent;
SIGKILL и новый процесс завершают тот же архив (44 roots). Проверены DB/WAL/SHM,
inputs, I/O failure+reconciliation, чужой target, symlink parent, hardlink, changed
archive/root, живой env-only writer, dot/leading/space/tab/newline/Unicode names и
symlink-object без чтения target. Fixture hashes/inodes реально проверяются;
внутренних mocks нет. 80 archive/profile tests/267 assertions, typecheck/diff check
PASS (40.10s). New private fixtures/processes удалены; cleanupSlot/recover/main и
server close/backup/delete/release пока не подключены к этому примитиву.

Проверки 2026-10-14 через harness5f0470d1f1: delayed Node browser helper B
появляется после выхода launcher A во время cleanup, теряет parent/argv и
продолжает heartbeat; A исключает его из signals, отдельный abort B подтверждает
own cleanup. Полный supervisor25 PASS/138 assertions, typecheck/diff PASS.
Это физическая fixture qualification; authenticated admin reconnect остаётся
открытым. Superseded RED root /tmp/evals-parallel-browser-MsHk0J удалён только
после двух confirmed/capture-complete/final[0,0] receipts и fresh birth checks;
matchingBirths0/signals0, private late-peer-red-cleanup.json600 read-back PASS.

Offline rejudge/calibrate сохраняют explicit judge.env при исполнении; saved
config содержит только <set>/<unset> values, runtime config не изменяется.
Rejudge снимает SIGINT handler после success/exception. Legacy summary остаётся
без новых полей; parallel slot/time/infra-retry metadata и quality denominators
сохранены: report/compare/analysis/rejudge86 PASS/337 assertions. После process
cleanup uncertainty общий для одной команды judge gate запрещает последующие
process invocations; rejudge сохраняет judge_cleanup_unconfirmed без изменения
измеренного исхода агента. Judge/run/rejudge/calibrate85 PASS/557 assertions,
typecheck/diff PASS. Межпроцессный private CODEX_HOME lease/admission этих
entrypoints и live authorisation этим не квалифицированы; bootstrap credentials,
model OAuth и judge OAuth по прежним private paths всё ещё отсутствуют.

Следующие немодельные изменения через14c9da7f99: loadJudgeEnvironment читает
private slots metadata и возвращает canonical codexHome/stateDir без требования
Loginom credentials; full loadSlots сохраняет прежние требования. Slots/loader21
PASS/41 assertions. Gate разделяет подготовку и допуск invoke: pre-admit failure
сохраняет тип/диагностику и освобождает очередь, post-admit exception сохраняет
fence и запрещает следующую попытку. Physical EISDIR stdout test и прежние checks
не ослаблены; два первоначальных regression failures воспроизведены3/3, устранены.

judgeInfo и preflight теперь подтверждают version probe через superviseProcess
с execution timeout10s и его штатной очисткой. Actual fake-codex child RED
оставался жив после metadata; GREEN дожидается собственного child cleanup по
точной birth. Missing executable снова даёт EvalFailure с safe diagnostics:
collector3/3, исходное ожидание сохранено. Cold judge/preflight/rejudge/calibrate/
run110 PASS/610 assertions (120.21s), typecheck/diff PASS. Native Codex auth и
production/offline global judge lease/release пока не подключены; metadata loader
и generic process probes не означают live readiness.

Через765c6683de production main подключает v2 judge-only/calibrate к private
command journal и host-global canonical CODEX_HOME lease. Пробы проходят уже под
lease; release требует judgeCleanupConfirmed и bound cleanup proof, quality code
не заменяет process proof. Uncertain result сохраняет reservation и journal
quarantined, повтор получает RECOVERY_REQUIRED до нового child. Legacy offline
metadata сохраняется. Environment/lease/rejudge/calibrate/config106 PASS/482
assertions (70.64s), typecheck/diff PASS. Default lock root фиксирован; temp root
unit API не доступен через CLI/env/config.

Auth guard4880a5740a проверяет lstat metadata native auth.json: regular current-UID
file0600/nlink1; bytes не читает, symlink/hardlink/public file отвергает до lease
и probe. Missing auth также не создаёт reservation. 12 environment tests/50
assertions PASS (8.43s), typecheck/diff PASS; canaries инертны, OAuth не подменяется.

Отдельный public main nonmodel proof: private PID/net/mount namespace, host root
read-only, /var/lib внутри namespace и fixed /var/lib/loginom-evals/locks связан
только с собственным private lock root. Настоящие Bun/flock/fake-codex процессы
подтвердили default path, matched inode bind, ignored env override, одинаковый
home version/exec, bound proof и released reservation/journal. Proof600
/home/kiselev/.local/state/loginom-evals/parallel/offline-default-root-ljtcc5/proof.json,
SHA11a9ad4c4f9b355d83a5a430cc644449312ea07d3b6699bd1a9d4ffe9b6151f8/read-back
PASS, namespace separation проверена, liveQualified=false. Host guard paths,
dev/legacy/другие контроллеры не изменены; native Codex auth/exception recovery
остаются открытыми.

Offline exception journalf904b0417a: actual cleanup proof rename EISDIR после
завершённого fake-codex сохраняет calibration output и retained reservation,
journal становится quarantined/command-failed; повтор RECOVERY_REQUIRED не
создаёт новый child. После подтверждённого release catch не публикует quarantine.
13 environment tests/56 assertions PASS (10.91s), typecheck/diff PASS; explicit
recovery этого incident ещё не реализован.

Global guards protection23e43bbbff: directory graph v2 включает фиксированный
globalLockRoot в protected paths. Profile root, совпадающий с guards, вложенный
в него или содержащий его, отвергается до mutations/mounts. Lexical и canonical
validation используют общую проверку. 94 slots/config/sandbox/environment tests/
308 assertions PASS (19.21s), typecheck/diff PASS. Unit CI не создаёт/меняет fixed
/var/lib root; legacy/dev/чужие guards не затронуты.


Offline recovery operator CLI: `recover --config --incident --out` читает
актуальную reservation/lineage и использует original command incident; token и
revision не передаются в argv. Fixed global lock root не меняется через env.
Actual private mount/network namespace связывает только собственный lock root
с /var/lib/loginom-evals/locks; host PID namespace сохранён для birth comparison.
Отдельный /dev обязателен в fixture: без него Bun startup panic стабилен 3/3,
с --dev /dev минимальные startup controls и recovery проходят. Host guards и
чужие процессы не изменены. CLI releases после recovery-only retry, сохраняет
calibration/calls; terminal resolver replay после нового run оставляет current
reservation bytes без изменений. 41 tests/216 assertions PASS (32.78s),
typecheck/diff PASS. Это nonmodel closed-proof offline recovery; slot/admin и
active-child recovery, полная prepare/verify/status и live auth не квалифицированы.


Frozen resource scope manifest сохраняет первые N canonical slots и все их
пути, обе container identities/epochs, cgroup view, cadence1000ms и original
budget source. Private source SHA/run/time/schema read-back; лишние поля не
копируются. Coordinator потребляет эти required scopes вместо inline сокращений:
actual host-only sampler с пустым caller containers ранее давал coverage PASS,
теперь missing frozen Server/Studio → incomplete. N=2→N=1 selection, protected
profile output, no-overwrite и изменённый source проверены. 63 resource evidence/
summary/policy/process tests/405 assertions PASS (8.68s), typecheck/diff PASS.
Container records в этом тесте — normalized input receipts; live generation
qualification, все runtime actors/thresholds/quotas и ordinary v2 dispatch binding
остаются открытыми. Manifest не выдаёт разрешение на model dispatch.


Retained process windows: actual native supervisor proof → private source read,
semantic SHA/owner/producer/continuous ready launcher/final00 qualification →
full persisted dispatch-to-exit window в resource coordinator. Inline window не
подменяет source; changed producer frame не получает numeric timeline credit.
При manifest требуется proof каждого выбранного slot ID: actual A/N=1 positive,
тот же source без B/N=2 incomplete. Container records этого control остаются
normalized metadata, не live pair qualification. Wrong owner/producer/hash,
duplicate source и unready launcher refused. Shared closed-proof validator также
прошёл offline qualification/recovery regression:80 tests/570 assertions PASS
(40.10s), typecheck/diff PASS. Полный runtime actor/attempt inventory и production
binding ещё открыты; readonly proofs не разрешают signals/delete/recovery.


Visible provider429 metadata: explicit APIError.data.statusCode из headless JSON
сохраняется в run.json.limitEvidence без raw message/body. Actual Bun child и
supervisor подтвердили сохранение event при exit0/последующем text; limit policy
остаётся failed. Нет полных retry/transport observations, coverage unavailable;
empty/textual/malformed/foreign error controls incomplete. Target3 tests/17
assertions; CLI/report/fixture parallel/policy118 tests/563 assertions PASS
(223.25s), typecheck/diff PASS. Источник формы APIError проверен в текущем
packages/core/src/v1/session.ts и JSON emitter packages/agent/src/cli/cmd/run.ts;
native model transport и hidden limit absence не квалифицированы.


Permanent research infrastructure create/read-back PASS: noncee6799bc1-0e0d-4b44-
88f5-7213279df442, Server6ae20e683182/Studioff3ce5974e67 (полные IDs в private
controller/pair.json и pair-bootstrap-20261014 receipt). Native pinned-candidate
admin login проверил username/admin role и confirmed native/browser disposal.
Missing focus раньше давал stable3/3 ADMIN_DISPOSE_UNKNOWN; safe diagnostics
показали ADMIN_DEADLINE/PASSWORD/READONLY. Pinned Studio AutoCompleteOff снимает
readonly на штатном focus, driver теперь делает password.focus перед fill.
Target1 PASS/7 (6.22s); admin integration/unit/preflight48 PASS/123 (36.33s),
typecheck/diff PASS. Full diagnosis в evals/docs/2026-10-14-admin-password-focus-diagnosis.md.
Quarantined evidence сохранены; server session close/ACL/backup/licence counts,
acceptance pair и native model/judge qualification остаются открытыми.


Native readonly session observations: actual own Session GUID/proxy ID и managed
IDs опубликованы private/fsynced, qualification=false. Await Session + поддержанный
ProxyObjectsHelper.GetObjectId заменили cached-only чтение, которое было unknown.
Native target1 PASS/13 (6.51s); admin integration/unit/preflight48 PASS/129 (36.69s),
typecheck/diff PASS. Own GUID75f1cd6a-c753-460a-ae80-439a635ff4d7, direct managed-ID
matches0, pending/active rows сохранены. Receipt research/controller/admin-w6rH8L/
session-observations.json. Public inspect не выдаёт qualified sessions; username
не используется для close. Scope mapping/reconnect/CLI correlation и backup
policy остаются следующими gates.


Own Session→ManagedSessionInfo scope control: ScopeFindObjectAsync из pinned
BG_Interfaces.js вернул null, managedObjectId:null сохранён. Own Session GUID
122e93cc-0e44-4ee7-b6cf-deeef8ba0b28, managed matches0, rows10 в private
research/controller/admin-x1eDkF/session-observations.json. Ordinary proxy ID не
используется как managed identity. Target1 PASS/14 (6.49s); admin integration/
unit/preflight48 PASS/130 (35.84s), typecheck/diff PASS. Qualification=false;
обратная scope/CLI/reconnect/close связь требует дальнейшей проверки.


Reverse managed row→Session scope control вернул null для всех12 rows, matches0
с own GUID4caebf76-7323-47e0-91c9-bb383f6cbcb5. Private receipt research/controller/
admin-QVtacx/session-observations.json сохранил row.sessionGuid:null. TDD missing
field→GREEN target1 PASS/15 (7.36s), admin integration/unit/preflight48 PASS/131
(35.95s), typecheck/diff PASS. Qualification=false, identity/close остаются открыты;
два scope-null controls не объявляют всю платформу unsupported.

Readonly snapshot текущего окружения:

```bash
cd evals
bun script/parallel-env.ts status --config /home/kiselev/.local/state/loginom-evals/research/slots.json
```

Команда печатает JSON с recorded pair/resources, отдельными user/profile
reservations каждого configured slot, server/judge state и snapshotChanged.
Status не захватывает ownership, не входит в Loginom и не выдаёт live admission;
`admission:not_verified` — обязательное ограничение снимка. Credentials не читаются.


Подготовка собственной v2 пары доступна через `bun script/parallel-env.ts prepare
--config <private-slots.json> --parallel 2 --out <new-private-directory>` из `evals/`.
Это текущая стадия blocked-user preparation: actual session capability пока даёт
`SESSION_IDENTITY_UNSUPPORTED`, receipt содержит ready:false, exit2. Native global
fences, повторное использование users/passwords, архив и normal slot/server release
квалифицированы отдельно; CLI setup/check/active cleanup и full readiness
ещё не готовы. Подготовка не является model N2→N1 acceptance.

`bun script/parallel-env.ts verify --config <private-slots.json> --out
<new-private-directory> [--parallel N]` проверяет уже подготовленное
never-activated окружение без reconcile/password/root publication. Native
prepare2→1→public prepare1→verify1:21 assertions PASS, protected markers
неизменны, normal reservations released. Verify пока также возвращает
ready:false/code2 SESSION_IDENTITY_UNSUPPORTED; неполные preparations и active
accounts требуют дальнейшей finalization/recovery, автоматического исправления нет.

Для pre-CLI incident с original journal kind unactivated-preparation доступен
`bun script/parallel-env.ts recover --config <private-slots.json> --incident
<original-prepare-command.json> --out <new-private-directory>`. Команда принимает
server/user/profile ownership через recovery-only CAS, проверяет все prior
admin/process sources и native blocked/absent state, архивирует history и
выпускает доказанно чистые reservations. Exit0/status released — завершение
cleanup, ready:false. Неопределённый исход — retained/unconfirmed/exit2.
Повтор с durable completion возвращает historical already_released без CAS/admin
и сохраняет reservations следующего владельца. Если completion/result ещё отсутствуют, но current server row уже released
для этого cohort, metadata восстанавливается под guard по terminal proofs без
CAS/admin runtime. После release всех slots оставшийся server fence завершается отдельным
recovery-only CAS с проверкой всех prior process proofs; user/profile rows
сохраняются. Этот путь проверен late write fault и реальным SIGKILL controller.
Mixed pre-CLI A released/B retained также поддержан: A проверяется без нового
slot CAS, B проходит native closure/archive/root finalization. Прежний committed
B archive переиспользуется. Missing composite A согласуется по обоим resource
proofs; missing result/completion после mixed release восстанавливаются без
admin runtime и изменения reservations. Native SIGKILL/retry18 assertions PASS,
23 source hashes verified; временная пара штатно удалена. Active CLI incidents,
остальные crash windows ещё open. Native partial user/profile release также
проверен: EISDIR на втором proof → original SIGKILL137 → recovery CAS обоих B
resources → recovery SIGKILL137 → public retry,19 assertions PASS. B released
revision3/lineage2, A bytes/archive preserved,21 source hashes/31 audit checks и
exact pair absence PASS. Offline judge
recover сохранён. Browser qualification запускать последовательно: неизвестный
одновременно запущенный browser оставляет process proof quarantined; другой
успешный запуск не исправляет его задним числом.

Для native management snapshot control из `evals/` запустить
`bun test test/parallel-lifecycle-integration.test.ts -t 'installed CLI management'`
с закреплённым EVAL_CLI_BIN; вариант `with native session snapshots` дополнительно
требует EVAL_ADMIN_LIVE_CONFIG. Этот control выполняет unconfigured status без
входа CLI в Loginom, сохраняет native admin snapshots до/после процесса и
проверяет source hashes/temporal order. Оба snapshots остаются unqualified;
setup/check/recover и actual user-session attribution требуют следующих gates.
Process-only fake/FS tests остаются в management-process-evidence.test.ts.

Control `-t 'native CLI setup and check'` требует также действующий
LOGINOM_DOCK_API_KEY из private project environment. Ключ передаётся CLI через
stdin setup; profile/diagnostics остаются private, stdout/stderr проверяются на
утечку. На собственной disposable pair actual native account создаётся и
активируется через research adapter. Sampler сохраняет snapshots во время
actual CLI process; test требует по одной новой row на setup/check сверх
baseline. Positive browser verification не означает закрытия серверной сессии:
обе pending rows наблюдались после завершения CLI. Этот control не включает
model/judge calls и не снимает production readiness gates; recover и адресное
закрытие настоящих CLI sessions ещё требуют проверки.

2026-10-15 private configuration bootstrap: acceptance `parallel/slots.json`
соответствует принятому примеру, research config имеет отдельные names/network/
port/roots/bootstrap file; оба0600 и проходят public loader.12 отсутствовавших
profile/work/history leaf directories созданы empty0700 под4 actual global
profile guards после проверки отсутствия reservations. Повторный guarded
read-back:26 paths private, inode/empty state подтверждены, config bytes unchanged,
reservation writes0. Credentials и OAuth bytes не читались/не менялись; fixed
guard files сохранены. Private postcheck78d0039f... и config3310afcc... в
native-two-users-6ebb9781. Acceptance pair journal ещё отсутствует, readiness=false;
это разовая подготовка private paths, без нового CLI flag или live admission.

Native normal management A/B qualification (32685e3e66):1 PASS/19 assertions
168.88s без concurrent unit. A seals producers, commits archive, accounts for
все свои sessions и closes while B continues; B сохраняет исходную session и
проходит fresh check. Global finalizer переиспользует exact A archive manifest,
четыре CLI и admin continuous closures qualified. Private
`native-two-users-4a143678-dfcf-4a51-ae93-33db172b9b72/source-audit.json`
SHAdd7acfd3197a7164153e1acdf2ff884ddc41726794123191d861c1e20fb7684a:
649 checks/192 sources, exact disposable pair/network/root absent. Старый eR7Snq
UID incident остаётся retained и не объяснён этим PASS. Count0 management gate
не заменяет full attempt cleanup/recovery/SessionBackup/licence/resource/OAuth
и LLM N2→N1/node приёмку; delete/release/admission остаются запрещены.

Normal production `finalizeManagementSlot` теперь обеспечивает этот порядок
внутри API, сохраняя shared admin/B: native RED missing API→GREEN1/20 PASS164s,
related29/126 PASS37.89s, typecheck PASS. Private
`native-two-users-33d08445-a845-45b8-b7cb-3d374ae45861` terminal SHA5b145a49...
и audit681f789752552be70ba11d822edfab3353070d1f2551ba9449330ec4e734ee20
подтверждают628 checks/181 sources, code bytes before/after unchanged
(pins a2a98eeb...), B survival/fresh check, global archive reuse и exact own
pair/network/root absence. Receipt закрывает normal management Count0 sessions;
полный attempt cleanup/recovery, backup/delete/release/readiness не заявлены.

Summary теперь сохраняет per-attempt `limit_evidence` и отдельный
`parallel_limits` gate, включая initial infra retry и interrupted runs. Visible
HTTP429 не стирается successful retry/`--judge-only`; отсутствующая/неполная
transport coverage даёт incomplete. Report показывает gate рядом с quality
metrics, без смены исходных statuses/cost/exit code. TDD fake-child/report
RED→GREEN; report/compare/policy108/436, run/rejudge43/334, current retry2/22 и
extended rejudge1/16 PASS, typecheck PASS. Private limit-aggregate-198c93eb...
verification SHAebcee9a1b425adc590b523fee6acaa4eda09e252df1286448c979aab70890e1f.
Full hidden transport/Dock/judge coverage и v2 admission этим не подтверждены.

Native SessionBackup hard-crash/startup research теперь выполнено отдельно:
real pending Count1/modified package/autosave5062 bytes, period5000 и
keepAlive1800000, old admin closure → exact own daemon SIGKILL137 без OOM →
same CIDs/new epoch и fresh admin init/inspect/dispose. Pre-crash backup list
пуст; post-kill/post-restart physical copies пусты, post-restart cfg absent. Paired graceful+crash
2 PASS/146 assertions147.83s после RED oracle0≠137; typecheck PASS. Private
native-user-831bf8d0... audit7678658c18976971879db5dc3c56d1f906a0b2dc1ed0f2b736a6985adcf03f4e
(24 checks/32 sources), verificationfa28c0dd...96 original source hashes/all3
own pairs+networks+roots absent. Нужен supported create trigger либо доказанный
enforced-disabled contract; этот отрицательный recipe gate не снимает.

Native agent research выполняется отдельно от LLM acceptance:

```bash
# Из evals/. EVAL_CLI_BIN указывает на квалифицированный installed candidate;
# EVAL_ADMIN_LIVE_CONFIG — на private research slots, Dock key загружен из env.
TMPDIR=/home/kiselev/storage/tmp bun run test test/native-agent-run-integration.test.ts
```

Этот тест создаёт свою research-пару и реального пользователя. Actual runAgent
использует bubblewrap, собственный профиль и local OpenAI-compatible SSE replay:
skill(loginom-automation) → dock_prepare(new_draft) → final text. Model и small_model
закреплены на local native-replay/replay, остальные providers выключены; в trace
попадают только model/tool names и признаки этапов. Платные модельные запросы не
выполняются. Fixture отвечает404 на debugger discovery GET /json/version.

2026-10-15: native1 PASS/14 assertions105.74s, related provider/agent inventory
5 PASS/46 assertions, typecheck PASS. Independent private audit
native-agent-replay-6b26e673-ec6d-4200-ae43-5b9edea3eaee/source-audit.json
SHA256 `665a2bea4d19f71f7dffe029ab766a0a4ca3e0a184d0fb2101f4ac2df3167176`
подтвердил87 checks/45 sources и11 tested source/binary pins.15 snapshots
пересекают actual closed CLI lifetime; наблюдена одна новая active Count1 row,
после local closure она pending Count1. CLI/Chromium и admin завершены с
continuous proofs, собственные pair/network/root отсутствуют. Browser profile и
credentials в копию controller evidence не включаются.

Активации skill недостаточно: отдельный skill-only control завершился exit0 с
runtimeDirectories=[] и без новой сессии. Первый native fixture остановил Bun на
необработанном GET; второй отказал до spawn из-за отсутствующего outDir. Их
ресурсы/источники retained и перечислены в eval_parallel_blockers.md. Native PASS
их не исправляет. Первый этап сохранил native observations; readonly ledger
добавлен следующим этапом ниже. Targeted close, backup/storage cleanup,
production admission и N2/LLM acceptance остаются открытыми.

Следующий этап того же native-теста проверяет readonly agent ledger:
`readAgentProcess` выдаёт стабильную ссылку на отдельный завершённый CLI entry,
даже когда inventory ещё открыт. `recordAgentSessions` выводит новые own rows из
квалифицированных native snapshots и записывает actor=agent с admission command ID
и физическим CLI invocation UUID. Read-back повторяет проверку источников до и
после общего sealing. Bad entry SHA и invalid window отклоняются.

Native1/20 PASS107.77s; related8/59 PASS16.07s, typecheck PASS. Private
native-agent-replay-cbed6057… audit5b8e2e68… подтверждает94 checks/50 sources,
16 overlapping snapshots/12 code+binary pins и exact own pair/network/root absence.
Полное same-user accounting, archive-before-close, native adoption/targeted close
agent ledger и recovery ещё требуют реализации; production admission закрыт.


Native agent close now follows durable profile archival (2026-10-16).
The same local-replay test refuses missing and pre-CLI committed archive sources,
then archives the completed invocation, closes only its retained Count1 row,
checks setup-session survival and idempotent terminal read-back after sealing.
Archive trees retain their original inodes/content; the SQLite bytes still contain
the SDK session ID. History now has its own private same-filesystem directory
outside the temporary controller root and remains after successful teardown.
Do not remove this history when cleaning temporary fixture roots.

TDD driver RED19 assertions154.46s → GREEN1/29 PASS134.46s; related48/233
PASS50.73s, typecheck/syntax/diff PASS. Private native-agent-replay-d75f5d7a…
audit0c35e3dc…1648 checks/66 sources,15 causal snapshots/13 source+binary pins.
Exact own pair/network/controller root absence verified; history retained.
This qualifies archive/targeted session close only. Complete same-user accounting,
operations/backup/storage cleanup, release/recovery and live admission remain open.

The existing native two-user management regression also passes1/20 assertions
164.60s: A closes under its slot finalizer while B remains active and then passes
a fresh check; both finalizers retain delete/admission=false. Agent source
verificationd0512a31… rechecks79 source/pin hashes and exact own resource absence.

A/B private native-two-users-79a7ca24… audit5d6da801… verifies634 checks/183
sources, continuous closures/archive order and exact own resource absence.


Combined session accounting (2026-10-16): the native agent fixture now records
its real setup/status calls in a management inventory and registers the agent
inventory in the command journal. `collectSlotSessions` accepts the setup and
browser-agent causal ledgers together, requires a sealed inventory and an
observation window for every invocation, and reads the closed agent alongside
the still-present setup after targeted close. Management-only accounting still
refuses the agent row; unknown same-user rows remain errors.

Native1/36 PASS150.78s; private native-agent-replay-ca96f759… audit0546e73b…
checks1658 facts/113 sources,20 overlapping snapshots/15 source+binary pins.
Exact own pair/network/controller root absence and retained history verified.
Empty/non-browser invocation qualification and normal finalizer/recovery wiring
remain open; no release/admission or live acceptance follows from the collector.

Related48 PASS/245 assertions55.60s, typecheck/diff PASS.


Native empty-agent qualification (2026-10-16): the replay fixture now runs both a
browser/tool invocation and a text-only invocation through the installed CLI.
An explicit empty browser proof with no new same-user row produces no agent
ledger; its physical invocation and native observation window remain accounted.
Empty metadata cannot claim a genuine new browser row: the negative-copy RED
initially published a false ledger, then the guard refused it before publication.

Final native2/55 PASS242.82s, related49/248 PASS58.87s, typecheck/diff PASS.
Private d84be043… auditca5c3ea5…1648/108/16 causal frames and71e4d75c…
audit06a69132…80/58/6; both15 pins, own pairs/networks/controller roots absent,
original histories retained. Browser Count1 close/setup survival still pass.

The text trial D045… preserved a4096-byte main DB plus848752-byte WAL and32768-byte
SHM. A copied SQLite family exposes the committed SDK session and quick_check=ok;
original bytes are unchanged. Bun SQLite1.3.14 also read this actual three-file
archive successfully (D045…/bun-sqlite-wal-audit.json SHAca9c44ae…). The native test now queries a private DB/WAL/SHM
copy, then removes that copy. Main-file-only byte search was an invalid oracle
for this state. Original artifacts and the failed oracle result are retained.
Two duplicate unexecuted audit drafts were removed after copying verified recipes.

Whole-run sealing remains required by the current collector. Per-attempt producer
boundaries, normal slot/attempt finalizer and recovery remain the next work;
production admission, backup/licence/resources/OAuth/real judge/live gates are open.


Paused-prefix qualification (2026-10-16): the native fixture uses a durable pause
and immutable snapshot for combined accounting/targeted close, then performs
final resource sealing. `pauseAgentProcessInventory` blocks another CLI, preserves
its snapshot through sealing and retains the pause if publication fails; retry
reconciles the same source. A corrupt source blocks read/seal. Full resource
accounting still refuses an unsealed inventory.

Native resource-only reader RED9 assertions98.59s → browser+text2/56
PASS243.49s. Related50/263 PASS51.57s, typecheck/syntax/diff PASS; primitive5/52
PASS7.81s. Private149f6bd8… audit3abbca9b…1650/108/16 causal frames andae3518db…
audit9a8f9abb…91/62/6 preserve original paused sources after final sealing and
both15 pins. Own pairs/networks/controller roots are gone, private histories remain.

This does not resume a slot. The next implementation must compose normal
slot/attempt finalization, backend/storage/backup proofs and a validated unpause;
sessions_closed alone grants no next admission or release. Active recovery and
production/live gates remain open.


Normal slot/attempt finalization (2026-10-16): `finalizeSlotAttempt` now composes
pause, full invocation/session accounting, committed archives, a durable close
intent, agent then management target closes, fresh absence and a stable private
receipt. Completed repeat dispatches no additional close RPC. Missing invocation
observations and recovery-only leases refuse before archive/close. Empty browser
results still require an archive of their actual physical invocation.

Native browser/text2/38 PASS269.12s; related50/263 PASS54.48s, typecheck/diff PASS.
Private477594c6… audit696f7948…1789/103/15 causal frames and1c75c612…
audit215fe870…186/73/5 retain all16 pins and original histories/SDK rows. Own
pairs/networks/controller roots are absent. The fixture now preserves root/pair
when any original profile history remains unarchived.

This is a normal sessions_closed fence. Storage deletion, backend operations/
package locks, SessionBackup, release, validated unpause and active uncertain-close
recovery require separate proofs. Main admission remains unavailable.


Read-only closure reconciliation (2026-10-16): explicit `confirm-absent` mode in
agent/management close sends `confirm-session-absent`, which refuses a live target
and confirms only native absence, without CloseSession. It retains all ownership,
epoch, process and archive guards. Unknown journal mutations still block later
mutations; read-only confirmation does not grant cleanup or clear quarantine.

Channel RED→1/8 GREEN; native old-driver RED18 assertions117.00s→browser/text2/50
PASS297.29s. Actual native closures precede an explicit filesystem receipt-loss
control. One lost sidecar is rebuilt by read-only confirmation, then the normal
finalizer republishes/reuses its terminal without another close. Original receipts
and history are retained. This does not claim SIGKILL or a lost native wire reply;
automatic pending-finalizer/recovery integration remains open.

Related50/266 PASS60.53s, typecheck/syntax/diff PASS. Private6e3edf07…
audit45845c1a…1782/116/17 causal frames and19bc4ebe… auditd9c562fc…229/92/5;
all16 pins and exact own pair/network/controller-root absence verified. The expanded
finalizer fixture gets240s; normal native tests and production deadlines stay fixed.


Automatic normal pending finalization (2026-10-16): an existing close intent
selects `confirm-absent` exclusively. Missing sidecar/final receipts are rebuilt
from native absence without manual confirmation or another CloseSession. A
published terminal with a missing proof still refuses; live/unknown rows grant
no completion. This is held-controller filesystem receipt-loss reconstruction,
with no SIGKILL/lost wire-response/recovery-lineage claim.

RED pending19 assertions119.12s→native browser/text2/50 PASS294.22s;
related50/266 PASS54.90s, typecheck/diff PASS. Privateeda67412… audit2a2c433b…
1772/112/14 causal frames and7bcba6eb… auditb5d45025…227/93/6 preserve all16
pins and original history/SDK rows; own pairs/networks/controller roots absent.
Joint249 read-backs SHA2fd4cc4a…. Backend operations/locks, storage/backup cleanup,
release, validated unpause, active recovery and production admission remain open.


Native package tree (2026-10-16): readonly driver `inspect({packages:true})` now
returns all Dispatcher collections and their package paths, readOnly,
referenceCount and nullable Progress. Default inspect is unchanged. Actual
sessionType0/1/2/3 client/self/shared/pool groups were observed; self identifies
the observer session, independently of user roles. Shared/Pool were
empty in this trial. The native referenceCount=-1 sentinel is preserved.

Missing tree RED47 assertions50.05s→invalid nonnegative oracle RED52/51.35s→
native1/63 PASS51.41s; admin/preflight48/140 PASS16.60s, typecheck/syntax/diff PASS.
Privatee8c84277… auditefc2a9e1…42/13 sources+5 pins preserves original named
LGP/autosave and command/reply/continuous closure sources. Before target close,
`/eval-a/backup-probe.lgp` is writable and idle; afterward it is absent across
all collections. Exact own pair/network/root absence verified for all3 trials.
Primary installed sources: native-package-schema-7ba115e0… SHA c32bff0e….

Parent durable reader is qualified below. Cleanup consumption, positive
running/shared/pool controls and actual operation/lock quiescence remain open. No cleanup,
backup, release, unpause or admission grant is issued by this descriptor mode.


Parent package inventory (2026-10-16): `AdminConnection.inspectPackageInventory()`
persists the complete native reply and canonical command reference/hash.
`readAdminPackageInventory` replays that private receipt, checks server epoch,
full reply/request hashes and command times, nested types/counts/duplicates,
and rereads both sources. Negative referenceCount and nullable progress remain
unchanged. Unit data with positive Progress qualifies only the codec.

The native fixture opens its parent admin before creating the designer session,
then verifies durable replay with the named/modified package present and absent
after targeted CloseSession. Both admin transports/continuous process closures
are checked before fixture removal. Native1/67 PASS67.56s; related49/160
PASS21.68s, typecheck/syntax/diff PASS. Private9bcdf36b… source-audit SHA256
`0e6fc145fa8c5fadafe0e8eac129a42aa14310894e16764bfbeb5268947af7b0`
checks67 facts/23 sources+6 pins; original package/autosave retained, exact own
pair/network/controller root absent.

Opening the parent after designer disconnect yielded PendingDisconnect=false
with the expected Count1; close refused SESSION_NOT_IDLE. The ordering control
above passes; the underlying cause remains unresolved in eval_parallel_blockers.md.
No idle guard was relaxed. All five failed/diagnostic fixtures have verified
admin closures and exact own pair/root absence, with original evidence retained.

Installed bg.model.js defines client0/self1/shared2/pool3/backup4; sessionType
is not an admin-role marker. Read-only primary copy native-session-types-f9e4d339…/
source.json SHA256 `0cc2dadf184aba07af8cb30a2fd7b83074a8aca9f651d96f4869d737cfcd5768`
preserves exact source before/after hashes. No research sessions were opened.
The receipt grants no operation/lock quiescence, cleanup or admission authority.


Populated Shared control (2026-10-16): the research fixture creates a real
library, closes its direct handle and adds a link from its own named/modified
package. Parent and raw admin inventories both see Shared Count1, the library's
exact `/eval-a/shared-probe.lgp` path, referenceCount1, readOnly=false and idle
Progress=null. ReadOnly is preserved as data and does not establish effective
access permissions. After targeted CloseSession, Shared Count0 and library
absence are freshly observed by both admins. Original library/root LGP/autosave
are retained before fixture removal.

Unsupported-phase RED40/52.93s→invalid ReadOnly oracle RED48/66.66s→final
ordinary/shared2/138 PASS134.44s. Related49/160 PASS24.03s, typecheck/syntax/diff
PASS. Private6b4a9575… source-audit SHA256
`e5025baf32f86b4548b72ceed1388c014853213730cee7fa23d8bda4d8c73378`
checks74/24 sources+6 pins; ordinary40574ffb… audit7634c941…67/23.
Both admin closures/transport ACKs and exact own pair/network/root absence pass.
Three new RED/diagnostic fixtures are safely settled with executed source/native
data retained. Positive Pool/running controls and backend quiescence remain open.


Native Progress control (2026-10-16): `session-progress-probe` loads the
self-contained one-node LGP/readable JavaScript fixture and checks its actual
native engine.Code. The node runs with a time/iteration bound. Parent inventories
observe running Progress (actual50), then the same open package with null
Progress after successful task completion, then package absence after targeted
CloseSession. Native StartTime is retained without host-clock correction.

TDD missing phase RED41/53.52s; routing/XML fixture repairs; initial running
1/52 PASS67.70s; retained-idle RED45/59.70s→final1/53 PASS61.95s. Related49/160
PASS21.58s, typecheck/syntax/diff PASS. Privatef7fa45bd… source-audit SHA256
`c33e5b9980b72ea47a6939f6f04efe36d71e319478757f1b45eed8bae32a8e97`
checks69/23 sources+8 pins, both admin closures/transport ACKs, exact own
pair/network/root absence and retained original input. Six failed/diagnostic
fixtures are also safely settled with original inputs/executed sources retained.
Temporary open-error logging was removed. Positive Pool, backend quiescence,
interruption, storage/backup cleanup and production admission remain separate.


Populated Pool control (2026-10-16): a dedicated ephemeral `eval-pool-probe`
account in its own research pair gets modes design/run3 with no admin/global
file storage. Normal eval account rights remain unchanged. Its own Scheduler
job runs once manually, with automatic start one day ahead, no startup/missed
execution and timeout10s. Native completed3 log and exact job GUID deletion
with fresh jobsAfter=[] are checked. After creator-session CloseSession, the
same package remains in Pool type3 with actual false/-1/null descriptor values.
No global pool clear is called; user-session absence grants no package quiescence.

TDD unsupported phase RED41/54.32s, native permission/Ref/disabled-job feedback,
fresh deletion RED42/62.05s→GREEN. Final ordinary/Progress/Pool3/174
PASS202.77s; related49/160 PASS22.14s, typecheck/syntax/diff PASS.
Private71f121cd… audit SHA256
`c8983e29af999ddabf6e02b77c87fd7127b5d5ebcedc65e78ff54d6b0c0cb700`
checks69/23 sources+8 pins; normalb04f5f9f…70844392…67/23 and Progress48d3d0d9…
5f1f3d77…69/23 also pass. All own pairs/roots and seven RED/diagnostic fixtures
have qualified boundaries and retained sources/input. Actual operation/lock
quiescence, scoped pool closure, cleanup and production admission remain open.

Selected Pool close research now has a negative native control:
`native pool package close: refuses the pooled object and preserves another user`.
The exact owned completed-job Pool item refuses one manager.ClosePackage RPC
and remains after read-back and creator close. B's complete package row remains
unchanged within one observer and is then closed by its own bound operation.
SessionInfo proxy IDs differ across admin observers; compare preservation within
one observer. Native1/70 PASS68.76s; related49/160 PASS21.98s, typecheck/syntax/diff PASS.
Private63e4e2dc… audit17f23462…93/43+8 pins
with both admin closures/ACKs and own pair/network/root absence. This refusal
blocks scoped Pool cleanup; see eval_parallel_blockers.md. No global pool clear
was used. PackagePoolSize=0 remains an unqualified candidate for pre-work policy.

The follow-up `native pool disabled policy: zero retains no completed job package`
qualifies a preventive recipe: on a fresh empty owned pair PackagePoolSize10→0,
immediate/post-job getters0, actual completed/deleted own job, no package in any
collection before/after creator close. Native1/54 PASS63.23s; private2df05c6e…
auditca4df303…70/23+8pins verifies both admin closures/ACKs, retained input and
exact own pair/network/root absence. Production preparation and frozen-policy
drift checks still need wiring; no cleanup/admission grant follows from this test.

Same-source default-retention control62335c26…:1/54 PASS66.51s,
audit7e614cb9…74/25 verifies the same package retained after creator close.
Both cases freeze the identical8 code/binary/input pins. Related49/160
PASS21.15s; typecheck/syntax/diff PASS.

Public Pool API control: `native pool preparation: held controller disables
retention and repeats without mutation` exercises a real held server fence,
initial readonly drift refusal, phase rejection before dispatch, actual10→0,
unchanged repeat and readonly0. Native1/48 PASS62.31s; related50/162
PASS22.76s, typecheck/syntax/diff PASS. Private691caaea… audit5b14827c…51/23+6pins
verifies full policy replies/journals, both admin closures/ACKs and exact own
pair/network/root absence. Source reader rejects omitted self-observer even when
hashes match. Fixture controller leases use their own lock root; failed original
collisions were CAS-recovered/released from full closure sources and their owned
pairs destroyed. The public prepare/verify follow-up is qualified below.

`native pool environment: prepare applies policy and verify only reads it` now
executes both public environment APIs on a fresh own pair. Preparation writes0
before every user mutation; verify sends only init/inspect/dispose and reads0.
Both receipts include poolPolicy while ready=false/SESSION_IDENTITY_UNSUPPORTED
remains intact. Native1/16 PASS99.68s; related CLI/recovery/admin62/232
PASS46.09s, typecheck/syntax/diff PASS. Private51f765be… audit9c6e5d40…83/45+9pins
verifies all admin closures/ACKs, both pre-CLI finalizers released and exact own
pair/network/root absence. The helper bridge closes early; deadlines are unchanged.
Evaluated-attempt cleanup, frozen runtime admission and the remaining gates are open.

Detached active-backend controls: run `native active backend control` and
`native active backend close` separately with the existing private native config.
The same20s Code is installed in the existing package. After client-context loss
Progress is still active; the natural case waits for idle, while the stop case
uses the existing bound CloseSession and fresh absence. Final close1/53
PASS61.68s, control1/54 PASS79.82s, identical9 pins/images; controller start→fresh
absence3051ms versus21456ms. Related50/162 PASS22.75s, typecheck/syntax/diff PASS.
Private05c609b2… audit48d6b749…64/25 and0ff79e61…192a52d3…184/73 verify both
admin closures/ACKs, exact own pair/network/root absence and retained sources/input.
This preserves existing close guards/deadlines and grants no general operation,
lock or storage cleanup authority. CLI crash and B-active lifecycle remain open.

`native active peer: stopping A preserves B execution and file` observes A/B
Progress concurrently, closes detached A20s, retains the same active B package,
then gets B's successful10s completion after A close and unchanged canary hash.
B closes separately afterward. Native1/75 PASS83.41s; related50/162
PASS21.52s, typecheck/syntax/diff PASS. Privateb36aa5a7… auditf175c946…69/33+11pins
verifies three continuous admin closures/ACKs and exact own pair/network/root
absence. The missing-phase RED011628b4… is retained and safely settled;
qualifier-object assertion is fixed and unknown peer teardown preserves fixtures.
This does not qualify a CLI crash, backend locks or evaluated-attempt cleanup.


Actual CLI active interruption (2026-10-16): the opt-in
`test/native-agent-run-integration.test.ts` case selected by
`--test-name-pattern 'is interrupted during server execution'` uses the explicit
candidate binary and local replay provider. Its prelinked JS20→Calculator package
is delivered to the activated own research user; file UID/GID match observed
storage ownership. Existing-node execution activates the bounded source. Native
Progress triggers supervisor abort; backend remains active after CLI closure.
The finalizer commits all pending recovery history, closes exact agent/setup
sessions and confirms absence with both cleanup/admission grants false.
Native1/14 PASS180.97s; private d9c44aac… auditd10a7521…2191 checks/168 sources,
26 causal frames and18 source/binary pins; SQLite was checked only on a private
copy. Archive bytes/inodes, admin transport/closure and own pair/network/root
absence were verified. Controlled interruption is distinct from hard SIGKILL.
Three earlier archive-barrier probes remain preserved incidents in blockers.


Hard CLI crash follow-up (2026-10-16): the native replay case selected by
`--test-name-pattern 'is killed during server execution'` now sends SIGKILL only
to the unique admitted candidate executable in the exact slot scope, using
signalProcess with a fresh full-identity check. Private intent records identity,
owner/launcher and immutable native Progress trigger. Actual exit137 has neither
timeout nor controlled-interruption flags. Continuous local closure is followed
by fresh backend activity, committed pending-history archive, exact agent/setup
closes and fresh absence; both cleanup/admission grants remain false.
Native1/16 PASS184.30s; private5e699014… auditf8cbd6b2…2239 checks/183 sources,
29 causal frames and18 source/binary pins, SQLite-copy integrity, original archive
objects, admin transport/closure and exact own disposable pair/root absence.
The wrong-abort RED966365c1… failed safely; auditfdcf3641…2223/179 and all own
resources/root absent. Related22/160 PASS30.09s, signal identity/refusal3/6
PASS0.217s. This resolves the controlled hard-CLI-crash component; FD/locks,
no-regrowth, backup, full N2/live runtime and normal admission remain open.


Resolved research archive incidents (2026-10-16): own f5473183…/ZjdFIE,
2f0726d8…/5FqIMa and dc751ee6…/fHXu1g have been decommissioned. Read-only
preflight verified original actor inventories, continuous CLI/management/admin
closures, admin transport ACK and unchanged exact pair epochs. Public CAS acquired
recovery-only server and composite profile/user claims; durable archive preserved
pending history before public factory teardown. Fresh checks prove all9 original
container/network IDs and3 scratch roots absent. Original failed tests, old/new
lineage, factory commands/releases and SDK histories remain in private evidence.
Independent read-back: f547 auditfe65226a…1685/34,2f audit3de7c127…1864/36,
dc audita1f808b2…1875/34 (5424 checks/104 sources total), including original
archive inode/bytes, SQLite private-copy integrity, exact CAS lineage, persistent
global factory release proofs and current absence. Support scripts and9 public
controller source pins are bound to589f32a7ca. This disposal covers dedicated
research namespaces; normalRelease, storageDeletionAllowed and nextAdmissionAllowed
remain false. Production recovery, FD/locks/no-regrowth and live admission keep
their existing gates. Older unrelated incidents were preserved. Four duplicate
temporary logs were removed only after matching retained SHA256 copies.


Native package FD/flock follow-up (2026-10-16): a bounded read-only kernel
observer on the ordinary unprivileged research pair enumerates container
processes, brackets their births, and records scoped FD targets/stat/fdinfo,
raw maps and `/proc/locks`. The collector excludes its own PID. The native
package retains a PID1 sidecar `.progress-probe.lgp.lck`; fdinfo and both kernel
lock snapshots positively identify FLOCK ADVISORY WRITE on its exact inode.
After active bound CloseSession and fresh package absence, both post-close kernel
lock snapshots lack that tuple and no own-root descriptors remain; daemon birth
is unchanged. A directory FD appeared only in the earlier diagnostic sample.
Native1/65 PASS71.90s; private7b3fb852… audit77f25169…82 checks/28 sources+11
source/binary/input pins, both admin closures/transport ACKs and exact own
pair/network/root absence. Source start→native absence3640ms is a controller
observation interval. Related50/162 PASS25.04s, typecheck/shell syntax/diff PASS.
First diagnostic7d37a6a8… preserved its callback-shadowing failure and complete
metadata; audit18791214…82/28 checked teardown and recovered the minimal close
reply only through an exact immutable journal replyHash match. Its resources/root
are absent too. This establishes a positive package FD/FLOCK control. Durable
fenced observation consumption, B-active filesystem controls, no-regrowth and
general workload coverage remain open; operationsQualified and cleanupAllowed
stay false. Final collector repeat7841a66a…1/65 PASS84.80s, auditf6eff982…
82/28+11 pins confirms the same native control with the newline fix (controller
source start→absence5567ms). A separate real child control3193c23f… RED→
4210e0e9… GREEN1/9 PASS30.52s qualifies exact trailing-LF FD targets and a
positive executable mmap; sentinel-preserving readlink fixes shell trimming.
Its independent audit9c9c3af9…61/16 preserves both verdicts/source snapshots
and proves all own resources/roots absent. This is collector visibility, not
a qualification of workload-wide quiescence. One never-started configuration
fixture was removed after retaining its manifest and confirming empty journals.


The fenced raw-kernel control is opt-in in `parallel-lifecycle-integration`:
`EVAL_PAIR_INTEGRATION=1 bun run test test/parallel-lifecycle-integration.test.ts
--test-name-pattern 'server file evidence'` (run from `evals`, TMPDIR under
storage/tmp). It creates its own pair without Loginom/model sessions; protected
account authority in this fixture is explicitly data-only. With the research
`EVAL_ADMIN_LIVE_CONFIG`, source pins and raw snapshots are retained privately.
Missing module, unknown record and repeated-boundary RED controls preceded
GREENc8719560…1/12 PASS46.25s. The test verifies replay, changed source hash,
foreign slot and closed guard refusal; modified records are restored. Independent
audit6a282b8a…78 checks/22 sources covers both boundary RED/GREEN, 8 source pins
each, exact six resource IDs and two roots absent. This does not qualify file
cleanup, native operation quiescence, recovery lineage or production admission.

Moved-collector regressions: LF/mmap ce062306…1/9 PASS42.19s,
audita89ad84f…61/16; active native FD/FLOCK f7f4c786…1/65 PASS77.16s,
audit76cc72e1…82/28+11 pins. Related lease/slots/user/package69/334 PASS70.27s,
typecheck/shell syntax/diff PASS. Private verificationd9837842… retains all
three controls; finalizer/cleanup/admission gates stay closed.


Post-close finalizer kernel source (2026-10-16): actual hard-kill CLI control
REDcd27cb3e…1/6 FAIL237.33s lacked terminal.serverFiles after successful session
closure. Its original failed verdict, paused prefix and history are retained;
audit73bc5816…2262/200/28 causal frames+20 source/binary pins confirms teardown.
GREENb5e3bb27…1/20 PASS237.31s binds the raw point after source-qualified native
absence, observes no own-root FD/mapping and preserves source on repeat;
audit57566cdf…2304/219/30+20 pins. Text5a6780c2…1/27 PASS161.10s rejects an
altered source hash and synthetic backdated point, restores original receipts,
then reconstructs a lost terminal with its own fresh post-absence point.
Audit593d3fe8…289/121/6+20 pins confirms exactly two captures and no duplicate
close RPC; original SDK histories/SQLite families and all own teardown preserved.
Related agent/management process/session15/166 PASS56.49s, typecheck/diff PASS;
private verificationd6b6fea2…. Cleanup/admission flags remain false.

A preceding text setup1e06a8e1… failed health before CLI. The read-only collector
found later HTTP200/wsproxy=true3/3; Apache ready was40.206s after Studio start
and6.761s after the failed log ended. Original HTTP error/startup-delay cause
remain unproven. The30s guard was retained; public factory resumed this same
configured research pair without restart and disposed it (4 released factory
claims,3 IDs and bpTCqq root absent). Original FAIL/report and unlocated history
were preserved. This setup refusal is separate from the passing finalizer checks.


Active A/B kernel control (2026-10-16): native607f0ea7…1/103 PASS94.56s;
independent auditbec18a5b…123 checks/38 sources+13 pins. Both active native
packages hold PID1 sidecar FLOCK on distinct inodes. Exact close A releases
its FD/lock while B retains the same sidecar inode, native session/package ID
and active Progress. B completes successfully9458ms after A close; its canary
SHA stays unchanged. Separate close B releases both own-root FDs and original
lock tuples, with the same daemon birth/epoch throughout. Both drivers and the
observer have native transport ACKs/continuous process closure; exact own pair,
network and root are absent. Twelve repo source snapshots and the pinned
candidate are retained. This test-only qualification passed existing runtime;
no artificial RED or runtime fix is claimed. Typecheck/diff PASS. Two duplicate
temporary files were removed after retained SHA read-back. Autosave no-regrowth,
general operation coverage, SessionBackup and cleanup/release/unpause remain
open; operationsQualified, storageDeletionAllowed and nextAdmissionAllowed
remain false.


Own-root FD finalizer refusal (2026-10-16): actual sandboxed text CLI/public
finalizeSlotAttempt RED700f7136…1 FAIL/16 assertions131.45s returned
sessions_closed while its post-absence kernel source still contained a real
non-daemon FD7 into A root. Original failed verdict/paused prefix and source
are retained; auditff62269e…232 checks/97 sources/6 causal+20 pins. A three-line
runtime gate now rejects ATTEMPT_SERVER_FILES_ACTIVE before terminal write.
GREEN5a3c024d…1/35 PASS174.82s confirms refusal, holder release via stdin/exit0,
then successful finalization with a fresh point. Changed hash/backdated point
refusals, stable replay and pending reconstruction still pass. Independent
auditad2bd5a1…298/130/7+20 pins verifies all3 point sources (the rejected source
is retained), no duplicate close RPC, original SDK/SQLite archives, continuous
actor/native transport closures and exact own pair/network/root absence.
Related process/session15/166 PASS60.14s, typecheck/diff PASS. Five duplicate
temporary files removed after retained SHA read-back. This refuses an observed
own-root FD; it does not qualify all mappings, operations, SessionBackup or
autosave no-regrowth. Storage deletion/release/unpause and production admission
remain closed, with both grants false.


Autosave/no-regrowth qualification completed (2026-10-16): native28ca68f5…
1/101 PASS180.55s, audit77f73737…123 checks/42 sources+12 pins. B runs a bounded
40s native node before A starts. A reads back PackageAutoSavePeriod5000ms,
creates real named/modified LGP+autosave, then its separate browser main
process crashes through CDP Browser.crash (372ms event). Bound CloseSession A
is followed by all-collection absence and own-root FD release before deleting
only the2 controlled regular nlink1 files via argv. Three raw empty NUL
listings/native package/kernel points span10817ms (2 actual periods). B keeps
its exact session/package/sidecar inode+FLOCK and canary SHA, then finishes
successfully after the window. Root canonical path/metadata/epoch stay stable;
both browser roots and all3 driver/observer/peer actors have qualified closures.
Own pair/network/root absent. Legacy A/B fa3c4190…1/103 PASS157.21s,
audite2b47872…123/38+13 pins; related admin/preflight/package50/162 PASS24.26s,
typecheck/syntax/diff PASS. Private verification retains all original RED and
diagnostic verdicts/source snapshots. Short private TMPDIR avoids the
component-proven63byte/108byte socket limit; strict attempts/id/browser-profile
layout remains required. Pinned Browser lacks waitForEvent; once(disconnected)
works while Browser.crash RPC remains pending, so only the event is awaited
under deadline. Scenario budgets240/120/90/70 include the40s B node and both
autosave phases; existing controls retain their deadlines. All3 own diagnostic
pairs/roots retired after qualified closure or fresh original-birth absence;
failed process proofs stayed failed. PAIR_REMOVE_UNKNOWN was reconciled by
public factory from the same durable lineage after exact Studio absence,
without restart. Nine duplicate temp files and one unnecessary copied browser
cache removed. This completes the controlled research test. Arbitrary user
traversal, SessionBackup, all-workload operation/mmap coverage, production
cleanup/release/unpause and admission remain open; both grants remain false.
<!-- original-end docs/testing/loginom-ai-agent/parallel-evals.md -->

<!-- original-begin eval_parallel_blockers.md sha256=770ff894ae9241288ab5698e5ea8079dae3c9875ab2b767d0f592af8d0de2818 -->
# Блокеры parallel evals

## Native ledger fixture: EACCES global proc scan, точный источник не атрибутирован

2026-10-15, отдельный unit related run: clean-stop fixture отказал на profile
owner PID457454, поздний agent inventory primitive — на EACCES
`/proc/457454/exe` во входном baseline до spawn. PID уже исчез при readback;
UID/starttime/принадлежность не сохранены, сигналы не подавались. Самостоятельный
cold primitive1/10 PASS2.40s; clean-stop позднее PASS24.75s. Это не объясняет
native incidents ниже и не подтверждает полного regression PASS. Private log
`management-registry-20261015/agent-process-inventory-isolated.log` содержит
62 PASS/5 FAIL/1error411.75s, включая два отдельных30s timeout и unattributed
JUDGE_VERSION_UNCONFIRMED. Primitive root
`/home/kiselev/storage/tmp/evals-agent-inventory-aeGGa8` retained с planned entry;
по одному отсутствующему PID release/cleanup authority не синтезируется.

2026-10-15: `/tmp/evals-cli-sessions-00q2hZ`, parent admin-J0anbT завершил
disconnect/dispose ACK, но process proof quarantined: EACCES на
`/proc/2551505/exe`, PID отсутствует среди own/origin/admission entries;
unknown=[] и final00 не отменяют error. Ledger native assertions31 прошли,
teardown отказал ADMIN_DISPOSE_UNKNOWN, pair/root сохранены. Одновременно шёл
profile unit negative с prctl(PR_SET_DUMPABLE,0); точная атрибуция PID по сохранённым данным не доказана.
Механизм воспроизведён отдельным proc-denial control, но это не доказательство
его участия в данном incident. Не переписывать failed proof и не выпускать владение
вручную. Нужен квалифицируемый reconciliation contract, если source attribution
не позволяет текущему API завершить incident. Native browser проверки впредь
не совмещаются также с unit suite, содержащей nondumpable/proc-denial controls.

2026-10-15 08:11 UTC read-back: temporary incident root
`/tmp/evals-cli-sessions-00q2hZ` теперь отсутствует, как и прежние `/tmp` logs
и audit helper. Причина удаления не установлена. Сохранённый private source
`native-cli-sessions-e585d09b-db03-49bf-a80d-a574adc9183e/cli.json` связывает
исходную identity; exact Docker read-back всё ещё видит running
`3ecb5dd074e5ae6aed47d0b53cab27720ca89dd33f7e0172a88e5b86acc4d4c5`
(`/evals-cli-a9502f4d-server`) и
`19f5810b91735893c1d3952277da90078e5e5a7598fd8f759ac259b15385f69a`
(`/evals-cli-a9502f4d-studio`). Incident не считается завершённым; отсутствующие
canonical journals/proofs не синтезировать, контейнеры вручную не удалять.
Новые проверочные логи сохраняются в private research evidence вне `/tmp`.

2026-10-15 reconnect fixture: `/home/kiselev/storage/tmp/evals-cli-sessions-MKHklA`
сохранён после `ADMIN_DISPOSE_UNKNOWN`. Primary admin-nldUb7 получил confirmed
dispose/transport ACK, но continuous proof failed на EACCES
`/proc/4086419/exe`; unknown=[]/final00 не устраняют observation gap.
Peer admin-EKfKGR disposed/continuous closure confirmed. Целевой reconnect collector
ещё не вызывался. Private600 `native-cli-sessions-f0c6bd9e-b63c-4a69-a291-5189645ebf27/failed-dispose-sources.json`
SHA256 `d01144198e5d314353a82fbc4021f0246f44af278e81c3ec6dea6774d4b9383a`
сохраняет original pair/journal/management snapshots/results/process proofs и оба
admin receipts. Nonce `930bbeb6-91a2-4648-8988-46ce11e81eb4`, server
`6c165db687399ab27d81bdbadb82f8dd68233c898a2840490cbb5d684fd5792d`, Studio
`d2f64573b00a4781eab8cd14e1a0937496853d0519241d69c136307bde783846`.
Failed proof не изменён, writer-release exception для EACCES не применим;
normal qualification/release/delete из этого результата не следуют.
Read-only signal audit: PID4086419 отсутствует в own/peer/unknown/admission/
origin/browser-binding всех двух admin и четырёх CLI proofs; UID/starttime не
сохранены, сейчас PID отсутствует. Exec/exit/zombie/владелец не атрибутированы.

## Native A/B setup: сохранённый неквалифицированный UID-change incident

2026-10-15: новый per-slot seal native case остановился до самого seal, во время
параллельных начальных setup. Оба CLI вернули exit0; A proof failed с
`Cannot inspect process identity PID 1452885: Process UID changed`, B continuous
proof qualified. Числовой PID есть среди B browser processes с birth142588744,
но failing frame не сохранил birth/state/UID value. Поэтому peer attribution,
причина UID observation и closure A не доказаны; две fresh zero-remaining passes
и исчезнувший PID не исправляют исходный proof. Простой собственный zombie
control с dumpable0/1 дал UID1001 в обоих случаях и не воспроизвёл UID mismatch.
Ослабления process guards и повторного native dispatch не было.

Test1 FAIL/2 assertions93.16s; unit producer-seal/related71 PASS412 assertions,
typecheck PASS не заменяют native qualification. Research pair и temporary
controller `/home/kiselev/storage/tmp/evals-two-users-eR7Snq` сохранены;
nonce `6648414e-dd88-47b4-9910-3072697d5103` подтверждён private fixture receipt.
Server CID `f36e216c34e29c6934f35e9ae3283564a969f05a4650619fee3c242835513d10`,
Studio CID `f87fb14926b6dd891de72d1d82765a361f7875de6e139ff4c08ff1597e1e881a`,
network ID `b18f48a07f2cf2012db09e69500674b2a9814dfd308aaedb549ec96ec7b4fdfd`.
Disposable provisioning использовал global guards, а environment ownership —
отдельный fixture-local lock root; local reservations retained/OS guards closed.
Global fixed guard files не удалялись и released provisioning proof не принимался
за environment cleanup authority.

Private `native-two-users-eeba0d80-30f4-4e22-b284-4c04e9012b7a/preservation.json`
SHAb0ee250a05bd91126c45fcc27c66e1a2c2b17cde989cb1a591a22a68118fbfe7
связывает88 raw/canonical source hashes, original proofs, server reservation и
fresh unchanged pair identity. Known active secrets проверены до копирования;
оригиналы не менялись. Sidecars отсутствуют; неисполненный собственный audit
helper удалён с hash, положительного source-audit.json нет. Нужен полный источник
UID-change frame либо квалифицированный recovery producer; retained reservations
и данные не удаляются по гипотезе. Delete/admission=false, model/judge calls0.

Следующий UID refusal теперь сохраняет sampled proc-directory UID, starttime и
state; failed stat-read даёт unknown, исходный отказ не снимается. TDD actual
read-only PID1 negative с ложной historical claim: RED старое сообщение без
полей → GREEN1/5 (0.779s). Supervisor/writer suites34 PASS/2 nativeBusy SKIP/
182 assertions148.47s, typecheck PASS. Это диагностические bookends, не атомарная
identity и не объяснение старого frame; прежний failed source не изменён.

Новый exact-source native run32685e3e66 прошёл1/19 (168.88s): A seal/archive/
accounting/close при active B, fresh B check и общий finalizer. Private case
`native-two-users-4a143678-dfcf-4a51-ae93-33db172b9b72` audit
SHAdd7acfd3197a7164153e1acdf2ff884ddc41726794123191d861c1e20fb7684a:
649 checks/192 sources, exact own pair/network/root absent. UID mismatch не
повторился; это не устанавливает причину старого eR7Snq и не разрешает его
release/удаление. Старые sources и reservations сохраняются.


## Архив после фактически прерванного check: текущий native gate закрыт, старые источники сохранены

2026-10-15: retained47d... fixture jothVh убран после qualified original setup/
interrupted check/admin closures,178 audit checks, точного same-lstat socket
read-back, свободных custom guards и committed profile archive. Штатный
destroyPair подтвердил nonce edbff046-09e6-484f-960b-f8a5f87b52ef и exact IDs.
Последующий read-back на том же Docker daemon подтвердил отсутствие обоих
контейнеров, сети и root; private retained-fixture-audit/removal/postcheck.json
SHA6e73a3de81f3a628820cdb9acd696650211efeca053a191edd3518c54ec1f038 /
343265542c43b4571281379e6f04f06b077df36ac2fb610eaf77ab9bcad48d8c /
e9b5d7493107d467476ab5788d15bf06e9f17c3eb5e27af9078c3f905cf689e7.
Это disposal собственной research fixture; normal slot/user release не выдавался,
signals0/fixed global lock unlink0. Прежние topology/process sources сохранены
в private evidence; MKHklA/LQKvkl/aEnKx5/старые unrelated incidents не затронуты.

2026-10-15 свежий `native-cli-sessions-8196b708-d490-415e-b559-75f4e69547bf`
после0961fe343d прошёл1/35 (116.68s): actual exit130/interrupted=true, sealed
registry→committed archive→two targeted closes→fresh absence→admin closure.
Private audit124/12/read-back SHA102495e2bb65a35411af0cb8cc9049206794bd73c9e3aecfd1f77ec613a3788f;
terminal SHA968101397334a031aeb12097a4db9662082e5e0e323d9fbe6d726286210e3a25;
собственная pair/root отсутствуют. Typecheck/diff PASS. Текущий gate реального
interrupted archive/close квалифицирован. Storage deletion/release/admission
по-прежнему запрещены; 47d... pair/root впоследствии убраны по scoped audit выше.

2026-10-15 strict control `native-cli-sessions-47d5228b-5be6-4590-95ec-5804d054ca9f`
подтвердил exit130/interrupted=true/timedOut=false и continuous cleanup confirmed.
Same-lstat cause: `/home/kiselev/storage/tmp/evals-cli-sessions-jothVh/profile-a/cache/tmp/org.chromium.Chromium.55uJMQ/SingletonSocket`,
AF_UNIX socket type0140000, UID/GID1001, nlink1, dev2050/inode209997114.
При отказе root jothVh и exact pair были сохранены; subsequent disposal записан выше, normal release не выдан. Минимальный
archive fix поддерживает rename socket object с сохранением identity и fsync
каталога; real stopped-child socket RED→GREEN, archive12/78 PASS17.29s и
typecheck/diff PASS. Свежий native archive/finalizer и полный source audit
ещё требуются. Это не устанавливает причину старого f5bf... инцидента.

Диагностика дополнена: ARCHIVE_TOPOLOGY теперь сохраняет path/kind/POSIX type,
mode/nlink/UID/GID/device/inode из того же lstat в Error.cause; native fixture
пишет эти metadata в private native-primary-failure.json. Actual hardlink
RED missing cause→GREEN archive11/69 PASS18.02s, typecheck/diff PASS. Исторический
bad path не восстанавливается из этой проверки; требуется новая фактическая
interruption и read-back её источников. Refusal/move/release policy не ослаблены.

Native evidence `native-cli-sessions-f5bf5146-1c6a-4f01-8fc5-ef5b733f8cae`
сохраняет exit130/interrupted=true/timedOut=false и confirmed continuous CLI proof,
затем ARCHIVE_TOPOLOGY до publication первого archive manifest (35 assertions,
177.44s). Тогдашний teardown удалил root dPGRg7 до metadata capture: конкретные
path/type/UID/nlink не установлены. Symlink разрешён архиватором и сам по себе
не объясняет отказ. Hardlink producer connectionStore.stage обнаружен в runtime,
но check его не вызывает; причинная связь не доказана. Новая fixture сохраняет
root при ARCHIVE_TOPOLOGY для lstat без следования symlink.

Повтор 2026-10-15 `native-cli-sessions-70a965d2-d5ad-4a7e-a08c-867e05d4e394`
прошёл1/53 (174.94s), archive→three closes→fresh absence→admin closure подтверждены
private audit154/11/read-back. Но check выиграл abort race: exit0/interrupted=false.
Это положительный completed-check control, не воспроизведение interruption.
Предыдущий повтор cdf7dba0... остановился на strict reading живого manifest;
test-only hint исправлен после real-fs rename/nlink0 control, frozen readers не
ослаблены. До сохранения failing metadata причина ARCHIVE_TOPOLOGY остаётся
неразрешённой; admission/release из этих результатов не следуют.

## Mixed recovery: quarantine после пересечения собственных browser-проверок

2026-10-15: `/tmp/evals-recover-mixed-dyI2ST`, собственная disposable pair
`evals-mixed-9d88eeeb-server` / `evals-mixed-9d88eeeb-studio` (точные container
identity читать из private pair.json). Original controller завершён SIGKILL137 после release A и отказа
на B canary. Первый recovery подтвердил native disconnect/dispose ACK и две
final00 для своих процессов, но supervisor сохранил failed process proof:
`Unexplained browser/helper PID 2146151` и ещё7 unknown identities. Connection
`controller/admin-mRkj6y/connection.json` quarantined; resources остаются fenced.
Одновременно ошибочно запущена другая собственная native recovery проверка
izBc4f. Она штатно завершена/удалена, её источники сохранены в private
`research/evidence/native-mixed-red-resume-20261015/qualified-mixed.json`.
Read-only сопоставление подтверждено: все8 unknown tuples PID/starttime/UID/
executable/device/inode точно совпали с owned+allowed identities чужого для
этого supervisor собственного admin-OQw8sM из saved source[2]. Producer PID
2141109 и2143590 различны, lifetime overlap1.325s. Peer registry process-local,
поэтому отдельный controller не был признан peer. Старый quarantined proof не
переписывается, ручной release/delete не выполняется.
Последующие native browser проверки выполняются последовательно.
Текущего API additive peer-source qualification нет: qualifier требует
confirmed/capture-complete proof без unknown; writer-settlement exception также
запрещает unknown. Для dyI2ST нужен отдельный проверяемый контракт reconciliation
с immutable foreign sources; диагностическое совпадение не заменяет release proof.

## Положительная SessionBackup policy остаётся неквалифицированной

2026-10-15, дополнительный restart control: после реального named/modified
package и ненулевого native autosave старый admin подтвердил transport disconnect
и continuous process closure; остановлен и запущен только собственный disposable
server CID. StartedAt/serverEpoch изменились, IDs server/Studio сохранились.
Новый independently supervised admin успешно выполнил init/inspect на новой
эпохе и подтвердил disconnect/closure. SessionBackup пуст после stop и после
готового native входа; `/workdir/SessionBackup.cfg` отсутствует. Это проверяет
новый путь graceful stop→startup, но не даёт положительного backup control или
disabled policy. Hard-crash/startup этим опытом не проверен.
Native test1 PASS/70 assertions65.18s, typecheck/diff PASS. Private
`native-user-72d4968d-8965-4308-8c3d-a13b6c979513/source-audit.json`
SHA6e1029b0f0d616178a5b3e0cec23047984b3e1fd2b26cd820bb3ec1aae63b655:
17 independent checks,30 source hashes, both continuous closures and exact
pair/network/root absence. Production grants неизменны; model/judge calls0.

2026-10-15: отдельный hard-crash/startup control тоже не создал SessionBackup.
Перед остановкой подтверждены pending Count1 backend row того же user/session,
изменённый named package, native period5000/keepAlive1800000 и autosave5062 bytes
SHA7fb44c3ed3a552016984fcbb9b54eec3d6a30f9467deeb1d5ca55a64c7132dd2.
Старый admin подтвердил disconnect/continuous closure до `docker kill --signal
KILL <exact own CID>`; actual state exit137/OOMKilled=false. После restart тех же
CIDs новый admin init/inspect/dispose подтвердил новую StartedAt/epoch и closure.
Manager list до crash пуст; physical copies после kill и после native-ready
restart пусты, SessionBackup.cfg после restart absent. Это подтверждает лишь отрицательный исход данного recipe; create trigger
и supported enforced-disabled policy по-прежнему не квалифицированы.

TDD oracle RED на graceful0 вместо expected137 (1FAIL/68 assertions68.85s),
после смены только termination command оба native controls GREEN2 PASS/146
assertions147.83s; typecheck/diff PASS. Hard case
`native-user-831bf8d0-e994-4722-8d64-0963f15ffd35/source-audit.json`
SHA7678658c18976971879db5dc3c56d1f906a0b2dc1ed0f2b736a6985adcf03f4e:
24 checks/32 sources. Graceful control62678829...22/30 и RED678fa71a...21/34
сохранены; общий verification SHAfa28c0dd58ccb104a9271cfbfcdbaf29724d3d4d6aa081f284d28642e1160453
перечитал96 source hashes и обе copied empty directories каждого case. Все3
собственные пары/сети/temporary roots точно отсутствуют. Production grants не
менялись; model/live judge calls0. Старые retained incidents не затрагивались.

Дополнительный primary boundary2026-10-15: public pinned server image содержит
`SessionBackup.cfg`/`SessionBackupConfiguration`, User/Name/Session map/list,
backup status/finalize enums и package-autosave event flags. Binary SHA256
`1fea749d88b89cdf810e7c23496e5ad146728a032abfcd235367c5f1969cdd0a`
совпал в трёх независимых чтениях никогда не запускавшихся inspection containers.
Эти имена не задают документированный create/enable/disable API или schema
файла; наличие metadata map не доказывает сам trigger. Полный JS RPC formal
`SavePackageAs(APackage,AFileName)` не содержит дополнительного backup-флага.
На собственной permanent research pair fresh no-follow check подтвердил
отсутствие `/workdir/SessionBackup.cfg` при неизменном StartedAt; это не disabled
policy. Symbol-name/UTF16 lookup не нашёл дополнительного метода или debug section.
Неподтверждённый config файл не создавался, старые crash recipes не повторялись.
Private `management-registry-20261015/backup-binary-primary-audit.json`
SHA7219026dd85f79d4aebf24816ffb6fa5465c83d86c0c489849bd5aae268cdc4c
связывает5 primary sources/metadata receipts, свежую absence трёх собственных
inspection CID и неизменный image/daemon. Raw binary copies/tmp roots удалены;
permanent pair только читалась, новых browser/model/judge calls0. По-прежнему
нужен подтверждённый server-side trigger/контракт от платформы либо supported
enforced-disabled policy с положительным control. Gate не снимается.

2026-10-15 research: native PackageAutoSavePeriod=5000 read-back + named package
с реальным изменением создали ненулевой `UserStorage/eval-a/backup-probe.lgp.autosave`.
SessionBackupManager.GetSessionsList остался пуст, физический SessionBackup пуст
до и после штатного stop собственной disposable pair. Другие проверенные recipes:
несохранённый module, own pagehide fault, short SessionKeepAlive/read-back и новый
user context. Они также не дали положительного session backup; это не доказывает
отсутствие поддержки платформой. Native roots: UserStorage/SessionBackup, relative
к рабочему каталогу. Drafts не autosave по официальной документации.

Дополнительная граница исследования (2026-10-15): опубликованный RPC manager
(interface674) содержит GetSessionsList, DeleteSessionBackup, DeletePackageBackups,
RestoreSessionBackup и RestorePackageBackups; подтверждённого create/enable trigger
не найдено. Settings публикует SessionBackupDirectory, а PackageAutoSavePeriod
относится к package autosave. Это не является доказательством disabled policy.
Private600 `research/evidence/management-registry-20261015/backup-policy-primary-boundary.json`
фиксирует SHA256 обоих pinned primary JS, methods и ссылки на официальную документацию.
Gate остаётся `SESSION_BACKUP_POLICY_UNPROVEN`; повтор старых recipes не снимает его.

Startup race подтверждён fixed BACKUP_DRIFT telemetry: MainForm поздно применяет
сохранённый user autosave period. Published end-of-initialization callback wait
сохранил исходный deadline и убрал этот drift. Named autosave теперь имеет
private bytes/SHA + current identity/user/session/period evidence; safe A/B cleanup
и SessionBackup mapping/delete/enforced-disabled всё ещё не квалифицированы.

Следующая нужная информация — фактический server-side trigger создания session
backup для закреплённого 7.4.2, либо положительно квалифицируемый enforced-disabled
режим. Нужны ненулевой control и user/session attribution; empty root не снимает
admission gate. Production ledger не принимает experimental backup phase,
main/live/model admission остаются закрыты. Независимые задачи продолжаются.

Источники: https://help.loginom.ru/userguide/interface/packages.html и
https://help.loginom.ru/adminguide/linux/server/config.html; первичный
MainForm.js:1133–1140/PackagesAutoSavePanel.js:50–58 закреплённого Studio.

## Draft admission fixture: retained unused slot reservation

2026-10-14: /tmp/evals-admin-user-e3H9B4, own research nonce
eddb11f2-bde0-4659-aba7-d6ff61201875, server full ID
1790125f8e1408aca0312cc2db75c1214708d1cf198f70d98f3c8c44d4ed9ef0,
Studio2d467bf07fddc87fff4a7418dee81f15681c0b67fe0b3118ff40a3c8e779776f.
Первый draft упал до отсутствующего createBlockedUser; finally close оставил
reservation, destroyPair отказал PAIR_RETAINED_INCIDENT. Pair/root/secret/journals
сохранены; отсутствие нынешнего PID не разрешает remove reservation или destroy.
Нужны recovery-only CAS и доказанное unused/clean release (account absence,
native process proof, committed archive) через lifecycle API. Native wire CRUD
продолжен на других disposable pairs без slot admission; они штатно уничтожены.
Обновление 2026-10-15: recovery-only slot CAS/lineage реализован и проверен
реальными exited Bun controllers; native parent admission guards также PASS.
Этот конкретный incident ещё не принят/освобождён: адресные process/archive/unused
proofs и terminal cleanup producer остаются необходимыми.
Normal staged-only/account-absent finalization primitive теперь реализован и
проверен на новой disposable pair; для этого старого incident всё ещё необходимы
recovery-only ownership и совместимая исходная provenance. Его reservations/данные
не изменялись.

## Незавершённый live admin dispose — причина пока не воспроизведена

Research admin-fYV8vv: probe unknown/dispose confirmed, затем test timeout90s;
финальный connection receipt остался ready. Подтверждённого cleanup этого
incident нет. Пять локальных channel/supervisor tests×3 и два actual Node/pipe
order probes прошли (15 PASS/63 assertions, оба final00). Последующие live
read-only/design-refusal проверки завершились; перестановка await как fix не
подтверждена. Journals/profiles сохраняются, targeted closure/admission остаются
gates. Диагноз: evals/docs/2026-10-14-admin-design-capability-diagnosis.md.
Продолжение: проверить lifecycle на квалификации design user, сохраняя incident;
отсутствие нынешнего PID не разрешает освобождение его fence или удаление данных.

## Bootstrap administrator — внешний вход получен, live qualification открыта

Обновление 2026-10-14 16:23 UTC: оба **фактически настроенных** файла
`parallel/secrets/loginom-admin.json` и `research/secrets/loginom-admin.json`
присутствуют. `loadSlots` + private receipt reader + schema validation PASS:
regular current-UID0600, два непустых string-поля username/password без NUL.
Содержимое не выводилось и не копировалось. Выбранные container names свободны,
постоянный pair journal отсутствует; следующим шагом создаётся research pair.
Public create research 2026-10-14 завершился infrastructure-ready, persisted
pair.json и resource/identity read-back PASS. Evidence:
`/home/kiselev/.local/state/loginom-evals/research/evidence/pair-bootstrap-20261014`.
Pinned-candidate native admin login/role read-back + browser/native dispose теперь
PASS: target1/7 (6.22s), combined48/123 (36.33s), typecheck/diff PASS. Timeout
root cause — Studio password readonly до focus — исправлен штатным focus;
диагноз evals/docs/2026-10-14-admin-password-focus-diagnosis.md. Unknown старых
probes сохранён; server sessions/ACL/backup/licence counts ещё не квалифицированы.
Acceptance pair ещё не создана.
Отсутствие admin file больше не блокирует factory; admin login и роль
подтверждены на research. Лицензия, qualified session RPC/ownership и остальные
readiness gates ещё требуют проверки.

Историческое состояние на 2026-10-13:

Постоянные конфиги созданы в `/home/kiselev/.local/state/loginom-evals/parallel/slots.json`
и `/home/kiselev/.local/state/loginom-evals/research/slots.json` (private regular 0600).
Файлы администратора по указанным в них путям отсутствуют:

- `/home/kiselev/.local/state/loginom-evals/parallel/secrets/loginom-admin.json`
- `/home/kiselev/.local/state/loginom-evals/research/secrets/loginom-admin.json`

`loadSlots` реально отказал с `SLOT_PATH_PRIVATE` до Docker mutations. Требование
плана: bootstrap credential предоставляет владелец в private regular file 0600;
исходные права/лицензия не выдумываются программно. Пароли работающих dev/legacy
пользователей не заимствуются, файлы с фиктивными credentials не создаются.

Нужны исходные административные credentials, пригодные для новых pinned-image
пар; driver закрепил JSON-схему: ровно два непустых string-поля `username` и
`password`, без NUL, private regular file 0600 текущего UID, nlink=1, без symlink.
Секреты нельзя
передавать через Git, results, argv или сообщения. После появления файлов:
проверить owner/mode/schema, создать постоянные пары и квалифицировать admin login.

Ограничение затрагивает постоянный bootstrap задачи 1а и живые проверки задач
2–5/10. Disposable Docker infrastructure integration не входит в Loginom под
пользователем и не доказывает admin readiness. Unit-реализация и немодельные
Docker проверки могут продолжаться.

Driver rejection integration отдельно квалифицировала malformed/missing private
credential и несовпадение runtime hash до browser launch. Format-only canary
временный fixture не использовался для Loginom auth и удалён; постоянные
bootstrap credentials не создавались. Browser/readonly RPC пути ещё не проверены.

Bun→Node→supervisor bridge прошёл отрицательную интеграцию на собственной
disposable pair: 3 tests/17 assertions, init not_applied, dispose confirmed и
continuous process absence proof. Это позволяет продолжать независимый код,
но не снимает bootstrap blocker и не доказывает browser/admin readiness.

## Model и judge OAuth — файлы появились, live qualification открыта

2026-10-15: фактический model store принят штатным `assertAuth`; два pinned-candidate
CLI в разных bubblewrap profiles одновременно прочли public provider status
(ready, same generation/principal, refresh_required=false, overlap5802ms). Общий
lock inode стабилен, оба process proofs confirmed/capture complete. Private
evidence: research/evidence/actual-shared-status-0WIqV1/receipt.json600, SHA
b00e0ba6103b7706317a0d606f3ea74df3ee817f1cc4d2cc95e1a05e05d77fd8. Это
снимает неизвестность schema/локального чтения реального store; remote token
validity, forced refresh и model/judge live acceptance остаются открытыми.

Обновление 2026-10-14 16:23 UTC: configured model-oauth/auth.json и
judge-codex/auth.json присутствуют как regular current-UID0600. Проверены только
metadata, auth bytes не читались; действующий вход, сроки/refresh и реальные
model/judge calls ещё не квалифицированы. Отсутствие файлов больше не считается
актуальным blocker; прежние наблюдения и onboarding инструкции сохранены ниже.

Историческое состояние:

После успешной установки shared-oauth candidate metadata-only проверка обнаружила отсутствие `parallel/model-oauth/auth.json`, `parallel/judge-codex/auth.json` и `parallel/onboarding/profile`. Путь установленного candidate и hashes закреплены в private `/home/kiselev/.local/state/loginom-evals/parallel/candidate-receipt.json`. Source/manifest/capability qualification PASS; это не действующая авторизация.

Подготовка directories завершена 2026-10-14: model-oauth, judge-codex, onboarding и onboarding/profile — canonical owner1001/mode0700 (read-back). Отсутствие onboarding/profile устранено; оба auth.json по metadata-only проверке всё ещё отсутствуют. Installed candidate eb85403ce4 квалифицирован только для synthetic-schema public status и bwrap status consumers; live OAuth/forced refresh не квалифицированы.

План задачи 7 требует свежий вход владельца с внешним подтверждением аккаунта: shared модельный вход в private onboarding profile с `LOGINOM_AI_AGENT_SHARED_AUTH_DIR` и HTTP-only false, затем отдельный `CODEX_HOME=.../parallel/judge-codex codex login --device-auth` для судьи. Desktop/prod auth не копируются и существующие OAuth stores других задач не заимствуются. Harness может подготовить directories и проверить статус, но согласие аккаунта выполняет владелец.

Этот blocker относится к model/refresh и judge live gates. `--skip-judge` не требует judge auth; немодельные и fake CLI/judge проверки могут продолжаться. Команды входа и неизменяемые пути остаются в задаче 7 плана; токены в этот файл не записывать. Вопрос пользователю отложен до завершения независимых задач.

Static Studio inspection 2026-10-14 независимо от credentials закрепила RPC interface inventory (private admin-source-4905babb/rpc-inventory.json): Session.Guid и managed object ID доступны в surface, UI CloseSession использует proxy row. Это не живая квалификация: GUID↔managed-ID/CLI correlation, reconnect stability и close/read-back остаются неподтверждёнными. Дополнительный blocker несовместимости API не заявлен по одним descriptors; нужен owner-backed Loginom run из уже указанного bootstrap prerequisite. Stopped inspection container удалён, endpoints/рабочие сессии не трогались.

## Retained parent-preparation RED fixture

2026-10-15: `/tmp/evals-parent-prepare-XnBhbF`, nonce
`910f1d39-4eb8-48d7-ab98-aff3c25897cc`, server
`722e3d356803392959624c9bab58d40e3e66b560660f8b6c957e095459321b83`, Studio
`dcee92dd8842f85da5853b30557a1743180f50692882b8783bf4e6b7781232a7`.
Actual parent blocked create/configure/ACL confirmed; root publication failed
USER_STORAGE_OWNERSHIP because a root appeared during native preparation.
Admin transport/process disposal confirmed, account never activated, storage
journal planned. The ordering defect is fixed by pre-reserving the absent
inode and has passed fresh native composition; this old root is not adopted.
Server/user/profile reservations, sources and secret remain retained. Removal
requires actual recovery-only lineage plus an unactivated-account finalization
producer, still absent; empty root alone does not authorize release/destroy.
Diagnosis: `evals/docs/2026-10-15-user-root-reservation.md`.

## Installed judge launcher does not preserve the dedicated home

2026-10-15: a supervised `codex login status` with requested
`CODEX_HOME=/home/kiselev/.local/state/loginom-evals/parallel/judge-codex`
returned exit0, but this is **not evidence for that home**. The actual executable
`/home/kiselev/.local/bin/codex` is a bash VPN/systemd-run wrapper which sets
`CODEX_HOME=/home/kiselev/.codex` in its env-i child. Its reported logged-in state
therefore must not qualify the dedicated judge account. No judge/model request
was made, no auth files were copied or changed, and the global wrapper was not
modified or bypassed.

The same invocation failed strict process qualification: `CLI executable identity
differs PID 150092`, observed executable `/usr/bin/bash`, birth136642524,
continuous capture complete, process status failed. Dedicated judge reservation
remains retained at the fixed global lock root, journal
`/home/kiselev/.local/state/loginom-evals/research/controller/judge-status-A00yuH/journal.json`,
command585940be-5c1b-4bff-a7c6-00459a4f7fa3. Initial observation, failed process
proof and superseding diagnosis are preserved in that directory. Diagnosis
receipt600 SHA46713e3d02201e572d4596f80b7dba03e0bbc0119fbabe71cd0097ce0b706004,
read-back confirmed; initial reported login is explicitly unqualified.

Required resolution: an approved judge launcher that preserves the dedicated
CODEX_HOME and existing VPN/network restrictions, plus actual launcher/process
ownership qualification. Simply allowing arbitrary bash/systemd processes or
running codex-real outside the network policy is not an acceptable fix. The
retained status incident also needs a qualified cleanup/recovery producer before
release. Other non-model work continues; user action is deferred until only
external blockers remain.

## Retained admin-inventory test incident

2026-10-15: `/tmp/evals-parent-prepare-jkdzDM`, pair nonce
`add08c97-e003-4fa9-997c-80e14739cc07`, server
`a4f9d2e0ade391b5caad83fe584b3c3a259ba7a55a879e9bbe671b83a3fd0490`, Studio
`31ce622a1ea4da1890f971ad1c4188af497ec02ccc1de861a146a7c8b0302ca6`.
A new inventory basename `admin-processes.json` collided with a test-only
admin-directory prefix search; ENOTDIR before account creation. The basename
is corrected to `processes-admin.json`. This incident remains preserved: no
account ownership or activation marker, admin-QJYDop dispose/disconnect and
continuous process cleanup confirmed (producer PID1037271), original slot
`slot-a-38f77afe-a38e-4005-a575-7737133e0670.lease.json` and server reservations
retained. Inventory bytes SHA256
`04ded8ad15f9a4482eb6710e4f095892db02ed3dec8794694d7041721890f3fc`.
No ad hoc release/destroy: recovery-only lineage plus native unactivated
observation, archived profile and complete command process inventory are needed
from the pending production finalizer. Missing account/PID alone is insufficient.

## Management setup writer-release proof — 2026-10-15

Native accounting GREEN attempt stopped before collectManagementSessions:
setup exit0 but continuous process proof failed `Writer owner unavailable`.
Unknown processes0; all18 admissions allowed,13 peers exactly match the admin
proof. Own/admin exact PID/starttime identities are now absent; admin disposal,
transport and continuous closure are confirmed. Historical error cause remains
unproven; absence now does not repair the original failed proof.

Own retained root `/home/kiselev/storage/tmp/evals-cli-sessions-aEnKx5`, pair nonce
`cc6c3b5b-2593-4e04-87d5-d3593c784c76`, server
`8e1d435a0c87955199ebe8239d01feba6f68ec4a9997790d2a29e052a630073a`,
studio `18625dd4d2b3c30e00e7730bbd8494cab0c80192fdff9e13780c30aba9f1ff4e`.
Original proof SHA256
`033b9eabef82fe608c14c4d9007d59be29bf823aae4f6fcadaf4a51174b56d14`.
Private source copy: `management-registry-20261015/accounting-writer-source.json`;
log `accounting-green-final.log` (0 PASS/1 FAIL,2 assertions,90.23s).

Public observeWriterReleaseSettlement admitted the original proof shape but
refused `Writer-release processes busy or foreign`; no destroy/delete/release
was performed. Do not stop foreign processes or rewrite the normal failed
inventory. One-shot helper remains in
`/home/kiselev/storage/tmp/evals-accounting-writer-cleanup.ts`; its nonce/source
guards run before any archive or factory teardown. A separate cold accounting
qualification does not resolve this observer/recovery gate.

Следующий reconnect GREEN также остановился до collector: `setup` exit0,
continuous proof failed `Writer owner unavailable`, unknown=[]/final00;
`/home/kiselev/storage/tmp/evals-cli-sessions-LQKvkl` сохранён. Оба admin
завершены подтверждённо; management inventory остаётся unconfirmed, after snapshot
не опубликован. Private600
`native-cli-sessions-b8a7aba3-a281-44e3-bac6-6172c0b19cee/setup-writer-sources.json`
SHA256 `2aecee03849c6b14b7a516202856dd216a095997c6d073a7720bd53a7dc24638`
сохраняет original sources, без дополнения отсутствующего after. Original proof
SHA256 `29c9b80bf826634f0f08b5932a41b5e0c16782cb83e0c6620d2222fa9ec8aedb`.
Nonce `eaf68d07-28ba-40e6-a226-f5c9eac601a2`, server
`2a3fb5698f038f86478b3a5d5c9e406c597b38f78ce487d0de1e7e4238a1e612`, Studio
`07169c9dd729f15a434fb296065cde626d6d58ac8952efaa0882d2d6c00b6bd1`.
Normal proof не исправлен, closure/release/delete не квалифицированы.

## Лицензионная ёмкость: поддержанный read-back пока не квалифицирован

2026-10-15: дополнительно хэшированы1817 JS-файлов локальной client copy
admin-source-4905babb;6 прежних primary hashes совпали. Identifier search после
comment stripping выделил30 файлов. `bg/app/Licenses.js` читает
`licenses/index.json` и тексты соглашений/third-party notices;
`MAX_SESSION_TIMEOUT_SEC` относится к MaxDisconnectedSessionKeepAlive, а quota
в analytics-модулях — к аналитическим настройкам. Числовой либо явно unlimited
лимит и его counting scope из этих наблюдений не получены. Поиск идентификаторов
не является AST-анализом либо полной server API coverage и не доказывает
отсутствия другого licensing API.

Private600 `management-registry-20261015/licence-client-surface-58d2bf88-b108-4ca5-ac62-bcba1212421a.json`
SHA256 c0f3fe431efaa3781921552a5602e49cd2f57f7699c6c004b8b4ea4d8f7ca3df
содержит перечень/хэши, candidate identifiers и границы вывода; runtime calls,
serial/key reads0. Новый genuine A/B management native1/16 и audit584/177
подтвердили два пользователя и независимое адресное закрытие сессии A, но не
заменяют фактическую выдачу/тип лицензии, max/unlimited и учёт admin/retained
сессий. Нужен поддержанный производителем read-back либо достоверные issuance
данные с явным лимитом и scope; числовой порог не выводится из отсутствия отказа.
Production admission и полная приёмка остаются закрытыми.

Дополнение 2026-10-15: поддержанный веб-монитор Guardant найден и доступен.
[Loginom Admin Guide](https://help.loginom.ru/adminguide/linux/licenses/license-server.html)
связывает `IP_NAME` в `gnclient.ini` с сервером ключей и описывает монитор на
порту3185. Read-only проверка permanent research Server6ae20e683182… дала
настроенный host `grdsrv-lin`; GET корня и `monitor.htm` успешны. Наблюдаются две
группы модулей Loginom/Desktop/Server Team/Server Standart/Server Enterprise/Adapter;
показанная пара ресурса Enterprise37/50 в одной группе не является доказанным
лимитом браузерных сессий Loginom. Все13 прочитанных client records сообщают режим
«По копиям» (10 `loginomd.exe`,3 `loginomd`); точного совпадения hostname собственного
контейнера нет. Отсутствие совпадения не доказывает отсутствие выдачи: правило
привязки Guardant host/process к нашему ServerIdentity ещё не квалифицировано.

[Guardant Net](https://dev.guardant.ru/pages/viewpage.action?pageId=1277979)
документирует отдельно ресурсы модуля и режим лицензирования клиента.
[Loginom Help](https://help.loginom.ru/userguide/compare-editions.html) связывает
браузерные сессии с приобретёнными пользовательскими лицензиями и отдельно
описывает административные/пакетные исключения. Поэтому50 сетевых ресурсов нельзя
подставлять в `max_sessions` либо выводить unlimited из названия Enterprise.
Открыты точная выдача нашему daemon, число пользовательских лицензий и applicable
session counting scope; network-monitor availability больше не является неизвестным.

Private600 `licence-monitor-96ee8d5e-987d-43b9-85f3-579effdc789e/observation.json`
SHA256 `478a91af8c188a614986a9672c25f0215fec27f30686f5ce32a5093843f33a56`:
15 HTTP observations с hashes/timestamps и нормализованными полями, совпавшие
container identity bookends, read-back сохранённого JSON. Raw HTML и query values,
включающие key identifiers, отброшены; страницы серийных номеров не запрашивались.
Нет settings/rescan/restart/key changes, Loginom login/model calls0. Evidence
не является квалифицированным licence producer и не открывает admission.

## Native agent replay: ранние fixtures retained до квалифицированного cleanup

2026-10-15: первый новый local provider fixture не обрабатывал debugger discovery
`GET /json/version`; его request.json() дал unhandled error, Bun завершился до
публикации finally/settlement. Native admin connection остаётся ready с
dispose=not_started/processes=null; inventory агента пуст. Original producer
1812785/birth143189040 больше не наблюдается, что не даёт cleanup authority.
Root `/home/kiselev/storage/tmp/evals-native-agent-bKNVO2`, nonce
`2d5819e0-6cb6-4399-bb32-c7a1b7a228d7`, Server
`747465344a21c622499841d4bc9750d0f719e34570fbd238380243fb08cf265c`, Studio
`2763f8af2df2caf5c35bd75c1a5550e49d4e0f3f74294511599259580dd82cb3`, network
`63fb39bf189abc8723424f1ca3b92d2b91f4bbe71ae3052833bc646788386134`
сохранены. Private native-agent-replay-bd6e06b2-971c-488a-95f4-0ba4ffe64a5a/
incident.json SHA256 `94ca9f37c64903d3f6a3facd062b54f210c6b750cd9264263fc787a091e3193d`
и copied controller sources сохраняют исходное состояние. Секретный preparation
файл не копировался. Нет сигналов guessed PID либо ручного release/unlink.

После GET404 RED→GREEN второй fixture дошёл до runAgent, но outDir ещё не был
создан. Generic sandbox refusal, planned agent inventory без опубликованного
process proof; native admin dispose/continuous closure подтверждены, CLI
settlement=false. Root `/home/kiselev/storage/tmp/evals-native-agent-YRV2I1`,
Server `48e14d5f710d1a15441c248085ea61719a8bae74d33f883469ac8f0845fc2ea2`, Studio
`e896b1acaac3c45db36bf65969bc34c2a9dbccbc2b684fc599c040591ef3d67f`, network
`72494dd707b5ba41c6cf819b2afacf5090c099c3a6ea4b17bcd1ec1abd53ba36` retained.
Private native-agent-replay-44875d4e-ec67-43c2-9319-ce83c5f61939/settlement.json
SHA256 `a1fec20d41a9a4bdacfe45a2c41c45925ecccd0aaedb9c4a20ae23270b72104a`.
Source order открывает capture files до launcher spawn; отсутствие каталога и
пустой registration marker согласуются с pre-spawn отказом. Исторический hidden
cause не сохранён, поэтому это не заменяет qualified cleanup/recovery evidence.
Резервации этих двух environments находятся в собственных root/locks; fixed
global provisioning guard и normal environment release — разные scopes.

Fixture теперь создаёт outDir до runAgent, durably отмечает cli_admitted и
обрабатывает CDP GET; local-provider TDD1/13 PASS. Skill-only control eaced503…
завершился exit0 и подтвердил local closure, но не создал browser/session; его
own pair/root удалены. Полный skill→prepare replay6b26e673… затем PASS1/14,
audit87/45 подтвердил новую active Count1 row и все closures/own pair absence.
Это квалифицирует новый recipe, но не исправляет предыдущие два incidents.
Нужен recovery producer для incomplete local actor/pre-spawn registrations;
production run и normal release этими исследованиями не разрешены.


### 2026-10-16 — Late admin and retained nonempty session

В native package control после disconnect named/modified designer session
исходный PendingDisconnect=true, Count1. Позднее открытый второй parent admin
успешно читает package receipt, но raw close видит PendingDisconnect=false,
Count1/expected1 и отказывает SESSION_NOT_IDLE. Условия close не ослаблены.
Private native-user-5037b495… и3173ba84… сохраняют full replies/journals и before
snapshots; вариант с освобождением query handles тоже отказал. Отдельный probe
со стандартным inspect был confounded и не доказывает источник изменения.
Причина изменения пока не установлена, связь по времени не объявляется причиной.

Контроль с parent admin, открытым до создания designer session, проходит:
native-user-9bcdf36b…1/67 PASS67.56s, audit SHA256
`0e6fc145fa8c5fadafe0e8eac129a42aa14310894e16764bfbeb5268947af7b0`.
Это квалифицирует durable package reader в режиме заранее открытого соединения;
replacement-admin finalization retained Count1 остаётся отдельным gate. Native
read-only API не выдаёт cleanup/operations permission. Следующий независимый
шаг — positive running/shared/pool controls и quiescence mapping.

Все5 RED/diagnostic fixtures86482995…,3cf852eb…,5037b495…,bd7e9cf6…,3173ba84…
имеют actual continuous closure обоих admins, transport ACK, original LGP/autosave
и verified absence собственных exact pair/network/root (boundary-audit.json,
22/22/25/22/25 checks). Старые incidents и permanent research/dev не удалялись.

## Selected Pool ClosePackage: native refusal (2026-10-16)

On a newly owned research pair, the completed and deleted once-only Scheduler
job leaves `/eval-pool-probe/progress-probe.lgp` in Pool type3. A fresh exact
path/unique-object/Progress=false lookup followed by one native
`IBGDeductorSessionsManager.ClosePackage(packageInfo, 5000)` throws
«Не найдена сессия в которой находился пакет progress_probe. Возможно она уже закрыта».
The same Pool object remains after fresh read-back. This RPC is not a qualified
scoped Pool cleanup path. The installed SessionsManagerForm.IsClosable also
excludes Pool/shared collections; its ClearPackagePool operation has no selector.
No global clear or server restart was used.

Native failed positive expectation is retained in private
`native-user-5de62e6a-b0bf-4c13-a89f-d995ecdc382f`; its exact sources/input,
original reply/journal, both continuous admin closures, transport ACKs and
absence of the exact own pair/network/root passed boundary audit
SHA256 `53a38350a18c5fee8ac7f1704eaed549a308becefa5a418dce45a2097ad494b7`.
The unsupported-phase RED `38f64f35…` is settled separately.

The neighbor comparison initially used another admin observer's proxy ID.
Observed native SessionInfo proxy IDs differ between admin observers even for
the same named session. The control now finds B's unique name in one observer
and compares that observer's full package row and proxy ID across bookends.
This does not weaken the separate session ownership/close guards. The original
failed oracle `34704c2b…` and fixture-counter failure `a8193505…` retain their
executed sources and diagnostics; they are not full passing test runs.

Next candidate: qualify native PackagePoolSize=0 on a fresh disposable pair
before user work, with getter/read-back and an actual completed job. Installed
ServerSettingsForm exposes this unsigned setting with minimum0; this is only
a verified setter surface, not yet evidence that zero disables retention.
Static source manifest `native-pool-settings-schema-2683f213-b58b-4d45-8019-803e6d6bb314/source.json`
SHA256 `f9292a8b396eeefa4206935eb65828d66acfccabf7c7d19b2a7a45bcf3cace2a`.
Production cleanup/delete/unpause/admission remain ungranted.

Final refusal/preservation control: native1/70 PASS68.76s, related49/160
PASS21.98s, typecheck/syntax/diff PASS. Private63e4e2dc… source-audit
SHA256 `17f23462c0b57a6f77072a64780ae85453e5cb3c149c89a668e2bd4848782e12`
checks93/43 sources+8 pins, both admin closures/transport ACKs and own pair/root
absence verified. This closes the research control, not the cleanup blocker.

### Pool follow-up: preventive native policy qualified (2026-10-16)

The research obstacle has a verified preventive path: on a fresh empty owned
pair, PackagePoolSize10→0 with immediate and post-job native getters0. The own
Scheduler job completes3, exact GUID deletion has fresh empty read-back, and
the package is absent across every collection before and after creator closure.
Native1/54 PASS63.23s; private2df05c6e… audit
`ca4df30304e01a5ec3af779da2138c4b08024cc225f89f0fba674d2d963c22a9`
checks70/23 sources+8 pins, both admin closures/ACKs and own pair/network/root
absence. Missing-phase REDe83d02ea…41/51.90s is settled with original sources.
Do not repeat the unsupported selected Pool ClosePackage recipe. Remaining
work is runtime admission with a frozen policy/fingerprint and drift guards;
public prepare/verify wiring is now qualified below. Package/lock quiescence, backup and storage cleanup remain
separate gates; this control grants neither delete nor next admission.

Same-source default-retention control62335c26…:1/54 PASS66.51s,
audit7e614cb9…74/25 verifies the same package retained after creator close.
Both cases freeze the identical8 code/binary/input pins. Related49/160
PASS21.15s; typecheck/syntax/diff PASS.

Pool preparation wiring follow-up (2026-10-16): public prepare configures0 before
user staging/configuration; verify only reads live0 and both receipts persist
the policy source. Native1/16 PASS99.68s, related62/232 PASS46.09s,
typecheck/syntax/diff PASS. Private51f765be… audit9c6e5d40…83/45+9pins confirms
three closed admin actors/transport ACKs, two released pre-CLI finalizers and
exact own pair/network/root absence. This resolves prepare/verify wiring;
runtime frozen-policy admission/drift and evaluated-attempt cleanup remain open.

Active backend follow-up (2026-10-16): one actual JavaScript CPU node is now
qualified after creator-context loss. Existing bound CloseSession removes the
active session/package before normal completion: browser/controller start→fresh
absence3051ms versus same-source/image control21456ms. Close1/53 PASS61.68s,
control1/54 PASS79.82s, related50/162 PASS22.75s, typecheck/syntax/diff PASS.
Private05c609b2… audit48d6b749…64/25 and0ff79e61…192a52d3…184/73 preserve
full replies, both admin closures/ACKs, exact own pair/network/root absence and
input. No ownership/pending guard or deadline changed. Actual CLI crash, B-active
continuation, FD/locks, backup/storage/no-regrowth and durable cleanup consumption
remain open; this component evidence keeps operation/cleanup authority false.

Concurrent active-user follow-up (2026-10-16): native A/B JS operations now have
a positive independence control. A20s is stopped while both packages show
Progress; B's same package remains active, completes successfully8108ms after
A closure, and preserves its canary hash. Native1/75 PASS83.41s, related50/162
PASS21.52s, typecheck/syntax/diff PASS. Privateb36aa5a7… auditf175c946…69/33+11pins
verifies full sources, three admin closures/ACKs and exact own pair/root absence.
Failed011628b4… was safely settled from actual closure/transport proofs after
fixing the fixture's object-vs-boolean check; original failure remains.
Actual CLI crash, FD/locks/no-regrowth, backup/storage and full cleanup/runtime
admission still require qualification.


Actual CLI interruption probe (2026-10-16; research fixture now decommissioned): private
`native-agent-replay-f5473183-f4fe-4df9-9b2d-d10ac61244e9` used real sandboxed
CLI and local deterministic provider. New Calculator correctly refused an
inactive upstream output before mutation. The research provider kept waiting on
that terminal refusal until the unchanged60s invocation deadline; measured run
is timedOut=true/interrupted=false, not an active-operation interruption proof.
Local CLI/admin settlement is confirmed, but a134-byte recovery `.tmp` keeps
`assertProfileSettled` closed. `finalizeSlotAttempt` refused archive-before-close;
no backend close, storage cleanup, next admission or normal release was granted.
Root `/home/kiselev/storage/tmp/evals-native-agent-ZjdFIE`, history
`/home/kiselev/storage/tmp/evals-native-history-V0RmVF`, server3167e2b4…,
studio7a62a607…, network84ae04a9… are retained with original evidence and pending
reservations. Do not unlink the marker or infer recovery from a dead PID. Needed:
source-qualified handling of pending stopped-writer history before native close;
current archive API intentionally requires a settled profile. Independently fix
the provider terminal wait and exercise an already linked Calculator so its
existing-node path can activate the bounded source without the new-node preflight.

Pending archive follow-up (2026-10-16): the primitive now archives pending history
after writer-marker absence and two fresh idle checks, preserving bytes/inodes
in its durable manifest. Unit RED→GREEN14/88 PASS24.77s; strict admission and native
closure authority remain separate. This resolves the archive-vs-admission
conflation, pending native finalizer rerun. Original f547 attempt has no normal release; its research namespace was later decommissioned as recorded below.
Additional original retained probes:2f0726d8-7274-4980-9007-e64ce2f25b9a, root
`/home/kiselev/storage/tmp/evals-native-agent-5FqIMa`, historyUURaKz, server56d46800…/
studio3d3d88d1…/network0447fd87… timed out at60s before execution; and
dc751ee6-eb90-4fda-9338-e4d4b7d73a38, root
`/home/kiselev/storage/tmp/evals-native-agent-fHXu1g`, actually interrupted on
Progress at77.681s (new scenario budget120s), backend active after local closure.
Both failed at the old archive barrier; their original records and histories are retained. Research resources were later decommissioned as recorded below.
They require source-qualified recovery; no PID-only or reservation unlink cleanup.

Native pending-history archive follow-up (2026-10-16): fixed path verified with
actual CLI interruption, not timeout. Private d9c44aac-e380-4d91-9194-5bd260e311b3
passed1/14 (180.97s), auditd10a7521…2191/168 with all source pins, continuous local
closure, backend still active afterward, preserved recovery bytes, committed
archive-before-close, exact agent/setup close and fresh absence. Own disposable
pair/network/root gone; history retained. This resolves normal-owner controlled
interruption/archive composition. It does not release f547/2f/dc old reservations
or qualify hard SIGKILL, FD/locks, no-regrowth, storage cleanup or admission.


Hard CLI crash follow-up (2026-10-16): the native replay case selected by
`--test-name-pattern 'is killed during server execution'` now sends SIGKILL only
to the unique admitted candidate executable in the exact slot scope, using
signalProcess with a fresh full-identity check. Private intent records identity,
owner/launcher and immutable native Progress trigger. Actual exit137 has neither
timeout nor controlled-interruption flags. Continuous local closure is followed
by fresh backend activity, committed pending-history archive, exact agent/setup
closes and fresh absence; both cleanup/admission grants remain false.
Native1/16 PASS184.30s; private5e699014… auditf8cbd6b2…2239 checks/183 sources,
29 causal frames and18 source/binary pins, SQLite-copy integrity, original archive
objects, admin transport/closure and exact own disposable pair/root absence.
The wrong-abort RED966365c1… failed safely; auditfdcf3641…2223/179 and all own
resources/root absent. Related22/160 PASS30.09s, signal identity/refusal3/6
PASS0.217s. This resolves the controlled hard-CLI-crash component; FD/locks,
no-regrowth, backup, full N2/live runtime and normal admission remain open.


Resolved research archive incidents (2026-10-16): own f5473183…/ZjdFIE,
2f0726d8…/5FqIMa and dc751ee6…/fHXu1g have been decommissioned. Read-only
preflight verified original actor inventories, continuous CLI/management/admin
closures, admin transport ACK and unchanged exact pair epochs. Public CAS acquired
recovery-only server and composite profile/user claims; durable archive preserved
pending history before public factory teardown. Fresh checks prove all9 original
container/network IDs and3 scratch roots absent. Original failed tests, old/new
lineage, factory commands/releases and SDK histories remain in private evidence.
Independent read-back: f547 auditfe65226a…1685/34,2f audit3de7c127…1864/36,
dc audita1f808b2…1875/34 (5424 checks/104 sources total), including original
archive inode/bytes, SQLite private-copy integrity, exact CAS lineage, persistent
global factory release proofs and current absence. Support scripts and9 public
controller source pins are bound to589f32a7ca. This disposal covers dedicated
research namespaces; normalRelease, storageDeletionAllowed and nextAdmissionAllowed
remain false. Production recovery, FD/locks/no-regrowth and live admission keep
their existing gates. Older unrelated incidents were preserved. Four duplicate
temporary logs were removed only after matching retained SHA256 copies.


Native package FD/flock follow-up (2026-10-16): a bounded read-only kernel
observer on the ordinary unprivileged research pair enumerates container
processes, brackets their births, and records scoped FD targets/stat/fdinfo,
raw maps and `/proc/locks`. The collector excludes its own PID. The native
package retains a PID1 sidecar `.progress-probe.lgp.lck`; fdinfo and both kernel
lock snapshots positively identify FLOCK ADVISORY WRITE on its exact inode.
After active bound CloseSession and fresh package absence, both post-close kernel
lock snapshots lack that tuple and no own-root descriptors remain; daemon birth
is unchanged. A directory FD appeared only in the earlier diagnostic sample.
Native1/65 PASS71.90s; private7b3fb852… audit77f25169…82 checks/28 sources+11
source/binary/input pins, both admin closures/transport ACKs and exact own
pair/network/root absence. Source start→native absence3640ms is a controller
observation interval. Related50/162 PASS25.04s, typecheck/shell syntax/diff PASS.
First diagnostic7d37a6a8… preserved its callback-shadowing failure and complete
metadata; audit18791214…82/28 checked teardown and recovered the minimal close
reply only through an exact immutable journal replyHash match. Its resources/root
are absent too. This establishes a positive package FD/FLOCK control. Durable
finalizer/cleanup consumption of fenced observations, B-active filesystem
controls, no-regrowth and
general workload coverage remain open; operationsQualified and cleanupAllowed
stay false. Final collector repeat7841a66a…1/65 PASS84.80s, auditf6eff982…
82/28+11 pins confirms the same native control with the newline fix (controller
source start→absence5567ms). A separate real child control3193c23f… RED→
4210e0e9… GREEN1/9 PASS30.52s qualifies exact trailing-LF FD targets and a
positive executable mmap; sentinel-preserving readlink fixes shell trimming.
Its independent audit9c9c3af9…61/16 preserves both verdicts/source snapshots
and proves all own resources/roots absent. This is collector visibility, not
a qualification of workload-wide quiescence. One never-started configuration
fixture was removed after retaining its manifest and confirming empty journals.


Fenced kernel evidence producer/reader is now implemented (2026-10-16) in
`src/server-files.ts`. Actual held-lease/raw-stream control c8719560… passes12
assertions; audit6a282b8a…78/22 binds both original boundary RED and GREEN,
8 tested sources each and full own resource/root absence. Source SHA, foreign
slot and closed guard controls refuse; malformed protocol tags/boundaries refuse
even with a recomputed hash. This resolves the durable point-observation gap.
Finalizer binding, operation/package accounting, no-regrowth/B-active filesystem
controls and actual cleanup consumption still remain; no grants were enabled.


Native setup health diagnostic (2026-10-16): text finalizer probe1e06a8e1…
failed PAIR_HEALTH_TIMEOUT before CLI admission (50.21s). Its exact research
Studio started06:44:34.538972912Z and logged Apache AH00489 ready only at
06:45:14.745396422Z (+40.206s),6.761s after the original failure log ended.
The read-only collector observed three later HTTP200/wsproxy=true responses,
no restarts/OOM, fixed images/nonce/CIDs; source GET errors were not retained,
so their type and the cause of late readiness remain unproven. Factory code
and30s budget were unchanged. Public createPair resumed this same configured
pair without restart, then public destroyPair released4 factory claims;
exact3 resources and own bpTCqq root are absent. Private disposald142b481…,
report30a2c352… and original failed verdict/sources remain. No slot or CLI was
admitted; the separate unlocated history directory was not touched. This is a
research setup refusal/decommission, not production cleanup or a passing test.


Finalizer kernel source binding is qualified (2026-10-16): hard-kill native
b5e3bb27…1/20 PASS237.31s/audit57566cdf…2304/219 and text5a6780c2…1/27
PASS161.10s/audit593d3fe8…289/121,20 pins each. Post-close source is mandatory,
causally ordered and replayed under current fences; corrupt/backdated points
refuse without silent refresh. Pending reconstruction creates one fresh point
after new absence; no duplicate CloseSession RPC. Related15/166 PASS56.49s,
typecheck/diff PASS. The original missing-field REDcd27cb3e… remains failed,
with independent2262/200 audit and complete research teardown. This resolves
terminal binding only: B-active filesystem/no-regrowth, complete operation/lock
coverage, SessionBackup, storage cleanup/release/unpause and production admission
remain open, with all grants false. Initial setup health refusal above is not a
passing test or a proven code regression; the new isolated text test passed.


Active A/B kernel control (2026-10-16): native607f0ea7…1/103 PASS94.56s;
independent auditbec18a5b…123 checks/38 sources+13 pins. Both active native
packages hold PID1 sidecar FLOCK on distinct inodes. Exact close A releases
its FD/lock while B retains the same sidecar inode, native session/package ID
and active Progress. B completes successfully9458ms after A close; its canary
SHA stays unchanged. Separate close B releases both own-root FDs and original
lock tuples, with the same daemon birth/epoch throughout. Both drivers and the
observer have native transport ACKs/continuous process closure; exact own pair,
network and root are absent. Twelve repo source snapshots and the pinned
candidate are retained. This test-only qualification passed existing runtime;
no artificial RED or runtime fix is claimed. Typecheck/diff PASS. Two duplicate
temporary files were removed after retained SHA read-back. Autosave no-regrowth,
general operation coverage, SessionBackup and cleanup/release/unpause remain
open; operationsQualified, storageDeletionAllowed and nextAdmissionAllowed
remain false.


Own-root FD finalizer refusal (2026-10-16): actual sandboxed text CLI/public
finalizeSlotAttempt RED700f7136…1 FAIL/16 assertions131.45s returned
sessions_closed while its post-absence kernel source still contained a real
non-daemon FD7 into A root. Original failed verdict/paused prefix and source
are retained; auditff62269e…232 checks/97 sources/6 causal+20 pins. A three-line
runtime gate now rejects ATTEMPT_SERVER_FILES_ACTIVE before terminal write.
GREEN5a3c024d…1/35 PASS174.82s confirms refusal, holder release via stdin/exit0,
then successful finalization with a fresh point. Changed hash/backdated point
refusals, stable replay and pending reconstruction still pass. Independent
auditad2bd5a1…298/130/7+20 pins verifies all3 point sources (the rejected source
is retained), no duplicate close RPC, original SDK/SQLite archives, continuous
actor/native transport closures and exact own pair/network/root absence.
Related process/session15/166 PASS60.14s, typecheck/diff PASS. Five duplicate
temporary files removed after retained SHA read-back. This refuses an observed
own-root FD; it does not qualify all mappings, operations, SessionBackup or
autosave no-regrowth. Storage deletion/release/unpause and production admission
remain closed, with both grants false.


Autosave crash research in progress (2026-10-16): RED72b91324… unsupported
phase is retained with audit a0591997…44/22 and exact own teardown. Initial
GREEN63059c76… failed before Loginom init; no-auth short→long→short confirmed
Chromium SingletonSocket108 bytes causes Socket path too long at TMPDIR63
bytes (diagnosis549495dc…). Original launch error was erased by the generic
adapter, so direct native error attribution remains inferred. Harness now uses
private fixture root49 bytes. Its own failed pair was decommissioned through
public factory (4 released claims/3 IDs/iomNdf root absent,24f9218d…); startup
dump/meta retained. A second diagnostic1df172fa… reached autosave but returned
unknown before writer proof, then process closure failed due unsupported
context/crash-browser-profile layout (10 exact birth-tracked binding refusals).
Corrected new context to attempts/autosave-crash/browser-profile. Original
failed proof is not repaired. QO5TL6 pair/root retained pending full original
process absence evidence and research-only decommission; no production grants.
Awaiting no-auth CDP crash-error control before next native attempt. This is
active debugging; no user action requested, no global restart/guard weakening.

Follow-up: fresh25 original process identities are absent (811edf44… plus
immediate pre-disposal check). Own QO5TL6 research pair/network/root have been
retired through public factory with4 released claims; original LGP/autosave
bytes preserved, original process proof remains failed. No-auth component
exposed unsupported Browser.waitForEvent (TypeError); switched new crash phase
to once(disconnected) with bounded Promise.all. Corrected CDP control pending.


Autosave/no-regrowth qualification completed (2026-10-16): native28ca68f5…
1/101 PASS180.55s, audit77f73737…123 checks/42 sources+12 pins. B runs a bounded
40s native node before A starts. A reads back PackageAutoSavePeriod5000ms,
creates real named/modified LGP+autosave, then its separate browser main
process crashes through CDP Browser.crash (372ms event). Bound CloseSession A
is followed by all-collection absence and own-root FD release before deleting
only the2 controlled regular nlink1 files via argv. Three raw empty NUL
listings/native package/kernel points span10817ms (2 actual periods). B keeps
its exact session/package/sidecar inode+FLOCK and canary SHA, then finishes
successfully after the window. Root canonical path/metadata/epoch stay stable;
both browser roots and all3 driver/observer/peer actors have qualified closures.
Own pair/network/root absent. Legacy A/B fa3c4190…1/103 PASS157.21s,
audite2b47872…123/38+13 pins; related admin/preflight/package50/162 PASS24.26s,
typecheck/syntax/diff PASS. Private verification retains all original RED and
diagnostic verdicts/source snapshots. Short private TMPDIR avoids the
component-proven63byte/108byte socket limit; strict attempts/id/browser-profile
layout remains required. Pinned Browser lacks waitForEvent; once(disconnected)
works while Browser.crash RPC remains pending, so only the event is awaited
under deadline. Scenario budgets240/120/90/70 include the40s B node and both
autosave phases; existing controls retain their deadlines. All3 own diagnostic
pairs/roots retired after qualified closure or fresh original-birth absence;
failed process proofs stayed failed. PAIR_REMOVE_UNKNOWN was reconciled by
public factory from the same durable lineage after exact Studio absence,
without restart. Nine duplicate temp files and one unnecessary copied browser
cache removed. This completes the controlled research test. Arbitrary user
traversal, SessionBackup, all-workload operation/mmap coverage, production
cleanup/release/unpause and admission remain open; both grants remain false.


## Text finalizer storage gate: first setup failed before RED — 2026-10-16

`native-agent-replay-343ea78a-304a-4c2a-aa0e-4a5e0d413aaa`: first
hardlink finalizer qualification stopped during `ensureProfile`, before agent
admission or the target storage assertion. Native test0 PASS/1 FAIL80.01s;
read-only `loginom status` exit0/timedOut=false/interrupted=false, continuous
process proof failed `Writer owner unavailable`. Unknown0/all3 own admissions
allowed/final verification0,0 do not repair the original error. Admin transport,
dispose and continuous closure confirmed. Runtime directories are empty, so
`observeWriterReleaseSettlement` refuses this source under its existing contract;
no guard weakening, synthetic closure or normal lease release is permitted.
The historical writer transition cause is unproven; this single result is not a
flakiness classification. Original log SHA256
`dc4f883557ba22e4ac8bf5937ecac8ba996bec7249e99a5775c4f20b61339a97`
and19 exact repo source snapshots retained privately. Own controller
`/home/kiselev/storage/tmp/evals-native-agent-wXSWjb`, pair nonce
`82f9bd00-81c4-46a4-b1bc-5371c345692b`; original failed verdict remains failed.
Read-only audit confirmed all16 original identities absent (1 management entry +
1 admin connection); exact report SHA256
`56fb5a2c3f6c33de9c1ebd0c902afc87de441d55b8c0cd113977e45565f997de`.
Public factory then destroyed only this pair without restart after exact epoch,
published inode and empty user-root checks. All3 immutable resource IDs and own
root are absent; disposal verification SHA256
`274cd92e68bb137822f172479471ee62674e2b6dcf0eb088f2d04d20b38852e3`.
Original failed proof/controller sources are retained privately; normal release,
storageDeletionAllowed and nextAdmissionAllowed remain false.

The unchanged second attempt `native-agent-replay-4347483f-7c78-49c7-8677-d87b744ee414`
also failed before the target assertion:0 PASS/1 FAIL130.88s. Status proof is
confirmed; setup exit0 but failed continuous proof has the same writer error,
unknown0/final0,0. Full union34 original actors is freshly absent. Original
settlement records cli=false/admin=true/historyArchived=false: ensureProfile
failed before initial archive; nonempty history is not an archive failure.
Private signal report SHA256
`33943d827fc1d313db94ab7ebf19b7c33b5e25e92e3da61e06175c799bbc5982`,
19 source snapshots and original log retained. Own root
`/home/kiselev/storage/tmp/evals-native-agent-wymvm9` is preserved pending explicit
research archival/decommission; failed proof is not repaired. This setup source
has a validation runtime directory, but settlement API eligibility was not fully
qualified or exercised. The exact writer transition cause remains unproven.

The third unchanged attempt `native-agent-replay-ac6fd528-1222-4790-81e4-87a8ac8ffe73`
reached the actual text agent (exit0, `Native replay complete`, no tools) but failed
its continuous writer proof before finalizer admission:0 PASS/1 FAIL/1 assertion
168.47s. Both management proofs and admin closure confirmed; failed agent proof
is stored twice byte-identically, counted once. Full original union40 is freshly
absent; runtimeDirectories=[]/unknown0/final0,0 do not qualify normal release.
Original root `/home/kiselev/storage/tmp/evals-native-agent-bgO18J` and initial
archive are preserved; the agent archive was not reached, not proven to have
failed. Private diagnosis SHA256
`75fdf2b2a856747c177cc76d7458566a47cc08d43389ffb70d7ae6b618cb8313`.
All3 original native failures and19 repo snapshots per case are retained. The
writer-error class recurred at status/setup/agent phases; exact root cause and
flaky classification remain unproven. These runs do not establish the intended
hardlink RED. Its pending test patch is retained at first incident evidence,
`pending-storage-finalizer.patch` SHA256
`3abb1be3e2454f00f23d79cb381b2f7c24d8cd64225164e37c76e6c7fa48e1b3`;
no missing runtime storage gate has been implemented from these failed setups.

Research retirement completed for434748 and ac6fd after fresh34/40 identity absence,
exact epoch/published root inode and empty own storage/backup observations. Existing
archiveProfileEvidence produced committed manifests before factory destruction;
all roots recursively match original metadata/hash. The actual agent SQLite family
passed quick_check and exact SDK session lookup on a private copy; originals are
unchanged. All6 immutable Docker IDs and both own controller roots are absent.
Private disposal audits:434748 SHA256
`46f05bbdcbb5b4a6e2f0ffbfd2d02997d059283c5a607815e2d945a68e77ce9f`,
ac6fd SHA256
`d81b7ef436ef7df5523e757c56dbb7ce26ce423a16a149dfdb4c134607ddc09a`;
28 checks each. Original failures/local reservations and archives are retained;
no proof requalification, normal release or production cleanup/admission grant.

A separate TDD diagnostic change now persists optional writerRefusal metadata;
59 supervisor-related PASS/3 existing nativeBusy SKIP/246 assertions, final
writer11 PASS/21, typecheck/diff PASS. It preserves original error/failed state,
budget and guard. Reader phase is not proof of the writer's actual historical
phase. Original3 native failures predate this instrumentation; the exact native
cause and intended storage gate still need a new instrumented qualification.
Private verification and source snapshots are in first incident writer-refusal/;
12 duplicate temporary logs/helpers were removed only after retained SHA read-back,
cleanup receipt SHA256
`ef8d3d41e545037f292c51f0b3056795a08f3e9df7d130f7a272a5732976a0f7`.

Instrumented fourth run ce3a9440 reached the intended storage RED after successful
management and agent process qualification:1 FAIL/18 assertions184.53s, terminal
accepted after a successful hardlink control. Native writer cause was not reproduced
or diagnosed by that success; original3 writer failures remain unresolved. Original
RED has exact ln/test source but no raw link stat, explicitly limited in source audit
SHA6ee9947fd8c81c28afd7f4f95a6cae48e20bf8b4f0f25fc21ed7dedb22bef4e1.
Minimal readonly finalizer traversal gate now has native GREEN67bf6231:1 PASS/39
assertions225.24s; actual NUL nlink2/refusal/no mutation, followed by valid retry,
replay and reconstruction. Audit SHA256
`13e20eec40fdbd77301309e05bc7994e0436f10c5b9726b34322af4b43c95fe7`,
324 checks/139 sources/8 causal points+21 pins. Both own factory teardowns completed;
raw native failures, histories/source snapshots remain. This closes only the missing
readonly topology gate; general storage deletion and production admission stay closed.

Normal browser regression64edcd81 is now1 PASS/25 assertions237.72s under the
unchanged240s budget: actual Loginom package material, continuous actor closure,
finalization/replay/sidecar reconstruction all pass. Audit SHA256
`c8fc089448ee789ebedaee01f642c24ca2753b493255f570030322631f65562e`,
1902 checks/160 sources/24 causal observations+21 pins. Related15 PASS/166
assertions61.77s; typecheck/diff PASS. All own RED/GREEN/regression pairs and roots
are absent; archived histories/source snapshots and original failed verdicts remain.
8 duplicate temp files removed after retained SHA read-back, cleanup SHA256
`79886755b9c142eabf914a5de1af5e0dd6ac087e6207e5afa1599d49cab72bec`. Writer root cause and general cleanup/backup/admission gates
remain open; no production deletion/release permission was emitted.


## Own-root file-backed mapping fence qualified; broader quiescence remains open — 2026-10-16

Native REDfd50f79a:1 FAIL/18 assertions144.58s, actual /bin/cat copy in A mapped
without an open FD into A. Five /proc/maps segments match the captured physical
inode; accepted kernel point after full native session absence still contains that
same mapper. EOF exits0, fresh mapping absence and unchanged inode recorded. Audit
SHA256 `bb89c0cb9e2d569d9cd25f27193a26f547515ef5570cb7c143e50de43dacf0ed`.
Five-line runtime pathname gate now has GREEN672886f3:1 PASS/37 assertions177.04s,
including actual space/Unicode/U+2028 pathname, refusal before terminal, valid retry,
replay and sidecar reconstruction; audit SHA256
`4105c9d60348f8b16d6c11f35486e26cefc0f16177203ad7f08c2c5da1ce9095`,
309 checks/133 sources/7 causal observations+21 pins. Existing FD/topology case
4edb2b66:1 PASS/39 assertions192.54s/audit SHA256
`6da34ebf0999f58ced07b0f6c1a5bcecc017b74d7054b7ca8b4a1608a513573b`,
301 checks/133 sources/4 causal observations+21 pins. Related15 PASS/166 assertions
60.46s; typecheck/diff PASS. No budget increase (aggregate240s/holder60s), no PID-only
signal: the mapper is released through its owned stdin EOF. All own9 immutable
Docker IDs and3 controller roots absent; actual SDK/SQLite archives, original FAIL
and exact tested source snapshots retained.7 duplicate temporary files removed only
after matching retained SHA read-back; cleanup receipt SHA256
`e7f3aa53dd87454eea5321a20a9f144f7813330eb5d64fb1fdb27a46193aec85`.
This qualifies observed own-root file-backed pathname mappings. Anonymous/relocated
mappings, broader operation classes, owned server-file archival/published-inode
cleanup binding, SessionBackup and production cleanup/release/admission remain
open. Historical writer errors are not diagnosed or repaired by these successes.


## Storage archive finalizer: first native probe timed out before RED — 2026-10-16

Original native `2203c0ce…` failed21 assertions/312.39s at the unchanged240000ms
aggregate deadline; Bun reported two dangling processes without their identities.
The intended storageArchive assertion was not reached. Last durable evidence is
third kernel frame10:30:47Z; the unresolved interval is captureServerFiles
post-write validation → inspectUserStorage → terminal publication. No terminal
or temporary terminal existed. Pinned attempt-finalization SHA
c1e67f72ec8f24ce104b16b21d1966cab8284ef0fd7cc506a85a68047d4ad28b
matches08c78cc863/b7a423d7a1; the archive producer was imported but not invoked.
No breaking commit, stable/flaky classification or root cause is established.

The diagnose-fix-tests signal collector preserved exact40 original identities
and their sources;40/40 were absent, with no read errors. Original admin dispose/
process finalization is missing and was not reconstructed as success. A bounded
readonly post-timeout storage scan subsequently passed5.006s with11 entries.
Exact recovery-only local server+slot CAS permitted a cold diagnostic: fresh A
sessions absent, fenced kernel capture and all-owned archive committed; original
SDK archive read-back passed. Fresh diagnostic admin disconnect/process closure
was independently qualified13 identities. None of this promotes the failed run.

Own research pair was decommissioned through the public factory after55 saved
actor/coordinator identity checks and idle profile scans. Controller/local lease
snapshots, source/binary pins, original verdict and SDK/storage archives remain
private. All3 immutable Docker resources and controller root are absent. Python
tar verification matched9 regular payloads and the exact neighbor symlink; private
SQLite-family copy quick_check/session query passed with original hashes intact.
Audit708c23f4b80ef680cfcbbdf105508eb0eb4b3df34af8069d893c397ad8f94bd5.
Normal release/admission/delete grants remain false. This is a retired research
incident, not a reason to reuse production reservations or weaken a deadline.

A separate focused archive test preserves the existing FD/topology cases and
uses the same240s budget. Native e183a9a4… reached the desired missing-storageArchive
RED:1FAIL/11 assertions162.53s, valid sessions_closed v2 receipt lacks the archive
reference. All3 resources/root absent, both native closures and SDK history
preserved; audit1e89c0ba6797ca98c76c4aedb11bd6cd8e496704a3f2aaf3851e4beb658290fc,
23 pins/20 exact text snapshots. Original RED has no retained raw physical root
listing; its fixed input/source pins and original terminal are preserved.
The new finalizer integration is undergoing GREEN qualification; the old timeout
cause remains unproven.
<!-- original-end eval_parallel_blockers.md -->

<!-- original-begin evals/AGENTS.md sha256=0111d824b0d15a3b9fda250b46880c91e8bd44a640c525b7c8ce70def36df905 -->
# Eval harness

## Контракт пользовательских слотов — 2026-10-13

Для нового режима нормативен [контракт v2](docs/parallel-users-contract.md), фактический статус —
[runbook](../docs/testing/loginom-ai-agent/parallel-evals.md). Реализация начата; live v2 ещё не квалифицирован. Без
EVAL_SLOTS_FILE остаётся legacy exclusive; прежние инструкции широкой очистки,
миграции стенда и R/operations/stand.lease ниже относятся только к legacy.
V2 создаёт новую пару на lg-pc-75 со своей сетью/портом; dev/legacy/remote
стенды, исторические results и pins начатых серий сохраняются. Marker по
/workdir/.loginom-evals-isolated.json имеет kind loginom-evals-users/version 2;
совместимый v1 не создаётся, старые broad-cleanup executors на новой паре запрещены.

Standalone prepare/verify выпускают доказанно чистые durable reservations и OS
guards; readiness не резервирует среду. Crash освобождает guard, но retained
reservation запрещает новый run. Recover требует incident/lineage/recovery-only
CAS и новых proofs; отсутствие PID не разрешает takeover. Постоянный root
/var/lib/loginom-evals/locks создаётся разовым bootstrap, prepare только проверяет
его; stateDir и env/config не переносят global fence. Архив history/БД/WAL/SHM/inputs
предшествует server close/readback; удаление только своего user root/backups
требует closure proof. Unknown outcome сохраняет данные/fence; restart сервера
для слота и широкая очистка запрещены. Admission failure до попыток — exit 2
и preparation receipt без measured summary; карантин после dispatch — summary/exit 1.

Node-evals выбирает архив по доверенному slot_id без fallback.
interrupted_cleanup — null без interrupted попыток, иначе OR profile_recovered
только interrupted попыток. Приёмка: немодельные session/ACL/backup/process
gates, затем полный LLM N=2 → N=1 и node-evals с неизменными pins/условиями.
Новые eval-прогоны используют openai/gpt-6-luna/high и судью gpt-6-sol/xhigh;
исторические модели/defaults ниже описывают прежние серии. Admin secrets/state
остаются вне mounts/env/results; shared model OAuth и private judge CODEX_HOME
проверяются отдельно. Skip и исторический PASS не доказывают готовность v2.

- Весь код harness живёт здесь; остальной репозиторий не менять. Runtime-зависимостей нет; dev-зависимости ставятся `bun install` в этом каталоге.
- Разработка строго по TDD (`/tdd`): один падающий тест поведения → минимальная реализация → зелёный → коммит. Тесты через публичные интерфейсы модулей из спеки; без моков и `globalThis.*`. Внешние процессы подменяются только `EVAL_CLI_MODE=fake`, `EVAL_ARTIFACT_SOURCE=dir:`, `EVAL_JUDGE_COMMAND`.
- Команды выполняются из `evals/`: `bun test`, `bun typecheck`, `bun run src/run.ts`. Из корня репозитория тесты не запускать.
- Контракт данных (статусы, `judge_status`, `failure_kind`, поля `summary.json`) описан в `docs/superpowers/specs/2026-09-18-evals-design.md`; при расхождении сначала правится спека.
- Секреты не попадают в `results/`, логи и сообщения ошибок. `results/`, `.profile/`, `.bundle/`, `.env` — gitignored.
- Живой судья (`codex exec`) в тестах не вызывается; проверяется через `fixtures/fake-codex.ts`.
- Отклонения от спеки, зафиксированные при реализации: `verdict.prev.json` лежит в `<attempt>/verdict.prev.json` (рядом с `judge/`, потому что `prepareJudgeDir` очищает `judge/`); логи судьи — `<attempt>/judge-events-<n>.jsonl` и `<attempt>/judge-stderr-<n>.txt`; в `summary.json` есть `loginom.container` и `loginom.storage_dir`, у попыток — `stderr_head`.
- Калибровка исключает requires_run. Positive с oracle.csv и near-miss с синтетическим CSV включают requires_result_file и oracle; чужой эталон и positive без oracle исключают result-пункты. Near-miss требует всех expected_failed и точного expected_oracle_pass; score/отказ oracle не заменяют обнаружение ошибки судьёй. Корпус и независимый пересчёт — calibration/ и script/check-calibration-corpus.py. Для подготовки требуются zip/unzip/xmllint; XML изменённых файлов проверяется после всех замен до пересборки архива и вызовов судьи. Невалидный XML или отсутствие xmllint дают exit 2. Python нужен только независимому пересчёту.
- Для новых прогонов с 2026-10-12 использовать судью `gpt-6-sol/xhigh` (`JUDGE_MODEL=gpt-6-sol`, `JUDGE_REASONING=xhigh`). Исторические результаты и pins начатых серий сохраняют прежнего судью. Калибровка новой модели пока не выполнена; прежняя приёмка не подтверждает её качество.
- Полная near-miss приёмка 2026-10-06: 183/183, gpt-6-astra/high, exit 0; SHA и хэши в [отчёте](../docs/testing/loginom-ai-agent/reports/2026-10-06-calibration-near-miss.md). При смене промпта весь корпус пересуживается; рубрики и ожидания не ослабляются ради прохождения.
- Дочерние процессы агента и судьи не наследуют `LOGINOM_*` / `EVAL_*` / `JUDGE_*` / `FAKE_CODEX_*`; агенту заново выставляются четыре базовых `LOGINOM_AI_AGENT_*`; v2 дополнительно задаёт `LOGINOM_AI_AGENT_EXPERIMENTAL_WEBSOCKETS=false` и только настроенный `auth.sharedDir` через `LOGINOM_AI_AGENT_SHARED_AUTH_DIR`, судье можно явно передать ключи через `judge.env`.
- В полном режиме preflight вызывает `checkStorage` (листинг `dir:` или docker-хранилища); ошибка — `EvalFailure` код 2.
- Если листинг остатков не удался, `storage_leftovers` в `summary.json` равен `null` (не пустой массив).
- Уточнения после review PR #61: процентные пороги конфигурации — целые `1..100`; `--version` судьи использует тот же фильтр окружения и явные overrides, что исполнение судьи; каталоги run/calibrate атомарно резервируются с уникальным суффиксом к прежнему префиксу; одинаковые basename в `inputs` запрещены до dispatch, плоские workspace-имена сохранены. Решения и проверки: [контрольная точка](docs/2026-10-12-pr61-review-fixes.md).

## Контракт изоляции live eval

- При настроенном v2 `auth.sharedDir` readiness проверяет публичный `providers status --provider <id> --format json` установленного CLI (`shared-oauth-status-v1`), а не local auth.json. Ответ допускается только при совпадающем provider, UUID generation, principal hash, boolean refresh requirement и успешном exit; ошибки не раскрывают raw provider output. Capability и успешный немодельный status не заменяют live OAuth/forced-refresh qualification.

- Решение и последовательность: [план](docs/2026-10-07-analytic-evals-isolation-plan.md). Отклонение от внешней спеки фиксируется здесь, чтобы изменения оставались внутри `evals/`: default `EVAL_CLI_MODE=source` сохраняется для совместимости конфигурации, но live-вызовы `main()` допускают только установленный binary CLI в обязательной Linux bubblewrap-границе. Это касается и node-evals/LAB-16; fake/dry-run, judge-only и калибровка не запускают оцениваемого агента и сохраняют свой путь.
- Агенту доступны только prompt, inputs текущей попытки, подготовленный writable-профиль и ресурсы продукта. Harness/судья, корпус, Git, исходный agent-validation, результаты и закрытый архив истории остаются вне mounts. Ошибка установки или исполнения границы — `harness_error`, остановка без судьи/retry/fallback.
- OAuth и `cli-profile.json` сохраняются на запись. После подтверждённого завершения процессов/recovery история **каждой** попытки (включая retry), БД с WAL/SHM и inputs переносятся в закрытый архив вне mounts. Это изменяет прежнюю политику долговечности в `profile.test.ts`: история долговечна в архиве, а не в рабочем профиле. Pending recovery или ошибка переноса запрещают следующую попытку.
- Live требует выделенный чистый Loginom и эксклюзивное окно endpoint без внешних отладчиков. Широкая очистка разрешена только после повторной проверки маркера подготовки, container ID, фиксированных корней и отсутствия host bind mounts. Прежняя адресная очистка остальных источников сохраняется; default container и `.env` не разрешают широкое удаление.
- Старый неизолированный и новый изолированный прогоны не являются контролируемым сравнением, даже если `compare` допускает его по модели/хэшам/судье. Архивная БД сохраняет доказательство модели LAB-16; параллельные live-приёмки на том же endpoint несовместимы с эксклюзивным окном.
<!-- original-end evals/AGENTS.md -->

## Независимое ревью новой редакции — 2026-10-16

Ревьюер `/root/parallel_plan_review`, отдельный контекст с новой целью и текущими
документами, только чтение. Вердикт: **Approved**. Проверены unit TDD, четыре
live A/B, N=1 → утверждение порогов → N=2, отдельный wrapper commit, сохранность
чужих правок и старых данных, запрос разрешения на удаления и остановка до
ответа владельца. Единственное замечание: admin должен открываться до startup
проверки остатков; порядок исправлен, ревьюер подтвердил устранение.
Это ревью плана и доступных интерфейсов, не runtime qualification. Тесты,
модели и Docker mutations в рамках этой редакции не запускались.

## 2026-10-19: урегулированный admin и каталог моделей

По двум отдельным разрешениям владельца: server/profile holds c21be2f8… сняты
через существующий CAS после прямых проверок; только controller/admin-5w8Hht
перенесён в evidence/settled-admin-c21be2f8-5w8Hht acceptance state.
1394 entries, байты/хеши/владельцы/inodes неизменны, удаления нет. Старые абсолютные
ссылки внутри evidence исторические; relocation note сохраняет соответствие путей.
A00yuH/прочие incidents не затронуты. Штатный startup14c5b7c6… затем подтвердил
cleanup и освободил собственные server/profile holds без изменения кода.
Предыдущий N=1 `20261019-063523-9d19375bf1-dirty-ZpDChg` остановился до модели:
встроенный каталог не содержал gpt-6-luna. Короткие resources PASS не являются
замером трёх задач. Штатный `models openai --refresh --verbose` под server/profile
locks двух профилей подтвердил точную модель и high.reasoningEffort=high,
0 model calls, cleanup/release confirmed. Cache обоих профилей SHA256
`59bcb39e34656fe40d3007de30361919dcbaff738a342f1f30f763e8cf4617bc`.
Private evidence в `/home/kiselev/.local/state/loginom-evals/acceptance-20261016/evidence/`:
`settled-admin-c21-relocation.json`, `reconciled-model-quarantine-20261019.json`,
`model-catalog-qualification-20261019.json`. Native admin/slot receipts сохранены.
Независимое ревью отклонило PID-only фильтр admin; frozen механизмы не развивались.

### N=1: служебная схема и потерянный proxy

Отказ до dispatch `20261019-065130-5af679f128-dirty-lEYoun`: models CLI добавил
только канонический `$schema`, verifyProfile ошибочно считал это drift.
5c93dafea9 нормализует только эту аннотацию in-memory;18/65 targeted PASS/TC,
независимое ревью Approved, другое schema/права по-прежнему дают drift.
Штатный startup8528019f… подтвердил cleanup и освободил брони.
Run `20261019-065630-5c93dafea9-dirty-A4xC5o` дошёл до агента и остановлен
по первому session.retry Forbidden/gateway. Summary честно содержит PROVIDER_RETRY,
resources passed, judge skipped; это не полный N=1. Slot/admin cleanup confirmed,
unknown[], архив истории сохранён. Новый child allowlist терял существующие
proxy settings; HEAD без auth/model: direct403, через local proxy405.
Восстановлен прежний sandbox proxy route с исключением URL credentials/query/hash/path;
CLI8/28+Linux sandbox1/2 unit PASS, typecheck/diff PASS, независимое ревью Approved.
Модельный доступ ещё проверяет следующий N=1. Старые incidents не затрагивались.
Private evidence: `profile-schema-*-20261019.log`, `proxy-routing-*-20261019.log`,
`reconciled-schema-quarantine-20261019.json`; результаты run и архивы сохранены.

### Урегулирование4fb и исчезнувший ancestry candidate

Владелец2026-10-19 разрешил archive/CAS4fb и самостоятельное решение последующих
технических блокеров при сохранении обязательных гарантий/утверждения бюджета N=2.
Повторные проверки:2 management+13 admin identities gone (две пробы), профиль idle,
сессий/серверных файлов/FD нет, SessionBackup пуст, identity/Pool подтверждены.
Собственные data/log, DB и точный stale registration marker сохранены в
`a/history/owner-recheck-4fb6d039-W6OLKv` нового acceptance state. Оригинальный
failed receipt SHA256 неизменен, данные не удалены, только server/profile holds4fb
освобождены прежним CAS; proof `evidence/n1-proc-race-owner-release-20261019.json`.
Public hasOwnedAncestry test реально завершённого child: RED ENOENT → GREEN.
При ENOENT/ESRCH отдельно проверяется исходный PID; только его отсутствие даёт
false, живой кандидат/ошибка доступа сохраняют отказ.9/48 targeted PASS51.84s,
typecheck/diff PASS, независимое ревью Approved. Proc-denial cases не запускались.

## 2026-10-19: первый N2 после утверждения бюджета

N1 DE1Srz прошёл3/3 judge100/cleanup confirmed, ресурсы/лимиты passed. Владелец
утвердил25 числовых границ, точная копия бюджета SHA2567b43211ba891232286e05e61c1844534cc7306ce03aa29aaa26077ce651380d7
записана до dispatch. N2 qAdMiN на HEAD50b28da4db завершён08:47:44Z со сводкой:
B filter/group100/cleanup confirmed; A calc no_artifact после ambiguous native
export и cleanup SESSION_STILL_PRESENT. CloseSession acknowledged и перечитывание
заняли15ms; fresh startup уже не обнаружил сессию (closed[]), после всех guards
удалил ровно свой input и result.csv. Все брони released; failed receipts не менялись.
Ресурсы:607 samples/0miss, host CPU95.9253%>95%; остальные24 границы, timeline/
incidents/provider+judge limits passed. Утверждённый бюджет не изменялся.
Private evidence: acceptance-20261016/evidence/reconciled-n2-quarantine-20261019.json
и results/20261019-083618-50b28da4db-dirty-qAdMiN. Следующий шаг — unit TDD
ограниченного ожидания exact readback после acknowledged close, затем повтор N2.
