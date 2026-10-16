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
