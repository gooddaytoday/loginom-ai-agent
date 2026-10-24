# Общее чтение выходного порта — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** получить точные ограниченные результаты напрямую от порта и подключить общий путь Calculator без создания Table.

**Architecture:** один узкий метод существующего `channel` выполняет чтение в авторизованном браузере; преобразование значений и контроль 512 KiB происходят до передачи в host. Обработчик сохраняет свою проверку схемы, а доставка и журнал используют существующие механизмы. Сначала проверяется реальное чтение, затем сложные значения и только после парной сверки переключается рабочий путь.

**Tech Stack:** JavaScript ESM, Node test runner, закреплённые Node/Playwright/Chromium из [release manifest](../../../packages/product/loginom-release.json), встроенный Temporal браузера, существующие Python-проверки.

**Spec:** [утверждённая редакция 2 с дополнением](../specs/2026-10-24-port-output-reading-design.md). Продолжение — [остальные обработчики и приёмка](2026-10-24-port-output-integration.md). Читать оба документа; реализация разрешена владельцем 25.10.2026.

## Global Constraints

- «Всё чтение проходит одним обращением host→browser»; reader не вызывает Execute. Метаданные и адресные дочитывания могут требовать нескольких RPC.
- «Сохраняются 100 строк и 10 000 ячеек; добавляются только полные строки». 512 KiB — UTF-8 JSON массива строк простых значений, бюджет доставки — отдельно 46 000 байт.
- `freshness_basis:'completed_execution_port_source'`; точные метки, правила Variant/DateTime/−0 и разрешённые отличия — исключительно по разделам «Значения» и «Разрешённые видимые изменения» спецификации.
- «Native full сохраняет существующий путь через F3»; 50×8, native tags/bytes, decoder, pins и отказы не меняются.
- «В host возвращаются только простые JSON-значения»; proxy, cookies кэша, session и авторизация остаются в браузере и не журналируются.
- `cleanup_complete:true` — только после завершения обращений, dispose собственных ссылок и подтверждения исходного контекста. Отмена/таймаут не разрешают повтор, новый deadline или позднюю публикацию.
- Существующие Table helpers сохраняются для независимых проверок. Новые сервисы, кэш агента, зависимости, публичный RPC, настройки и универсальная система reader-ов не нужны.

## Review Focus

- Чужой порт, старое выполнение или подменённый кэш: отказ без выдачи значений, тесты задачи 1.
- Отмена после dispatch и ошибка одного параллельного RPC: дождаться начатых обращений либо удержать неопределённость; задачи 1–2.
- Дата до OLE-эпохи, годы 0–99, пропущенное местное время и далёкое будущее: точный результат либо оговорённый отказ, задача 2.
- Int64 за пределами Number, −0, настоящая «…» и длинный Unicode-текст: без округления/усечения, задача 2.
- Секрет в JSON-строке и компактный ответ: действующая редакция до ACK, целые строки и правильная неполнота, задача 3.

---

## Объём и порядок

Это первый из двух последовательных планов, не отдельная подсистема. Общая ветка `calculator-node.mjs` обслуживает также обёртки Calculator; переключать её целиком, без флага на каждый тип. Native full и четыре `implementation.readOutputs` пока продолжают прежний путь.

Первый сквозной результат: один завершённый Execute → новый reader → старый строгий Table на том же порту → сравнение значений. До его успеха не строить расширенную тестовую обвязку и не переключать обработчики.

Оценка реализации этого плана: 16–20 файлов, примерно +1 000–1 600/−80–160 строк по `git diff --stat`, включая тесты и документацию. Большая часть — привязка браузерных объектов и проверки границ. При превышении верхней оценки вдвое пересмотреть решение до продолжения. Изменение сборки, установка продукта, релиз, push/PR и приёмка новой модели вне объёма.

| Файлы | Ответственность |
| --- | --- |
| Новый `packages/loginom-runtime/client/lib/node-port-output.mjs` | Генератор фиксированного browser-кода, чтение/освобождение источника, преобразование ячеек |
| `packages/loginom-runtime/client/lib/node-procedure.mjs` | Узкий dispatch, исходный deadline, отмена и состояние завершения |
| `packages/loginom-runtime/client/lib/calculator-node.mjs` | Первое рабочее подключение; существующие mapping/CrossTable/native full |
| `packages/loginom-runtime/client/lib/node-support.mjs` | Действующая нормализация результата до журнального ACK |
| `packages/loginom-runtime/client/lib/user-results.mjs`, `user-preview-budget.mjs` в том же каталоге | Сохранение происхождения и экономная доставка |
| `packages/loginom-runtime/tools/loginom-acceptance/import_output_evidence.py`, `calculator_output_evidence.py` | Сверка нового результата с независимыми ожидаемыми данными |
| Тесты в задачах ниже | Проверяют реальное преобразование, transport boundary и контракт результата |

`node-context.mjs`, `node-output-context.mjs`, `node-port-open.mjs`, `node-read-contract.mjs` — источники действующих проверок, не повод их переписывать. `node-result-schema.mjs` и `node-contracts.d.ts` уже допускают новые метки и optional freshness_basis; менять их лишь при обнаруженном несовпадении, не создавать новый union. Enum файловых артефактов не расширять.

### Task 1: Прочитать один реальный порт через существующий channel

**Files:**
- Create: `packages/loginom-runtime/client/lib/node-port-output.mjs`.
- Modify: `packages/loginom-runtime/client/lib/node-procedure.mjs`.
- Test: новый `packages/loginom-runtime/client/test/node-port-output.test.mjs`, существующий `packages/loginom-runtime/client/test/node-procedure.test.mjs`.
- Временный live-скрипт: `packages/loginom-runtime/tools/loginom-acceptance/port-read-pair.mjs`; не включать исследовательскую обвязку в коммит, удалить после итоговой приёмки.

**Interfaces:**
- Consumes: `createNodeProcedure(...)`, `validatePreparedNodeContext(binding)`, `readPreparedNodeContext(page,binding)`, `readOutputContext(page,binding)`; прежние port binding checks из `node-port-open.mjs`.
- Produces: `channel.readOutputPort({port, execution, sampleRows, requireExactNumbers}) → Promise<{verified:true, cleanup_complete:true, node_context, output}>`. `execution` — полный локальный verified receipt с owner_verified и execution_id, сверенный вызывающим с `ctx.execution`, а не сокращённый `ctx.execution`.
- Produces: `makeNodePortOutputCode(binding, request, {origin,build,deadline}) → string`, `readNodePortOutput(page,binding,request,options) → Promise<envelope>` в новом модуле. Envelope отказа: `{verified:false,cleanup_complete:boolean,reason:string}` без значений и сырых исключений; channel отказывает вызывающему, сохранив подтверждённое состояние cleanup.
- `output` — существующий `NodeOutputPort`: port/port_guid/fresh/execution_id/freshness_basis, observed schema `{index,name,label,type}`, row_count/sample/sample_rows/sample_complete/precision, при бюджете `limitations:['preview_cell_or_byte_budget']`. Приватные node_context/cleanup не распространяются в публичный порт. data_kind добавляет caller после проверки mapping.

- [x] **Step 1: Добавить один тест `reads_bound_port_without_table`** в новый test-файл. Локальная fixture воспроизводит native graph/port и RPC-объекты по образцу `node-output-context.test.mjs`; исполняет настоящий сериализованный callback в VM, подменяя только окружение. У неё `run(request)`, `rpcCalls`, `uiCalls`, `disposed`; новый общий mock-framework не нужен.

  ```js
  const result = await f.run({port:0, execution, sampleRows:1, requireExactNumbers:true});
  assert.equal(result.output.freshness_basis, 'completed_execution_port_source');
  assert.deepEqual(result.output.sample[0].map(c => c.value), ['9007199254740993', 1.2345678901234567, '']);
  assert.deepEqual(f.uiCalls, []);
  assert.equal(result.cleanup_complete, true);
  assert.deepEqual(f.disposed.sort(), ['columns','dataSource','integerColumn','output','realColumn','stringColumn']);
  ```

- [x] **Step 2: Получить RED.** Из `packages/loginom-runtime/client`: `node --test --test-name-pattern=reads_bound_port_without_table test/node-port-output.test.mjs`. Ожидается отсутствие новой реализации, не ошибка окружения.
- [x] **Step 3: Реализовать один dispatch и минимальный реальный проход.** Не добавлять чтение флагом в `observe`, где есть polling/retry. Внутри одного основного async `page.evaluate` удержать native node/port, получить output → IBGDataSource → schema/count → AsVariant → JSON; освободить приобретённые proxy в finally. Размер итогового ответа и временные объекты проверяются в браузере до передачи; 512 KiB считаются отдельно по значениям. Для первого прогона достаточно Integer/Real/String/NULL; ещё не реализованные случаи явно отказывают, рабочие callers пока не переключены.

  До данных подтвердить active output, исходную document/package/workflow/node/port identity, направление/подтип/индекс/GUID и завершённое выполнение. Для execution переиспользовать образец `variant-native-read.mjs`: сохранённый Ext process store/root, завершённая группа из execution_id, child с ModelNode===node.data, process_id/process_record_id из receipt, отсутствие более новой группы этого узла; node.FStatus===1/FRunning===false, port.FStatus===1. Не переносить static-ancestor ограничения native full на ordinary чтение. Снимок до/после включает те же native ссылки и relevant process records, session/$OW/$O, `$FData`/`$FCacheInitialized` после инициализации. Не открывать console ради проверки и не считать GUID достаточным. Playwright-side readPreparedNodeContext/readOutputContext сами вызывают evaluate: их проверки можно включить в тот же execute, но не вставлять как browser-функции внутрь callback.

  Channel использует имеющийся execute с timeout `Math.max(5000,deadline-now()+5000)`, а browser получает исходный абсолютный deadline. Перед dispatch инвалидировать gesture snapshots и снять возможность считать работу завершённой; после ответа проверить envelope/контекст, обновить cleanupConfirmed из подтверждённого cleanup и проверить signal/deadline до журналирования данных. Только ошибка самого dispatch помечает transportUncertain; post-return отмена не превращает завершённый вызов в потерянный. Повторного dispatch и новой долговечной записи владения нет.

- [x] **Step 4: Получить GREEN и первый live-результат.** Тот же тест PASS. В существующей авторизованной сессии временный модуль экспортирует `comparePortRead({channel,port,execution,expectedColumns,sampleRows})`: сначала `channel.readOutputPort`, затем существующие openNewOutputTable → configureTablePrecision → prepareTableRead → readTableOutputPages → decodeTableOutput; restoreTablePrecision/returnFromOutputTable выполняются при завершении. Он не вызывает Execute и не создаёт второй браузер.

  До вызова один раз выполнить узел штатным `createNodeExecutionProcedure`: prepare → launchGraph → identify → waitCompleted. Для Int64 использовать Text Import CSV `collapse/acceptance-kit/fixtures/mixed.csv`; для первой пары штатным mapping оставить только Id/I/R/S, исключив B/D, ещё не поддержанные этим шагом. Полную схему проверить в задаче 2. Результат прогона: одинаковые port/execution/schema/count/значения с разрешённым исключением −0; отсутствие Table-действий у прямого чтения. Готовой универсальной CLI-команды здесь нет: использовать execute/channel текущего operator-сеанса, не переносить старый macOS `calculator-live.mjs` как Linux launcher. Если сессии нет, сообщить конкретный блокер; не заменять этот шаг unit-тестами.
- [x] **Step 5: По одному добавить негативные тесты, затем прогнать адресный набор.** Изменять только одну из реальных границ fixture: чужой node/port, inactive output, старый execution, замена `$FData`/сброс cache, отмена до/после dispatch, потерянный ответ. Условия: `assert.equal(published,false)`, `assert.equal(dispatches,1)` после dispatch; до dispatch — 0; неизвестный ответ не подтверждает cleanup. Проверить отсутствие session/cookies/proxy в сериализованном результате и журнале. Команда: `node --test test/node-port-output.test.mjs test/node-procedure.test.mjs test/node-output-context.test.mjs` — PASS.
- [x] **Step 6: Коммит.** `git add` только перечисленных production/test файлов; `git commit -m "feat(runtime): read bound output ports directly"`. Live evidence хранить вне Git, зафиксировать вывод и ограничение в checkpoint не более 20 строк этого плана.

### Task 2: Довести типы, длинные строки и бюджеты до утверждённого контракта

**Files:**
- Modify: `packages/loginom-runtime/client/lib/node-port-output.mjs`, `packages/loginom-runtime/client/test/node-port-output.test.mjs`.
- Create: `packages/loginom-runtime/client/test/node-port-output-datetime.integration.test.mjs`.

**Interfaces:**
- Consumes: envelope и channel задачи 1.
- Produces: `decodePortCell(value,type) → {cell,limitations}` в том же модуле; функция сериализуется в основной browser callback без closure-imports и вызывается там. `cell` использует существующий тип ячейки; limitations — действующие numeric/variant/datetime precision limitations. Strict-проверка и общий precision выполняются reader-ом; новый parser транспорта не появляется.

- [ ] **Step 1: Добавить тесты по одному с RED/GREEN.** Сначала `preserves_native_scalar_values`: все NULL, Int64 MIN/MAX и 9007199254740993 как строки, Boolean true/false, пустая/пробел/NBSP/CRLF, real после 9-го знака/5e−324/MAX/−0. Затем `marks_variant_and_nonfinite_unverified`: ненулевой Variant и NaN/±Infinity в false дают unverified, в true отказывают; VT_UNKNOWN не сериализуется; NULL Variant допустим. Проверять точные метки из спецификации, например:

  ```js
  assert.equal(integer.cell.value, '9223372036854775807');
  assert.equal(real.cell.decimal, '-0');
  assert.ok(Object.is(Number(JSON.parse(JSON.stringify(real.cell)).decimal), -0));
  assert.equal(string.cell.representation, 'data_source_string');
  assert.equal(string.cell.precision, 'source_text');
  assert.equal(boolean.cell.precision, 'exact_boolean');
  assert.equal(Object.hasOwn(string.cell, 'display_text'), false);
  ```

  Run: `node --test test/node-port-output.test.mjs` из client после каждого изменения; ожидается PASS. `precision.strings` точно `data source text; existing secret redaction applies; original byte encoding is not attested`. numbers_verified остаётся false при numeric/variant limitation; одна datetime limitation его не сбрасывает. Считать 512 KiB по простым значениям (у VT_UNKNOWN без текста — null), не по typed metadata. Не делать Int64 → Number.
- [ ] **Step 2: Добавить `rereads_strings_one_row_at_a_time` и реализовать адресное дочитывание.** Условия ровно `value.length >= 5000 || value.endsWith('…')`; String и строковый Variant, включая 4 999/5 000/5 001/20 000, настоящий суффикс и emoji. Ячейки текущей строки запускаются параллельно; перед dispose дождаться всех начатых обращений даже при ошибке одного. Следующую строку не запускать, если полная текущая не помещается. Тест использует управляемые promises, не тайминги:

  ```js
  assert.deepEqual(f.startedRows, [0]);
  assert.equal(f.pendingInRow(0), 2);
  // После завершения всех дочитываний этой строки:
  assert.equal(result.output.sample[0][0].value.length, 20000);
  assert.equal(f.disposedBeforeSettlement, false);
  ```

  Отдельными случаями проверить ошибку AsString, отсутствие публикации префикса, нулевой count и sampleRows=0 без cell RPC, ровно 100 строк/10 000 ячеек/524 288 байт и первую непомещающуюся целую строку. При 0 запрошенных строк непустой источник остаётся неполным. RED/GREEN: тот же test-файл.
- [ ] **Step 3: Добавить browser-тест `civil_dates_use_bounded_transition_scan`, затем реализовать даты.** Исполнять настоящую decodePortCell в закреплённом Chromium с timezoneId контекста, а не предполагать Temporal в Node. Перенести в test-file 44 набора входов/ожиданий из `/home/george/.codex/visualizations/2026/10/23/01a16a4b-9b0a-7472-a239-75200e80360e/rev2/offline-datetime-probe.cjs`, перечисленных в спецификации, не копируя production-алгоритм в expected; после переноса тест не зависит от этого временного файла. До OLE-коррекции пройти переходы от instant+1ns до null или первого `T ≤ instant − 48ч`; положительная Δ и `[T,T+Δ)` означают неоднозначность. Сохранить проверку суток 1900+Y для годов 0–99; затем UTC-компоненты и формулу x<0 из спецификации.

  Assertions: `assert.equal(actual.value, expectedCivil)` для точных случаев; `assert.equal(actual.precision,'unverified')` и datetime limitation для неоднозначных, strict отказ; Date внутри Variant проходит ту же проверку. Для 9999-12-31 проверить равенство вердикта и ограничение сканирования, не фиксировать миллисекунды производительности. Команда из client: `LOGINOM_DOCK_TEST_BROWSER="$PORT_READ_CHROMIUM" node --test test/node-port-output-datetime.integration.test.mjs`; переменная указывает на проверенный Chromium из manifest. Отсутствие браузера — невыполненная проверка, не PASS/SKIP.
- [ ] **Step 4: Повторить парную сверку сложных значений до переключения callers.** На одном выполнении сначала новый reader, затем Table. Для >16 384 символов использовать исходный текст либо Table ValueText: старый reader откажет. Int64 — через CSV, не JS-запись. Разрешённые расхождения только из спецификации, включая −0 и неоднозначные даты/Variant. Измерить dirty перед новым чтением и сразу после на сохранённом чистом пакете, до открытия Table. Адресные тесты задачи 1 и оба новых test-файла — PASS.
- [ ] **Step 5: Коммит.** `git commit -m "feat(runtime): preserve port values and bounded full strings"` с тремя файлами этой задачи. Не включать временный probe и raw evidence.

### Task 3: Подключить общий путь Calculator, журнал и доставку

**Files:**
- Modify: `packages/loginom-runtime/client/lib/{calculator-node,node-support,user-results,user-preview-budget}.mjs`.
- Test: `packages/loginom-runtime/client/test/{node-result-schema,user-results,user-preview-budget,node-output-json-journal}.test.mjs`.
- Modify: `packages/loginom-runtime/tools/loginom-acceptance/{import_output_evidence,calculator_output_evidence}.py`; Test: `packages/loginom-runtime/tools/loginom-acceptance/test_import_output_evidence.py`.

**Interfaces:**
- Consumes: `channel.readOutputPort` задач 1–2, `alignReadSchema(actual,expected)`, существующий `implementation.materializedSchema`, `nodeOutputForJournal(value,redactor)`, `compactNodeResult(result,{wireSize})`, `budgetUserPreview(reply,{wireSize})`.
- Produces: прежний `readOutput(read,ctx)` с новым ordinary port и без Table evidence; native full ветка и implementation.readOutputs остаются. Общий Python `verify_port_output(port,expected_columns,expected_rows,execution_id,port_index) → list[str]` в import_output_evidence используется Calculator, затем остальными текущими consumers; независимые expected не брать из reader.

- [ ] **Step 1: Зафиксировать новый внешний результат тестом.** Новый порт без UI-полей проходит существующий nodeApplyResultSchema; 101 строка не проходит. Compact сохраняет freshness_basis и смысл ячеек, не создаёт workflow_returned. Проверить копию исходной квитанции и настоящий MCP wireSize:

  ```js
  assert.equal(compact.output.ports[0].freshness_basis, 'completed_execution_port_source');
  assert.equal(Object.hasOwn(compact.output, 'workflow_returned'), false);
  assert.ok(wireSize(reply) <= 46000);
  assert.ok(newPort.sample_rows >= oldPort.sample_rows);
  assert.deepEqual(original, before);
  ```

- [ ] **Step 2: RED/GREEN доставки.** Из client: `node --test test/node-result-schema.test.mjs test/user-results.test.mjs test/user-preview-budget.test.mjs`. Добавить freshness_basis в pick порта, новую пару source_text/data_source_string в compact-бюджет; сохранить старую пару для ещё не переключённых путей/истории. Только целые строки, без потери длинной ячейки; native full и JavaScript full сохраняют отдельные отказы. Менять схему/типы ради переименования не требуется.
- [ ] **Step 3: Переключить shared ordinary readOutput после успешной пары.** В calculator-node передавать executionReceipt, убрать readView/formatting/собственную Table restoration только у этого пути. Для CrossTable сначала materializedSchema(output.schema,...), для остальных — проверенная columns; сравнить схему существующим правилом и перенести mapping data_kind. Не копировать implementation на каждый узел. Native full dispatch остаётся раньше ordinary, readOutputs overrides пока прежние.
- [ ] **Step 4: Нормализовать новый результат до durable ACK.** В node-support использовать существующий nodeOutputForJournal для ordinary port с новым freshness_basis, сохранив уже действующую обработку REST/Join/JavaScript. Не менять native/file outputs и не создавать второй redactor. Расширить реальный journal-тест JSON/URL/длинной строки/Int64/−0: `assert.deepEqual(ack.receipt.value,value)`, входной объект неизменен, секретов нет, redaction_failure отказывает. `node --test test/node-output-json-journal.test.mjs test/execution-journal.test.mjs` — PASS.
- [ ] **Step 5: Обновить проверяющий модуль Calculator вместе с producer.** Новый verify_port_output сравнивает port/execution/freshness, полную ожидаемую схему, count/coverage, NULL и значения; его вызывающий verify_calculator_output сохраняет verify_internal_sequence и verify_execution_observations. verify_table_output_observations не менять: это действующий независимый Table-оракул. Проверить положительный новый порт и по одному повреждённые execution/port/schema/value/coverage. Из acceptance: `python3 -m unittest test_import_output_evidence` — PASS; результаты Calculator проверяются по fixture, не по самому себе.
- [ ] **Step 6: Проверить первый пользовательский результат.** Штатный dock_node_apply Calculator возвращает новый port, его compact/MCP и журнал согласованы, выполнение одно, Table не создаётся. Повторить с strict true/false; exact значения равны. Проверить обычный CrossTable через существующую materializedSchema и неизменный native full dispatch. Из client: `node --test test/node-port-output.test.mjs test/node-procedure.test.mjs test/node-result-schema.test.mjs test/user-results.test.mjs test/user-preview-budget.test.mjs test/node-output-json-journal.test.mjs test/calculator-precision-warning.test.mjs test/crosstable-schema.test.mjs` — PASS.
- [ ] **Step 7: Коммит.** `git commit -m "feat(runtime): use port output in shared node reading"` с перечисленными файлами. Результат плана — работающий общий ordinary путь; оставшиеся семь мест и итоговые проверки выполняются по второму плану, вся задача пока не завершена.

## Передача

Владелец разрешил реализацию 25.10.2026: последовательное выполнение через subagent-driven-development, TDD и проверки executing-plans. Выполненные задачи отмечаются ниже; после любого изменения контракта/гарантий — новая независимая проверка плана.

Проверка обоих планов: самостоятельная сверка покрытия спецификации, шагов, интерфейсов и объёма выполнена; независимое ревью завершено, обязательные замечания устранены. Проверены относительные ссылки и diff. Это проверка документов, не программной реализации.

## Checkpoint реализации

- Task 1 выполнена: приватный channel reader, минимальные типы и guards; независимое ревью PASS после исправления отмены во время journal ACK.
- Закреплённый Node: адресный набор 170 PASS, 0 FAIL, 0 SKIP.
- Live-пара: один Execute Text Import, 3×4 Id/I/R/S; 9007199254740993 точен, отличие только согласованный −0, cleanup подтверждён.
- Один замер: прямое чтение 1 168 мс, строгая Table 25 522 мс; это не медиана и не обещание ускорения.
- Evidence вне Git: `/tmp/port-read-implementation-UQXxUL/{first-pair,paired-direct,paired-table}.json`.
- Рабочие callers пока не переключены; полные типы/строки/лимиты и браузерные даты — Task 2, затем интеграция.
