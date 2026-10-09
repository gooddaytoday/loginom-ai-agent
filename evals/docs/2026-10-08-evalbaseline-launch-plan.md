# EvalBaseline: завершение подготовки, запуск и сопровождение — Implementation Plan

> Для исполнителя: выполняй пункты последовательно, отмечай проверенные результаты. Для изменения поведения используй `tdd`: падающий тест → минимальное исправление → проверка → коммит. Работу ведёт этот основной чат; независимые проверки можно делегировать. Новое подтверждение для предусмотренных планом действий не требуется.

**Goal:** завершить подготовку EvalBaseline, **создать новую карточку Multica и запустить её в работу**, получить по три измеренных результата каждого кейса и сопровождать исполнение из основного чата через `/loop 15m` до проверенного полного baseline.

**Architecture:** EvalBaseline последовательно исполняет закреплённый корпус под одним общим lease. Основной чат каждые 15 минут проверяет фактическое состояние, самостоятельно устраняет подтверждённые инфраструктурные причины и организует добор только недостающих измерений. Все исходные результаты, ошибки и дополнительные исполнения сохраняются; отдельные smoke не входят в baseline.

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
| Локальный checkout | `/home/kiselev/.codex/worktrees/baseline-runtime/loginom-ai-agent`, ветка `baseline-runtime` |
| Закреплённый operational harness / сервер | `ee7861513be1c4309fdf1678ccae78ad89522973`; поздние doc-коммиты не redeploy |
| Закреплённый корпус | `53d03a35b0ee2901b40c1a1bbb0170804d59e865`, 48 кейсов / 144 измерения |
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
| Карточка полного baseline | [LAB-55](https://mas.kartamyshev.dev/lab/issues/LAB-55), `01a11fc1-8ded-7600-8251-66d97a4add78`, реально запущена; manifest `f8c70eb0-88b6-457d-99a0-cd4ccb44d0b9` |

Основной чат отвечает за изменения harness, активацию общей среды, мониторинг и устранение блокеров. EvalBaseline отвечает за исполнение серии, сохранение доказательств и отчёт; он не исправляет продукт или критерии оценки. Rich, Ben и Evaler сохраняют свои роли и порядок приёмки.

Уже проверено: полный CLI manifest — 5389 файлов, AppArmor/sandbox, setup READY, чистота собственного профиля, настоящий MCP search с actor scope и автоматическим Git Peer, Multica readback и доставка evidence. Последний полный локальный suite: 558 PASS, 9 clean-host SKIP, 0 FAIL; typecheck PASS. На выделенном сервере helper и writer/registration fixtures: 51 PASS, 0 SKIP, 0 FAIL, включая дополнительную native cleanup проверку. Это исходные свидетельства, а не замена проверки изменившегося состояния перед исполнением.

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

## 6. Два отдельных smoke — выполнено с разрешённым исключением node-артефакта

Отдельное calc-поручение допущено после native release/delivery: run `01a11d59-d21d-76de-8cc8-b875a6cd46e0`, trigger comment `01a11d59-d210-7b04-940d-0e13aa826a9a`. Планируемый каталог `R/roles/evalbaseline/results/smoke-calc-data-double-20261009`; только `calc-data-double`, один продуктовый запуск, without infra retry. Остальные исполнители проверены idle/без pending задач. Node smoke и полная карточка пока не допущены.

Calc outcome: manifest `889c9f8e-819a-431d-9ed1-2082e839ae00`, logical job `regular-calc-data-double-1`, source run `20261008-211338-53d03a35b`. Единственный CLI запуск завершился за 10088 мс: raw status `failed`, failure_kind `provider`, error `ProviderModelNotFoundError`, session ID пуст, tokens/tool calls 0, artifact отсутствует, oracle/judge не вызваны. Исходный record `measured=true/verdict=FAIL` сохранён без изменений; readiness gate **INCOMPLETE**, фактическая model/medium не доказана. Cleanup confirmed, общий release RELEASED/FREE. Причина: embedded snapshot CLI fc3d97db не содержит `openai/gpt-6.1-sol`, собственный cache/models.json отсутствует. Текущий публичный каталог models.opencode.ai и models.dev содержит точный model ID с medium (оба HTTP 200, одинаковый SHA256 `88cdf1604e85999e2bfea9538248e44a6c5fefff7e6218e36e97ac2f82d6e048`); далее — немодельное восстановление собственного каталога. Автоматический повтор calc запрещён; node пока не допущен, чтобы не расходовать его единственную попытку на ту же ошибку.

Немодельное исправление проверено 2026-10-09 00:26 MSK: штатная команда установленного CLI `models openai --refresh --verbose` внутри действующего bubblewrap обновила только собственный `cache/models.json`. CLI подтвердил точный `openai/gpt-6.1-sol` и вариант `medium` (`reasoningEffort=medium`); 5389 файлов установки, версия 0.1.17 и source fc3d97db неизменны. SHA256 каталога `88cdf1604e85999e2bfea9538248e44a6c5fefff7e6218e36e97ac2f82d6e048`. Model/judge calls=0, процессы завершены, история закрыто архивирована, профиль чист. Proof: `R/roles/evalbaseline/work/model-catalog-fix-20261009/validation.json`. Это подтверждает регистрацию модели, но не заменяет доказательство фактической модели и medium в продуктовой истории.

- [x] Исправить доказанную причину `ProviderModelNotFoundError` немодельной командой собственного установленного CLI, сохранив продуктовые пины, исходную ошибку и readiness ledger.
- [x] Независимо проверить доставку evidence неудачного calc smoke: attachment `01a11d65-3c70-7a5c-aacd-bfad5487a648`, SHA256 `eadded73a16c7d56b2f50766ee64eb767ed7419bce5eec878c857a45114ca92a`; скачанные bytes совпадают с серверным архивом, все 11 членов delivery manifest PASS, известных secrets/lease/DB нет. Server proof: `R/evidence/calc-smoke-delivery-root-verification-20261009.json`.
- [x] Сохранить исправление и незавершённую готовность в LAB-32 штатным description update с `--no-start`; Multica readback совпал, новый run не создан. Проверка 2026-10-09 00:35 MSK: все четыре исполнителя idle, очереди пусты; пять профилей чисты, storage EMPTY, stand FREE, harness leases 0. Proof: `R/evidence/post-catalog-cleanliness-20261009.json`.
- [x] Доставить отдельный несекретный evidence исправления в LAB-32 без запуска агента: attachment `01a11d73-d5ba-70d4-9cb5-deeb96cc85a3`, архив `evalbaseline-model-catalog-recovery-20261009.tar.gz`, SHA256 `57c986581ad123836e011c59c9dfcd1f7c45cfd394a5eec1d8c4fc23891db41d`. Серверный архив сохранён mode 0400; основной чат скачал Multica-вложение и подтвердил bytes/SHA256/manifest всех 5 членов. Архив содержит только README, регистрацию модели, post-catalog cleanliness и проверку доставки исходной ошибки; ни raw metadata stdout, ни auth/lease/БД не включены. Readback карточки сохранил `in_review`, active runs=0.

**Отдельное разрешение получено 2026-10-09:** пользователь ответил «Да, разрешаю» на новый подготовительный цикл — calc и ещё не запускавшийся node по одной попытке, с сохранением LAB-32. Это разрешение относится к двум попыткам нового цикла; последующие автоматические повторы smoke по-прежнему запрещены.

- [x] Создать новую readiness-карточку [LAB-54](https://mas.kartamyshev.dev/lab/issues/LAB-54), UUID `01a11f72-c385-7d3e-bfd7-6911b3a7bdf2`, в существующем проекте, с префиксом `[Baseline]` и меткой `baseline`, вне squad. Создание без assignee/run проверено; первым отдельным заданием допускается только calc, node — после его проверенного release/evidence.
- [x] После свежего FREE/пустых очередей/пяти чистых профилей/storage EMPTY/harness leases 0 остановить dispatch, повторить проверки и атомарно изменить **только** `roles.evalbaseline.readinessIssue` на LAB-54. Private backup: `R/operations/config-backups/readiness2-LAB54/node-eval-ops-before.json`; proof `R/evidence/readiness2-LAB54-config-switch.json`, 2026-10-09 09:58 MSK. Остальные настройки и SHA `53d03a35b0ee2901b40c1a1bbb0170804d59e865` сохранены; original calc files и старый ledger неизменны. Новая config SHA256 `b9417646226ba61fc7a963cffc14d8c297ef54d95ac2973dccaca8afe712d918`; runtime снова active.

Локальный временный checkout отсутствовал после ожидания ответа. Ветка и коммиты сохранились; собственный checkout восстановлен на прежнем HEAD `43a400baf4c5697de640d3818883733e77a9d227` в `/home/kiselev/.codex/worktrees/baseline-runtime/loginom-ai-agent`. Основной checkout и серверные результаты не изменены. Дальнейшие документы коммитить здесь, server pin не обновлять ради операторских записей.

- [x] Допустить только calc нового цикла: LAB-54 назначена EvalBaseline штатным assign; единственный run `01a11f76-dedf-7df4-b1af-1eee633ce9e3`, `running` с 2026-10-09 10:00:46 MSK. Runtime `eval-tests`, agent model/thinking/concurrency `gpt-6.1-sol/xhigh/1` подтверждены readback. Это допуск управляющего задания; результат продуктового smoke ещё требуется отдельно. Node и full не допущены.

Команды с `--case` ниже — интерфейс, реализованный и проверенный в 3.1. Для нового цикла использовать UUID LAB-54 и новые отдельные каталоги `readiness2-calc-data-double-20261009` / `readiness2-crosstable-fixed-sum-20261009` внутри configured resultsRoot. Исходная ошибочная серия LAB-32 не открывается заново.

```sh
run_baseline smoke --config "$CFG" --series "$SMOKE_CALC_SERIES" \
  --case calc-data-double --issue "$CARD_UUID" --task "$MULTICA_RUN_UUID"
run_baseline smoke --config "$CFG" --series "$SMOKE_NODE_SERIES" \
  --case crosstable-fixed-sum --issue "$CARD_UUID" --task "$MULTICA_RUN_UUID"
```

- [x] Сначала допустить и завершить `calc-data-double`: пакет `.lgp`, результат CSV, независимый Double = Amount × 2 oracle и **настоящий** judge `gpt-6-astra/high`. Не изменять исходный кейс, где отдельного oracle.csv нет.
- [x] Подтвердить его архивы/модель/процессы/очистку и release; только после безопасного освобождения допустить `crosstable-fixed-sum` отдельной серией.
- [x] Для `crosstable-fixed-sum` проверить наличие артефакта, штатный node validator/code-verdict, архивы, процессы, очистку и release. Артефакта нет, code FAIL; требование наличия артефакта явно снято владельцем для этого smoke по 6.1. PASS проверки артефакта не заявляется.
- [x] Для обоих подтвердить фактическую модель продукта и `medium` по закрытой истории; не ограничиваться env/config. В публичный evidence включать только несекретное заключение, не БД.
- [x] Если артефакта нет, gate остаётся незавершённым. Диагностика допустима, автоматический продуктовый повтор smoke запрещён, даже после исправления причины и при новом каталоге/UUID. Добор этапа 3.2 относится к полной baseline-серии, не снимает это ограничение smoke.
- [ ] Quality FAIL при имеющихся артефакте, выполненных oracle/judge/validator и подтверждённой очистке показать честно; не пытаться получить PASS повторением. Gate интеграции и качество продукта — отдельные поля отчёта.
- [x] Проверить evidence обоих smoke нового разрешённого цикла, загрузить в LAB-54 с сохранением ссылок на LAB-32, скачать, проверить bytes/SHA256/manifest и readback. Зафиксирован незавершённый node gate, readiness 1/2.

**Calc нового цикла завершён и независимо проверен:** manifest `2f8b3b19-dfd3-45c4-819a-315a7beae02d`, source run `20261009-070420-53d03a35b`, одна попытка/infraRetries=0, duration 503769 мс. Product completed/PASS, package/CSV есть, Double 20/40 и независимый oracle PASS; настоящий judge `gpt-6-astra/high`, 1 вызов, 100/100, прежние prompt/schema. Штатный `checkBaseline` основного чата подтвердил complete/cleanup/released и smoke verification. По private copy закрытой истории независимо проверены все 10 assistant messages: `openai/gpt-6.1-sol/medium`, без ошибок; история mode 0700, исходные DB/WAL/SHM bytes неизменны. Управляющий run завершён, LAB-54 `in_review`; readiness 1/2. Attachment `01a11f86-b4a8-74cd-99cf-903649731eaf`, архив 24085 bytes, SHA256 `62df969cba807e8d59d7762daa2ea0659b3f947ed0a17e3565d4cd27ce639bd3`: основной чат скачал его и подтвердил серверные bytes, все 15 членов manifest и отсутствие известных secrets/lease/DB. Node пока ожидает отдельного допуска.

- [x] После повторного FREE/clean/storage EMPTY/queue empty передать отдельное node-поручение без повтора calc: description update `--no-start` и один trigger comment `01a11f8b-9567-7101-be1c-60be61e51ed4`. Node run `01a11f8b-957f-760b-82b6-60e9be9e61cf` dispatched 2026-10-09 10:23:23 MSK, агент начал подготовку; единственный selector `crosstable-fixed-sum`, infraRetries=0, без LLM-судьи. Путь новой серии `R/roles/evalbaseline/results/readiness2-crosstable-fixed-sum-20261009`; результат ещё требуется проверить. Private controller/cursors/receipts хранятся отдельно от результатов и Git: `/home/kiselev/.local/share/loginom-evalbaseline-control/20261009/controller` (0700).

- [x] Проверить завершённый node run, штатный code-verdict, фактическую модель, закрытую историю, cleanup/release и доставку evidence. Артефакт отсутствует; этот пункт не закрывает проверку артефакта выше и этап 6.

**Node нового цикла завершён; readiness 1/2, этап 6 не завершён.** Manifest `38aa02d9-2568-4e87-95c3-f74264525d7b`, source run `20261009-072524-53d03a35b`, единственная попытка, repeat=1/infraRetries=0, duration 513719 мс. Продукт завершился `no_artifact`; штатный валидатор сформировал `FAIL`, code=1, единственная причина `crosstable-fixed-sum#1: no_artifact`, внутренних ошибок валидатора нет. Пакета и CSV нет, LLM-судья не вызывался. Штатный `checkBaseline` основного чата подтвердил measured=1/1, unknown=0, cleanup=true/released=true, smoke verification=false; 21 исходный файл сохранён неизменным.

Основной чат независимо проверил все 19 assistant messages точной сессии `ses_ee0722ae3ffeaDFzCjC38GOH7N` на собственной private copy закрытой истории: `openai/gpt-6.1-sol/medium`, без ошибок модели; исходные DB/WAL/SHM bytes неизменны, история mode 0700. Сохранённые birth identities отсутствуют, пять профилей чисты, harness leases 0, storage EMPTY, внешних отладчиков нет, stand FREE. Оба smoke имеют разные действительные release; calc не повторялся. Multica readback: управляющий run завершён, активных run LAB-54 нет, карточка `blocked`.

Node evidence: attachment `01a11f99-736b-74cb-b29e-fa4a5b714241`, 9373 bytes, SHA256 `33f9ca587fdffb68d09433155159acbc836360235933713b88aa7a797fbc34b5`, delivery manifest SHA256 `cc10b5d6b72f6110630495ed6c39b18c53f57621d7a1e13b9075aea20b9f555b`. Основной чат скачал архив: серверные bytes совпали, все 11 членов manifest проверены, известных auth/lease secrets и приватных DB/env/owner файлов нет. Root proof: `R/evidence/readiness2-node-root-verification-20261009.json`.

**Доказанная продуктовая причина:** импорт выполнен, Кросс-таблица настроена и исполнена, затем операция `pivot-sales` остановилась на phase=read с `NODE_APPLY_STOPPED` / `F3 is restricted to an observed graph table output`. В настоящем наблюдении wizard absent, выход kind=port/Output_Data-0, но Loginom присвоил имя `cols:_Category;__rows:_Region;__cells:_Amount`. Встроенный `validateUiAction` закреплённого CLI source `fc3d97dbf695c2ed8dba942feb6fe83591a33944` допускает в адресе узла только один сегмент `[^;]+`. Без модели воспроизведено отклонение точного наблюдённого tid; контрольный короткий label проходит, Input_Data и Output_Var остаются запрещены. Проверенный source blob совпадает с fc3d97db. Это не ошибка каталога, авторизации или judge; исправление guard меняет оцениваемый продукт, подсказка в eval prompt меняет условия измерения.

**Следующий шаг требует решения владельца:** исходный план запрещает полный start при отсутствии smoke-артефакта и автоматический повтор smoke. Все допустимые проверки и диагностика выполнены. Нужно либо явно пересмотреть этот критерий допуска для данного известного продуктового FAIL, сохранив CLI/корпус/ошибку, либо согласовать исправление продукта и новые пины/проверки. До решения новый smoke, полная карточка/start и монитор полного baseline не запускаются; этапы 7–9 остаются обязательными после допуска.

### 6.1. Разрешение владельца продолжить на CLI 0.1.17 — выполнено

Пользователь прямо разрешил полный baseline текущего CLI 0.1.17 при `no_artifact` node smoke и запретил отдельные повторы smoke. Это заменяет требование node-артефакта только для manifest `38aa02d9-2568-4e87-95c3-f74264525d7b`; исходный smoke остаётся incomplete/FAIL, raw readiness — 1/2. Calc, обе очистки/release, модель и evidence подтверждены. Новый допуск хранится в неизменяемом manifest полной серии и действует при resume; отчёт отдельно показывает проверенную readiness и принятое владельцем исключение.

- [x] Зафиксировать точное разрешение, исходный node FAIL и запрет новых smoke.
- [x] По TDD добавить `prepare --accept-node-smoke-no-artifact <manifest UUID>` и поле manifest `acceptedNodeSmokeNoArtifact`. `checkBaselineReadiness` возвращает отдельное `accepted`; не подменяет complete/ready. Допуск требует точный UUID, live node/no_artifact, measured=1, unknown=0, code evaluator и действительный release/cleanup; calc complete. Изменённые evidence, неизвестный/инфраструктурный исход и другие пины запрещают допуск.
- [x] Сохранить исходный corpus SHA через `EVAL_CORPUS_SHA`, проверяя неизменность дерева `evals/tasks` относительно этого SHA. Разрешить различаться только operational harness SHA, поскольку helper обновляется; CLI/source/models/rubrics/isolation/config/corpus сохраняются.
- [x] Выполнить целевые тесты, полный `bun test` и `bun typecheck`; коммит. TDD red/green подтверждены; 558 PASS/9 clean-host SKIP/0 FAIL, 567 тестов/48 файлов/2752 assertions, 591.17 с; typecheck PASS.
- [x] При FREE/пустых очередях/чистых профилях атомарно поставить новую единую версию supplement и проверить readback всех исполнителей. Старые smoke/evidence/supplement сохранить.
- [x] Проверить немодельный допуск по настоящим LAB-54 manifest/release и свежим пинам: raw complete=1/2/ready=false, accepted=true. Дальнейшее выполнение этапов 7–9 разрешено без дополнительного запроса.

Проверено на сервере 2026-10-09: operational SHA `ee7861513be1c4309fdf1678ccae78ad89522973`, corpus SHA `53d03a35b0ee2901b40c1a1bbb0170804d59e865`, immutable supplement 733 файла, manifest SHA256 `67a877dae2e6962da7c70a741ed617d65d88d7b569280e875ad9d7a95f4de8ea`. Runtime был остановлен только при FREE/пустых очередях/чистых профилях, затем возобновлён. Config bytes и 148 файлов smoke неизменны; все настройки четырёх исполнителей сохранены, instructions/starters проверены readback. Немодельный live pin/readiness check дал `accepted=true`; CLI/source/модель/судья/изоляция/корпус прежние. Proof: `R/evidence/baseline-accepted-readiness-ee7861513.json`, backup/activation: `R/operations/acceptance-update-ee7861513/`. Последующие doc-коммиты не меняют этот серверный SHA.

## 7. Обязательно создать карточку полного baseline и запустить её в работу — выполнено

**Этот этап обязателен. Реализация не заканчивается готовым агентом, планом, `prepare`, новой карточкой в backlog или отчётом smoke.**

Создана [LAB-55](https://mas.kartamyshev.dev/lab/issues/LAB-55), UUID `01a11fc1-8ded-7600-8251-66d97a4add78`, existing project/префикс/метка baseline проверены. Создана без assignee/run до регистрации монитора. Путь единственной серии `R/roles/evalbaseline/results/full-baseline-20261009-cli017-53d03a35b`; описание и инструкция EvalBaseline закрепляют это поручение, исходный corpus и node exception. Private create intent/receipt сохранены; дубликата карточки нет.

Штатный assign выполнен один раз после включения монитора. Readback: карточка `in_progress`, один native run `01a11fc8-1ebb-7371-907b-16e7d26c14f4` — `running`, начало 2026-10-09 11:29:32 Europe/Moscow; EvalBaseline/runtime `eval-tests`. Агент подтвердил настоящий MCP actor search/read с автоматическим Git Peer собственного checkout, выполнил `prepare` и `start`. Manifest `f8c70eb0-88b6-457d-99a0-cd4ccb44d0b9`, SHA256 `48b60d07dc71b3b6b528297a04cfd395fe9299507600acc2058e91031096d689`: 48 кейсов (3 regular/35 analytic/10 node), 144 уникальных задания в трёх кругах; hash journal совпадает. Закреплены corpus `53d03a35b`, supplement `ee7861513`, исходный node exception и остальные пины. Root проверил owner общего lease с точными card/run UUID, birth identity executor и первый продуктовый CLI 0.1.17 внутри bubblewrap. Первый job `regular-calc-data-double-1` начат в 11:34:09 МСК; source run `20261009-083411-ee7861513`. Это подтверждает начало полной серии; итоговая полнота ещё не достигнута.

- [x] После прохождения этапов 3–6 (с явным исключением 6.1) **создать новую карточку Multica** в проекте `Loginom node evals`: заголовок `[Baseline] CLI 0.1.17 — <короткий corpus SHA> — 3 попытки`; метка `baseline`; исполнитель EvalBaseline `77032943-ad18-4ae9-a2c6-668769077c86`; вне squad. Связать её с readiness/evidence LAB-32.
- [x] В описание записать задание на полный корпус, все пины и фактический N, три круга, лимиты, единственный lease, правила добора/UNKNOWN/immutable evidence, путь результатов, критерий complete и запрет повторять валидное измерение ради качества. При повторном входе сначала найти карточку по сохранённому UUID/маркеру этого запуска, чтобы не создать дубликат.
- [x] При создании сохранить UUID/ссылку карточки и локатор будущей серии в checkpoint до 20 строк. Ещё не запускать продукт до включения контроля этапа 8.
- [x] Обновить инструкцию EvalBaseline: прежнее требование нового разрешения на полный baseline для **этой созданной карточки** заменено настоящим поручением. Автономные расписания/выбор следующей карточки самому EvalBaseline не добавлять.
- [x] Включить `/loop 15m` в основном чате по этапу 8, проверить регистрацию пробуждений и выполнить первый контроль сразу.
- [x] **Запустить новую карточку в работу** штатным Multica start/assign без `--no-start`. Если API уже создал run, второй раз start/rerun не вызывать. Сохранить настоящий run UUID.
- [x] Проверить readback: нужный исполнитель/runtime, один реальный run `running`, карточка `in_progress` согласно нативному workflow. Смена статуса вручную без реального run не подтверждает запуск. При занятом runtime оставить единственный queued run и сопровождать до `running`.
- [x] В реальном задании EvalBaseline выполнить `prepare`, сохранить UUID manifest и путь серии в карточке/checkpoint, проверить N × 3 jobs, затем **выполнить `start`**:

```sh
run_baseline prepare --config "$CFG" --series "$BASELINE_SERIES" \
  --accept-node-smoke-no-artifact 38aa02d9-2568-4e87-95c3-f74264525d7b
run_baseline start --config "$CFG" --series "$BASELINE_SERIES" \
  --issue "$BASELINE_CARD_UUID" --task "$BASELINE_MULTICA_RUN_UUID"
```

- [x] Подтвердить фактический запуск executor, правильного owner общего lease и первого продуктового измерения. UUID карточки, UUID Multica run и UUID manifest различны; не подставлять один вместо другого.
- [x] Передать пользователю ссылку созданной карточки, baseline ID, corpus SHA, N × 3 и время начала по Europe/Moscow; контроль — каждые 15 минут штатным heartbeat.

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

## 8. Контроль из этого чата каждые 15 минут через `/loop` — включён, сопровождение продолжается

Heartbeat `lab-55-baseline-cli-0-1-17` создан штатным инструментом, ACTIVE, thread `01a11a65-5025-7050-8d46-cee03e4023f3`, интервал **15 минут** по уточнению владельца. View и сохранённая конфигурация подтвердили статус/target/интервал; первый контроль карточки и среды выполнен сразу до assign. Private состояние: `controller/baseline-monitor-state.json`.

После фактического `start` выполнен дополнительный контроль: один native run `running`, manifest 48/144, первый продуктовый slot активен, общий lease и профильный harness lease присутствуют у текущего исполнителя. Фактические UUID manifest/run сохранены в карточке, checkpoint и private state. Для мутаций используется `controller/monitor.lock` с неблокирующим OS flock и свежим чтением Multica/journal/двух leases внутри удерживаемого lock; контракт добавлен в сохранённое heartbeat-поручение и проверен при обновлении карточки без нового запуска. Первое периодическое пробуждение основного чата получено 2026-10-09 11:40:56.854 МСК: повторная проверка подтвердила один живой executor/CLI/bubblewrap, правильные leases, чистый pinned checkout и неизменный manifest; события первого job записываются (74764 bytes к 11:42:31 МСК). Блокеров и оснований для повторного запуска не обнаружено; полнота ещё не достигнута. Private heartbeat proof/cursor сохранены, расписание остаётся активным.

Второй heartbeat получен в 11:55:56.923 МСК. Root public `checkBaseline` подтвердил неизменность evidence и первые 3/144 измерения: `calc-data-double`, `filter-active-rows`, `group-sum-qty`, попытка 1 — PASS/100, judge scored, cleanup confirmed, infrastructure=[]; выполняется `analytic-ab-revenue-per-converter-1` в том же executor/lease. На private copies закрытых DB/WAL/SHM независимо проверены все 43 assistant messages (14/15/14): `openai/gpt-6.1-sol/medium`, model errors=0; hashes оригинальной истории до/после проверки совпадают. Root proof: `R/roles/evalbaseline/work/full-baseline-root-model-check-20261009T090451Z/verification.json`. Полная серия остаётся incomplete, итоговая доставка и release ещё не выполнены; измеренные результаты не повторялись.

Heartbeat 12:55:56.943 МСК: root check подтвердил 7/144 measured, 6 PASS/100 и первый product FAIL `analytic-basket-category-width-1`, source run `20261009-094112-ee7861513`. Исход — `no_artifact`, duration 680287 мс, judge_status=no_artifact, cleanup confirmed, infrastructure=[]; дополнительных executions нет. В сохранённых operation errors найден `NODE_APPLY_STOPPED`: `Node procedure readiness timeout: addressed output definition page at 0; no mutation was authorized`. Это сохранённый продуктовый исход; recovery/retry ради артефакта не допускается. По private copy закрытой истории root проверил все 22 assistant messages: точные product model/medium, model errors=0, original DB/WAL/SHM hashes unchanged. Proof: `R/roles/evalbaseline/work/full-baseline-root-basket-fail-20261009T095746Z/verification.json`. Тот же живой executor/lease перешёл к `budget-variance-by-category`; текущий frozen SHA/config/pins сохранены. FAIL учитывается в полном baseline, серия продолжается без его повторения.

**Владелец мониторинга — основной чат, не Multica squad и не новая задача Codex.** Каждое пробуждение запускает проверку агента-контроллера; оно не перезапускает EvalBaseline или продукт каждые 15 минут.

- [x] Проверить существующие loop/heartbeat и устойчивое состояние контроллера; повторный вход не создаёт дубликат расписания или executor.
- [x] Включить `/loop 15m` с приведённым ниже поручением и идентификаторами созданной карточки/серии. Сначала выполнить один контроль сразу; следующий — через 15 минут.
- [x] Подтвердить регистрацию механизма пробуждений именно **этого** чата. Skill `loop` описывает monitored output с `notify_on_output`; в интерфейсе `exec_command`, доступном при составлении плана, этого параметра нет. Поэтому для исполнения использовать доступный штатный thread heartbeat `automation_update` с интервалом 15 минут и этим же поручением. Не считать фоновый `sleep` подтверждением работающего мониторинга; OS cron и отдельную standalone Codex-задачу не создавать.
- [x] Сохранить ID loop/heartbeat, thread ID, карточку, manifest ID/путь (ID заполняется после реального prepare), source SHA, последнее завершённое измерение, наблюдаемое текущее исполнение, активный incident и следующую проверку. Публичный checkpoint — до 20 строк; private receipts/guards хранить отдельно, без публикации tokens.
- [x] Защитить действия контроллера от перекрывающихся тиков. Перед любой мутацией получить private `monitor.lock` через `fcntl.flock(LOCK_EX | LOCK_NB)` и внутри удерживаемого fd повторно прочитать Multica run, journal и обе блокировки. При занятом lock пропустить мутацию; действия над стендом выполняет один контроллер.

**Поручение для `/loop 15m` / thread heartbeat:**

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
- [ ] Основной чат сопровождал работу каждые 15 минут, устранял доступные ему блокеры и не терял завершённые измерения.
- [ ] Получен полный N × 3 baseline, стенд освобождён, скачанный evidence и Multica readback проверены, монитор отключён.

Невозможность подтвердить cleanup, неизвестный исход, отсутствие артефакта smoke или необходимое изменение пинов не маскируются словом «готово». Контроллер продолжает допустимую диагностику; если требуется действие, которое недоступно ему или противоречит закреплённым ограничениям, сообщает точную причину и требуемое решение.
