# Release writer после открытия owner

Локальная A/B smoke-пара v6 прошла, но формальный baseline остановился ещё
в management preflight. Попыток задач и вызовов модели в formal0; приёмка
по90 попыткам не завершена. Продуктовые binary/resources49b1584f2 не изменены.

## Принятая функциональная пара

Frozen harness b4661a7b68fbad21726bd4d922a8c659165f8b11; common SHA256
`c07c876e618383b6428beb24f16819aba80c5c68f92d4c22a2f0dfb7564c4dd0`.
Baseline run20261008-204506-b4661a7b6 / candidate run20261008-205411-b4661a7b6:
оба completed/exit0/judge100/pass=true, структура/warm oracle/installed cold PASS.
Package/input bytes unchanged, settingsReapplied=false, close/logout/remaining0,
own cold containers removed. Серверный skill/action catalog/knowledge snapshot
после пары совпали с исходными pins; evals ref заново прочитан:b31ebe7d0.

Baseline/candidate:17/18 step-finish events,17/19 unique tool calls,0/1 skill,
13/13 Loginom calls. Smoke — функциональный контроль, статистический verdict
не заявлен. Evidence `ab-smoke-v6-{base,candidate,pair}-accepted-20261008`.
Закрытые histories/diagnostics сохранены с full roundtrip и restore receipts:
baseline4506 entries/15020315 bytes history,3 entries/3455785 bytes diagnostics;
candidate1928 entries/9134058 bytes history,3 entries/3999026 bytes diagnostics.
Raw result/events/judge/artifacts сохранены. Свободно около1.7GiB.

## Диагноз и исправление

Controller2749 завершён exit1; log `ab-local-stand-20261008/formal-v6-base.log`:
`Management cleanup failed: ENOENT ... statx ... base/profile/.writer`.
Отказ ensureProfile/profile.ts:102;280 до dispatch/conditions/result задач.
Точная историческая последовательность IO не записана; native stable/flaky
UNKNOWN. Текущие refs0/writer absent/pending absent/recovery0 не отменяют FAIL;
receipt `formal-v6-preflight-current-processes.json`, native calls в audit0.
Исходные loginom-server/client-7.4.2-test running и не переключались.

Collector выполнил ровно3 narrow runs четырёх прежних writer guard tests:
каждый4 PASS/0 FAIL/6 assertions. Они не покрывают release после owner open.
Final20 evidence files скопированы с exact bytes verification в
`formal-v6-writer-gap-signal-final-20261009`; ранний19-file snapshot сохранён
отдельно. Параллельные root test edits описаны в signal, исходники collector
не менял; причинный breaking SHA исторического native отказа не установлен.

Новый real-IO тест синхронизируется по открытому собственному owner-дескриптору
в /proc/self/fd и удаляет только созданный им writer directory во время чтения.
RED0 PASS/1 FAIL: тот же ENOENT/statx .writer; GREEN1 PASS.16MiB test owner
удерживает read в работе, файл/profile удаляются в finally; mocks отсутствуют.
Минимальное изменение writerIdentity:11 строк catch только ENOENT/ESRCH с
повторной проверкой directory. Исчезновение возвращает null; оставшийся guard
сохраняет dev/inode/symlink guards и прежние3 samples/two20ms waits. Постоянно
пустой guard и подмена остаются отказами; permission errors не скрываются.
Не добавлены writer deletion, неизвестные PID signals или live retries.

Три post-open cases (release, persistent empty, replacement) прошли каждый
из5 последовательных runs:3 PASS/0 FAIL/7 assertions в каждом. Все writerIdentity
guards PASS; typecheck PASS. Modules profile+process-supervisor session90146
завершены exit0:77 PASS/0 FAIL/241 assertions/168.25s. Harness commit
`495463543901f1a69888b8d6375cd77996ef157b` clean; protected diff0 против
fresh evals refb31ebe7d0 при исходной проверке.

## Полный suite и новая frozen-пара

Первый full suite session80830 завершён exit1:447 PASS/2 SKIP/37 FAIL/2 errors.
Хотя own TMPDIR в /dev/shm имел20GiB и executable probe PASS, preflight отдельно
проверяет cwd harness:640MiB ниже неизменённого порога1GiB.31 отказ прямо связан
с этим порогом; для6 downstream отказов связь поддерживается сигналом, но не
доказана независимо. Log writer-post-open-full-495463543.log и collector
full-cwd-space-signal-20261009 сохранены; ошибка подготовки запуска признана.

Освобождены только точные дубликаты собственных immutable файлов через hardlink:
26568 tracked файлов старых frozen worktrees,612 browser файлов в сохранённых
baseline/candidate CLI/Desktop resources,13285 tracked файлов нового frozen.
Сохранены пути/байты/права, проверены inventories/pins/clean Git до и после;
setuid chrome-sandbox исключён. Receipts frozen-worktree-dedupe-20261009,
immutable-browser-dedupe-20261009 и frozen-release-worktree-dedupe-20261009.
Эти immutable источники и ресурсы нельзя редактировать на месте. Чужие /tmp,
контейнеры, профили и исходные Loginom server/client не очищались.

Новый full suite session12760 завершён exit0:484 PASS/2 SKIP/0 FAIL,
2063 assertions/576.34s. Log writer-post-open-full-clean-495463543.log;
own fresh TMPDIR /dev/shm/loginom-skills-evals-495463543-clean-20261009,
receipt writer-post-open-full-clean-tmpdir.json; порог1GiB не изменён.
Оба TMPDIR и исходный FAIL сохранены. Сейчас около1.9GiB свободно на cwd.

Создан detached worktree skills-evals-release на
495463543901f1a69888b8d6375cd77996ef157b, bun install --frozen-lockfile и
frozen typecheck/session46440 exit0. Freeze прочитал свежий evals ref
992fca12badf209169f13b569b9bd291e4d70e99; protected diff0. Более поздние docs-only
изменения evals не подставляются в frozen; ref/pins повторно проверяются перед приёмкой.
Conditions ab-conditions-release-20261009/common.json SHA256
`a268a81e8b4ea163f50ac52ee99817559b3fab9a08ffc09652dc96c00fcd2ed4`:
658 harness files/281 task files/21 adapter pins,5389+5651 build files verified.
Те же15 задач, модели/параметры/judge/viewport, оба сохранённых CLI.

Baseline smoke v7 session30063 выполняется: sales-by-category dispatch подтверждён,
root ab-smoke-v7-20261009/base. Candidate/cold/formal v7 ещё не запускались.
Далее terminal baseline/review/cold, candidate warm/cold и лишь затем90 attempts.
Evidence private ab-local-stand-20261008; secrets/raw diagnostics в Git не внесены.

Evidence TDD в writer-post-open-{red,green,guard,all-guards,repeat-1..5,typecheck,modules}.log.
При смене harness SHA новая пара получает новый manifest и обе smoke стороны;
v6 PASS не подставляется вместо неё. Этапы5–8 открыты,stage9 отложен;
выбор вторичной модели всё ещё ожидается.
