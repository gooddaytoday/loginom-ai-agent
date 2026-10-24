# Подключение обработчиков и приёмка чтения порта — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** перевести все восемь рабочих мест чтения на общий портовый reader и подтвердить сохранение результатов, настройки узлов и независимых проверок.

**Architecture:** использовать готовый channel.readOutputPort из [первого плана](2026-10-24-port-output-reader.md); каждый обработчик сохраняет собственную схему и lifecycle. Действующие проверяющие модули принимают новый результат, а Table cold/civil-оракулы и исторические отчёты сохраняют прежний контракт. Общие изменения заканчиваются проверкой публичного ответа и сравнением времени полного чтения.

**Tech Stack:** существующие JavaScript runtime/Node tests, Python unittest, Bun tests/typecheck в evals; версии берутся из [release manifest](../../../packages/product/loginom-release.json), зависимостей не добавлять.

**Spec:** [утверждённый дизайн](../specs/2026-10-24-port-output-reading-design.md). Зависит от завершения первого плана; реализация разрешена владельцем 25.10.2026.

## Global Constraints

- Все ограничения первого плана действуют здесь; интерфейс channel и тип output определены там один раз.
- «Все восемь рабочих мест создания Table переходят на одну процедуру; копий нового reader-а нет».
- «Проверяются все запрошенные выходы в исходном порядке; атомарный снимок нескольких портов не заявляется».
- Filter: «при Execute минимум один запрошенный из 0/1, не обязательно оба»; настраиваются оба выхода.
- `dock_node_read` сохраняет новое Execute; reader никогда не запускает узел. Настройка/обучение/materialization, source admission JavaScript и файловый Text Export не меняются.
- «Удаление старого пути из рабочего чтения разрешено только после парной сверки»; старый strict Table остаётся независимым оракулом.
- «Native full продолжает использовать Preview через F3». Существующие ограничения JavaScript full и доставки 46 000 байт сохраняются.
- Нет новых публичных параметров, retries, очередей, настроек, фоновиков или автоматического повторного запуска после неопределённости. Push, PR, merge, выпуск и installed acceptance не входят в этот план.

## Review Focus

- Один выбранный Filter-порт либо два разных ML-порта: правильные схема/порядок/GUID и прежний Execute, задача 1.
- Import civil/cold: новый producer не становится собственным независимым оракулом, задача 1.
- JavaScript full или повторное чтение: source admission, физический порт и свежий execution не теряются, задача 2.
- Изменившаяся схема CrossTable и исторический eval: новый provenance принимается только при прежних проверках принадлежности; история продолжает читаться, задача 2.
- Остановленное чтение: подтверждённое освобождение без Table допустимо, потерянный ответ удерживает браузер; задача 2, итоговая регрессия задачи 3.

---

## Объём и критерий завершения

Оценка: 25–35 файлов, примерно +450–900/−250–500 строк по `git diff --stat`, включая тесты и документацию. Если верхняя оценка превышена вдвое, пересмотреть разбиение до продолжения. Новый механизм только один — уже построенный общий reader; отдельный reader на тип узла и общий acceptance-framework не нужны.

Завершение: все восемь мест используют общий reader; парная сверка и перечисленные в дизайне проверки проходят; неизвестные ответы не выдаются за cleanup; актуальные потребители результата работают; native full и независимые Table-оракулы сохранены. Непроверенная live-ветка остаётся ограничением, а не выполненным пунктом. Скорость измеряется, заранее заданного коэффициента ускорения нет.

Все runtime пути ниже относительно `packages/loginom-runtime`. Точные файлы перечислены в задачах; общие `node-result-schema.mjs`/`node-contracts.d.ts` уже совместимы. Внешние пакеты меняются только там, где назван текущий потребитель.

### Task 1: Специальные выходы Filter/Regression/Clustering/REST и Text Import

**Files:**
- Modify: `client/lib/{filter-output,linregression-output,clustering-output,rest-request-node,text-import-node}.mjs`.
- Test: новый `client/test/node-port-output-callers.test.mjs`; существующие `client/test/{filter-procedure,linregression-output,clustering-output,text-import-node}.test.mjs` сохраняют проверки настройки.
- Modify: `tools/loginom-acceptance/{import_output_evidence,row_filter_output_evidence,full_read_evidence}.py`; Test: существующие `test_import_output_evidence.py`, `test_full_read_evidence.py` и новый `test_port_output_evidence.py` в том же каталоге.
- Modify: `tools/loginom-acceptance/javascript-native-input-driver.mjs`, `javascript-native-input-contract.mjs`; Test: `tools/loginom-acceptance/javascript-native-datetime.test.mjs`.

**Interfaces:**
- Consumes: `channel.readOutputPort({port,execution,sampleRows,requireExactNumbers})` первого плана; возвращаемый `result.output` после alignment становится элементом ports.
- Produces: существующие `readFilterOutputs(channel,read,ctx,mapped)`, `readLinRegressionOutputs(channel,read,ctx,mapped)`, `readClusteringOutputs(channel,read,ctx,mapped)`, private `readRestOutputs(channel,read,ctx)` сохраняют сигнатуры. Общая оболочка передаёт в ctx полный execution receipt для чтения: `ctx.portExecution`, равный её verified executionReceipt; ctx.execution остаётся прежним.
- Text Import сохраняет `createTextImportNodeSupport({targetOrigin,targetBuild,...})` и `readOutput(read,ctx)`; удаляется утративший источник private onTableRead. Его единственный civil-потребитель самостоятельно получает Table receipts после base.readOutput, без Execute. Новый универсальный hook не нужен.
- Python consumers используют `verify_port_output(...)` первого плана; Table-verifier не подменяется.

- [x] **Step 1: Проверить первый multi-output caller тестом `filter_reads_only_requested_ports`.** Новый test-файл вызывает настоящий экспорт readFilterOutputs с узким channel fixture, у которого только readOutputPort и запись аргументов; UI-методы бросают ошибку. Сначала один выход, затем оба в запрошенном порядке; результаты задать в новом public формате:

  ```js
  const result = await readFilterOutputs(channel, {...read,ports:[1]}, ctx, mapped);
  assert.deepEqual(calls.map(c => c.port), [1]);
  assert.equal(calls[0].execution, ctx.portExecution);
  assert.deepEqual(result.ports.map(p => p.port), [1]);
  assert.equal(result.execution_id, ctx.execution.execution_id);
  assert.equal(Object.hasOwn(result, 'port_evidence'), false);
  ```

- [x] **Step 2: RED/GREEN Filter.** Из client: `node --test --test-name-pattern=filter_reads_only_requested_ports test/node-port-output-callers.test.mjs`. После парной сверки данного выхода заменить Table-цепочку на channel reader, сохранить mapped schema, отдельные GUID и настройку обоих портов. В calculator-node вызов implementation.readOutputs получает `{...ctx,portExecution:executionReceipt}`; добавить этот единственный необходимый файл в commit задачи. Результат теста — PASS.
- [x] **Step 3: Аналогично по одному подключить Regression, Clustering и REST.** В том же test-файле проверять Regression prediction/coefficients, отсутствие исключённых коэффициентов; Clustering Cluster/Distance и разрешённый порядок passthrough через alignClusteringOutput; два разных port_guid; REST собственные фиксированные схемы и отсутствие повторного HTTP-запроса. Схема наблюдается reader-ом, data_kind копируется из проверенного mapping. Перед удалением каждой Table-цепочки выполнить её пару в текущем operator-сеансе; исходное Execute/обучение не повторять внутри пары. REST проверить через фактический createRestRequestNodeSupport или live request counter, не экспортировать private функцию только ради теста.
- [x] **Step 4: Подключить Text Import и отделить civil-оракул.** После его пары использовать собственный executionReceipt/outputColumns; убрать readView и onTableRead. В createJavascriptNativeInputSupport после base.readOutput создать существующий createNodeProcedure с теми же options/ctx/execute, собрать прежние Table receipts штатными helpers, restore/return, затем вызвать неизменный verifyNativeCivil. Сохранить one-read/no-replay и native input byte-проверки. Не использовать текст нового reader-а как civil expected.

  Переписать тест извлечённого production readOutput в javascript-native-datetime.test.mjs: новая base-ветка не вызывает Table, но civil driver отдельно вызывает Table-оракул на том же execution/port. Проверки: `assert.equal(executeCount,1)`, `assert.equal(civil.receipts.raw.table.port_guid, output.ports[0].port_guid)` и verifyNativeCivil принимает именно независимые receipts. Убраный hook не заменять фиктивным port evidence в поле civil.
- [x] **Step 5: Обновить действующие Python-проверки.** Import и Filter проверяют новый provenance/execution/schema/count/values, а не количество Add Table/format actions. full_read_evidence обслуживает ordinary sample: убрать обязательность filter_enabled, сохранить локальные ограничения его callers. Положительные случаи плюс повреждённые port/execution/schema/fullness обязаны различаться:

  ```python
  self.assertEqual(verify_port_output(port, columns, rows, 'exec', 0), [])
  bad = {**port, 'execution_id': 'old'}
  self.assertTrue(verify_port_output(bad, columns, rows, 'exec', 0))
  ```

  verify_internal_sequence/verify_execution_observations и независимые CSV/business expected сохраняются. Новый test_port_output_evidence проверяет реальные consumers, а не копию их алгоритма. Сначала RED конкретного изменённого consumer, затем минимальная правка и GREEN.
- [x] **Step 6: Проверки задачи.** Из client: `node --test test/node-port-output-callers.test.mjs test/filter-procedure.test.mjs test/linregression-output.test.mjs test/clustering-output.test.mjs test/text-import-node.test.mjs`. Из runtime: `node --test tools/loginom-acceptance/javascript-native-input.test.mjs tools/loginom-acceptance/javascript-native-integer.test.mjs tools/loginom-acceptance/javascript-native-typed.test.mjs tools/loginom-acceptance/javascript-native-datetime.test.mjs`. Из acceptance: `python3 -m unittest test_import_output_evidence test_full_read_evidence test_port_output_evidence`. Всё PASS; старые mapping-тесты сами по себе не доказывают переключение reader-а.
- [x] **Step 7: Коммит.** `git commit -m "feat(runtime): read specialized node outputs from ports"` с файлами задачи и необходимым вызовом в calculator-node; не включать raw captures и временный скрипт.

### Task 2: JavaScript, dock_node_read и оба формата eval evidence

**Files:**
- Modify: `client/lib/{javascript-code-node,node-read-driver,node-pending-release,node-apply}.mjs`; `client/lib/node-read-contract.mjs` — только при необходимом изменении описания, семантика alignReadSchema сохраняется.
- Test: `client/test/{node-read,node-read-release,node-pending-release,node-output-json-journal}.test.mjs`, новый `client/test/node-port-output-javascript.test.mjs`.
- Modify: `tools/loginom-acceptance/javascript_output_evidence.py`, `javascript_cold_evidence.py`; существующие `test_javascript_evidence.py`, `test_javascript_cold_evidence.py`, `test_javascript_autonomous_cold.py` в том же каталоге.
- Integration check: `tools/loginom-acceptance/javascript-mismatch-probe.mjs`, `javascript-native-datetime-civil.mjs`; менять только предположения о новом producer, Table-ветви остаются прежними.
- Modify: `evals/src/node-events.ts`, `evals/test/node-additional-sequence.test.ts`, `evals/tasks/node-evals/crosstable-sliding-source-refresh/SPEC.md` от корня репозитория.

**Interfaces:**
- Consumes: channel первого плана, `alignReadSchema(actual,expected)`, `resolveCrossTableSchema(actual,configuration)` и прежний JavaScript source admission.
- Produces: прежние driver.readOutput/read API. JavaScript output0 обязан совпасть с outputMapping.node_context.output_port.port_guid; full сохраняет sample_rows=100/strict/полноту. В read driver передаётся полный локальный `execution`, а не ctx.portExecution из другой оболочки.
- Eval проверяется публичным `checkNodeSequence(events,id,crossId,finalCsv,initialCsv?)`; private tableCsv не экспортировать для теста.

- [x] **Step 1: RED/GREEN JavaScript sample/full.** В новом test-файле исполнить настоящий production readOutput в VM по существующему образцу извлечения метода из javascript-native-datetime.test.mjs; заменить только browser channel и заданные closure receipts. Проверить observed physical output0, отказ при чужом GUID/неполном full и отсутствие Table-вызовов: `assert.equal(tableActions,0)`. Сохранность полного source/settings admission и `assert.equal(executeCount,1)` проверяется отдельной живой парой на фактическом driver, не объявляется доказанной этой VM-fixture. После пары заменить только readOutput Table-цепочку; убрать неиспользуемый openManagedJavascriptOutputViews import у этого caller. Сам helper и его independent tests сохранить.
- [x] **Step 2: RED/GREEN dock_node_read.** В node-read.test.mjs сохранить все source receipt/retained schema/JS admission проверки. Новый результат должен использовать свой свежий execution, без wizard/mapping/Table действий. Проверить отдельный CrossTable sliding случай: source_execution_id старый, новый execution отличается, category_fields берутся из resolveCrossTableSchema(result.output.schema,configuration), port_guid совпадает с policy. Изменение name/label/type остаётся NODE_READ_SCHEMA_CHANGED с прежним действием восстановления; не ослаблять alignReadSchema.
- [x] **Step 3: Освободить завершённое чтение без Table, сохранив блокировку неизвестного.** Заменить тест `the read driver does not advertise release for its unrestored Table phase` на два поведения нового reader-а: settled refusal/cancel + cleanup + тот же quiet graph допускают release фазы read; timeout/незавершённые RPC/чужой контекст запрещают. Сохранить прежнюю политику JavaScript recovery; не расширять её на draft-фазы.

  ```js
  assert.equal(settledRelease.cleanup_complete, true);
  assert.equal(settledRelease.output.original_outcome.output.execution.status, 'completed');
  assert.equal(unknownOperation.transportUncertain, true);
  assert.notEqual(unknownRelease.status, 'SUCCEEDED');
  assert.equal(repeatedExecuteCount, 0);
  ```

  readView/restoreRead Table recovery удаляется лишь у переключённых callers; node-pending-release сохраняет lastReceipt, transport uncertainty, node ownership и две проверки quiet graph. Из node-apply убрать устаревшее предупреждение о восстановленной собственной Table для нового чтения; подтверждённое выполнение и effect_possible:true при отказе чтения остаются.
- [x] **Step 4: Обновить JS consumers без изменения оракулов.** javascript_business_table принимает новый provenance/source_text; native input уже обновлён задачей 1. javascript_cold_evidence меняет writer-result проверку, но cold_table_proof остаётся Table. verifyNativeCivil и readPassive в javascript-execution-runtime сохраняют независимый Table read; mismatch probe различает фактический источник. Исторические captures и их hashes не переписывать ради нового producer.
- [x] **Step 5: RED/GREEN обоих форматов eval.** Скопировать в памяти существующий sliding-refresh-protocol.json, удалить у нового reread workflow_returned/port.table, добавить freshness_basis. Сама историческая fixture остаётся неизменной. В существующий tableCsv добавить второе основание происхождения при сохранении окружающих freshness/execution/owner/fullness проверок:

  ```ts
  expect(checkNodeSequence(newEvents, id, crossId, finalCsv, initialCsv).failures).toEqual([])
  expect(checkNodeSequence(staleEvents, id, crossId, finalCsv, initialCsv).failures.length).toBeGreaterThan(0)
  ```

  Проверить по одной мутации: неизвестный/отсутствующий provenance; отсутствующий/чужой port_guid; fresh=false; старый execution; неполные строки/sample_complete=false; другая node/source_operation_id. Сохранить старую положительную fixture и initial native full. Обновить sliding SPEC двумя допустимыми формами, не расширяя eval CSV-parser без воспроизведённой необходимости.
- [x] **Step 6: Проверки задачи.** Из client: `node --test test/node-port-output-javascript.test.mjs test/node-read.test.mjs test/node-read-release.test.mjs test/node-pending-release.test.mjs test/node-output-json-journal.test.mjs test/javascript-managed-views.test.mjs`. Из runtime: `node --test tools/loginom-acceptance/javascript-mismatch-probe.test.mjs tools/loginom-acceptance/javascript-native-datetime.test.mjs`. Из acceptance: `python3 -m unittest test_javascript_evidence test_javascript_cold_evidence test_javascript_autonomous_cold`; SKIP без LOGINOM_JAVASCRIPT_AUDIT_EVIDENCE_ROOT не выдавать за cold PASS. Из evals: `bun test --isolate --timeout 30000 test/node-additional-sequence.test.ts test/node-sequence.test.ts test/node-coverage-sequence.test.ts`, затем `bun typecheck` — PASS.
- [x] **Step 7: Коммит.** `git commit -m "feat(runtime): integrate port reading with javascript and rereads"` с файлами задачи. Ни fixture истории, ни native decoder не меняются.

### Task 3: Завершить контракт и выполнить общую приёмку

**Files:**
- Modify: `client/lib/node-api.mjs`, `client/lib/user-workflow.mjs`, их существующие `client/test/node-read.test.mjs`, `client/test/user-workflow.test.mjs`.
- Modify: `packages/product/skills/loginom-automation/references/workflow.md`, `packages/loginom-runtime/AGENTS.md` от корня — только устаревшие инструкции о Table/точности/времени.
- Остальные production/test файлы — только исправления выявленных нарушений дизайна; перечень не разрешает соседний рефакторинг.
- Краткий итог/ограничения — checkpoint этого плана, не отдельный журнал каждого шага.

**Interfaces:**
- Consumes: все восемь подключений и временный comparePortRead из первого плана.
- Produces: прежний публичный API с точным ordinary чтением и обновлённым описанием. Снятый запас на форматирование output reread использует существующий diagnostic default 300000 ms; конфигурация/total 600000 ms и execution cap других операций, JS source/context и явные diagnostic budgets не меняются.

- [ ] **Step 1: Уточнить описание и убрать только устаревший запас времени.** Сначала изменить ожидание output allowance в существующем node-read.test.mjs на 300000 и получить RED. В expandNodeRead для output заменить format-specific 600000 на 300000; kind:source/context остаются 300000/600000. Проверить отсутствие повторного Execute после истечения. Убрать инструкции о форматах, округлённом false, «512 KiB UI row data», восстановлении Table. Из client: `node --test test/node-read.test.mjs test/user-workflow.test.mjs test/javascript-knowledge.test.mjs` — PASS. Формулы Round и calculatorPrecisionWarnings не менять.
- [ ] **Step 2: Проверить покрытие всех восьми мест и живые особенности.** Использовать одну парную процедуру на уже выполненном узле; следующие случаи — конечная матрица из дизайна, без новой обязательной fault-injection кампании:

  | Путь | Проверяемый результат |
  | --- | --- |
  | Calculator/shared | точные true/false, обычный Collapse; shared CrossTable сохраняет dynamic schema |
  | Filter | отдельно [0], [1], затем оба; оба выхода настроены, порядок запроса сохранён |
  | Regression | прогноз и коэффициенты с прежними исключениями |
  | Clustering | оба выхода, Cluster/Distance и прежняя материализация |
  | REST | ответ и схема прежние, reader не повторяет запрос |
  | Text Import | mixed CSV с >2^53/Int64, пустой выход и прежний файл/mapping |
  | JavaScript | sample/full, исходный порт/source/settings и прежнее число выполнений |
  | dock_node_read | своё новое Execute, sliding CrossTable и live NODE_READ_SCHEMA_CHANGED |

  Через тесты первого плана закрыть NULL/пустые/Unicode/Variant/real extremes/даты, 100 строк/10 000 ячеек/512 KiB и 46 000 wire bytes. В live — независимо полученные Int64 через CSV, >16 384 string через fixture/ValueText, true/false, sample_rows=0, чистый saved package dirty false→false **до Table-оракула**. Count=0 не доказывать отсутствием загруженного кэша.
- [ ] **Step 3: Проверить native full и независимость проверки.** Из client: `node --test test/variant-native-read.test.mjs test/native-read-refusal.test.mjs test/crosstable-native-source.test.mjs` — PASS; затем один существующий живой Collapse/CrossTable full-путь F3. Исходные tags/bytes, 50×8, pins, static topology и Preview cleanup прежние. Table/cold/civil helpers остаются и не вызывают новый reader как эталон. `row_filter_oracle.py`, `reform_matrix_evidence.py`, `collapse/acceptance-kit/audit.py`, `collapse/exact-wiring/public-audit.py` и исторические captures не адаптировать под ordinary порт. Прочие Table-потребители перечислены в дизайне и сохраняются.
- [ ] **Step 4: Замерить полное чтение и проверить завершение.** На одинаковом небольшом наборе выполнить пять успешных пар на одном execution каждая: время нового пути включает binding/metadata/полные строки/cleanup; старого — открытие/форматы/чтение/восстановление. Отдельно отметить набор с длинными строками. Сравнить медианы, returned rows и 46 000-байтный ответ; не использовать тёплые AsVariant 0,10 мс как время всего reader-а. Если live-среда недоступна — зафиксировать блокер и условие возобновления, не объявлять приёмку завершённой.
- [ ] **Step 5: Общая регрессия и очистка.** Из runtime `bun run test:upstream` на закреплённом Node; адресные acceptance/eval команды задач выше — PASS с явно отмеченными SKIP. Проверить `git diff --check`, относительные ссылки изменённых Markdown и итоговый `git diff --stat`. По `rg` убедиться, что в восьми рабочих местах нет старой Table-цепочки; это проверка охвата, не замена live. Удалить только свои временные скрипты/пакеты после сохранения результатов, подтвердить собственный cleanup/logout по принятому operator-процессу. Сырые логи/секреты не коммитить.
- [ ] **Step 6: Независимое итоговое ревью и коммит.** Проверяющий сверяет diff с дизайном, сохранность native/cold и отсутствие новых механизмов. Устранить обязательные замечания; optional не превращать в критерии. `git commit -m "docs(runtime): finalize direct port reading acceptance"` для оставшихся описаний и краткого verified checkpoint; исправления кода — отдельные подходящие feat/fix/test коммиты. Завершить только с результатами проверок и известными ограничениями; слияние/выпуск отдельно.

## Передача

Выполнение разрешено владельцем 25.10.2026 и идёт последовательно после первого плана через subagent-driven-development с TDD. Общий reader имеет одну реализацию, consumers переходят на неё без временного пользовательского переключателя.

## Checkpoint реализации

- Tasks 1 и 2 завершены; независимое ревью соответствия и качества PASS. Все восемь ordinary callers используют один port reader.
- Task 3: allowance 300000 ms и инструкции готовы; client 77 PASS, native 105 PASS, полный upstream на закреплённых Node/Chromium — 4746 PASS / 2 Windows SKIP.
- Task 2 дополнительно: client 103 / runtime 637 / eval 12 PASS и typecheck; Python 8 PASS / 16 SKIP без приватных captures. Cold PASS не заявляется.
- Свежая обычная матрица PASS: Calculator strict/ordinary и Collapse, Filter [0]/[1]/[1,0], Regression, Clustering, REST, Text Import mixed/empty, JS full и reread 100/0. CSV/business oracle независимы; source/settings и число финальных выполнений сохранены.
- Live stale-schema отказ и release PASS: Id→IdAlias, старый source не принят, новое завершённое выполнение сохранено, Execute при освобождении не повторялся.
- Int64 MIN/MAX, >2^53, полный текст 20 000 символов и 5 001 emoji PASS; strict/ordinary равны. JS и CSV dirty false→false проверены до Table на сохранённых чистых пакетах.
- Пять пар на одном выполнении 3×4: медианы port 563,857 ms / Table 31 451,821 ms (≈55,8×); все строки/значения сохранены с согласованным −0. MCP envelope 10 586 байт, 3 строки, лимит 46 000. Длинный CSV отдельно 799/914 ms; старый reader >16 384 отказывает.
- Native/civil/cold helpers и исторические captures сохранены. Native F3/sliding ещё не приняты: смешанный стенд отвергнут до Execute из-за REST foreign link; защита сохранена, новый изолированный draft имеет complete graph / foreign_links=[] до выполнения.
- Временные стендовые ошибки (console buffering, offscreen control, повтор ID Save) разрешались через известные no-effect/cleanup proofs; исходные неуспехи сохранены. Дополнительный JS source probe выявил прежнюю QA-wire schema ошибку; production bridge корректен, source cleanup подтверждён.
- Evidence вне Git: `/tmp/port-read-implementation-{LUEAYO,rVw8qy,76D4np,GZzpqF,q37u1w,JlgNOg,gWxwBR,fa5jMG,JVcMzN}/`. Закрытие/logout предыдущих стендов подтверждены; текущий изолированный ещё открыт.
- Далее: native F3 и sliding в одном runtime, собственный server-file cleanup/logout, финальные diff/links и независимое итоговое ревью. Installed и другие платформы не проверены.
