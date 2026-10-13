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
