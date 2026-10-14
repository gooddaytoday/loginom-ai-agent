# Runbook параллельных evals по пользователям

2026-10-13: контракт принят, реализация начата; live v2 ещё не квалифицирован.
Нормативный источник — [контракт](../../../evals/docs/parallel-users-contract.md),
интерфейсы/команды/gates — [план](../../superpowers/plans/2026-10-13-evals-parallel-users.md).
Команды из плана становятся применимы только после реализации соответствующих
задач; документ не подтверждает готовность скриптов или текущего стенда.

Рабочая база `evals-parallel@b54455e187fb0a728787263e17a1adc828d77221`.
Один исполнитель текущей задачи владеет всеми файлами таблицы владения плана;
сведение run.ts выполняется последовательно. Семь исходных untracked-файлов
не включаются в коммиты; node-selection работает в отдельном worktree 4118.

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
