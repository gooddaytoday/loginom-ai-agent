# EvalBaseline: завершение подготовки, запуск и сопровождение — Implementation Plan

> Для исполнителя: выполняй пункты последовательно, отмечай проверенные результаты. Для изменения поведения используй `tdd`: падающий тест → минимальное исправление → проверка → коммит. Работу ведёт этот основной чат; независимые проверки можно делегировать. Новое подтверждение для предусмотренных планом действий не требуется.

**Goal:** завершить подготовку EvalBaseline, **создать новую карточку Multica и запустить её в работу**, получить по три измеренных результата каждого кейса и сопровождать исполнение из основного чата через `/loop 30m` до проверенного полного baseline.

**Architecture:** EvalBaseline последовательно исполняет закреплённый корпус под одним общим lease. Основной чат каждые 30 минут проверяет фактическое состояние, самостоятельно устраняет подтверждённые инфраструктурные причины и организует добор только недостающих измерений. Все исходные результаты, ошибки и дополнительные исполнения сохраняются; отдельные smoke не входят в baseline.

**Tech Stack:** Bun/TypeScript, существующий eval harness и node runner, Multica CLI/API, SSH, Docker, bubblewrap/AppArmor, OpenViking, `/loop` с доставкой пробуждений в основной чат.

**Spec:** согласованный пользователем план «Подготовка EvalBaseline к полным прогонам»; [runtime](baseline-runtime.md), [инструкция агента](evalbaseline.md), [checkpoint](evalbaseline-checkpoint.md), [операторские команды](evaler/operations.md), [контракт изоляции](2026-10-07-analytic-evals-isolation-plan.md).

## 0. Дождаться завершения LAB-31 и свободного стенда — выполнено

- [x] LAB-31 принят на `958b7aaac2bdea0c21f6a8e8dfd51cc090564dad`: Ben ACCEPT, Evaler подтвердил evidence и перевёл карточку в `in_review`; оба run завершены. Исходный чат завершил финальный readback, его мониторинг `lab-31-eval` подтверждён как PAUSED.
- [x] Проверены пустые очереди Rich, Ben, Evaler и EvalBaseline; общего lease нет, пять профилей прошли `assertProfileClean`, harness leases отсутствуют. Продуктовых процессов нет, Loginom storage пуст. Проверка 2026-10-08 19:05–19:13 MSK; перед активацией повторить.

## 1. Решения и границы

- Это план следующих работ. Сохранение этого файла само по себе не запускает карточки, smoke, baseline или мониторинг.
- При исполнении плана после готовности среды и двух smoke **перейти к полному baseline без отдельного повторного запроса разрешения**. Это предусмотренный новый этап после прежнего ограничения «при внедрении полный прогон не запускать».
- Агент Multica: EvalBaseline, `gpt-6.1-sol/xhigh`, concurrency=1, runtime `eval-tests`, вне squad.
- Продукт: установленный CLI **0.1.17**, source **`fc3d97dbf695c2ed8dba942feb6fe83591a33944`**, модель **`openai/gpt-6.1-sol/medium`**.
- Судья: **`gpt-6-astra/high`**, прежние prompt/schema, threshold=70. Продуктовая попытка — 30 минут, вызов судьи — 5 минут.
- Корпус определяется чистым закреплённым SHA: три последовательных круга, `repeat=1` на отдельный run. После принятия LAB-31 — 48 кейсов / 144 измерения (3 regular, 35 analytic, 10 node); фактический критерий — **N × 3**, где N взят из manifest. Новые принятые кейсы включить до замораживания новой серии.
- Один общий эксклюзивный lease на всю полную серию, включая паузы на восстановление и добор. Отдельные техническая проверка и каждый smoke получают собственные lease/release.
- Подтверждённый пользователем порядок восстановления: **добрать только недостающие измерения после устранения причины, сохранив все ошибки и неизменные пины**. Перезапуск всего корпуса для обхода инфраструктурной ошибки не является штатным восстановлением.
- Первое валидное измерение логической попытки фиксируется навсегда: PASS, FAIL, timeout и no_artifact с предусмотренной оценкой повторно не запускаются. Product FAIL совместим с полным baseline.
- Неизвестный исход запрещает новый продуктовый запуск до доказанного разбора. Отсутствие PID и истечение времени сами по себе не разрешают повтор или удаление блокировки.
- Окончательная инфраструктурная ошибка не является измерением качества. Product failure нельзя переименовать в infrastructure error ради нового результата.
- Правки продукта, кейсов, oracle, рубрик, модели, judge или условий изоляции не используются для улучшения текущего baseline. Изменение любого пина несовместимо с продолжением этой серии.
- Изменения кода и документации — только внутри `evals/`, ветка `baseline-runtime`; чужие checkout и незавершённую работу сохранять.

## 2. Точки продолжения и ответственность

| Объект | Значение |
|---|---|
| Основной чат-контроллер | `01a11a65-5025-7050-8d46-cee03e4023f3` |
| Локальный checkout | `/tmp/loginom-baseline-runtime` |
| Последний проверенный код / развёрнутый срез | `3ce983703bbeca5d759f1cd7bfc8b9a8196c7f64` / `53d03a35b0ee2901b40c1a1bbb0170804d59e865` |
| Проверки recovery и native helper | `077d0b5b109b182787d3964e46412e0e899fcc63` |
| Сервер / runtime root | `user@10.200.13.152`; `/home/user/.local/share/loginom-evals-runtime` (`R` ниже) |
| Собственный checkout | `R/checkouts/evalbaseline/loginom-ai-agent` |
| Собственная среда | `R/roles/evalbaseline/{eval.env,eval-profile,agent-work,work,results,judge-home}` |
| Общий private config | `R/operations/node-eval-ops.json` |
| Подготовленная конфигурация v2 | `R/evidence/node-eval-ops-v2-staged.json` |
| Единый supplement | `R/support/baseline-v2/evals/`; manifest рядом с `evals/` |
| Проект Multica | `Loginom node evals`, `de16c24b-4121-45c3-9f5a-e16ddabb90e8` |
| EvalBaseline | `77032943-ad18-4ae9-a2c6-668769077c86` |
| Runtime | `a5fa993f-2903-4997-a832-955ffbb1203c` |
| Подготовка и smoke | LAB-32, `01a11ae4-fa45-79ce-aec6-edd7170dafc7` |
| Карточка полного baseline | **Создать новую на этапе 7**, связать с LAB-32; не подменять созданием файла или сменой статуса LAB-32 |

Основной чат отвечает за изменения harness, активацию общей среды, мониторинг и устранение блокеров. EvalBaseline отвечает за исполнение серии, сохранение доказательств и отчёт; он не исправляет продукт или критерии оценки. Rich, Ben и Evaler сохраняют свои роли и порядок приёмки.

Уже проверено: полный CLI manifest — 5389 файлов, AppArmor/sandbox, setup READY, чистота собственного профиля, настоящий MCP search с actor scope и автоматическим Git Peer, Multica readback и доставка evidence. Последний полный локальный suite: 553 PASS, 9 clean-host SKIP, 0 FAIL; typecheck PASS. На выделенном сервере helper и writer/registration fixtures: 51 PASS, 0 SKIP, 0 FAIL, включая дополнительную native cleanup проверку. Это исходные свидетельства, а не замена проверки изменившегося состояния перед исполнением.

## 3. Подготовить недостающие возможности harness до живых запусков

**Файлы:** изменить `evals/src/baseline.ts`, `evals/script/run-baseline.ts`, `evals/src/node-eval-ops.ts`, `evals/src/config.ts`, `evals/src/run.ts`, `evals/src/node-runner.ts`, `evals/script/run-node-evals.ts`, `evals/test/baseline.test.ts`, `evals/test/node-eval-ops.test.ts`, `evals/test/config.test.ts`, `evals/test/infra-retry.test.ts`, `evals/test/node-evals.test.ts`, `evals/docs/baseline-runtime.md`, `evals/docs/evalbaseline.md`. Если восстановление оценки требует отдельной границы, добавить `evals/src/baseline-recovery.ts` и `evals/test/baseline-recovery.test.ts`; повторно использовать существующего судью, не копировать его prompt/schema.

### 3.0. Включить принятый корпус LAB-31 — выполнено

- [x] Включить принятые четыре кейса и связанные проверки harness из `958b7aaac2bdea0c21f6a8e8dfd51cc090564dad`, сохранив собственную реализацию baseline и совместимость Rich/Ben. Проверить через публичный `prepareBaseline`, что новый корпус содержит 48 кейсов и 144 задания в трёх кругах; обновить ожидания fixture-тестов.

### 3.1. Один кейс на отдельный smoke — выполнено

Добавлены обязательный selector, budget=0 и устойчивый readiness ledger. Полный suite: 519 PASS, 7 clean-host SKIP, 0 FAIL; typecheck PASS. Один прежний fixture-отказ resume не воспроизвёлся в шести отдельных проверках и полном suite; при следующем отказе закрытый fixture сохраняется для диагностики. Причина исходного отказа не установлена. Live proof и семь clean-host проверок относятся к этапам 5–6.

- [x] Через TDD добавить обязательный для одиночного smoke selector `smoke --case calc-data-double|crosstable-fixed-sum`.
- [x] Один вызов создаёт один manifest с одним job attempt=1, один run и свой release. Другие case IDs отклоняются до dispatch. Два вызова без selector не использовать как замену.
- [x] Исключить скрытый повтор продукта внутри smoke: добавить в общий harness опцию `--infra-retries 0|1` с прежним default=1 и передавать `0` при обоих smoke, включая node runner. Текущий `repeat=1` сам по себе не отключает встроенный infra retry. Полный baseline и Rich/Ben сохраняют прежний budget=1; штатные judge retries сохраняются. Бюджет записывать в manifest/config run и проверять перед dispatch.
- [x] Независимый Double-oracle создавать только для `calc-data-double`; completeness каждого одиночного smoke проверять по его единственному ожидаемому кейсу.
- [x] Готовность внедрения требует двух разных smoke-серий, по одной для каждого заданного кейса. Повторные вызовы/создание нового каталога не должны обходить лимит уже допущенных smoke: вести устойчивый readiness ledger для LAB-32. В private v2 config закрепить `roles.evalbaseline.readinessIssue` на `01a11ae4-fa45-79ce-aec6-edd7170dafc7` до freeze; полный start требует готовности обеих live-серий.
- [x] Тесты: selector/allowlist, ровно один dispatch даже при infra_error, отдельные release, два разных кейса в readiness, отсутствие артефакта оставляет gate незавершённым, повтор после crash или с новым каталогом не создаёт третью продуктовую попытку; default infra retry обычных/node запусков сохранён.

### 3.2. Добор пропущенного измерения без перезаписи истории — выполнено

Infrastructure и judge recovery реализованы отдельными append-only executions. Обычный `--judge-only` переписывает исходные run-файлы и для immutable baseline непригоден. Проверки завершены до фиксации SHA полной серии: полный suite 553 PASS/9 clean-host SKIP/0 FAIL, typecheck PASS; все 9 clean-host fixtures на сервере пройдены без skips (51 PASS). Код `3ce983703bbeca5d759f1cd7bfc8b9a8196c7f64`.

- [x] Запретить допуск следующего job и штатный финальный release полной серии при сохранённом неизмеренном исходе; CLI возвращает `AWAITING_RECOVERY`, исходный journal и расходы сохраняются. Одиночный smoke сохраняет собственное освобождение после подтверждённой очистки.
- [x] Запретить новый допуск измерения после записанного release (`SERIES_RELEASED`), не меняя journal и исходные результаты.
- [x] Запретить допуск следующего кейса при неподтверждённой очистке любого исходного/дополнительного run, включая уже измеренный product outcome; journal остаётся неизменным.
- [x] Добавить `resolve-cleanup` с отдельным immutable подтверждением штатного recovery конкретного execution. Первоначальные failed cleanup и product FAIL сохраняются; восстановленная очистка открывает следующий кейс или judge recovery без повтора продукта. Fixture drift/model-calls/tamper проверки PASS; общий targeted набор 90 PASS, 4 clean-host SKIP, 0 FAIL; typecheck PASS (`114d10ffab0efe32dc3db28b25be7137a274cce3`). Положительная native проверка helper выполнена на выделенном сервере; новый installed CLI проверяется отдельно на этапе 5.
- [x] Сохранить исходные job/record/run и добавить журнал дополнительных executions/resolutions с отдельными ID, каталогами, хэшами, причиной, ссылкой на исходную ошибку, recovery evidence и task/run UUID. Не сбрасывать `recorded` обратно в `pending`.
- [x] Реализовать атомарный admission и `resume` для infrastructure-добора одного slot: неизменяемые private copies исправления/немодельной проверки, один дополнительный run, переход к следующему job после первого измеренного исхода, все технические расходы и исходные ошибки в отчёте/экспорте.
- [x] Добавить CLI `recover-measurement --series DIR --job KEY --kind infrastructure|judge --evidence PRIVATE_JSON`. Команда атомарно регистрирует разрешение на конкретное восстановление; `resume` выполняет его не более одного раза. Повтор с тем же evidence возвращает существующее состояние.
- [x] Recovery evidence содержит версию, baseline ID, job key, исходный execution ID и хэши, категорию и доказанную причину сбоя, выполненное исправление, положительную немодельную проверку исправления, подтверждения завершения процессов/очистки и неизменности пинов. Свободного текста «исправлено» недостаточно; helper проверяет связанные receipts/хэши.
- [x] `infrastructure`: дополнительный продуктовый execution допустим только для терминального, доказанно неизмеренного исхода после устранения причины. Все прошлые executions и штатные retries сохраняются. Повторная одинаковая ошибка без нового исправления не даёт очередного разрешения.
- [x] `judge`: при существующем завершённом продукте повторять только оценку того же артефакта с теми же judge pins. Результат писать в отдельный append-only каталог; исходный summary/result/verdict не менять. Первый валидный judge verdict окончателен, плохая оценка не служит причиной пересуживания.
- [x] Не допускать recovery admission при работающем executor/child. Сбой между admission и dispatch требует reconcile; отсутствие доказанного terminal outcome остаётся UNKNOWN и не разрешает новый запуск.
- [x] В отчёте отделить три логических измерения кейса от числа технических executions. Засчитывать первое валидное разрешённое измерение каждого slot; показывать исходные infra/judge ошибки и расходы всех executions и retries, не выбирать лучший score.
- [x] Восстанавливать недостающий slot перед переходом к следующему job: порядок трёх кругов остаётся детерминированным. При невозможности восстановления сохранять lease и `AWAITING_RECOVERY`, чтобы основной чат мог вмешаться.
- [x] Убрать автоматический финальный release при восстановимых пропусках. Complete/release проверяет **все** реально запущенные executions, включая первоначальные ошибки, retries и judge recovery, их процессы, архивы и очистку.
- [x] Уже released-серии не открывать повторно. Для прекращения незавершённой серии предусмотреть отдельный терминальный путь с причиной и доказанной безопасной очисткой; он не означает полный baseline и не запускает новый корпус автоматически. `abandon --reason REASON --evidence RELEASE_JSON` подтверждает настоящий штатный release; guard/UNKNOWN/failed cleanup запрещают прекращение. Targeted baseline/recovery/judge/helper: 83 PASS, 4 clean-host SKIP, 0 FAIL; typecheck PASS.

**Бюджет аварийной очистки:** обычный добор после штатной подтверждённой очистки не вызывает `node-eval-ops recover`. Для EvalBaseline действует одна атомарная reservation на конкретный доказанный execution/cleanup incident, включая неуспешную reservation. Новое имя incident при том же execution не сбрасывает бюджет; повтор одной аварии не разрешается. Rich/Ben сохраняют прежнее правило одного recovery на lease. Когда очистку доказать не удалось, сохраняется BLOCKED; новый execution и force-release запрещены.

- [x] Через TDD добавить отдельный аварийный бюджет EvalBaseline: immutable run и cleanup связываются с исходным launcher PID/starttime/uid; O_EXCL/fsync до мутации; разные исполнения допускаются отдельно. Конкурентные/переименованные/частично записанные reservations не сбрасывают бюджет, произвольный cleanup отклоняется; Rich/Ben unchanged. Release отдельным recovery-completion для baseline запрещён. Helper targeted: 24 PASS, 4 clean-host SKIP, 0 FAIL; typecheck PASS.
- [x] Проверены отдельные writer-settlement receipts для разных baseline executions под одним lease и прежнее правило Rich/Ben; `resolve-cleanup --recover-executor` принимает доказанный сохранённый terminal run после смерти executor, проверяет полный UID/PID/starttime/nonce и валидный cleanup receipt, сохраняет guard для native resume. Живой harness и неполная identity блокируют команду. TDD red/green зафиксирован; исходные bytes сохранены.

**Обязательные тесты:**

- [x] Полный fixture-корпус даёт ровно N × 3 валидных измерения в трёх кругах.
- [x] Окончательный infra error → доказанное исправление → одно дополнительное исполнение того же slot; исходная ошибка и хэши сохранены, соседние завершённые jobs не повторены.
- [x] Judge error → отдельная новая оценка прежнего артефакта; счётчик продуктовых запусков не увеличился, исходные bytes неизменны. Targeted 55 PASS, 4 clean-host SKIP, 0 FAIL; typecheck PASS. Экспорт сохраняет оба judge verdict, private proof исключён.
- [x] Штатные judge retries сохраняют причины каждого отказа и первоначальные verdict, включая invalid JSON. Успешный второй вызов не скрывает первый отказ в baseline-отчёте и архиве; время всех вызовов учитывается отдельно. Targeted judge/recovery: 37 PASS, 0 FAIL; typecheck PASS.
- [x] Повторная ошибка после recovery сохраняет очередной failed execution и удерживает пропуск; переименование прежнего fix с теми же bytes отклоняется. Новое подтверждённое исправление допускает один добор; обе ошибки/retries и расходы сохранены, продукт при judge recovery не повторяется. Public fixture PASS, typecheck PASS.
- [x] Product PASS/FAIL/timeout/no_artifact не допускают нового продуктового исполнения; валидная низкая оценка не допускает rejudge.
- [x] Два одинаковых тика/одновременные recovery-запросы не создают два admission или два dispatch; crash в каждом промежутке сохраняет однозначный результат либо UNKNOWN.
- [x] Public concurrent resume создаёт один дополнительный execution. Прерванная запись reservation, private fix copy или admission без journal запрещает повторный dispatch и сохраняет исходные bytes. Targeted 4 PASS; все эти проверки вошли в полный suite.
- [x] Принудительно завершённый fixture executor: живой child запрещает reconcile; после его завершения принимается сохранённый run без повторения; соседний pending job выполняется один раз. Dispatch без child receipt остаётся UNKNOWN. Targeted recovery: 20 PASS, 0 FAIL; typecheck PASS.
- [x] Изменённые пины, неизвестный исход, живой child и неподтверждённая очистка блокируют recovery.
- [x] Lease удерживается при пропуске; completion проверяет очистку первоначального и дополнительных executions. Чужой release и обход recovery budget отклоняются.
- [x] Потребление всех дополнительных executions отражено; regular/analytic и node metrics не объединены в общий score; экспорт исключает secrets/leases/БД.
- [x] После cleanup-resolution изменений: targeted 90 PASS/4 SKIP; `bun test` — 549 PASS/7 SKIP/0 FAIL, 556 тестов/48 файлов/2714 assertions/559,88 с; `bun typecheck` PASS. Дополнительный native cleanup test и прежние clean-host fixtures проверены на серверном срезе `077d0b5b1`: helper 29 PASS, writer/registration 21 PASS, без skips. Первый writer запуск сохранил ошибку отсутствующего Node; изолированный fixture Node с проверенным SHA устранил предпосылку, повтор PASS. При следующих изменениях кода повторить необходимые проверки.

## 4. Активировать v2 для всех исполнителей — выполнено

**Результат:** единые config/helper/instructions действительно включены, а не только подготовлены рядом с активной v1.

- [x] Заново прочитать очередь и статусы **всех** исполнителей runtime, lease, процессы, recovery и профили. Дождаться завершения цепочки LAB-31; не отменять чужие задачи и не перехватывать lease.
- [x] Подготовить финальный чистый SHA с доработками этапа 3 и принятым корпусом. Установить immutable supplement с полным файловым manifest, проверить его SHA и хэши. Сохранить предыдущую версию и private backup config/instructions.
- [x] При пустой очереди и отсутствии активных задач временно исключить новый dispatch на время переключения штатным механизмом runtime; повторно проверить очередь перед заменой. Не использовать текущий BUSY как разрешение остановить работника.
- [x] Подтвердить FREE, отсутствие harness leases/pending cleanup, чистоту всех пяти профилей, отсутствие браузеров/отладчиков и остатков общего Loginom storage.
- [x] Атомарно заменить active config на v2. Переключить инструкции Multica и server `runtime.md` Rich, Ben, Evaler и EvalBaseline на один manifest/helper. Не оставлять часть исполнителей на относительном старом `script/node-eval-ops.ts` из checkout.
- [x] Readback: прежние runtime/model/thinking/concurrency/squad/роль и продуктовые настройки Rich/Ben сохранены; EvalBaseline имеет отдельные eval-profile и CLI 0.1.17; Evaler остаётся без продуктового профиля. У всех совпадает operational supplement.
- [x] Возобновить dispatch после успешного readback. До реального использования v2 при ошибке переключения восстановить сохранённую конфигурацию; после приобретения v2 lease сначала выполнить предусмотренное восстановление и cleanup.

Проверено 2026-10-08 23:44 MSK: runtime возобновлён, очереди четырёх исполнителей пусты; `FREE`, пять профилей чисты, storage пуст. Развёрнутый immutable SHA `53d03a35b0ee2901b40c1a1bbb0170804d59e865`, manifest 733 файлов, SHA256 `9f78455de8c03996e3dbfc12696b0fed5197597f664553cd2502b349ba5e0aae`. Server proof: `R/evidence/baseline-v2-activation-resumed-53d03a35b.json`; Multica readback подтвердил инструкции всех четырёх ролей, три starters, неизменность настроек и squad. Дальнейшие операторские doc-коммиты не меняют этот серверный pin.

## 5. Немодельная проверка установленного CLI внутри изоляции — выполнено

Новое задание LAB-32: `01a11d44-5374-7e30-9ab4-ea3125364559`, создано 2026-10-08 23:47 MSK. Readback подтвердил единственный dispatched run EvalBaseline; gate ещё не завершён. Ограничение задания — только немодельная проверка, без smoke и полного baseline.

MCP-вызов `search` этого run завершился успешно: `peer_scope=actor`, без явно заданного target/Peer. Первый `prepare` остановился до создания серии/lease на недоступном старом Dock URL. 2026-10-08 23:53 MSK основной чат атомарно выровнял только `LOGINOM_DOCK_BASE_URL` собственного eval.env с существующим адресом Rich/Ben `https://mcp.loginom.ai`; credentials не менялись. Немодельная проверка: health 200, `captureBaselinePins` PASS, Dock revision `907ff16bc39752f808b8ab6d3caf06c57f21f605f0da0fe238fff5975a41b148`; исходная ошибка/backup сохранены. Proofs: `R/evidence/evalbaseline-dock-env-{fix,validation}.json`. Все 9 server-only fixtures входят в подтверждённый server suite 51 PASS/0 SKIP; native CLI gate остаётся открытым.

Подготовительные команды выполняет отдельное реальное задание EvalBaseline в LAB-32 после активации. Ноль вызовов оцениваемой модели и судьи; работа самого управляющего агента не является eval-измерением. UUID задачи памяти, уже завершённой ранее, не переиспользовать как ID нового запуска.

Для команд ниже `CARD_UUID` и `MULTICA_RUN_UUID` берутся из readback текущего задания, `FULL_SHA` — из чистого собственного checkout. Каталоги серий новые, абсолютные, внутри configured resultsRoot. `PRIVATE_WORK_DIR` находится внутри собственного configured workRoots; receipts имеют mode 0600.

```sh
R=/home/user/.local/share/loginom-evals-runtime
CFG="$R/operations/node-eval-ops.json"
HELPER="$R/support/baseline-v2/evals/script/node-eval-ops.ts"
cd "$R/checkouts/evalbaseline/loginom-ai-agent/evals"

run_baseline() {
  "$R/bin/with-env" "$R/runtime.env" "$R/bin/with-env" \
    "$R/roles/evalbaseline/eval.env" "$R/bin/bun" script/run-baseline.ts "$@"
}
run_ops() {
  "$R/bin/with-env" "$R/runtime.env" "$R/bin/with-env" \
    "$R/roles/evalbaseline/eval.env" "$R/bin/bun" "$HELPER" "$@"
}
```

- [x] Проверить собственную память настоящим MCP-вызовом, если её конфигурация или подключение изменились: actor scope, automatic Git Peer собственного checkout. При ошибке восстановить память до live-работы.
- [x] Создать отдельную техническую серию через `prepare`, не вызывать для неё `start` и не использовать её в будущем baseline.
- [x] Выполнить штатный admission/preflight/release:

```sh
run_baseline prepare --config "$CFG" --series "$TECH_PREFLIGHT_SERIES"
run_ops acquire --config "$CFG" --issue "$CARD_UUID" --task "$MULTICA_RUN_UUID" \
  --role evalbaseline --phase eval --sha "$FULL_SHA" \
  --receipt "$PRIVATE_WORK_DIR/preflight-lease.json"
run_ops preflight --config "$CFG" --lease "$PRIVATE_WORK_DIR/preflight-lease.json"
run_ops release --config "$CFG" --lease "$PRIVATE_WORK_DIR/preflight-lease.json" \
  --baseline "$TECH_PREFLIGHT_SERIES" --run-sha "$FULL_SHA"
```

- [x] Подтвердить настоящий `loginom check` установленного CLI внутри bubblewrap: подключение/Loginom READY, Chromium/AppArmor, отсутствие доступа к корпусу/ответам/архивам, завершение всех процессов, закрытый архив истории, чистоту профилей/storage и реальный release receipt/FREE.
- [x] Сохранить техническую серию как **incomplete, 0 измерений**, а успешность native проверки и безопасное освобождение — отдельно. Это существующий допустимый completion-path; нулевую техническую серию не обозначать полным baseline.
- [x] Выполнить оставшиеся реальные server-only проверки lease/completion в отдельном назначенном немодельном окне; сохранить результат и подтверждённую очистку. Незавершённую проверку не заменять локальным PASS.

Native gate завершён новым run `01a11d4f-9de4-7da6-a096-1d403753da8c`: technical manifest `bed77af4-b5fe-4a53-b67b-014bc4f6bcc4`, `R/roles/evalbaseline/results/native-gate5-01a11d4f-9de4-7da6-a096-1d403753da8c`, 48 cases/144 pending/0 measured, status incomplete. Actual admission READY, process cleanup confirmed, private history archive mode 0700. Штатный baseline-completion release RELEASED `2026-10-08T21:02:36.237Z` (00:02:36 MSK 2026-10-09), evidence SHA256 `c8707dbc8a4851d88de04c07ffb1ef2399a3fe49b179b39baeb306232ef966f3`. Основной чат независимо подтвердил FREE/5 profiles clean/storage EMPTY/harness leases 0/browsers 0. Изоляция: агент проверил 15 запрещённых путей, в том числе `/proc/1/root`; Public evidence доставлен в LAB-32: attachment `01a11d56-86ad-76c8-a8c8-87a5b2850865`, SHA256 `d4d7f2df7399b9b841138275182af5f787b5240e5008901d7b574af881dc8e3f`; основной чат скачал архив и проверил все 11 членов по delivery manifest, отсутствие известных credentials/lease tokens/DB. Native run завершён; карточка была `in_review`.

## 6. Два отдельных smoke — ровно две продуктовые попытки

Отдельное calc-поручение допущено после native release/delivery: run `01a11d59-d21d-76de-8cc8-b875a6cd46e0`, trigger comment `01a11d59-d210-7b04-940d-0e13aa826a9a`. Планируемый каталог `R/roles/evalbaseline/results/smoke-calc-data-double-20261009`; только `calc-data-double`, один продуктовый запуск, without infra retry. Остальные исполнители проверены idle/без pending задач. Node smoke и полная карточка пока не допущены.

Calc outcome: manifest `889c9f8e-819a-431d-9ed1-2082e839ae00`, logical job `regular-calc-data-double-1`, source run `20261008-211338-53d03a35b`. Единственный CLI запуск завершился за 10088 мс: raw status `failed`, failure_kind `provider`, error `ProviderModelNotFoundError`, session ID пуст, tokens/tool calls 0, artifact отсутствует, oracle/judge не вызваны. Исходный record `measured=true/verdict=FAIL` сохранён без изменений; readiness gate **INCOMPLETE**, фактическая model/medium не доказана. Cleanup confirmed, общий release RELEASED/FREE. Причина: embedded snapshot CLI fc3d97db не содержит `openai/gpt-6.1-sol`, собственный cache/models.json отсутствует. Текущий публичный каталог models.opencode.ai и models.dev содержит точный model ID с medium (оба HTTP 200, одинаковый SHA256 `88cdf1604e85999e2bfea9538248e44a6c5fefff7e6218e36e97ac2f82d6e048`); далее — немодельное восстановление собственного каталога. Автоматический повтор calc запрещён; node пока не допущен, чтобы не расходовать его единственную попытку на ту же ошибку.

Немодельное исправление проверено 2026-10-09 00:26 MSK: штатная команда установленного CLI `models openai --refresh --verbose` внутри действующего bubblewrap обновила только собственный `cache/models.json`. CLI подтвердил точный `openai/gpt-6.1-sol` и вариант `medium` (`reasoningEffort=medium`); 5389 файлов установки, версия 0.1.17 и source fc3d97db неизменны. SHA256 каталога `88cdf1604e85999e2bfea9538248e44a6c5fefff7e6218e36e97ac2f82d6e048`. Model/judge calls=0, процессы завершены, история закрыто архивирована, профиль чист. Proof: `R/roles/evalbaseline/work/model-catalog-fix-20261009/validation.json`. Это подтверждает регистрацию модели, но не заменяет доказательство фактической модели и medium в продуктовой истории.

- [x] Исправить доказанную причину `ProviderModelNotFoundError` немодельной командой собственного установленного CLI, сохранив продуктовые пины, исходную ошибку и readiness ledger.
- [x] Независимо проверить доставку evidence неудачного calc smoke: attachment `01a11d65-3c70-7a5c-aacd-bfad5487a648`, SHA256 `eadded73a16c7d56b2f50766ee64eb767ed7419bce5eec878c857a45114ca92a`; скачанные bytes совпадают с серверным архивом, все 11 членов delivery manifest PASS, известных secrets/lease/DB нет. Server proof: `R/evidence/calc-smoke-delivery-root-verification-20261009.json`.
- [x] Сохранить исправление и незавершённую готовность в LAB-32 штатным description update с `--no-start`; Multica readback совпал, новый run не создан. Проверка 2026-10-09 00:35 MSK: все четыре исполнителя idle, очереди пусты; пять профилей чисты, storage EMPTY, stand FREE, harness leases 0. Proof: `R/evidence/post-catalog-cleanliness-20261009.json`.

**Ожидается решение пользователя:** отдельно запрошен новый подготовительный цикл в новой readiness-карточке: исправленный calc и ещё не запускавшийся node — по одной попытке с сохранением LAB-32. До ответа нельзя менять `readinessIssue`, повторять calc, расходовать node или запускать полный baseline. Согласие на исполнение исходного плана не отменяет закреплённый в нём запрет автоматического повтора smoke. После явного согласия сначала проверить свободный стенд/очереди/очистку, сохранить private backup и изменить только `readinessIssue`; остальные пины сохранить. Старые ledger, manifest, run и evidence не редактировать.

Команды с `--case` ниже — интерфейс, реализованный и проверенный в 3.1; новый запуск требует выполнения описанного выше условия.

```sh
run_baseline smoke --config "$CFG" --series "$SMOKE_CALC_SERIES" \
  --case calc-data-double --issue "$CARD_UUID" --task "$MULTICA_RUN_UUID"
run_baseline smoke --config "$CFG" --series "$SMOKE_NODE_SERIES" \
  --case crosstable-fixed-sum --issue "$CARD_UUID" --task "$MULTICA_RUN_UUID"
```

- [ ] Сначала допустить и завершить `calc-data-double`: пакет `.lgp`, результат CSV, независимый Double = Amount × 2 oracle и **настоящий** judge `gpt-6-astra/high`. Не изменять исходный кейс, где отдельного oracle.csv нет.
- [ ] Подтвердить его архивы/модель/процессы/очистку и release; только после безопасного освобождения допустить `crosstable-fixed-sum` отдельной серией.
- [ ] Для `crosstable-fixed-sum` проверить артефакт и штатный node validator, его code-verdict, архивы, процессы, очистку и собственный release.
- [ ] Для обоих подтвердить фактическую модель продукта и `medium` по закрытой истории; не ограничиваться env/config. В публичный evidence включать только несекретное заключение, не БД.
- [x] Если артефакта нет, gate остаётся незавершённым. Диагностика допустима, автоматический продуктовый повтор smoke запрещён, даже после исправления причины и при новом каталоге/UUID. Добор этапа 3.2 относится к полной baseline-серии, не снимает это ограничение smoke.
- [ ] Quality FAIL при имеющихся артефакте, выполненных oracle/judge/validator и подтверждённой очистке показать честно; не пытаться получить PASS повторением. Gate интеграции и качество продукта — отдельные поля отчёта.
- [ ] Проверить evidence обоих smoke, загрузить в LAB-32, скачать, проверить bytes/SHA256/manifest и readback. Зафиксировать готовность либо точный незавершённый gate.

## 7. Обязательно создать карточку полного baseline и запустить её в работу

**Этот этап обязателен. Реализация не заканчивается готовым агентом, планом, `prepare`, новой карточкой в backlog или отчётом smoke.**

- [ ] После прохождения этапов 3–6 **создать новую карточку Multica** в проекте `Loginom node evals`: заголовок `[Baseline] CLI 0.1.17 — <короткий corpus SHA> — 3 попытки`; метка `baseline`; исполнитель EvalBaseline `77032943-ad18-4ae9-a2c6-668769077c86`; вне squad. Связать её с readiness/evidence LAB-32.
- [ ] В описание записать задание на полный корпус, все пины и фактический N, три круга, лимиты, единственный lease, правила добора/UNKNOWN/immutable evidence, путь результатов, критерий complete и запрет повторять валидное измерение ради качества. При повторном входе сначала найти карточку по сохранённому UUID/маркеру этого запуска, чтобы не создать дубликат.
- [ ] При создании сохранить UUID/ссылку карточки и локатор будущей серии в checkpoint до 20 строк. Ещё не запускать продукт до включения контроля этапа 8.
- [ ] Обновить инструкцию EvalBaseline: прежнее требование нового разрешения на полный baseline для **этой созданной карточки** заменено настоящим поручением. Автономные расписания/выбор следующей карточки самому EvalBaseline не добавлять.
- [ ] Включить `/loop 30m` в основном чате по этапу 8, проверить регистрацию пробуждений и выполнить первый контроль сразу.
- [ ] **Запустить новую карточку в работу** штатным Multica start/assign без `--no-start`. Если API уже создал run, второй раз start/rerun не вызывать. Сохранить настоящий run UUID.
- [ ] Проверить readback: нужный исполнитель/runtime, один run `queued → running`, карточка `in_progress` согласно нативному workflow. Смена статуса вручную без реального run не подтверждает запуск. При занятом runtime оставить единственный queued run и сопровождать до `running`.
- [ ] В реальном задании EvalBaseline выполнить `prepare`, сохранить UUID manifest и путь серии в карточке/checkpoint, проверить N × 3 jobs, затем **выполнить `start`**:

```sh
run_baseline prepare --config "$CFG" --series "$BASELINE_SERIES"
run_baseline start --config "$CFG" --series "$BASELINE_SERIES" \
  --issue "$BASELINE_CARD_UUID" --task "$BASELINE_MULTICA_RUN_UUID"
```

- [ ] Подтвердить фактический запуск executor, правильного owner общего lease и первого продуктового измерения. UUID карточки, UUID Multica run и UUID manifest различны; не подставлять один вместо другого.
- [ ] Передать пользователю ссылку созданной карточки, baseline ID, corpus SHA, N × 3, время начала и время следующей проверки по Europe/Moscow.

**Проверенные точки входа Multica CLI:** создание без assignee не запускает работу; assign без `--no-start` запускает. Выполнять в уже настроенном контексте workspace `dcf616e7-66eb-470a-9b04-6462f220cf3b` / `https://mas.kartamyshev.dev`, не выводя credentials. `BASELINE_TITLE` формируется из закреплённого corpus SHA, `BASELINE_DESCRIPTION_FILE` содержит задание выше, `CONTROL_DIR` — собственный private каталог контроллера. UUID извлекается из фактического ответа создания.

```sh
multica issue create --title "$BASELINE_TITLE" \
  --project de16c24b-4121-45c3-9f5a-e16ddabb90e8 \
  --description-stdin --output json \
  < "$BASELINE_DESCRIPTION_FILE" > "$CONTROL_DIR/created-card.json"
BASELINE_CARD_UUID=$(python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])' \
  < "$CONTROL_DIR/created-card.json")
multica issue label add "$BASELINE_CARD_UUID" baseline --output json
```

После подтверждённого включения мониторинга этапа 8, а не одновременно с созданием:

```sh
multica issue assign "$BASELINE_CARD_UUID" \
  --to-id 77032943-ad18-4ae9-a2c6-668769077c86 --output json
multica issue runs "$BASELINE_CARD_UUID" --active --output json
multica issue get "$BASELINE_CARD_UUID" --output json
```

Эти команды — действия исполнения плана. При его составлении карточка полного baseline не создаётся и не запускается.

## 8. Контроль из этого чата каждые 30 минут через `/loop`

**Владелец мониторинга — основной чат, не Multica squad и не новая задача Codex.** Каждое пробуждение запускает проверку агента-контроллера; оно не перезапускает EvalBaseline или продукт каждые полчаса.

- [ ] Проверить существующие loop/heartbeat и устойчивое состояние контроллера; повторный вход не создаёт дубликат расписания или executor.
- [ ] Включить `/loop 30m` с приведённым ниже поручением и идентификаторами созданной карточки/серии. Сначала выполнить один контроль сразу; следующий — через 30 минут.
- [ ] Подтвердить, что механизм действительно будит **этот** чат. Skill `loop` описывает monitored output с `notify_on_output`; в интерфейсе `exec_command`, доступном при составлении плана, этого параметра нет. Поэтому для исполнения использовать доступный штатный thread heartbeat `automation_update` с интервалом 30 минут и этим же поручением. Не считать фоновый `sleep` подтверждением работающего мониторинга; OS cron и отдельную standalone Codex-задачу не создавать.
- [ ] Сохранить ID loop/heartbeat, thread ID, карточку, manifest ID/путь, source SHA, последнее завершённое измерение, наблюдаемое текущее исполнение, активный incident и следующую проверку. Публичный checkpoint — до 20 строк; private receipts/guards хранить отдельно, без публикации tokens.
- [ ] Защитить действия контроллера от перекрывающихся тиков. Перед любой мутацией повторно прочитать Multica run, journal и обе блокировки. Читающий subagent допустим; действия над стендом выполняет один контроллер.

**Поручение для `/loop 30m` / thread heartbeat:**

> Продолжай сопровождение созданной полной baseline-карточки Multica по плану `evals/docs/2026-10-08-evalbaseline-launch-plan.md`. Сначала прочитай checkpoint и фактическое состояние карточки, run, manifest/journal, общего lease и harness lease. Проверь ожидаемое/измеренное покрытие, активный job/execution и время прогресса, модель/пины, процессы, ошибки и очистку. Если работа движется штатно, не вмешивайся и не создавай новый run; при неизменном состоянии не уведомляй пользователя. При новом блокере самостоятельно выясни причину, исправь разрешённую инфраструктуру с сохранением пинов и подтверди исправление немодельной проверкой. Через предусмотренный recovery/resume добери только отсутствующее измерение; сохрани исходные ошибки, расходы и все raw evidence. Judge error восстанавливай отдельной оценкой того же артефакта без продуктового повтора. Не повторяй валидные PASS/FAIL/timeout/no_artifact, не снимай чужие/неподтверждённые блокировки и не повторяй UNKNOWN. Не меняй продукт, корпус, рубрики, модели или изоляцию ради прохождения. Доведи серию до проверенного complete, доставь и скачай evidence, проверь manifest и Multica readback; затем отключи этот монитор. Сообщай только о существенном прогрессе, устранённом/новом блокере, необходимом внешнем действии или завершении. Этот тик не даёт права создавать новую полную серию вместо добора текущей.

**Действия при каждом тике:**

| Наблюдаемое состояние | Действие контроллера |
|---|---|
| Активный run/execution, есть допустимый прогресс | Наблюдать; не запускать второй executor. Один тик без нового результата не означает зависание: продукт имеет до 30 минут, затем judge и cleanup |
| Карточка ещё queued | Проверить причину/занятость runtime; сохранить единственный run, не отменять чужую работу |
| Executor завершился, остаются pending | Проверить результаты, пины и leases; продолжить через `resume` одним заданием этой же карточки, сохранив первоначальную lease identity |
| Окончательная infra ошибка, slot не измерен | Диагностика → доказанное исправление → `recover-measurement` → `resume`; первая валидная попытка этого slot окончательна |
| Продукт завершён, judge error | Judge-only resolution в новом каталоге по неизменному artifact; исходный run не редактировать |
| Неизвестный outcome или cleanup | Разобрать наблюдения/process ancestry/receipts; подтвердить recovery либо оставить BLOCKED без dispatch и force-release |
| Повтор того же блокера | Не расходовать новые продуктовые попытки без нового подтверждённого исправления; продолжать диагностику/наблюдение и явно указать требуемое внешнее действие, если самостоятельно его выполнить нельзя |
| Pin drift | Восстановить прежние подтверждённые условия, если это возможно; не смешивать пины. Необходимость реально нового пина вынести пользователю: выбранная политика добора текущей серии этого не разрешает |
| Все измерения есть | Проверить независимые критерии этапа 9; exit code 0 от `check` сам по себе не доказывает complete |

Пример продолжения после проверенного восстановления:

```sh
run_baseline recover-measurement --series "$BASELINE_SERIES" --job "$JOB_KEY" \
  --kind infrastructure --evidence "$PRIVATE_RECOVERY_EVIDENCE"
run_baseline resume --config "$CFG" --series "$BASELINE_SERIES"
run_baseline check --series "$BASELINE_SERIES"
```

`recover-measurement` — новый интерфейс этапа 3.2. Для judge использовать `--kind judge`. `resume --recover-executor` допустим только после отдельного подтверждённого разбора stale guard; не включать флаг постоянно в каждый тик. Действующий общий lease не подменяется новым task/run UUID продолжения.

## 9. Доказать полноту и завершить сопровождение

- [ ] В manifest ровно N кейсов × три логических попытки; у каждого slot есть одно валидное измерение и обязательная оценка. Pending/UNKNOWN/неоценённых slots нет; все исходные ошибки и дополнительные executions видны.
- [ ] Проверить фактические product model/medium и judge pins, время/расходы всех executions. Regular/analytic показывать через существующие агрегаторы/compare, node — отдельный code PASS по попыткам и n/3.
- [ ] Подтвердить завершение всех процессов, закрытое архивирование истории всех попыток, чистоту всех профилей/storage и общий release. Качество FAIL не мешает complete; неподтверждённая очистка мешает.
- [ ] Выполнить `check --export`, сохранить неизменяемый серверный evidence, приложить архив именно к **новой полной baseline-карточке**, скачать и проверить bytes/SHA256/весь manifest. Secrets, env/OAuth, lease tokens, raw MCP logs и БД исключить.
- [ ] Проверить readback карточки/запуска/вложений и итоговый отчёт. Итог baseline — `complete`; карточку передать в `in_review` с проверенным evidence. Финальные `done`, merge и release продукта остаются владельцу.
- [ ] Записать checkpoint до 20 строк: source/corpus SHA, CLI/model pins, N × 3, результаты и сохранённые infra incidents, release/delivery receipts, ограничения, следующий шаг.
- [ ] **Отключить `/loop`/heartbeat после проверенного complete и доставки.** Сохранить подтверждение отключения и дать пользователю итог со ссылкой карточки. Не останавливать монитор на одном `queued`, `in_review`, exit code 0, неполном отчёте или появлении первого блокера.

## 10. Что считается выполнением всего плана

- [ ] Доработаны и проверены одиночные smoke, добор отсутствующего slot и неизменяемое восстановление judge.
- [ ] v2 активна у всех исполнителей; native isolation check и два отдельных smoke имеют проверенные evidence/release.
- [ ] **Новая карточка Multica создана и реально запущена; полный baseline действительно исполнен.**
- [ ] Основной чат сопровождал работу каждые 30 минут, устранял доступные ему блокеры и не терял завершённые измерения.
- [ ] Получен полный N × 3 baseline, стенд освобождён, скачанный evidence и Multica readback проверены, монитор отключён.

Невозможность подтвердить cleanup, неизвестный исход, отсутствие артефакта smoke или необходимое изменение пинов не маскируются словом «готово». Контроллер продолжает допустимую диагностику; если требуется действие, которое недоступно ему или противоречит закреплённым ограничениям, сообщает точную причину и требуемое решение.
