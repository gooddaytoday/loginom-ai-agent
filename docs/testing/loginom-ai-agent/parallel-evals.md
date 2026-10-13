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
