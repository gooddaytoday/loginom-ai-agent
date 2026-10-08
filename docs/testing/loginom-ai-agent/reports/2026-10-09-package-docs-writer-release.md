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
fresh evals refb31ebe7d0. Full suite session80830 выполняется на чистом commit;
новая frozen-пара ещё не принята.

После source modules свободно641MiB. Для full suite создан новый собственный
TMPDIR `/dev/shm/loginom-skills-evals-495463543-20261009`:mode700/UID1001,
20GiB available, mount executable подтверждён запуском своего /usr/bin/true copy.
Receipt `writer-post-open-full-tmpdir.json`; старые `/tmp` данные не очищались.
Suite пишет только новые fixtures в выделенный root; этот тестовый environment
зафиксирован отдельно и не меняет conditions живой пары или продуктовые сборки.

Evidence в `ab-local-stand-20261008/writer-post-open-{red,green,guard,all-guards,
repeat-1..5,typecheck,modules}.log`. При смене harness SHA новая пара должна
получить новый manifest и обе smoke стороны; v6 PASS не подставляется вместо неё.
Этапы5–8 остаются открыты, stage9 отложен; выбор вторичной модели всё ещё ожидается.
