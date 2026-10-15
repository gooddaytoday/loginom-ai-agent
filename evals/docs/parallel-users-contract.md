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
