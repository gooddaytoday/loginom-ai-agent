# Полная локальная проверка local-file-paths

Исходный HEAD: `299049c48101e479ea758da48cc34e592accef96`, база `loginom` `db13009886534c3d115096a9ad8e3575275381ec`. Владелец поручил запустить все доступные локально тесты и исправить падения тестов/кода. Предыдущие 507 адресных проверок не заменяют полные наборы.

## Порядок работы

1. Сверить package scripts, CI и модульные инструкции; сохранить матрицу команд/результатов в task-local evidence. Независимо проверить этот план до запуска. Не запускать root `bun test`.
2. Выполнить полные test scripts активных workspace packages из их каталогов; отдельно учесть пакеты без test script и вне turbo: runtime/client/tools, Desktop/CLI, evals и Python/script tests. Не выдавать выборочную проверку за полный набор. Проверить типы пакетными `bun typecheck`, generated-client и HttpApi gates.
3. Для Linux browser/native проверок использовать штатные pinned Node/Bun/Chromium, изолированный Xvfb и временные каталоги под `/home/kiselev/storage/tmp`. Проверить prerequisites и запустить доступные app e2e/performance/standalone smoke с собственными профилями/локальными тестовыми серверами. Исторические исходники вне активного продукта и проверки с обязательными внешними сервисами/моделью/иной ОС перечислить отдельно по фактическим требованиям; не подделывать evidence и не скрывать skip.
4. Собирать полные логи и exit codes. Ограничить одновременные тяжёлые наборы, чтобы subprocess budgets не терялись из-за нагрузки. Начальный полный набор не прерывать из-за одного падения: сначала получить все независимые сигналы. Зависший тест диагностировать отдельно; остановка не означает PASS.
5. Для каждого независимого падения: воспроизвести узко 3–5 раз, отличить кодовую ошибку, устаревший тест, flake и проблему среды; проверить diff/историю, при неясной стабильной регрессии использовать bisect в отдельном checkout. Исправлять первый неправильный переход, сохраняя гарантии обеих веток. Не ослаблять assertions/таймауты ради зелёного результата. Для изменения поведения — RED → минимальный GREEN → необходимое упрощение.
6. Повторить затронутый полный набор после исправления, а затем обязательные общие проверки. Для правок мигрированных файлов обновить соответствующие hashes/причины в source-transforms, сохраняя immutable source-map. Не чинить посторонние provenance mismatches без связи с тестом/изменением.
7. Провести независимое итоговое ревью исправлений и матрицы. В отчёте перечислить выполненные наборы, PASS/FAIL/SKIP/NOT_RUN, диагнозы/исправления, ограничения и точные команды. Сохранить checkpoint до20 строк; не объявлять installed/model acceptance по source/fixture тестам. Push/release не входят в поручение.

## Организация

- Runtime signal collector: полный client/runtime/tools набор, реальная доступность браузера, первичные падения и повторные узкие проверки. Исходники без отдельного назначения не менять.
- Основной агент: матрица остальных workspace пакетов, typecheck, evals, Python/scripts и локальные UI/e2e; распределение непересекающихся исправлений после классификации.
- Независимый reviewer: достаточность/простота плана, затем сохранность гарантий и подтверждение итогового покрытия. Комментарии обязательны только при проверяемом дефекте или конкретном риске.
- Перед каждым исправлением уточнить минимальную область и проверку; не вводить новый общий test harness в продукт. Task-local оркестрация допустима для команд и логов.
- Контроль среды: HDD в `storage/tmp` даёт median0,757с/max1,742с на запись4KiB+fsync файла/каталога (12 проб); тот же код на tmpfs — median0,000038с. Независимо одобрен task-local `bwrap --bind / / --dev-bind /dev /dev --proc /proc --tmpfs /home/kiselev/storage/tmp/l74t` с TMPDIR/TMP/TEMP на этой собственной пустой точке. Профили/fixtures остаются временными, логи и pinned binaries — вне mount; таймауты и проверки не ослабляются. Результат явно маркируется tmpfs; исходные HDD FAIL сохраняются.

## Дополнительный RED: writer-release settlement

После освобождения отдельного окна proc-denial8 дал7 PASS/1 FAIL; отдельные три повтора стабильны. Parent-held diagnostic с настоящим `observeWriterReleaseSettlement` подтвердил: currentUID/native comm, один живой PID/birth до и после вызова, exe EACCES, однако функция вернула confirmed за137мс. Источник — ancestry-based optional ignore из124d56dc039: он нужен ordinary cleanup, но скрывает relevant native и от более строгой проверки settlement. Существующий контракт strict native absence закреплён в `evals/docs/evaler/operations.md`; новый контракт не вводится.

Независимо Approved минимальный план: default-false внутренний strictNative у snapshot/processView только для settlement; при strict+relevant сохранить bounded retry/refusal, обычный ignore доказанно чужого protected процесса оставить. Прокинуть флаг через оба recursive retry; UID-проверку не менять. В существующем тесте держать собственный процесс до закрытия stdin с аварийным self-expiry10с, подтвердить native/EACCES/живую birth до и после отказа. Это контроль fixture lifetime, не расширение продуктового deadline.

RED3 → GREEN3; затем proc-denial8, полные три затронутых файла и Evals typecheck. После изменения общего модуля повторить полный Evals с включёнными proc-denial в единственном тестовом окне. Два заведомо неподходящих к private tmpfs/environment fixture явно отфильтровать: исчерпанный bridge pool и host bind, невидимый Docker daemon; host bind повторить на обычном HDD. Все исходные failures и отдельный BLOCKED_ENV сохранить. Никакие пользовательские браузеры/исторические Docker ресурсы не трогать.

## Checkpoint

- HEAD299049c481, база loginom db130098865; исходное дерево чистое, исправления не закоммичены.
- Evidence: `/home/kiselev/storage/tmp/local-paths-74-ptufs123/full-local-tests-20261027/`; итоговый отчёт — `docs/testing/loginom-ai-agent/local-file-paths-local-tests-2026-10-27.md`.
- План независимо Approved; workspace6898 PASS/56 SKIP/1TODO, включая Agent3857 PASS. Все34 пакетных typecheck и generated-client PASS; HttpApi3×208 PASS.
- Runtime/client/tools25843 PASS/74 SKIP/0FAIL; direct browser16 PASS; Python PID-fd настоящий. SDK129+50, service Node37 и historical-only Hermes11 PASS отдельно.
- Host396 PASS/6SKIP; Desktop163 PASS/5SKIP; Product5 PASS. Node/Electron draft-store, source build/startup/onboarding/crash/proxy PASS; installed app не менялся.
- App normal105/105, benchmark65/65+47unit, suspense3/3 PASS; три исправленных case GREEN3, covered types PASS, production App byte-HEAD; свои порты закрыты.
- HDD/fsync и нагрузочные failures сохранены; tmpfs wrapper независимо одобрен, исходные deadlines/нагрузки/guards не ослаблялись.
- HTTP Recorder pack slug исправлен, real consumer/unit/types PASS. Исправления тестов Agent/Core/Schema/Desktop/Python/App и affected provenance проверены.
- StrictNative settlement fix RED3→GREEN3/proc-denial8PASS/typesPASS; ordinary cleanup/UID/signaling сохранены. Busy-host oracle RED3→GREEN3; независимые reviews Approved.
- Финальный доступный Evals1235 PASS/20 SKIP/0FAIL,93файла,proc-denial включён; два кейса явно отфильтрованы, файлы не исключались.
- Финальный HDD: host-bind PASS, Docker network BLOCKED_ENV(default pools exhausted); исходный exit1 и unfiltered full1214PASS/30SKIP/13FAIL/1error сохранены. Исторические ресурсы не трогались.
- Source compiled startup1/1, preflight11/11, native browser2/2 и kernel PIDreuse1/1 PASS; shared opt-in INVALID_CANDIDATE, feature намеренно удалена; nativeBusy сохраняет3SKIP.
- Независимый итоговый reviewer нашёл stale App tsconfig include; исправлено, TSfilelist RED→GREEN/typecheck PASS. Финальная сверка diff/отчёта/логов APPROVED; открытых обязательных замечаний нет.
- Работа завершена; изменения оставлены незакоммиченными для владельца. Release/push/installed/model acceptance не выполнялись; ограничения и исходные failures сохранены в отчёте.
