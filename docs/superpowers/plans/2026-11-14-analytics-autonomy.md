# Автономные аналитические evals — план реализации

## Результат

Согласовано владельцем: подготовить и проверить инфраструктуру до передачи одной
Multica-карточки в Backlog. После In progress существующий squad «Аналитические
evals Loginom» на runner2 самостоятельно создаёт пять новых пар D/B, сохраняет
десять единственных контрольных исходов и выдаёт проверенные изменения для
публикации. Уточнение владельца: push и PR он выполняет здесь после завершения
карточки; GitHub credential на runner2 и draft PR не требуются. Одна ветка
`analytics-autonomy` объединяет подготовку и последующую работу. Merge и выпуск
также выполняет владелец. Основание — принятый план в текущем чате и
[пилот](../../testing/loginom-ai-agent/analytics-pilot.md).

## Ограничения

- Author/Reviewer: gpt-6.1-sol/xhigh. Авторский CLI: openai/gpt-6.1-sol/xhigh,
  до трёх попыток по 1800s на кандидата, общий бюджет D/B. До пяти замен,
  максимум десять кандидатов; принятых пар ровно пять. Неудачи сохраняются.
- Judge: gpt-6.1-sol/xhigh. Positive >=90 + oracle; foreign своей формы <=40;
  near-miss выявляет предметный expected_failed и точный oracle outcome.
- Контроль: openai/gpt-6.1-terra/high, 1800s, parallel=1, repeat=1. Начатый
  FAIL/NULL терминален. Повтор только при доказанном отсутствии model admission.
- Данные синтетические; D/B идентичны по данным, определениям, oracle и rubric.
  Подробная форма раскрывает способ. Новизна проверяется против legacy/P/R/A.
- Снимки памяти охватывают только разрешённые User/Peer roots текущей identity.
  Credentials, адреса среды, сырые логи и полный provenance остаются вне Git.
- До трёх обоснованных ремонтов блокера; 24 часа без прогресса — честный blocked.
  Недоступность внешнего сервиса не разрешает обойти ownership/cleanup.

## Шаги и проверяемые результаты

- [x] **1. Подготовка и восстановление.** До management-процесса prepare/verify
  сохранить подтверждённый UnitBinding. Использовать существующий post-exit
  observeUnitExit; не изменять глобальный terminalCensus. Проверить известный
  cleanup denial при живой посторонней unit, отказ живой своей unit/неверной
  invocation и старого журнала без binding. Результат: адресное восстановление.
- [x] **2. Авторинг и публикационные артефакты.** Атомарно резервировать каталог
  авторской попытки; конкурентный запуск не перезаписывает evidence. Финализатор
  сохраняет полный provenance приватно, публичный формирует безопасным сразу.
  Результат: поведенческие тесты конкуренции и приватности проходят.
- [x] **3. Cold и sole measurements.** Перенести проверенные приватные callers
  пилота в узкие команды: cold rerun и run-analytics-measurements.ts поверх
  runPreparedSlots. Manifest задаёт 2/8 упорядоченных jobs, pins, units и memory
  scope. Lock + атомарный launch intent + native journals, без второго workflow
  journal. Adopt active/terminal unit, сохранять FAIL/NULL; unknown запуск — hold.
  Для доказанного zero-admission допускаются до трёх заранее закреплённых retry
  bindings (свои unit/resultsDir), immutable authorization, проверка всей истории
  в controller и worker и отдельный gate release судьи. Общие locks исключают
  параллельный ремонт. Для отказа budget до native journal допускается отдельная
  post-exit classification: точный terminal binding с сохранённой invocation,
  исходные metadata/SHA и journald, закреплённая execution revision, пустой
  canonical resultsDir и полный scan без native journals. Источники включаются
  в ту же immutable authorization и повторно проверяются controller/worker.
  Это закрывает подтверждённый преджурнальный отказ без ретроспективного native
  journal; неоднозначные исходы сохраняют hold. Общий release gate сохраняется.
  Временные browser recovery tools проверяются через qualified product predicates
  и source pin: последовательное соответствие CLI calls и native ledger,
  подтверждённое завершение lease. Обычный retained и доказанная tool-level
  ошибка допустимы; неизвестный эффект остаётся hold, исходный FAIL сохраняется.
  Полные before/after snapshots и audit каждой попытки. Результат: restart,
  unknown admission, cleanup, память и cold проверены; run-campaign не меняется.
- [x] **4. Инструкции и установка.** Обновить Git и live роли существующих
  Author/Reviewer, убрать pilot hardcodes и зависимость от Root. Подготовить свои
  Authoring/Benchmark/judge, auth, CLI с palette repair, browser/Knowledge/memory,
  scoped root-owned units, hooks/Gitleaks. GitHub-публикация выполняется владельцем.
  Native handoff, blocked и periodic 7200s; дополнительного task.failed нет.
  Результат: read-back конфигурации и noninteractive действия из Multica runtime.
- [x] **5. Репетиция и передача.** Через Multica выполнить принятую историческую
  пару в private fixture: author, cold, calibration, D/B, review, доставка
  проверенного binary patch и Git bundle через штатное вложение Multica. Она не попадает в коллекцию и десять контролей новой карточки. Проверить
  wakeup/restart без дублирования, затем передать единственную готовую Backlog
  карточку без запуска её пяти новых пар. Результат: readiness доказана.

## Работа основной карточки

Author предлагает пять новых механизмов, Reviewer принимает новизну/native/oracle.
Начальные кандидаты: тарифные интервалы, Cohen kappa, train-only MASE,
наибольшие остатки и Benjamini–Hochberg; команда вправе заменить до авторинга.
Первую пару провести целиком, получить independent APPROVE, затем остальные
четыре: native reference + полный CSV + cold, одна blind-B в чистом контексте,
пакетная calibration четырёх ID каждой формы. Контроли: D/B, B/D, D/B, B/D, D/B.
Постановки/oracle/pins заморожены до соответствующей серии.

Финал: ровно 5 D + 5 B, validation/calibration PASS, 10 учтённых исходов (низкий
балл допустим), cleanup, independent SPEC+QUALITY APPROVE, локальные проверки и
проверенные commit/binary patch/Git bundle и отчёт для владельца. Перед вложением
сканировать только свои staged изменения; архив содержит только разрешённые
Git-артефакты и обезличенный отчёт. Проверить скачивание вложения и SHA256.
Read-back итога и отключение только своих wakeups. Authoring, история
и неудачные попытки сохраняются. Ошибка доставки не повторяет измерения.

## Проверки, размер и исключения

План независимо проверен до реализации. Тесты выполняются из evals по TDD,
package-local bun typecheck; перед коммитом hooks + pinned Gitleaks + secrets
staged. Целевые проверки сборки и независимое ревью затронутого кода обязательны.
Инфраструктура: 15–22 файла / 1000–1600 строк с тестами/документацией; будущие
evals: около 140 файлов / 5000 строк + LGP. При удвоении оценки пересмотреть подход.
Исключены новые handlers, shared OAuth, универсальный orchestrator/scheduler,
чужие кампании, merge и выпуск.

## Checkpoint

- Ветка `analytics-autonomy`; инфраструктура принята полной репетицией LAB-1676, история и исходные отказы сохранены.
- LAB-1677 завершена done: приняты все пять новых пар D/B, final independent SPEC+QUALITY APPROVE без обязательных замечаний.
- Штатный старт, routed Author/Reviewer handoffs и periodic7200 подтверждены; все девять runs completed, активных нет.
- Оба собственных main wakeups отключены; правила репетиции также отключены, чужие ресурсы не менялись.
- Ровно пять started author attempts, без замен; BH выполнена отдельной parentless blind-B с закреплением ответа до oracle-check.
- Native reference и cold всех пяти PASS: полный новый CSV, неизменный LGP, все ветви, noSettings/noSave и close/logout.
- Calibration sol/xhigh PASS: 104 judgments / 110 фактических judge-вызовов с сохранённой историей.
- Ровно десять measurement и десять preflight admissions, retry=0; десять независимых Terra/high сессий.
- Девять controls — score100/oracle=true; MASE business — сохранённый FAIL/0/no_artifact, CLI exit1, без повтора.
- Причина отсутствия артефакта MASE B не установлена; исход не подменяет качество принятого eval.
- Native audits/recovery/release PASS, 40 bindings terminal; две terminal reconciliation code0 без новых admissions.
- Все 18 полных actor snapshots равны; scope разрешённых User/текущего operator Peer, runtime MCP Peer isolation не доказана.
- Принятый commit/patch/bundle доставлен вложением, download/read-back и SHA256 архива и компонентов проверены.
- Исходный итоговый коммит runner2 перенесён локально fast-forward; все 174 принятых файла совпали, subject review не повторялось.
- Коллекции локально валидны: по 43 задачи, по три прежних предупреждения; новые пять пар без предупреждений.
- Полный offline suite на закреплённом Bun: 1377 PASS / 68 SKIP / 0 FAIL; typecheck и оба corpus192 + legacy114 PASS.
- Совместимость checker с объявленными endpoint mutations восстановлена; GUID узлов/связей и точные source pins сохраняются.
- Локальная подготовка к публикации и ремонт совместимости checker: [план](2026-11-15-analytics-publication.md).
- Новых live авторских, судейских или контрольных вызовов при переносе нет; GitHub CI выполняется после push владельцем.
- Push/PR, merge и выпуск остаются владельцу; GitHub credentials на runner2 не требуются.
