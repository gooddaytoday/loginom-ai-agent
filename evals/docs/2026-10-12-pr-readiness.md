# PR evals → loginom — 2026-10-12

[PR #61](https://github.com/gooddaytoday/loginom-ai-agent/pull/61).
База: `loginom` `a3d8e294763342edc4bb0a6e194ea5afa6a63304`.
Исходная ветка: `41bbb1fa73f4e7b61b742ac1ec90f3361a37cc07`;
она уже основана на этой базе. Подготовка выполняется в отдельном checkout;
незакоммиченные файлы основного рабочего дерева сохраняются.

## Согласованный объём CI

По уточнению пользователя в CI включены **только unit-тесты инфраструктуры evals**
и проверка типов. Job `evals-unit` находится в reusable `test.yml`, поэтому
входит в push/PR и candidate gates. Bun 1.3.14, pinned Node 24.19.0,
frozen `evals/bun.lock`; системные зависимости только для offline fixtures.
`bun run test:unit` выбирает 49 файлов; четыре набора Docker/bubblewrap
(`isolated-storage`, `node-eval-ops`, `node-skill`, `sandbox`) остаются
в полном локальном `bun test`. Живые Loginom/модель/судья в CI не запускаются.

`local.env` добавлен в `.gitignore`.

## Локальная проверка и диагноз

- Frozen install и `bun typecheck` — PASS.
- `python3 script/check-calibration-corpus.py --tasks tasks/analytic` — PASS:
  35 задач, 114 кейсов; это независимый пересчёт данных, а не калибровка модели.
- `bun run src/run.ts --dry-run --repeat 1` — exit 0; ожидаемые fixture FAIL
  и `no_artifact` сохраняются в отчёте без обращения к живой модели/серверу.
- Первый полный `bun test` — 549 PASS / 5 SKIP / 4 FAIL, 558 тестов,
  53 файла, 627 с. Три отказы связаны с открытым Chrome; четвёртый —
  transient host process identity observation в process supervisor.

Три clean-stand случая (`writer-settlement` × 2, `owned-registration` × 1)
падали 3/3 на занятом host с `Writer-release processes busy or foreign` и
проходили 3/3 в чистом PID namespace. Native guard и исходные settlement-тесты
введены вместе в `96ca26ea4a`; owned registration — `eeeea57d9`.
Продуктовый guard корректно запрещает чужие native processes. Тестам добавлено
явное условие чистого окружения; assertions и тесты foreign-process rejection
сохранены. После изменения: занятый host — 18 PASS / 3 SKIP / 0 FAIL;
чистый namespace — все 3 PASS / 0 FAIL.

Отказ `supervisor: helper в свежей доказанной browser session не теряется после reparent`
в первом наборе связан с `Cannot inspect process identity` чужого, не входящего
в owned ledger PID. Helper ancestry, admission и browser binding в evidence
подтверждены; неизвестный эффект не замаскирован успехом. Пять последовательных
узких повторов — 5/5 PASS. Точная исходная syscall-причина после исчезновения
чужого PID неизвестна; код fail-closed сохраняется. Собственный оставшийся
compiled fixture browser удалён через экспортированный `signalProcess` только
после совпадения birth/executable/device/inode/UID/group/session; исходный failed
receipt сохранён. Подвид ошибки не объявляется исправленной продуктовой регрессией.

Итоговый полный набор запускается последовательно в локальном PID namespace:
`unshare --user --map-current-user --pid --fork --mount-proc bun test`.
Mapping сохраняет текущий UID и обычные права при exec; отдельная проверка
недоступного native process, protected fixture и helper дала 3 PASS / 0 FAIL.
Настройки sysctl и рабочие браузеры пользователя не менялись.

Первый изолированный полный набор: **557 PASS / 1 FAIL**, 558 тестов,
53 файла, 573 с. Отказ другого supervisor-теста сохранил `Cannot inspect process
identity` собственной CLI вместо ожидаемого отказа неизвестного helper.
Пять узких повторов и дополнительный повтор прошли. Гипотеза UID zombie
не подтверждена независимым fork/waitid probe на host и в namespace;
проверки UID/birth/permissions не менялись.

Для следующего воспроизведения `processView` сохраняет исходную `/proc` ошибку
и `cause` в диагностике, без argv. Тест постоянного отказа доступа сначала
дал RED на отсутствии errno в сообщении, затем GREEN; процесс остаётся жив,
сигнал не разрешается. `bun typecheck` — PASS. Полный процессный файл после
изменения — **19 PASS / 0 FAIL**, 86 assertions, 93 с. Точный syscall исходных
двух редких отказов не установлен; финальный полный rerun требуется.

Полный rerun с новой диагностикой: **557 PASS / 1 FAIL**, 558 тестов,
53 файла, 577 с. Оба прежних supervisor-случая прошли; единственный отказ —
sandbox fixture, ожидавшая только `sleep` вместо уже отклонённой `dash`.
Shell может быть наблюдена/усыновлена раньше фонового sleep. Пять узких повторов
старого теста проходили; отдельные controlled probes доказали оба допустимых
native-refusal состояния. Исправленный тест сохраняет исходную shell fixture,
требует failed/complete capture, unknown identities строго sh/sleep, точный
refusal на неизвестный PID и non-allowed admission; binding refusal дополнительно
сверяется по birth и executable mismatch. Inspection fault не принимается как
штатный refusal. Весь sandbox-файл × 5: **40 PASS / 0 FAIL**, 200 assertions;
`bun typecheck` — PASS. Adoption отдельно покрыто последним supervisor-тестом.

Итоговый полный набор на `3ce4ae1381168a6ff48957b831470d0aefcea07b`:
**558 PASS / 0 FAIL / 0 SKIP**, 2873 assertions, 53 файла, 573.77 с.
Команда — `unshare --user --map-current-user --pid --fork --mount-proc bun test`
из `evals/`. Прежние два inspection-отказа не повторились; assertions, retries
и native identity guards не ослаблялись. Их точная исходная причина не установлена;
добавленная диагностика сохраняет cause для нового воспроизведения.

`actionlint` 1.7.10 проверяет изменённый workflow с единственным исключением
для существующей функции `case`, неизвестной этому валидатору; GitHub принял
workflow и запустил jobs. SHA-256 скачанного официального actionlint проверен.

## GitHub checkpoint

Первая кандидатная сборка: [run 38250159901](https://github.com/gooddaytoday/loginom-ai-agent/actions/runs/38250159901),
`mode=candidate`, `channel=prod`, commit `441bc032b84910516fae9eceb80703c92b254ffd`.
Release/tag/publish не создаются. Окончательный candidate и статус PR
будут закреплены после завершения исправлений.

Текущий product candidate: [run 38251472380](https://github.com/gooddaytoday/loginom-ai-agent/actions/runs/38251472380),
source `525ad4ff64bef76704f2be5fbb9fbfb99eaad1bb`. Последующее изменение
касается только диагностик harness и теста; `packages/`, pins и build scripts
после этого candidate не изменялись.

На `525ad4ff6` job `evals-unit` прошёл: **502 PASS / 0 FAIL**, 49 файлов,
426 с; native Windows PR build и Windows product candidate также прошли.
Linux product build остановился до компиляции продукта: Setup Bun выбрал
плавающий Node 24.21.0, `node-gyp` 12.4.0 упал с `undici assert(!this.paused)`
при HTTP-скачивании Node headers для tree-sitter-powershell.
Общий Setup Bun закреплён на `.node-version` (24.19.0); POSIX native dependencies
используют headers установленной полной Node distribution через документированный
`npm_package_config_node_gyp_nodedir`, без отдельного HTTP download.
Повторный candidate должен проверить этот setup на Linux и macOS. Windows сохраняет
свой native installer path; общая setup action использует тот же Node pin.

Исправление Linux setup проверено локальным `node-gyp` 12.4.0 configure с
установленными headers (локальный Node 22.16.0; это проверка механизма, не продукта).
На GitHub Desktop job `114835920690` из `3ce4ae138` подтвердил Node 24.19.0,
существующий header directory `/opt/hostedtoolcache/node/24.19.0/x64`, frozen install
и успешные Desktop tests. Новый полный product candidate:
[run 38256608207](https://github.com/gooddaytoday/loginom-ai-agent/actions/runs/38256608207),
source **`3ce4ae1381168a6ff48957b831470d0aefcea07b`**, `candidate/prod`.

Этот checkpoint сохраняет исходники и результаты локальной приёмки перед
окончанием внешних gates. Финальные job conclusions, CI URLs и снятие Draft
фиксируются в [описании PR #61](https://github.com/gooddaytoday/loginom-ai-agent/pull/61).

Candidate `38256608207` завершился **SUCCESS**: все 15 исполняемых jobs прошли;
`cut` и `release` штатно пропущены для candidate. Linux, macOS и Windows builds,
общие unit/typecheck/Desktop/E2E, `evals-unit`, native Chromium/cleanup прошли.
Артефакт `loginom-linux-matrix` прочитан: Ubuntu 22.04/24.04/26.04,
Debian 12/13 — **5 PASS / 0 FAIL**, offline non-root launch.

На документирующем head `4d9e3dfa` один PR unit-job
[114841464129](https://github.com/gooddaytoday/loginom-ai-agent/actions/runs/38258080537/job/114841464129)
нестабильно отказал в Host test `during-admission` с `LOGINOM_SCOPE_DENIED`.
Другой unit-job того же head и candidate unit прошли; исходный узкий тест × 5
также прошёл. Тест немедленно готовил замену после uncertain kill, хотя supervisor
может отклонить IPC request на disconnect раньше фактического exit.

Controlled probe (disconnect, затем SIGKILL через 50 мс) даёт **3/3 RED** на
первой повторной подготовке: `LOGINOM_CALL_UNCERTAIN`, прежний runtime ещё retained.
Ожидание `exited` захваченного собственного runtime даёт **5/5 GREEN** с исходными
assertions. Точный CI `LOGINOM_SCOPE_DENIED` этим probe не воспроизведён;
регрессия Host не установлена. Owning test теперь ждёт actual exit перед заменой
и отдельно покрывает disconnect-before-exit; все ограничения числа перезапусков,
отказы и журналирование сохранены. Четыре варианта × 5 — **20 PASS / 0 FAIL**,
175 assertions; package `bun typecheck` — PASS.

После candidate меняются отчёт, план и только Host test. Продуктовый source,
harness, pins, lockfiles и build workflows идентичны собранному tree.
CI нового head должен завершиться до снятия Draft; финальные conclusions
записываются в описание PR без нового документирующего push.

## Границы доказательств

Пропуски окружения не являются PASS. Unit gate не заменяет Docker/bubblewrap
наборы или live eval. Исторический live smoke и его ограничения сохранены
в `2026-10-12-rebase-live-smoke.md`; новый полноценный live baseline и
калибровка нового судьи в этой подготовке PR не выполняются.
Native CI/static/offline builds не означают установленную live GUI-приёмку
на пользовательских машинах. PR не сливается автоматически.
