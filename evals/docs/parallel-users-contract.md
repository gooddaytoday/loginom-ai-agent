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
пересечения с protected roots запрещены. Принимаются только offline command
incidents с qualified closed proofs. Slot/admin recovery, prepare/verify/status
и active-child recovery ещё открыты.

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
