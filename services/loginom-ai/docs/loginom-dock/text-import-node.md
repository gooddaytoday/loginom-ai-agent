# Подплан 03 завершён — 8 сентября 2026, 22:49 МСК

Статус: **implemented / live_verified (source runtime)**. Общий node.apply,
текстовый импорт, readback, сохранение и безопасное продолжение приняты.
[Итоговая проверка всех требований](../plans/loginom-dock/03-completion-audit.md)
содержит полную матрицу, исходники, ограничения и измерения.

Самостоятельный Hermes `20260908-222819-2e3cc755`:30/30 independent checks PASS,
openai-codex / gpt-5.6-sol / low, без fallback. Frozen audit SHA256:
`bcddd145fd525cedd1bd74b9185eaec27aae44d8c9f2ee46809b489c975f5317`.
Текущий полный runtime83 совпадает с его pin:
`172d0c6bac5a0dc53685d4ef621a554d603facfef6ca7830d40ce4823bd11dd5`.
Пакет `/user/dock-p3/packages/Dock-acceptance-20260908-222819-2e3cc755.lgp`,
повторно проверенный выход6×5. Public15/model API16; токены и время — в итоговом аудите.

Дополнительные current-pin проверки: cancel/resume после configure
`execute-1788895997843`, после finish `execute-1788896235443`, отказ при изменённом
черновике `execute-1788896364214` — independent PASS. Исправлен только verifier
новой workflow-фазы; runtime после Hermes не менялся. Оригинальный harness138 файлов
сохранён по SHA; текущие28 сценарных проверок совпали с frozen audit.
Client1029 PASS/1 SKIP и shell46 PASS; Python387 PASS. Все собственные прогоны
завершены, соответствующих процессов в проверенном live process list нет.
Индекс27 проверенных свидетельств: `.dock/text-import-v3/subplan03-completion-evidence-index.json`.

Работы по цели03 не осталось. Следующий подплан04 — отдельная задача.
Подпланы04–10 и выпуск V5 не приняты; production и установленный клиент не менялись.
Исторические записи ниже не отменяют этот итог и не являются текущими blockers.

---

# Подплан 03 — configuration readback принят через MCP, 8 сентября 2026, 22:29 МСК

Реализован `configuration.readback` из проверенных UI-квитанций: source/format,
полная схема полей и native output mapping, node/receipt refs и явный scope.
Входные параметры не копируются. Close не выдаёт readback применённых настроек;
package_persistence_verified остаётся false. Общая оболочка вызывает чистую
функцию handler после принятого finish/read, результат сохраняется для replay.
Schema/types и native Hermes skill обновлены; handler revision text-import-output-v2.
Независимый node_configuration_evidence.py сверяет raw observations, страницы
полей, native источники mapping и node identity. Он включён в полный scenario audit.

Полный Codex MCP run `remote-readback-20260908-222113-70a0533e`: все components PASS,
включая обе configuration projections, public calls, delivery/output, два save и
reopen/reexecute. Пакет `/user/dock-p3/packages/Dock-acceptance-20260908-222113-70a0533e.lgp`.
Execution `1788895298093-84gv4vtlhfl:594:1` → `:594:3`, два выхода6×5;
settings={} / mappings=[] после reopen, optional target.label не повторялся.
Полный pin83: `172d0c6bac5a0dc53685d4ef621a554d603facfef6ca7830d40ce4823bd11dd5`.
7 negative readback mutations отвергнуты. Проекция66 полей на архивных live receipts
также прошла independent audit; это pure regression, не новый live run широкой схемы.
Client1029 PASS/1 SKIP, затем расширенный shell46 PASS; Python385 PASS.
Bridge65566 закрыт exit0. Неудачный setup222027 имел stdin от here-doc и завершён
до dock_prepare/действий; он не засчитывался как проверка. Runtime не менялся после
начала принятого run222113; полный source audit PASS. Production не менялся.

Новый Hermes `20260908-222819-2e3cc755`, process85921: model_started подтверждён,
openai-codex / gpt-5.6-sol / low; preflight PASS, fallback=false. Опросить тот же
handle до terminal и выполнить node_apply_acceptance.py для этого run. Не менять
runtime/skill/acceptance harness во время прогона. После результата сопоставить
полный подплан03 с acceptance matrix; source/live_verified и release V5 различать.
Подплан ещё не завершён. Frozen FAIL четвёртого прогона сохранён ниже.

---

# Подплан 03 — четвёртый Hermes FAIL, начата диагностика результата, 8 сентября 2026, 22:12 МСК

Run `20260908-220328-c2a6b6f2` завершён exit0, model completed=true:
openai-codex / gpt-5.6-sol / low. Frozen `node-apply-audit.json` FAIL:
`tool_scope`, `persistence`, `no_intervening_operation`; SHA256
`65fb3e2b3add7d3c2eabefaeafafb81b573d34edea3c49250b74910095f5543b`.
Этот исход не пересчитывать/не заменять новым PASS. Runtime82 pin8d8967ca…e9d5.
Два node.apply SUCCEEDED, execution `1788894234375-aszvr20jozb:592:1` → `:592:3`;
второй запрос settings={} / mappings=[]. После него Hermes дополнительно
select/open_wizard через dock_ui_action, затем recovery. Полный сценарий не принят.
24 model API calls,28 public calls; tokens input113802/output5331/total1253981,
cache_read1134848/reasoning1600 (пересекающиеся счётчики не суммировать).
Процесс7296 завершён, нового Hermes не запускать без исправления и Codex-проверки.

Диагностика выявила независимую ошибку verifier: target.label необязателен для
existing ref, а import_done_evidence сравнивал фактическое имя с None. Исправлен
private путь проверки output: ожидаемое имя берётся из проверенного seed, если
existing request его не задаёт; ссылки, тип и граф по-прежнему проверяются.
Python import120 PASS. `optional-label-diagnostic-audit.json`: persistence PASS,
3 negative mutations (чужие имя/тип/GUID) отвергнуты. Это новый диагностический
отчёт, не изменение frozen Hermes FAIL; лишние UI-действия остаются нарушением.

Следующая конкретная работа: вернуть агенту проверенные настройки из обработчика.
В `node-apply.mjs` public configuration сейчас содержит только status;
configure receipt хранит source/format/columns/preservation, output_mapping receipt
содержит native_mapping/source_identity_verified. Skill просит оценить прочитанные
настройки, но public result их не предоставляет. Нужен компактный наблюдённый
readback с явной областью доказательства, привязанный к фазам/node и окончанию;
не подменять его входными параметрами и не объявлять package persistence из него.
Сверить реальные значения/схему, расширить общий result contract/schema и типы,
добавить независимую проверку и негативные тесты, проверить Codex MCP цикл,
затем новый автономный Hermes. Не ослаблять запрет штатного дополнительного reopen.

Подплан03 остаётся in progress. Общий план §7.1 и README различают принятие
подплана (implemented/live_verified) и поставку полного выпуска V5 (released).
Поставка V5 не выполнена; автоматически расширять задачу03 до всего выпуска не нужно.
Production и установленный клиент не менялись. Последний полный remote и его
ограничение сохранены ниже; канонический общий план/README исправлены с planned
на in progress, без объявления готовности.

---

# Подплан 03 — remote persistence принят; Hermes запущен, 8 сентября 2026, 22:04 МСК

Remote `remote-final-20260908-215200-a64d819b` на полном pin
`8d8967cac2c274b7988596b04534570da13a6528fddc3a3fea15d7099cc5e9d5`/82 files
завершил delivery, import Execute, intermediate save, final save, reopen и
Execute с `settings:{}` / `mappings:[]`. Независимые delivery/output, обе
workflow activation, persistence и runtime-source audits PASS. Выход 6×5,
execution `1788893554000-7mlic3q9dvi:590:1` → `:590:3`.
Пакет: `/user/dock-p3/packages/Dock-acceptance-20260908-215200-a64d819b.lgp`.
Общий operator-components-audit сохранён как FAIL: operator-15 использовал
неверный target.node_id вместо target.ref; запрос был REQUEST_REJECTED,
effect_possible=false, до UI. Исправленный operator-17 завершился SUCCEEDED.
Этот отклонённый запрос не удалён из evidence и не объявлен straight-through PASS.
Bridge23135 закрыт, exit0; продуктовые исходники не менялись.

Preflight PASS: existing ChatGPT openai-codex / gpt-5.6-sol / low, fallback=false.
Новый отдельный Hermes run `20260908-220328-c2a6b6f2`, process handle7296;
подтверждена стадия model_started (Sol/low). Перед продолжением опросить тот же
handle; не запускать новый run из-за отсутствия вывода. Результат модели и
полный аудит пока не получены. Подплан03 и release gates остаются открытыми.
Evidence: `.dock/text-import-v3/remote-final-20260908-215200-a64d819b/`
и `.dock/text-import-v3/hermes-runs/20260908-220328-c2a6b6f2/`.

---

# Подплан 03 — смена схемы и неверные значения приняты, 8 сентября 2026, 21:50 МСК

На полном pin8d8967ca…e9d5/82files приняты CSV→TSV с новой схемой и сохранностью
незапрошенных настроек (12 negative checks), а также неверные integer/real
литералы→Null (5 negatives). Исправлено чтение, попадающее на снятие блокировки
графа после Done/Execute: максимум два перечитывания того же узла, без повтора
жеста. Реальный execute_wizard прошёл эту ветвь один раз и завершился успешно.
Client1015 PASS/1 SKIP; focused UI249 PASS. Все harness завершены.
Следующий шаг: полный текущий Codex remote bridge import/save/reopen цикл,
затем один autonomous Hermes Sol/low с независимым аудитом и release gates.
Подплан03 ещё открыт.

## Изменение и проверка перехода блокировки

`workspace-ui.mjs`: при post-gesture finish_wizard/execute_wizard разрешено
перечитать graph→graph только если различается ровно locked; все остальные поля
контекста совпадают, максимум2 раза. Pre-gesture guards неизменны. Добавлена
bounded trace prepared_node_surface_mismatch для отказов. Tests проверяют одно
снятие блокировки и отказ при продолжающемся чередовании; foreign-node отказ
сохранён. `finish-lock-tests.txt`:249 PASS; `finish-lock-client-tests.txt`:
1015 PASS/1 SKIP (1016); diff check PASS.

Исходный `execute-1788892833897` на d5d46052…ec2c4b завершился AMBIGUOUS после
одного execute_wizard, PREPARED_NODE_CONTEXT_CHANGED; harness16938 exit1.
До добавления trace точная разница контекста не записана, результат не принят.
Diagnostic `execute-1788892967560` на6e78b9a1…58811b прошёл без этой ошибки;
его82 source files сохранены в runtime-source-snapshot и hash сверены с manifest.
Они фиксируют завершённый исторический run, не текущий checkout.

## Текущий принятый source replacement

`.dock/text-import-v3/execute-1788893151897/`, полный pin
`8d8967cac2c274b7988596b04534570da13a6528fddc3a3fea15d7099cc5e9d5`.
`independent-replacement-output-audit.json` PASS/8 negatives;
`independent-replacement-schema-negative-audits.json`:4 negatives;
`independent-runtime-source-audit.json`:82files PASS.
Seed execution `1788893154224-e9hvszzpe7d:794:1`, patch execution
`1788893154224-e9hvszzpe7d:794:3`. CSV→TSV, исходный порядок Title/Amount/Id/Extra,
выход Id/Title/Amount/Extra; Id остаётся дискретным, Extra integer сохраняет
9007199254740993 и9007199254740995. Deactivation и один wizard open проверены.
Execute trace: один жест39ms, node_graph_lock_rediscovery1204ms, settled2127ms,
затем общий process/output proof. Повторных execution gestures нет.
Harness30853 exit0; это component, не persistence/Hermes acceptance.

## Неверные числовые значения

`.dock/text-import-v3/execute-1788893263296/` на том же полном pin.
Private fixture `invalid-values-diagnostic.mjs` (первый запуск до браузера
отказал из-за относительного import; исправлены только harness imports).
Исходные строки: 1/valid/1.5; bad/invalid integer/2.5; 3/invalid real/bad.
Нативный выход3×3: неверные Id и Amount становятся Null, прочие значения сохранены.
Execution `1788893265452-22n3xu3ddy7:588:1`, replay без browser; harness61597 exit0.
`audit-invalid-values.py`: `independent-invalid-values-audit.json` PASS/5 negatives.
Аудитор сначала сверяет ORIGINAL bytes/upload/configuration/execution, затем
независимо заданную expected table с двумя Null. Исходные bytes не заменяются
для проверки доставки. Приёмка ограничена этими неверными integer/real литералами,
не произвольной коррекцией любых повреждённых данных. Native warnings пусты.

Матрица очищена от устаревших верхних баннеров; уточнены сохранность свойств,
реальная граница обязательных import outputs и existing full-pin delivery audits.
Не повторять уже принятые mode8/66fields/Close/delivery компоненты без нового
пробела. Следом `tools/loginom-acceptance/remote-node-rehearsal.mjs` с новым
run directory и текущим pin: полный public node.apply/import, intermediate/final
save, reopen без settings/mappings и свежий output. Только после независимого
полного Codex verdict — Hermes openai-codex/gpt-5.6-sol/low, без fallback.
Production, candidate artifacts и последний frozen Hermes FAIL не менялись.

---

# Подплан 03 — общий stop с зависимостью принят, 8 сентября 2026, 21:39 МСК

Общий graph launch→identify→stop→replay принят на полном новом pin
d5d46052…ec2c4b/82files: независимый journal audit PASS/7 negatives,
ровно один cancel, replay29→29. Отдельно missing-source отказ повторно принят
на том же pin, PASS/9 negatives. Client1015 PASS/1 SKIP; Python import119 PASS.
Обе сессии завершены exit0. Подплан03 открыт: оставшаяся матрица и её полные pins,
итоговый Codex import/save/reopen цикл, Hermes Sol/low и release gates.
## Принятый общий driver

`.dock/text-import-v3/process-stop-1788892494212/`, полный pin
`d5d46052fc116eb02a8a1508abcfb0ad7840b2657b83b5fc14215bac03ec2c4b`.
`independent-runtime-source-audit.json`:82files PASS.
`driver-launch.json`, `multiple-stop-selected-driver.json`, execution-events.jsonl,
`independent-stop-driver-audit.json` и `independent-stop-driver-negatives.json`:
новый execution `1788892496468-zo7ddj0ebfp:172:1`, group1/173,
upstream1.1/174 completed, target1.2/175 running→cancelled, groupcancelled.
Один typed execute_graph_node и один cancel_process, native ownership до/после,
повтор stop возвращает тот же результат и steps29→29. Аудитор
`audit-multiple-stop-driver.py` проверяет scoped journal активной operation,
общий launch и два child, все source files,7 negative mutations.
Пакет закрыт (multiple-stop-closed.json), harness81631 EOF/exit0.

Граница: обычный click по JavaScript запрещён существующим dangerous guard.
Первая попытка driver launch остановилась до жеста при initial observation
(allowed_actions=[]); она не запускала узел. Для диагностического fixture Codex
выбрал exact GUID вручную, затем запустил полностью общий launch/stop driver.
Guard JavaScript/code editor не ослаблен. Это driver component, не public
JavaScript handler и не самостоятельная полная node.apply/Hermes acceptance.

## Missing-source на полном текущем pin

`.dock/text-import-v3/execute-1788892659203/`: fixture upload/download byte proof,
затем удаление только этого fixture и новый import. Результат AMBIGUOUS,
pending configure, WIZARD_SOURCE_VALIDATION_FAILED, без Execute/Done/выхода,
replay без browser. `independent-source-error-audit.json` PASS/9 negatives;
полный runtime inventory82 PASS. Harness27492 завершился exit0.

Старый аудитор ожидал source→target и ошибочно отклонил добавленную фазу workflow.
Исправлен `import_source_error_evidence.py`: новая фаза принимается только
source→workflow→target с одной завершённой verified SUCCEEDED квитанцией,
cleanup и точным document/workflow. Старая историческая последовательность
сохранена. Добавлены positive/foreign/incomplete workflow tests.
`current-source-error-python-tests.txt`:119 import tests PASS; diff check PASS.
Продуктовые исходники на этом участке не менялись, pin сохранён.

Следом сверить не просто summary, а полный source inventory оставшихся sparse,
format/error/delivery/recovery evidence; ранее неполные pins не выдавать за
полные. Затем полный final Codex cycle и один autonomous Hermes Sol/low с audit.
Production/candidate release не менялись, новый Hermes не запускался.

---

# Подплан 03 — отмена процесса с зависимостью исследована, 8 сентября 2026, 21:33 МСК

Live typed cancel принят: группа3 и собственный child3.2 cancelled, upstream3.1
остался completed. Independent audit PASS/6 negatives. Общий stop driver теперь
выбирает уникальный native-owned child среди зависимостей и сверяет owner после
отмены; 42 focused PASS, полный client1015 PASS/1 SKIP (1016).
Live принят на прежнем pin2843807e…448f9e; изменённый общий драйвер live ещё
не принят. Следующий шаг — новый pinned harness на сохранённом fixture:
`/user/dock-p3/packages/Multi-stop-1788891779759.lgp`, затем driver stop/replay audit.
Пакет закрыт, harness8540 завершился exit0. Полный03 открыт, Hermes не запускался.
Evidence: `.dock/text-import-v3/process-stop-1788891779759/`:
`multi-stop-with-output-schema.json`, `multi-stop-current.json`,
`multi-stop-terminal-settled.json`, `multi-stop-independent-audit.json`.
Execution `1788891782417-3wl7v4jrhv9:154:3`, group record194,
target3.2/record196, upstream3.1/record195. Три отказа UI_EPOCH_CHANGED до жеста
(один initial, два current), затем ровно один cancel_process SUCCEEDED.
Последующее чтение подтвердило terminal cancelled на тех же group/child;
upstream completed. Запуск был диагностическим F9, не общим graph launch.
Обновлён `process_stop_evidence.py` для уникального native owner среди siblings;
прежние typed и journalled stop audits повторно PASS/9 и PASS/7 negatives.
`multi-process-stop-client-tests.txt`: 1015 PASS/1 SKIP, exit0; diff check PASS.

Fixture: target GUIDcdfbd70e-5324-4949-8e65-ccd83838fed1, upstream
GUID2f8d1265-83f7-448a-8d25-854be2cb1a3d. Target code — цикл до60сек;
upstream — JS с одним строковым COL1, без строк. Связь output0→input0.
Изначальная таблица без столбцов не настраивала вход: groups1/2 failed до кода,
отмена не отправлялась. После добавления COL1 и завершения target wizard group3
стал running. При повторном открытии мастер может начинаться не с input step:
определять этап по заголовку, не повторять фиксированные два Next.
`stop-reconfigure-target.js` исторически выбирает первый JS при восстановлении
binding; при двух JS это неверно — восстанавливать exact target GUID из
`multi-stop-fixture.json` (helper `stop-restore-target-binding.js`).

`multi-stop-saved-fixture.json`, `multi-stop-saved-ui.json`, `multi-stop-closed-ui.json`
подтверждают diagnostic Save As и закрытие. Это не финальная package acceptance.
Новый stop harness должен открыть точный сохранённый fixture, проверить граф,
привязать target по GUID, захватить новый полный runtime pin, затем launch/stop
через общий драйвер и проверить журнал и replay. Старый harness закрыт Ctrl-D.
Help: `loginom-help/data/interface/processes-panel.md`; E2E:
`e2e-tests/bg/sels/sProgressForm.ts` — отмена выбранного процесса, не cancel-all.

---

# Подплан 03 — штатное сохранение и продолжение приняты, 8 сентября 2026, 21:21 МСК

На неизменном pin2843807e…448f9e/82files проверены штатный Save As →
тот же workflow → один node.apply с отдельным портом → final save → reopen →
новое выполнение без настройки. Два независимых аудита PASS, по 5 negatives.
Выход: Expr1/LifecycleId, строки (7,1), (7,2), (7,3). Пакет сохранён как
`/user/dock-p3/packages/Canonical-final-1788891175743.lgp`.
Диагностическая сессия64701 закрыта exit0; после reopen отброшены только новые
настройки визуализатора. Прежний отказ после raw operator Save As не воспроизвёлся
через canonical package.save_checkpoint: штатный refresh navigation уже реализован.
Остались multi-process stop, полная сверка матрицы, Hermes и release gates.
Evidence: `.dock/text-import-v3/done-1788891175743/`:
`canonical-save-continuation.json`, `single-node-apply-result.json`,
`single-apply-replay.json` (326→326), `canonical-final-save.json`,
`final-reopened.json`, `final-execution-completed.json`, `final-reopened-output.json`.
Первое execution: `1788891177985-9jrdz3pxi56:239:1`; после reopen:
`1788891177985-9jrdz3pxi56:239:3`, Calculator3.2/record753.
Аудиторы повторно выполнены после закрытия пакета:
`audit-single-separate-apply.py … --prior-save` и `audit-save-continuation.py …`.
Оба PASS/5 negatives. Первый ограничен browser evidence до конца replay;
последующие отдельные save не относятся к node.apply. Второй проверяет оба
save, обновление workflow navigation, свежий owned process и отсутствие
перенастройки/сохранения после reopen. Private Calculator fixture не является
публичным handler и не заменяет автономную Hermes acceptance.
Продуктовые исходники в этом участке не менялись; прежние client1009 PASS/1 SKIP
относятся к тому же pin. Следующий незакрытый участок: отмена собственного
процесса в группе с зависимостями; текущие stop proofs требуют одного child.

---

# Подплан 03 — один node.apply с отдельным портом принят, 8 сентября 2026, 21:10 МСК

Component PASS: `.dock/text-import-v3/done-1788890847120/single-apply-audit.json`,
5 negatives, проверен полный runtime pin
`2843807e9a8ddfe1ca77e2cd1f698c312b3d9699951545afa7acc75bf0448f9e`/82files.
Full client1009 PASS/1 SKIP (1010), exit0: `separate-journal-client-tests.txt`.
Исходники во время принятого live не менялись. Нет нового публичного Calculator
handler: это bounded private fixture adapter через реальный createActionRuntime
и runNodeApply, с общей gate/journal/phase машиной и общими драйверами.

## Единый lifecycle

Harness `optional-single-node-apply.js`, operation `single-separate-node-apply`.
Существующий Calculator GUID67594185-61e4-41d0-95ec-19e320766a6f из пакета
`/user/dock-p3/packages/Process-owner-1788889705006.lgp`:
source(not applicable)→workflow→target→input_mapping(empty)→open→configure
(expression7)→node_finish(Done без запуска)→output_mapping(standalone output0,
Expr1/LifecycleId, rename Id→LifecycleId/Код цикла, excluded Title/Amount,
autosyncfalse)→finish(graph launch+identify)→execute→read.
Внутри одной operation, без reopen node wizard и без внешнего operator launch.
Новая группа1/root172, Calculator1.2 (точный record см. execute receipt),
execution `1788890849472-n17umxtvbvb:172:1`. В той же группе исходный импорт.
Show Node/native owner proof и raw table: Expr1 real/LifecycleId integer,
3 строки(7,1),(7,2),(7,3). Числа проверены через общий precision driver/decoder.

`single-apply-request.json`, `single-node-apply-result.json`, raw browser1…327,
`execution-events.jsonl`, `single-apply-replay.json` составляют доказательства.
Replay вернул идентичный результат, browser calls327→327, повторного запуска нет.
Audit сверяет все11 фаз, intermediate Done/no execution, полный mapping,
единственный typed launch, baseline→newgroup→Show Node→selected native owner→
output, значение7 и новые поля, precision receipt и replay. Самостоятельное
сохранение пакета не заявлено; общая file delivery не входит в этот Calculator
fixture (её прежние evidence остаются отдельными).

## Два выявленных и исправленных дефекта

1. После node Done grouped target store имел count4,source4,records4,но total2
(active columns only). `done-1788890476790/mapping-store-diagnostic.json`
доказал пустой фильтр и одинаковые native records, включая excluded.
`node-mapping-context.mjs` допускает active-only total только у grouped target,
с обязательной полной source collection и прежней проверкой каждой записи,
уникальности, групп и связей. Скрытые/чужие/missing-source записи не принимаются.
Первый run остановился до port commit/launch, исходный пакет не сохранялся.
2. `done-1788890652569` прошёл порт и launch, но phase finish acknowledgement
отклонился: вложенный launch snapshot.origin нормализован redactor-ом
http://host→http://host/. `browser-140.json` и journal показывают расхождение.
`finishConfiguredGraph` теперь возвращает компактную ссылку operation_id,
action_key/revision,gesture_applied на уже durable step receipt. Полный raw
snapshot остаётся в step evidence. Добавлен regression с настоящим fsync journal.
Тот run НЕ принят: после ошибки read-only native process и отдельный Table
показали(7,1),(7,2),(7,3); нового запуска не было, изменения пакета отброшены.
Старая диагностическая подпись discard visualizer в том run неполна: были
отброшены и node/port изменения. Не переносить тот FAIL в успешную приёмку.

Также runtime foreground/background fingerprints теперь включают separate
wizard placement: cached операция не может сменить embedded↔separate при том
же handler revision. Проверены оба пути.

После успешного audit диагностический пакет закрыт без сохранения изменённых
node/port/visualizer settings (`diagnostic-closed-without-save.json`).
Harness68515 exit0; предыдущие19814/8133 тоже закрыты exit0. Активного harness
этого участка нет. Production, installed client и Hermes не менялись.

Следующие обязательства: Save As navigation identity bug (после save без reopen),
многопроцессная stop/cancellation, сверка оставшейся acceptance matrix и всех
live checks на final source, затем автономный Hermes openai-codex/gpt-5.6-sol/low.
Общий separate lifecycle теперь component accepted, но весь03 ещё НЕ завершён.

---

# Подплан 03 — связка отдельного порта в оболочке, 8 сентября 2026, 20:58 МСК

Source/test increment, НЕ полная live-приёмка. `node-apply.mjs` теперь принимает
trusted handler.output_wizard='separate' (undefined/embedded сохраняют прежний
путь). До любых фаз проверяется наличие finishGraph. Signature учитывает separate.
После configure идёт отдельная journal phase node_finish: drivers.finish('done')
обязан подтвердить settings_applied=true, execution_started=false, без execution_id.
Затем output_mapping и drivers.finishGraph(request.finish), всё в исходной operation.
Close пропускает intermediate Done и output_mapping, сразу отменяет node draft.
Схема результата и TypeScript дополнены node_finish, handler output_wizard.
Неизвестный intermediate/port effect сохраняет pending и не допускает launch/replay.

`finishConfiguredGraph(channel,driver,mode,node)` в node-execution-procedure:
проверяет тот же unlocked graph/no wizard, Done возвращает not requested,
Execute вызывает общий launchGraph→identify, проверяет identity и возвращает
execution_group/launch_receipt. Не открывает мастер. Финальная waitExecution
по-прежнему отдельная фаза оболочки. Close этот helper не принимает.

`configureSeparateOutputPort(channel,mapping,configured)` в port-mapping-procedure:
явная поддержка проверенного standalone output0, openOutputPort→native source
validation→fields/reorder/autosync→полная сверка полей→typed port Done.
При сравнении до/после Done игнорируются только rendered_indices (видимая страница),
остальная native schema должна совпасть. Конфигурацию источника передаёт handler.
Это общий helper, не новый публичный Calculator handler.

Tests: separate-lifecycle-focused-tests.txt72 PASS; separate-lifecycle-client-tests.txt
1000 PASS/1 SKIP (1001), exit0. Проверены порядок всех трёх исходов, неверное
intermediate Done, lost port reply без launch/repeat, отсутствие finishGraph до
первой фазы, сохранение metadata при смене видимой страницы и source mismatch
до port commit. После full suite дополнена только TypeScript декларация handler.

Нового live запуска в этом продолжении не было; активных harness нет.
Предыдущий component pinb57a…f42e5 относится к прежним JS, не переносить его
на текущие изменения. Единый реальный node.apply со separate handler/factory
ещё НЕ проведён, production imports.text handler остаётся embedded.
Следующий шаг: bounded private acceptance adapter использует эти helpers в одном
node.apply (Calculator fixture только для проверки общего lifecycle), доказать
node Done→port configure/Done→graph launch→owned completion/output без reopen.
Только после этого считать новый общий путь принятым. Остальные обязательства:
Save As navigation, multi-process stop, acceptance matrix и Hermes Sol/low.
Production не менялся; полный03 открыт.

---

# Подплан 03 — общий graph launch принят компонентно, 8 сентября 2026, 20:53 МСК

`node-execution-procedure.mjs` теперь содержит launchGraph(): требует baseline,
проверяет graph/unlocked/no wizard и outputs, выбирает узел только при необходимости,
вызывает typed execute_graph_node через durable channel.perform. Повтор после
выданной/неизвестной команды запрещён в экземпляре драйвера. Квитанция клика
содержит execution_completed=false; identify/waitCompleted доказывают результат.

`workspace-ui.mjs`: execute_graph_node выдается только точной native toolbar
кнопке, при единственном выбранном prepared GUID, незаблокированном узле,
ModelForm/native Ext button identity, tooltip «Выполнить узел», run_current icon.
Контроль повторяется непосредственно перед жестом; обычный click на эту кнопку
не выдается. При scoped graph read кнопка включается точным фиксированным
селектором и только рядом с prepared graph, без общего обхода других областей.
Тесты проверяют native selection/state/identity drift, scoped discovery,
неповтор после lost reply, запрет без baseline. Последний full client:
987 PASS/1 SKIP (988), exit0, `graph-launch-scoped-client-tests.txt`.

UI исследован в done-1788889466389: unselected кнопка disabled, selected —
native tooltip «Выполнить узел», DOM qtip «Выполнить узел (F9)», run_current.
Первый новый runtime4c2189…aa104 run done-1788889705006 остановился до launch:
scoped graph reader не включал toolbar. Это исправлено и покрыто regression.
Копия Process-owner-1788889705006.lgp закрыта через UI до выхода harness99798.

Успешный run `.dock/text-import-v3/done-1788889866132`:
полный runtime `b57a583df4b9e24b7d9e2650bb63a904d492c81690c80622020b22a8592f42e5`,82files.
Пакет `/user/dock-p3/packages/Process-owner-1788889705006.lgp` открыт writable.
`graph-execution-baseline.json` root172, empty history; `common-graph-launch.json`
один typed execute_graph_node через graph-execution-probe:n13, durable receipt.
`graph-execution-identify.json`: новая группа1 record173;
`graph-execution-completed.json`: requested Calculator1.2 record175, upstream1.1,
execution1788889868396-skp4nksbwr8:172:1, Show Node/native owner verified.
`graph-execution-output.json`: MappedId integer/Expr1 real,3×2, (1,0),(2,0),(3,0).
`common-graph-launch-audit.json` PASS/6 negatives: raw browser sequence, unique
launch operation, native selected process/graph, table values, full source pin.
Старый marker operator_execution_only в output helper означает отдельный
диагностический вызов чтения; сам launch теперь общий typed driver, не raw click.
Аудит не заявляет numeric precision acceptance или полную public интеграцию.

Пакет закрыт через UI, вопрос сохранения настроек визуализатора отклонён,
`closed-confirmed.json` closed=true/saved=false. Harness13793 exit0.
Сейчас нет активного harness этого участка. Production не менялся.

Следующий шаг: промежуточный node Done → отдельный port mapping/Done →
launchGraph/identify/waitCompleted внутри ОДНОГО node.apply. Сейчас helper
не подключён к полному public пути отдельного порта; imports.text.finish
по-прежнему использует собственный execute_wizard. Не объявлять полный03 готовым.
Также остаются Save As navigation identity bug, многопроцессная отмена,
оставшаяся acceptance matrix и финальный Hermes Sol/low.

---

# Подплан 03 — процесс с зависимостями принят компонентно, 8 сентября 2026, 20:43 МСК

Live component PASS: `done-1788889089693/process-owner-audit.json`,6 negative
checks. Полный runtime pin `6d6500f23b6f455d2f1c6276b6cc331b8670b501f862fc858c2ae9122bd152d2`
проверен против текущих82 source files. Исторические client973 PASS/1 SKIP
остаются актуальны: source после этих тестов не менялся.

Исходный пакет Optional-exclusion-1788887985822.lgp снова открылся readonly.
UI сообщил, что пакет занят либо нет write доступа. Создана отдельная копия
`/user/dock-p3/packages/Process-owner-1788889089693.lgp` через Save As.
Её первая operator активация выделила группу1, process1.2 Calculator корректно
выбран, но Show Node дал AMBIGUOUS: после Save As меняется navigation tid.
`browser-50.json`: gesture show_process_node применён, затем
PREPARED_NODE_CONTEXT_CHANGED/navigation. Эту команду не повторяли.
`show-node-after-failure.json` подтверждает переход к OptionalPortProbe.
Это отдельная незакрытая проблема навигации после Save As; не считать
переоткрытие продуктовым решением и не ослаблять идентичность.

Копия затем полностью закрыта/открыта без сохранения (`copy-reopened.json`),
получен новый workflow ...-3. `reopened-baseline.json` сохранил старую группу1,
`reopened-launch.json` — один operator click, `reopened-identify.json` — новая
группа2 record391 при прежнем root232. `reopened-completed.json` подтвердил
Calculator process2.2 record393 и execution `1788889091982-26tvwqudyae:232:2`.
В группе также upstream process2.1; cached ModelNode identity и независимый
Show Node связали2.2 с GUID67594185-61e4-41d0-95ec-19e320766a6f.
`reopened-output.json`: MappedId/Код integer,Expr1 real; строки(1,0),(2,0),(3,0).
Audit проверяет raw browser порядок reopen→baseline→launch→Show Node→native
selected process/graph→table, сохранность старой группы, полный source pin и
подмены6 входов. Это operator component, не public graph launch и не Hermes.
Numeric precision acceptance этим аудитом не заявлена.

При завершении закрыт именно диагностический пакет; вопрос сохранения изменений
визуализатора отклонён (`copy-close-confirmed.json`), повторного save не было.
Harness50744 штатно закрыт exit0. Активного harness этого участка нет.
Следующие обязательства: общий graph launch внутри node.apply после port Done,
проверка/recovery navigation после Save As, оставшаяся matrix и финальный Hermes
Sol/low. Полный03 не завершён. Production не менялся.

---

# Подплан 03 — выбор процесса с зависимостями, 8 сентября 2026, 20:38 МСК

Выбор дочернего процесса расширен для запуска вместе с upstream-узлами:
`node-process-context.mjs` связывает cached ModelNode с уникальным node.data
по идентичности объекта, только на графе. `selectExecutionChild` выбирает
единственного native-owned ребёнка; независимая проверка Show Node остаётся.
При неоднозначной связи принятие запрещено. Общий graph Execute внутри
node.apply и многопроцессная отмена этим изменением ещё не завершены.

Focused tests55 PASS; полный client973 PASS/1 SKIP (974 total), exit0:
`.dock/text-import-v3/process-owner-focused-tests.txt` и
`.dock/text-import-v3/process-owner-client-tests.txt`.
Новые проверки покрывают чужой/похожий proxy, duplicate GUID/shared model,
wizard surface, неоднозначную или неподтверждённую принадлежность процесса.

Предыдущее live evidence `done-1788888563872/graph-process-owners.json`
показало Import03Done и OptionalPortProbe в одной новой группе с разными
ModelNode. Новый run `done-1788888958800`, полный runtime pin
`6d6500f23b6f455d2f1c6276b6cc331b8670b501f862fc858c2ae9122bd152d2`,
не дошёл до выполнения: сохранённый пакет открылся «только чтение»
(`baseline-visible-failure.json`), prepare завершился readiness timeout
до разрешения мутации. Причина блокировки пакета пока не установлена.
Harness штатно закрыт, exit0; новая live-приёмка выбора процесса НЕ получена.
Следующий шаг: доступный для изменения диагностический пакет, baseline →
один graph launch → identify → waitCompleted → независимый audit, затем
общий graph launch в node.apply, оставшаяся матрица и Hermes Sol/low.
Production не менялся. Подплан 03 остаётся открыт.

---

# Подплан 03 — batch mapping и active-port deactivation, 8 сентября 2026, 20:26 МСК

Подплан03 открыт. Продолжение20:02 дало два новых принятых компонента: открытие
активного порта с деактивацией и общий пакетный mapping с исключениями,
переименованием, порядком и autosync. Последний полный runtime pin:
`76d5b4b51afb25dc3099324b1c7f4e664bbf88c83f59e8951f76a078de02f444`,82 файла.
Не объявлять готовым полный03 или public Calculator handler.

## Открытие активного порта

`node-port-open.mjs` теперь различает мастер и точный вопрос деактивации после
Configure. Перед «Да» проверяются исходные document/workflow/package, node.data,
port.data/GUID/index/parent, тот же ModelForm/FCurrentPortMenu и workflow tree,
единственный native dialog, полный вопрос, три точные кнопки и допустимые фоновые
маски. Перед trial запоминается экземпляр диалога/кнопки; после trial он сверяется
повторно. Фаза `deactivation_issued` записана до клика. Replay не подтверждает
диалог заново, а только сверяет уже открытый мастер. Lookup сохранённой фазы
выполняется до проверки loading mask, чтобы потерянный ответ «Да» не становился
ложным NOT_APPLIED. Никакие proxy методы не вызываются.

`done-1788887001966` воспроизвёл прежний AMBIGUOUS: Configure открыл вопрос,
при этом card.Controller.Node оставался WorkFlowTreeNode; FCurrentPortMenu
сохранял точный порт. `active-port-dialog-owner.json`/`active-dialog-shape.json`
сохраняют UI evidence. Вопрос отменён operator cancel, run закрыт.

`done-1788887237430`: полный pin49261636…a9ed/82files, active-calculator →
channel open → одна подтверждённая деактивация → тот же мастер → replay без
жестов → native prepared context. `port-deactivation-audit.json` — independent
PASS/7 negatives. Это operator component на указанном pin, не Hermes. После
этого изменены общие mapping/UI источники; не переносить full pin автоматически.
Tests проверили10 подмен между trial и «Да», потерю ответа после клика и replay.

## Общий пакетный mapping

`port-mapping-procedure.mjs`:
- Resolver узнаёт уже исключённые source records; не теряет их identity.
  Полный запрос проверяется до эффектов, включая обязательность/наследование,
  конфликты имён и неизменные имя/метку исключения, совпадающие с source.
- configureOutputFields выполняет exclusions до редактирования активных полей,
  проверяет полный native snapshot между шагами и не повторяет готовые исключения.
  Planner учитывает занятые имена исключённых полей и не открывает их редакторы.
- reorderOutputFields упорядочивает отдельно active и excluded группы,
  сохраняя относительный запрос внутри каждой группы. Перенос через границу
  запрещён; store/global index и group_index проверяются после каждого шага.
- Autosync и reorder используют только точные поддержанные controls двух форм.
  Возврат excluded→active пока явно не поддержан: нужен отдельный verified
  inclusion path; текущий вызов отказывает до жестов. Не объявлять этот режим готовым.

В live `execute-1788887508584` исключения и autosync применились к draft, но
глобальный редактор Id не прошёл ownership guard. Native evidence доказало
Records[0] === выбранная запись Derived target store. Расширен owner grid lookup
в `workspace-ui.mjs`. Повтор `execute-1788887772450` выявил второй слой:
root discovery не включал Derived target grid в глобальные guards. Добавлены
точные маркеры этой формы; full scan и discover_roots покрыты одинаковыми
положительными/отрицательными тестами. `batch-editor-current-reader.json`
подтвердил live portal_bound и выбранный Id. Оба неполных draft отменены, без save.

**Принятый полный batch run:** `.dock/text-import-v3/execute-1788887985822`.
`batch-mapping-audit.json` — независимый PASS, полные82 runtime sources,
15 journaled mutations,8 negatives. Проверены raw browser/native definitions,
журнал prepared/completed, source preservation, типы и незапрошенные свойства:
- autosync=false;
- Id → MappedId, метка «Код»;
- Title/Amount исключены;
- active порядок MappedId,Expr1; excluded порядок Amount,Title;
- полный повтор mapping без эффектов; typed Done с возвратом к тому же узлу.

Сохранён `/user/dock-p3/packages/Optional-exclusion-1788887985822.lgp`.
`optional-qa-reopen.json` — close/open без save; `optional-reopen-target.json` —
тот же node GUID `67594185-61e4-41d0-95ec-19e320766a6f`, новый workflow/tabTF-4,
без create/configure/effects. `optional-reopened-groups.json` сохранил исключения
в заданном порядке. После Close без применения operator Execute и основной
Table reader показали MappedId/Код,Expr1 и строки `(1,0),(2,0),(3,0)`.
`batch-persistence-audit.json` — independent component PASS/5 negatives;
**это сохранность mapping/выхода, не полный process-freshness audit**.

## Ограничения и точное продолжение

- В operator Execute была неверная проверка иконки: ожидала active.svg, а при
  autosync=false фактическая иконка — `output_table_active_no_automapping.svg`.
  Browser523 сохранил timeout. Основной `node-output-context.mjs` уже поддерживает
  обе иконки; browser526 прямо подтвердил active=true и тот же unlocked node
  до чтения Table. `optional-reopened-activity.json` — точная копия этого прямого
  readback, не выдуманная успешная квитанция выполнения. Auditor так её и называет;
  execution_freshness_verified остаётся false.
- Дополнительная попытка operator reexecution после принятого Table не состоялась:
  первый отказ до изменения из-за ошибочной проверки active icon; следующий
  raw selection timeout на уже выбранном node body, перекрытом NodesControls.
  Core новый Table attempt также дал `NOT_APPLIED/effect_possible=false`
  (`browser-607.json`, optional-reexecution-output:n2). Не считать эти попытки
  новым выполнением. Дальше проверить выбор уже выбранного графового узла:
  использовать observed native selection/point, не raw click поверх hover overlay.
- Отдельный seed run `execute-1788887659662` завершён exit1 на connect:
  create/rename подтверждены, затем Graph is blocked, pending graph:2,
  AMBIGUOUS сохранён. Это неполный несохранённый fixture, не PASS batch.
  Private harness теперь снимает UI при таком отказе. Последующий новый fixture
  прошёл; причина прежнего transient blocker ещё не доказана и в matrix не закрыта.
- Далее сверить общий отдельный порт Done→graph Execute и independent new-process
  freshness внутри одной node.apply, ограничения inclusion и прочие строки matrix;
  затем финальная Codex проверка и новая frozen Hermes Sol/low приёмка. Третий
  frozen Hermes FAIL не переоценён. Не считать component PASS заменой этой цели.

Проверено: client **960 PASS / 1 SKIP** (961total),
`.dock/text-import-v3/batch-editor-context-client-tests.txt`; earlier focused259
PASS и отдельный новый discovery regression PASS. Последние два аудитора повторены
после закрытия run, `git diff --check` PASS. OpenViking healthy.
Все handles участка terminal:47596,4585,51423,71608,56646 exit0;55686 exit1;
test handles8789,99115,53080,45259,67779 exit0. Production/installed client
не менялись, commits и Hermes не выполнялись. Последний pin не менялся в live run.

---

# Подплан 03 — общий exclusion channel и сохранённый выход, 8 сентября 2026, 20:02 МСК

Подплан03 открыт. На полном pin
`0317f14a0e20e15474d599ae09675ad23d04e0cabe269e7e35dd6de9a08998ae`
(82 файла) принят operator component: отдельный порт → исключение Title →
повтор без эффекта / отказ обязательному Expr1 → исключение Amount → typed Done.
Вызовы идут через `createNodeProcedure.openOutputPort`, durable prepared/completed
journal и browser receipt wrapper. Это ещё не готовая публичная операция для
Калькулятора: внешняя operation gate остаётся обязанностью вызывающего runtime,
а общий batch resolver/planner/reorder пока не интегрирует excluded fields.

Изменения относительно checkpoint19:22:
- `node-procedure.mjs`: bounded private openOutputPort с журналом до жестов,
  проверкой квитанции и владельца; refresh внутри perform сохраняет readMappings.
- `port-mapping-procedure.mjs`: общий `excludeOutputField` проверяет полную
  схему, точную необязательную source identity, замену записи исключением и
  сохранность остальных полей. Повтор уже исключённого источника без жестов.
  `finishPreparedOutputPort` использует существующий typed finish_wizard и
  подтверждает возвращение в тот же незаблокированный graph node.
- `workspace-ui.mjs`: отдельный мастер допускает typed Done с полной адресной
  страницей и verified port ownership. Групповые Index учитываются отдельно;
  для Derived grid разрешён геометрический roundoff <=1/64 CSS px. Live overflow
  заголовка группы был1/128 px; отрицательная проверка0.5px остаётся отказом.
- `node-port-open.mjs`/`node-context.mjs`: после package reopen FPortIndex
  может отсутствовать; точные DOM/native hit, native parent и port tree index
  всё равно обязательны. Чужой явно заданный индекс отклоняется.

**Основное evidence:** `.dock/text-import-v3/execute-1788886511372`.
`exclusion-channel-audit.json` — independent PASS, полные82 runtime sources,
6 durable mutations (open,4 selection/exclusion clicks,1 typed Done),9 negatives.
Аудитор сопоставляет raw browser replies, native source/target snapshots и journal;
учитывается только проверенная нормализация terminal slash у output.origin.
`channel-exclusion-checks.json` сохраняет replay no-op и required refusal.

`optional-package-save.json`: сохранён новый
`/user/dock-p3/packages/Optional-exclusion-1788886511372.lgp`.
`optional-qa-reopen.json`: фактические close/open без дополнительного save.
`optional-reopen-target.json`: тот же GUID `fbfed52a-6322-4f91-85b7-1693f974e0f7`,
новый workflow id, existing target без configured/effects. После открытия
`optional-reopened-native-groups.json` содержит Title/Amount в «Исключенные».
После Close без применения и одного operator Execute без настройки источника
`optional-reopened-output.json` показывает Expr1/Id,3 строки `(0,1),(0,2),(0,3)`.
`exclusion-persistence-audit.json` — independent component PASS/5 negatives,
сравнивает сохранение, close/open, native graph target, исключения и прямую
Table-страницу с CSV. Это ограниченная проверка сохранения исключений/выхода:
operator execution, без полного process-freshness audit и без Hermes acceptance.
Итоговый harness summary относится только к seed import; его package_saved:false
не отменяет отдельную подтверждённую квитанцию optional-package-save.

Дополнительные находки для следующего шага:
1. В `done-1788885651224` saved package открыт read-only. До выполнения узла
   source store пуст; после исполнения Калькулятора источники4 появляются,
   но target totalCount не включает записи исключений. Такое пустое состояние
   до исполнения повторено и в новом editable reopen. Нельзя объяснять всё
   только read-only или ослаблять mutation reader: отсутствие source metadata
   и режим проверки сохранения нужно отделять от допуска к редактированию.
2. Открытие порта активного узла вызывает точный вопрос:
   «Настройка порта приведет к деактивации узла. Вы действительно хотите начать
   настраивать порт?». Native opener пока не поддерживает этот переход:
   `optional-saved-executed-port:n2` остался AMBIGUOUS после Configure, повторного
   Configure не было. `saved-executed-visible.json` фиксирует вопрос;
   `saved-deactivated-groups.json` — явно operator confirmation, не recovery PASS.
   Добавить привязанное к исходному port/node opening подтверждение и отрицательные
   проверки перед новым live. Не снимать неизвестный эффект новым operation ID.
3. QA reopen меняет tab/prefix (здесь TF-1→TF-4). Private probe сначала ждал
   устаревший selector, затем выполнено только bound observation без повторного
   открытия. Продуктовый opener уже использовал новый prepared prefix.

Проверено: client **954 PASS / 1 SKIP** (955total),
`.dock/text-import-v3/exclusion-final-client-tests.txt`; оба independent audit
повторены после закрытия harness; git diff --check PASS. OpenViking healthy.
Handles30025,41425,85883 terminal exit0. Run41425 завершил seed без operator
команд из-за закрытого stdin; повтор85883 запущен только после terminal exit.
Production/installed client не менялись, Hermes не запускался, третий frozen
Hermes FAIL сохранён. Исходники во время последнего полного pinned run не менялись.

Далее: deactivation открытия активного порта; интеграция общего batch mapping
с exclusions и проверка применимости к контракту03; сверка оставшихся строк
acceptance matrix; итоговый Codex сценарий и новая frozen Hermes
`openai-codex / gpt-5.6-sol / low` приёмка. Не объявлять полный03 завершённым
по двум новым компонентным PASS.

---

# Подплан 03 — отдельный порт привязан к узлу, 8 сентября 2026, 19:22 МСК

Подплан03 открыт. Добавлен private browser primitive `node-port-open.mjs`:
подготовленный незаблокированный graph → точный табличный output port → native
FCurrentPortMenu/FPortContextMenu → ConfigurePort → мастер с подтверждённым
деревом WizardTreeNode/ModelPortTreeNode/ModelOutputPortsTreeNode/ModelNodeTreeNode.
Объекты node.data и port.data совпадают с FModelNode и FModelNodePort дерева;
никакие свойства или методы RPC proxy не вызываются. Квитанция сохраняет точные
объекты, GUID, индексы, FModelEnginePort и экземпляр мастера.

`readPreparedNodeContext` принимает отдельный мастер только при единственной
verified opening receipt и совпадении всех владельцев. Обычная проверка FModelNode
сохранена. Контекст отдельно возвращает output_port с opening_operation_id.
Фазы записываются до жестов; неизвестный эффект не вызывает повтор Configure.
Повтор verified operation только сверяет прежний экземпляр мастера. Чистый отказ
до жеста освобождает reserved receipt, а unresolved effect остаётся закрытым.
Это пока private primitive: **ещё не подключён к общей runtime operation gate,
фазовому журналу node.apply и driver исключения**. Не считать готовым public API.

Live evidence `.dock/text-import-v3/execute-1788883746976`:
- Native `menu-wizard-binding.json`: graph node.data === tree.FModelNode;
  graph port.data === tree.FModelNodePort; правильный node GUID и native index0.
- После выбора порта mxGraph shape.node становится отдельным hover-рисунком
  без data-tid. `port-shape-binding.json`: оба SVG присутствуют; graph.getCellAt
  центра наблюдённого порта возвращает тот же FCell. Opener использует native
  hit + точный DOM + port object, а не один селектор. Hover может заменить DOM
  до жеста; он перечитывается после trial с неизменным native FCell.
- Скрытое меню остаётся display:block/visibility:hidden. Для opener и mapping
  reader включён checkVisibilityCSS; default checkVisibility() этого не доказывал.
- `port-open-driver-v4.json`: AMBIGUOUS из-за loading mask после открытия,
  сохранён без перезаписи. `port-open-reconcile.json`: тот же open_issued receipt
  принят без кликов. В primitive добавлено bounded ожидание маски в finish.
- **`port-open-final.json` PASS**: полный свежий путь final operation с двумя
  жестами; `port-open-final-replay.json` PASS без повторных жестов.
  `bound-mapping-final.json` связывает четыре поля с тем же node/port/opening ID.
  `port-open-audit.json` — independent component PASS, hashes трёх исходников
  и трёх входных отчётов. Это operator diagnostic, не full runtime acceptance:
  сессия начиналась на pin6baaa6a2…fdb2, исходники уточнялись в ходе диагностики.

Проверено: focused34 PASS; client **947 PASS / 1 SKIP**, всего948.
Логи `.dock/text-import-v3/optional-port-focused-tests.txt` и
`optional-port-open-client-tests-final.txt`. Tests покрывают чужое меню, чужой
мастер/порт, повтор операции, отказ до жеста и17 подмен native ownership.
`git diff --check` PASS. Handles3759,22595,34512 terminal exit0.
Пакет не сохранялся; Hermes не запускался; production и установленный клиент
не менялись. Третий frozen Hermes FAIL остаётся историческим FAIL.

Далее: подключить primitive к общей operation gate/журналу, открыть новый
полностью pinned diagnostic session, добавить исключение через общий channel,
проверить active/excluded schema и сохранение порта. Затем закрыть остальные
строки acceptance matrix и новую frozen Hermes Sol/low приёмку.

---

# Подплан 03 — чтение исключённых полей, 8 сентября 2026, 19:07 МСК

Подплан 03 открыт. Общий `node-mapping-context.mjs` теперь читает также
`DerivedDataSourceOutputSocketWizard`: раздельные индексы групп, активные связи,
признак наследования и `exclusion_source` без ложной активной `source`-связи.
Для исключённого поля проверяются имя/тип исходного поля, отсутствие связи,
Required=false, IsDerived=false, пустые SourceDisplayName/SourceDataType.
Неизвестные группы, два видимых мастера и противоречивые записи отвергаются.
Семантика прежнего ColumnsMappingEngineOutputPortWizard сохранена.

Live diagnostic `.dock/text-import-v3/execute-1788883220223`:
- Новый импорт Execute/read3×3, затем отдельный Calculator `OptionalPortProbe`.
  Expression `0` → Next/done → Done → выходной порт; переход Next/done принят.
- `groups-before.json` / `groups-after.json`: Title исключён одним кликом;
  три активных выхода, новая запись991 в группе «Исключенные», source985 без связи.
  DOM row index3 и group Index0 различаются; точные record IDs и ячейки сохранены.
- `shared-reader-after.json` и `optional-group-audit.json`: standalone reader PASS,
  четыре строки и сохранность источников проверены независимо. Reader SHA256
  `60cd8bdbff9daa9f44b07cf027fb9fd8705e99d2fddc38a7576d7827ffd42f6f`.
  Это диагностика обновлённого reader внутри ранее запущенной сессии,
  **не full runtime acceptance**: session начиналась на pin172a9d84…a590.
- `bound-reader-after-v2.json` / `separate-port-context.json`: общий prepared
  context правильно отказал `mapping_node_surface` / `wizard_model`.
  Отдельный WizardModelComponentForm имеет FModelEnginePort вместо FModelNode.
  Native chain: WizardTreeNode → ModelPortTreeNode(index0) →
  ModelOutputPortsTreeNode → ModelNodeTreeNode(GUID41e9ce03…19fba).
  FModelNodePort и FModelEnginePort — разные объекты; cachedProps пусты.
  Их прямую identity-связь не доказали и guard не ослабляли. Details:
  `separate-port-owner.json`, `separate-port-tree-owner.json`,
  `separate-port-cached-binding.json`, `separate-port-cache-links.json`,
  `separate-port-proxy-identity.json`. RPC/dataset methods не вызывались.

Следующий шаг: проверяемое открытие отдельного выходного порта с квитанцией
точного узла/индекса/мастера, затем его native ownership binding и общий driver
исключения. Простое совпадение подписи или ослабление wizard_model недопустимо.
После подключения нужны live driver/negative/persistence проверки, завершение
матрицы и новый frozen Hermes Sol/low. Третий Hermes frozen FAIL не изменён.

Client **940 PASS / 1 SKIP**, focused22 PASS (18 отрицательных вариантов
исключения внутри теста). Лог `.dock/text-import-v3/optional-group-client-tests.txt`.
`git diff --check` PASS. Handle48923 закрыт, exit0; handle66319 tests exit0;
старый83426 отсутствует. Пакет диагностического Calculator не сохранялся.
Production, установленный клиент и модель не менялись; Hermes не запускался.

Также завершена свежая wide66 проверка предыдущего участка:
`execute-1788881313848`, pin172a9d84…a590/81 files, source/output PASS,
66 полей/132 значения, rename/order последних Field65/66, шесть negatives.
Она не доказывает package persistence или автономную приёмку.

---

# Подплан 03 — existing Close принят, 8 сентября 2026, 18:27 МСК

Подплан03 открыт. Исправлена гонка после Close существующего импорта: граф
возвращался до освобождения native FLocked. Run `close-1788880632881` завершился
отказом следующего node.apply `Node is locked`. Отдельный read-only probe в
`close-1788880737667` подтвердил переход true→false за804ms. Внешнее ожидание
operator harness не считалось исправлением продуктового пути.

В prepared node context добавлен наблюдаемый locked для graph. Close теперь
ждёт same document/workflow/node, absent wizard, no dialogs/masks и locked=false.
Первый новый run `close-1788880902389` выявил смену lock внутри снимка;
его AMBIGUOUS/finish сохранён. Read-only observer теперь отбрасывает такой
смешанный снимок и перечитывает до2 раз, только при неизменной полной identity.
Pre-gesture проверки не ослаблены; никакой повтор Close не добавлен.

На runtime `172a9d847614f6ebb4dfdecd549d4238cd6609b04531281e2bd962113350a590`
принят `close-1788881029732`: seed Execute/read3×3 → existing sparse label edit →
Close → unchanged Execute/read3×3, без дополнительного operator wait.
`independent-existing-close-audit.json`: source81 files/draft/close/restored PASS.
`independent-existing-close-negative-audit.json`:8 повреждений отвергнуты.
Новый auditor требует реального изменения черновика, подтверждённой отмены,
разблокировки того же узла и baseline/fresh output после отмены; разрешение
открытия уже деактивированного узла включается только после доказанного Close.
Component acceptance не заменяет package persistence/Hermes acceptance.

Client937 PASS/1 SKIP (`close-unlock-client-tests-final.txt`), независимые
`test_*evidence.py`181 PASS (`close-unlock-evidence-tests.txt`), diff check PASS.
Все diagnostic/test handles этого участка terminal:39432,18663,99773,46499,
56340,30954,67284,49853. Несохранённые браузерные черновики закрыты harness;
их наличие нельзя предполагать для продолжения. Production/installed client unchanged.

Далее: полная матрица03, включая общий port driver/границы exclusion, wide и
public lifecycle; затем Codex unchanged saved-package proof на итоговом pin и
новый frozen autonomous Hermes Sol/low. Прежний третий Hermes frozen FAIL не
переписывался. Modes8 source/output PASS относятся к предыдущему полному
pin7e943d44…5b66; последующие изменения — graph lock observation/Close readiness.
Не объявлять весь подплан завершённым по этому component PASS.

# Подплан 03 — диагностика Hermes и режимы импорта, 8 сентября 2026, 18:17 МСК

Подплан03 открыт. Третий autonomous run `20260908-175420-820c1351` завершился:
Sol/low, process0, completed=true, 16 public calls, два node.apply с выходом6×5,
три сохранения. Исходный frozen `node-apply-audit.json` — FAIL/persistence;
он не перезаписывался. SHA256 `c4dc2d72266c2e76cbc99bf1fed3ca8fdb15081695b6f020e1cd3652dab16739`.

Независимая диагностика выявила два пробела: после reopen Hermes повторил весь
settings и mapping (48 подготовленных шагов, реальные set/fill/check действия);
после reexecute снова перезаписал final пакет без проверки этой последней версии.
Даже prefix до последнего save не принят: `reopen_unchanged_request`.
`save-persistence-diagnosis.json` — отдельная диагностика, не исправленный frozen PASS.
Граф и свежий выход сами по себе не доказывают сохранность настроек.

Исправлена лишняя проверка auditor: согласованные start/end parameters могут
иметь fail или replace, если фактического overwrite не было. Конфликт/overwrite
по-прежнему требует отдельного доказательства и этим gate не принимается.
Добавлена отдельная причина `reopen_mapping_reapplication` и negative test;
19 node_apply tests и116 import tests PASS. Native Hermes skill теперь объясняет
пустой settings/mappings для unchanged reexecute и границы package_saved:false:
последующая перезапись требует новой проверки последней версии.

Новый runtime `7e943d441c23a00fa41564c893bf39685c73008794b6be8abd495222177f5b66`.
Preflight `hermes-preflight-native-skill-fix.json` PASS, model_started=false.
Старая mode-matrix-20260908 завершилась exit1: первые3 cases source/output PASS,
UTF16BE output PASS, но source audit отверг пересечение с изменением native skill.
Эти старые результаты не относятся к новому pin. Новая серия
`mode-matrix-20260908-native-skill-fix` завершена handle60581/exit0:
все8 source/output audits PASS, 81 files, pin7e943d44…5b66. Режимы: empty,
Windows1251/1252, UTF16LE/BE, TSV+skip2+decimal-comma, headerless, Boolean/DateTime.
Отчёт `reports.json` связывает каждый run с отдельным fresh execution ID.
Это проверка байтов/выполнения/полного малого выхода, не package/Hermes acceptance.

Следующий пробел: existing Close. Подготовлены operator harness
`existing-close-diagnostic.mjs` и независимый `existing_import_close_evidence.py`.
Прогон `close-1788880632881` выполняется handle39432: seed Execute/read → sparse
label edit → Close → unchanged Execute/read. Проверять тот же handle; по одному
успешному ответу не принимать отмену. Далее независимый audit/negative cases,
remaining matrix и Codex unchanged reopen, затем новый autonomous Hermes.
Production/installed client unchanged; коммиты и deploy не выполнялись.

# Подплан 03 — ожидание MCP перед Hermes исправлено, 8 сентября 2026, 17:53 МСК

Подплан03 открыт. После принятого source-name/full-save цикла запущен второй
Hermes run `.dock/text-import-v3/hermes-runs/20260908-174554-c8a23a63`,
openai-codex/gpt-5.6-sol/low, тот же runtime3d4f64e6…faaa. Он завершился без
инструментальных действий: модель сообщила, что Dock tools отсутствуют.
Process0/completed=true не признан успехом; independent frozen audit FAIL:
efficiency (нет фаз), complete_export, two_import_operations. Handle6805 terminal.
Auth guard installed, blocked_attempts0, connection unchanged. Exported counters
теперь корректны: input4023/output142/total4165, reasoning84, api_calls1.
Это проверка экспорта usage, не выполненная Loginom задача.

Причина подтверждена в настоящем Hermes discovery без model call:
`hermes-discovery-diagnostic.log`: default wait15.05s вернул registered=false,
затем в16.50s server connected/registered=true. `hermes_cli/oneshot.py` строит
AIAgent после ограниченного ожидания, у которого default single-query=15s.
Объявленный connect_timeout180 этого ожидания не меняет.
В изолированную config runner добавлен `mcp_single_query_discovery_timeout:180`,
соответствующий connect budget. Пользовательская установка Hermes не менялась.

Независимая config/discovery проверка без модели:
`hermes-discovery-180-recheck.log`: зарегистрирован Dock в18.07s ДО возврата
из ensure_mcp_discovery_before_agent_build. Handle27549 exit0; первый diagnostic
handle1806 exit0. Промежуточный новый diagnostic home имел неправильные modes
каталогов и отказал при startup (hermes-discovery-180.log, handle3151 exit0);
исправлены только его permissions на0700/config0600, после чего recheck прошёл.
Боевой isolated runner уже создаёт эти каталоги с правильными permissions.

Следующее действие: новая самостоятельная node-apply-complete Hermes попытка
с увеличенным discovery wait и новым frozen harness. Не менять source/harness
во время model run; аудит должен подтвердить полный импорт и сохранённый пакет.
Сохранить все остальные требования матрицы03 и новые full-pin mode runs.
Production/installed client unchanged. Сейчас процессы этого продолжения terminal.

# Подплан 03 — source-name binding и полный цикл приняты live, 8 сентября 2026, 17:44 МСК

Подплан03 открыт. Исправлен configureImport для нового fieldsOnly импорта:
полная parsed schema сопоставляется с настройками по source_name/name, а не
позиции списка. Сохраняется порядок CSV; duplicate/missing/foreign source refs
отклоняются. Legacy draft и existing patch не меняют свою семантику.
Независимый import_source_binding.py восстанавливает порядок из исходных bytes;
Done/output/persistence verifiers используют эту привязку. Sales goal принимает
иной порядок перечисления source settings, но сохраняет строгий output mapping.

Client935 PASS/1 SKIP (`source-binding-client-tests.txt`, handle12132 exit0),
Python import116 PASS, node_apply16 PASS; старый sales persistence audit также
повторно PASS. git diff --check прошёл.

Real remote MCP run `.dock/text-import-v3/remote-binding-20260908-174000-b10dc217`,
runtime `3d4f64e6dfc69e9244ca974199106948d9dc1960bae43573b8049bb2f37cfaaa`.
81 runtime file independently verified. Использован смысловой запрос Hermes:
source fields перечислены по типам, JSON keys сортированы. Новый импорт
`import-binding` принял все поля; output6×5 с Price/Цена первым. Затем
save-binding-checkpoint сохранил `.lgp.draft.lgp` без закрытия, save-binding-final
сохранил `/user/dock-p3/packages/Dock-acceptance-20260908-174000-b10dc217.lgp`.
Exact prepare-final и `import-binding-reopened` дали unchanged settings и fresh
execution `1788878414048-h55flsdlgu6:516:3` после seed `...:516:1`.
`source-binding-audit.json`: full source/delivery/output/goal PASS;
`source-binding-negative-audit.json`: 4 подмены source/type/output order отвергнуты.
`persistence-audit.json`: two-save/reopen/settings/fresh-output и public receipts PASS.
Bridge handle64745 explicit close/exit0. Это Codex operator acceptance, не Hermes.

Следующий шаг — новая goal-only Hermes Sol/low попытка после исправления двух
подтверждённых ошибок. Frozen audit прежнего run20260908-172751-b7e388d1 оставлен
FAIL без переписывания. Полная матрица03, новые fixed-pin mode runs и оставшиеся
общие gates сохраняются. Production/installed client unchanged.

# Подплан 03 — Hermes выявил привязку полей по позиции, 8 сентября 2026, 17:36 МСК

Подплан03 открыт. Автономный Hermes run
`.dock/text-import-v3/hermes-runs/20260908-172751-b7e388d1` был действительно
запущен на openai-codex/gpt-5.6-sol/low с frozen runtime c8dc7e60…d442.
Delivery/SHA прошли. Первый node.apply отказал NOT_APPLIED/cleanup=true ДО
создания узла: одинаковые navigation crumbs с порядком ключей label,tid
ошибочно отличались от tid,label через JSON.stringify. После установления
причины operator остановил isolated Hermes process group35915 SIGTERM;
runner handle93370 terminal/exit0, child returncode=-15, timed_out=false.
Это не успех Hermes. Исходный frozen `node-apply-audit.json` сохранён FAIL:
model, efficiency, tool_scope, two_import_operations. Старый аудит не переписывать
после изменения harness; request/evidence/scenario/operator-stop сохранены.

Исправлен node-workflow-activation.mjs: сравнение tid/label по значениям,
с сохранением проверки порядка breadcrumbs и отклонения реального изменения.
Client **934 PASS / 1 SKIP**, `.dock/text-import-v3/json-order-client-tests.txt`,
handle25901 exit0. Дополнительная ошибка экспорта: generic clean скрывал
числовые *_tokens и весь efficiency.tokens. Теперь разрешены только неотрицательные
int/None counters в process.usage и efficiency.usage_counts; строки/объекты/bool
и access_token по-прежнему redacted. Поля отчёта — usage_counts/usage_complete/
counter_note. 11 focused Python tests и 4 export tests PASS. Старые отчёты
не исправлялись задним числом; для новых runs действуют новые exporter/auditor.

Реальное воспроизведение через remote MCP:
`.dock/text-import-v3/remote-order-20260908-173300-aec90217`, pin
`d72b2aab93f009dfcc6f5df967a74cb4ec7b1f99bcc631ea1e8aabb75022abe8`.
Полные 81 runtime files проверены. Переслан исходный запрос Hermes с новой
verified source identity и алфавитным порядком JSON keys. Workflow принят,
узел создан. Затем configure честно остался AMBIGUOUS/cleanup=false:
«Column names, labels or selection differ; this candidate only changes type and data kind».
Независимый полный output audit FAIL; это не принятый импорт. Bridge handle39154
закрыт explicit close, exit0. Никаких повторов частично применённого import-order.

**Точный следующий fix:** Hermes передал исходные поля с точным source_name,
но сгруппировал по типам: Id, Quantity, UnitPrice, Region, Comment. CSV имеет
порядок Id, Region, Quantity, UnitPrice, Comment. configureImport в
client/lib/text-import-procedure.mjs связывает parameters.columns[i] с native
column i. Для нового fieldsOnly режима нужно связать каждое запрошенное поле
по уникальному source_name (или name) с полностью наблюдённой parsed schema,
сохранив native порядок; отвергать отсутствующие/дублирующиеся/неполные refs.
Не менять семантику старого draft roundtrip. Независимые expected-field и goal
verifiers тоже пока сравнивают source settings list позиционно; обновить их
привязку независимо от runtime. Порядок выходного mapping по-прежнему строгий.
После этого — Codex real-MCP reproduction того же смыслового запроса и только
после успешной независимой проверки новая автономная попытка Hermes.

Source provenance-аудит восьми исторических modes завершён: все имеют
runtime_inventory_incomplete (`mode-provenance-audit-20260908-1728.json`).
Нужны новые fixed-pin прогоны соответствующих режимов; старые поведенческие
результаты остаются историческими. [Общая матрица](../plans/loginom-dock/03-acceptance-matrix.md)
сохраняет весь scope. Production/installed client unchanged. Сейчас все процессы
этого продолжения terminal; старые исторические handles не считать живыми.

# Подплан 03 — измерения и матрица приёмки, 8 сентября 2026, 17:25 МСК

Подплан03 открыт. Добавлен `tools/loginom-acceptance/node_efficiency.py`: отдельные
интервалы node_phase по original operation/receipt IDs, количество внешних вызовов
по tool и provider-reported input/output/total/cache/reasoning tokens. Отсутствующие,
отрицательные, bool/string counters не превращаются в нули. Cache/reasoning не
прибавляются к total повторно; длительность фазы включает ожидания и transport.
`run.py` сохраняет эти Hermes usage counters и `efficiency.json`; полный
`node_apply_acceptance.py` заново вычисляет отчёт и требует измеримые фазы и токены.
26 focused Python tests PASS, включая подменённый/отсутствующий отчёт, разные
часовые пояса, неизвестные counters, missing/duplicate/reversed phase intervals.

На actual operator evidence sales run20260908-165900-c97d23ef измерены 11 внешних
вызовов и все20фаз двух node.apply. `operator-efficiency.json` сохраняет неизвестные
model usage counters: Hermes в этом прогоне не было. Данные о токенах для будущей
приёмки берутся из настоящего Hermes usage-file, не оцениваются по размеру текста.

Текущий output auditor повторно принял восемь исторических режимов: empty,
Windows-1251/1252, UTF-16LE/BE, TSV+skip+decimal comma, headerless и Boolean/datetime.
Результаты: `.dock/text-import-v3/mode-evidence-recheck-20260908-1725.json`.
Проверены исходные bytes и журналы settings/execution/output; это НЕ подтверждение
полного inventory старых source pins. Режимы не запускались повторно в браузере.

[Матрица требований и оставшейся приёмки](../plans/loginom-dock/03-acceptance-matrix.md)
разделяет уже имеющиеся свидетельства, UI ограничения required output fields и
пробелы provenance/public lifecycle/финальной автономной проверки. Продолжать
по этой матрице; не трактовать исторические списки remaining как актуальный список
нереализованных функций и не считать component PASS завершением всего03.

`node-complete-preflight-20260908-1724.json`: Hermes0.21.0,
openai-codex/gpt-5.6-sol/low, approved connection/auth guard/runtime dependencies
прошли preflight; модель не запускалась. Client pin остаётся
`c8dc7e600734e99c92b594b4f8f7492fe5ffbf489ee2e9539f273684a953d442`.
Client runtime в этом продолжении не изменялся; предыдущая suite933 PASS/1 SKIP.
Полный run должен заново заморозить актуальный harness, включая новые тесты.
Production/installed client unchanged. Исторические checkpoints ниже.

# Подплан 03 — позднее восстановление workflow принято live, 8 сентября 2026, 17:19 МСК

Подплан03 открыт. Исправлена ранняя ветвь восстановления node.apply: инспекция
читает исходную Page-квитанцию workflow, проверяет тот же живой документ/пакет
и активную вкладку без клика, затем подтверждает фазу в журнале. Операция остаётся
незавершённой и удерживает gate до явного resume. Resume заново сверяет исходную
verified source identity и тот же workflow; исходные configure/total deadlines
не продлеваются. Unknown/foreign/unclean receipts, смена документа/источника,
ошибка записи журнала и истёкший deadline не разрешают продолжение.

Изменены node-apply.mjs, executor.mjs, node-target-browser.mjs и
node-workflow-activation.mjs. Полная client suite: **933 PASS / 1 SKIP**,
`.dock/text-import-v3/workflow-recovery-client-tests-final.txt`, handle67830 exit0.
Тесты проверяют раннее восстановление, блокировку конкурентного действия,
истечение исходного срока, journal failure и чтение реального Page ledger
без повторного переключения. git diff --check и Python compile прошли.

Real Loginom operator fault diagnostic:
`.dock/text-import-v3/execute-1788876971222`, runtime
`c8dc7e600734e99c92b594b4f8f7492fe5ffbf489ee2e9539f273684a953d442`.
`runtime-source-audit.json` независимо подтвердил все 81 runtime file и journal pin.
Browser viewport=null, inner2044×1035, outer2044×1122, available2048×1122.
Два ответа намеренно потеряны после настоящего переключения: ответ workflow
и первый ответ инспекции. Первый result остался AMBIGUOUS/workflow/cleanup=false.
Явный resume того же `import-execute` прочитал исходную квитанцию, создал ровно
один узел, закончил настройку и получил свежий выход 3×3; execution
`1788876973340-omwb6r0051t:510:1`. Activation вызвана один раз, receipt read дважды.
Повтор completed ID не обращался к браузеру. Harness handle61491 закрыт EOF, exit0.

Новый `tools/loginom-acceptance/workflow_recovery_evidence.py` проверяет порядок
pause → исходная квитанция → reconcile → explicit resume → live/source check → target.
`workflow-recovery-audit.json`: recovery PASS и независимый полный import/output
PASS. `workflow-recovery-negative-audit.json`: 10 подмен evidence отвергнуты.
Это operator fault injection через реальный browser MCP и локальный runtime,
не autonomous Hermes или проверка полного публичного remote recovery контракта.
Сохранение пакета в этом диагностическом прогоне не запрашивалось; успешный
sales save/reopen прогон на предыдущем pin остаётся отдельным доказательством.

Следующий участок: сверить полную матрицу требований 03 с уже сохранёнными
прогонами и фактическими ограничениями UI (в частности required output fields),
закрыть оставшиеся публичные lifecycle/эффективность/приёмочные проверки,
затем goal-only Hermes openai-codex / gpt-5.6-sol / low. Не повторять уже
законченные прогоны без новой причины. Production и installed client не менялись.
Исторические checkpoints ниже.

# Подплан 03 — полный remote sales цикл принят Codex, 8 сентября 2026, 17:09 МСК

Подплан03 остаётся открыт. Реальный MCP-прогон
`.dock/text-import-v3/remote-sales-20260908-165900-c97d23ef` завершён;
operator bridge handle79598 закрыт явной командой, exit0. Hermes не запускался.
На runtime pin `23a3605277240ec2f3f41941422f3262c6a4e7c9d77933766f10f6afb87ee84a`
проверены доставка 230 bytes/SHA f628…7eb3, полный node.apply нового импорта,
промежуточный package.save_checkpoint без закрытия, final package.save_as,
переоткрытие точного пакета и unchanged node.apply существующего узла.
Итоговый пакет: `/user/dock-p3/packages/Dock-acceptance-20260908-165900-c97d23ef.lgp`.
Оба результата — 6 строк × 5 столбцов, Price/Цена первым; execution IDs
`1788875972303-ebjacb84b56:508:1` и `1788875972303-ebjacb84b56:508:3` различаются.

`runtime-source-audit.json` подтвердил 81 runtime file; `seed-delivery-audit.json`,
`save-chain-audit.json`, `operator-components-audit.json` подтвердили файл/выход,
обе записи сохранения, привязку нового prepare, настройки после reopen и публичные
ответы node/save/delivery. Workflow activation audit прошёл для обеих операций.
`operator-negative-audit.json`: baseline PASS, 9 повреждений доказательств отвергнуты
(удаление save completion, prepare, checkpoint, public replies, workflow receipt).
Это независимая компонентная проверка реального operator-прогона, не полный
автономный outer verdict и не основание закрывать подплан.

Проверки этого продолжения: 21 focused Python test для goal/save/reopen/public/outer
контрактов PASS; git diff --check PASS. Новых изменений client runtime не было.

Уточнён незакрытый recovery path по текущим исходникам: `inspectApply` в
`client/lib/executor.mjs` пока возвращает результат только при durable node checkpoint;
для pending workflow отдельного чтения Page receipt нет. `activateWorkflow` в
`client/lib/node-target-browser.mjs` читает исходную квитанцию только сразу после
transport exception. `verifyContinuation` в `client/lib/text-import-node.mjs`
допускает лишь configure/output_mapping/finish и требует созданный channel/configured.
Поэтому поздняя успешная workflow-квитанция пока не даёт проверенного продолжения
до создания узла. Нужна согласованная read-only reconciliation исходной квитанции
и проверка того же draft/source перед явным resume; повтор click недопустим.
Это найденная незавершённая ветвь реализации, не новая ошибка успешного sales run.

Далее: закрыть оставшиеся требования общего lifecycle/late workflow resume,
сверить всю матрицу импортных режимов и независимых проверок с разделом готовности
подплана03, закончить измерение фаз/внешних вызовов/токенов и только после отладки
провести goal-only Hermes на openai-codex / gpt-5.6-sol / low. Production и
установленный клиент не менялись. Исторические checkpoints ниже.

# Подплан 03 — workflow activation live и transport fix, 8 сентября 2026, 16:58 МСК

Текущий turn дал source/live progress. Подплан03 открыт. Новая фаза workflow
реализована отдельно от read-only target.observe. node-workflow-activation.mjs
проверяет origin/build/document/verified receipt/tab/navigation, trial actionability,
затем при необходимости один tab click и post-read. Already-active не кликает.
Квитанция Page ledger связывается с исходным operation ID; при потере transport
ответа adapter читает receipt_read, не повторяет click. Если receipt пока неизвестен,
phase остаётся pending; полного позднего workflow inspect/resume ещё отдельно
не подтверждено. Не объявлять его проверенным по completed receipt recovery alone.

Real remote rehearsal `.dock/text-import-v3/remote-sales-20260908-165300-b17c20ad`,
handle26281 завершён explicit close/exit0. Live pin
`de4880ac07fea909874c669448005352675439b579fafa19bb4cbd4cd8788f4c`.
Новый документ1788875532508-720aup1mia, viewport1508×862, outer1508×949 при
available1512×949 (expanded). Delivery deliver-sales completed:230 bytes/SHAf628…7eb3,
тот же upload/verify IDs, файл Dock-upload-20260908-165300-b17c20ad.csv в/user/dock-p3.
Workflow trace: original TF-1 inactive→один click→тот же TF-1 active. Target создал
и переименовал узел Продажи, GUIDa4067242-5220-4054-90f7-917208d37342.
Independent workflow-activation-audit.json PASS/6 negative changes rejected.
Это только активация, НЕ принятый полный импорт.

После этого open phase отказал: Pinned browser capability returned no typed result.
Причина по code path: nodeApplyDriverFactory получал bridge execute, принимающий
только типизированный outcome, тогда как внутренние readers возвращают и plain
native objects. До channel journal здесь не дошло; wizard наблюдался absent.
Исходный AMBIGUOUS/open/cleanup=false сохранён, импорт не повторялся.
MCP wait дал transport error: новая workflow phase также отсутствовала в output
schema enum. Исходный результат прочитан обычным dock_operation_inspect;
ошибка ожидания не трактовалась как отсутствие effects.

После закрытия run: workflow добавлен в schema/PhaseName; executor оборачивает
внутренние scripts в typed transport envelope и возвращает драйверу исходный
output.value (включая typed domain refusals). Тест проводит plain native object и
NOT_APPLIED через реальный parseCapabilityResult. New client pin
`23a3605277240ec2f3f41941422f3262c6a4e7c9d77933766f10f6afb87ee84a` пока без live.
Source preflight254files PASS `.dock/text-import-v3/workflow-transport-preflight-20260908-1658.json`.
Client **927 PASS / 1 SKIP** `.dock/text-import-v3/workflow-activation-client-tests.txt`,
handle23472 terminal/exit0. Python import113 PASS, diff check PASS.

Новый workflow_activation_evidence.py проверяет phase pair, original document/
workflow/tab и before/click/after; import_done_evidence принимает новую фазу только
с этой проверкой (historical no-workflow retained). Outer node_apply_acceptance
требует workflow proof для обоих node.apply: удаление фазы не выдаёт legacy PASS.

Далее: новый remote sales run на pin23a…e84a, без ручного возврата к tab и без
повторного upload в старую сессию. Проверить полный import5×6, intermediate save,
final save/reopen и unchanged reexecute, полный outer auditor/negative evidence.
Операторскую историю не выдавать за Hermes. После Codex проверки всех текущих
сбоев и verifiers — автономный Hermes openai-codex/gpt-5.6-sol/low. Учесть
оставшиеся scope03/lifecycle/output-exclusion gates, а не только sales happy path.
Production/candidate/installed client прежние. Все handles этого участка terminal.

---

# Подплан 03 — отказ до графического эффекта исправлен, 8 сентября 2026, 16:48 МСК

Текущий turn дал source progress после live диагноза предыдущего. Подплан03 открыт.
Исправлена первая из двух выявленных проблем; возврат из Files в граф ещё не добавлен.

node-target.mjs возвращает cleanup_complete из наличия незавершённого graph effect.
executor prepareTarget передаёт trusted nodePhaseRefusal только для NOT_APPLIED,
partial_effect=false, cleanup=true и подтверждённого отсутствия targetPhase.pending/
effect_possible. node-apply.mjs подтверждает node_phase_refused в журнале, затем
восстанавливает прежнюю effect_possible и освобождает pending только для такого
локального target отказа. Произвольное исключение/потерянный ответ не разрешают
очистку uncertainty. Journal acknowledgement failure сохраняет прежнюю неопределённость.

Новые runtime tests: read-only Prepared workflow changed → NOT_APPLIED, cleanup=true,
node=null, только source; тот же ID не повторяет граф. Потерянный mutation response →
AMBIGUOUS, cleanup=false, без node_phase_refused. Node apply/runtime52 PASS;
node target/runtime23 PASS. Всего75 focused tests PASS; source preflight и diff check PASS.
Текущий pin `dc7e07700a6db598da95d42cd760c6d2f635c15061b533e1191bea082e6388aa`.
Evidence `.dock/text-import-v3/target-refusal-source-preflight-20260908-1648.json`.
Новый pin пока не проходил live; старый remote failure не переписан.

Следующий шаг остаётся обязательным: explicit journalled активация исходной
prepared вкладки перед target. Нельзя добавлять скрытый click в adapter.observe:
observe используется и read-only reconciliation. Проверять original document,
receipt/tab/package/navigation identity до и после перехода; собственный receipt
навигации должен сохранять неопределённость при потере ответа и не повторять click
при inspect. Полезные точки: node-target-browser.mjs createNodeTargetBrowserAdapter,
node-target.mjs prepareNodeTarget/inspectNodeTarget, executor.mjs prepareTarget wrapper;
workspace.mjs existing_workflow показывает проверенный tab-click путь. Затем live
remote sales rehearsal intermediate→final, full auditor/negatives и Hermes Sol/low.

Memory healthy. Новых browser/model jobs не было, предыдущий handle81373 terminal.
Production/candidate/installed client не менялись, общий client suite не запускался.

---

# Подплан 03 — real bridge выявил возврат из Files, 8 сентября 2026, 16:44 МСК

Текущий goal turn дал новое живое evidence, изменяющее следующий шаг. Подплан03
открыт. Outer auditor предыдущего turn подключён, но live rehearsal не принят.

Добавлен `tools/loginom-acceptance/remote-node-rehearsal.mjs`: отдельный настоящий
client/bin/loginom-dock.mjs → remote candidate → браузер, операторские JSON-запросы,
реальные call/reply и execution journal, без модели/Hermes. Изолированные Dock
state/profile, существующий browser cache; private-config читается по пути без
публикации key. После проверки source-кода harness исправлен canonical PTY limit:
raw stdin и явный {"operator":"close"}. Это исправление не меняет client runtime.

Live evidence: `.dock/text-import-v3/remote-sales-20260908-163900-a83b04de`.
Process handle81373 / PID29160 завершён EOF/exit0; bridge/browser закрыты.
Session7bd23a32-3d18-4f3c-87cd-4b2bdf76346c, document1788874760255-vy6znglk9p.
Настоящий candidate SHA936ef…44, оба save revision2, Loginom7.4.2.
Подтверждены отдельный новый пустой сценарий TF-1 и expanded viewport2044×1035,
outer2044×1122 при available2048×1122. Account user, storage/user/dock-p3.

Delivery deliver-sales завершена SUCCEEDED/completed/cleanup=true:
230 bytes, SHA f628434c20873f7dd9a8ee142c17af7c0b99f447114fcf60e983f6ed6b357eb3,
original upload deliver-sales:upload, verify deliver-sales:verify,
`/user/dock-p3/Dock-upload-20260908-163900-a83b04de.csv`.
Import-sales был отправлен в MCP ровно один раз, вернул running, wait settled.
Результат AMBIGUOUS/target/cleanup=false, error Prepared workflow changed.
Источник verified, node=null, execution not_requested. Inspect сохранил pending.
Read-only workspace observe подтвердил активную Files вкладку TF-2, тогда как
request.workflow_ref указывает исходный граф TF-1. В node-target-browser.mjs:17
readGraph требует именно активный original tab. В target journal нет ни одного
internal record/effect; source — единственная принятая фаза. Source inspection
показывает, что ошибка возникла при read-only graph read до операций с узлами.
`failure-diagnosis.json` сохраняет этот вывод, не меняя исходный AMBIGUOUS outcome.

До фактической отправки node.apply диагностический PTY обрезал длинную строку;
журнал calls тогда содержал только prepare/describe/observe/delivery. Очистка
буфера и отключение canonical mode в том же подтверждённом ttys011 позволили
передать JSON целиком. Это не повтор node.apply и не повтор upload.

Следующий обязательный шаг: Codex исправляет проверяемое возвращение/активацию
исходного prepared workflow перед target после delivery, сохраняя document,
package/native tab/navigation identity и журнал жеста. Не лечить отказ повторным
upload или новым неподтверждённым import ID в старой сессии. Также исправить
классификацию известного отказа read-only target preflight: общий node phase
слишком рано объявляет effect_possible=true/cleanup=false. Нельзя обнулить
неопределённость для произвольного target failure после возможного жеста.
Сверить реальные UI/E2E/Help; затем focused tests и новый isolated live rehearsal,
independent full auditor/negatives и только после этого Hermes Sol/low.

Syntax check harness и diff check PASS. Новых client tests не запускалось:
client runtime не редактировался. Production/candidate/installed client прежние.
Memory healthy. Все handles этого turn terminal; ничего автоматически не ждёт.

---

# Подплан 03 — общий аудитор сценария подключён, 8 сентября 2026, 16:36 МСК

Текущий goal turn дал прогресс: `node_apply_acceptance.py` объединяет подготовленные
проверки. `audit.py audit_directory` маршрутизирует node-apply-complete в новый
аудитор; run.py фиксирует именно его как критерий сценария. Подплан03 открыт.

Общие gates: original goal/prompt/fixture, Sol/low без fallback, authguard,
model usage completed=true/failed=false/api_calls>0 плюс terminal exit, source/
harness/native skill unchanged, утверждённый manifest node-apply.1 SHA936ef…44,
начальная owned draft preparation, единая Dock session и journal pins, точный
seed workflow, tool/knowledge scope, две node declarations, public node/save/
delivery bindings, byte/fresh-output proof и persistence composition.
После seed checkpoint проверяется отсутствие дополнительных prepared operations.
Directory mode независимо пересчитывает текущий runtime pin и все объявленные
harness hashes, требует inventory всех .py/.mjs, goal и CSV. Успешный verdict
этого auditor явно не означает завершения всего Подплана03.

Исправлено излишне строгое сравнение mapping в sales goal: явное excluded=false
и значения API по умолчанию для неизменённых имён/меток семантически допустимы.
Порядок, source→output identity, Price/Цена и autosync=false остаются обязательными.
50 focused tests PASS, включая model terminal/auth отказ, malformed evidence и
эквивалентные mapping defaults; diff check PASS. Runtime client не менялся.

Аудитор ещё НЕ считается прошедшим полный положительный live replay: составные
части проверены отдельно, outer full-chain пока без реального полного evidence.
Нужны: Codex live rehearsal sales.csv пяти полей с intermediate→final через
настоящий remote bridge/candidate revision2; привязка реальных prepare/pins и
проверка всех event shapes. Проверить frozen harness и actual browser geometry.
После положительного operator rehearsal — негативные изменения полного evidence
и проверка достаточности outer gates, затем Hermes Sol/low. Не представлять
operator caller/детерминированный сценарий как автономную модельную приёмку.
Проверить полноту usage отчёта (сейчас runner сохраняет provider/model/api_calls/
completed/failed); токены/эффективность остаются отдельной частью сверки плана.

Production, installed client, candidate и личная auth connection не изменялись.
Memory healthy. Новых browser/model/process jobs нет; прежние handles terminal.

---

# Подплан 03 — public receipts и delivery core, 8 сентября 2026, 16:30 МСК

Текущий и предыдущий goal turns дали реализационный прогресс. Подплан03 открыт.
Memory healthy; новых live browser/model jobs не запускалось.

Добавлен `node_public_acceptance_evidence.py`: одна caller identity, точные пары
call/reply, node.apply requests→node_apply_prepared→completed, running/settled
attempt1, same-ID wait/status и save requests/replies→журнал. Немедленный settled
не требует лишнего wait; одинаковый повтор apply/save допускается только с прежними
request/outcome и единственными journal receipts. Recovery/attempt2 требует отдельной
phase-proof и не принимается straight-through компонентом автоматически.

Public delivery связывает prepared artifact/grant, destination/SHA/bytes и original
upload ID с delivery request, completed journal и ответом, полученным до node.apply.
Эти части ещё нужно подключить к outer auditor и полному effect accounting:
они не заменяют проверку всех неподдержанных tools/вмешательств/фоновых эффектов.

`artifact_delivery_evidence.py`: выделен `verify_delivered_import_output` для
обычной доставки без требования специального повторного вызова. Прежний
`verify_integrated_delivery` по-прежнему требует replay evidence. Новый core
переаудировал реальный исторический operator run execute-1788872268313: PASS;
legacy replay PASS, отсутствующий legacy replay отклонён, четыре подмены
SHA/bytes/path/completion отклонены. Это проверка старого journal pin5b48…c1a53,
не новая live-приёмка текущего source. Evidence:
`.dock/text-import-v3/delivery-core-reaudit-20260908-1629.json`.

41 focused tests PASS, включая 5 новых public tests с 14 подменами node/save
и 5 подменами delivery; diff check PASS. Client/runtime source не менялся.

Далее собрать outer auditor: initial actual prepare и полный tool/effect allowlist,
source/skill/harness/manifest pins и save revisions, goal/prompt/fixture, authguard/
effective openai-codex gpt-5.6-sol low/terminal result, usage. Подключить public
receipts, delivery core, sales persistence composition, затем проверить живую
цепочку intermediate→final на remote candidate revision2. Hermes только после
этого. Старый audit.py всё ещё не принимает node-apply-complete. Не ослаблять
общий scope03 до одного успешного sales-прогона: lifecycle/mapping границы и
остальные требования канонического плана остаются обязательными.

---

# Подплан 03 — экспорт новых tools и real reopen binding, 8 сентября 2026, 16:24 МСК

Предыдущий goal turn дал прогресс; текущий исправил найденный дефект evidence
export и добавил следующую часть независимого auditor. Memory health healthy.
Подплан03 не завершён; новые browser/model jobs не запускались.

`evidence.py` раньше пропускал direct replies девяти новых node/delivery tools.
Добавлен отдельный NODE_TOOLS набор для экспорта (legacy audit allowlist не расширен).
SQLite tests проверяют все девять tools, direct/routed вызовы, running/settled/error
ответы, call identity и отсутствие assistant prose. Это реальные тесты экспортера
на синтетической БД, не evidence автономной работы Hermes.

`node_apply_reopen_binding.py` связывает реальный workspace_prepared event с
парой dock_prepare call/reply, exact open_package path, session/runtime, новым
workflow и последующим node.apply. Synthetic saved_package_prepared из operator
harness не принимается. semantic unchanged_patch допускает повтор любых исходных
настроек, но отклоняет изменения, дублирующиеся или посторонние поля.
`node_apply_persistence_evidence.py` соединяет sales goal, two-save chain,
real preparation и существующий native settings/mapping/fresh-output audit.
Он явно не подтверждает Hermes/provenance/public-effect accounting.

36 focused tests PASS: предыдущие19 плюс reopen4, node history2 и прежние
history/verification11. diff check PASS. Новый composition ещё не проверен полным
живым evidence. Runtime source не менялся после pin841e54de…95e8f5; acceptance
harness изменился и должен получить новый hash inventory перед запуском.

Далее: полный outer auditor должен проверить исходный goal/prompt/fixture,
manifest и save revisions, runtime/skill/harness pins, initial preparation,
artifact delivery/bytes, все public node/delivery/save call/reply и journal IDs,
отсутствие посторонних/неразрешённых effects между accepted node и reexecute,
caller identity, authguard/effective Sol-low/terminal status и usage.
Не объявлять новый composition самостоятельной полной приёмкой. Не запускать
Hermes до готовности auditor и Codex live rehearsal intermediate→final на
настоящем candidate revision2. Старый audit.py новой цели пока не поддерживает.

---

# Подплан 03 — проверки полной цели и двух сохранений, 8 сентября 2026, 16:19 МСК

Подплан03 остаётся открытым. Последний ответ о времени checkpoint не был
реализационным прогрессом; после возобновления добавлены две независимые части
будущего полного auditor, проверены исходники и состояние памяти (healthy).

Goal-only `tools/loginom-acceptance/goals/node-apply-complete.txt` и run.py теперь
задают полный импорт sales.csv: пять полей, mapping UnitPrice→Price/Цена первым,
все шесть строк, промежуточный пакет, final save/reopen и повторное выполнение.
Native Hermes skill описывает полные node/delivery tools и границы persistence.
Эти изменения уже находились в worktree при текущей сверке.

Добавлены `node_apply_goal_contract.py` и `node_apply_save_chain.py` с отдельными
тестами. Первый сверяет запрос с исходным бизнес-заданием, а не с параметрами,
выбранными моделью: SHA/230 bytes, source/format/types, пять полей, порядок mapping,
точное чтение всех шести строк. Второй сверяет две разные операции сохранения,
их порядок, revision из переданного контракта, draft→intermediate→final identity,
граф, тот же открытый workflow для intermediate и final close/reopen trace.
Они явно НЕ подтверждают runtime, сохранность настроек или Hermes acceptance.

Проверки: 19 tests PASS (8 новых, 7 существующих saved-import и 4 preflight);
negative cases включают 15 неверных бизнес-запросов, потерю/дублирование/перестановку
квитанций и 12 подмен path/graph/revision/runtime/cleanup/reopen/conflict. diff check PASS.
Source preflight PASS, 252 packaged files, build_inputs_match_commit=false.
Текущий source pin после изменения native skill:
`841e54de3e896f922303dbe340449c0ecaa04e75486206363f43100d4695e8f5`.
Evidence: `.dock/text-import-v3/goal-contract-source-preflight-20260908-1618.json`.
Этот новый pin ещё не прошёл live-приёмку; прежний live PASS относится к pin5b48…c1a53.

Следующий обязательный участок: связать новые проверки с actual bridge events,
public call/reply identity, проверенным manifest/revisions и исходным prompt;
добавить fresh prepare после final save, semantic no-op и existing-output audit,
глобальные provenance/auth/model/terminal gates. Проверка двух save receipts сама
по себе не запрещает все промежуточные посторонние effects: это обязанность полного
аудитора. Не адаптировать journal путём выдуманных saved_package_prepared событий.
Проверить живую цепочку intermediate→final через candidate revision2 до Hermes.
Существующий audit.py ещё не принимает новую цель; запуск модели пока преждевременен.
Candidate/production/installed client не менялись; новых browser/model/process jobs нет.

---

# Подплан 03 — output contract и VPS candidate, 8 сентября 2026, 16:06 МСК

Предыдущий goal turn дал прогресс; текущий также изменил исходники, прошёл live
проверку и подготовил настоящий remote candidate. Подплан03 не завершён.

## Контракт и исправления

client/lib/node-result-schema.mjs задаёт выходные схемы MCP для node job и delivery:
running/settled, stop/cancel, progress, полный node result, schema/rows/sample,
precision/Null и частичные эффекты. node-contracts.d.ts согласован с текущими
результатами, включая FAILED/cancelled, configuration, cleanup и локальный checkpoint.
package_saved/persisted_package_verified узла не могут быть true. Для request rejection
bridge возвращает MCP isError с прежней recovery-информацией, а не неверный job snapshot.

При отказе записи итоговой квитанции node.apply больше не теряет принятый узел,
фазы и execution identity: сохраняет их с EVIDENCE_WRITE_FAILED. Inspect может
доставить сохранённый node checkpoint без повторной настройки. Ранний отказ до
node_apply_prepared также возвращает полную структуру с нулевыми эффектами.

Обнаружена и исправлена устаревшая Python preflight.runtime_pin: теперь независимо
считает все lib .mjs/.d.ts плюс explicit inputs, включая новые вложенные модули;
проверяет symlinks и literal list. Фактический createSession и Python digest совпали.

## Диагностика отказа upload и ограниченное обновление наблюдения

`.dock/text-import-v3/execute-1788871931579`, pinffd6afce…21aa, handle69418
завершён EOF/exit1. Original upload deliver-source:upload был **resolved NOT_APPLIED**,
UPLOAD_CONTEXT_CHANGED, effect_possible=false, cleanup=true. Это отказ ДО выбора
файла, не потерянная отправка; original-upload-inspect.json и no-upload-effect-audit
подтвердили отсутствие submission, full runtime audit PASS. Исходный transfer не
повторялся. Первоначальная delivery ошибочно показывала AMBIGUOUS.

Теперь candidate upload делает не более двух precondition refresh до единственного
setInputFiles, только при прежнем document/workflow/exact directory, auth/build/guards.
Trace фиксирует NOT_APPLIED/effect_possible=false и before/after epoch. Смена
документа/каталога, исчерпание двух обновлений или возможная отправка не разрешают
повтор. Legacy upload остаётся строгим. Delivery сохраняет подтверждённый отказ
NOT_APPLIED/cleanup=true, не начинает download и не разрешает resume как отправленного
файла. Неизвестная cleanup остаётся AMBIGUOUS. Границы подтверждены focused tests;
в последнем успешном live refresh не потребовался — не объявлять его forced-refresh PASS.

## Принятый live public результат

`.dock/text-import-v3/execute-1788872268313`, handle82197 завершён exit0.
Полный pin `5b48f9d876587b4cd33e622b5f57751d42aa6cbed4312c89ecf5d2b0eeec1a53`,80 files.
Public MCP с выходными схемами → delivery → mapped import → fresh3×3 → final save/
reopen → unchanged existing patch → новое3×3 output. Executions
`1788872270800-5b790rjo98k:500:1` и `1788872270800-5b790rjo98k:500:3`.
Пакет `/user/dock-p3/Dock03-package-1788872313903.lgp`.
Independent source/delivery/saved/public audits PASS; delivery8 negatives rejected;
public15 calls. Это operator wire, не автономная Hermes приёмка.

Client **919 PASS / 1 SKIP**, `.dock/text-import-v3/result-schema-refresh-client-tests.txt`,
handle7728 exit0; Python import113 PASS, preflight4 и provenance3 PASS, diff check PASS.
26 ранее сохранённых public replies отдельно прошли schema compatibility — это
проверка формы, не новая live-приёмка старых pins.

## Настоящий bridge и серверный candidate

Старый node-import.1-candidate не содержал package.save_checkpoint. После проверки
live VPS новый каталог **собран на VPS**, staged и прочитан обратно, activated=false:
`viking://resources/loginom-dock/catalogs/executor-preview/releases/2026.09.08-node-apply.1-candidate/manifest.json`
SHA `936ef73d933e85bfd8429b8b0f2b515c543ca415a2b22ba57e108232c54ddf44`.
VPS release `/opt/loginom-dock/releases/20260908-catalog-node-apply1-5b48f9d8`.
Оба сохранения имеют revision **2**, allowed_roots `/user/dock-p3`; Loginom7.4.2.

Реальный MCP bridge проверен с этим exact manifest: typed node/delivery tools и
обе persistence actions доступны. Evidence в
`.dock/text-import-v3/bridge-precheck-result-schema/candidate-verified.json` и
`describe-node-apply1.json`; MCP config-node-apply1.json указывает на изолированную
private-config.json с целевым стендом. Она содержит credentials: не печатать и не
включать в публикацию. Native skill/модель/браузер эта проверка не запускала.
Первый precheck отказал из-за0755 тестового state directory; исправлены только
права созданных здесь state/runtime. После этого connection/list/describe PASS.

## Следующий шаг без повторения завершённых runs

Подготовить goal-only сценарий полного импорта и независимый final auditor через
настоящий bridge на новом кандидате; затем автономный Hermes existing subscription
openai-codex/gpt-5.6-sol/low. run.py/preflight теперь понимает текущий source pin,
но существующая цель node-import-roundtrip относится к старому пилоту и НЕ подходит.
Нужна отдельная цель с complete node.apply/delivery, fresh output, intermediate save,
final save/reopen/reexecute и проверкой сохранённых настроек/mapping/bytes.
Старые saved_import_evidence hardcode action_revision1/new unsaved draft: для нового
candidate revision2 и цепочки intermediate→final нужно явно связать expected revision
с проверенным manifest и доработать audit, не ослабляя прежние проверки.
Сверить native Hermes skill с новыми tools; не запускать модель до готовности auditor.
Полный scope/неподдержанные mapping modes и lifecycle gates остаются предметом
итоговой сверки, а operator PASS не заменяет полный Hermes gate.

Production pointer, серверные контейнеры, installed client и коммиты не менялись.
Все новые handles этого участка terminal; исторические handles проверять отдельно.

---

# Подплан 03 — public wire и persistence приняты, 8 сентября 2026, 15:44 МСК

Текущий goal turn дал проверяемый прогресс: два реальных полных импорта с
public MCP requests и независимые audits. Подплан03 ещё не завершён.

## Принятый source/runtime

Полный pin `56996d5effef78a8d1c9189c25c082268cb277d75eea34440f9e39b81e7ffc05`;
независимо сверены79 файлов в обоих runs. Client runtime в этом участке не менялся;
последний полный client suite911 PASS/1 SKIP относится к этим исходникам.
Новый tools/loginom-acceptance/public-node-wire.mjs использует MCP Client/Server,
JSON input/output и тот же dispatchNodeApi, что bridge.mjs. --public-api подключает
его к реальному браузеру из node-import-done-live.mjs. Node wait возвращает тот же
worker, исходный apply/replay не повторяет effects. Save также проходит MCP.

Граница доказательства: это operator MCP wire с local public dispatcher и runtime.
Настоящее подключение remote bridge/catalog и самостоятельность Hermes этот harness
НЕ доказывает. Bridge registration/schema проверены отдельно protocol suite.

## Полная финализация

`.dock/text-import-v3/execute-1788870945688`, handle74096 завершён exit0:
public delivery → mapped import → fresh3×3 → package.save_as → exact reopen →
existing no-op patch → отдельное новое execution/output. Исходный execution
`1788870947996-b5kw85ce5hk:489:1`, после reopen `1788870947996-b5kw85ce5hk:489:3`.
Пакет `/user/dock-p3/Dock03-package-1788870990641.lgp`.

Independent delivery PASS/8 negatives; saved import PASS/10 negatives; public wire
PASS/8 negatives. Public15 calls, две node operations. Проверены сохранность
настроек, mapped имён/меток/порядка и исходных связей, bytes/SHA и все9 значений,
точный пакет/граф, fresh execution. Replay delivery/node/save не вызывал browser.

## Возврат из другого каталога и промежуточное сохранение

`.dock/text-import-v3/execute-1788871257106`, handle43147 завершён exit0:
operator fixture по E2E filestorage.CreateFolderInCurrent создал и открыл
`/user/dock-p3/Dock03-start-1788871262103`. Наблюдённые native toolbar/prompt и
точный breadcrumb сохранены в browser replies / delivery-start-directory.json.
Доставка сама сделала один bound root click, дождалась `/`, открыла user/dock-p3,
один раз загрузила и побайтно проверила файл. Затем public mapped import,
package.save_checkpoint без закрытия, отдельный QA close/reopen и public existing
no-op patch/reexecute с сохранённым mapping и новым3×3 output.
Executions `1788871259379-bt8t18tmhxf:841:1` и `1788871259379-bt8t18tmhxf:841:3`.
Пакет `/user/dock-p3/Dock03-package-1788871301619.lgp`.

Independent delivery PASS/8 negatives; intermediate persistence PASS/18 negatives;
public wire PASS/15 calls; root return PASS/5 negatives. Root audit проверяет
наблюдённый исходный child, привязанный к Files root click, отдельное наблюдение `/`
и точный destination до upload. Test child сохранён как fixture, удаления не было.

## Evidence и следующий участок

В обоих каталогах: public-api.jsonl, public-tools.json, request/result/reopened-*,
save-request/result, execution-events.jsonl, independent-runtime-source-audit.json,
independent-delivery-audit.json, independent-saved-audit.json и independent-public-audit.json.
Дополнительные negative audits лежат рядом. Новый public_node_evidence.py связывает
requests, worker snapshots/replays, delivery и save с независимым journal evidence;
он явно не заявляет проверку remote bridge или Hermes.
Python import suite113 PASS (`public-node-wire-python-tests.txt`), diff check PASS.

Следом сверить оставшийся scope с разделом «Проверки и критерий готовности»:
актуальность полного публичного контракта результата (node-contracts.d.ts пока
содержит ранний сокращённый NodeApplyResult), admission/неподдержанные mapping modes,
остаточные lifecycle/deadline gates, затем подготовить и выполнить goal-only
автономную Hermes приёмку через настоящий Dock bridge с независимым полным audit.
Использовать existing subscription openai-codex/gpt-5.6-sol/low. Не подменять этот
финальный gate двумя успешными operator runs. Production/release/коммиты не менялись.
Unresolved transfer из checkpoint15:21 не повторялся. Новых активных browser/Hermes
runs после двух terminal PASS не осталось на этом участке; старые handles из истории
не считать живыми без проверки.

---

# Подплан 03 — candidate MCP API, 8 сентября 2026, 15:33 МСК

Подплан03 остаётся в работе. Предыдущий ответ только уточнил время checkpoint;
текущий участок изменил исходники и подключил операции к публичному MCP bridge.

В executor-replay зарегистрирован imports.text handler и девять candidate tools:
`dock_node_apply`, `dock_node_resume`, `dock_node_status`, `dock_node_wait`,
`dock_node_cancel`, `dock_node_stop`, `dock_artifact_deliver`,
`dock_artifact_delivery_status`, `dock_artifact_delivery_resume`.
Машинные входные схемы и dispatcher находятся в client/lib/node-api.mjs.
Новый импорт требует полных настроек; existing принимает patch. Проверка схемы
дополняется исходным handler validator до UI effects. Node apply/resume возвращает
background snapshot; wait timeout не завершает worker и не создаёт повтор.
Delivery сохраняет исходные grant/transfer/resume ID и прежние phase guarantees.

Bridge требует prepared workspace. Start/delivery используют browser gate;
локальные status/wait/cancel/stop доступны независимо от ожидающего browser request.
Runtime facade запрещает внешнее observe/inspect/UI во время background node job,
сохраняет status/wait/cancel/stop и проверенный replay исходного start. Конкурирующий
start отклоняется до регистрации новой job. Отмена не освобождает gate до cleanup.
requestFailure остаётся доступным для передачи отказа вызывающему агенту.

Описание capabilities перечисляет candidate tools. Карточка imports.text явно
показывает candidate_node_apply_available и pending autonomous acceptance;
full_node_apply_available остаётся false. Другие семь handlers не регистрировались.
Обычный executor-preview этих candidate tools не получает.

Проверки: client **911 PASS / 1 SKIP**, exit0, handle27605 завершён.
Evidence: `.dock/text-import-v3/public-node-api-client-tests.txt`.
Проверены public schema + installed handler на complete new import / existing patch,
некорректные/отменённые запросы без dispatch, lifecycle/delivery ID, MCP registration,
capability cards, отказы до browser calls и фоновая взаимная блокировка.
`git diff --check` PASS. Это source/protocol проверки, не живой public acceptance.

Новый public путь ещё НЕ проверен на реальном Loginom; исторический live pin
f34ec440…6b24 относится к прежним исходникам. Требуется новый полный source pin
в следующем live run. Далее: live public node/delivery, delivery из другой Files
ветви, полный save/close/reopen, оставшиеся lifecycle/deadline требования и
независимая автономная Hermes приёмка openai-codex/gpt-5.6-sol/low.
Production/release/коммиты не менялись. Не повторять unresolved transfer из
предыдущего checkpoint; новых browser/Hermes runs на этом участке не запускали.

---

# Подплан 03 — явный resume и потеря документа, 8 сентября 2026, 15:21 МСК

Текущая контрольная точка; Подплан03 ещё не завершён. Предыдущий goal turn
дал реальный прогресс (lost replies и полный source pin). Этот участок добавил
фазовое возобновление доставки и проверил отказ после утраты UI документа.

## Новый private контракт

`resumeArtifactDelivery({operation_id,resume_id,budget_ms})` возобновляет только
известную delivery job в том же runtime. Исходные artifact/grant/upload ID,
факт начала verification и browser document/tab/workflow binding сохраняются.
Параметры grant сверяются с первоначальным снимком. Resume ID имеет собственный
кэш Promise/результата и проверку неизменности параметров. Runtime не допускает
возобновление при другой pending/running операции; общий delivery gate удерживается
до окончания resume. Исходный deliver ID возвращает свой прежний результат,
а resume ID — результат возобновления; status показывает текущее состояние job.

Resume сначала inspect-ит исходный upload и пишет resume_started/resume_inspected.
Если transfer уже resolved с exact bytes/SHA/destination/cleanup, завершается
по этому доказательству. Если upload подтверждён, а verification ещё не начиналась,
проверяет прежний document/tab/workflow и запускает её ровно один раз. Уже начатый
неразрешённый download НЕ повторяется. При отсутствии/чужом receipt, изменённом
контексте/артефакте или утрате исходной runtime job новое действие не допускается.
Отмена проверяется после upload receipt и перед финальным inspect; partial effects
сохраняются. Resume до upload не реализован: сначала требуется сверка навигации.
Восстановление job из журнала после перезапуска процесса этим API не вводилось.

## Принятые живые границы

Полный runtime pin `f34ec440017aff2f2da4e1cf4bdcc39348c1e948e0ad925675f07ab2a9b86b24`;
в новых audits независимо сверены78 файлов.

- `.dock/text-import-v3/execute-1788869725278`: AbortController после upload receipt,
  сохранён AMBIGUOUS исходного deliver; явный resume → inspect того же upload →
  единственный download/verify → import/mapping → новое Execute/output3×3.
  Execution `1788869727665-4t5mhucwtf6:483:1`. Independent delivery audit PASS,
  12 negatives rejected, runtime inventory audit PASS.
- `.dock/text-import-v3/execute-1788869799702`: пауза после verification_completed.
  Resume подтвердил уже resolved transfer без нового upload/download, затем
  import/mapping → Execute/output3×3. Execution `1788869802590-33qvx79scqs:485:1`.
  Independent delivery audit PASS, 12 negatives rejected, runtime inventory PASS.

В обоих прогонах replay исходного deliver и отдельного resume ID не вызвал
browser operations. Evidence: delivery-initial-result/replay, delivery-resume-request,
delivery-pause-checkpoint, delivery-result/replay, execution-events и independent
аудиты в соответствующем каталоге. Пакеты этих fixtures не сохранялись/reopened;
автономная Hermes приёмка не выполнялась.

## Утрата исходного UI документа — принятый отказ

`.dock/text-import-v3/done-1788869898408`: после той же паузы upload исходная
вкладка действительно закрыта. Начальная проверка diagnostic сравнила два разных
вида document ID (prepare context против workspace-ui epoch) и отказала ДО закрытия.
После адресного чтения актуального workspace-ui epoch operator продолжил ТОТ ЖЕ
прогон: исходный upload не повторялся, новая delivery не создавалась.

`delivery-browser-loss.json` подтвердил закрытие документа
`1788869902358-27udmtpu6xm`. Последующее browser125 наблюдение — origin=null,
authenticated=false, другой document `1788869984635-tn7lvh55r4s`. Resume оставил
AMBIGUOUS/inspection_required и не запустил download, навигацию или import.
Кэшированный replay resume: browser calls125→125.
`artifact_delivery_loss_evidence.py` / `independent-loss-audit.json` PASS,
6 negatives rejected; runtime source audit PASS. Это проверка отказа при потере
вкладки/документа, НЕ восстановление браузерного процесса или успешная передача.

Исходный `/user/dock-p3/Dock03-done-1788869902318.csv`, upload
`deliver-source:upload` остался без byte verification. Не отправлять его повторно
под новым ID и не объявлять resolved по одному пути. Diagnostic handle79090
завершён EOF после сохранения evidence; exit1 относится к первоначальной
preflight ошибке harness. Независимый audit отказа выполнен отдельно и PASS.
Harness исправлен для будущего изолированного browser-loss fixture; исправление
не переименовывает этот ручной diagnostic в успешный полный acceptance run.

## Проверки и следующий участок

Delivery suite22 PASS; полный client **907 PASS / 1 SKIP**
(`delivery-resume-client-tests.txt`), Python import113 PASS
(`delivery-resume-python-tests.txt`), git diff --check PASS.
Handles76729/59406 и test26402 завершены exit0;79090 завершён exit1 описанным выше
образом. Старые profiles/handles из истории не считать живыми без проверки.

Следом public node.apply/delivery contracts и registration, полный путь delivery
из другой ветви Files, полный save/close/reopen, оставшиеся lifecycle/deadline
проверки и независимая автономная Hermes приёмка openai-codex/gpt-5.6-sol/low.
Restart/session reconstruction оценивать отдельно от безопасного отказа при
утрате несохранённого документа; журнал не доказывает сохранение пакета.
Production, release и коммиты не менялись.

---

# Подплан 03 — lost replies и полный source pin, 8 сентября 2026, 15:10 МСК

Текущая контрольная точка. Подплан03 остаётся in progress.
Предыдущий goal turn дал изменения и живые evidence по reject/replace.
На этом участке реализовано автоматическое восстановление ответов доставки
через исходные browser receipts и исправлен неполный runtime source pin.

## Существенное уточнение прежних pins

Старый ручной список в session.mjs не включал artifact-delivery,
artifact-discovery, artifact-upload-conflict, node-import-continuation,
node-mapping-context, node-operation-runner, port-mapping-procedure и agent-command.
Поэтому упоминания «fixed-pin» в исторических записях ниже не доказывают полную
привязку этих модулей к исходникам. Старые live результаты сохраняются как
поведенческие evidence; утверждение полной фиксации source для них отозвано.
В частности, diagnostic `execute-1788869080117` успешно прошёл controlled loss,
но ещё использовал неполный старый pin f970f196…544c; он не принят как full pin.

`runtime-pin.mjs` теперь автоматически включает все .mjs и .d.ts в client/lib,
включая вложенные каталоги, плюс прежние явные внешние inputs (CLI, lockfiles,
plugins/skills). Пути сортируются и дедуплицируются, source symlinks отвергаются.
Session хранит clientSourceManifest с per-file SHA и общий clientRevision.
`runtime_source_evidence.py` независимо проверяет полноту текущего lib inventory,
каждый файл и общий hash. Проверены добавление/изменение/вложенный модуль;
негативные проверки отвергают пропущенный module, изменённый SHA/revision и дубль.

## Реализация восстановления

Если private upload вернул BROWSER_CALL_UNCERTAIN, coordinator вызывает inspect
для ТОГО ЖЕ upload ID. Продолжение возможно только с исходной квитанцией,
совпадающим operation ID и подтверждённым cleanup; результат записывается как
artifact_delivery_upload_reconciled. Полученная квитанция может подтвердить
submission или terminal rejection; ни upload, ни выбор конфликта не повторяются.

После BROWSER_CALL_UNCERTAIN от download coordinator также вызывает inspect
исходного upload. Runtime читает прежний download receipt и проверяет уже
сохранённую копию тем же lease/verification ID; повторного download нет.
Успех требует resolved transfer, exact destination/bytes/SHA и cleanup, после
чего записывается artifact_delivery_verification_reconciled. Отсутствующий,
чужой или ещё running receipt не разрешает продолжение.

Это восстановление завершённых browser calls с потерянным транспортным ответом.
Явный resume после исчерпания бюджета/отсутствующей квитанции, потеря браузерной
сессии или незавершённого native transfer этим участком НЕ приняты.

## Принятые прогоны на полном текущем pin

`c631c031099f8df977f7aacd81fe9de7d290af8fce642ee7da7fb8d3ed8dd2b0`.
Независимо сверены все **78 source files** в каждом новом прогоне.

- `.dock/text-import-v3/execute-1788869178263`: реальные upload и download
  завершились в браузере; operator harness намеренно потерял оба ответа ПОСЛЕ
  сохранения browser receipt. Оригинальные upload/verification ID восстановлены
  через inspect, затем mapping → новый Execute/output3×3 завершены.
  Execution `1788869180669-9fxkqjxv99a:477:1`.
  `lost-artifact.upload.json` / `lost-artifact.download.json` фиксируют controlled
  injection; это не реальное падение браузера. Independent delivery audit PASS,
  **12 negatives rejected**, включая ложный transport code, чужой recovery ID,
  pending verification и отсутствие recovered receipt. Runtime inventory audit
  PASS и **4 negatives rejected**. Replay delivery/node ID не вызвал browser calls.
- `.dock/text-import-v3/done-1788869311492`: reject повторно проверен на полном
  pin; исходные bytes сохранены, original upload terminal FAILED/resolved,
  independent post-decision download подтверждает исходный SHA. Audit PASS,
  10 negatives rejected и runtime source audit PASS.
- `.dock/text-import-v3/done-1788869368492`: replace повторно проверен на полном
  pin; новые35 bytes подтверждены product verifier и отдельным operator download.
  Audit PASS, 10 negatives rejected и runtime source audit PASS.

Evidence `independent-delivery-audit.json`, `independent-delivery-negatives.json`,
`independent-conflict-{audit,negatives}.json`, `independent-runtime-source-audit.json`
лежат в соответствующих run directories. Исходники после pin checks не менялись.
Package persistence и Hermes этими прогонами не доказываются.

Full client **900 PASS / 1 SKIP** (`recovery-pin-client-tests.txt`), Python import
verifiers **113 PASS** (`recovery-import-python-tests.txt`), git diff --check PASS.
Handles73455/94127/35597/43875 и test78759 завершились exit0; новая ожидающая
операция не оставлена. Старые диагностические handles из истории проверять перед
использованием; их долговременную живость из файлов не выводить.

## Следующее продолжение

Завершить фазовое resume/потерю сессии, full-pin delivery из чужой ветви Files,
публичный node.apply/delivery contract и registration, полный согласованный
save/close/reopen, затем независимую автономную приёмку Hermes
openai-codex/gpt-5.6-sol/low. Проверять все требования03 по плану; текущие15 delivery
unit tests и live lost-reply путь не заменяют полный lifecycle/long/deadline scope.
Production, release и коммиты не менялись.

---

# Подплан 03 — конфликты доставки приняты, 8 сентября 2026, 15:01 МСК

Текущая контрольная точка; более ранние ограничения ниже являются историческими.
Предыдущий участок дал реальный прогресс: independent delivery/import audit и
исправление ссылки корня Files. На этом участке реализована и принята private
обработка reject/replace в объединённой доставке. Подплан03 НЕ завершён.

## Реализация и наблюдённый контракт Loginom

Live FileStorageForm / FileSenderManager.UploadFile проверяет существование
пути и до создания FileUploader показывает «Конфликт файлов с одинаковыми
именами». «Пропустить» — `msgbox;tlb;no`, «Заменить» — `msgbox;tlb;yes`.
Результат «Для всех» хранится в FLastConflictResult; он не должен наследоваться
новой одиночной доставкой. Скрытый input очищается после завершения native
UploadFileList. Native CurrentDirectory имеет завершающий `/`.
E2E `bg/helpers/filestorage.ts:318` подтверждает штатный file input. Native методы
только читались для диагностики; RPC и прямой вызов FileSenderManager не вводились.

Новый `artifact-upload-conflict.mjs` выполняет один адресный выбор: проверяет
origin/build/document, FileStorageForm/sender/input, точный каталог, имя и размер
выбранного файла, отсутствие активных transfers и cached conflict choice,
единственный видимый диалог с точным путём, unchecked «Для всех», принадлежащую
диалогу кнопку и видимую точку. Retained handle не заменяется после чтения.
После клика ждёт закрытия диалога, очистки input и idle sender; неизвестный
клик/settlement остаётся AMBIGUOUS с неподтверждённым cleanup, без повторения.

Private runtime.uploadDeliveredArtifact использует прежний upload receipt,
lease и immutable artifact grant. Перед выбором файла проверяет idle sender,
затем внутри того же browser call ждёт native input settlement или конфликт.
Режим reject возвращает FAILED / UPLOAD_PATH_CONFLICT, conflict_rejected=true,
без byte verifier и дальнейшего импорта. Lease освобождается после подтверждённой
квитанции, в том числе при восстановлении её через inspect. Replace продолжает
прежние inspect → download/SHA/size → inspect; одно закрытие диалога не является
подтверждением передачи. Legacy public dock_artifact_upload сохранил прежнюю
replace-only семантику и schema; новые режимы относятся к private delivery.

## Независимо проверенные живые прогоны

Общий fixed runtime:
`f970f19680c4184800be2d87c8b353e4c684619a41ddc952fa743a3614d4544c`.

- `.dock/text-import-v3/execute-1788868571590`: обычная доставка → imports.text
  с mapping → новое execution `1788868574101-65zqk2lgx78:469:1` → свежая таблица3×3.
  `independent-delivery-audit.json` PASS, 8 negatives rejected.
- `.dock/text-import-v3/done-1788868695742`: seed64 bytes, затем новый разрешённый
  кандидат35 bytes с тем же именем и overwrite=reject. Один «Пропустить»;
  original `deliver-conflict:upload` terminal resolved/FAILED. Повтор delivery ID
  без browser calls. Отдельное operator download после отказа подтвердило прежние
  64 bytes / SHA `98e7948fe81ddc0bf6911cf7235a521b90d79db239e25468e2f80a74a09f4a2f`.
- `.dock/text-import-v3/done-1788868735576`: аналогичный seed и overwrite=replace.
  Один «Заменить», новый кандидат35 bytes передан и проверен прежним product
  download verifier. Дополнительный независимый operator download подтвердил
  35 bytes / SHA `2293c73de3fd087e3133796e58019f7276883decce4e851e212add1f10da49c6`.

`artifact_conflict_evidence.py::verify_delivery_conflict` проверяет fixed pin/session,
точные артефакты и исходные bytes, один upload/choice, связь grant/path/policy,
terminal inspect, отсутствие повторного действия и скачанные после конфликта
server bytes. В обоих conflict runs independent audit PASS и 10 negatives rejected:
pin, server bytes, policy, destination, replay, duplicate submit/decision, wrong
button, cleanup и pending. Evidence `independent-conflict-{audit,negatives}.json`.
Ни один из этих audits не объявляет journal authentication, package persistence
или Hermes acceptance. Conflict harness не запускает imports.text после отказа.

Полный client **895 PASS / 1 SKIP** (`conflict-client-tests.txt`), focused36 PASS
(`conflict-focused-tests.txt`), Python compile и git diff --check PASS.
Handles30286/81857/32194/74358/67378 завершились exit0. Прогоны закончены,
их браузерные MCP clients закрыты; неизвестные операции не перезапускались.

## Состояние прежних diagnostics и продолжение

Diagnostic50160 проверен живым. Operator duplicate-input diagnostic показал
конфликт исходного `Dock03-done-1788866372457.csv`; ожидание неверного root tid
`msgbox` истекло, поэтому была прочитана уже существующая `.x-window`, без
повторного выбора файла. `delivery-conflict-reject.json` затем подтвердил один
адресный «Пропустить» и cleanup. Эта ручная диагностика НЕ является повтором
или изменением resolved `delivery-debug-5:upload`. Сейчас Files в /user/dock-p3,
нет ожидающего решения этого диалога. Исходный debug5 transfer остаётся resolved.
Старый `execute-1788867307628` с host reference mismatch не объявлен resolved;
его download/upload не повторять.

Следом: phase recovery объединённой доставки при lost receipts/browser loss,
полный fixed-pin путь из чужой ветви Files, публичные contracts/registration,
согласованный полный save/close/reopen и финальная независимая автономная
приёмка Hermes openai-codex/gpt-5.6-sol/low. Long/deadline/cancel и остальные
обязательства общего lifecycle оценивать по полному плану, не только по этим
проверкам доставки. Production, release и коммиты не менялись.

---

# Подплан 03 — доступ к корню Files исправлен, 8 сентября 2026

В `workspace-ui.mjs` добавлена выдача точной ссылки «Файлы» как click-only
control: уникальные breadcrumb и navigation panel текущей вкладки, видимость,
принадлежность panel, точная метка, доступная точка и стандартные action guards.
Чужая/дублированная/скрытая/вынесенная из панели ссылка не выдаётся. Основание:
живой DOM и E2E `bg/helpers/filestorage.ts:261`.

Live diagnostic50160 подтверждён живым. `delivery-navigation-inspect.json`
зафиксировал native anchor без role. `delivery-root-live.json` подтвердил
выдачу click, `delivery-root-click.json` — один жест с cleanup, затем отдельное
чтение `delivery-root-after.json` подтвердило каталог `/` и отсутствие маски.
Все evidence в `.dock/text-import-v3/execute-1788866367565`.
Это operator diagnostic текущего сериализованного workspace reader; runtime
старого процесса не обновлялся. Integrated acceptance нового pin из чужой ветви
пока НЕ выполнен. Diagnostic50160 теперь в корне Files, а не в /user/dock-p3.

Полный client877 PASS/1 SKIP (`storage-root-client-tests.txt`) после source-правки.
Добавленная затем проверка coordinator перехода из другой ветви прошла вместе
с artifact-delivery suite10 PASS. Полный повтор после test-only добавления не
требовался. Integrated PASS предыдущего pin сохранён ниже; он не доказывает
новый navigation branch. Следом fixed-pin integrated branch acceptance,
reject conflict/recovery, public contracts и полная Hermes приёмка подплана03.

---

# Подплан 03 — объединённая доставка и импорт приняты независимо, 8 сентября 2026

Fixed-pin live `.dock/text-import-v3/execute-1788867498730` завершился exit0;
runtime `b35140e09b86ee130e46a909c29995b50edbdc1edc7972a335f942eab283b960`.
Private coordinator выполнил delivery → import configure/mapping → один новый
Execute → свежий output3×3. Source `/user/dock-p3/Dock03-done-1788867503155.csv`,
64 bytes, SHA256 `98e7948fe81ddc0bf6911cf7235a521b90d79db239e25468e2f80a74a09f4a2f`.
Original upload `deliver-source:upload` resolved; verification `deliver-source:verify`.
Повтор delivery и node operation ID не вызвал новых browser operations.

`artifact-discovery.mjs` внутри прежнего artifact.download находит точную строку
в buffered listing: ограниченный scroll, проверка document/tab/workflow/directory,
владения grid и доступной точки. После обнаружения использует существующий
browserArtifactDownload, его receipt/lease/cleanup и host SHA/size verifier.
Неизвестный scroll/download reply остаётся AMBIGUOUS, не повторяется.
Новая file_ref принимается только через discovery trace, привязанный к исходному
подготовленному document/tab/workflow и разрешённому имени/каталогу.
Public verifyArtifact schema не расширялась; discovery доступен private coordinator.

Independent `artifact_delivery_evidence.py::verify_integrated_delivery` проверил
journal pin, один upload/download, точную source identity и server bytes,
порядок фаз delivery, discovery binding/scroll bounds, cleanup, отсутствие
повторного browser effect, новое выполнение и реальные выходные значения.
`independent-delivery-audit.json` PASS; `independent-delivery-negatives.json`:
8 подмен отклонены (pin, replay, digest, destination, missing discovery,
foreign ref, duplicate download, overscroll). Полный client876 PASS/1 SKIP
(`discovery-bound-client-tests.txt`); focused discovery/delivery17 PASS.
Пакет этого integrated прогона НЕ сохранён/reopened; Hermes не запускался.

## Уточнение прежних diagnostics

- `execute-1788866367565`: original `delivery-debug-5:upload` теперь resolved.
  `delivery-finish-original.json` доказывает operator reveal → verification
  `original-delivery-verify` → final inspect с bytes_verified и
  upload_completion_verified. Исходный файл не отправлялся повторно.
  Это отдельная ручная диагностика старого процесса, не fixed-pin acceptance.
- `execute-1788867307628`: старый pin `dc11553a…c6e` получил успешный raw download,
  но host отклонил динамически найденную file_ref, поскольку ожидал её до поиска.
  Этот старый transfer не объявлен resolved; повторный download/upload запрещён.
  Исправление проверено отдельным новым файлом в принятом прогоне выше.
- Handle30741 (новый принятый прогон) и test handle70168 завершены exit0.
  Состояние старых диагностических процессов при следующем использовании нужно
  проверить; наличие файлов не доказывает, что браузеры остаются живыми.

## Следующий участок

Подплан03 остаётся in progress. Реализовать/принять переход к разрешённому
каталогу из другой ветви Files, reject conflict policy и фазовое recovery delivery;
не повторять неизвестные upload/download. Затем публичные contracts/registration,
полный согласованный цикл сохранения/повторного открытия и независимая автономная
приёмка Hermes openai-codex/gpt-5.6-sol/low. Исторические отдельные проверки не
заменяют эти обязательства. Production/release/коммиты не менялись.

---

# Подплан 03 — delivery coordinator создан, live reveal ещё не готов, 8 сентября 2026

Добавлен private `artifact-delivery.mjs` и runtime.deliverArtifact(request) /
artifactDeliveryStatus(id). Запрос содержит только operation_id/artifact_id/
upload_grant_id/budget_ms. Разрешение, destination/bytes/SHA/replace берутся из
существующего artifactStore. Координатор использует runtime.observe/uiAct для
перехода в Files/подкаталоги, затем существующие upload → inspect → verifyArtifact
→ inspect. Никакой собственной загрузки, RPC или второго importer нет.
Повтор ID возвращает тот же Promise/результат; changed parameters отвергаются.
Исходные upload IDs остаются доступны для inspect после сбоя. Координатор не
повторяет неизвестную отправку/download. Финальный успех требует resolved upload,
cleanup и exact destination/size/SHA server_copy_verification.

Runtime facade блокирует конкурирующие UI/action/preparation calls на всё время
delivery; status доступен без браузера. Внутренние transfer stages используют
исходный runtime. Read pagination допускает только один retained observation;
изменённые страницы перечитываются до3 раз без жестов. FileStorage loading
ожидается по file_storage+mask predicates, без фиксированной post-action паузы.
Если текущий каталог уже предок разрешённого, спуск начинается из него.
Reject overwrite пока явно отвергается до навигации; upward navigation из чужой
ветви ещё не принято (Files breadcrumb не выдаётся общим observer как action).
Нужны bounded reveal, recovery и final independent acceptance перед public release.

Source tests9 PASS: exact navigation, upload/verify once, same ID, wrong digest,
unknown upload/download, journal failure, reject policy, concurrent jobs, page
identity и runtime facade gate. Full client868 PASS/1 SKIP
(`delivery-current-client-tests.txt`), git diff --check PASS.
Harness получил opt-in --integrated-delivery; остальной старый uploadSource путь
сохранён. В integrated mode request source ссылается на child upload ID delivery.

Live diagnostic `.dock/text-import-v3/execute-1788866367565`, handle **50160**
жив и ждёт stdin. Startup pin `9b1d9da842e750d559f4cdcfeb0a2be5868a2b40c24fc3d333394ee68788c11d`.
Initial deliver-source остановился до навигации: Files button находился на следующей
странице наблюдения. Исправление пагинации проверялось через cache-busted module
в operator script `.dock/text-import-v3/delivery-debug.js`; это НЕ fixed-pin
приёмка полного coordinator/facade. Последующие diagnostics исправили loading
и спуск из текущего родительского каталога. Не перепутать с production acceptance.

**Текущий незавершённый transfer:** original upload ID `delivery-debug-5:upload`.
Файл `Dock03-done-1788866372457.csv`, destination
`/user/dock-p3/Dock03-done-1788866372457.csv`; точные bytes/SHA/grant в `artifact.json`.
Upload submission и cleanup подтверждены, но byte verification НЕ выполнена.
Координатор завершился AMBIGUOUS на phase verify; повторно файл не отправлялся.
Причина: строка за пределами rendered listing window. `delivery-list-state.json`
подтвердил grid `MF;TF-2;FileStorageForm;pnlFileStorage;tbl`: top0, height906,
scrollHeight3576, target_count0. Среди последних rendered entries лишь старые
Dock03 файлы. Main Files workspace открыт в /user/dock-p3; pending original upload
должен быть сохранён до проверки, а не сброшен новым ID/новой отправкой.

ctx runtime/prep/session доступны в50160; node.apply ещё не начат, package не
сохранён. `delivery-debug-5.json` хранит incomplete result; journal содержит
исходный upload. Более ранние debug1–4 не отправляли файл; debug3 успел перейти
в /user и остановился на invalidated read pagination. Смена ID в этих diagnostics
не повторяла неизвестную отправку. Current debug script ID5 повторно не запускать.

Следующий конкретный шаг: bounded storage row reveal внутри прежнего upload/
verification ownership, с durable receipt и сохранением неизвестного эффекта;
нельзя использовать public generic UI repair как готовый продуктовый путь при
pending upload. Direct operator UI diagnosis допустим для проверки UI, но не
заменяет fixed-pin acceptance. Завершить byte verification исходного upload без
повторной отправки; затем новый fixed-pin integrated delivery → import/output
и independent audit. Позже upward navigation/reject conflict policy, recovery,
public contracts и Hermes Sol/low для полного03. Production/release не менялись.

---

# Подплан 03 — длительное ожидание исправлено и принято, 8 сентября 2026

Устранена преждевременная остановка waitCompleted после одного 15-second read
window. `NodeReadinessTimeout` отделяет bounded readiness timeout от transport
failure; timeout записывается в журнал. Execution driver продолжает наблюдать
тот же root/group до общего channel deadline/step budget или stop signal.
Transport errors, смена root/group и terminal failure не повторяются как timeout.
Completed проверяется до stop signal, сохраняя уже принятую семантику гонки.

Fixed-pin live diagnostic `.dock/text-import-v3/process-stop-1788865826349`, runtime
`002cfe04e67d47f7dd9abbe6197426e006c75332e0366a1093db2b4625bb609c`.
JS fixture конечный60s, вне release node-type inventory. Prepared document
`1788865828869-00dq2hd3pho7k`, node `96387aea-c6c2-481b-9786-d81241b497a5`.
Execution `1788865828869-00dq2hd3pho7k:142:1`, group143/child144.
Journal зафиксировал timeout step19 через15002ms, затем новое окно наблюдения
того же running group. Диагностический запрос остановки через25s прервал wait
через25212ms; один typed Cancel, те же group/child terminal cancelled, console
закрыта. Повтор stop не добавил шагов (28→28). `long-wait-stop-live.json`,
`long-wait-result.json`, `driver-launch.json`, `execution-events.jsonl`.

Independent `verify_long_execution_stop` подтвердил runtime/session/journal,
неизменный running group до и после timeout, terminal cancellation, cleanup,
один Cancel и отсутствие replay. PASS/9 negatives:
`independent-long-wait-audit.json`, `independent-long-wait-negatives.json`.
Local runner `.dock/text-import-v3/audit-long-wait-stop.py`.
Full client859 PASS/1 SKIP (`long-wait-client-tests.txt`), focused49 PASS;
Python compile и git diff --check PASS. Handle99583 ждёт stdin с terminal cancelled
и несохранённым package. Это generic execution-driver acceptance, не полный
runtime stopNodeApply на длительном imports.text.

Также выполнен новый реальный typed import450000 rows (даты/boolean),
`.dock/text-import-v3/execute-1788865649321`, прежний pin65c670d2…5d5b.
Execution `1788865651580-h7bhel9tm1r:461:1` уже completed к stop request;
свежий typed output и completed race приняты independent audit/7 negatives.
Handle2021 exit0, browser закрыт, audit88029 exit0. Повторять этот быстрый fixture
как доказательство running cancellation не следует. Sample/rowcount проверены
аудитором по полным source bytes; package persistence этим не доказывается.

Остальной03: общий stop/recovery по другим границам, unknown receipts/browser
loss, integrated file delivery с прежними upload/verify гарантиями, public
registration/contracts, финальная независимая Hermes Sol/low приёмка всего импорта.
Следующий самостоятельный участок — объединённая доставка файла. Уже изучены
runtime.upload/inspect/verifyArtifact и текущий live uploadSource harness; он
пока требует внешней навигации/наблюдений. Новая delivery операция ещё не создана.
Production/release без изменений; goal03 остаётся активным.

---

# Подплан 03 — runtime stop wiring и completed race, 8 сентября 2026

Private runtime `stopNodeApply(id)` добавлен к async lifecycle. Запрос допускается
только для running worker с pending execute и уже известным execution ID.
Отдельный stopSignal не отменяет обычный local signal и не запускает браузер
из вызывающего status/control потока. WaitExecution читает процесс; если он уже
completed, обычная проверка ownership/output продолжается. Если ещё выполняется,
после завершившегося browser read readiness прерывается stopSignal, import driver
сохраняет `node_server_stop_requested` в журнал и вызывает адресный driver.stop()
под прежним gate. Unknown transport не разрешает переход к новому жесту.

При подтверждённом cancelled applyNode сохраняет FAILED/NODE_EXECUTION_CANCELLED,
configuration=applied, node/execution identity, output=not_refreshed,
checkpoint_kind=local_node_stopped, package_saved=false. Только durable checkpoint
и cleanup разрешают освободить gate. Повторный start/resume cancelled job возвращает
его старый результат. Unknown stop остаётся AMBIGUOUS с pending execute, блокируя
новые действия. Локальный cancelNodeApply по-прежнему не означает server stop.
Пока нет универсального stop до/после всех фаз: stopNodeApply требует active execute;
прочие границы и recovery остаются явной незавершённой работой.

Source runtime tests: cancellation держит gate до cleanup, retains partial phases,
не читает выход, не повторяет stop/start, отказывает до execution identity,
сохраняет unknown stop. Full client857 PASS/1 SKIP (`runtime-stop-client-tests.txt`).

Fixed-pin live import `.dock/text-import-v3/execute-1788865424381`, runtime
`65c670d288d36044040bee24b2ce128963c52f45b7a09a9eabe198e02bc25d5b`.
Запущен harness --async-node --request-server-stop --execute --read-output
--mapped-output. Stop был запрошен из завершившегося browser observation при
pending execute, без concurrent browser call (`server-stop-request.json`).
Процесс уже completed; Cancel не отправлен, original execution
`1788865426821-qe5zngoqr4:459:1` дал свежий output3×3. Статус сохранил
server_stop_requested=true, cancel_requested=false. Worker и browser завершены,
handle87662 exit0. Пакет не сохранялся.
Independent audit `completed_execution_won_stop_race` PASS/7 negatives, evidence:
`independent-stop-race-audit.json`, `independent-stop-race-negatives.json`.
Verifier расширен опциональным completed_stop_request, обычный async audit
по-прежнему отвергает незапрошенный server_stop flag. Этот live run НЕ доказывает
cancelled длительного imports.text; такой исход пока доказан source runtime tests
и отдельным fixed-pin JS execution-driver audit, а не целиком import lifecycle.

Следующий шаг: проверить runtime stop на реально running import либо дополняющем
явно помеченном lifecycle diagnostic, без подмены import acceptance. Затем общий
stop/recovery по остальным границам, unknown receipts и browser loss, integrated
file delivery, public contract/registration и финальный Hermes Sol/low audit03.
Scope03 не сокращён и goal не завершён. Production/release без изменений.

---

# Подплан 03 — execution driver stop принят, 8 сентября 2026

Private `createNodeExecutionProcedure.stop()` работает через общий node-procedure
channel: exact identified group → one running child → адресное меню → native
owner proof → typed cancel → same group/child terminal cancelled → close console.
Expected proof формируется по process inventory, но разрешение на отмену даёт
только совпавший native menu proof. Повторный вызов возвращает тот же Promise:
успех, unknown receipt или ошибка terminal wait не повторяют Cancel.
`verifyCancelledExecution` не выдаёт свежий выход и не принимает completed как
cancelled. Source tests покрывают foreign owner, unknown receipt, replaced
terminal record, completed race и повторный вызов.

Fixed-pin live run `.dock/text-import-v3/process-stop-1788865003876`, runtime
`40184250f2f51b6fb44a48bb10c359979bc70c11c2ca209e42c0243e7afd9faf`.
Prepared document `1788865006494-oqtfu18q6ji`; JS diagnostic node
`d82b2904-94cc-435d-b2bf-8a93f0f986c6`. Execution
`1788865006494-oqtfu18q6ji:142:1`, group143/child144, one Cancel.
`driver-launch.json` содержит baseline/running; `execution-events.jsonl`
содержит fsynced preparation/completion/terminal/cleanup observations;
`stop-driver-live.json` — cancelled и replay с неизменным steps30→30.
Часть подготовительных/cleanup жестов встретила UI_EPOCH_CHANGED до эффекта;
штатный channel сохранил pre-gesture receipts и обновил refs. Сам Cancel один.

Independent `verify_journalled_process_stop` в `process_stop_evidence.py`
подтвердил runtime/session/operation, original execution, offered typed reference,
журнал до и после Cancel, terminal status, cleanup и отсутствие новых replay steps.
PASS, 7 negatives rejected: runtime/replay/duplicate/missing receipt/missing
terminal/foreign owner/unsafe retry. Evidence:
`independent-stop-driver-audit.json`, `independent-stop-driver-negatives.json`.
Local audit runner `.dock/text-import-v3/audit-stop-driver.py`.
Полный client854 PASS/1 SKIP (`stop-driver-client-tests.txt`), focused32 PASS.

Следующий участок — общий stop lifecycle в runtime и imports.text. Нельзя
просто abort локального signal выдавать за server stop или освобождать gate до
окончания браузерного действия. Требуется сохранить accepted phases/execution,
не повторять unknown Execute, выполнять stop через тот же журнал и подтвердить
partial state. Пока public stop не добавлен, cancelNodeApply остаётся только
локальной отменой. Далее long/unknown recovery, integrated delivery/public
contract и финальная Hermes Sol/low приёмка полного03.

Diagnostic handle3739 сейчас ждёт stdin после terminal cancelled; console закрыта,
package не сохранён. Старый64929 также содержит только отменённые процессы.
Production/release не менялись; весь03 остаётся in progress.

---

# Подплан 03 — typed cancel_process принят на живом процессе, 8 сентября 2026

Private UI primitive `cancel_process` добавлен. Меню выдаёт только этот verb для
одного выбранного native child, связанного через `ModelNode === graphNode.data`
с prepared node. Проверяются shared TreeStore, root/record/process/node identity,
бounded inventory, running/not_responding и CanCancelProcess. Связь включена в
signature и повторно сверяется перед кликом. Generic click/press на Cancel,
header/cancel-all и небезопасная подмена node не допускаются.

Live evidence: `.dock/text-import-v3/process-stop-1788863665780`.
Новый execution `1788863667979-qk793g3tfro:142:2`, group145/child146.
`stop-typed-live.json` содержит baseline и running; первая отдельная act была
NOT_APPLIED/UI_EPOCH_CHANGED/effect_possible=false, без клика. Она НЕ означала
завершения процесса. `stop-after-typed-refusal.json` подтвердил всё ещё running.
`stop-typed-current.json`: свежие observe+act в одном browser call, один typed
cancel gesture, SUCCEEDED/cleanup_complete. `stop-typed-terminal.json` подтвердил
cancelled/terminal/noncancellable у той же group2/child2.1 (145/146).
Никакого повторного Execute между отказом и успешной отменой.

Independent `process_stop_evidence.py` принял эту цепочку; 9 негативных подмен
(root/node/record/status/repeat/generic/local-cancel/cleanup/prior-running)
отвергнуты. Результаты: `independent-typed-stop-audit.json` и
`independent-typed-stop-negatives.json`; local runner `audit-typed-stop.py`.
10 новых focused browser-capability tests PASS, полный client849 PASS/1 SKIP
(`cancel-process-client-tests.txt`); git diff --check PASS.
Workspace UI SHA256 `50be85829b1a56bc0e0bad2248dc61b0ab5dfa7260fcea008b7de088576b1b0d`.
Harness session был запущен на старом runtime: новая primitive импортирована
с cache-busting и сериализована отдельно. Это приёмка primitive, не fixed-pin
полного product handler. JavaScript остаётся конечным diagnostic fixture.

Следующий шаг: включить адресную отмену в execution driver и общий stop lifecycle
через обычные gate/journal receipts, проверить тем же независимым аудитором на
новом fixed-pin запуске. Затем imports.text integration, long/unknown recovery,
file delivery/public contract и финальный Hermes Sol/low audit всего03.
Handle64929 доступен и ждёт stdin; предыдущий запуск terminal cancelled,
консоль открыта, пакет не сохранён. Production/release не менялись.

---

# Подплан 03 — живое running → cancelled, 8 сентября 2026

**Diagnostic evidence, не готовый product stop.** Создан отдельный несохранённый
JavaScript-узел в свежем подготовленном workspace: конечный скрипт
`const stopAt = Date.now() + 60000; while (Date.now() < stopAt) {}`.
E2E `tests/toreview/acceptance/wizards/javascript/js_general.ts` подтверждает
выполнение JS без входных/выходных данных; это только diagnostic fixture,
не JavaScript handler и не расширение release scope03.

Живой session: `.dock/text-import-v3/process-stop-1788863665780`, handle **64929**.
Runtime e5c5f7b3…ec37d04. Prepared doc `1788863667979-qk793g3tfro`, workflow с
суффиксом `-1`, JS GUID `42b740a4-924d-4cb0-925a-a0c7da1c1aaf`.
Один запуск F9 после проверки выбранного native node; execution
`1788863667979-qk793g3tfro:142:1`, root142/group1 record143/child1.1 record144.
Child реально наблюдался running/can_cancel=true. Затем одна адресная команда
`mnContextMenu;mniCancel` для selected record144, после проверки root/id/record/
CanCancelProcess. Та же запись стала `ptpsExplicitCanceled`, can_cancel=false.
Финальный native reader подтвердил cancelled/terminal=true для group и child;
оба error=true (это не успешное выполнение и не свежий выход).

Evidence в run-dir: `stop-running-menu.json`, `stop-cancel-selected.json`,
`stop-final-status.json`, `stop-owner-pointer.json`. Последний read-only probe
подтвердил для child строгую ссылочную идентичность cached
`record.data.ModelNode === graphNode.data`; для группы ModelNode отсутствует.
Прокси не разыменовывались и RPC Cancel напрямую не вызывался. Этот UI cache
pointer полезен для будущего pre-gesture ownership guard. Caption не заменяет
привязку. Group cancel-all/header никогда не использовался.

Подготовка воспроизводится стартовым harness
`tools/loginom-acceptance/node-process-stop-live.mjs --loginom-url ... --loginom-user user`
с tty. Он проверяет maximized/viewport:null и ждёт stdin scripts.
Локальные operator scripts в `.dock/text-import-v3/`: `stop-add-js.js`,
`stop-js-open.js` (теперь Setting), `stop-js-next.js` (input → columns → code;
после code → Done), `stop-js-code.js`, `stop-js-done.js` (сохраняет node settings
без Execute и создаёт ctx.binding), `stop-js-launch-inspect.js`,
`stop-running-menu.js`, `stop-cancel-selected.js`, `stop-final-status.js`.
Current ctx.binding/ctx.execution/ctx.stopChild сохранены; ctx.channel deadline
истёк. Для нового целевого теста создать свежий channel/operation/baseline,
не представлять его продолжением неизвестного запуска. Предыдущий процесс
подтверждён terminal cancelled, поэтому новый acceptance run возможен отдельно.

Ошибки operator setup до запуска сохранены в browser logs: dblclick center
перекрыт NodesControls, Launch/Vertex после Done отсутствуют, label selection
не выбирает native node. Исправленный запуск: click самого Graph;JavaScript в
точке x8/y8, проверка ровно одного FCell/FGuid, затем F9 (E2E hotkeys). Последний
launch был успешен; ошибка отсутствующего ready predicate возникла ПОСЛЕ identify,
поэтому запуск не повторяли, продолжили наблюдение/отмену оригинального child.
Новая версия скрипта содержит ready:()=>true. Initial wrapper с неверной сигнатурой
также исправлен: withBrowserReceipt('('+code+')(page)', exact receipt options).

Следующий конкретный шаг: добавить private typed `cancel_process` к bound process
menu observation/action. Выдавать только для exact selected native child,
CanCancelProcess=true и ModelNode===prepared graph node data, сохраняя root/id/
record/node в signature; повторно проверять до жеста. Никакого generic cancel-all.
После одного клика отдельно сверять cancelled/terminal/noncancellable на той же
записи. Потом driver/runtime stop с сохранением partial execution и независимый
audit на новом конечном JS fixture; отдельно интеграция в imports.text и остальные
long/recovery/unknown/delivery/public/Hermes требования03.

64929 сейчас ждёт ввода, консоль открыта на отменённом процессе, package не
сохранён. Production/release не менялись. Client остаётся839 PASS/1 SKIP с прошлого
изменения runtime; в этом участке изменён только operator harness и документация.

---

# Подплан 03 — background cancel/resume, 8 сентября 2026

**In progress, source only.** Два live fixed-pin runs на f3857da3…f9b62:
- `execute-1788863096409`: background cancel после configure → settled partial →
  inspect без браузера → явный background resume attempt2 → Execute/output3×3.
- `execute-1788863198629`: background cancel после finish/Execute → inspect →
  checked resume attempt2 → чтение того же execution/output3×3 без нового Execute.
Оба independent audits PASS, по 7 negatives. Evidence: `async-cancel.json`,
`async*-start/probes/final.json`, `independent-async-cancel-audit.json`,
`independent-async-cancel-negatives.json` в соответствующих run-dir.
Скрипт `.dock/text-import-v3/audit-async-cancel-resume.py`; predicate
`verify_background_cancel_resume` в `import_continuation_evidence.py`.
Процессы92310 и95094 завершились exit0, приёмочные браузеры закрыты.
Пакеты не сохранялись. Server stop этим не доказан.

Добавлен `progress_state` к native process reader. Штатные ProgressBarCls и
CanCancelProcess различают not_started/running/not_responding/completed/cancelled/
failed/parent_cancelled/parent_failed. Числовые enum ordinals кроме ранее
проверенного completed=3 не угадываются. Неизвестный/неполный/противоречивый статус
возвращает verified=false, не выдавая can_cancel. Legacy state сохранён для
существующих completion verifiers. Live completed/can_cancel=false подтверждён
`execute-1788862441282/process-state-read.json`; остальные новые состояния пока
проверены focused fixtures, не live acceptance.
Источник: E2E `bg/sels/sProgressForm.ts` и статический UI source
`http://logi-test-plan.bg.local/app/bg/progress/ProgressForm.js`, локальная
диагностическая копия `.dock/text-import-v3/ProgressForm.js`. DoActionStop/DoCancelProcess
(391–407) отменяют точную запись; header stop (155–169) относится ко всем процессам
и не должен использоваться для адресной отмены. Никаких RPC Cancel напрямую
не вызывалось, серверная остановка ещё не реализована.

Client **839 PASS / 1 SKIP** (`process-state-client-tests.txt`); process reader20
PASS; `git diff --check` PASS. Начат live async большой CSV (2500000 rows,
15000015 bytes) `execute-1788863414273`, runtime
`e5c5f7b3e3b1fdfa139c132ec0189ef366088414a1332212e050c21e9ec37d04`,
handle92701 завершился exit0, браузер закрыт. Independent async audit PASS:
2500000 rows, sample10, один execution `1788863416300-jofsov2pdq8:457:1`, 7 negatives.
`independent-async-audit.json` и `independent-async-negatives.json` в run-dir.
В process observations были только completed: running НЕ наблюдался, server stop
и long execution НЕ приняты. Следующий fixture должен позволить наблюдать running;
не повторять тот же большой CSV как доказательство длительного исполнения.
Harness flag `--large-import-rows` ограничен 100000..2500000 строками.
Цель большого fixture — наблюсти действительно running server process;
сам размер файла не доказывает долгое выполнение. Затем exact process stop,
long/recovery/unknown receipts, integrated delivery/public/Hermes и полный03.

---

# Подплан 03 — фоновый node lifecycle, 8 сентября 2026

**In progress, source only.** Private runtime получил `startNodeApply`,
`nodeApplyStatus`, `waitNodeApply`, `cancelNodeApply` через
`node-operation-runner.mjs`. Start немедленно возвращает operation ID и attempt;
повтор с теми же parameters/handler revision не создаёт второго worker. Status
читает только accepted phases/pending phase/node/execution из текущей памяти
runtime. Wait ограничен 0..60000ms; timeout или отмена только ожидания не отменяют
worker. Caller получает state=running/settled отдельно от бизнес-исхода outcome.

Cancel отправляет AbortSignal локальному handler, но сохраняет браузерный gate
до ответа/cleanup текущего действия. Ответ явно содержит
`server_stop_requested:false`: остановка процесса Loginom здесь НЕ реализована.
После settled partial результата требуется явный проверенный resume; попытка
resume ещё работающего ID возвращает ту же попытку. Ошибка worker сохраняется,
не становится success и не вызывает silent restart. Методы пока host-only,
публичные MCP tools не зарегистрированы; restart runtime/journal restoration
этим in-memory lifecycle не поддержаны.

Live `execute-1788862938977` на runtime
`f3857da32fa7eedd2199e91bd7e7f7aedfcc1ab433571d6e49dac2838acf9b62`:
start + повтор start → status/wait → один Execute → output3×3, independent
PASS. Execution `1788862941193-upbu49ih65:451:1`; семь evidence mutations
отвергнуты. Файлы в run-dir: `async-start.json`, `async-probes.json`,
`async-final.json`, `independent-async-audit.json`, `independent-async-negatives.json`.
Скрипт `.dock/text-import-v3/audit-async-node.py`, predicate
`verify_async_import_run` в `import_continuation_evidence.py`.
Harness: `--async-node` с обычным new import; старые pause fixtures отдельно.
Процесс20148 завершился exit0, приёмочный браузер закрыт. Сохранение пакета,
действительно долгое серверное выполнение и server stop не проверены этим run.

Client **837 PASS / 1 SKIP** (`async-node-client-tests.txt`), runtime11 PASS,
independent audit PASS/7 negatives, `git diff --check` PASS. Live diagnostic48247
подтверждён живым read-only `finish-status-recheck.json`: тот же completed process,
active output; UI revision изменился с19089 на19090 за паузу. Strict finish guard
такое изменение не допускает; это дополнительная причина отдельно завершить
reconciliation. Несохранённый diagnostic пакет не запускался повторно.

Следом: live background cancellation/resume; bounded server process stop и
long status/wait; неизвестные finish/execute/read receipts и UI reconciliation;
integrated delivery, public contracts/registration, финальная независимая
Hermes Sol/low приёмка полного03. Production/release/коммиты не менялись.

---

# Подплан 03 — продолжение после Execute, 8 сентября 2026

**In progress, source only.** Fixed-pin `execute-1788862614126` на runtime
`124a02ff14f78c17ffc36e4a71a06b28c696743d56876834929ef12a5ef1899c` прошёл
independent audit: finish/Execute принят → pause → inspect без браузера →
read-only continuity check → wait/Show Node ownership → output3×3.
Сохранён один execution ID `1788862616557-8z8f2bv7s3t:449:1`, повторного Execute
нет. Восемь negative evidence mutations отвергнуты. Run5859 завершился exit0,
приёмочный браузер закрыт, package persistence и Hermes этим не проверены.
Evidence в run-dir: `independent-finished-resume-audit.json`,
`independent-finished-resume-negatives.json`, `paused-result.json`,
`paused-inspect.json`, `result.json`. Скрипт `audit-finished-resume.py` находится
в `.dock/text-import-v3/`; независимый predicate — `import_continuation_evidence.py`.

Finish receipt теперь содержит continuity surface: UI document/revision,
prepared graph node, native process inventory и выходной порт. Resume допускается
только если snapshot полностью совпал, группа completed без error, порт active,
все document/workflow/node/root/group/record/port identities сохранены.
Нельзя считать GUID или старый журнал доказательством восстановленного черновика.
DOM revision guard намеренно строгий: любое учтённое изменение интерфейса требует
отдельного reconciliation; running→completed через паузу этим путём ещё не принят.
Ожидание и Show Node по-прежнему независимо подтверждают принадлежность child узлу.

Live diagnostic `execute-1788862441282`, handle48247 подтверждён живым и ждёт
stdin: мастер завершён, Execute уже был, процесс completed, консоль открыта.
`finish-native-inspect.json`, `finish-surface-inspect.json` и
`finish-surface-recheck.json` подтвердили стабильность read-only UI epoch и
native contexts. Пакет не сохранён, original deadline истёк; не выполнять узел
повторно ради восстановления. Предыдущий `execute-1788862393275` завершился exit1
после безопасной паузы из-за закрытого stdin; повтором его не считать.
Новый harness флаг `--pause-after-finish` используется вместе с
`--pause-after-configure --diagnose`; диагностика требует tty, чтобы stdin оставался
открытым. Приёмка дополнительно использует `--resume-after-configure`.

Полный client **834 PASS / 1 SKIP** (`finish-resume-client-tests.txt`), focused
continuation5 PASS, independent audit PASS/8 negatives, `git diff --check` PASS.
Следом: live negative при изменении графа после finish, finish/execute/read
reconciliation при изменении UI и неизвестном receipt, long status/wait/stop,
integrated delivery, public contracts/registration и финальная Hermes Sol/low
приёмка всего03. Ничего не коммитилось, не публиковалось и не развёртывалось.

---

# Подплан 03 — отказ при изменённой метке Done, 8 сентября 2026

**In progress, source only.** Run `execute-1788862257772` на runtime
`936f2e071e59f4fb1d3d092f5cf1a3dcdb9f2865b0e0dcbca5b929deadfee3ba`
прошёл independent audit: accepted output_mapping → pause → оператор меняет
completion label через реальный input/Tab → explicit resume отвергнут без
mapping/Execute. Принятые phases/node сохранены. Пять подмен evidence отвергнуты.
Evidence в run-dir: `independent-completion-refusal-audit.json`,
`independent-completion-refusal-negatives.json`, `paused-ui-mutation.json`.
Процесс30372 завершился exit0; приёмочный браузер закрыт. Пакет не сохранялся.

Перед этим `execute-1788861844924` остановился ДО node.apply при проверке
upload: `UI_REFERENCE_OBSCURED`, download gesture не выполнен. Наблюдение строки
файла содержало point y1032 при центре y1040.5 за viewport1035. Исправлен
workspace-ui: storage_entry, как output_column, использует свежую observed point
с обязательным hit-test перед жестом. Тест проверяет частично видимую строку и
повторное перекрытие без клика. Новый run выше прошёл upload verification.
Старый upload не повторялся и не объявлялся подтверждённым; diagnostic64354
подтверждён живым, ждёт stdin, исходный файл может оставаться на сервере.
У старого ctx нет runtime/request (ошибка произошла до их выдачи в diagnostic).

Полный client **833 PASS / 1 SKIP** (`file-point-client-tests-final.txt`),
independent refusal PASS/5 negatives, `git diff --check` PASS. Предыдущие
small/wide mapped-resume audits на f1960cea… подтверждены, wide66/132 PASS,
по восемь negatives. Полный03 ещё не завершён: finish/execution continuation,
unknown receipts reconciliation, long execution/status/wait/stop, integrated
artifact delivery, public registration/contracts и финальная независимая
Hermes Sol/low приёмка. Production/release/коммиты не выполнялись.

---

# Подплан 03 — mapped continuation, 8 сентября 2026

**In progress, source only.** Run `execute-1788861466213` на runtime
`f1960ceac1a5d017aee7eb0ac780fa10930a21e26a8453676d5e9b2c83d6052e` прошёл
independent mapped pause → inspect → retained source/format/all definitions,
native mapping и completion verification → resume → новый Execute/read3×3.
Восемь подмен отвергнуты. Приёмочный браузер закрыт; пакет не сохранялся.

Добавлен read-only retained format/definitions reader в
`node-import-continuation.mjs`. Он проверяет точные cached DOM controls того же
prepared wizard, полную последовательность native headers/cells и все поля,
включая used=false. На Done не выполняются Back/Next/reopen для сверки.
`output_mapping` receipt теперь сохраняет completion settings; resume проверяет
их вместе с source/format/definitions/native mapping. Заново mapping не применяется.
Остальные границы пока не разрешены; original deadline и step sequence сохранены.

Полный pinned client **832 PASS / 1 SKIP** (`mapped-resume-client-tests.txt`).
`independent-mapped-resume-audit.json` / `independent-mapped-resume-negatives.json`
в run-dir подтверждают малую схему. Wide66 run `execute-1788861563443` на том же
runtime завершился успешно: independent audit PASS, 66 полей / 132 значения,
восемь подмен отвергнуты. Процесс завершился, приёмочный браузер закрыт.
Независимый скрипт `.dock/text-import-v3/audit-mapped-resume.py <run-dir>`
проверяет исходные bytes, resume и output; wide результат принят в этом scope.

Следом: live отказ при изменении
completion/mapping; затем finish/execution continuation и unknown reconciliation,
status/wait/stop, integrated delivery, публичный интерфейс и финальная Hermes
Sol/low приёмка полного03. Production и release не менялись.
Diagnostic61074 всё ещё открыт на Done с несохранённым черновиком, source/format
read-only наблюдения `output-boundary-recheck.json` / `output-format-inspect.json`
подтверждены в этом участке; deadline истёк. Его не использовать как новый run.

---

# Подплан 03 — отказ продолжения изменённого черновика, 8 сентября 2026

**In progress, source only.** Live run `execute-1788861103896` на runtime
`1ee86f2b9211d38da6a57c47feeaf18d9c2636b5ac3358781d8fa2e15f416063` прошёл
independent negative audit: после accepted configure оператор реально изменил
Null-маркер через input.fill/Tab; explicit resume отказал, mapping/Execute не
запускались. Повтор operation ID не обращался к браузеру. Пять подмен отвергнуты.
Evidence: `paused-ui-mutation.json`, `independent-refused-resume-audit.json`,
`independent-refused-resume-negatives.json`, `result.json` в этом run-dir.
Процесс завершился exit0, браузер закрыт.

Исправлен внешний catch `runNodeApply`: отказ continuation теперь возвращает
прежние принятые phases/node/execution/output, а не теряет сведения о частичных
эффектах. Добавлен тест сохранности ответа и отсутствия новых действий.
Полный pinned client: **831 PASS / 1 SKIP** (`refused-resume-client-tests.txt`).
`git diff --check` PASS. Production, клиентский release и Hermes не менялись.

## Следующий участок и живая диагностика

Начато исследование границы **после output_mapping**. Новый собственный diagnostic
`execute-1788861224016`, tool handle **61074**, остановлен после принятого mapping,
до finish/Execute. На странице Done сохранены mapped aliases/order/autosync=false.
`output-boundary-inspect.json` подтвердил read-only доступ к retained source controls
и обоим native mapping stores без перехода назад: источник и все record links
доступны на странице Done. Это ещё НЕ готовый continuation этой границы:
перед разрешением нужны также полная сохранность import format/definitions и
независимая проверка полного resumed Execute/output. `verifyContinuation` пока
разрешает только configure.

Контекст handle61074: execute/session/dir/fs/runtime/request/prep,
`ctx.continuationBinding`. stdin protocol:
`{"file":".dock/text-import-v3/<script>.js","id":"<result>"}`.
Deadline исходной операции ограничен и истекает; не сбрасывать его вручную.
Пакет не сохранён, узел не выполнен. При продолжении проверить handle и UI.
Старые diagnostic handles67499/66047 перечислены ниже; сейчас не перепроверялись.

Остаются границы output_mapping/finish/execution, unknown-phase reconciliation,
long execution/status/wait/stop, integrated delivery, публичный node.apply,
финальная Hermes openai-codex / gpt-5.6-sol / low и независимая приёмка всего03.

---

# Подплан 03 — продолжение после принятой настройки, 8 сентября 2026

**In progress, source only.** Fixed-pin run `execute-1788860882652`, runtime
`b5e01bec7c4cec5a69229d2788be09df10766dcaf922aba6be9ed0cc949e07a2`, прошёл
independent configured pause → read-only inspect → explicit resume → новый
Execute/read3×3. Девять негативных подмен отвергнуты. Новый upload, повторная
настройка, wizard reopen и повторный Execute при resume не выполнялись.
Evidence: `independent-configured-resume-audit.json`,
`independent-configured-resume-negatives.json`, `paused-result.json`,
`paused-inspect.json` в каталоге этого run. Процесс завершился exit0, браузер закрыт.

`node-import-continuation.mjs` читает retained source controls того же prepared
wizard без навигации: путь, connection, encoding, rows_to_skip, first_line_as_title.
Это проверка UI-черновика, не новое доказательство server bytes. Перед продолжением
сверяются source baseline, формат и вся native paged schema/schema_id.
Node procedure сохраняет sequence/receipts, но использует новый сигнал отмены;
счётчики шагов и исходные deadlines не сбрасываются. Неподдержанные границы,
неизвестный эффект, утрата контекста и истёкший deadline остаются отказом.

В диагностике `execute-1788860656516` resume дошёл до Execute, но его post-gesture
read попал в переход wizard→graph и получил PREPARED_NODE_CONTEXT_CHANGED.
Этот run НЕ принят и НЕ повторялся. Прямое наблюдение подтвердило граф и
завершённую группу1/child1.1 без ошибки; ownership/freshness этой группы отдельным
аудитором не приняты. Исправлен только bounded post-gesture reread того же
node/document/workflow при Done/Execute (до двух раз), без повторного клика.
Тесты проверяют same-node переход и отказ foreign-node, ровно один клик.

Проверки: полный pinned client **830 PASS / 1 SKIP**
(`configured-resume-final-client-tests.txt`); независимый live audit PASS и
**9 negatives rejected**; `git diff --check` PASS. Source runtime после приёмки
не менялся. Production, установленный клиент, catalog release и Hermes не менялись.

## Точная точка продолжения

1. Live negative: изменение источника/формата/поля между pause и resume должно
   завершаться отказом без mapping/Execute. Текущие JS semantic negatives и
   подмены audit не заменяют эту live проверку.
2. Расширить continuation/reconciliation на прочие принятые границы и неизвестные
   квитанции; выполнить live long-running/status/wait/stop/cancel проверки.
   Сейчас `verifyContinuation` принимает только границу configure, inspectApply
   не сверяет неизвестную pending-фазу. Это не полный recovery подплана03.
3. Integrated delivery, публичный node.apply и его карточки/контракт, финальный
   goal-only Hermes openai-codex / gpt-5.6-sol / low и независимая приёмка остаются.

Открыты собственные диагностические сессии (актуальность при продолжении проверить):
- tool handle67499: `execute-1788860371811`, исходная остановка после configure,
  мастер формата, unsaved draft; `ctx.continuationBinding`, `continuation-inspect.json`,
  `retained-source-read.json`, screenshot `continuation.png`. Deadline истёк.
- tool handle66047: `execute-1788860656516`, failed post-Execute наблюдение,
  граф/консоль процессов, unsaved; `ctx.continuationBinding`,
  `finish-inspect.json`, `completed-process-inspect.json`. Deadline истёк.
stdin protocol: `{"file":".dock/text-import-v3/<script>.js","id":"<result>"}`.
Контекст: execute/session/dir/fs/runtime/request/prep и diagnostic bindings.
Никаких продолжающихся жестов или Hermes в этих сессиях нет; новые acceptance
процессы завершены. Изменения остаются незакоммиченными в рабочем дереве.

---

# Возобновление подплана 03 — 8 сентября 2026

Работа возобновлена по новому указанию пользователя. Подплан 03 не завершён.
Старые процессы 25375/7127 отсутствуют; их несохранённые черновики не считаются
доступными. Историческая точка остановки сохранена ниже.

Адресный Field66 diagnostic прошёл независимый аудит после добавления проверки
строго привязанной прокрутки в аудитор; четыре негативные подмены отвергнуты.
Evidence: `.dock/text-import-v3/execute-1788851953134/independent-resumed-point-audit.json`
и `independent-resumed-point-negatives.json`. Это draft, не fixed-pin persistence.

Новый wide66 run `execute-1788859588975`, runtime `65c77641…af51e`, завершил
Execute/read и replay без браузера. Независимый audit НЕ принят:
`configured_native_post_edit` — финальное чтение native mapping предшествовало
прокруткам завершающего постраничного просмотра. Старый audit сохранён как FAIL.
Добавлена финальная native observation после страниц с проверкой неизменности
полной схемы (кроме rendered_indices); wizard повторно не открывается.

Полный client suite на закреплённом Node 24.19.0 до этой последней правки:
827 PASS / 1 SKIP; после неё focused 27 PASS. Python import evidence 119 PASS,
port mapping 6 PASS, git diff --check PASS.
Новый fixed-pin wide66 run `execute-1788859931691`, runtime
`19f5930270beb67d7327f6ed5421cda2c595dff42764416569be8be385e528a0`:
**independent audit PASS**, 66 полей / 132 значения, перестановка Field65/Field66,
выходные имена/метки и autosync=false. Повтор operation ID без браузера.
`independent-wide-output-audit.json` и `independent-wide-negative-audits.json`:
шесть подмен отвергнуты (bytes, alias, order, autosync, outer runtime, checkpoint).
Прогон завершился exit0, приёмочный браузер закрыт. Пакет этого прогона не сохранялся;
это не новый persistence или Hermes audit.

Негативная проверка выявила пробел проверки внешней phase identity в аудиторe.
`import_done_evidence.py` теперь сверяет session/runtime/target всех node фаз,
включая внешние квитанции; тест отклоняет каждую из трёх подмен. Повторный аудит
того же неизменённого run PASS, source runtime после него не менялся.
После исправления аудитора Python import evidence **120 PASS**; mapping **6 PASS**.
Полный client suite после правки: **827 PASS / 1 SKIP**,
`.dock/text-import-v3/post-pages-client-tests.txt`; процесс завершился exit0.

Следом: выполнить живую диагностику безопасного continuation/recovery и
закрыть остальные обязательства 03: integrated file
delivery, ошибки/прерывания/долгое выполнение/status/wait/stop/resume, публичная
регистрация и контракт результата, финальный Hermes Sol/low и независимый audit.
Никакие release/Hermes/full03 acceptance этим участком не объявлены.
Проверка текущего кода: `text-import-node.mjs` пока возвращает false из
`verifyContinuation`; `executor.mjs::inspectApply` возвращает сохранённый результат
либо unresolved без phase-specific сверки. Unit mock resume не доказывает
живое восстановление. Публичная регистрация node.apply ещё отсутствует.


---

# Остановка по просьбе пользователя — 8 сентября 2026

**Работа остановлена. Не продолжать автоматически и не запускать новые проверки
или Hermes до нового указания пользователя. Подплан 03 НЕ завершён.**
Последний начатый шаг дождался ответа: `wide-point-driver-1788852210590`
вернул verified=true, cleanup_complete=true. Новых запусков после просьбы
остановиться не было. Оба диагностических браузера оставлены открытыми,
процессы ждут ввода; `user-pause-state.json` подтвердил 0 editors / 0 masks.

## Принято за последний участок

На runtime `f32f94540a30289713b6f81a9f54be91b4c7fd674207980232db8031213fb352`:
- `execute-1788851657871`: seed с mapping → existing source-label patch БЕЗ
  нового mapping → новый Execute/read3×3. Independent audit PASS, 10 negatives
  rejected; aliases/order/autosync сохранены без mapping gestures.
- `execute-1788851761691`: mapped import → package.save_checkpoint → отдельный
  QA close/open БЕЗ resave → noop source patch БЕЗ mapping → новое Execute/read3×3.
  Independent persistence audit PASS, 18 negatives rejected, включая попытку
  незаметно повторно применить mapping после открытия.
  Проверенный пакет: `/user/dock-p3/Dock03-package-1788851820157.lgp`.
- Изменены operator harness и independent existing/saved auditors; добавлена
  явная проверка отсутствия повторного mapping при persistence QA.
  Python evidence: **173 PASS** (`mapping-wide-python-tests.txt`).

## Незавершённая широкая проверка и исправление

`execute-1788851953134` (66 полей) остановился на output_mapping step433:
попытка double_click Field66 отвергнута **до жеста**, NOT_APPLIED /
UI_REFERENCE_OBSCURED. Полный 66-field mapping/Execute/output **не принят**.
Live `wide-mapping-diagnose.json` доказал: строка Field66 частично видна,
наблюдение видит доступную точку y793.75, но действие проверяло скрытый центр
ячейки y799.5. Viewport1508×862, native window1508×949 подтверждены.

В `client/lib/workspace-ui.mjs` выходные cells теперь используют свежую
`interaction.point`, затем повторно проверяют реальное попадание перед жестом.
Добавлен тест частичного перекрытия и отказа, если ячейку закрыли после чтения.
Весь workspace-ui suite **225 PASS** (`mapping-visible-point-tests.txt`).
После этой последней правки общий client suite ещё НЕ запускался; предыдущий
общий результат — **826 PASS / 1 SKIP**, до исправления точки клика.

Живой адресный driver `wide-point-driver-1788852210590` после исправления
переименовал Field66→OutputField66, label→«Выход Field66», сохранив
source record636 / target702 / field_id65 и тип real. Ответ verified и cleanup
подтверждены; это **draft diagnostic**, independent audit этого шага ещё нет,
fixed-pin полного 66-field acceptance после исправления ещё нет.

## Живые процессы и состояние черновиков

1. **25375**: operator diagnostic, каталог
   `.dock/text-import-v3/execute-1788851953134`.
   TF-1 Import03Done, основной output mapping wizard открыт, редактора поля нет.
   Все 66 source полей настроены. Только Field66 переименован адресным diagnostic;
   Field65 и перестановка двух последних полей ещё не сделаны, autosync ещё true.
   Node Done/Execute не выполнены; пакет этого запуска не сохранён.
   `ctx.mappingBinding` подготовлен в `wide-mapping-diagnose.js`;
   `ctx.mappingFieldChannel`/operation — последний diagnostic, deadline истечёт.
   stdin protocol: `{"file":".dock/text-import-v3/<script>.js","id":"<result>"}`.
   Context здесь: execute/session/dir/fs плюс сохранённые diagnostic bindings.
2. **7127**: исходный `.dock/text-import-v3/live-1788831557489`.
   TF-4 на графе; Import03Done ранее выполнен, output order:
   Id(string из Title), AmountMapped(real из Amount), Title(integer из Id).
   Последние изменения `/user/dock-p3/Dock03-refresh-1788846018997.lgp` не сохранены.
   Старый TF-1 с missing-file draft также сохранён в открытом браузере.
   `ctx.mappingBinding` актуален; старый ctx.savedPrep не использовать.

Процессы независимых acceptance 35442/56504 завершились, их браузеры закрыты.
Тестовый процесс90519 завершился exit0. Нет ожидающего жеста, исполнения или
запущенного Hermes. Открытые черновики оставлены без Done/Execute/Save, чтобы
остановка не внесла дополнительные изменения. Журналы не доказывают сохранение
этих черновиков в .lgp; закрытие браузеров приведёт к их утрате.

## Возобновление только после разрешения пользователя

1. Проверить Git и живые handles; не перезапускать по одному timeout.
2. Проверить последнюю правку точки клика полным client suite и независимым
   audit адресного wide шага; затем повторить полный 66-field acceptance с новым
   pin (последняя правка меняет runtime). Harness уже пишет browser-geometry.json
   и проверяет native viewport/maximized window для следующих запусков.
3. Не считать старый failed run принятым после diagnostic продолжения.
4. Продолжить весь remaining03: wide mapping/бюджеты, integrated delivery,
   ошибки/прерывания/долгое выполнение/status/stop/recovery, регистрация/release,
   полный goal-only Hermes openai-codex / gpt-5.6-sol / low и независимая приёмка.

Все изменения остаются в рабочем дереве. Коммиты, deploy, reinstall и публикация
не выполнялись. Точка остановки не означает завершение active goal.

---

# Подплан 03 — полный импорт с выходным mapping, 8 сентября 2026

**In progress, source only; весь подплан 03 и Hermes ещё не приняты.**
Private node.apply теперь принимает один output mapping порта 0 с configured_field
refs: имена/метки, полный порядок полей, autosync. Ссылки проверяются по полной
native схеме и двусторонним связям records. Отсутствующий mapping сохраняет
наблюдённые выходные aliases/order; этот новый existing путь ещё требует отдельной
живой приёмки. Неподдержанные input mappings и `excluded:true` отвергаются до UI.

Fixed-pin полный verified upload → configure → rename cycle/order/autosync=false →
Execute → новый Table/read 3×3 → возврат в граф: **independent audit PASS**,
`.dock/text-import-v3/execute-1788851403379`, runtime
`f32f94540a30289713b6f81a9f54be91b4c7fd674207980232db8031213fb352`.
Выход: AmountMapped/«Сумма выхода» из Amount, Id/«Название» из Title,
Title/«Номер» из Id. Все девять значений проверены по исходным bytes;
15 negative audits отвергнуты. Replay operation ID не вызвал браузер.
Сохранение/повторное открытие с mapping на этом pin **не проверялись**.

Проверки: client **826 PASS, 1 SKIP**, Python evidence **171 PASS**,
`git diff --check` PASS. Evidence:
`mapping-integrated-client-tests.txt`, `mapping-integrated-python-final.txt`,
`independent-mapping-output-audit.json`, `independent-mapping-negative-audits.json`.
Production, опубликованный catalog, установленный клиент не менялись.

## Изменения и наблюдённые особенности

- `port-mapping-procedure.mjs`: guarded reorder по native record IDs; batch field
  edits с зарезервированным временным именем для циклов. Каждый Apply/move сверяет
  полную native схему, включая неизменность источника. Ожидание редактора требует
  доступного typed action, а не только присутствия metadata.
- `node-mapping-context.mjs` и output definition reader допускают другой порядок
  backing collection, только если это ровно те же native record objects.
  Добавлено обязательное булево `required` источников/выходов.
- Live имя с совпадающей меткой автоматически изменяет метку. Typed input verifier
  допускает только точное связанное значение; handler затем задаёт запрошенную
  метку. Иное изменение по-прежнему AMBIGUOUS, без повторения жеста.
- Отключение autosync меняет значок активного выхода на
  `output_table_active_no_automapping.svg`. Первый integrated run
  `execute-1788851234574` ошибочно признал его неактивным после успешного Execute.
  Codex воспроизвёл на живом TF-4 и сверил E2E app_consts.ts. Native reader теперь
  различает оба активных значка; inactive/warning/error/hover не считаются active.
- В основном мастере и отдельном `DataSetOutputSocketWizard` у текстового импорта
  все три source поля Required=true: кнопка исключения выключена. Help
  `data/workflow/ports/exclude-fields.md` подтверждает запрет обязательных полей.
  `mapping.excluded` не подменяется `settings.columns[].used=false`: последнее —
  уже отдельно принятый способ исключения исходного поля импорта, другая семантика.
- Новый `port_mapping_evidence.py` проверяет draft batch/order и полный configured
  mapping по request+source; общие Done/output audits проверяют имена и порядок
  выхода отдельно от исходных CSV names/labels.

## Диагностический checkpoint

Persistent process **7127** жив, `.dock/text-import-v3/diagnostic.mjs`,
`.dock/text-import-v3/live-1788831557489`. `ctx.mappingBinding` актуален для TF-4:
workflow `1788831561418-ie6zeq98eb-2`, node
`f317ab92-e07f-49b1-bb98-2eac13150080`. Старый `ctx.savedPrep` не использовать.
После отдельного port wizard вернулись в граф, снова открыли основной мастер
только для QA цикла имён. Batch `mapping-cycle-driver-1788850935958` PASS:
Title→Id (source2354), Id→Title (source2353), AmountMapped(source2355) сохранён;
метки Title/Id/«Сумма проверенная» сохранены. Independent draft audit PASS,
10 negatives отвергнуты. No-op `mapping-cycle-noop-1788851094986` — 0 edits.
Ранее reorder `mapping-order-driver-1788850080292` — 3 moves, independent PASS,
6 negatives отвергнуты.

**Текущее живое состояние:** TF-4 Import03Done уже выполнен ручным diagnostic
`mapping-execute-icon.json`, подтверждён активный no-automapping icon в
`mapping-icon-read.json`; граф открыт, редактора нет. Выходной порядок
Id(string из Title), AmountMapped(real из Amount), Title(integer из Id).
Пакет `/user/dock-p3/Dock03-refresh-1788846018997.lgp` с последними изменениями
**не сохранялся**. Старый TF-1 missing-file draft сохранён. Не повторять Execute
для проверки активности. Viewport1508×862, native window1508×949 подтверждены.
Оба integrated acceptance процесса завершены и их отдельные браузеры закрыты.

Следом: existing partial без mappings с сохранением aliases/order; сохранение,
QA reopen и reexecute с mapping; wide mapping и бюджеты. Затем remaining03:
integrated delivery, ошибки/прерывание/долгое выполнение/status/stop/recovery,
регистрация/release и полный goal-only Hermes Sol/low с независимой приёмкой.

---

# Подплан 03 — драйвер редактирования выходного поля, 8 сентября 2026

**in progress, source only.** `configureOutputField` связывает target record с
native source record, читает всю output definition, адресно выбирает страницу
нужного поля, открывает редактор, меняет name/label и подтверждает Apply.
После этого полный native source/target inventory сравнивается с ожидаемым:
меняются только заданные name/label одного record. Rendered viewport indices
исключены из semantic comparison; actual field IDs/types/kinds/links/прочие поля
и node context остаются строгими. No-op не открывает редактор.
`observeOutputDefinitionPage` переиспользует bounded scroll полного reader-а.

Live через настоящий prepared node channel принят:
`mapping-field-driver-1788849581088` (`mapping-field-driver-resume-2.json`, каталог
`live-1788831557489`): Amount→AmountMapped, label→`Сумма проверенная`, target2202
по-прежнему связан с source2199/Amount. `independent-field-mapping-audit.json` PASS,
девять искажений отвергнуты (`independent-field-mapping-negative-audit.json`).
Аудитор проверяет журнал/gestures/typed refs/Apply row/native before-after.
Scope **prepared_output_field_draft**, не persistence/fixed-runtime/Hermes.
Последующий no-op `mapping-field-driver-1788849886264` вернул effect_possible=false,
журнал содержит 0 `node_step_prepared` (редактор не открывался).

При отладке исправлены две реальные причины отказа:
1. Name/label cells были только refs в metadata. Теперь эти ячейки выдаются как
   output_column actions click/double_click/press только для complete definition,
   с observed interaction point и семантикой поля в signature. Filter/foreign view
   подавляют actions. Неполные списки не объявляются полными.
2. Node procedure читала wizard subtree, поэтому portal fields оставались metadata
   без действий. Она теперь выбирает root глобального EditColumnDefForm; следующий
   полный read обязан доказать native ownership, и только затем допускается dialog.
   Прежняя неудачная попытка была закрыта typed Cancel без изменения строки.

Для fresh diagnostic binding текущий черновик метки `Сумма выхода` был завершён
Done (без Execute/Save); graph adapter.observe подтвердил тот же native graph и
зарегистрировал workflow identity. `ctx.mappingBinding` теперь актуален:
document `1788831561418-ie6zeq98eb`, workflow `1788831561418-ie6zeq98eb-2`, node
`f317ab92-e07f-49b1-bb98-2eac13150080`, TF-4, navigation на Dock03_refresh_1788846018997.
`mapping-prepare-graph.json` / `mapping-field-driver-live` содержат наблюдения.
Это восстановление диагностического контекста, не готовая product recovery.

Проверки: **805 client PASS / 1 SKIP** (`mapping-field-driver-final-tests.txt`),
**168 Python evidence PASS** (`mapping-field-evidence-tests.txt`), после уточнения
return flags ещё **8 focused PASS** (`mapping-field-return-tests.txt`).
`git diff --check` PASS. Production не менялся.

Resume: diagnostic **7127** открыт на TF-4 output mapping. Текущий **несохранённый
черновик**: AmountMapped/`Сумма проверенная`, source Amount, autosync=false;
Done/Execute/Save после этого изменения не было. ctx.mappingBinding актуален,
ctx.savedPrep устарел. ctx.mappingFieldChannel — последний no-op; его deadline
ограничен, при продолжении создать новый operation/channel с той же проверяемой
binding. Далее порядок/исключения/rename cycles, полный driver и подключение
imports.text handler, independent full mapping/output/save/reopen acceptance.
Весь прочий scope 03 (delivery/recovery/errors/Hermes и др.) остаётся.

---

# Подплан 03 — configured field refs и глобальный редактор, 8 сентября 2026

**in progress, source only; пользовательские mappings пока не активированы.**
Общий приватный контракт допускает выходной source `{kind:'configured_field',name}`
рядом с прежним opaque FieldRef. Это поле **собственного настроенного источника**
операции, а не имя/метка произвольного входа. Input mapping такую ссылку отклоняет;
смешивание с schema_id/field_id и лишние ключи запрещены. Обработчик imports.text
пока отклоняет любые mappings до UI; публикации контракта не было.

`resolveConfiguredOutputMapping` сверяет всю used configured schema с полной
native source schema по точным именам, меткам и типам. При fields требуется полный
упорядоченный список всех used sources, по одному разу; исключение явное через
excluded, хотя бы одно поле остаётся. Целевые names уникальны. Текущий target
определяется по source record/field ID; незапрошенные target label/name/data_kind
сохраняются. Native reader дополнен target data_kind и отказом на неизвестный kind.
Этот resolver ещё не выполняет перестановку/исключение/переименование в handler.

Live выявил global `EditColumnDefForm` вместо прежнего вложенного адреса.
Workspace reader теперь допускает такой портал только когда native Controller:
FView ссылается на тот же DOM, FAddMode=false, Records содержит ровно один model,
совпадающий с выбранной строкой active wizard mapping store/index/record ID/view.
Глобальные маркеры включены в scoped read; при открытом редакторе mapping definition
не выдаёт completeness. Типизированные name/label/apply используют актуальный
root_tid. Общая node procedure допускает только этот привязанный диалог,
продолжая отвергать чужой/дополнительный.

Live `mapping-portal-edit-apply.json` (`live-1788831557489`) подтвердил typed label
edit → Apply → selected row verification: Amount label `Сумма выхода`, source
Amount неизменён. `mapping-native-after-label.json` подтвердил ту же native link
2072→2063. Это draft diagnostic, без Done/Save/Execute, не independent acceptance.

Во время диагностики была потеря связи. Штатный точный вопрос восстановления
подтверждён (`mapping-restore-session-2`); позже выяснилось, что маска после
успешного double-click принадлежала уже открытому global editor, поэтому повторный
Edit click был перехвачен маской и ничего не изменил. Старые timeouts сохранены.
Native mapping reader теперь отвергает также plain `.x-mask`, включая reconnect
и editor masks. Восстановление само по себе не считается acceptance recovery.

Проверки: **801 client PASS / 1 SKIP** (`mapping-configured-portal-final-tests.txt`),
после последнего уточнения data_kind **9 focused PASS** (`mapping-native-resolver-final.txt`).
Отдельно global editor native ownership fixtures и 42 node procedure tests PASS;
40 contract/resolver tests PASS. `git diff --check` PASS. Production не менялся.

Resume: diagnostic 7127, TF-4, открыта output mapping page (global editor закрыт).
Черновик: autosync=false, Amount output label=`Сумма выхода`; input source Amount
и остальные поля прежние. Не использовать устаревший ctx.savedPrep navigation.
Далее реализовать высокоуровневый output mapping driver поверх проверенных
примитивов: адресное выбранное поле, rename/label, порядок, исключения, autosync,
native before/after proof; подключить handler и независимые audits/reopen/output.
Весь оставшийся scope 03 сохранён.

---

# Подплан 03 — нативные источники выходного mapping, 8 сентября 2026

**in progress, source only.** Добавлен `node-mapping-context.mjs`: bounded read
двух cached `Ext.data.Store` из одного `ColumnsMappingEngineOutputPortWizard`.
Проверяются реальные grid/view элементы, полнота/отсутствие фильтрации, уникальные
record/field IDs и имена, двусторонняя `ConnectedRecord` связь, тип/метка источника,
привязка отрисованных target строк по record ID/index/view, текст ячеек и согласие
DOM/native состояния autosync. Скрытая source grid в режиме «Таблица» допустима:
связь проверяется через её собственный native view/store внутри активного мастера.
Backend/data APIs не вызываются; данные набора не читаются.

`makeNodeMappingContextCode` обрамляет чтение проверками одного prepared wizard
node; `node-procedure.observe({readMappings:true})` сохраняет `node_mapping` в том
же журнале и отвергает изменившуюся node identity. Пока handler эту опцию не
использует; пользовательские mappings остаются отклонены до изменения UI.

Live lower-level reader `mapping-read-native.json` в `live-1788831557489`
подтвердил Id/Title/Amount, source record IDs 2061/2062/2063, target 2070/2071/2072,
autosync=false, полные cache inventories и точные source names. Это diagnostic,
не fixed-pin node.apply/independent mapping acceptance. Source ID/имя сохраняются
даже при совпадающих метках — это отдельно проверено native fixtures.

Проверки: **796 client PASS / 1 SKIP** (`mapping-native-client-tests.txt`);
после расширения journal теста **44 focused PASS** (`mapping-native-focused-final.txt`).
16 подмен cache/view/record/link/DOM/pressed состояния отвергнуты.
`git diff --check` PASS. Production и saved package не менялись.

Resume: diagnostic 7127 по-прежнему на TF-4, output mapping черновик с autosync=false.
`ctx.savedPrep` содержит СТАРЫЙ navigation_path до Save As; не использовать его
как актуальную prepared binding. Для текущей live проверки читался только
browser-level `readMappingBrowser`, без заявления о полной prepared операции.
Следом: определить ссылку на поле собственного configured source для новой
одношаговой операции (нынешний FieldRef требует заранее известные schema_id/field_id),
затем подключить rename/order/exclusion/autosync и проверки source identity,
независимую приёмку и сохранение. Все остальные требования 03 остаются.

---

# Подплан 03 — принят цикл замены сохранённого пакета, 8 сентября 2026

**in progress, source only.** Fixed-pin run `execute-1788847173172`, runtime
`d6e7600d62e918cc5134a0c8836954e8c24da5f5c55cfa0f6cf07096639c03ee`, прошёл
`independent-save-conflict-audit.json`: initial checkpoint → partial Id label
`После изменения` → отказ от замены → явная замена → отдельный QA close/open
без resave → сохранённый baseline → новый Execute/read 3×3.
Путь: `/user/dock-p3/Dock03-package-1788847218873.lgp`.
20 искажений вопросов, путей, cleanup, подтверждения, continuation, графа,
QA reopen, identity, source bytes, runtime и порядка отвергнуты
(`independent-save-conflict-negative-audit.json`). Это не Hermes acceptance.

Причина прежнего отказа найдена в live UI: legacy DOM inventory консоли
справедливо требовал отсутствия прокрутки, поэтому исчезали также actionable
refs. Добавлен отдельный `rendered_process_window`: только видимые пары строк
двух нативных views, привязанные к одному cached TreeStore/model/index.
Полнота истории/деталей остаётся false. Полная история берётся отдельным native
process reader. `revealExecutionControl` ограниченно прокручивает наблюдённый
owner с проверкой того же узла, history root и process/record IDs; Execute и
очистка истории не повторяются. Independent verifier проверяет scroll receipts,
owner, delta, фактическую позицию и неизменность history root.

Проверки: client **789 PASS / 1 SKIP** (`process-window-client-tests.txt`),
Python evidence **167 PASS** (`process-window-evidence-tests.txt`), scoped native
window tests с 10 нарушениями привязки/видимости. Production не менялся.
Предыдущие failed runs сохранены как FAIL; текущий acceptance browser закрыт.
Остаются mappings, integrated delivery, остальные форматы/ошибки/смены схемы,
long execution/status/stop, recovery, release и полный goal-only Hermes audit.

Следующий increment начат: `port-mapping-procedure.mjs` содержит приватный
`configureOutputAutosync`, пока **не подключённый к node.apply**. Source tests:
4 PASS, включая no-op, foreign wizard, изменение поля и пересоздание DOM refs.
Полный client suite после добавления драйвера: **793 PASS / 1 SKIP**
(`mapping-autosync-client-tests.txt`); `git diff --check` PASS.
В diagnostic 7127 воспроизведено true→false по нативной кнопке и cached records
(`mapping-toggle-off.json`); включение пересоздаёт DOM строк, поэтому сравниваются
параметры/источники без временного cell_ref, с явным source_identity_verified=false.
`mapping-driver-live-3` проверил отключение и no-op; `mapping-driver-live-4`
подтвердил false→true→false и no-op через новый драйвер. Это только draft UI diagnostic,
не fixed-pin independent приёмка сохранения автосинхронизации/произвольных mappings.
Сверены Help `mapping-master.md`, `table-interface.md`, `automapping-of-fields.md`
и E2E `bg/sels/sMapping.ts`, `mapping_buttons_state.ts`.

Resume: diagnostic **7127**, каталог `live-1788831557489`, вкладка TF-4, узел
Import03Done пакета `/user/dock-p3/Dock03-refresh-1788846018997.lgp`, открыт
`ColumnsMappingEngineOutputPortWizard`. Автосинхронизация в черновике выключена;
Done/Save не выполнялись. Исходный missing draft TF-1 сохранён отдельно.
Далее связать native source identities (cached target ConnectedRecord содержит
Name/ID/Index/DataType и source record ID), разработать FieldRef для единой
операции, подключить mappings и независимый roundtrip/output audit. Текущий
контракт по-прежнему отклоняет пользовательские mappings до изменения UI.

---

# Подплан 03 — конфликт записи и продолжение после Save As, 8 сентября 2026

**in progress, source only; полный save-conflict cycle пока НЕ принят.**
Работа продвинулась до реального отказа от замены, явной замены изменённого
пакета и проверки сохранённых настроек после отдельного QA reopen. Последний
полный run остановился позже, при выборе нового процесса вне видимой области.
Не считать этот run успешным и не повторять его execution/save IDs.

Реализовано:

- Подтверждение замены требует точного native текста `"<полный путь>" уже существует.
  Вы хотите заменить его?` и кнопок Да/Нет. Чужой путь/вопрос не подтверждается.
  После No + Escape проверяются исчезновение file dialog, вопроса и меню;
  незавершённый cleanup остаётся AMBIGUOUS. Живой diagnostic
  `save-conflict-runtime-fail-3` подтвердил NOT_APPLIED/cleanup_complete=true.
- `package.save_checkpoint` возвращает `workflow_continuations`: document_id,
  previous_workflow_ref и актуальный workflow_ref. Они проверены по тем же
  native package/workflow objects, вкладке и graph container, без ослабления
  старых navigation guards и без переписывания прежних запросов/журналов.
- Save As сначала обновляет подпись, но оставляет старые breadcrumb data-tid;
  следующий переход перестраивает их. Это воспроизведено в живом UI:
  `save-wizard-navigation*` / `save-refresh-*`. Click текущего breadcrumb ничего
  не обновляет. Штатный parent module → double-click того же workflow tree item
  обновляет адреса, сохраняя открытый пакет/вкладку. Handler использует этот
  bounded переход только при изменении навигации; затем проверяет прежний граф,
  native identities и возвращает актуальную привязку.
- Каталог точно описывает структуры continuation. Для ограниченных массивов
  добавлены minItems/maxItems в admission и value validator (включая проверку
  некорректных/обратных границ); общие guards не ослаблялись.
- Harness `--save-conflict` выполняет initial checkpoint → existing Id label
  `После изменения` → fail на том же пути → explicit replace → QA close/open
  без resave → baseline → Execute/read. Полный independent verifier
  `save_conflict_evidence.py` не принимает неполную цепочку. Его continuation
  исключение изолировано: обычный existing auditor по-прежнему требует прежний
  workflow_ref. `verify_save_refusal_receipt` не утверждает равенство file bytes.

Последний live run **`execute-1788846213706`**, runtime
**`0a33ec3984a162432551cfb288fed2b4dcb5cfafba9abb71665f07a7a555c619`**:

- Пакет `/user/dock-p3/Dock03-package-1788846259502.lgp`.
- Initial save, patch Execute/read, NOT_APPLIED conflict и SUCCEEDED replacement
  подтверждены квитанциями. QA reopen без resave прошёл; полный baseline с Id
  label `После изменения` проверен до no-op patch. `independent-refusal-receipt.json` PASS.
- Whole `independent-save-conflict-audit.json` **FAIL**, как и должен:
  missing final output/execute checkpoint. Это не persistence/whole-cycle PASS.
- В последнем execute узел уже завершился: Console root385, process5/5.1,
  record1256/1257, state=completed. Но оба process controls отсутствуют в
  `ui.elements`: scroll top0/max87, новый элемент ниже viewport. `act` получает
  initialObservation с отсутствующим control и отказывает (`Initial bound
  observation is no longer current or ready`). Node_apply остаётся AMBIGUOUS;
  повтор Execute запрещён. Процесс88463 terminal exit1, browser closed.
- Следующий шаг: адресно показать нужный native process row в его Console grid,
  не очищая историю и не выполняя узел снова; добавить scoped driver/evidence
  проверки прокрутки/выбора, затем новый independent full-cycle acceptance.

Предшествующие диагностические runs тоже не приняты:
`execute-1788845505647` — прежний navigation path после Save As;
`execute-1788845716936` — выполненная запись, но runtime отказал в некорректной
output schema continuation (BROWSER_CALL_UNCERTAIN, не повторялась);
`execute-1788845805959` — смена breadcrumb data-tid во время открытия мастера.
Их браузеры закрыты, outcomes/файлы оставлены как evidence. Runtime последних
двух `9b3f19fe…fcf1bd`, первого `17079179…d44278`.

Проверки: **client 784 PASS, 1 SKIP** (`save-cycle-client-tests-2.txt`),
**Python evidence 166 PASS** (`save-cycle-evidence-tests.txt`), git diff --check PASS. Реальный последний
runtime выше предшествует добавлению array bounds в action-catalog.mjs: не
приписывать текущему полному runtime fixed-pin acceptance этого run.
Production/installed client не менялись, Hermes не запускался.
Полный scope 03 остаётся: mappings, delivery внутри node.apply, варианты/ошибки,
long execution/status/stop, save/recovery, public release и итоговая Sol/low приёмка.
Diagnostic7127 остаётся на графе TF-4 с файлом
`/user/dock-p3/Dock03-refresh-1788846018997.lgp`. ctx.prep/ctx.savedPrep исторические;
не переиспользовать их пути. TF-1 содержит прежний unsaved missing draft.

---

# Подплан 03 — промежуточная запись без закрытия, 8 сентября 2026

**in progress, source only; полный подплан не принят.**
Добавлена отдельная candidate capability `package.save_checkpoint.v1` и действие
`package.save_checkpoint`. Вход: точный path и conflict_policy fail/replace.
Операция использует штатный Save As, сохраняет открытый workflow/граф и не
вызывает Close/Open. Прежний `package.save_as` сохранил save/close/reopen контракт.
В effect ABI добавлен `persist` с postcondition awaited_save_flow_same_path_and_open_workflow;
старый `save` по-прежнему требует reopened content. Registry, catalog, source-index,
schema, описания инструментов и outcome verifier согласованы. Явный builder
`--package-root` применяет новую область к обоим save actions с новой revision.

Исследование реального UI и сохранённых исходников MainMenuForm показало:
btnSavePackageHandler вызывает Promise.done(DoSavePackage(false)) и сразу закрывает
меню; такой сигнал не доказывает завершение записи. btnSaveAsPackageHandler
дожидается DoSavePackage(true), затем закрывает меню. Новый handler ждёт исчезновения
этого меню после заполнения точного пути и явной обработки конфликта, проверяет
ошибки, cached PackageFileName, неизменность workflow и графа. Потерянная квитанция
остаётся AMBIGUOUS, неизвестная запись не повторяется. Product receipt различает
save_completed=true, workflow_preserved=true, reopened=false и
persisted_content_verified=false: последнее доказывается отдельной приёмкой.

Fixed-pin independent run **`execute-1788845074909`**, runtime
**`1624d5373cd159ecd0a567c2b2e285f278d9d931fd45d7fdf9a6fba9aeb014cd`**:

- Новый import → промежуточный save
  `/user/dock-p3/Dock03-package-1788845120558.lgp` без закрытия.
- Затем dedicated `package-reopen-qa.mjs` закрывает и открывает точный файл,
  **не выполняя ни одного повторного сохранения** и не подтверждая dirty discard.
  Дополнительный read-only capability preflight проверяет persisted graph.
- Новая подготовка workflow → тот же native node → полный baseline исходных
  настроек до no-op Id label patch → новое Execute/read 3×3.
  Execution `1788845078943-1da1ncs01ch:367:1` → `…:367:3`.
- `independent-saved-import-audit.json` PASS, 21 искажённый вариант отвергнут
  (`independent-saved-negative-audits.json`), включая повторное сохранение в QA,
  отсутствие Close, чужой persisted graph/workflow/runtime, потерю параметров и старые данные.
- ID replay save и обоих node.apply не обращался к браузеру. Процесс57216
  завершился exit 0, браузер закрыт. Новый helper — только QA, не normal product path.

Первый run `execute-1788844965053` на том же runtime успешно выполнил intermediate
save `/user/dock-p3/Dock03-package-1788845011312.lgp`, но QA остановился до Close:
скрипт ошибочно ожидал container `;Graph`. В отдельном live diagnostic подтверждены
реальный `;ModelForm;cntDiagram` и active tab; QA исправлен. Первый run остаётся
непринятым целиком, exit 1/browser closed, запись не повторялась.

Проверки: **client 779 PASS, 1 SKIP** (`intermediate-save-client-tests-3.txt`),
**Python evidence 164 PASS** (`intermediate-save-evidence-tests.txt`). После правки
builder roots его lifecycle suite отдельно **6 PASS** (`intermediate-roots-tests.txt`).
Syntax и git diff --check PASS. Первые client runs выявили неполные source-index
и тестовые inventories при добавлении action; исправлены, guards admission не ослаблены.
Production/installed client не менялись, Hermes не запускался.

Следующий шаг — живая приёмка конфликтов fail/replace и повторного intermediate
save после изменения существующего узла; неизвестные save/recovery. Остальные
пункты 03 сохраняются: mappings, доставка внутри операции, режимы/ошибки/схема,
long execution/status/stop, browser/lease recovery, public release и полная Hermes
Sol/low приёмка. Приёмка одного нового пакета не закрывает эти требования.
Diagnostic7127 остаётся открытым. TF-4 после ручного Save As содержит
`/user/dock-p3/Dock03-intermediate-1788844552391.lgp`; старый ctx.savedPrep/path
больше не подходит для exact-path preparation. TF-1 — прежний unsaved missing draft.
Код ручного сохранения и UI evidence находятся в `live-1788831557489/intermediate-*`.

---

# Подплан 03 — сохранение, открытие и новое выполнение, 8 сентября 2026

**in progress, source only; полный подплан не принят.**
Композиция нового импорта → отдельный `package.save_as` → close/reopen точного
файла → новое подготовленное workflow → QA-проверка прежних настроек → Execute/read
прошла независимый живой audit. Семантика `package.save_as` сохранена; отдельное
промежуточное сохранение без закрытия пока не реализовано.

Fixed-pin run **`execute-1788843838259`**, runtime
**`a9948e6817a62a73f473571f6e5be214409e00c0c5701daec5f8d2698f31aa4c`**:

- Пакет `/user/dock-p3/Dock03-package-1788843884941.lgp`, один Import03Done,
  тот же native GUID `3f732d40-74fb-4272-aa0f-15ab713234e9` и прежний граф.
- Исходное workflow `1788843842347-hbdbcskb1xh-1`, новое после открытия `…-2`.
  Старый workflow не переиспользуется и не переписывается в журнале.
- Execution `1788843842347-hbdbcskb1xh:357:1` → `…:357:3`;
  полный выход 3×3 совпал с verified source bytes, включая Null и точные числа.
- До no-op patch метки Id независимый auditor проверил весь baseline:
  source path/encoding/header/skip, формат и все свойства полей. Холодный узел
  открыл мастер без вопроса деактивации; доказан ровно один bound begin_wizard.
- `independent-saved-import-audit.json` PASS, 16 подмен журналов/данных отвергнуты
  (`independent-saved-negative-audits.json`). Обычный existing-node auditor всё
  ещё отклоняет смену workflow; исключение изолировано в отдельной save/reopen QA.
- Повтор ID импорта, сохранения и повторного выполнения не обращался к браузеру.
  Приёмочный процесс 19745 завершился exit 0; его браузер закрыт.

Исправлена гонка Packages menu: после исчезновения закрываемой вкладки дождаться
скрытия прежнего меню, затем один раз открыть меню и дождаться команды Open.
Регрессионный тест моделирует обе задержки и считает save/close/open gestures.
Первый run `execute-1788843545589` (старый runtime `9a99b6f1…aab3ed2`)
сохранил и закрыл файл, но остановился на невидимой packages.open; он остаётся
AMBIGUOUS, не был повторён и не считается PASS. Его точный файл
`/user/dock-p3/Dock03-package-1788843592667.lgp` отдельно открыт диагностикой7127;
это дополнительное наблюдение, а не замена независимой приёмки нового run.

Harness получил `--save-reopen` только для нового Execute/read fixture.
Storage root выбран оператором в локальной копии каталога harness, repository
allowlist и серверная политика не расширялись. Исторический summary.json этого
run содержит package_saved=false для исходного node.apply; отдельный save-result
и independent audit фиксируют persistence композиции. Будущие harness summaries
явно разделяют package_saved/reopened и независимую проверку настроек.
`node.apply` по-прежнему возвращает только local_node_checkpoint, package_saved=false.
Повторное открытие мастера здесь — dedicated acceptance QA, не normal product path.

Проверки: **client 774 PASS, 1 SKIP**, **все Python evidence 161 PASS**
(в том числе import 114 PASS), syntax check harness и git diff --check PASS.
Логи `saved-import-client-tests.txt`, `saved-all-evidence-tests.txt` в
`.dock/text-import-v3/`. Production/installed client не менялись, Hermes не запускался.

Следующий шаг: отдельное промежуточное сохранение без close/reopen с независимым
persisted-state verifier, затем конфликты и безопасное восстановление. Полный
оставшийся scope 03 сохраняется: режимы/ошибки/изменения схемы, mapping портов,
доставка внутри операции, long execution/status/stop, recovery, public contract,
публикация и итоговый Hermes Sol/low с независимым аудитом всей цели.
Diagnostic7127 остаётся отдельным: TF-4 — файл первого save-run, ctx.savedPrep
содержит его новую привязку; ctx.prep относится к прежнему unsaved missing draft
в TF-1. Не смешивать привязки. Browser lease/старые refs перепроверять при продолжении.

---

# Подплан 03 — один выходной столбец, 8 сентября 2026

**in progress, source only; полный подплан не принят.**
Снят выявленный single-column format commit gap. Для единственного числового
или datetime поля pre-Apply проверяет привязанные controls, а окончательная
проверка маски выполняется при чтении Table по закрытой применённой UI-модели.
Native reader связывает текущий Table root, его ColumnsController, Format form,
закрытый modal с FResult=ok, ровно один Ext.data.Store record с совпавшими
name/type/index и DisplayFormat. Dataset/FViewColumns proxy не читается.
Отсутствие, отмена, чужая модель/поле/маска оставляют результат неподтверждённым.
Table output pages сохраняют это доказательство; decoder принимает pending
single-column format только с точным applied-format proof. Окно не открывается
повторно. Для нескольких полей сохранён прежний selection roundtrip.

Живая диагностика `execute-1788842597771` воспроизвела исходный отказ.
Попытки снять выбор через фильтр списка и пустое место не записали model mask;
не использовать их как product workflow. После Apply сохранилась точная маска,
что подтвердил `single-format-native-read-2.json`: 1×3, .123/.001 и Null.
Diagnostic 55135 закрыт через EOF, exit 0. Исходный импортер не переоткрывался.

Fixed-pin independent acceptances на runtime
**`9a99b6f1ead923ede144d955f81abf1308115bdc038feccf7862f4244aab3ed2`**:

- `execute-1788842988302`: из трёх source fields оставлен только Moment;
  выход 1×3, datetime milliseconds/Null. Execution
  `1788842992211-sk5nfl4sw1o:347:1`. Девять подмен отвергнуты.
- `execute-1788843218778`: source из одного поля Field01 (real), выход 1×2;
  точные числа `1.23456789012345` и `-1`. Execution
  `1788843222565-f2e3ie2u8iw:351:1`. Девять подмен отвергнуты.

Оба прогона подтвердили source bytes/upload, configuration, новое выполнение,
полный выход и возврат к сценарию; ID replay без браузера. Браузеры закрыты,
exit 0. `execute-1788843076278` ранее остановился до импорта на upload/download
precondition UI_REFERENCE_OBSCURED, effect_possible=false; он не принят и
не считается работающим процессом. Строгие проверки загрузки не ослаблялись.
Harness теперь допускает `--columns 1..1000` и `--only-column NAME` для нового
тестового импорта. Это параметры fixture, не новые public node.apply параметры.

Client **773 PASS, 1 SKIP** (`single-format-client-tests.txt`), import evidence
**111 PASS** (`single-format-evidence-tests.txt`), git diff --check PASS.
Production не менялся. Independent single-format auditor учитывает post-Apply
cache только для одного выхода, совместно с bound input до Apply и полным
source/execution/output audit; многостолбцовый readback не ослаблен.

Остаются остальные ошибки/режимы/типы и размеры данных, source/header/skip
patches, mappings, доставка внутри node.apply, package persistence/recovery,
public contract/release и финальный Hermes Sol/low. Весь scope 03 сохранён.
Diagnostic 7127 остаётся на FileStorage TF-3; в исходном TF-1 прежний missing
draft. Старые snapshots/operation IDs не повторять.

---

# Подплан 03 — Boolean и datetime, 8 сентября 2026

**in progress, source only; полный подплан не принят.**
Typed Table reader возвращает нативные «Истина»/«Ложь» как JSON true/false,
не смешивая false, Null и неизвестный текст. Для datetime процедура форматирования
задаёт проверенную маску `yyyy-mm-dd hh:nn:ss.zzz`; дата возвращается civil ISO
строкой с precision=millisecond и timezone=unspecified, без выдуманного UTC.
Неизвестная/неподтверждённая маска и некорректная календарная дата остаются
formatted_display с ограничением точности. Предельная точность datetime —
миллисекунда, не утверждение о сохранении более мелких долей.

Живой UI подтвердил, что стандартная дата скрывает миллисекунды и нулевое время.
Маска `YYYY-MM-DD HH:mm:ss.SSS` НЕ подходит: SSS выводит секунды, не миллисекунды.
Правильная маска проверена на примере и на реальном выходе .123/.001.
Loginom записывает model DisplayFormat при смене выбранного столбца;
после настройки процедура выбирает другой столбец и возвращается для readback.
Первый fixed-pin run `execute-1788842239358` остановился на отсутствующем
stored mask (при честном неопределённом результате). Не считать его приёмкой.
Для единственного выходного столбца отдельное подтверждение commit ещё требуется;
текущая строгая проверка не должна подменяться подтверждением ввода.

Принятый fixed-pin run **`execute-1788842368001`**, runtime
**`d29fef96bcd642f9d53783abef83f7f0d6f8bbe6c6b73dc5b8f616870730c834`**:
verified upload → configure Boolean/datetime/string → Execute
`1788842371892-9541qe3o4un:343:1` → полный выход 3×3 → возврат к сценарию.
Independent source/output audit PASS, все девять значений проверены, в том числе
`2024-02-29T23:59:58.123`, `2000-01-01T00:00:00.001`, true/false и Null.
Все десять подмен отвергнуты; повтор ID без браузера, process 7897 exit 0.
Production не менялся. Client **763 PASS, 1 SKIP** (`typed-client-tests.txt`),
import evidence **109 PASS** (`typed-evidence-tests.txt`), diff check прошёл.

Источники Dock: Help `data/visualization/table/format.md` (только числа/даты
поддерживают форматирование), `data/integration/export/txt-csv/datetime-formats.md`,
E2E `testdata/wizards/imports/txt/Formats/BoolTrue.txt`, `BoolFalse.txt`.
Harness получил отдельный `--typed-fixture` (стандартный новый импорт).
Независимый аудитор проверяет сохранённую date mask по наблюдениям до Apply,
затем сравнивает источник, native rendered cell и типизированный результат.

Остаются остальные режимы/ошибки, single-column format commit, широкие/длинные
данные, header/skip patches, mappings, delivery, persistence/recovery,
полный public contract и финальный Hermes Sol/low. Весь scope 03 сохранён.
Typed diagnostic 55110 завершён через EOF, exit 0; его браузер закрыт.
Diagnostic 7127 остаётся на файловом хранилище TF-3, исходный импорт TF-1
с прежним несохранённым missing draft; старые snapshots/operations не повторять.

---

# Подплан 03 — отрицательная приёмка исчезнувшего файла, 8 сентября 2026

**in progress, source only; полный подплан не принят.**
Fixed-pin live `execute-1788841429141`, runtime
`9da71ef9d6a9062b0119689f2e3c55aa87a5167a89ada8d32e0154b69366e709`:
сначала upload/byte verification отдельного нового fixture; затем operator-only
удаление точно выбранного файла этого запуска; после этого полный новый
node.apply с настоящим прежним verified upload proof.
Результат AMBIGUOUS, pending configure, cause WIZARD_SOURCE_VALIDATION_FAILED,
execution not_requested, output not_refreshed, package_saved=false.
Повтор того же ID вернул результат без нового браузерного вызова. Exit 0,
приёмочный браузер закрыт. Это отказ, не успешно настроенный импорт.

Новый `import_source_error_evidence.py` независимо проверяет source SHA/size,
upload/download proof, runtime/session pin, порядок фаз и остановку configure,
исходный/конечный node binding и путь, ровно один Next, собственную ошибку,
отсутствие Execute/Done и неизменный результат повторной выдачи.
Все девять подмен реального журнала отвергнуты. Синтетический suite дополнительно
проверяет 12 повреждений. Import evidence 107 PASS, procedure evidence 17 PASS
(`source-error-evidence-tests.txt`); последний client suite 759 PASS, 1 SKIP
из предыдущего increment, клиентский код в этой итерации не менялся.

Harness `node-import-done-live.mjs --missing-source --execute --read-output`
использует только свой свежий fixture и exact selection guard перед удалением.
В историческом summary этого run `output_read:true` означало requested flag;
доказательство истины — result/output not_refreshed. Harness исправлен:
output_requested отдельно, output_read=false для ожидаемого отказа.

Ручной diagnostic 7127 остаётся открытым на файловом хранилище TF-3,
`/user/dock-p3`. При исследовании delete dialog нажато «Нет»; файл
`diagnostic-20260907.csv` не удалялся. Исходный импорт TF-1 содержит прежний
несохранённый missing draft. До следующего обращения к узлу выбрать исходную
вкладку и заново проверить prepared document/workflow/node; старые snapshots
и операции не повторять. Обработчик восстановления после отказа не принят.

Далее другие ошибки/типы/header/skip/mappings, доставка внутри node.apply,
persistence/recovery, полный public contract и финальный Hermes Sol/low.
Production не менялся; весь scope подплана сохранён.

---

# Подплан 03 — ошибка отсутствующего источника, 8 сентября 2026

**in progress, source only; полный подплан не принят.**
Добавлено адресное `wizard.source_validation`: только один видимый error icon
в точном поле источника текущего мастера, при доступном btnError. Текст читается
как данные из Ext icon (его ul/li не имеет layout), без интерпретации HTML.
Скрытые, чужие и неоднозначные ошибки не служат подтверждением отказа.
После одного Next одинаковая ошибка подтверждается ещё одним чтением;
возвращается `WIZARD_SOURCE_VALIDATION_FAILED`, AMBIGUOUS/effect_possible=true.
Автоматического повтора Next, Done или Execute нет. node.apply сохраняет
ограниченную cause в NODE_APPLY_STOPPED; остальные raw receipt данные не копируются.

Живой diagnostic `source-validation-new-path` в
`.dock/text-import-v3/live-1788831557489/` подтвердил отказ для нового пути
`/user/dock-p3/Dock03-missing-1788841151511.csv`: один Next,
ошибка через 784 ms, cleanup_complete=true, stage остался text_import_file.
Это диагностический channel, не fixed-pin целый node.apply acceptance.
Чтение текущей ошибки отдельно подтверждено `source-validation-observe-2.json`.
Два затронутых suite: **252 PASS**, включая шесть новых проверок.

Ранее в этой же сессии был native диалог восстановления связи. Один Restore
сохранил document/workflow/node GUID и незавершённый format draft (Null NA).
Это ручная диагностика, не приёмка product recovery. Raw rect скрытых полей
не доказывает текущую страницу; использовать stage адресного наблюдения.

Checkpoint: diagnostic 7127 открыт, source page с указанным missing draft;
исходный существующий путь `/user/dock-p3/Dock03-done-1788818551607.csv`.
Операцию `source-validation-new-path-1:n6` повторять нельзя. Следом независимый
негативный audit полного node.apply, другие ошибки/типы/mappings/delivery,
persistence/recovery и финальный Hermes Sol/low. Production не менялся.

Общий client suite: **759 PASS, 1 SKIP**, `source-validation-client.txt`;
`git diff --check` прошёл. Python evidence в этом изменении не запускался.

---

# Подплан 03 — другой файл и новая схема, 8 сентября 2026

**in progress, source only; полный подплан и выпуск не приняты.**
Existing import поддерживает смену verified файла с другой схемой. Настройки
существующих полей сопоставляются по имени, не по прежнему индексу. Для нового
поля требуются явные name/label/type/data_kind/used; неизвестное поле без полного
задания свойств отклоняется. Незапрошенное изменение схемы отклоняется.

Выходная схема читается отдельно: native auto-sync сохраняет порядок старых
выходов и добавляет новые в конец. Обработчик сохраняет этот порядок и проверяет
полное взаимно-однозначное соответствие имён/меток/типов/видов и отображённых
source bindings; Table reader получает проверенный порядок выходов. Это по-прежнему
ограниченный identity mapping reader, не готовый общий mapping handler.

Fixed-pin приёмки source bytes/upload → seed Execute → existing source patch →
новый Execute/read/возврат в сценарий:

- Другой CSV с прежними полями: `execute-1788839672608`, runtime
  `b770d908…86f9ac`; independent audit 3 × 2 PASS, восемь подмен отвергнуты.
- CSV → TSV, порядок источника Title/Amount/Id/Extra, добавлено Extra:
  **`execute-1788840289954`**, текущий runtime
  **`a8199e5578637509bdf259d86a058464a558961c74bc7bb198e25fa73a6fc140`**.
  Independent audit 4 × 2 PASS. Порядок выхода остался Id/Title/Amount/Extra;
  вид Id сохранён «Дискретный», хотя автоопределение нового файла выставляло
  «Непрерывный». Проверены точные integer `9007199254740993` и `9007199254740995`.
- `independent-replacement-output-audit.json`: PASS;
  `independent-replacement-negative-audits.json`: 8 подмен отвергнуты;
  `independent-replacement-schema-negative-audits.json`: ещё 4 подмены
  округления integer, порядка выхода, незаданного вида Id и explicit типа Extra
  отвергнуты. Для seed и final сверяются **разные** independently supplied bytes.
- Execution IDs current run: `1788840294022-y2uamjfidk:418:1` и
  `1788840294022-y2uamjfidk:418:2`; повтор каждого operation ID без browser calls.
  Process `27110` завершён exit 0, браузер закрыт. Метрики в `phase-metrics.json`.
- Предыдущая такая же приёмка `execute-1788840171048` также прошла 12 negatives
  на runtime `bb52d998…369589`, до выделения helper и добавления index guard.
- Client **753 PASS, 1 SKIP** (`replacement-order-client.txt`), Python evidence
  **152 PASS** (`replacement-order-evidence-tests.txt`), diff check PASS.

Доставка двух файлов выявила две проблемы приёмочной подготовки: буферизованный
список не всегда отрисовывает строку нового файла; после upload список ещё меняет
epoch. Operator harness теперь ищет точную строку ограниченной прокруткой списка,
ждёт стабильного наблюдения и допускает только до двух новых read/verify попыток
после строгого NOT_APPLIED/no-effect `DOWNLOAD_CONTEXT_CHANGED`; сам upload не
повторяет. Эта подготовка не доказывает встроенную в node.apply доставку файла.
Не запускать такие upload fixtures одновременно в одной тестовой папке.

В client download добавлена безопасная диагностика причин отказа. Живой журнал
`execute-1788839590521` показал native reflow: max_top 1067 → 1068 при неизменных
файле/контексте/owner/scrollTop. Проверка допускает расхождение extent на один CSS
pixel; exact scrollTop, owner, target, directory и остальные guards сохранены.
Extent +1 разрешён unit test, +2 отклонён; успешная текущая приёмка подтверждает
полную цепочку проверки bytes, но не гарантирует, что именно +1 возник в этом run.
Отдельный live download существующего файла прошёл в diagnostic
`replacement-download-diagnostic-2.json`; новых узлов/Execute он не создавал.

Сохранены неуспешные попытки (**не PASS**):
`execute-1788838973395`, `1788838990191`, `1788839089978`, `1788839138786`,
`1788839218643`, `1788839399193`, `1788839413638`, `1788839590521` — upload/list/
reveal диагностика; `1788839765020` — новый Extra не был сопоставлен со схемой;
`1788839969757` — прежнее предположение о совпадении порядка source/output.
Все эти приёмочные процессы остановлены; браузеры закрыты.

Persistent diagnostic `7127` остаётся открыта. После просмотра storage и возврата
на package tab UI показал **source page** Import03 с исходным файлом
`/user/dock-p3/Dock03-done-1788818551607.csv` и draft Windows-1251. Последняя
проверка — `replacement-return-to-draft.json`; после source/format patch
Done/Execute не выполнялись. Не считать состояние мастера сохранённым пакетом.

Следом: ошибки файла/пути/формата, header/skip и удаление/переименование полей при
смене источника. Эти режимы ещё не приняты целиком. Остальной scope 03 — typed/
large output, общий mappings handler, delivery внутри операции, package save/
reopen/reexecute, long execution/recovery, публичный выпуск и финальный Hermes
Sol/low — сохранён. Production и установленный клиент не менялись.

---

# Подплан 03 — частичные source/format updates, 8 сентября 2026

**in progress, source only; полный подплан и выпуск не приняты.**
Исходная схема и формат existing import теперь читаются до изменения параметров
разбора. Для source patch мастер проходит source → format (baseline) → source →
format (изменения); это навигация внутри одного открытия, без повторного открытия
мастера. Для format/column patch baseline также фиксируется до первого изменения.
Таким образом, повторное автоопределение полей не становится незаметно исходной
схемой для проверки сохранности. Неизвестные поля/изменение количества полей
по-прежнему требуют дальнейшей реализации, а не считаются успешно сохранёнными.

Живая диагностика подтвердила Previous и комбинированный patch
`source.encoding=Windows-1251`, `format.null_marker=NA` при сохранении остальных
source/format/column properties. Fixed-pin цепочка seed Execute → этот patch →
новый Execute/read/возврат в сценарий прошла independent audit:
`.dock/text-import-v3/execute-1788838656571`, runtime
`6b538b16f1c9af748d5f4602caff0891b10fad7cc3e0ea0ed87d611afc300ea3`.
Выход 3 × 3 сверен с исходными bytes: прежнее Null теперь строка `NULL`, значения
чисел сохранены. Файл этого patch-прогона ASCII; приёмка разных кодировок с
не-ASCII текстом относится к отдельным прежним create-import прогонам.

- `independent-source-format-output-audit.json`: PASS.
- `independent-source-format-negative-audits.json`: 9 подмен bytes/target/request/
  output Null/незаданных source/format/type/отсутствующего возврата отвергнуты.
- Seed execution `1788838660526-fka80mop104:289:1`, final
  `1788838660526-fka80mop104:289:2`; повтор обоих operation IDs без browser calls.
- Процесс `8815` завершился exit 0, его браузер закрыт.
- Client **750 PASS, 1 SKIP** (`source-format-client.txt`), Python evidence
  **150 PASS** (`source-format-final-evidence-tests.txt`), diff check PASS.
- Прежний linked Table/existing audit `execute-1788838091682` повторно прошёл
  после обобщения patch auditor.

Independent patch auditor принимает optional source/format/columns, вычисляет
итоговые настройки из независимо известного baseline и patch, проверяет baseline
до любых изменений и полный final schema sweep. Возврат на source разрешается
только через наблюдённую `btnPrev` из format и наблюдённый source после нажатия.
Новые негативные тесты проверяют этот переход и сохранность незаданных свойств.
Никаких заявлений о package persistence или Hermes эта проверка не делает.

Diagnostic `7127` в `live-1788831557489` остаётся в открытом мастере Import03,
на format после `source-format-patch.json`, с draft Windows-1251 / NA;
Done/Execute после этого patch не запускались. Последний local operation ID
`source-format-patch-diagnostic`; не повторять его. Ранний diagnostic readiness
в `source-format-baseline` вернул строку вместо boolean и исчерпал read-only wait;
исправленный `source-format-baseline-2` подтвердил baseline/Previous без проблем.

Следом: другой verified файл, изменение схемы/разделителя/header/skip и ошибки
источника/формата. Остальной scope 03 (typed/large output, mappings, delivery,
package save/reopen/reexecute, long execution/recovery, публичный выпуск и
финальный Hermes Sol/low) сохранён и ещё не завершён. Production не менялся.

---

# Подплан 03 — возврат из Table и связанная следующая операция, 8 сентября 2026

**in progress, source only; полный подплан и выпуск не приняты.**
Private node.apply после чтения Table возвращается в исходный сценарий одним
наблюдённым нажатием на его breadcrumb. Перед нажатием проверяются native node,
view GUID и port GUID; после — тот же узел, активный порт и точный путь сценария.
Мастер не открывается и Execute не повторяется этим переходом.

Fixed-pin цепочка **verified bytes/upload → seed Execute/read → возврат →
existing partial label → Execute/read → возврат** прошла independent audit:
`.dock/text-import-v3/execute-1788838091682/`, runtime
`6313491fe43be085417768dba56f5e031845e895f01ed64528d6e066828091e3`.
Оба выхода 3 × 3 проверены по исходному файлу; разные Table GUID и execution IDs.
Повтор каждого operation ID не обращался к браузеру. Приёмочный процесс `57712`
завершился exit 0, его браузер закрыт. Production и установленный клиент не менялись.

- `independent-existing-output-audit.json`: PASS.
- `independent-existing-negative-audits.json`: 10 подмен отвергнуты.
- `independent-table-return-negative-audits.json`: ещё 10 подмен Table/node/path/
  execution flag/отсутствующего proof для обеих операций отвергнуты.
- `phase-metrics.json`: seed 148 шагов / 50 подтверждённых мутаций,
  existing 131 / 39, всего 635 browser calls.
- Seed execution `1788838095696-58g0l246kwu:287:1`, existing execution
  `1788838095696-58g0l246kwu:287:3`. Между ними Loginom зарегистрировал отдельное
  выполнение визуализатора; оно включено в baseline следующего импорта.
- Client suite **750 PASS, 1 SKIP** (`table-return-final-client.txt`),
  Python evidence **146 PASS** (`table-return-all-evidence-2.txt`), diff check PASS.

Живой UI подтвердил numbered `ViewerCard-1` / `BrowseView-1` и `-2`.
Обработчик допускает только цифровой суффикс при сохранении native descriptor /
port panel binding. Новая Table готова к входу только после появления её собственной
кнопки `enter_table` и двух одинаковых наблюдений epoch/native table inventory;
общие pre-gesture epoch guards и лимит строгих no-effect refresh не ослаблены.
Независимый verifier отдельно принимает отсутствие нового процесса **до** его
первого появления; появление нескольких новых групп или исчезновение уже
опознанной группы по-прежнему отвергается. Для right-click native console grid
изменяемый текст строк не подменяет identity grid/panel/process root/node;
действия по конкретным строкам и меню сохраняют обычную проверку label.

Сохранены неуспешные fixed-pin попытки, они **не PASS**:
`execute-1788837508743` — неизвестный suffix второй карточки;
`execute-1788837909769` — native descriptor появился раньше кнопки входа.
Диагностика `live-1788831557489`, process `7127`, остаётся открыта на графе
Import03 после `third-table-return.json`; узел активен. В сессии уже три Table,
последняя `7f5afbbb-3d3d-4ff3-add8-3a9d812899d7`, port
`58f7e6c3-511e-39d7-8853-036e0a1a7612`. Это mixed diagnostic, не fixed-pin acceptance.
Не повторять её прежние operation IDs или Execute без новой цели.

Следующий участок: независимая проверка partial source/format updates и ошибок
источника/формата, затем оставшиеся обязательства канонического 03: типы/границы
данных, mappings, delivery, package save/reopen/reexecute, long execution и recovery,
публичный контракт/сборка и финальная автономная приёмка Hermes Sol/low.
Полный 03, persistence и Hermes не приняты; goal остаётся активной.

---

# Подплан 03 — связанное обновление существующего импорта, 8 сентября 2026

**in progress, source only; полный подплан и выпуск ещё не приняты.**
Fixed-pin прогон `execute-1788836470480` прошёл независимый аудит всей цепочки:
verified upload → seed Execute → existing target того же GUID → deactivation →
только label последнего поля → новый Execute → полный малый выход 3 × 3.
Runtime SHA `ab249748a33d448b0a9e7ae7421e5c80823fdc55a6e9ed578484d81d2cf7ee9e`.
Seed execution `1788836474517-wpkcohr4pr8:279:1`, новый
`1788836474517-wpkcohr4pr8:279:2`. Источник/формат/типы/виды/used/остальные поля
сохранились; Amount.label = «Обновлённая сумма». Повторы seed и конечного ID
не вызывали browser. Пакет не сохранялся и Hermes не запускался.

`existing_import_evidence.py` связывает точные задекларированные requests с
журналом, seed checkpoint с existing GUID, один session/runtime, native opening,
полную начальную/конечную схему, источники и свежий output. Для existing без
мутаций графа проверяется complete final_graph, а не отсутствующий last_graph.
`independent-existing-output-audit.json` — PASS;
`independent-existing-negative-audits.json` — 10 отрицательных случаев отвергнуты.
Среди них обнаружена и исправлена слабость output verifier: теперь execution ID
самого checkpoint обязан совпадать с новым процессом, даже если его port ID верен.
Добавлен регрессионный тест; прежний public output audit не принимает override
settings, внутренний вариант используется только после independent patch proof.

Для последовательных операций исправлен возврат из Show Node: штатная команда
оставляет обзор узла, поэтому после owner verification и закрытия Console
драйвер нажимает наблюдённый breadcrumb родительского сценария. Проверяются тот
же native node/package/workflow и полный путь; повторного Execute нет. После
этого declared navigation click допускает ограниченное ожидание перерисовки
контроллера, сохраняя строгий отказ на foreign identity.
Node procedure теперь адресно читает graph или NavigationPanel, сохраняя
fixed global guards. Это устранило зависимость от длинного списка файлов в
другой вкладке. readNavigation сохраняется при строго pre-gesture refresh.

Неуспешные fixed-pin итерации сохранены без PASS:
`execute-1788835943850` — seed выполнился, existing target отказал из-за node
breadcrumb; `execute-1788836123914` — global UI scan limit до открытия seed;
`execute-1788836252282` — parent breadcrumb ещё не выдавался как UI control;
`execute-1788836368265` — один навигационный click, затем временный native surface.
Каждая причина исследована по фактическим receipts; неизвестные жесты не повторялись.
Их браузеры завершены, последующий успешный прогон был новым отдельным тестом.

Harness node-import-done-live.mjs получил `--existing-patch`: seed Execute без
чтения, затем отдельный полный existing Execute/read с одним частичным изменением.
Вариант --edit-fields вместе с ним запрещён, чтобы не смешивать исходную и новую
правку. Wide 66 на том же runtime также принят: `execute-1788836664324`,
`independent-existing-output-audit.json` PASS, все 66 полей × 2 строки (132 значения).
Seed execution `1788836668213-t6cag2dadk:281:1`, новый
`1788836668213-t6cag2dadk:281:2`; повтор ID не вызвал browser. Независимый аудитор
сохраняет доказанную полную исходную схему до редактирования, даже когда затем
обработчик повторно читает отдельные страницы/прокручивает поле. Регрессионный
тест добавлен. Десять подмен wide journal также отвергнуты.
Процесс 92107 завершён exit 0, его браузер закрыт. Никакого ожидания не осталось.
Метрики сохранены в обоих run-dir: `phase-metrics.json`. Малый прогон — seed 95
и existing 128 внутренних шагов, 477 browser calls всего; широкий — seed 448 и
existing 1359 шагов, 3808 calls всего. Это внутриоперационные вызовы; их нельзя
представлять как число внешних вызовов Hermes или как его токены.

Проверки: client **736 PASS, 1 SKIP** (737 tests),
`existing-full-client.txt`; Python evidence **141 PASS**,
`existing-all-evidence-tests.txt`; `git diff --check` PASS.
Диагностика **7127** по-прежнему в source wizard неактивного Import03; это другая
сессия, её не использовать как state запущенного wide harness.
Следом: обеспечить композицию после Table (возврат к
сценарию после read ещё не подключён), remaining source/format/types/error corpus,
custom mappings, единая доставка, intermediate/final save/reopen/reexecute,
recovery, карточка и окончательная Hermes Sol/low. Полный scope 03 сохранён.
Production/установленный клиент не менялись. Коммита нет.

---

# Подплан 03 — открытие существующего узла с деактивацией, 8 сентября 2026

**in progress, source only; полный existing node.apply и подплан ещё не приняты.**
Новый node-wizard-open.mjs открывает настройки подготовленного native GUID через
begin_wizard и при необходимости confirm_wizard_deactivation. Настройка existing
импорта использует этот путь; new сохраняет прежний open_wizard. Новые жесты
требуют prepared node binding и входят в runtime hash через session.mjs.

Нативный вопрос имеет строго разные кнопки: yes = «Да», no = «Да, больше не
спрашивать», cancel = «Нет». Автоматизация выбирает только yes после сверки
пакета/сценария/GUID, исходного settings control, точного вопроса, pending owner
и принадлежности всех трёх кнопок диалогу. После ответа подтверждается мастер
того же узла. Настройки и выполнение этим открытием не подтверждаются.

Живое наблюдение установило промежуточное состояние: breadcrumb уже содержит
Import03 > Настройка, но мастер отсутствует и остаётся native graph surface.
Добавлен wizard_pending_owner, который не объявляет мастер открытым. Фоновая
маска принадлежит конкретной вкладке MF;TF-1; её target_tid сохраняется отдельно.
Pager и независимое сравнение raw/delivered evidence сохраняют pending owner.
При graph → wizard между двумя чтениями после одного begin/confirm драйвер
отбрасывает смешанный снимок и допускает до двух повторных чтений того же GUID;
это не повтор жеста и не разрешение сменить пакет/узел.

Evidence `.dock/text-import-v3/live-1788831557489/`:
- `deactivation-open-3.json`, operation deactivation-open-diagnostic-3:
  открытие настроек активного Import03 → точный вопрос → обычное «Да» → мастер;
  `independent-deactivation-open-audit.json` PASS.
- `inactive-open.json`, operation inactive-open-diagnostic:
  открытие того же узла после Done без вопроса;
  `independent-inactive-open-audit.json` PASS.
- `independent-deactivation-negative-audits.json`: шесть подмен отклонены
  (отключение будущих вопросов, чужой GUID/pending owner/mask, вопрос/open trace).
- Неуспешные диагностики сохранены: первый open не имел выбранного graph body
  и остановился без жеста. Второй открыл вопрос, но отказал на ещё не учтённом
  pending breadcrumb. Отдельное подтверждение вопроса совершило один click,
  затем обнаружило смешанное graph/wizard чтение. Мастер был считан отдельно,
  открытие/подтверждение не повторялись вслепую. После исправления проведён новый
  полный успешный прогон на снова активированном узле.

Новый wizard_open_evidence.py независимо проверяет последовательность opening,
связь исходного control с вопросом, native GUID и окончательный wizard owner.
Python evidence **139 PASS**. Итоговый client suite: **732 PASS, 1 SKIP**
(733 tests), `.dock/text-import-v3/deactivation-full-client.txt`.
`git diff --check` и syntax check нового модуля — PASS.

Границы: всё это Codex source diagnostics с обновлением модулей между этапами;
не fixed-pin полный node.apply и не Hermes. Package persistence не проверена.
Source/format sparse patches, custom mappings, доставка внутри операции,
сохранение/reopen/reexecute и recovery остаются в полном scope 03.
Production/установленный клиент не менялись, коммита нет.

Точка продолжения: процесс **7127** жив, **source wizard Import03** открыт после
успешного inactive-open. Узел сейчас неактивен, Amount.label = «Сумма» сохранена
предыдущим Done. Последняя активация была только setup для deactivation-3;
после неё подтверждение снова деактивировало узел, затем выполнены Done и open
без вопроса. Не повторять Execute без новой цели. ctx.tableChannel соответствует
inactive-open-diagnostic; ограниченный deadline не переносить на новый участок.
Следующий обязательный шаг: fixed-pin harness с seed Execute → existing partial
node.apply → новый Execute/output и независимый audit всей цепочки.

---

# Подплан 03 — частичное изменение существующего импорта, 8 сентября 2026

**in progress, source only; полный подплан и fixed-pin existing node.apply ещё не приняты.**
Добавлены validateTextImportPatch, mergeImportColumnPatch и configureTextImportPatch.
Для existing target допускается неполный settings: незаданные source/format
не записываются; columns сопоставляются с полной наблюдённой схемой по name или
source_name. Сохраняются порядок, остальные поля, тип, вид, метка и used.
Неизвестное поле, повтор identity и коллизия конечного имени отвергаются.
Отсутствующий source_path сверяется с точным verified upload destination;
сама квитанция требует явный корректный путь даже при неполном запросе.
Параметры caller не изменяются. Сохранность незаданных format проверяется также
после редактирования колонок. Для нового узла остаётся полный контракт.

Живая диагностика в `.dock/text-import-v3/live-1788831557489/`:
- `existing-patch-run.json`: только Amount.label = «Сумма», 33 внутренних шага,
  исходные Id/Title, типы/виды/used, источник и формат сохранились.
- `independent-patch-draft-audit.json`: PASS. Новый import_patch_evidence.py
  использует заданный оператором полный исходный контракт и native observations
  до/после правки; summary обработчика не является доказательством.
- `existing-patch-done.json`, `existing-patch-reopen.json`: отдельное Done и QA
  reopen того же GUID подтвердили применённую метку и остальные настройки.
- `independent-patch-roundtrip-audit.json`: PASS, settings_saved_verified=true;
  `independent-patch-roundtrip-negative-audits.json`: отвергнуты все 8 подмен
  (метка, чужой тип/формат/GUID/session, потеря finish/open proof, порядок операций).

Границы: диагностические модули обновлялись в живой сессии; это **не fixed-pin
полный existing node.apply** и не autonomous acceptance. Деактивация перед
правкой подтверждена вручную в ранее описанной диагностике. Bound автоматическое
подтверждение ещё отсутствует; source/format patches требуют отдельных live
проверок. Аудитор пока принимает только columns patch. Пакет не сохранялся,
после patch узел не выполнялся, Hermes не запускался. Production не менялся.

Проверки: focused client **29 PASS**; Python evidence **133 PASS**
(`patch-focused-tests.txt`, `patch-all-evidence-tests.txt`). Полный client на итоговом коде: **728 PASS, 1 SKIP** (729 tests),
`patch-full-client.txt`; `git diff --check` PASS.

Точка продолжения: процесс **7127** жив; после Done + QA reopen открыт
**format wizard Import03**, метка Amount уже «Сумма». Узел деактивирован;
не повторять Execute или прежний patch. `ctx.tableChannel` относится к
`existing-patch-done-qa`, его deadline ограничен; для нового участка создать
отдельный channel/operation ID. `ctx.patchedImport` — старый draft receipt.
Следующий участок: bound deactivation и fixed-pin existing node.apply acceptance,
затем remaining типы/ошибки/mappings, единая доставка, package save/reopen/reexecute,
recovery и финальный Hermes Sol/low. Все требования канонического 03 сохранены.

---

# Подплан 03 — исходные параметры существующего импорта, 8 сентября 2026

**in progress, source only; existing patch ещё не подключён.**
В живом Loginom воспроизведено открытие ранее выполненного Import03.
Подтверждение деактивации использует `msgbox;tlb;yes` = «Да»,
`no` = «Да, больше не спрашивать», `cancel` = «Нет». Нельзя переиспользовать
семантику кнопок Close или отключать предупреждение. Добавлен регрессионный
тест, запрещающий принять этот вопрос за отмену черновика.

После обычного «Да» обнаружено раннее состояние мастера: path и UTF-8 уже
заполнены, rows_to_skip ещё пусто, first_line_as_title временно false. После
инициализации сохранённые значения — 0 и true. Новый isTextImportSourceReady
в text-import-procedure требует все пять наблюдённых полей, непустые connection/
encoding и числовой rows_to_skip; пустой путь нового узла остаётся допустимым.
Private openWizard использует это условие перед чтением исходных параметров.

Evidence в `.dock/text-import-v3/live-1788831557489/`:
`existing-setup-configure.json`, `existing-setup-execute.json`,
`existing-deactivation-probe.json`, `existing-deactivation-confirm.json`,
`existing-source-settled.json`, `source-readiness-evidence.json`.
Последний проверяет реальную раннюю/завершённую пару через новый predicate:
earlyReady=false, settledReady=true. Это диагностика, не автономный existing
node.apply и не пакетное сохранение. Execute в диагностике был нажат один раз;
полное execution/output здесь отдельно не аудировалось.

Проверки: focused **27 PASS**, полный client **723 PASS, 1 SKIP** (724 tests),
`existing-source-focused-tests.txt`, `existing-source-full-client.txt`;
`git diff --check` PASS. Production/установленный клиент не менялись.

Точка продолжения: процесс **7127** жив, тот же prepared document/node,
**теперь открыт source wizard существующего деактивированного Import03**.
Обычное «Да» уже нажато; не повторять Execute/открытие. Полный исходный снимок
сохранён в `ctx.existingSourceBaseline` и перечисленном evidence. Старые записи
«7127 на графе, узел не выполнялся» ниже исторические. Следующий кодовый участок:
отдельный bound deactivation flow (без ослабления прежнего open_wizard), затем
partial settings: только явно запрошенные изменения, baseline полного источника/
формата/схемы и independent preservation verifier. Непредоставленный source_path
следует сверять с verified upload destination, не подставлять как команду смены
файла. Полный 03 сохраняет все прежние обязательства сохранения/recovery/Hermes.

---

# Подплан 03 — отмена черновика и headerless import, 8 сентября 2026

**in progress, source only; полный 03, persistence и Hermes не приняты.**

Новый `node-wizard-close.mjs` подключён к private `node.apply.finish=close`.
Он читает подготовленный мастер, нажимает его Close один раз, наблюдает отдельное
подтверждение и отвечает typed `confirm_wizard_close` только при совпадении
native node/document/workflow, root/stage/owner path, точного вопроса и кнопок
Да/Нет того же dialog. Разрешён только фоновой mask собственного мастера.
Подтверждение не распространяется на иные окна, загрузку или другие узлы.
При закрытии без вопроса драйвер проверяет возвращение того же узла; независимая
приёмка ниже охватывает путь с подтверждением у нового изменённого импорта.

`workspace-ui` отдельно проверяет возвращение исходного графа после одного
подтверждения. Переход wizard → graph того же native GUID между двумя чтениями
отбрасывает смешанный снимок и допускает до двух повторных чтений. В успешном
живом прогоне эта ветка выполнилась один раз. Это не повтор жеста.
`node-procedure` читает portal подтверждения по его наблюдённому ref и сохраняет
binding в журнале. Независимый sequence verifier проверяет вопрос, mask/owner,
связь кнопок и допускает только typed affirmative cancellation.

Close возвращает execution=not_requested, output=not_refreshed,
configuration.status=discarded, checkpoint_kind=local_node_cancellation;
settings_applied=false и draft_discarded=true проверяются в фазе finish.
Done/Execute сохранили прежнюю семантику. Источник и identity output mapping
в этом кандидате по-прежнему полностью задаются; sparse existing updates,
all-unused fields и пользовательские mappings ещё не приняты.

**Независимые fixed source live audits:**
- Headerless CSV: `execute-1788831678853`, runtime `cfe11dc6…5b46`,
  execution `1788831682683-xhl4fpajk7:259:1`; 3 поля × 3 строки, PASS.
  Реальный новый мастер создаёт COL1/COL2/COL3. Harness передаёт source_name,
  переименовывает их в Id/Title/Amount; аудитор не отбрасывает первую data row.
- Close: `close-1788832782412`, runtime
  `341914d7714e3241f1ca1d7215047fbf3dd5e419aeb76bd79320390109be6f36`,
  `independent-close-audit.json` PASS. Связаны verified upload/source bytes,
  draft configuration/mapping, Close, exact confirmation, original node graph
  и отдельный QA source roundtrip. Все пять исходных параметров нового узла
  совпали после инициализации reopened wizard, source_path снова пустой.
  Повтор ID не вызвал браузер; Execute/чтение выходов не выполнялись.
  Пять отрицательных аудитов отклонили подменённый источник/GUID, неинициализированный
  reopen, отсутствующий cancel trace и ошибочный checkpoint applied.
- Headerless Execute на последнем runtime
  `45e6ecaf8c7e8ec1ec61db8142e1fe00643da4942970b88cc8c274e9642b8ae2`:
  `execute-1788833068233`, execution `1788833072152-j9hiul6tizh:269:1`,
  independent output audit PASS. Verified bytes/upload → COL rename/type/settings
  → новое выполнение → все 9 ячеек; replay без browser calls.
  Исправлено чтение открытия Console: когда Console отсутствует, используется
  точная основная панель инструментов вместо полного интерфейса со списком файлов.

QA reopen выполняется harness только после Close и проверки повторного ID,
отдельно от node.apply. Его ожидание проверяет инициализацию connection/codepage/
rows controls перед снимком. Это не пакетное сохранение и не полный roundtrip
существующего настроенного импорта. Текущий Close audit ограничен новым узлом;
существующий импорт требует отдельного baseline настроек/выходов.

**Неуспешные попытки не объявлены PASS:**
- Диагностический `close-driver-diagnostic` увидел вопрос вне выбранного root;
  добавлено адресное чтение portal перед распознаванием текста.
- `close-driver-confirmation-recovery` подтвердил закрытие, но generic click
  не перенёс переход поверхности; добавлен typed confirm_wizard_close.
- `close-1788832487560`: после Да native surface сменилась во время чтения;
  исправлено bounded read-only rediscovery того же узла.
- `close-1788832654832`: сам Close прошёл, но первый независимый audit не принял
  QA reopen до заполнения полей. Ожидание и проверка полного набора пяти полей
  исправлены; первоначальный failed audit сохранён.
- `execute-1788832897557`: после клика btnProgress достигнут UI_SCAN_LIMIT/work
  в data_views. Изменён root чтения Console; исходная операция не повторялась.
- В старом процессе 2745 попытка подтвердить ранее открытый Close была отклонена:
  тот же DOM dialog уже показывал «Восстановление сессии / Обнаружен разрыв связи».
  `close-existing-binding-debug.json` сохранил этот факт, посторонний вопрос
  не подтверждён. Процесс 2745 затем штатно закрыт (terminal exit 0).

**Проверки:** client **721 PASS, 1 SKIP** (722 tests),
`close-toolbar-full-client.txt`; все Python `test_*evidence.py` **125 PASS**,
`close-evidence-tests.txt`; `git diff --check` PASS. Новые tests проверяют
контракт Close, неверные dialog/node/mask, one-click cancellation, source
roundtrip, no-header first row и адресное чтение Console.

**Точка продолжения:** процесс **7127**, каталог `live-1788831557489`,
prepared document `1788831561418-ie6zeq98eb`, node
`e95626d6-7166-44fb-babf-d1bc0948185c` Import03. Последний read-only
`final-diagnostic-state.json`: мастер закрыт, граф виден; этот диагностический
узел не выполнялся. Процессы **7642** и **76234** ранее сохранялись отдельно;
их серверную сессию/состояние надо заново проверить перед использованием.
Все fresh acceptance browsers выше закрыты. Изменения не закоммичены,
production/установленный клиент/public catalog не менялись.

Осталось для полного 03: preserving sparse existing settings и deactivation,
Boolean/DateTime и precision extremes/ошибки, общие mappings, доставка одним
вызовом, intermediate save и final save/close/reopen/reexecute, status/wait/stop,
reconcile/resume/browser loss, публичный контракт/карточка и финальный автономный
Hermes openai-codex / gpt-5.6-sol / low с независимым аудитом всей цели.

---

# Подплан 03 — кодировки и пустой результат, 8 сентября 2026

**in progress, source only; полный 03 и выпуск ещё не приняты.**
Текущий private handler выбирает кодовую страницу через наблюдённый штатный
picker, проверяя итоговую метку в том же поле. Поддержаны явные UTF-8,
Windows-1251, Windows-1252, UTF-16 LE и UTF-16 BE; неизвестные кодировки
отклоняются до изменения UI. Числовой ввод «1251» сам по себе не подтверждает
выбор: в живом мастере он оставался необработанным текстом. Native picker
подтверждён в `live-1788824197802/source-encoding-pick.json` и E2E textimport.ts.
Независимый аудитор декодирует исходные байты собственной таблицей кодировок.

Принятые отдельные fixed-pin source прогоны (каждый 3 поля):
- Пустой UTF-8, 0 строк: `execute-1788829890610`, runtime `010f8ca8…35f00`,
  execution `1788829894426-jiyurfj7xx8:243:1`, independent output audit PASS.
- Windows-1251, 3 строки с «Строка;Ёж»: `execute-1788830362768`,
  runtime `e6281f58…4267`, execution `1788830366897-3h06vvbb8jh:245:1`,
  independent output audit PASS.
- UTF-16 LE без BOM, те же 3 строки: `execute-1788830676083`, тот же runtime,
  execution `1788830679936-2rvoqa0xi3n:247:1`, independent output audit PASS.
- UTF-16 BE без BOM: `execute-1788830921313`, runtime
  `c06054fc32d76d5767b4f7cfdd6de13fd076dc29f377c1b6727ced26b01d87f7`,
  execution `1788830925238-c8chvzfx0nc:251:1`, independent output audit PASS.
  На этом runtime устранена гонка закрытия окна, описанная ниже.
- Windows-1252, 3 строки с «Ångström;été»: `execute-1788831004124`,
  runtime `c06054fc…87f7`, execution `1788831008035-1tn38lyh084:253:1`,
  independent output audit PASS.
Все прогоны проверили verified upload → configuration → новый Execute →
Table output и повтор завершённого ID без browser calls. Каждый браузер закрыт.
Полные журналы и `independent-output-audit.json` находятся в указанных
каталогах `.dock/text-import-v3/`. Это не persistence/reopen/Hermes evidence.

Неуспешные попытки сохранены без PASS:
- `execute-1788829734063`: до upload общий список файлов превысил scan work.
  Harness теперь проверяет точный NavigationPanel назначения, а не все файлы;
  после upload проверка конкретного файла и SHA/bytes сохранена.
- `execute-1788830753242`: UTF-16 BE настроен и выполнен, но Filter modal
  исчез между roots и адресным чтением (`browser-333/334.json`, UI_ROOT_STALE).
  `node-procedure` теперь допускает максимум два повторных read-only root discovery
  только для NOT_APPLIED/workspace.observe/observing, effect_possible=false,
  cleanup_complete=true и неизменного контекста. Жесты не повторяются.
  Новые journal events проверяет независимый sequence verifier. В последующем
  успешном BE прогоне refresh не понадобился; сама ветка покрыта source tests.

Проверки: client **716 PASS, 1 SKIP** (717 tests,
`encoding-root-full-client.txt`); import evidence **81 PASS**, procedure **16 PASS**.
Добавлены non-ASCII/wrong-codec tests и проверки подмены поля/неприменённого
выбора кодировки, bounded root rediscovery и отказа при возможном эффекте.

Точка продолжения: процесс диагностики **2745** теперь открыт в source wizard
с черновым выбором Windows-1251; первоначальный узел деактивирован после явного
«Да» в штатном подтверждении настройки. Старые записи «2745 на Table» ниже
исторические. **7642** — wide Table, **76234** — прежний small Table; перед
использованием проверить доступность. Не повторять их Execute вслепую.
Production/установленный клиент/public catalog не менялись; изменений в Git
не фиксировали. Остаются все незакрытые требования канонического 03:
CSV/TSV/header/skip/error corpus, остальные типы и точность, Close/existing
parameters, mappings, объединённая доставка, сохранение/reopen/reexecute,
восстановление и финальная автономная приёмка Hermes Sol/low.

Дополнение — TSV, skip и decimal comma:
- Реальное скачивание `.tsv` подтверждено отдельной диагностикой
  `live-1788826828762/tsv-download-diagnostic.json`: 102 байта, полное совпадение
  с исходником и SHA. Процесс **7642 теперь на файловом хранилище /user/dock-p3**,
  прежний wide Table остаётся в другом табе. Не считать его текущим экраном.
- `makeArtifactDownloadCode` расширен с `.csv` на `.csv`/`.tsv`, сохранив
  exact file ref/name/destination, download event, size/SHA, grant и cleanup guards.
  Пакеты, архивы и суффиксы вроде `.tsv.lgp` по-прежнему отклоняются.
- `execute-1788831149450` остановился после upload, до download verification:
  старое CSV-only ограничение. Никакого PASS или завершения transfer ему не присвоено.
- Новый `execute-1788831312928`: TSV, две пропущенные строки перед заголовком,
  quoted tab, decimal comma, Null/empty, 3 поля × 3 строки; independent output
  audit PASS, execution `1788831316747-biozutlozui:257:1`, replay без browser calls.
  Source runtime `cfe11dc6494d7e79a992dc974ac2a675d6799029ff08f9db82cd564c268f5b46`.
  Harness: `--execute --read-output --tsv --rows-to-skip 2 --decimal-comma`.
- Последние проверки: client **717 PASS, 1 SKIP** (718 tests, `tsv-full-client.txt`),
  Python все `test_*evidence.py` **122 PASS** (`tsv-evidence-tests.txt`), в том числе
  import evidence 82 и procedure 16. `git diff --check` PASS.
- Все fresh acceptance processes завершились, браузеры закрыты. Независимые
  диагностические 2745/7642/76234 сохраняются отдельно. Следующий участок —
  отсутствие заголовка, дополнительные типы/ошибки и оставшиеся требования 03.

---

# Подплан 03 — независимая проверка связанного выхода, 8 сентября 2026

**in progress, source only; полный 03 и выпуск ещё не приняты.**
Приватный handler revision `text-import-output-v1` допускает Execute с чтением
единственного data output 0 (или прежний пустой список). После нового завершённого
процесса с подтверждённым владельцем он создаёт новую Table native порта,
настраивает форматы, отключает filter, включает Null/type icons, читает страницы
и возвращает схему/row count/до 10 строк. Read phase записывается как потенциально
изменяющая состояние, поскольку создаёт и настраивает визуализатор. Done по-прежнему
не читает и не запускает выход. UTF-8 и identity mapping остаются границами.

`table-output-values.mjs` сверяет configured schema с Table и format proof.
Integer сохраняется десятичной строкой, без округления JSON number; real содержит
binary64 value, каноническую decimal строку и исходный display text после проверки
17-significant-digit mask. Null и empty не смешиваются. Неподтверждённое число
отклоняется при require_exact_numbers; иначе возвращается display text с явным
ограничением. DateTime/Boolean/Variant сейчас возвращаются только как formatted
text с precision=unverified, а строка — как cached display text с явным ограничением
проверки полноты источника. Специальные real, экстремальные числа/даты/длинные строки
и эти дополнительные типы требуют собственных live cases перед полной приёмкой.

`import_output_evidence.py` независимо связывает прежние source/upload/format
и process verifiers с new Table creation, native output 0, formatted field readback,
filter=false, полным набором native страниц и typed checkpoint. Сравнивает CSV
значения, большие integer строки и binary64 real; summary handler не заменяет
наблюдения. Поддержанный audit fixture parser: UTF-8 CSV, integer/real/string/Null.
Полный многорежимный corpus ещё нужен. Native node owner проверяется как в Table
binding, так и в каждой data page. Table dialogs в общем sequence verifier теперь
допускаются только с точной связью с активным Table; посторонние dialogs блокируются.

**Fixed-pin live acceptance на неизменном source runtime**
`010f8ca8108208221a9f1b5e0d4d5a8bcd7fb9b43b757249ab2b7a0e04e35f00`:
- `.dock/text-import-v3/execute-1788829061870`: 3 поля × 3 строки,
  `independent-output-audit.json` PASS. Execution ID
  `1788829066109-tofm1xq73t:239:1`. Проверены quoted delimiter, empty, Null,
  положительная дробь, отрицательная дробь, ноль и integer; replay без browser calls.
- `.dock/text-import-v3/execute-1788829365991`: 66 полей × 2 строки,
  `independent-output-audit.json` PASS, 1367 внутренних шагов; execution ID
  `1788829370272-onf7n5z5lpa:241:1`. Полный source/configuration/new execution/output
  chain, 132 ячейки, offscreen format/data pages, replay без browser calls.
  Browser закрыт штатно после каждого приёмочного harness run.
- Harness: `node-import-done-live.mjs --execute --read-output`, для wide
  дополнительно `--columns 66`; явные account `user`, storage `/user/dock-p3`,
  Loginom `http://logi-test-plan.bg.local/app/?testable=true`.
  Никаких Hermes/model runs, package persistence или final reopen эти прогоны
  не доказывают. У verifier journal_authentication_verified=false: он проверяет
  содержимое локального аутентифицированного журнального канала, не криптографическое
  происхождение произвольного переданного файла.

Client **707 PASS, 1 SKIP** (708 tests),
`.dock/text-import-v3/typed-output-full-client.txt`.
Python import evidence **79 PASS**, procedure evidence **15 PASS**:
`typed-import-evidence-tests.txt`, `typed-procedure-evidence-tests.txt`.
Проверяются отсутствующие/чужие данные, старый Table, чужой execution/port/node,
округление integer, Null/empty, незакрытый filter, отсутствующие formats и мутация
после фильтра. Source preflight `typed-output-preflight.json`, runtime указан выше.
`git diff --check` PASS. Production/установленный клиент/публичный catalog не менялись.

Точка продолжения: диагностические процессы **7642** (66 полей), **2745** (3 поля)
и **76234** по-прежнему отдельны от завершённых fresh acceptance browsers.
Их Table открыты; узлы уже выполнены, не повторять Execute вслепую. Детали bindings
ниже. Для новой диагностики — свежий channel ID/deadline; fixed acceptance запускает
новый pinned browser процесс. Рабочие изменения не закоммичены.

Дальше для полного 03: остальные CSV/TSV/encoding/header/skip/error cases,
DateTime/Boolean/precision extremes, нулевой результат и вертикальные окна;
Close/cancel и изменения existing import с сохранением незаданных параметров;
общие mappings и доставка файла одним вызовом; промежуточный save и отдельный
final save/close/reopen/reexecute; stop/status/wait/resume/reconcile unknown effects;
публичная карточка/контракт и финальный независимый goal-only Hermes Sol/low.
Нынешние два PASS закрывают только связанный UTF-8 identity Execute+output,
а не отменяют остальные пункты канонического подплана.

---

# Подплан 03 — горизонтальные страницы Table, 8 сентября 2026

**in progress, source only; полный цикл 03 ещё не принят.**
`table-output-pages.mjs` собирает до 10 строк по всей схеме до 1000 колонок.
Страница содержит максимум 8 колонок; если виден только её префикс, он читается
отдельно перед прокруткой. Для следующей колонки применяется ограниченный
горизонтальный scroll по реальной геометрии. UI control связан с native Table
GUID, port GUID, BrowseViewVendor, DOM grid и тем же Ext BufferedStore.
Данные остаются в отдельном reader; generic controls не раскрывают строки Table.

`node-table-context` возвращает геометрию только связанной, но скрытой ячейки.
Schema identity охватывает все имена/метки/типы/порядок/native header tids,
DOM root и Store incarnation. Смена схемы, total/segment, record IDs или порядка
между страницами запрещает сбор результата. Это не доказательство нового
выполнения: низкоуровневые freshness/filter/precision flags остаются false.
Zero rows/schema-only поддержаны source tests; их live acceptance ещё нужна.
Непомещающаяся целиком отдельная колонка пока отклоняется. Вертикальное
раскрытие первых десяти строк, если они не в видимом окне, ещё не реализовано.

Обнаружен и исправлен refresh: после строгого NOT_APPLIED до жеста канал ранее
терял tablePage. Теперь `node_table_request` сохраняет точный запрос и переносит
его в восстановленное наблюдение, включая offscreen result. Неизвестный эффект
по-прежнему не разрешает повтор. Новая проверка покрывает этот случай.

Live evidence (mixed source diagnostics, **не fixed-pin whole-goal acceptance**):
- `.dock/text-import-v3/live-1788826828762/wide-data-prepare.json`: Cancel старого
  диагностического Format, включение Null/type icons, применение filter=false.
- `wide-data-scroll-native.json`: actual horizontal grid x=81, width=1420,
  scrollWidth=5420, overflowX=auto; последний header вне окна. Это UI scroller,
  не RPC. `wide-horizontal-probe.json` связал offscreen cell с тем же Table.
- `wide-horizontal-read.json`: 66 × 2 после чтения с левого края, 24 шага
  канала (включая предшествующий probe). До добавления schema identity.
- `wide-schema-read.json`: отказ до жеста на refresh; сохранён как отказ.
  Исправление переноса tablePage внесено после диагностики этого evidence.
- `wide-schema-recovery-read.json`: 66 × 2, schema `table-schema-1`, 29 шагов;
  начинался после частичного возврата от правого края. Новый Execute не делался.
- `wide-table-values-audit.json`: отдельное сравнение 132 ячеек с историческим
  `done-1788821223647/Dock03-done-1788821231649.csv`, SHA
  `b05e758bf1c6f0d2e119d72ac54d9ec528a320f33e21b8c7c0958b283d8f561d`.
  Проверены все имена/порядок/строки, integer values и точное IEEE-754 binary64
  равенство real после разбора локализованной UI-строки. PASS относится только
  к этому сравнению; upload/execution ownership/persistence этим не проверены.
- `.dock/text-import-v3/live-1788824197802/small-output-pages-read.json`: 3 × 3,
  1 шаг, строка `one;two`, empty, Null и точные real display strings.

Client **692 PASS, 1 SKIP**, всего 693 tests:
`.dock/text-import-v3/horizontal-final-client.txt`. Native context/paging guards,
Table scroller owner, отсутствие движения, schema changes и page refresh покрыты.
`git diff --check` PASS. Новый helper входит в runtime inputs.
Source preflight `.dock/text-import-v3/horizontal-preflight.json`:
`1fa47a0c84a7a7195814c70049f7909245d7e65a3cee09bddcce1b554b3749d6`.
Python import evidence не менялся; полный независимый Table auditor ещё нужен.
Production, установленный клиент и Hermes не изменены.

Текущее состояние: process **7642** (wide) и **2745** (small) живы на Table,
**Format/Filter закрыты**, узлы уже выполнены. Exact prepared/table identities
сохранены ниже. Wide ctx.wideOutput содержит 132 ячейки, channel
`wide-schema-recovery-diagnostic` — 29 шагов; small одноимённый channel в другом
browser process — 1 шаг. Для новых действий создать свежий channel ID и deadline.
Old process **76234** в этом участке не менялся.

Следом: связать format proof и Table pages в typed output (integer/real/string/
Null/boolean/datetime/variant), проверить полноту/точность и вертикальные окна,
построить независимый связанный audit source→execute→output и подключить read
в `text-import-node`. Сейчас handler всё ещё требует `read.ports=[]`.
Остальные требования полного 03 ниже остаются обязательными, включая save/reopen,
ошибки/кодировки, Close, mappings, recovery и финальный автономный Hermes Sol/low.

---

# Подплан 03 — широкая настройка Table, 8 сентября 2026

**in progress, source only; публичное чтение выхода ещё не допущено.**
`table-format-pages.mjs` собирает полную схему из адресных metadata pages по 8
полей и раскрывает нужную строку ограниченной native прокруткой. `workspace-ui`
связывает локальный Ext Store, record ID, индекс/имя/метку/тип с видимыми DOM
строками; только подтверждённые строки становятся контролами. Схема имеет
стабильную identity, которая меняется при изменении полей, но не их форматов.
RPC `$self` и другие proxy свойства не читаются. DataType enum проверен по
Dock source `sources/e2e-tests/bg/types.ts` (Boolean=1, DateTime=2, Float=3,
Integer=4, String=5, Variant=6).

`configureTablePrecision` использует paged metadata вместо ограничения в 16
видимых полей. Integer `0` и real `0.################E+00` проверяются по
выделенным numeric controls и native cached DisplayFormat. После Apply ожидается
исчезновение только собственного связанного диалога, включая временную маску;
посторонние диалоги по-прежнему блокируются. Такая же поправка применена к Filter.
При истечении времени до native owner read возвращается timeout, а не ложное
сообщение о смене владельца. Новый helper включён в client revision inputs.

Живые диагностические свидетельства (mixed source, **не fixed-pin acceptance**):
- `.dock/text-import-v3/live-1788826828762/wide-table-create.json`: новая Table
  выхода 0, 11 шагов. Узел уже выполнен один раз; `execute-wide-once.json`.
- `wide-format-page-boolean.json`: 66 полей, первая страница 8, видимое окно 0–12.
  Первые два read probes ошибочно возвращали строку вместо boolean readiness;
  их timeout/owner error не являются отказом native metadata reader.
- `wide-format-reveal-last.json`: схема 66 полей и видимая последняя колонка,
  окно 53–65, после ограниченной прокрутки.
- `wide-precision-run.json`: все numeric readbacks и один Apply выполнены,
  затем отказ ожидания временного собственного диалога на шаге 871. Этот прогон
  не объявлен PASS. `wide-precision-apply-observed.json` отдельно подтвердил
  закрытие без повторного Apply. Причина исправлена в коде.
- `wide-precision-roundtrip.json`: отдельный диагностический reopen Format,
  все 66 cached masks совпали (65 integer и 1 real), mismatches=[]; всего 883
  шага канала, включая отдельные проверки после отказа.
- `.dock/text-import-v3/live-1788824197802/paged-small-precision.json`: обновлённый
  paged driver, включая native stored mask check и закрытие диалога, завершился
  на трёх полях за 25 шагов. Это diagnostic существующего браузера, не полный
  цикл source bytes → execution → Table → persistence.

Client **670 PASS, 1 SKIP**, всего 671 тест; лог
`.dock/text-import-v3/wide-format-full-client.txt`. Новые проверки покрывают
подмену DOM record/type/label, дубликаты metadata, accessor без вызова getter,
изменение схемы между страницами, отсутствие движения прокрутки и transient
закрытие связанного диалога. `git diff --check` PASS.
Source preflight `.dock/text-import-v3/wide-format-preflight.json`:
`9a141cbf329ec9932a91461d24124b2f57b9f6a09abd383cb3c93bc4e2015f9c`.
Python evidence не менялся; прежние 66 PASS не переносить на новый Table audit,
которого ещё нет. Production, установленный клиент и Hermes не менялись.

Точка продолжения:
- Wide process **7642**, directory `live-1788826828762`, prepared document
  `1788826832657-etxq7h33iac`, node `8e4c6032-ae67-4ecc-ae5c-ccae8a6bc45a`.
  Table GUID `029e8341-43c2-4201-8fd7-7c71a0d3d8d3`, native data port GUID
  `58f7e6c3-511e-39d7-8853-036e0a1a7612`, root `MF;TF-1;ViewsForm;BrowseView`.
  **Format открыт после roundtrip**, данные уже исполнены. Не повторять Execute.
  `ctx.tableRef`, `ctx.formatDefinition`, `ctx.newTable` доступны; канал
  `wide-precision-diagnostic` закончился на шаге 883, срок может истечь.
- Small process **2745**, directory `live-1788824197802`: Format закрыт,
  `ctx.tablePrecision` содержит результат 25-шагового paged driver.
  Точный prepared/table binding — в предыдущем checkpoint ниже.
- Old process **76234** сохранён на прежней малой Table, в этом участке не менялся.

Дальше: закрыть диагностический Format через наблюдаемый Cancel; включить
Null/type icons и отключить filter. Разработать горизонтальный адресный reader
Table (сейчас offscreen cell возвращает `cell_not_visible`), затем typed values,
точные числа/даты/строки, нулевой результат и полный малый output audit. Связать
это с execution ID и private node.apply; пока `read.ports=[]` остаётся обязательным.
Остальные требования полного 03 (Close, кодировки/ошибки, mappings, обновление
существующего узла, доставка одним вызовом, save/reopen/reexecute, stop/resume,
финальный независимый Hermes Sol/low) не отменены и ещё не завершены.

---

# Подплан 03 — общий Table reader и настройка, 8 сентября 2026

**in progress, source only; полное чтение через node.apply ещё не принято.**
Добавлены `node-table-context.mjs` и `node-output-procedure.mjs`.
Первый читает страницу не более 8 колонок × 10 строк, связывая active Table,
view GUID, port GUID, prepared node, обе половины native Ext grid, cached
BufferedStore records и конкретные DOM-ячейки. Native cached `ValueText` —
именно форматированная UI-строка, а не исходное числовое значение. Она позволяет
различить пустой текст и настоящий NBSP, которые одинаково выглядят в DOM.
Null подтверждается native null marker и отсутствием ValueText. Accessors и
RPC/dataset proxies не вызываются. Для исходных значений нужен точный UI format.

Общее число строк читается из локального `BrowseViewPagingProxy.FTotalRowCount`
с проверками FDataStore identity, FStatus=4, FViewDataInvalid=false,
FRequiredPrepareViewData=false, FPageIndex/FPageSize и segment totalCount.
Это поле UI-контроллера, не вызов RPC proxy. Отдельно сохраняются исходный
Table count, страницы и признаки ещё не подтверждённых filtering/freshness/
precision. Нельзя переименовать эти низкоуровневые наблюдения в готовый результат.

`openNewOutputTable` создаёт новый Table в native panel выбранного порта;
палитра, AddCard и Enter связаны с cached ViewsForm descriptors. Новые UI verbs
`open_node_views` и `enter_table` допускают переход после одного жеста без его
повтора. `configureTablePrecision` задаёт integer `0`, real
`0.################E+00` и перечитывает поле после смены выделения. Loginom
канонизирует integer `0`: custom=false, decimal_digits=0, thousands=false,
currency empty, scientific=false. Проверка принимает эту наблюдённую эквивалентную
форму. `prepareTableRead` включает Null/type icons и явно применяет filter=false.

`node-procedure` записывает Table pages и native output/process context в журнал.
Только явно заданные format/filter dialogs, связанные с активным native Table,
допускаются внутри соответствующего шага; посторонние диалоги блокируют операцию.
Private UI reads пропускают строки данных Table, читая их отдельным bounded
reader; лимиты DOM scan не увеличены. Generic public UI reader не изменил полноту
табличного обзора. Форматный список пока использует прежний complete_visible_rows
reader до 16 строк; широкая настройка и горизонтальная выдача страниц ещё нужны.

Проверено в mixed diagnostic `.dock/text-import-v3/live-1788824197802`:
- `table-ui-creation.json`: новая Table нужного порта за 11 шагов канала.
- `table-configure-precision-current.json`: masks/readback/Apply подтверждены.
- `table-prepare-read.json`: filter=false, Null/type icons, 3 строки × 3 поля;
  `1,23456789012345E+00`, `-2,5E+00`, `0E+00`, строка `one;two`, empty и Null.
Первый `table-configure-precision` остановился на canonical integer readback;
этот отказ сохранён, а не объявлен PASS. Последующая диагностика объяснила его.

Client **653 PASS, 1 SKIP**, включая 24 Table reader tests, 11 numeric format tests,
Table dialog ownership и native viewer-card binding. Лог:
`.dock/text-import-v3/table-final-client-tests.txt`. `git diff --check` PASS.
Source preflight `.dock/text-import-v3/table-preflight.json`:
`94a78e70bffa706f3e9c48bd8936bb8ff543bcc217e79cf7dbefe59abfb036da`.
Живые probes выполнялись обновлёнными сериализованными helpers в прежнем браузере;
это не фиксированная связанная приёмка новой ревизии. Исторический Execute PASS
ниже относится только к прежнему pin. Python evidence в этом участке не менялся.

Текущее UI: process `2745`, Table GUID `735a5948-9de1-4b7e-99e0-434dfc6d188a`,
port GUID `58f7e6c3-511e-39d7-8853-036e0a1a7612`, root `MF;TF-1;ViewsForm;BrowseView`,
prepared doc `1788824201737-f3xi19bh7o`, node `c9fdce25-fc20-45de-a40e-337b322e71a7`.
Открыта Table после Apply format/filter, dialogs/console закрыты. `ctx.tableRef`,
`ctx.tablePrecision`, `ctx.tableReadSettings`, `ctx.tableChannel` доступны;
канал `table-read-diagnostic` завершил 12 шагов, deadline может истечь.
Для новой диагностики создаётся новый channel/operation ID; не переиспользовать
старые номера шагов. Сессия `76234` также жива на прежней Table с ручным format.

Следом: общий paged formatter/reader для широких схем и иных типов, проверка
полного малого выхода по source bytes и execution ID, затем подключение чтения
в `text-import-node`. Сейчас валидатор по-прежнему допускает только read.ports=[];
новые процедуры не выданы за готовый публичный handler. Остальные требования
канонического 03 остаются: Close, кодировки/CSV/TSV/ошибки, mappings, обновление
существующего узла, доставка одним вызовом, save/reopen/reexecute, stop/resume и
окончательный Hermes Sol/low. Production и установленный клиент не менялись.

---

# Подплан 03 — связанный Execute, 8 сентября 2026

**in progress, source only; полный 03 и публичный выпуск не приняты.**
Приватный `text-import-node.mjs` теперь допускает Done и Execute с пустым
списком читаемых выходов. UTF-8, delimited, identity mapping, отсутствие входов
и хотя бы одно используемое поле остаются явными границами этого кандидата.
Чтение порта, Close, сохранение и продолжение неизвестных фаз ещё не готовы.

Добавлены `node-process-context.mjs`, `node-execution-evidence.mjs` и
`node-execution-procedure.mjs`. До открытия мастера драйвер показывает консоль,
включает завершённые процессы, фиксирует полный список верхних групп и native
root incarnation, закрывает консоль. После одного Execute выделяет новую группу,
ожидает завершение, раскрывает её и связывает дочерний процесс с GUID узла через
«Показать узел» и фактическое выделение native graph cell. Идентификатор выполнения
содержит prepared document, root incarnation и process group. Старый активный
выход, подпись процесса и закрытие мастера не заменяют эту проверку.
Группы из открытия Table не должны подменять уже зафиксированный execution ID.

Чтение процессов проверяет cached native TreeStore и обе половины DOM-таблицы,
prepared node до/после, состояние загрузки, видимость, уникальность record IDs
и структуру родителей. RPC/dataset proxies не вызываются. Полнота baseline
относится к верхним группам; потомки доступны только после загрузки через UI.
Приватный исполнитель пока требует одного непосредственного дочернего процесса;
общий pure verifier умеет проверить выбранный процесс среди зависимостей, но
драйвер их обхода и длинное status/wait ещё не готовы.

`node-procedure.mjs` сохраняет native process/output reads в том же журнале,
а консоль и её меню читает адресно. Исправлены два наблюдённых случая: пустая
консоль до первого запуска и краткая перерисовка после «Показать узел».
`workspace-ui.mjs` добавляет typed `execute_wizard` и `show_process_node`;
после жеста ждёт только временно недоступную поверхность того же prepared node.
Execute-квитанция явно оставляет `execution_completed:false` до проверки процесса.
Обычный Done сохранил прежние квитанции и семантику.

Живой audit `.dock/text-import-v3/execute-1788824763884/independent-audit.json`:
**PASS**, 3 поля, исходные bytes/SHA, upload/download verification, настройки,
выходная identity schema, один Execute, новое выполнение и точный owner.
Execution ID `1788824767970-h6260nkvf1l:237:1`.
Runtime `8eebe5c3d27ed61ceda52709429c5bbca8d5fd58fb8d8ffdcf6bcd8666c01a4f`;
`.dock/text-import-v3/execution-preflight.json` подтвердил тот же pin.
Повтор ID не вызвал браузер. Это не проверка содержимого выхода или persistence.
Первичная summary harness ошибочно оставила `execution_verified:false`, читая
внешнюю обёртку; исходный result и независимый audit подтверждают выполнение.
Harness исправлен, историческая summary не переписана.

Неуспешный `execute-1788824678142` сохранён без PASS: после Execute полный обзор
с открытой файловой вкладкой превысил прежний work budget. Чтение консоли
переведено на её точный root, лимиты не увеличены. До этого mixed diagnostic
`live-1788824197802` подтвердил процесс после уже выполненного Show Node;
его AMBIGUOUS-квитанция не была переоценена как успешный полный прогон.

Проверки: client **616 PASS, 1 SKIP** (`execution-final-client-tests.txt`),
Python import evidence **66 PASS**, `git diff --check` PASS. Независимый
`import_execution_evidence.py` повторно проверяет цепочку от файла до процесса;
не заявляет output_data, package persistence, journal authentication или Hermes.
Production, установленные клиенты и модели не менялись; Hermes 03 не запускался.

Точка продолжения: process `2745`, `.dock/text-import-v3/live-1788824197802`,
prepared document `1788824201737-f3xi19bh7o`, workflow suffix `-1`,
node `c9fdce25-fc20-45de-a40e-337b322e71a7`, граф Import03 и открытая консоль.
В нём узел уже выполнен один раз; execution group 1, child 1.1, root 131.
Старый process `76234` и Table из предыдущего checkpoint также ещё открыты.
Обе сессии диагностические со смешанными probes, не фиксированная приёмка.
Для следующего приёмочного запуска создать свежую source-сессию.
Следом общий Table reader с тем же execution ID и GUID выхода, точными числами,
Null/empty, количеством строк, пагинацией и широкой схемой. Затем весь остаток
канонического 03: форматы/кодировки, mappings, Close, доставка одним вызовом,
сохранение/reopen/reexecute, безопасный stop/resume и конечный Hermes Sol/low.

---

# Подплан 03 — принадлежность выхода и точный Table, 8 сентября 2026

**in progress, source only; Execute и полный подплан ещё не приняты.**
Добавлен `client/lib/node-output-context.mjs`: связывает индекс выхода с native
GUID порта на графе, а Table — с тем же GUID через локальные UI descriptors,
PortPanel и точный DOM активного BrowseView. Проверяет prepared node до и после
чтения. `node-context.mjs` теперь узнаёт ViewsForm по исходному ModelNodeTreeNode
и точному FModelNode reference. Нет вызовов backend/RPC, чтения dataset proxies;
активный значок порта явно не доказывает свежесть выполнения.
Модуль включён в runtime pin. Публичный контракт и установленные клиенты не менялись.

Проверки: полный client suite **572 PASS, 1 SKIP**; после дополнительного
ограничения суффикса BrowseView — **26 focused PASS**; `git diff --check` PASS.
Нативный диагностический probe подтвердил GUID выхода `58f7e6c3-511e-39d7-8853-036e0a1a7612`
и привязанный Table `64970b80-1f16-43d4-a78c-ab9fd5f3e9be` в старой открытой
source-сессии. Это probe обновлённых сериализованных helpers, а не цельная
приёмка новой версии runtime; предыдущие Done pins сохраняют исторический смысл.

## Проверенные UI-факты для следующего execution/read driver

Живой процесс **76234**, папка `.dock/text-import-v3/live-1788821789307`:
Import03 выполнен один раз вручную, сейчас открыт его Table; не повторять Execute.
- Execute в мастере: точный `WizrdMCF;btnExecute`. Новая группа процессов 1,
  дочерний процесс 1.1 / Import03, оба completed. До выполнения надо фиксировать
  baseline всей истории с включённым отображением завершённых процессов.
- Для принадлежности использовать дочерний process → «Показать узел» → prepared
  document/workflow/node GUID **и** единственное выделение mxGraph.
  `process-selected-node.json` подтвердил именно исходный vertex. Отдельный
  ShowNode callback создаёт transient navigation, которое нужно дождаться.
- Первое раскрытие process до завершения загрузки UI стало сворачиванием.
  После timeout состояние было прочитано (`expanded=false`, child загружен),
  затем выполнено подтверждённое раскрытие. Слепой повтор недопустим.
- Визуализатор открывается через `Graph;Import03;Visualizers`, а не меню порта.
  На ViewsForm сначала выбрать palette Table, затем ViewerAddCard **в панели
  точного GUID порта**. После появления ViewerCard вызвать его btnEnter.
  Нажатие Add без выбранного vendor показывает msgbox; этот случай диагностирован,
  закрыт, затем использован порядок, подтверждённый E2E viewsForm.ts:623–668.
- По умолчанию Table показал `1,23456789` вместо исходного `1.23456789012345`.
  Включён ShowNulls: пустая строка — NBSP, null — отдельный bg-cell-null-value.
- На Format выбрать Amount, сохранить включённые Formatting и Custom, задать
  маску **`0.################E+00`** (17 значащих цифр) через реальные keyboard
  events, дождаться примера с E, затем Apply и обновлённой ячейки.
  `locator.fill` не обновил native formatting model; подставлять только DOM value
  недостаточно. Продуктовый ui.act.fill уже использует keyboard.type.
- `table-exact-values.json` подтвердил `1,23456789012345E+00`, `-2,5E+00`,
  `0E+00`, строку `one;two`, пустую строку и `<null>` с отдельным маркером.
  Это проверка выбранного fixture, не универсальная приёмка precision/Execute.
- Read-only port/helper probes: `output-binding-graph.json`,
  `output-binding-current2.json`. Не сравнивать RPC interface pointers
  ModelViewTreeNode.FModelViewNode и descriptor.ViewNode: это разные интерфейсы.
  Принадлежность задают node ancestry, active descriptor, DOM и native PortPanel.

Дальше реализовать общий execution driver и точный read с этой доказанной
UI-последовательностью; покрыть empty/large/wide и lifecycle, затем остальные
требования 03 (пользовательские mappings, кодировки, Close, доставка, сохранение,
stop/resume, package reopen/reexecute и финальная независимая Hermes Sol/low).

---

# Подплан 03 — имена, метки и выбор полей, 8 сентября 2026

**in progress, source only; полный подплан не принят.** `configureTextImportFields`
теперь меняет имя, метку и использование поля. Необязательное `source_name`
явно связывает исходное имя с новым `name`; старый legacy контракт не расширен.
Переименование проверяется по индексу, исходному имени, владельцу мастера и
остальным свойствам. Редактор хранит отдельно скрытый исходный текст и введённый
черновик. Пока открыт любой текстовый редактор, определения не получают полноту.
Связанная метка Loginom может изменяться во время ввода имени; это допускается
только при наблюдённом `bg-associated-value`, затем задаётся целевая метка.
Тип/вид настраиваются до имени/метки/использования, финальный sweep проверяет всё.

Выходной identity mapping проверяет только используемые поля, сохраняя их порядок.
Полностью исключённая схема пока отклоняется до UI; произвольный port mapping,
перестановки, поддержка конфликтных промежуточных имён, Execute/Close и общий
продуктовый контракт ещё требуют реализации и приёмки. Кандидат остаётся UTF-8 Done.

Живые независимые аудиты текущего runtime
`13f4bf842ec69c65ee7860660feac85183dbd4d098d7b33bee67188dbb46c552`:
- `done-1788821702394`: **PASS**, 3 исходных / 2 выходных поля, `Id → RecordId`,
  метка `Идентификатор`, исключён `Title`, метка `Сумма` у последнего поля.
- `done-1788821788143`: **PASS**, 66 исходных / 65 выходных полей, 446 внутренних
  шагов, переименование первого, исключение второго, метка скрытого последнего;
  полный mapping, Done, повтор ID без browser calls.
- `.dock/text-import-v3/metadata-preflight.json`: runtime pin совпал.
- Неуспешный `done-1788821609986` сохранён: слишком строгая проверка метки
  во время ввода. Ему не присвоен PASS.

Client **562 PASS, 1 SKIP**; import evidence **59 PASS**. Ранее отдельные
node-procedure evidence **15 PASS**; исходники этого проверяющего кода не менялись.
`git diff --check` прошёл. Production, установленный клиент и каталог не менялись.

Следующий участок — Execute/Close, свежий execution ID и точный Table.
Текущая отдельная UI-диагностика `.dock/text-import-v3/live-1788821789307`
выполнила Import03 через `btnExecute`. После включения отображения завершённых
процессов видна группа №1 `Активация узлов`, completed, но её `Показать узел`
неактивно. После подтверждённого раскрытия дерева виден дочерний completed
процесс `1.1 / Import03`; его «Показать узел» активно и возвращает исходный
prepared workflow/node GUID после transient navigation. Для реализации нужно
также сверять единственное выделение mxGraph, а не просто присутствие узла
в том же графе. Однократное раскрытие до загрузки дерева оказалось сворачиванием:
после timeout проверено `expanded=false`, загруженный child `1.1`, и только
после этого выполнено отдельное раскрытие. Не делать слепых повторов expand. Это диагностическое наблюдение, не приёмка execution.
Не вызывать RPC/proxy методы `Process/Target`; исследуется только реальный UI.

---

# Подплан 03 — широкая выходная схема, 8 сентября 2026

**in progress, source only; полный подплан не принят.** Ограничение кандидата
восемью полями снято. Приватный Done читает входные и выходные определения
адресными страницами до 1000 полей; живая проверка выполнена на 66, а не на 1000.
Режимы остаются UTF-8, identity mapping, все поля используются, без Execute/Close.

Loginom 7.4.2 виртуализирует выходную таблицу: из 66 строк первоначально
отрисовываются 58 (число меняется после перерисовки). Для адресной страницы
проверяются полный локальный Ext UI store, отсутствие отфильтрованных записей,
порядок и identity каждого отрисованного record, имя/метка, геометрия пяти ячеек.
Недостающий участок открывается ограниченной прокруткой точного native owner.
Префикс сам по себе не считается полной схемой. Изменение состава или свойств
между страницами прекращает чтение. Store используется только как кеш метаданных
интерфейса; загрузка ranges, вызовы backend и чтение данных через proxy отсутствуют.

Наблюдение привязанного мастера пропускает данные предпросмотра, неактивные
страницы и общий обход ячеек; эти ограничения явно перечислены в scan.
Полноту настроек подтверждают отдельные адресные readers. Лимиты общего
наблюдения не увеличены, старый публичный UI path сохранён.

Живой `done-1788821086199`: **independent audit PASS**, 66 полей, verified
upload/download SHA/size → node.apply → настройка → полный identity mapping →
Done → тот же граф. Повтор ID не вызвал browser calls. Runtime
`85ef42c1e6732476a29fa64f58872898e91b02e7c16cd34eda7329114b70f0f9`.
Это историческая проверка до дополнительной проверки геометрии пяти ячеек.
Текущая редакция `aeb52b99f692b31273552f39e8898a68371551c77f5a16d855990abdfadd73f6`
проверена отдельно: `done-1788821223647`, **independent audit PASS**, 66 полей,
228 внутренних шагов, две native scroll операции; повтор ID без browser calls.
Source preflight подтвердил неизменность runtime pin. Локальные evidence:
`.dock/text-import-v3/done-1788821223647/independent-audit.json`,
`.dock/text-import-v3/window-preflight.json`. Все диагностические сессии закрыты.
Ранее также прошёл Done с 12 полями: `done-1788819197835`, runtime
`1096240f764d38c67a6c557213fdc476327b1dad4cc878853959ae972b404cc5`.
Неуспешный `done-1788820289857` сохранён как отказ на output mapping;
его отдельный fields-only audit PASS не является Done PASS.

Локальные проверки текущих исходников: **559 PASS, 1 SKIP** (client),
**57 PASS** (import evidence), **15 PASS** (node procedure evidence).
Ни эти проверки, ни Done не подтверждают выполнение, точный выход, сохранение
пакета и Hermes-приёмку. Следующий участок — имена/метки/исключение и пользовательский
mapping, затем Execute/Close, точный Table, объединённая доставка,
сохранение/reopen/reexecute, stop/resume и финальная Hermes Sol/low.
Production и установленный клиент не менялись; изменения не закоммичены.

---

# Подплан 03 — связанный Done, 8 сентября 2026

**in progress, source only; полный цикл и выпуск не приняты.**
Приватный `text-import-node.mjs` связал проверенный upload, принятый драйвер
цели 02, первое открытие, настройку, identity output mapping и Done в один
`runNodeApply`. Повтор завершённого ID не обращается к браузеру. Приёмочный
кандидат явно ограничен UTF-8, Done, всеми используемыми полями и схемой до 8
колонок: прочие режимы отклоняются до создания узла, а не считаются готовыми.
Независимый форматный обработчик по-прежнему читает до 1000 полей страницами.

Добавлена привязка DOM-снимков к подготовленному пакету/сценарию/GUID узла.
Переход граф → мастер ожидает временную перерисовку навигации после одного
клика. Строгий отказ до жеста допускает ограниченное обновление наблюдения.
UTF-8 нормализуется в числовой код 65001: поле Loginom не принимает имя UTF-8.

Живой `done-1788818542964`: **independent audit PASS**, 3 поля, 64 внутренних
шага, 1 безопасное обновление, около 23,6 с на node.apply. Проверены исходные
64 байта и SHA, upload/download verification, настройки, mapping, Done и
повтор ID без браузерных вызовов. Это не доказательство execution, сохранения
пакета или Hermes-приёмки. Runtime SHA:
`46c85868939a4f5ce70f2a37c7249970e014b9171034cae26ac66486360328d5`.
Клиент: **538 PASS, 1 SKIP**; Python: **28 tests PASS**. Предыдущие неуспешные
диагностики сохранены; им не присвоен PASS. Production и клиент не менялись.

Дальше — широкие output mappings, имена/метки/исключение, Execute/Close,
точный Table, объединённая доставка, сохранение, восстановление и Hermes Sol/low.
Изменения не закоммичены.

---

# Импорт текста — подплан 03

Статус на 8 сентября 2026: **in progress, source only**.
[Полный подплан](../plans/loginom-dock/03-text-import.md) не принят.

## Реализованный участок

`client/lib/node-procedure.mjs` получил внутренний `perform`: именованное
наблюдение, разрешение действия по свежему объекту, проверка неизменности
предметной идентичности и намерения. Уже записанное наблюдение можно использовать
без дополнительного чтения. При `UI_EPOCH_CHANGED` разрешены максимум два
обновления, только для `NOT_APPLIED / preconditions / effect_possible=false`
с завершённым cleanup и без свидетельства начала жеста. Отказ, разрешение
обновления и следующая попытка записываются отдельно. Неизвестный эффект,
изменение объекта/намерения и отказ журнала запрещают повтор.

Старый `configureTextImportDraft` использует этот механизм на picker типа/вида
поля. После открытия берётся новая привязка редактора, включая возможные новые
ссылки UI. Семантика старой операции сохранена: открытый мастер, до восьми
полностью видимых полей, Done, QA reopen/readback и Done; запуск и сохранение
пакета она не выполняет. Проверка verified upload в её публичном executor-входе
сохранена. Диагностический прямой вызов обработчика эту проверку не заменяет.

`client/lib/node-apply.mjs` — **внутренняя основа**, подключённая к
`createActionRuntime.runNodeApply`. Готового браузерного диспетчера пока нет.
Она валидирует запрос до эффектов и последовательно вызывает типизированные
локальные драйверы: источник, цель, входной mapping, открытие, настройка,
выходной mapping, завершение, выполнение и чтение. Фазы требуют fsync-квитанций,
проверяют document/workflow, execution identity и выбранные свежие порты.
Done не запускает узел и не читает старый выход. Частичный результат не получает
SUCCEEDED; неизвестная фаза не повторяется. Общий deadline и бюджет настройки
не возобновляются между фазами. Локальный node checkpoint явно не доказывает
сохранение пакета.

Это основа для подключения драйверов, а не готовая публичная операция.
Общая блокировка executor, inspect, повтор ID и продолжение уже подтверждённых
фаз подключены. Предметная сверка неизвестной фазы, cleanup браузера, status/wait
долгого выполнения и восстановление из журнала после перезапуска ещё не готовы. `verifyContinuation` пока является контрактом
драйвера, а не реализованной живой проверкой. Карточки типов и серверный каталог
не объявляют full node.apply доступным. Новый модуль включён в runtime pin.

## Живые наблюдения

Работа велась через MCP в отдельном видимом Chromium. Исходный `createSession`
запустил браузер с `--start-maximized`, `viewport:null`, `settle:0`;
подготовка подтвердила inner 1508×862, outer 1508×949. Стенд Loginom 7.4.2:
`http://logi-test-plan.bg.local/app/?testable=true`, операторский account `user`
из operations.md. Production Dock и установленный клиент не изменялись.

В черновике исследован путь: новый текстовый импорт → источник → разделитель
и формат → пять настроенных полей → встроенный выходной mapping → Execute →
активный выход → Быстрый просмотр. Закрытие мастера произошло раньше перехода
выходного порта в active: нужны раздельные ожидания. Быстрый просмотр отображает
real с форматированием; эта диагностика не доказывает точные числовые результаты.

Повторное открытие настроек уже выполненного узла вызывает подтверждение
деактивации. В наблюдённом диалоге `msgbox;tlb;yes` имеет текст «Да»,
`msgbox;tlb;no` — «Да, больше не спрашивать», а `msgbox;tlb;cancel` — «Нет».
Нельзя определять семантику по одному суффиксу. Новый драйвер должен проверить
полный текст подтверждения и владение узлом; глобальную настройку не менять.

Источники прочитаны через Dock:

- `viking://resources/loginom-dock/sources/loginom-help/data/integration/import/txt/README.md`;
- `viking://resources/loginom-dock/sources/e2e-tests/bg/helpers/wizard.ts`;
- `viking://resources/loginom-dock/sources/e2e-tests/bg/helpers/columnDefsTuning.ts`;
- `viking://resources/loginom-dock/sources/e2e-tests/bg/sels/import/sColumnDefsTuning.ts`;
- `viking://resources/loginom-dock/sources/e2e-tests/tests/acceptance/wizards/imports/txt/format_settings.ts`.

## Проверки и воспроизведение

Новый операторский harness:
`tools/loginom-acceptance/node-procedure-refresh-live.mjs`.
Он использует существующий явно заданный серверный файл только для проверки UI;
не загружает файл и не утверждает соответствие его bytes/SHA.
Все диагностические прогоны и неудачные попытки сохранены в `.dock/text-import-v3/`.

Финальный локальный прогон: `.dock/text-import-v3/refresh-1788814398307/`.
Фиксированная runtime SHA256:
`0f2fcb17db35e0bfb6000da0232ccb854a3ea08e6146ae288e5c1ba063fd294f`.

`independent-audit.json`: PASS, failures=[]; runtime_unchanged=true,
ровно одно локальное обновление, 61 внутренний шаг. Независимый verifier читает
журнал наблюдений/действий, не флаг успеха обработчика. Намеренный сдвиг DOM
перед picker `UnitPrice/data_kind` дал строгий отказ до жеста; следующая попытка
настроила «Дискретный», затем полный старый settings roundtrip прошёл.
`journal_authentication_verified`, `hermes_acceptance_verified`,
`package_persistence_verified`, `execution_verified` остаются false.

`node_procedure_evidence.py` теперь проверяет цепочку отказ → разрешение
обновления → новое наблюдение → тот же объект и намерение → успешная попытка.
Отказ не считается выполненной мутацией. Прежние успешные журналы сохраняют
семантику; исторические audits не пересчитывались.

Команда воспроизведения (только при необходимости новой проверки):

```sh
~/.loginom-dock/current/runtime/node \
  tools/loginom-acceptance/node-procedure-refresh-live.mjs \
  --loginom-url 'http://logi-test-plan.bg.local/app/?testable=true' \
  --loginom-user user --settings .dock/text-import-v3/qa-settings.json
```

Финальные проверки: клиент — **490 PASS, 1 SKIP, 0 FAIL**;
независимый verifier — **15 tests PASS**. Source preflight подтвердил включение
нового модуля в комплект и совпадение runtime SHA с живым прогоном;
`build_inputs_match_commit=false`, поскольку изменения ещё не закоммичены.
`git diff --check` прошёл. Оболочка отдельно покрыта 32 проверками, включая
реальный fsync-журнал, общие бюджеты, отмену и отказ от повторения неизвестной фазы.

## Продолжение 8 сентября: lifecycle и широкие определения

`runNodeApply` использует общий gate, реестр ID и журнал исполнителя. Драйвер
02 вызывается напрямую в фазе target, под её deadline. Повтор завершённого ID
возвращает исходную квитанцию. Повтор неизвестного finish не запускает действие;
inspect не вызывает generic reconcile и не открывает мастер. Generic repair и
abandon запрещены для незавершённого node.apply. Отмена не освобождает gate,
пока текущий вызов не вернулся. Сбой доставки после durable node checkpoint
устраняется повторной записью/доставкой, без повторного выполнения фаз.

Это приватный host-вход с внедрением доверенных обработчиков/драйверов.
По умолчанию реестр пуст: публичная команда и карточка полного импорта ещё не
включены. Неизвестный эффект остаётся заблокированным; нельзя считать этот
fail-closed ответ полноценной реализацией phase inspection/recovery.

`configureTextImportFields` переиспользует настройку источника/формата и типов,
но заканчивается на странице формата. Вход допускает 1–1000 явно заданных полей;
фактическая обработка ограничена общим временем, числом шагов и бюджетом DOM.
Живая проверка проведена для 12, а не для 1000 полей. Имена, метки и флаг used
пока проверяются как идентичность, а не изменяются; переименование и исключение
ещё требуют обработчиков. Старая функция сохраняет свой лимит 8 и QA roundtrip.

`import-definition-pages.mjs` собирает адресные страницы по 8 полей. Полнота
проверяется по всем нативным заголовкам/ячейкам; общий schema_id меняется при
изменении любого поля, включая не попавшее на текущую страницу. Пропуск страницы,
изменение identity, чужой индекс/число полей не принимаются. Это определения
черновика, не схема проверенного источника и не выход выполненного узла.

Живое наблюдение показало: настройки имеют overflow:hidden, а их горизонтальной
позицией управляет нативный scroller DATA preview (`grdData;grd-1;tbl`). Новый
`scroll_horizontal` с delta_x в пределах ±1000 двигает только наблюдённого
владельца. Нельзя вручную прокручивать скрытый settings grid. Перед изменением
поля требуется свежая страница и подтверждённая доступность его точки.
Dropdown читается через единственный наблюдённый portal и fixed guards мастера,
без полного обхода посторонних вкладок с файлами.

Уточнённые условия:

- Первоначальный разбор файла может сбросить слишком рано введённый разделитель.
  Новый путь ждёт сформированных определений после Next, затем настраивает
  формат и проверяет итоговую схему.
- «Закрыть» после правок вызывает подтверждение «Вы действительно хотите закрыть
  мастер настройки?», `msgbox;tlb;yes` = «Да». Сам клик Close не доказывает отмену.
- Prepared document ID из 01/02 и UI DOM identity из workspace-ui — разные
  идентификаторы. При связывании драйверов требуется проверенный адаптер обеих
  идентичностей, активной вкладки, package object и GUID узла. Нельзя просто
  подставить один ID вместо другого. В исследованном мастере cached дерево
  содержит WizardTreeNode → ModelNodeTreeNode с FGuid → WorkFlowTreeNode → пакет;
  это наблюдение модели UI, не разрешение вызывать методы сервера Loginom.

### Свидетельства этой итерации

Отдельная доставка 12-column CSV прошла существующие admit/upload/inspect/verify:
`.dock/text-import-v3/live-1788814808122/verified-wide.json`, destination
`/user/dock-p3/Dock03-wide-1788815413372.csv`, 176 bytes,
SHA256 `2e4ff0aa62a90c50f5bfa5787f57499c41a79e632803834fb3c6f435123926fd`.
Это отдельный диагностический сеанс, не сквозной source binding нового node.apply.
Неудачные диагностические попытки и смешанный runtime оставлены как история;
по ним не заявлена приёмка закреплённой версии.

Финальная настройка на свежем source runtime:
`.dock/text-import-v3/fields-1788816551910/`, 67 шагов, 12 полей,
`independent-audit.json`: PASS. Runtime до/после совпал:
`824a1436f2f137f903e35f13d5d9d18ee7eeb5f50e3ce23dceacf68860a10960`.
Audit `import_fields_evidence.py` читает source/format/страницы и квитанции
мутаций. Он не требует продуктового reopen и явно оставляет settings saved,
upload, execution, persistence и Hermes acceptance неподтверждёнными.

Воспроизведение: `tools/loginom-acceptance/node-import-fields-live.mjs`
с обязательными `--loginom-url`, `--loginom-user`, `--settings`.
Это только QA настройки уже существующего явно указанного серверного файла;
он не подтверждает его bytes/SHA. Пример параметров сохранён в указанном run-dir
как `expected.json`; harness закрывает свой диагностический браузер.

Текущие проверки: клиент **509 PASS, 1 SKIP, 0 FAIL**; Python verifiers
**21 tests PASS**. Source preflight: runtime SHA совпал, files=202,
`build_inputs_match_commit=false`. Живой полный node.apply не проверялся.

Старый QA roundtrip дополнительно проверен на той же текущей runtime SHA:
`.dock/text-import-v3/refresh-1788816938751/`, 61 шаг, одна намеренная смена DOM,
независимый audit PASS. Сохранены Done → reopen → Done и строгий recovery picker.
Оба свежих harness завершились и закрыли свои браузеры.

## Точная точка продолжения

1. Связать готовый этап настройки с живыми драйверами полного `runNodeApply`:
   verified source receipt, prepared/UI identity adapter, первое открытие.
   Host factory уже существует, но готовых default handlers/drivers нет.
2. Реализовать переименование, label/used и общий mapping; затем Done/Execute/Close,
   свежую execution identity, ожидание и точное чтение через Table.
3. Объединить существующую доставку без ослабления гарантий; добавить промежуточное
   сохранение и отдельный final save/close/reopen.
4. Реализовать предметную сверку неизвестных фаз и безопасное продолжение;
   расширить CSV/TSV/error/cancel/save матрицу и независимый audit полного цикла.
5. После завершения Codex-отладки — самостоятельная приёмка Hermes Sol/low.

Hermes не запускался. Production, установленный клиент и выпуск не изменялись.
