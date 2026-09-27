# JavaScript: checkpoint исполнения

Дата: 2026-09-26. Фаза **0A/0B: OpenViking восстановлен; discovery JavaScript продолжается**.
Пользователь назначил исполнение [плана](plan.md), Ubuntu и только headed-браузеры.
Начаты операторские наблюдения 0B. JS-handler, полное discovery, ревью реализации
и CLI-приёмка ещё не выполнены.

Повторная проверка после перезапуска Codex: MCP `health`, actor `find` и чтение
найденной записи `g2_g3_module_integration.md` успешны. Установленный Doctor
0.8.1 подтвердил credentials, `system/status`, 15 MCP tools и все подсистемы
`/ready`: **0 failures**. Единственное предупреждение — исторические ENOENT
при чтении rollout других задач; текущий поиск/чтение ими не заблокированы.
Настройки доступа не менялись. Разработчик продолжает G2/G3 operator в прежней
задаче; до передачи проверенной версии новый live-прогон не запускался.

## Актуальная диагностика после запроса пользователя


### Batch48: Execute dispatch подтверждён, busy mask требует settlement — 2026-09-27

Batch48 terminal exit1 FAILED, original package/logout/browser cleanup ALLPASS.
Recovery не потребовался. Root проверил977 journalSHA,2 full input reads/60cells;
fresh terminal/output отсутствуют. Первый code-sentinel-execute дошёл до actual
Execute04:06:37.211Z и verified launch04:06:37.491Z, затем новый notification
inspector отказал04:06:37.521Z: «Post-execution busy or modal mask remains».
В launch receipt видна ровно одна busy mask target_tid MF;TF-1;ModelForm,
dialog_ref=null, text=Загрузка; dialogs[]. Same graph/node context verified,
node d45ac23d-f4b2-4ad8-be9c-087251e49848, unlocked. Отказ случился до проверки
toast, поэтому live settlement48 не засчитан. Последующий screenshot не показывает
mask, но не заменяет terminal proof. Остальные6cases NOT_RUN.

Приватные verification/boundary receipts сохраняют исходный FAILED и cleanup.
Lease closed; profile21 сохранён, freshprofile22 назначен с backup/receipt.
Разработчик в прежней задаче выполняет fix49: пассивное ожидание доказанной
ModelForm busy mask и перехода mask→toast→quiet, в исходном deadline и без
повторного Execute. Foreign masks/dialogs/owner replacement остаются отказами;
нельзя фиксировать пустой toast set до завершения загрузки как запрет появления
штатного уведомления. Требуются exact-source justification и regression tests,
после чего root повторно проверит freeze перед live. Public handler/полный план,
итоговое ревью и CLI-приёмка всё ещё открыты; цель активна.


### Freeze48: пассивное ожидание execution toast, live запущен — 2026-09-27

Повторная проверка OpenViking после перезапуска: MCP health, actor search и read
успешны. Doctor0.8.1: credentials/system-status/MCP15tools/ready PASS,
0failures; warning касается исторических aborted/transcript ошибок, текущих
отказов нет. Конфигурация не менялась.

Root проверил diff, exact ModelForm→NotifyErrMsg→NotifyMsgImpl→Ext.window.Toast
и выполнил112 tests: column-editor36,stage-observer14,execution-evidence46,
batch8,link-topology8.30/30 source hashes до/после совпали. Source commit
`b4801d39d9`: только private execution-runtime и его regression tests.
После единственного launch сохраняется dispatched evidence, original native
binding удерживается до terminal observation. Passive wait ограничен исходным
execution deadline и61500ms: только стандартные autoClose toast, без новых
жестов/close/getter вызовов. Foreign modal, mask, подмена binding/notification
или неподдержанный lifecycle дают refusal; timeout не повторяет Execute.
Toast не получает ownership: terminal proof остаётся за свежими process records
и прежними shared console guards.

Batch48 RUNNING: семь оставшихся cases, начиная code-sentinel-execute;
freshprofile21, DISPLAY=:1/headed, Chromium1246, sandbox enabled.
Root-test/source receipts и exclusive host lease сохранены приватно.
Developer idle/source frozen. Это ещё не live PASS: полный план, public handler,
итоговое ревью и автономная CLI-приёмка остаются открыты.


### Batch47: declared table/reopen FULL PASS; error toast блокирует console — 2026-09-27

Root-аудит1773 journalSHA,3 input reads/90cells,1 fresh completed execution,
полный typed6×2/12cells. Первый declared-table-execute завершён OBSERVED,
gate_passed/safe_to_continue=true. Независимый boundary receipt проверил полный
reopened source digest, mode, semantic input/output mappings before==after и
native breadcrumb epoch1 с текущей меткой JS: ObservedID, PhaseMarker.
Это первое полное declared table/source/reopen/mapping подтверждение.

Второй code-sentinel-execute FAILED: NodeReadinessTimeout «prepared node available
for process console; no mutation was authorized». Эта последняя фраза относится
к очередному шагу: журнал уже содержит execute_graph_node dispatch03:52:16.165Z.
Затем prepared node context остаётся same verified graph/unlocked, masks0,
но ui.dialogs содержит anchor_tid=toast. Root просмотрел screenshot: ожидаемая
JS_G2_EXECUTION_SENTINEL_V1 ошибка в уведомлении и красный JS-узел. Одного текста
недостаточно для terminal/process ownership, поэтому case не объявлен PASS.
Console ещё unobserved; первопричина timeout — notification в dialog guard.

Original cleanup package/logout/browser ALL PASS, terminal exit1 FAILED.
Recovery не нужен; leaseclosed, freshprofile21 назначен, profile20 сохранён.
Остальные6cases NOT_RUN. Private receipts g2-batch-47-verification.json и
boundary-verification.json. Same developer task выполняет fix48: доказанный
путь passive settlement error notification и свежего process console read,
без повторного Execute, без широкого ignore dialogs и без присвоения ownership
по тексту. Exact Message.js получен: SHA
87d2051a19fc5afe30a8cfd41d54f12f522713e6398208808a7052ec1e5cc2be;
он задаёт auto-close toast до60s, тогда как текущий console wait15s.
Это объясняет возможное расхождение budget, но подход ещё требует проверки
native lifecycle и адресных тестов. Source bodies остаются приватными.

Public JS-handler, остальная матрица, итоговое ревью и автономная CLI-приёмка
по-прежнему не завершены. Полная цель активна.


### Freeze47: актуальный native breadcrumb передан в live — 2026-09-27

Root106 tests PASS: column-editor36,stage-observer14,execution-evidence40,batch8,
link-topology8;30/30 hashes до/после. Developer commit
`7b9897677f305a4aa735eb375d1ec0dbefa77703`:3 source/test файла.
Readiness/cleanup читают текущий FLabel.FRawValue удержанного node и связывают
обе breadcrumb-кнопки через Ext DOM/_node.data.node с доказанными tree/wizard.
Own FParentNode заменяет ошибочное предположение об own ParentNode. Graph
node/data/cell, label.parent/FCell.parent и wizard model identities проверяются;
label/TID закреплены на host epoch открытия, внутри epoch изменение запрещено.
Новое открытие разрешает актуальную метку даже при reused WizardTreeNode.
Тесты покрывают renamed/foreign/spoofed/reused/duplicate/rollback/accessors и
serialization observer. Shared runtime guards не ослаблены.

Exact source dependencies (Trees/MapTree/NavigationPanel/Unit/Label/Vertex/
Model/mxClient) получены со стенда и подтверждают новые own caches. Чтение
исходников не засчитано live-проверкой конкретных instances.

Batch47 RUNNING: те же8 cases начиная с declared-table-execute,
freshprofile20,DISPLAY=:1/headed/Chromium1246/sandbox. Source receipt,
root-test receipt и host lease сохранены приватно. Developer idle/source frozen;
текущий browser процесс принадлежит root. Public handler, полный G1–G7/J01–J27,
ревью и CLI-приёмка ещё не выполнены; цель активна.


### Fix47: новые bindings проверяются по exact client sources до live — 2026-09-27

При source-review промежуточного fix47 root обнаружил неверную own-data
проверку ParentNode. Прямо полученный `bg/lib/Trees.js`:97–98 определяет
ParentNode как prototype getter к FParentNode; own descriptor ParentNode
отсутствует. Это гарантировало бы новый ложный readiness refusal. Разработчику
передано исправление на подтверждённое сохранённое поле FParentNode и требование
тестов с реальной формой getter-backed tree; live47 ещё не запускался.

Root получил exact public client sources через прямой GET со стенда:
MapTree.js содержит ModelNodeTreeNode/WizardTreeNode, Trees.js — базовое дерево;
ModelForm→mxgraph/Common→NodeAbstract/Unit/Label/Vertex — владение меткой;
TabForm view→navigation/NavigationToolbar→NavigationPanel — breadcrumbs.
NavigationPanel.js236/321 создаёт `_node` в config соответствующего контрола;
NodeAbstract.js84 создаёт FLabel с самим node, Unit.js16 сохраняет parent.
Hashes/байты/полные тела и исходные404 отдельных guessed class paths сохранены
в private preview-source-40/fix47-*-source-manifest.json;404 не объявлены PASS.
Тела клиентских исходников в Git не добавлены. Доказательства определений
не заменяют последующую live-проверку конкретных native objects.


### Batch46: clean Apply и full output PASS, stale breadcrumb требует fix47 — 2026-09-27

Первый declared-table-execute достиг полного правильного6×2 output. Root проверил
1308 journalSHA,2 input reads/60cells,1 fresh completed execution/12outputcells.
Отдельный boundary receipt подтверждает оба Apply: isSyncing/needsSync=false,
removed/dirty/phantom/dropped/unknown=0; три input/output mapping close с proof
неизменного native/semantic graph. Все закрылись штатно, специальная unlock
reconciliation ветка46 **не была вызвана live** (source tests остаются её evidence).

После existing_wizard_opened readiness90s истекла. Единственный failed predicate:
node_breadcrumb. Все проверки native/document/workflow/tab/nodeGUID/root/class/
ancestry прошли; фактическая метка JS: ObservedID, PhaseMarker вместо прежней
JavaScript. Root просмотрел screenshot и проверил точный snapshot. Это stale-label
предположение observer, не доказательство подмены узла. Cleanup тоже не подтвердил
закрытие за60s; original package/logout=false,browser=true,terminal exit1
CLEANUP_UNCONFIRMED. Остальные7 запланированных cases **NOT_RUN**.

Отдельный headed recovery46 на profile19 без downloads подтвердил accountjsteach,
packages0,logout/browser PASS,packageMutation=false. Исходный FAIL не переписан.
Lease closed; freshprofile20 назначен, старый сохранён. Приватные receipts:
g2-batch-46-verification.json,g2-batch-46-boundary-verification.json,
g2-recovery-46.json. Same developer task выполняет fix47: актуальная метка из
доказанного same native node при reopening/cleanup с сохранением ownership guards;
адресные проверки renamed same node против foreign node, без повтора effects.
Public handler, G2/G3 и полный план остаются открытыми.


### Freeze46: mapping unlock и Apply sync — live запущен — 2026-09-27

Root независимо проверил100 tests PASS (column-editor36,stage-observer14,
execution-evidence34,batch8,link-topology8),30/30 hashes до/после тестов.
Developer commit `1c6c6df209c1f58c96564b6c33dddc597c80b871`:4 source/test файла.
Shared guard не ослаблен: private reconciliation принимает только exact receipt
применённого confirm_wizard_close с единственным locked:true→false; затем требует
два свежих unlocked-context samples, отсутствие wizard/dialog/mask, прежние
native node/port identities и полный semantic graph. Исходный AMBIGUOUS сохранён,
повторного Close нет. Apply/Cancel/capture учитывают own sync/needsSync,
removed queue, dirty/phantom/dropped; неизвестные accessor flags не считаются clean.
После Apply timeout не разрешает Cancel либо повтор записи.

Batch46 RUNNING, freshprofile19, DISPLAY=:1/headed/Chromium1246/sandbox.
Cases: declared-table-execute,code-sentinel-execute,declared-sentinel-execute,
code-table-mismatch,declared-sentinel-next,declared-sentinel-done,
code-sentinel-next,code-sentinel-done. Уже подтверждённый Preview отдельно
не повторяется; новый clean-Apply boundary проверяется declared-table case.
Private source receipt/root-test receipt и host lease сохранены.
Developer завершил ход и заморозил source; runtime процесс принадлежит root.
Это ещё не результат live46 и не закрытие G2/G3/полной цели.


### Batch45: declared Preview и полный выход подтверждены; reopening требует fix46 — 2026-09-27

После перезапуска Codex повторно проверены OpenViking MCP health, actor search и
read; Doctor0.8.1: credentials/system/status/MCP15 tools/ready PASS,0 failures.
Предупреждение относится к прежним transcript_unreadable/aborted запросам;
текущие вызовы успешны, настройки не менялись.

Root-аудит сохранён в приватном `g2-batch-45-verification.json`:1700 journalSHA,
3 input reads/90 typed cells,1 fresh completed execution,полный output6×2/12cells.
`declared-sentinel-preview` завершён OBSERVED: source SHA
`e0ea9794bb7e640ed0918f8bbdb48d4b0ae5b097959d248528a48ba7aa8f8749`,
owner/terminal/sentinel/gate подтверждены; safe_to_continue=true,
wizard закрыт. Объявленная схема ObservedID(integer4) и PhaseMarker(string5),
generation=false. Отсутствие sentinel в других этапах не доказывает отсутствие
исполнения.

`declared-table-execute`: свежий процесс completed, все6 строк и2 столбца
совпали с техническим oracle. Последующий `existing-mapping-baseline` отказал:
NodeProcedureStepError «The node surface changed during observation».
Поэтому весь case остаётся FAILED: полный выход не заменяет проверку
повторного открытия кода/соответствий. Root отдельно проверил journal line1700: confirm_wizard_close имеет
ui_gesture_applied; mismatch сохраняет document_id/workflow_id/node_id/surface/tid,
меняется только locked:true→false. Это локализует отказ проверки на переходе
разблокировки, но не заменяет новое пассивное подтверждение графа в исправлении.
Независимый `g2-batch-45-preview-verification.json` дополнительно проверяет
source SHA, native owner chain, объявленную схему, свежий sentinel,
единственные dispatch/observed Preview и Close, terminal и закрытие мастера.
Исходный cleanup package_closed/logged_out/browser_closed=true; отдельный
recovery не нужен. Lease переведена в closed, profile18 сохранён,
freshprofile19 назначен и ещё не создан.

В ту же developer-задачу передан fix46: исправить доказательство reopening,
сохранив ownership и запрет повторов неизвестных effects. Отдельно проверить
Apply settlement: исходный ColumnDefsMappingWizard.CreateColumnDefFormClose
ожидает TargetStore.syncAsync; Ext.sync выставляет isSyncing=true,
onBatchComplete снимает его после onProxyWrite. Закрытый editor и totalCount
сами по себе не доказывают завершение записи. Требуются пассивные проверки
sync/dirty/phantom/removed и адресные тесты; это source-confirmed gap,
но не установленная причина live-отказа45. Успешные guards43–45 сохраняются.

Public JS-handler, полная G1–G7/J01–J27 матрица, итоговое ревью и автономная
CLI-приёмка остаются открытыми. Цель активна; слияние/публикация не выполнялись.


### Freeze45: exact option и picker cleanup переданы в live — 2026-09-27

Root85 tests PASS: column-editor32,stage-observer14,execution-evidence31,batch8;
30/30 SHA совпали до/после. Developer commit
`a84e099289746028c87527bd25dc5f9486eeb8c4` —3 изменённых source/test файла.
Option ElementHandle берётся из доказанного holder, без global text locator;
перед единственным click повторяются native item/record/cache/picker/store/DOM
и hit-test. Lost reply не разрешает повтор. Cleanup различает reserved opening,
observed click response и ready picker; закрывает лишь доказанно свой expanded
picker отдельным exact trigger click, затем пассивно ждёт collapsed/hidden/quiet.
После этого свежая проверка Cancel; после ApplyDispatched разрешено только
наблюдение Apply. Исходники Ext подтверждают UI toggle при expanded; native методы
не вызываются. Закрытие/выбор bounded5s в пределах исходного budget.

Batch45 RUNNING: declared-sentinel-preview,declared-table-execute;
freshprofile18, headed DISPLAY=:1, Chromium1246/sandbox. Source commit/30pins,
root test receipt и lease сохранены приватно. Source45 не означает закрытия
G2/G3 или всей матрицы; public handler и CLI-приёмка остаются впереди.


### Batch44: trigger/picker/type-record подтверждены, выбор и cleanup требуют fix45 — 2026-09-27

Root проверил948 journalSHA, два input6×5/60cells. Native type opening ready:
все trigger predicates=true, expanded/visible/owned=true,6records/6options,
ровно1 typed option с numeric4 и labelЦелый. valueField=Value own depth0,
displayField=text inherited depth1: необходимость prototype-data lookup
подтверждена live. Receipt g2-batch-44-picker-verification.json независим от
итогового FAIL. Source44 committed fbc7e718fe, root78 tests PASS.

Следующий отдельный global regex locator отказал `Unique native column type
option unavailable`; actualcount/нетриммированный text в этом отказе не записаны,
точную причину regex mismatch не утверждаем. Own typed item уже был однозначно
доказан и сохранён в holder; повторный глобальный поиск избыточен. Option click,
Apply/Preview/Execute не состоялись. Root просмотрел screenshots: раскрытый
список перекрывает Cancel. Cleanup зарезервировал cancelDispatched, но свежий
hit-test=false запретил фактический click. Не считать dispatch receipt доказательством
UI gesture. Original cleanup package/logout=false,browser=true, exit1
CLEANUP_UNCONFIRMED; никаких внешних abort в этом прогоне не было.

Headed recovery44 на profile17 без downloads: packages0/logout/browser PASS,
packageMutation=false. Lease закрыта; freshprofile18 назначен и отсутствует.
Прежняя developer-задача выполняет fix45: exact held option ElementHandle вместо
text locator, повторная проверка identities/hit до одного click; закрытие только
своего открытого picker с bounded settlement перед Cancel, без replay или Cancel
после ApplyDispatched. Успешные field43/trigger44 guards сохраняются. G2/G3,
публичный handler и полный план остаются открытыми.


### Freeze44: native trigger передан в live — 2026-09-27

Root независимо проверил78 tests PASS: column-editor25,stage-observer14,
execution-evidence31,batch8;30/30 source SHA совпали до/после. Developer commit
`fbc7e718fe40abea5a84e56af07fedea04c30429` сохраняет3 изменённых файла:
column-editor, test, schema-probe. Canonical `;trg_picker` связан с own native
trigger через orderedTriggers/field/el/triggerWrap; один UI click с hit-test.
Opening min(5s,original budget), без повторения. Picker↔combo/store/DOM и native
record/type4|5 проверяются до option click, option/record/data identities pinned.
Только config имена valueField/displayField могут читаться через bounded data
prototype lookup; getters и guessed defaults запрещены. Подробные predicate
checks и bounded snapshots объясняют отказ без ослабления guards.

Exact ComboBoxUtils.js SHA
`798d21d2d3426c0723ed497b8255d0fcc4fb55d512c65c827e63592b8b553e34`
получен root со стенда и подтверждает inherited displayField; private manifest
preview-source-40/fix44-source-manifest.json. E2E helper919–939 также нажимает
;trg_picker, его retry-loop не перенесён; TestCafe не запускался.

Batch44 запущен: declared-sentinel-preview,declared-table-execute,
freshprofile17, headed DISPLAY=:1, Chromium1246/sandbox. Private source commit,
30pins/root-test receipt и lease записаны. Итог RUNNING; public JS-handler,
G1–G7/J01–J27 и CLI-приёмка по-прежнему не завершены.


### Batch43: field readback доказан; picker требует отдельного trigger — 2026-09-27

Root-аудит962 journalSHA, два input6×5/60cells. После единственного edtName fill
DOM уже ObservedID, caches ещё COL1; следующее пассивное чтение через~120ms
подтвердило равенство DOM/value/rawValue. edtDisplayName затем буквально равен
ObservedID во всех трёх представлениях: fill пропущен, отсутствие dispatch
проверено независимо. Placeholder был пуст. Это подтверждает fix43 на этом
поле; точное потерянное значение label42 задним числом не восстановлено.
Diagnostic helper source380UTF-8bytes доступен, root пересчитал SHA
`daeceef6c069503ca2de4963d1e2ab6f401bfc2830279c73756a91f6e71b5d51`;
это wrapper, создающий AssociatedFieldsCustom, а не полная реализация класса.

Затем один schema-type-open-0 щёлкнул тело combo. Root сделал только readonly
X11 screenshot активного headed DISPLAY=:1 (Pillow ImageGrab): поле типа
в фокусе, список закрыт. option.waitFor ошибочно использует остаток общего30min
deadline. Чтобы не тратить оставшееся время на закрытый picker, root оформил
private operator-abort receipt и завершил исключительно свой browser PID после
проверки executable/profile/parent. Первая попытка проверки argv отказала без
сигнала (Chrome хранит cmdline одной строкой); после корректного разбора проверка
прошла, SIGTERM выполнен. Дополнительных UI gestures/повтора click не было.
Original runner terminal exit1/CLEANUP_UNCONFIRMED, package/logout=false,
browser_closed=true; отказ cleanup из-за закрытой page. Это операторское
прерывание, не spontaneous browser crash и не доказательство Cancel settlement.

Отдельный headed recovery43 на profile16, без downloads: packages0,
logout/browser PASS, packageMutation=false. Lease закрыта, freshprofile17 назначен
и отсутствует. Прежняя developer-задача получила fix44: exact own native picker
trigger вместо тела combo, отдельный bounded opening, diagnostics и single effect.
Exact Ext source onTriggerClick103120 и workspace-ui comboPart2028 (`trg_picker`)
переданы как источники. Source43 сохранён в166d01077c; field/Cancel43 guards не
подлежат ослаблению. Preview/Execute declared здесь ещё не выполнены, G2/G3 открыты.


### Freeze43: исходники закоммичены, адресный live запущен — 2026-09-27

Root получил окончательный handoff и независимо выполнил72 tests PASS:
column-editor19, stage-observer14, execution-evidence31,batch8. Все30 source
SHA совпали до/после проверки. Field readback полностью пассивный: DOM плюс
own value/rawValue, без getValue/getRawValue. Единственный fill либо пропуск
уже совпавшего поля, readonly ожидание не более5s, точная bounded диагностика;
placeholder не считается фактическим значением. Cancel требует исходный baseline,
пустой removed и clean records; устаревший proxy total — только диагностика.
Один bounded function-source snapshot собственного association helper пишется
в private evidence без вызова helper и не влияет на admission.

Проверенные source/test файлы сохранены в developer branch node-javascript:
`166d01077c1b96d048367d5da90d780d36a3ce0d` —24 files, private discovery operator
и ранее проверенная internal output-opening интеграция. Непроверенные/старые
developer docs/checkpoint этим коммитом не включены. Слияния в root/product нет.

Запущен batch43: declared-sentinel-preview,declared-table-execute;
freshprofile16, Chromium1246, sandbox=true, headed DISPLAY=:1. Source commit,
30pins, root test receipt и lease закреплены приватно. Итог пока RUNNING;
этот commit не добавляет публичный JS-handler и не закрывает G1–G7/CLI acceptance.


### Batch42: native Add подтверждён, field/readback и Cancel открыты — 2026-09-27


Подготовка fix43: root получил точные статические client sources стенда;
private manifest `preview-source-40/fix43-source-manifest.json`. Ext debug SHA
`5b8f534947c4396d72aa6f264721ab8e5bf190b3284969baf8aad9785798e2c5`:
getTotalCount возвращает сохранённый totalCount, remove меняет локальные records,
успешный destroy очищает removed. Проверка Cancel должна различать эти состояния.
Root-review промежуточного fix43 также выявил недопустимое самоподтверждение
readback: Ext getRawValue пишет rawValue, getValue пишет value и через
Text.processRawValue может вызвать setRawValue. Эти методы не являются пассивным
наблюдением; разработчику передано требование читать DOM/own cached descriptors
без их вызова и проверить отсутствие таких вызовов тестом. Live43 ещё not_run.

Один Add дошёл до ready: новая запись исходного store, standalone
EditColumnDefForm, form↔record, vendor/page/controls/connection/owner — true.
Техническое edtName=ObservedID записалось/прочиталось успешно; затем
`Column field readback differs` на edtDisplayName, до Preview/Execute.
Фактическое несовпавшее значение прежний журнал не сохранил. Root проверил965
journalSHA и два input6×5/60cells. Нового подтверждения исполнения здесь нет.
При cleanup один Cancel закрыл editor и удалил новую запись; screenshots и
observer показывают baseline0/records0/added0/editor0,quiet=true. Проверка
cancel_settlement всё же осталась pending и истекла. Возможное расхождение
getTotalCount с локальным cache требует source-проверки, пока это гипотеза.
Original cleanup package/logout=false,browser=true; статус CLEANUP_UNCONFIRMED.

Отдельный headed recovery42 (profile15, без downloads): packages0,
logout/browser PASS, packageMutation=false. Source-файлы во время original
process не менялись. Прежняя задача получила fix43: установить причину field
readback и корректный критерий Cancel, добавить точные diagnostics и тесты.
Freshprofile16 назначен, ещё не создан; lease browser закрыта. G2/G3 и весь
план остаются незавершёнными.


### Freeze42: ожидание declared editor передано в live — 2026-09-27

Прежняя developer-задача завершила fix42. Root сверил30/30 source hashes
с окончательным handoff и своим receipt66 PASS (column-editor13,
stage-observer14, execution-evidence31,batch8). Native editor привязан к
единственной новой записи исходного target store; Add не повторяется.
Перед fill/click проверяются родная форма, enabled и hit-test конкретной цели;
option дополнительно принадлежит picker этого cbxDataType. Отдельный bounded
cleanup ждёт завершения Apply либо единственного Cancel и восстановления baseline.
Lost reply не разрешает replay или встречный Cancel после Apply.

Запущен адресный batch42 `declared-sentinel-preview,declared-table-execute`:
freshprofile15, Chromium1246, sandbox=true, headed DISPLAY=:1. Приватные source
pins/test receipt и lease сохранены; итог live ещё не получен. Нового public
handler и закрытия gates эта передача не означает. Повторный MCP health успешен.


### Batch41: code Preview полностью подтверждён — 2026-09-27

Первый code-sentinel-preview OBSERVED/gate_passed=true/safe_to_continue=true.
Root-аудит:1328journalSHA, три input6×5/90cells; один Preview dispatch,
sourceSHA e0ea9794bb7e640ed0918f8bbdb48d4b0ae5b097959d248528a48ba7aa8f8749;
свежее exact sentinel сообщение в owned PreviewPanel;cntErrorInfo, его hash
пересчитан независимо. Все code_checks=true,4wizarditems/1match, reciprocal
Preview form/view=true,FLoaded=true,pending=false. Один Preview Close,
успешное закрытие мастера и подтверждённый переход к следующему case.
Это положительное доказательство выполнения JS при code-mode Preview.

Второй declared-sentinel-preview отказал после единственного schema-add-0:
немедленный evaluateHandle не нашёл edtName. Root просмотрел оба screenshots:
сразу empty target/no editor, на cleanup спустя60s открыто «Добавить столбец»
и новая строка COL1. Async opening подтверждён. Original cleanup не смог закрыть
мастер при незавершённом editor; package/logout=false,browser_closed=true.
Connection/account/build здесь оставались прежними. Отдельный headed recovery41
на profile14: packages0/logout/browser PASS, no packageMutation; lease закрыта.

Root прочитал client ColumnDefsMappingWizard.DoAddMappingColumn: AddDefault→
LoadTargetItem→new EditColumnDefForm с Records=[new record], AddMode=true,
View.show(). Источники/хеши приватно в preview-source-40/declared-columns-manifest.json.
Прежней задаче назначен fix42: bounded read-only ожидание единственной исходной
Add-операции, native form→new owned target record binding вместо Ext ownerCt,
исключение foreign/duplicate формы и отдельный cleanup pending editor без replay.
Следующий freshprofile15 после handoff/tests. G2/G3 целиком, public handler,
остальные gates и CLI-приёмка ещё не завершены.

### Freeze41 проверен, адресный headed run запущен — 2026-09-27

Root53tests PASS,28 окончательных SHA сверены; протестированные source файлы
не менялись. Подтверждённая source цепочка использует unique dense bounded
FWizardItems.FItems/FPages→FWizard.FWizardForm. До Preview code_owned обязателен;
отказ записывает effect_dispatched=false. Lazy Preview controller допускается.
Connection/account/build и foreign-dialog boundary проверяются при наблюдении;
loss завершает ожидание сразу, без reconnect/replay, с финальным evidence.

Freshprofile14 назначен после проверенного recovery40; прежние сохранены.
Batch41 запущен на pinned Chromium1246, headed DISPLAY=:1/sandbox, cases
code-sentinel-preview,declared-sentinel-preview. Source receipt g2-batch-41-source.json;
результат живого прогона ожидается. Полный batch/план и CLI-приёмка не завершены.

### Batch40 завершён: привязка страницы и разрыв сессии — 2026-09-27

Original result CLEANUP_UNCONFIRMED. Root проверил959journalSHA и два полных
input6×5/60cells. Один code Preview отправлен; во всех новых observations
code_owned=false. Ни положительного sentinel, ни terminal Preview не доказано;
второй declared case не запускался. В момент cleanup Connected=false,
accountjsteach/build7.4.2 не изменились; DOM содержит диалог восстановления
сессии. Причина и точное время разрыва не установлены. Frozen40 observer
проверял native objects, но не connected/dialog, поэтому сохранил owner=true.
Клик восстановления/повторение Preview не выполнялись, браузер закрыт.

Отдельный recovery40 на profile13, headed/no-download: packages0,
logout/browser=true, packageMutation=false. Browser lease закрыта. Это не
переписывает исходный cleanup FAIL. Проверка документов PASS.

Прежней задаче назначен fix41: source-supported WizardItem.FPages→FWizard,
bounded local arrays, отдельные predicate diagnostics; connection/dialog boundary
и отказ без reconnect/replay. До Preview необходимо подтвердить code_owned,
чтобы не запускать эффект с заведомо непроверяемой связью. Наличие lazy
FPreviewController до первого Preview не требуется. Следующий freshprofile14
после финального handoff/tests; полный scope плана остаётся незавершённым.

Дополнительное source-наблюдение: JavaScriptCodeWizard.PageExitAsync сохраняет
Code и вызывает Verify(); ExecutePreviewAsync сохраняет Code, активирует входы
и вызывает Preview.ShowPreview→ExecuteAsync. Это помогает диаграмме G2,
но не доказывает серверную семантику Verify и не заменяет живые probes.

### Batch40 частично: visible page отличается от controller view — 2026-09-27

Batch40 RUNNING, lease занят. Новые changed-state snapshots полезны:
Preview rect900×675 внутри viewport, ancestors/native el подтверждены,
owner_verified=true, code_count1, но code_owned=false; pending сменился наfalse.
Текущий frozen observer не раскладывает code_owned на отдельные проверки,
поэтому конкретное несовпадение live ещё не доказано. Preview не повторялся.

Root дополнительно прочитал WizardExtForm.JoinWizard со стенда: он переносит
CHILD pages из controller.CardContainer в основной CardWizardPanel и сохраняет
их в WizardItem.FPages. Сам controller хранится в WizardItem.FWizard; коллекция
outer wizard — FWizardItems.FItems (ordinary array по Classes.js).
Таким образом, видимый page не обязан быть FView самого JS controller.
Это структурное расхождение требует привязки через единственный original
WizardItem.FPages и reciprocal FWizardForm, затем прежний Preview controller.
Эти runtime equalities ещё NOT_RUN. Разработчику разрешён пока только анализ;
28 frozen исходников не менять до окончания живого процесса40.

Дополнительные источники/хеши сохранены в preview-source-40/additional-manifest.json.
WizardExtForm:c001607c5b4b78cd4b0292e03445ebde04138cadff5d9eb5da7b34e9117b556b;
Classes:5cdedf823352d570f67c997021fc108318cf8e05f2eab1dca31b1f8a8e8583d8.
Ожидание исходного Preview ограничено прежним deadline10min; cleanup ещё нет.

### Freeze40 проверен, адресный headed Preview run запущен — 2026-09-27

Разработчик передал28 файлов и остановился; root сверил все SHA.
Root48tests PASS; финальное изменение terminal predicate отдельно9tests PASS.
Preview требует native цепочку code page→wizard/preview form, reciprocal DOM,
видимость с ancestor/viewport проверкой и local FLoaded=true. Свежая ошибка
до завершения Preview не разрешает ранний terminal/Close. Changed-state journal
ограничен16 записями на исходный dispatch; финальный snapshot сохраняется всегда.

После recovery39 выделен freshprofile13; старые профили сохранены. Batch40
запущен на том же pinned Chromium1246, headed DISPLAY=:1/sandbox, cases
code-sentinel-preview,declared-sentinel-preview. Source receipt g2-batch-40-source.json.
Тесты доказывают логику observer, а live equalities/результаты ещё ожидаются.
Полный batch и остальные требования плана не объявляются выполненными.

### Preview40: native связь установлена по исходникам стенда — 2026-09-27

Root прочитал клиентские JS самого стенда через read-only HTTP GET:
Uses→RegistrationWizards→JavaScriptWizardVendor→JavaScriptCodeWizard.
Браузер или RPC не запускались. Семь исходников и URL/SHA manifest сохранены
приватно в preview-source-40; исходники Loginom в Git не копировались.

JavaScriptCodeWizard.InitPreviewController создаёт FPreviewController;
CodePreviewController.Init сохраняет FPreviewForm, а ShowPreview вызывает
FPreviewForm.View.showModal(scope). Ext ownerCt до wizard поэтому не является
достаточной моделью принадлежности. BaseWizard.SetWizardForm сохраняет
FWizardForm; ViewController связывает view.Controller и controller.FView.
Предлагаемая проверка: owned code page.Controller.FWizardForm===original wizard,
page.FPreviewController.FPreviewForm.FView.el.dom===exact Preview root плюс
обратная связь Preview control.Controller===preview form. Это source proof,
фактические equality на живом стенде ещё NOT_RUN. Разработчик получил источники.

SHA JavaScriptCodeWizard:ab0d3102321e00f38b5bd373c995bba67eb5beab1c10f1c349e8a7109b4362c7;
CodePreviewController:3a419d3e2735ea4ee113fe8567c3c87d47b604d6ae55181fa1995d9347d3d34a;
BaseWizard:a4b0238c9a2985cc2d5d7cd09a51aaabd17cb523349fad028eeab92d6cac3325;
ViewController:69a209465619fa56670ab767b040c91b00b5cec950c3b56a9151f4dfcd00dbb8.
Следующий адресный прогон начнёт с code/declared Preview; повторение уже двух
полных table PASS отложено до проверки изменённой логики. Полный scope сохраняется.

### Batch39: Preview виден, native ownership не подтверждён — 2026-09-27

Прогон завершён CLEANUP_UNCONFIRMED. Первый code-table-execute повторно прошёл
полностью. Root проверил1658journalSHA, три input6×5/90cells и output6×2/12cells.
Оба Alt-drag сохранили прежние связи, новые автоматические связи отсутствуют.

После единственного Preview: original wizard owner=true, preview_visible=true,
preview_owned=false, pending=false, messages[]. Десятиминутное read-only ожидание
не изменило этот результат. Текущая проверка DOM/Ext ownerCt недостаточна для
наблюдаемого окна; правильная native связь ещё не установлена. Отсутствие
распознанного sentinel не доказывает отсутствие выполнения JavaScript.
Screenshot просмотрен, но содержимое окна скрыто маскированием evidence.

Original cleanup отказал из-за неподтверждённого владельца Preview;
package_closed/logged_out=false, browser_closed=true. Отдельный headed recovery39
на profile12 без download/package mutation подтвердил packages0 и logout/browser
PASS. Оригинальный результат не переписан. Browser lease закрыта.
Прежней задаче назначен fix40: bounded native Preview diagnostics/строгая
проверка принадлежности, changed-state наблюдения и регрессии; без повторения
эффектов и без ослабления до data-tid-only. Следующий live — freshprofile13.
Public handler, остальные G1–G7/J01–J27 и CLI-приёмка не завершены.

### Batch39 частично: Alt-drag двух узлов подтверждён — 2026-09-27

Текущий процесс batch39 всё ещё RUNNING. Root проверил две palette delta:
links0→0 и1→1, каждый раз ровно один новый JS; прежние links совпали полностью.
Оба drag вернули24steps и подтверждённые mouse/Alt release. Далее выполнялся
явный connect. Первый code-table-execute снова gate_passed=true; output6×2
подтверждён. Второй case прошёл прежнее место unexpectedlink и отправил Preview.

Preview sentinel пока ожидает terminal под исходным case deadline10min:
повторных Preview/Execute нет. readJavascriptStage читает только owned wizard/
preview messages; фактическое отсутствие распознанного результата не доказывает
отсутствия выполнения. Cleanup ещё не запускался; lease/browser остаются занятыми.
Приватная квитанция g2-batch-39-partial-verification.json — частичная, не finalPASS.

### Freeze39 проверен, headed batch39 запущен — 2026-09-27

Root65 tests PASS;27 итоговых SHA проверены, tested source неизменён.
Один Alt-drag освобождает mouse→Alt в finally; неподтверждённый release
останавливает UI cleanup, оставляя browser close. Before/after native graph
обязан подтвердить ноль новых связей после palette; затем один явный connect
от original JSInput и полная проверка сохранности старого графа.
Выбор узла не используется как доказательство подавления автосвязи.

Freshprofile12/Chromium1246, headed DISPLAY=:1/sandbox, новый UUID/evidence
batch39. Process запущен, live-результат ожидается. Статус полного G2/G3 и
прочих требований плана не изменён; публичного handler/CLI-приёмки пока нет.

### Автосвязь: найден штатный Alt-drag — 2026-09-27

Root просмотрел screenshot38: второй JS визуально связан с первым JS.
Причина не должна объясняться только selection: historical helper
`tests/toreview/helpers/al/autobinding_helpers.ts` выбирает ближайший порт
по геометрии (dx191/dy63), а не selection. Эти числа не сертифицируются для7.4.2.

[Официальная справка портов](https://help.loginom.ru/userguide/workflow/ports/index.html)
прямо описывает отключение автоматической связи при удержании Alt в процессе
перетаскивания. Локальный e2e checkout чистый на
`7a41b5adbb9c45dca8d756a8220615554301c2e0`: tests/helpers/workflow/node.ts:140–157
сравнивает Alt=false/link exists и Alt=true/no link; bg/helpers/workflow/node.ts
передаёт modifiers.alt в drag. E2E здесь только прочитаны, не запускались.
SHA256 tests/helper:4a632266cc9b525a26d6df9ff6632987a219fdef7278199ad25554102a1d076f;
bg/helper:c50802326ad3b32bcceb35e892606bae5726eaaafab0fd5d833f26dfb6ebea64.

Разработчику переданы источники для fix39: явный Alt-drag с гарантированным
release и сохранением uncertain-effect semantics, затем штатное соединение
original input. Strict topology guards остаются. Live Ubuntu Alt ещё NOT_RUN;
selection-only гипотеза не считается достаточным исправлением.

### Batch38: первый полный code-table case PASS — 2026-09-27

Freshprofile11/freeze38. Native wizard settlement подтвердил1disabled-delete
mask/0blockers. Первый code-table-execute case завершён gate_passed=true:
новый Execute, полный output6×2, повторное открытие мастера, code-mode и полный
source readback, Close и повторный mapping read. Root проверил1600journalSHA,
три input6×5 reads/90cells,12outputcells, source SHA d2af9d87e75042c5debf58475d92060b359d888fcfce51082c1e3e13e01efcb2,
семантику input/output mappings до/после (исключены лишь volatile record_id).

Второй code-sentinel-preview остановлен link-js-input: palette создала
unexpected link. Новый второй JS обнаружен; topology guard отказал до
дальнейшей настройки. Это не полный batch PASS. Source selection/точное ребро
требуют разбора; возможная привязка к предыдущему JS пока гипотеза.
Прежней задаче назначен fix39: доказать/подготовить original input selection
перед palette gesture, не ослаблять graph allowlist и не исправлять unknown
эффекты удалением. Следующий live после handoff — freshprofile12.

Оригинальный cleanup38 впервые на этом полном пути: package_closed/logged_out/
browser_closed=true; отдельная recovery не нужна. Browser lease закрыта.
Public handler, остальные G1–G7/J01–J27 и автономная CLI-приёмка ещё впереди.

### Freeze38 проверен, headed batch38 запущен — 2026-09-27

Root64 tests PASS;25 SHA итогового handoff проверены, tested source неизменён.
Один classifier с прежними15 native/cache/geometry checks используется в
основном wizard readiness и новом settlement. Посторонние masks блокируют;
ограничение12 диагностических записей не сокращает проверку остальных masks.
Проверена сериализация inspector для браузера без host-side imports/closures.

На freshprofile11/Chromium1246 запущен batch38: headed DISPLAY=:1/sandbox.
Результат ожидается. Source/mapping readback, полный batch и G2/G3 не закрыты.
Дополнительно root-аудит batch37 сверил оба чтения входа6×5 (60cells total)
с SHA-pinned CSV, включая пробелы/Unicode/целые: PASS. Квитанция приватная,
g2-batch-37-input-verification.json; original cleanup остаётся неуспешной.

### Batch37: wizard найден, одна маска блокирует settlement — 2026-09-27

Freshprofile10/freeze37. Root-аудит:1252 journal refs SHA, один свежий launch,
полный JS output6×2/12cells PASS. Повторный Setting отправлен один раз.
Settlement timeout90s: surface=wizard, native_owner_verified/root_visible=true,
breadcrumb7 при workflow5, dialog0, mask_count1. Cleanup повторно наблюдал
то же состояние и завершился timeout60s без повторного Setting. Original
cleanup package/logoutfalse, browserclosedtrue, CLEANUP_UNCONFIRMED.

Root просмотрел screenshot: открыта JavaScriptColumnsWizard. В исходном
javascript-live.mjs уже есть строгое native-различение disabled-delete-header
mask, а новый wizard-settlement считает все x-mask blockers. Это подтверждённое
расхождение кода; принадлежность конкретной live37 mask ещё требует диагностики,
по одному screenshot она не доказана. Назначен fix38: переиспользование точного
classifier с owner/cache/bounds guards, bounded mask diagnostics и regressions;
не игнорировать произвольные masks. Public guards сохраняются.

Отдельный headed recovery37 без download/package mutation: packages0,
logout/browser PASS, проверено root. Следующий live — freshprofile11 после
handoff38; текущий браузер закрыт. Полный batch/G2/G3 ещё не завершены.

### Freeze37 проверен, headed batch37 запущен — 2026-09-27

Root повторил60 tests: PASS; проверены24 SHA итогового handoff37,
протестированные файлы неизменны. Runtime сохраняет pending Setting opening
до подтверждённой передачи владения runner; read-only wizard/deactivation
settlement предшествует shared roots read. Cleanup учитывает незавершённое
открытие и не повторяет отправленные Setting/confirmation/Close.

Freshprofile10, прежний Chromium1246/sandbox, DISPLAY=:1/headed, новый UUID
и evidence g2-batch-37. Browser process запущен; результат ожидается.
Для root-аудита подготовлен приватный verify-batch-evidence.py: на batch36
подтверждены1276journalSHA, свежий same-node launch и12cells6×2.
Это проверка конкретной пробы, не завершение общего плана/CLI-приёмки.

### Batch36: JS output6×2 впервые прочитан полностью — 2026-09-27

Shared диагностика `node-procedure.mjs` и её regression test закреплены отдельно
в developer branch: `86cd64e2ef` (`fix(runtime): retain bounded node observation refusal`).
Root сверил оба файла с freeze36,101tests PASS; live36 подтвердил полезность
нового error code/binding reason. Остальные operator/docs changes в этом коммите
не включены; перенос в основной продукт и выпуск не выполнялись.

Freshprofile09/freeze36. После нового Execute read-only settlement подтвердил
переход graph→Views с исходным native output. Root независимо проверил все12
ячеек: ObservedID integer1..6 exact, PhaseMarker string JS_G2_TABLE_V1,
полная6×2 таблица, filter=false; все1276 уникальных journal refs SHA совпали.
Это подтверждает конкретный code-table output, но ещё не весь кейс/G2/G3.

Следующий existing-source-readback отказал сразу после private Setting opening:
PREPARED_NODE_CONTEXT_CHANGED / surface_unavailable. Cleanup snapshot уже
WizardTreeNode; close-owned-package timeout60s, package/logoutfalse,
browserclosedtrue. Отдельный headed recovery36 без download/package mutation:
packages0, logout/browserPASS. Оригинальная попытка остаётся CLEANUP_UNCONFIRMED.

Прежней задаче назначен fix37: bounded native wizard/deactivation settlement
после единственного Setting click и корректный owned wizard cleanup без replay.
Публичные guards сохраняются. Следующий live только после handoff на freshprofile10.

### Freeze36 проверен, headed batch36 запущен — 2026-09-27

Root:192 tests PASS,23 итоговых SHA проверены, протестированные файлы неизменны.
После единственного Visualizers click добавлено read-only ожидание native Views
и исходного port под opening deadline. Roots refusal сохраняет ограниченную
диагностику. Cleanup проверяет surface и исключает повтор уже отправленного
Table return. Новое выполнение batch36: freshprofile09, Chromium1246,
headed DISPLAY=:1/sandbox. Live-результат пока ожидается; G2/G3 не закрыты.

### Повторная проверка OpenViking — 2026-09-27

После перезапуска Codex фактически выполнены MCP health, actor search и read
найденной записи: PASS. Doctor0.8.1 подтвердил credentials, system/status,
15 MCP tools, все подсистемы ready; 0 failures, 1 warning о прежних hook errors
и отменённых запросах. Текущие операции памяти ими не заблокированы.
Конфигурация и разрешения не менялись. Прежняя задача fix36 активна;
root проверяет переход Views и защиту cleanup от повторного navigation после
потерянного ответа. Browser lease closed_logout_verified, новый live не начат.

### Batch35: toolbar материализован, переход Views не подтверждён — 2026-09-27

Freshprofile08/freeze35. Input/source/auto-link и новый JS Execute completed
подтверждены. Body click раскрыл NodesControls/Visualizers; затем один click
Visualizers618,246 вернулся. Но это НЕ доказательство открытия Views:
сразу после штатный observer отказал `Node procedure roots could not be observed`.
Root просмотрел screenshot: ещё graph/WorkFlowTreeNode, breadcrumb пуст;
точная причина отказа roots пока не сохранена. Все1046 journal refs SHA проверены.
Output6×2 NOT_READ.

Original cleanup: package_closed/logged_out=false, browser_closed=true,
close-owned-package wait60s timeout. Отдельный headed recovery35 на profile08
без download и без повторения opening/Execute: packages0, logout/browser PASS,
packageMutation=false. Оригинальный cleanup не переписан в PASS.

Fix36 назначен прежней задаче: сохранять ограниченный roots refusal outcome,
подтверждать реальный native Views node/port после единственного click под
исходным deadline; отдельное read-only settlement и корректный owned cleanup.
Не повторять неизвестный opening. Исторический bootstrap из памяти не выполнять.
Следующий live после handoff — новый profile09. Root source/worktree refs прежние.

### Freeze35 принят root; headed batch35 — 2026-09-27

Разработчик фактически выполнил fix35, но финальный ответ ошибочно вернулся
к историческому bootstrap. Root проверил завершение задачи и исходники,
повторил29 затронутых tests после последней правки runtime (PASS); ранее96
PASS, прочие tested files неизменны. Syntax21 и worktree docs validator PASS.
Handoff35 с21 SHA составлен root по реальным файлам. Новый enrollment не нужен.

Private selection теперь требует доступный Visualizers, а не только selected.
При selected+toolbar absent отправляется один guarded body click; active output
повторно проверяется до жеста, одна DOM replacement допускается только для
сохранённого native cell. Hover fallback удалён. Повтор unknown effect запрещён.

Batch35 запущен headed на freshprofile08 с новым UUID/evidence; результат
ожидается. Публичный handler и полная приёмка остаются впереди.

### Batch34: выбранный JS без панели, hover не раскрыл Visualizers — 2026-09-27

Freshprofile07/freeze34, новый JS Execute completed/verified/owner_verified.
Root проверил свежесть launch и все1066 journal refs SHA.
Passive opening остановлен через90s после единственного hover632,232;
opening_dispatched=false, hover_dispatched=true. Повторного Execute не было.
Output6×2 NOT_READ. Cleanup package/logout/browser=true, process exit1.

Root просмотрел work-refusal.png и snapshot: выбранный синий JS имеет active
output, но NodesControls/Setting/Visualizers/Launch действительно отсутствуют.
Native selection не доказывает наличие панели. Прежняя root-предпосылка
«selected исключает body-click» была слишком строгой: shared reader делает
body-click также при отсутствии open_node_views. Причина исчезновения панели
ещё не установлена.

Fix35 назначен прежней задаче: один guarded private body selection для
материализации нужных controls при selected+toolbar absent, аналогично
существующему private Setting-selection; это новое предусмотренное действие,
а не повтор неизвестного click. Сохранить active output admission/owner/hit,
запрет Execute/Setting effects, ограниченный deadline и добавить диагностику
control count/visibility/hit. Новый live только после handoff на freshprofile08.

### Freeze34 и headed batch34 — 2026-09-27

Root повторил45 operator tests и51 output procedure/context/navigation tests:
96 PASS. Проверены21 hashes, после тестов исходники неизменны. Private JS
Visualizers opening проверяет активный native output0, сохраняет selected node,
допускает один guarded hover скрытого toolbar и один opening click; затем
используется штатный Table reader с проверкой node/port ownership.
Публичные descriptors/allowed_actions не менялись, read не вызывает Execute.

На freshprofile07 запущен новый batch34, предыдущий06 сохранён. Полный output
и downstream mapping/reopen пока ожидаются; G2/G3 остаются открыты.

### Batch33: первое подтверждённое Execute JS, output ещё не прочитан — 2026-09-27

Freshprofile06/freeze33. Exact native auto-link принят с effect_dispatched=false;
input mapping, мастер, code mode и полный source readback подтверждены.
Source SHA `d2af9d87e75042c5debf58475d92060b359d888fcfce51082c1e3e13e01efcb2`.
Свежий Execute: baseline groups1/2/3 → новая group4/process4.1,
execution `1790464285727-mc37kcdyj3m:223:4`, completed/verified/owner_verified.
Root сверил launch gesture, отличие от baseline и все1042 journal refs SHA.

Проба остановилась ПОСЛЕ исполнения: readPassive→openNewOutputTable попытался
generic body click при JS allowed_actions=[] после возврата из process console.
Ошибка UI reference unsupported. Выходная6×2 таблица пока NOT_READ; это не
PASS аналитического результата или G2/G3. Cleanup package/logout/browser=true.

Fix34 назначен прежней задаче: перед пассивным output reader использовать
существующую private native selection, затем штатное открытие Table; проверить
маршрут open_node_views и active output до UI effects. ReadPassive не должен
вызывать Execute. Public code guards не менять. Следующий live после handoff
на freshprofile07; browser33 закрыт.

### Freeze33 и headed batch33 — 2026-09-27

Root проверил18 SHA, 38 operator/topology/batch tests и39 shared node-target
тестов:77 PASS. После тестов все operator hashes неизменны. Native snapshot
до drag сохраняет старые node/data/FCell/ports; после добавления shared
create-delta допускает только новый JS и точную исходную связь0→0 либо её
отсутствие. Принятие наблюдённой связи не отправляет connect; пустой input
использует прежний single gesture. Admission baseline одноразовый.

Batch33 запущен headed на новом profile06, предыдущие профили сохранены.
Результат ожидается; весь G2/G3 scope и запрет повторных неизвестных эффектов
сохранены. Публичный JS handler ещё не реализован.

### Shared file-delivery исправление зафиксировано — 2026-09-27

В node-javascript отдельный commit `a66ca792c9`: artifact-discovery,
executor download diagnostics и два адресных test файла. Все4 SHA совпадают
с freeze32, который прошёл живую доставку CSV и полный input oracle.
Root дополнительно выполнил58 delivery/verification tests: PASS; вместе
с прежними70 =128. Operator/topology и stale worktree checkpoint не включены.
Проверка native auto-link33 продолжается в прежней задаче; нового live пока нет.
Это source commit в worktree, не merge/release или готовность JS-handler.

### Batch32: input PASS, созданный JS уже имеет видимую связь — 2026-09-27

Freshprofile05, freeze32. Download SUCCEEDED, import и полный typed input6×5
подтверждены; root независимо сверил все30 значений/типы/порядок и пробелы,
как после import, так и после passive reread перед первым case. Все905 journal
refs SHA проверены. Очистка package/logout/browser=true, process exit1.

Первый code-table-execute остановлен в connectInput до явного connect:
`JavaScript single input/output baseline differs`. Снимок created-node уже
содержит rendered edge JSInput|Output_Data-0|JavaScript|Input_Data-0.
Это наблюдение DOM, а не достаточный native proof для принятия связи.
Вероятное авто-соединение при palette drop требует проверки полного native diff.
JS source/Execute ещё не выполнялись.

Назначен fix33 той же задаче: полный baseline nodes/ports/links до drag,
проверка точного delta после; уже созданная правильная связь принимается только
при доказанном сохранении всего прежнего графа, без второго connect. Чужие,
лишние или изменённые связи дают отказ. Пустой исход сохраняет прежний single
connect path. До handoff новый live не запускается; следующий профиль06.

### Freeze32 и новая серия — 2026-09-27

Same-owner busy непосредственно перед Refresh теперь ожидается read-only с
исходным held binding/deadline55s, затем заново проверяются directory/context/
control/native generation. Максимум16 preflight, gesture один; unknown click
не повторяется. Изменены artifact-discovery и его адресные tests.
Root проверил16 SHA freeze32 и70 тестов: PASS. Разработчик отдельно сообщил98
PASS discovery/delivery/download/verification. Это ещё не live-подтверждение.

Новый batch32 запущен headed на freshprofile05, прежний04 сохранён. Свой новый
UUID/server folder/evidence; попытка31 не повторяется. Результат ожидается.

### Batch31: отказ перед Refresh, JS не запускался — 2026-09-27

Свежий profile04, freeze31, headed Chromium1246. Подготовка input остановилась:
ready/loadCount4/empty-parent → все context predicates true → native readiness
loading=true, same-owner FileStorageForm mask. Ошибка
DISCOVERY_REFRESH_NATIVE_CHANGED возникла до Refresh dispatch.
artifact.verify NOT_APPLIED; общий delivery AMBIGUOUS после upload.
Не повторять прежние upload/download; server UUID path сохранён в evidence.

Проверены 45 journal refs SHA256. Cleanup package/logout/browser=true,
process exit1, аварии браузера не наблюдалось. До cases выполнение не дошло.
Той же задаче передан bounded fix32: различить native replacement и same-owner
busy непосредственно перед Refresh, ограниченное read-only ожидание и полная
повторная проверка до единственного gesture. Следующий live — после handoff,
новые UUID/evidence и profile05; профиль04 не переиспользовать.

### Повторная проверка памяти и batch31 — 2026-09-27

После перезапуска OpenViking: MCP health, actor search и точное чтение
batch_execution_design.md успешны. Doctor: 0 failures, 15 MCP tools,
credentials/system/status/ready PASS; одно предупреждение о прежних ошибках
журнала. Конфигурация не менялась. Историческая память не заменяет checkpoint.

Root повторил 30 операторских тестов: PASS, проверил все16 SHA freeze31.
Назначен свежий profile04 с отдельной квитанцией; profile03 сохранён.
Запущен headed batch31: один input,11 независимых JS cases,30min предел,
исходные guards и общий cleanup. Результат пока ожидается; G2/G3 не закрыты.

### Отдельное предусловие CLI model catalog — 2026-09-27

Read-only сверка product/models.json: у provider openai есть gpt-5.6-sol и
gpt-6-astra, но нет требуемого планом gpt-6-sol. Это снимок build-time, не
результат authenticated OAuth model-list; доступность gpt-6-sol пока не
проверена. До CLI-приёмки проверить реальный разрешённый каталог и точное
разрешение model ID. Не подменять модель автоматически и не выдавать проверку
другой моделью за prescribed acceptance. JS discovery может продолжаться.

### Live30: selection/source/Next наблюдены, G2 ещё открыт — 2026-09-27

Freshprofile03, unchanged operator29, Chromium1246: status OBSERVED, process0.
Полный typed input и mapping подтверждены; selection допустил одну новую DOM
shape при сохранённых native owner/cell. Мастер открыт, режим code установлен,
контрольный source прочитан целиком с SHA256
`e0ea9794bb7e640ed0918f8bbdb48d4b0ae5b097959d248528a48ba7aa8f8749`.
Next UI transition terminal/owner verified, но sentinel не найден:
**execution=ambiguous, gate_passed=false**. Отсутствие сообщения не доказывает,
что JS не исполнялся. Все668 journal references SHA проверены.
Cleanup package_closed/logged_out/browser_closed=true, crash не было.

Следующий этап назначен той же задаче разработчика: bounded batch независимых
G2 cases в одном fresh-profile heldcontext, общий проверенный input и новый
JS-node/UUID/source binding на каждый случай. Один общий30min предел, прежние
phase deadlines, no replay неизвестных UI effects, общий cleanup. Подтверждённый
UI transition с отсутствующим sentinel не приравнивать к потерянному dispatch;
такое наблюдение не закрывает G2 и допускает только проверенное закрытие draft
перед независимым следующим узлом. Profile03 после этого запуска не переиспользовать.

### Доказана зависимость crash от рестарта профиля — 2026-09-27

Exact1246 `chromium1246-restart-matrix/report.json`: три fresh profiles,
каждый запускался в трёх отдельных процессах. Первые3PASS; все6 последующих
REUSE завершились native crash (4SIGSEGV,2SIGTRAP). Контроль fresh-per-process:
**9/9PASS**,22bytes и1500ms survival. Все local browsers закрыты. Это установление
условия воспроизведения, не доказательство конкретной ошибки native lifetime.

Discovery адаптирован к уже существующему product lifecycle: отдельный fresh
profile на попытку, как managed-entry attempts/randomUUID. Assignment/host lease
переназначены на `javascript-discovery-profile-03`; receipt
`profile-reassignment-03.json` содержит прежний assignment SHA и основания.
Profile02/старые данные сохранены; они не очищались. Это не retry прежнего
server effect. Trial30 code-sentinel-next начат с unchanged freeze29 и новым
UUID/evidence; результат ещё ожидается. Для следующей попытки нужен новый
профиль, а не повторное использование03 после download и рестарта.

### Live29: SIGSEGV на1246; проверка повторного профиля — 2026-09-27

Operator29 freeze13 и22 operator tests PASS, но live не дошёл до selection:
Chromium1246 закрылся при download/saveAs. Outcome AMBIGUOUS, cleanup исходного
прогона не подтверждён;41 journal refs SHA проверены. Fresh dump
`957fc655-cbca-4fbc-8851-28e8c8bdbd5d`: PID894822, exception11/SIGSEGV,
faultaddr0, RIPchrome+0x44941db. Это не прежний SIGTRAP; общая причина неизвестна.
Следовательно обновление1246 **не доказало устранение crash**. Результаты
local15PASS и live28PASS сохраняются как ограниченные наблюдения.

Отдельный headed recovery29: packages0, logout/browserClosed=true, без
package mutations и без повтора неопределённого download. Следующая диагностика
не меняет прежние server files или исходный profile02.

[Playwright42506](https://github.com/microsoft/playwright/issues/42506) описывает
аналогичный crash при повторном persistent profile на Edge152/Windows; это
гипотеза, не доказательство нашей причины. Root начал exact1246 local matrix:
три группы по три отдельных browser processes с reuse против fresh-each.
Все headed/sandbox=true; проверяются bytes и1500ms post-save survival.
Прежняя15-file матрица выполняла пять downloads внутри каждого одного процесса
и не проверяла последовательные рестарты. Product managed-entry создаёт
fresh attempt profile; discovery operator повторно использовал assignedprofile02.
Решение по профилям — только после результатов и сверки product lifecycle.

### Live28: Chromium1246 прошёл download; DOM selection отказ — 2026-09-27

Infrastructure зафиксирована отдельным commit **58d85fe07c** в node-javascript:
17 файлов dependencies/pins/packaging/credits/MCP ownership tests/docs.
Незавершённые operator/shared discovery changes в этот commit не включены.
Root не выполнял merge/cherry-pick в продуктовую ветку или выпуск.

Новая связка прошла реальный upload/download157bytes с точным SHA256,
полный typed input6×5 и input0 mapping. Аварии Chromium нет. JS GUID
`f263f739-ba85-4385-b98b-584470434edb`; storage новой пробы
`/jsteach/js-g2-6ae16eee-7cea-4500-8143-49846c25a0d5`.
После единственного private body click оператор отказал в open-wizard:
`Private selection DOM changed` (dispatch/returned/refused записаны).
Это не доказательство смены native node: требуется различить обычную
перерисовку selected shape и реальную потерю owner. JS source не вводился.

Все648 references проверены SHA256 по полным journal lines с LF.
Cleanup package_closed/logged_out/browser_closed=true, recovery не нужна.
Назначен operator29: доказуемая привязка нового DOM к сохранённым native
workflow/graph/node/GUID/cell после выбора, без повторного click; отдельно
закрыть известные private reopen/execute paths до следующих G2/G3 cases.
Общий public JS deny не изменять. G2/G3 и весь план остаются открытыми.

### Source gates перед live28 — 2026-09-27

Root повторил operator/shared suites плюс новый MCP-contract: **123 PASS**.
Bridge, managed-shutdown, action-catalog-lifecycle: **23 PASS**; отдельный
catalog suite: **11 PASS**. Прежние отказы этих четырёх suites в среде задачи
разработчика не воспроизвелись. Evidence: `operator28-tests.txt`,
`browser-1246-runtime-regressions.txt`, `browser-1246-action-catalog.txt`.
Freeze27 всех13 операторских/shared файлов совпал; новые dependencies/product
pins/session config дополнительно закреплены в `g2-operator-28-source.json`.

Начата live28 `code-sentinel-next` на assigned profile02 и exact1246. Это новая
независимая проба с новым UUID/evidence, не replay прежнего upload/download.
Результат и cleanup ещё ожидаются; не считать запуск закрытием G2.

### Exact1246: реальные MCP paths и staging PASS — 2026-09-27

После перевода MCP-owned integration ветки на продуктовый stdio transport:
`browser-1246-integration-02.txt` — **2 PASS, 0 FAIL**, process exit0 за7.7s.
Оба браузера headed/sandbox=true, download/upload bytes, picker scoping,
geometry, reload/new tab подтверждены; оставшихся fixture Chromium процессов
нет. Source hashes до последующей сверки неизменны. Managed explicit context
ownership сохранён, продуктовый shutdown не ослаблялся. Первая leak-проба
остаётся failed cleanup и не заменяется этим результатом задним числом.

Shared stageResources(flavor=cli) собрал `resources-1246-01`; bundled Node
выполнил verifyResources и независимую сверку product fields/runtime sources:
**PASS4375files, mismatches=[]**. Manifest SHA256
`cc6aa31baeb0426ea0fadcc143d26245b8630d087580b08f89912179e54fd736`.
Evidence: `stage-1246-01.txt`, `resources-1246-01-verification.json` в campaign.
Это staging/source acceptance, не compiled CLI бизнес-приёмка или Desktop build.
Live Loginom на новой связке ещё не запускался; следующий шаг — завершение
source handoff/checks и новая независимая G2 проба с новым evidence directory.

### Новый MCP: интеграционная проверка и cleanup — 2026-09-27

Root запустил existing browser-downloads.integration.test.mjs с exact1246,
новой связкой MCP/Playwright, DISPLAY=:1, LOGINOM_DOCK_TEST_HEADED=1.
Оба режима подтвердили download/upload/geometry/navigation assertions, но
MCP-owned browser остался после finally; **общий PASS не засчитан**.
Source freeze шести файлов до/после совпал. Evidence: campaign
`browser-1246-integration.txt`, `browser-1246-integration-source.json`,
`browser-1246-integration-cleanup.json`.

Installed coreBundle.js:createConnection создаёт BrowserBackend без dispose
callback; Context.dispose освобождает listeners/tabs, но не браузер. CLI backend
передаёт закрывающий callback. Existing test использовал in-process API и для
MCP-owned варианта, хотя продуктовый createBridge запускает CLI через stdio.
Разработчику передана проверка реальных ownership paths: stdio для MCP owner,
переданный context + явный close для managed. Исправление ещё не проверено.
Зависший собственный local-fixture Chromium закрыт SIGTERM после проверки
точных PID/PPID/profile; тестовый Node завершился. Это forced cleanup, не
штатное завершение. Loginom и его пакеты в этой проверке не открывались.

Во время подготовки OpenViking read дважды дал timeout15s; повторный Doctor
показал timeout /mcp при исправных authorization/systemstatus/ready. Работа
была приостановлена. Затем MCP health и чтение **той же** URI прошли за <1s
без правки настроек; точная причина транзитного сбоя не установлена.

Официальные native архивы154.0.8037.0 скачаны и executable hashes измерены:
Windows `e3390ab4c5d43b720a4aac16cb5c3889857a449d1aaeeda4ec86005beb98ff37`;
macOS arm64 `ae4d66517f6879a70239c073f7be3d3b4d82bb3158938c6cb456bcd66f8f386e`.
Provenance сохранены в campaign, native execution NOT_RUN.

### Перезапуск Codex и exact1246 — 2026-09-27

Повторная MCP health/actor search и установленный Doctor: PASS, 0 failures.
Авторизация, system/status, 15 MCP tools и /ready подтверждены. Единственное
предупреждение относится к прежним ENOENT чужих rollout; конфигурация не менялась.

`chromium-1246-matrix-report.json`: exact Chromium1246/154.0.8037.0 прошёл
три независимых headed запуска, 15/15 local blob файлов с точными bytes;
все процессы exit0. Linux executable SHA256
`1e0652a37f41d22ca22066c40896398cb7acce71f2746028061064369b299ab9`.
Это локальная диагностическая проверка; managed/MCP Loginom acceptance нового
комплекта ещё предстоит. Source operator27 и прежние неопределённые эффекты
не повторялись.

Root установил MCP0.0.82 в client worktree с pinned Node (npm exit0, changed3).
Разработчик продолжает согласование pins, config, staging и проверок в той же
задаче; root готовит платформенные executable hashes из официальных архивов.
Экспорт chrome://credits/ выполнен exact1246 с новым Playwright в видимом браузере,
sandbox=true: 768 sections, 8454009 UTF-8 bytes; браузер штатно закрыт.
Text SHA256 `cea255da4312bb6d32ec752e911c2074f5fba89463d773e6c004f5b56e1dc36d`,
gzip SHA256 `7113fe981e2d1031f3c40cc7408231dd918bef487d9a2e36ad466a68fc0c6507`.
Native Windows/macOS acceptance этим не подтверждается.

### Сравнение версий Chromium — 2026-09-27

`chromium-version-matrix-report.json`: по три независимые копии profile02,
до пяти local blob22bytes download на запуск, same Playwright1.63-alpha,
headed/sandbox=true,1500ms post-save наблюдение. Chromium153.0.8010.12:
два FAILED до первого подтверждённого download, один PASS5. CfT154.0.8037.57:
три PASS, все15 файлов точны. Это проверка зависимости от версии, не доказательство
конкретного upstream fix; sandbox/защита скачивания не отключались.

Diagnostic binary154.0.8037.57 SHA
`e528b77a8b250c48a5bbd7aeeabbc2813940c0a2fe39b1b11fbaf1f01fb04f18`, official
CfT URL/metadata сохранены в `cft-154-diagnostic-pin.json`/`cft-available-builds.json`.
Он не принят как product pin и не использовался для G2 Loginom.

Primary npm metadata: @playwright/mcp0.0.82 закрепляет playwright/core
`1.64.0-alpha-1789764292000`, Chromium1246/154.0.8037.0; стабильный Playwright1.63.0
всё ещё содержит Chromium1243/153.0.8010.12. Root начал скачивание **точного1246**
для отдельной диагностической проверки; результат154.0.8037.57 на него не переносится.
Developer делает read-only аудит согласованного обновления dependencies/lock,
release pins, resource verification и Linux acceptance. Источники27 frozen;
продуктовые версии пока прежние. До нового G2 нужны точная browser-проба и
согласованное решение по связке, без обхода проверки pins оператора.

### Operator27: busy settlement PASS, Chromium crash повторился — 2026-09-27

После preflight поправки root повторил122 теста PASS, freeze13/syntax. Private
selection теперь отклоняет descendant Execute/Preview/port/control; body/icon
с точным владельцем допускаются. Live27 до этой проверки не дошёл.

На profile02 download снова завершился SIGTRAP (PID816917, 21:38:51.838Z).
Смена профиля **не является надёжным исправлением**. Перед этим впервые live
подтверждён same-owner busy settlement: ready/loadCount4 → busy/loading4 →
ready/loadCount5/count2/file_ready, без Refresh/upload replay. UI157bytes видны,
download gesture SUCCEEDED, saveAs target_closed; hash не подтверждён.
Все41 journal references проверены. Путь этой отдельной пробы сохранён:
`/jsteach/js-g2-6d4cd820-1ab1-4f1e-b0d7-6650c3b7aaf7`.
Headed recovery27: packages0, logout/browserClosed=true, без package mutations.

Локальная диагностическая матрица на шести отдельных копиях profile02:
`download_bubble.partial_view_enabled=true` — 3/3 PASS; false — 2/3 PASS,
одна SIGTRAP. Все пробы headed, sandbox=true, same pins, blob22bytes, с1500ms
наблюдением после сохранения. Следовательно отключение панели не доказано
как исправление и не применяется к продукту/исходному профилю.

CfT official metadata от2026-09-26 перечисляет Stable154.0.8037.57. Root готовит
отдельную локальную пробу этой версии для сравнения; product pins, runtime и
operator27 пока не меняются. Не переносить результаты другого бинарника на
Chromium1243/153.0.8010.12. Developer выполняет bounded offline source/crash audit.

### Operator27: preflight selection audit — 2026-09-27

Первый source handoff27 заменил неприменимый generic selection отдельным
private native body click и наблюдением Setting. Root повторил121 адресный
тест PASS, но **live27 не запускал**: `shape.contains(hit)` допускает попадание
во вложенный Execute/Preview/port overlay, если Setting ещё недоступен.
Это риск неверного действия, а не наблюдённое исполнение JavaScript.

Разработчику возвращена одна конкретная поправка до freeze: проверять ближайший
`data-tid`/владельца hit отдельно для body и Setting; descendant Execute должен
давать ноль кликов, собственный body/icon — допустимый выбор. Общий UI deny
не менять. На момент записи задача разработчика активна; требуется обновлённый
handoff и повтор адресных checks перед первой live27. Source manifest27 ещё нет.

Дополнительно отмечены неготовые downstream paths: `reopen()` требует generic
begin_wizard, Execute при невыбранном узле может попасть в generic body selection.
Они не вызываются в следующем `code-sentinel-next`, но должны быть исправлены
до соответствующих G2/G3 trials; готовность всего operator/плана не заявляется.

### G2 operator26: fresh profile PASS, generic selection deny — 2026-09-27

На unchanged freeze13 operator25 новый выделенный профиль подтвердил download
и bytes/hash CSV, полный typed input6×5 и двухсторонний input0 mapping5. JS GUID
`4856d23f-c0d9-4cb6-8c72-1e15447762da`; source/storage этой отдельной пробы —
`/jsteach/js-g2-64ff0659-3f76-4f1f-93fb-ca07761d9d13`. Source JS не вводился.

Отказ до открытия мастера: `Prepared graph node has no observed selection point`.
Journal652: prepared node verified, graph/unlocked, body и label visible/enabled,
оба `interaction.state=point_observed`, но **allowed_actions=[]**. Общий UI deny
JavaScript действует штатно; `selectPreparedGraphNode` требует разрешённый click
и поэтому неприменим для этой discovery-пробы. Screenshot подтверждает отсутствие
Setting, а не маску/потерю native owner. Все652 journal references SHA проверены.

Все штатные cleanup flags true: package_closed/logged_out/browser_closed.
Recovery26 не нужна. Это успешное прохождение прежнего download участка в новом
профиле, не доказанное устранение первопричины Chromium crash.

Разработчику назначен operator27: отдельный private diagnostic selection с
native/DOM/owner/hit-test binding и одним жестом под прежним opening deadline,
по аналогии существующих operator port/Setting clicks. Generic UI deny сохраняется;
не подделывать allowed_actions и не добавлять преждевременный public handler.
После выбора обязательно повторное same-node наблюдение Setting. Следующий live
только после source handoff; G2/G3 остаются открытыми.

### Изоляция Chromium download crash и новый профиль — 2026-09-27

В `~/.config/google-chrome-for-testing/Crash Reports` найдены minidumps21/23/25.
Offline-разбор metadata/registers/frame pointers: общий RIP `chrome+0x850d1fb`
после `int3`, совпадают 12 последовательных return addresses. Сохранённый EDX
после `sub 6`: 21/25=`0xcdcdcdc7`, 23=`0x7468`; все проходят unsigned `>3`
в trap. Это подтверждает одинаковый путь отказа, но не причину неверного состояния.
Exact-tag Chromium153.0.8010.12 source и disassembly согласуются с гипотезой
`DownloadItemImpl::IsDone`/`InternalToExternalState`; matching symbols пока нет.
Архив официальных Google Chrome symbols скачан, но Build ID
`f911272ebbb5182d003df59dfe2ab1cd347e18ea` отличается от используемого CfT
`801e223ae2df0c3aa4d000dd388ed8048a864b9e`: символизация им недопустима.
Dumps/heap не отправлялись наружу; runtime source не менялся.

Дополнительные независимые **headed** local download trials, same pinned
Chromium/Playwright/sandbox, без Loginom и без повторов прежних server effects:

- 01: HTTP + fresh profile — PASS22bytes; 02: HTTP + campaign profile — PASS22bytes.
- 03/04: invalid diagnostic HTML (`URL` в onclick разрешался как document.URL),
  download не возник; эти пробы ничего не доказывают о blob-пути.
- 05: исправленный `window.URL`, blob22bytes + campaign profile — SIGSEGV,
  RIP `chrome+0x4449bca`, другая сигнатура; равенство причин с SIGTRAP не доказано.
- 06: тот же valid blob + fresh profile — PASS22bytes; 07: повторное открытие
  профиля06 и новое независимое blob-скачивание — PASS22bytes.

Профиль `connection-preflight-profile` сохранён для диагностики. Для продолжения
discovery назначен `javascript-discovery-profile-02`; private assignment/lease
обновлены с backup и `profile-reassignment-02.json`. Это изоляция наблюдаемого
сбоя, не доказанное исправление Chromium и не ослабление продуктовых guards.
Operator26 запущен на неизменённом freeze13 operator25, отдельные draft/storage.
Текущий результат проверять по `g2-operator-26/report.json`; запуск не равен PASS.

### G2 operator25: Chromium SIGTRAP подтверждён — 2026-09-27

Root повторил 118 адресных тестов, freeze13 и syntax: PASS. Same-owner busy
settlement исправлен под исходным deadline, перед Refresh повторяется полный
контекст и удерживаемый native store. Regression N→N+1 исключает засчитывание
фоновой загрузки за результат Refresh; замена store до dispatch даёт ноль кликов.

Live25 сразу увидел готовый CSV157/loadCount5/count2, поэтому ветка busy/Refresh
не была задействована. Download gesture SUCCEEDED; saveAs завершился closed-target.
Private process log впервые подтвердил **exitCode=null, signal=SIGTRAP** в
21:11:27.448Z. Download event — 21:11:27.273Z; page/context закрылись до запроса
operator cleanup. Crashpad сообщил `elf_dynamic_array_reader.h:64 tag not found`;
это не доказательство причины crash. JS/import не запускались. Upload/download
не повторять; путь `/jsteach/js-g2-4468f056-303e-40fe-972f-542cddf4848f` сохранён.

Отдельная headed recovery25: packages0, logout/browserClosed=true,
packageMutation=false. Затем независимая локальная HTTP download-проба с новым
профилем, теми же Chromium/Playwright и sandbox=true прошла: saveAs, точные22bytes,
exit0/signalnull. Это ограниченная проверка базового скачивания; она не воспроизводит
Loginom/blob/старый профиль и не устанавливает причину SIGTRAP. Evidence:
`chromium-download-diagnostic-01/report.json` в приватной кампании. Raw logs вне git.

Разработчик выполняет read-only разбор download/launch пути; source25 frozen.
Следующий live run пока не назначен: сначала ограниченная диагностическая проба
для локализации crash. G2/G3 и весь план остаются незавершёнными.

### G2 operator23/24: download interruption и transient busy — 2026-09-27

После перезапуска root снова проверил MCP health, actor search и read записи
`operator24_diagnostic_launch.md`: PASS. Doctor 0.8.1: 0 failures, прежнее
предупреждение о недоступных исторических rollout. Настройки не менялись.

Operator23 подготовлен с native `selectPreparedGraphNode` перед поиском Setting
и единым 90-секундным opening deadline; 116 адресных тестов PASS. Live source
`javascript-live.mjs` SHA `5401250fe91b080061bbe28ad3049e386a6774d70dd792713f0208ac1684c219`.
Оба прогона использовали одни frozen13 исходники. До открытия JS wizard они
не дошли, поэтому исправление раскрытия Setting пока live не проверено.

Operator23 подтвердил Refresh собственной файловой панели: native loadCount4→6,
появление CSV и UI bytes157. Но на download.saveAs page/context/browser закрылись
до operator close request; target_closed=true, события page_crash нет. Причина
не установлена. Upload/download не повторялись. Отдельная headed recovery23:
packages0, logout/browserClosed=true, packageMutation=false. Серверный путь
`/jsteach/js-g2-9a452876-5845-4477-9206-e7d00e8881bb` сохранён, hash неизвестен.

Operator24 — самостоятельная новая проба с приватным `DEBUG=pw:browser` log.
Здесь браузер завершился штатно: exitCode0, signal=null, после operator cleanup;
package_closed/logged_out/browser_closed=true. Recovery24 не требуется.
До download gesture не дошло: readiness ready=true/loading=false/loadCount4,
затем refresh preconditions сохранили все owner predicates, но увидели busy mask
`MF;TF-2;FileStorageForm`. Получен `DISCOVERY_EMPTY_DIRECTORY_UNCONFIRMED`.
Это подтверждённый переход ready→busy между двумя наблюдениями, не crash.
Путь `/jsteach/js-g2-02238f91-5242-49c5-9fbb-0f7f0e7a2c52` сохранён.

Разработчику назначен operator25: ограниченное исходным deadline ожидание
same-owner busy и повторная полная проверка контекста до единственного Refresh,
без replay upload/download и без ослабления guards. Root продолжает владеть
браузером; следующая проба только после source handoff. G2/G3 остаются открытыми.

### G2 operator22: input-port proof PASS, Setting absent — 2026-09-26

Root повторил **110 адресных тестов PASS**, syntax/freeze13. Live operator SHA
`0cba99eaf3da0700eb3e1a454615cb47ee8ce790210d54a77fe402b279f3342f`.
Download и серверные bytes подтверждены; imports.text дал полный typed6×5 PASS.
JS GUID `d7eef805-0b69-46b6-a16b-de9c1b5d5050` соединён input0. Отдельный
native port reader подтвердил полный same-node schema/mapping пяти колонок,
RowID Integer; port GUID `9dc72a3f-56bf-3bfc-84ec-f979daf4da6b`.

После закрытия port wizard основной мастер не открыт: `Unique bound Setting
control required`. GUID и `MF;TF-1;Graph;JavaScript` до/после совпадают, node
rendered=true. Screenshot показывает JS с выделенным входным портом без Setting.
Зависимость Setting от hover/selection пока гипотеза; разработчик проверяет
штатный механизм открытия и добавляет наблюдаемое UI-раскрытие control.
JS source/Next ещё не отправлялись.

**Все штатные cleanup flags true**: package_closed/logged_out/browser_closed.
Recovery22 не нужна. Новый fsync lifecycle journal содержит download и затем
явно запрошенное оператором закрытие → page_close/context_close/disconnected;
crash/неожиданное закрытие не наблюдались. Это не объясняет прерывание operator21.
Следующий source handoff/live — operator23; матрица полного плана остаётся открытой.

### G2 operator21: ожидание загрузки PASS, download interrupted — 2026-09-26

Root повторил **107 адресных тестов PASS**, сверил freeze11 и syntax.
Оба новых waits используют настоящие functions с poll flag; regression проверяет
ложный initial sample и deadline. В headed operator21 исправление подтверждено:
native store loading=true/loadCount4/count1 перешёл к loading=false/loadCount5/
count2/file_ready=true. Появилась уникальная `sales.csv`, UI bytes157 проверены.
Refresh и повторный upload для этого результата не потребовались.

После `download_gesture_result=SUCCEEDED` получен **AMBIGUOUS /
DOWNLOAD_BROWSER_CALL_FAILED**, cleanup=false. До создания failure snapshot
page/context/browser уже закрыт; оператор не мог завершить package/logout.
Причина закрытия не установлена. User/system journal в 23:44:34 MSK содержит
завершение `app-org.chromium.Chromium-730200.scope`; в проверенном интервале
нет записей OOM/segfault, что не доказывает отсутствие сбоя. chrome-debug.log
в профиле отсутствует. Пользователю задан фактический вопрос о ручном закрытии,
ответ пока не получен; молчание не трактуется как подтверждение причины.

Upload/download gesture выполнены однократно. Серверный hash неизвестен;
путь `/jsteach/js-g2-a7457f4f-fc5a-480c-b8b3-a20a62da374e` сохранён. Повторять
эти эффекты нельзя. Отдельная headed recovery21 подтвердила packages0/logout/
context close без package mutations. Разработчик исследует download lifecycle
и добавляет доказательства close/crash/error cause для source handoff operator22.
До JS/import этот run не дошёл; G2/G3 не закрыты.

### G2 operator20: доказана ошибка Playwright wait predicate — 2026-09-26

Freeze11/syntax и **105 адресных тестов PASS** повторены root. Новый headed
operator20 опять остановился до JS, но доказал точную причину мгновенных waits:
в два новых `page.waitForFunction` передавалась **строка arrow-функции**.
Установленный `playwright-core/lib/coreBundle.js` (client60579/server24345)
передаёт `isFunction=false` для строки и возвращает результат eval(expression)
без вызова; сам function object truthy. Это локально проверенный контракт,
не гипотеза о скорости сервера. Прежние VM fixtures неверно моделировали его.

Journal20: discovery before/terminal показывают loading=true и собственную
`FileStorageForm.bg-mask-message`, отказ `DISCOVERY_READY_CHANGED`. Cleanup
before20:40:08.670Z/after20:40:08.676Z оба ready=false, blocker «Загрузка»;
60-секундный срок не исчерпан, ожидание ложно завершилось примерно за 6ms.
Upload20 отправлен однократно, серверные bytes неизвестны; повтор не разрешён.
Исходный cleanup unconfirmed, browser закрыт. Отдельная headed recovery20
подтвердила packages0/logout/context close без package mutations.

Назначено исправить оба waits на реальные functions с poll/diagnostic режимом
того же predicate. Regression обязан моделировать фактический Playwright
контракт и проверять false initial sample, ожидание settlement и исходный
deadline. Следующий source handoff/live — operator21. Native empty-store proof
operator19 остаётся действительным; закрытие G2/G3 из этих проб не следует.

### G2 operator19: native empty-store proof — 2026-09-26

Root сверил freeze 11 файлов, syntax и повторил **102 адресных теста PASS**:
discovery16/delivery51/download13/verification7/workflow-activation7/operator8.
Live SHA `b6da61a61a86519c6596c806eb9eb81a18f16be23a3889a3563ffaed9624cced`;
shared discovery SHA `4d72a6e51e0a79236953882aa9e2741f3f76c7aeabb5e45a26815523743c6d5d`.

Новый headed operator19 подтвердил empty-directory binding: native
`bg.filedialog.FileStore`, loadCount4, count/total/materialized1, полный cache,
единственная parent-row `..`, собственный empty placeholder, masks/dialogs0.
После `artifact_empty_directory_pending` получен
`NOT_APPLIED / DISCOVERY_EMPTY_DIRECTORY_UNCONFIRMED`; Refresh не подтверждён,
download не отправлялся. Upload отправлен один раз, bytes остаются неизвестны.
Storage `/jsteach/js-g2-dca583e7-176f-46ca-94af-ff26ea6ec85e` сохранён;
загрузку этой попытки не повторять. Root проверил **40/40** journal references.

Cleanup допущен по исходному native package/workflow, но activation вернул
`NOT_APPLIED / Workflow activation blocked`. Исходный итог снова
`CLEANUP_UNCONFIRMED`, browser закрыт. Отдельная headed recovery19 подтвердила
0 packages, logout/context close без package mutations. До JS/import не дошло.

Разработчику переданы точные observations для operator20: диагностировать
конкретный ранний отказ refreshDirectory (control уже наблюдался enabled/visible),
снять bounded inventory блокеров activation и ждать их settlement в исходном
cleanup deadline. Guards, uncertain upload и запрет повторных эффектов сохранить.
Перед этим разработчик ошибочно завершил один ход старым memory bootstrap;
основное задание восстановлено в той же задаче, память healthy, нового enrollment
нет. Исторические memory instructions не являются текущим заданием.

### G2 operator18: upload verification readiness — 2026-09-26

Исправлены conditional initial page admission (только после same-node input-port
proof) и отдельный cleanup deadline. Полные journal events заменены в report
ссылками line/SHA; fsync journal и полная acknowledgement сохранены. Восемь
адресных тестов, syntax/freeze девяти модулей PASS; live SHA
`05069877d8cbc21e813a94cfc924307375550a105f84df2a4ecebe3537c373d0`.

Headed `code-sentinel-next` остановился **до импорта и JS**. Новый upload
отправлен один раз; receipt `upload_native_input_settled` требует проверки
серверных bytes. Немедленный download verification вернул `NOT_APPLIED /
DISCOVERY_GRID_BLOCKED`, итог delivery — **AMBIGUOUS, inspection_required**.
Повтор upload запрещён. Папка `/jsteach/js-g2-f8d8b105-d7fc-4688-8de1-1970af704758`
создана; наличие/bytes серверного файла в этом прогоне не подтверждены.
В screenshot список пуст. Связь отказа с устранением медленного report write —
гипотеза для проверки semantic readiness, не доказанная первопричина.

Исходный cleanup снова unconfirmed: `Owned draft changed`, хотя packages1,
Package1/path empty/running false; активная вкладка — StorageDirectoryTreeNode,
не прежний workflow. Browser закрыт. Отдельная headed recovery18 подтвердила
0 packages, logout/context close без package mutations. Разработчику назначено
исправить readiness download и безопасный возврат к собственному workflow
для cleanup; проверку принадлежности пакета не ослаблять.

Root независимо проверил **38/38** line/SHA references against actual journal
bytes, report 30016 bytes. Следующий новый evidence directory — operator19
после source handoff. Изменения admission из operator18 до live JS не дошли;
они пока подтверждены только локальными тестами. Полный scope плана сохранён.

### G2 operator17: вход проверен, условная первая страница — 2026-09-26

После source handoff в прежней задаче выполнен headed `code-sentinel-next`.
SHA оператора `ed6493c7895676e869bf9d83cbce5cdab326f8c6dfa56930b00dbfcb45b5d496`;
freeze всех девяти модулей — приватный `g2-operator-17-source.json`. Перед запуском
root повторил шесть адресных тестов и syntax checks: PASS.

В собственном context успешно созданы UUID storage directory и серверная копия
157-byte CSV с закреплённым SHA, без overwrite. Штатный `imports.text` выполнился,
полный typed input **6×5 PASS**: все значения, порядок, exact integers и пробелы.
JS GUID `62507b20-f268-4eab-8a7b-23136b462108` создан, input0 link подтверждён
graph diff. Storage `/jsteach/js-g2-108ed9e6-c209-4b58-abc0-c95c9ad240bc` с CSV
оставлен как диагностический ресурс; удаление не выполнялось.

У connected JS первая native page — **JavaScriptColumnsWizard index0**, четыре
индикатора. У прежнего unconnected node первой была TuneDataSourceInputPortWizard.
На deadline все ownership/readiness predicates истинны, blockers пуст,
единственный отказ — `input_page_expected`. Ни JS source replacement, ни
Next/Done/Preview/Execute с probe source не выполнялись. **G2 не закрыт**.

Operator завершился `CLEANUP_UNCONFIRMED`: close снова потребовал initial input
page с истекшим opening deadline; package/logout не подтверждены, browser закрыт.
Отдельная headed `g2-recovery-17.json` в 20:11:45Z подтвердила account `jsteach`,
**0 packages**, logout и context close, без package mutations. Она не заменяет
неуспешный cleanup исходного прогона.

Разработчику передано исправление admission условной первой страницы с отдельным
подтверждением input mapping, самостоятельного once-only cleanup deadline и
избыточного копирования полного journal в report (33MB report/17MB journal).
Полные fsync receipts должны сохраниться. Следующий live — только после нового
source handoff, новый evidence directory operator18; source/probes G4 run16
повторять не требуется. Серверная ОС, полный G1–G7 и CLI-приёмка остаются открыты.

Пользователь попросил перепроверить причину и сообщил, что ничего не менял.
Журнал владеющего Desktop App Server подтверждает для той же задачи:
`17:17:27.465Z starting → 17:17:42.445Z failed`, затем
`18:29:50.697Z starting → 18:30:04.867Z ready`; в `18:39:08.004Z` снова ready.
Прежний отказ запуска больше не является текущим блокером.

В turn `01a0df04-a426-7b50-babf-b43bbe5dc48e` инструменты реально появились,
но `mcp__openviking__health` и `mcp__openviking__find` оба отклонены до обращения
к адаптеру: `MCP tool call requires approval, but approval policy is never`.
Причина текущего отказа — несовместимость требуемого подтверждения инструмента
с политикой задачи, а не доказанная недоступность OpenViking.

Проверены локальный helper регистрации и фактическая конфигурация: per-tool
approval settings отсутствуют; registration config SHA совпадает с текущим файлом.
Все 15 инструментов свежего каталога адаптера не имеют `annotations`, включая
`readOnlyHint`. Штатный root MCP health успешен; pinned Node получил HTTP 200
за 1.001 с, прямой curl — 200 за 1.405 с. Отдельный Doctor в том же ходе встретил
сетевой timeout и отказ VPN-проверки CLI launcher; это сохранено как отдельное
наблюдение, не как установленная причина прежнего старта или текущего policy refusal.
У процесса адаптера и координатора одна network namespace. Проверки не меняли
VPN, proxy, credentials или sandbox.

Исходная транспортная первопричина неизвестна: adapter заменяет upstream error
на общее сообщение, а transport logger отключён. Длительность около 15 секунд
согласуется с timeout, но не доказывает его. Улучшение безопасной диагностики
требует отдельного изменения исходников/поколения; текущие pins не переписаны.

Пользователь явно разрешил **все операции памяти, включая запись**. На idle-границе
в существующем worktree установлено `mcp_servers.openviking.default_tools_approval_mode
= "approve"`; согласованно обновлён config SHA регистрации:
`54994d52ba430d7acb76517fa71cd52cda20a3658dda1a2fb2e9cd5aab8617d9`.
Прежнее предложение только девяти операций чтения заменено этим решением.
Global config, approval_policy и sandbox не менялись. Побайтная проверка
подтвердила сохранение capture state, activation, routing receipt и hooks;
новый enrollment не выполнялся, cursor не сбрасывался. Backup и receipt —
приватный `.local/project-memory/rollouts/20260926.2/approval-all-20260926/`.
Свежий App Server `config/read` увидел настройку; проверка hooks сохранила пять
trusted project hooks и отсутствие original memory hooks в worktree. Доверие
hooks само по себе не подтверждает разрешение вызовов MCP.

Пользователь перезапустил Codex. Root health и точное чтение ранее извлечённого
результата успешны. В той же задаче разработчика запущен turn
`01a0df0d-b86b-73e2-ab7f-b1778a97a466`: проверить actor health/find/read после
перезапуска, затем продолжить bounded диагностику wizard-ready11. Разработчик
в 18:50:41Z подтвердил успешные health, find (один результат) и exact read.
Доступ обеих задач восстановлен, продуктовая работа возобновлена.
Исходники адаптера и его generation не менялись.

После восстановления проверено и новое извлечение: root actor find/read вернули
`viking://user/kiselev/peers/-home-george-git-loginom-ai-agent/memories/events/2026/09/26/operator_pass14_ready.md`.
Запись содержит сообщение разработчика после перезапуска и правильный SHA
оператора14 `20a2553407442e4231a832659f6f7772f4f427182c27c2b439218f8f8b494f45`.
Это дополнительное доказательство доступности нового общего контекста из root;
ручной remember/capture не запускался. Summary другой записи назвал cleanup15
успешным, что противоречит его report: cleanup был подтверждён отдельным
recovery15. Канонические reports/checkpoint имеют приоритет над summary памяти.

## Продолжение G1 после восстановления памяти

Operator12 запущен координатором в headed Chromium под `jsteach` на прежнем
стенде и профиле. Проверки native ownership мастера (GUID, исходный `FModelNode`,
workflow, tab, package ancestry и root) прошли. Единственное false-условие —
`no_visible_blockers`: начальные маски загрузки исчезли, к deadline осталась
ровно одна `.x-mask.x-border-box` над `TuneDataSourceInputPortWizard;colTargetDelete`,
размер 30×27. Поэтому полное отсутствие любой `.x-mask` не является корректным
условием готовности этой страницы. Нельзя исключать все маски: разработчику
поручена точная проверка принадлежности маски disabled control.

Private evidence: `g1-operator-12/report.json`. Результат прогона —
`CLEANUP_UNCONFIRMED`, browser closed, Close не отправлялся, logout не подтверждён
самим оператором. Отдельный readonly recovery12 подтвердил аккаунт `jsteach`,
0 пакетов, успешные UI logout и закрытие browser context; evidence —
`g1-recovery-12.json`. Source insertion, Next, Done, Preview и engine probes не выполнялись.

Operator13 (operator SHA256
`fa4f618d047035b8529d3f63088b04ae908b8714758bd77467f112a556313675`)
подтвердил native `Ext.grid.column.Action`, `disabled=true`, exact DOM identity,
цепочку владельцев grid/page/wizard и совпадение геометрии оставшейся маски.
Не прошли только предполагаемые `empty_mask` и `no_dialog_role`; реальная маска
содержит дочерние элементы и role. Эти предположения не подтверждены source и
не должны считаться доказательством загрузки. Разработчик уточняет структуру
штатной Ext mask; blanket-исключение всех масок не вводится.

Report13: `CLEANUP_UNCONFIRMED`, browser closed, Close/Next не отправлены.
Recovery13 отдельно подтвердил `jsteach`, packages0, logout/context close.
Private evidence — `g1-operator-13/report.json`, `g1-recovery-13.json`.
Режим `--inspect-pages` подготовлен, но ещё не запущен. G1 не закрыт.

Operator14 подтвердил исправление маски: cached native mask identity,
отсутствие видимого сообщения и все ownership predicates прошли; overlays1,
blockers0. Source SHA оператора —
`20a2553407442e4231a832659f6f7772f4f427182c27c2b439218f8f8b494f45`.
Штатный Ext `Element.mask()` содержит presentation/message subtree:
[официальный исходник](https://docs.sencha.com/ext/6.2.0/classic/src/Element.js-1.html).
Live проверка cache identity подтверждена на самом стенде.

Первый `--inspect-pages` остановился до Next: поиск `input[type=radio]` вернул
0 при существующих Ext indicators, index=null. Это неверное предположение об
HTML controls, не доказательство отсутствия страниц. Single Close и подтверждение
успешно вернули исходный WorkFlowTreeNode/граф с тем же JS GUID
`8f607965-3a27-4b81-96a6-5ef070f5e3ee` (`wizard-close-settled`). Cleanup затем
истёк в `wait-owned-package-ui`: код использовал observation до закрытия мастера
и fallback visibility только по размерам. Разработчику переданы исправления
наблюдения native indicators и обновления observation после Close.

Report14 остаётся `CLEANUP_UNCONFIRMED`; отдельный recovery14 подтвердил
`jsteach`, packages0, logout/context close. Evidence: `g1-operator-14/report.json`,
`g1-recovery-14.json`. Editor/source/engine не проверены; G1 остаётся открытым.

Operator15 (SHA256 `e1cf0472b21357ef621c55dc4abeef6855529f180518d4b5dd20a35c7b24a128`)
подтвердил переходы 0 `TuneDataSourceInputPortWizard` → 1
`JavaScriptColumnsWizard` → 2 `JavaScriptCodeWizard`. Всего пять native
`Ext.form.field.Radio`, их `InputEl` — HTML `input type=button`; ownership и
согласование native checked/DOM прошли. Два Next выполнены по одному.

Полный CodeMirror read: 2 строки, 130 UTF-8 байт, SHA256
`6eb6e2f9e8395c9b00185f1fa9f77cae18c041784f2b2033da946e74aebecc64`,
`source_redaction_changed=false`; owner `JavaScriptCodeWizard;cmpCodeCM`.
Настройки: readOnly=false, mode=javascript, indentUnit=4, indentWithTabs=false,
smartIndent=true, electricChars=true. Это чтение исходного шаблона, не проверка
ввода, исполнения или сохранения. Версия CodeMirror и оставшиеся страницы ещё
не наблюдены. Single Close/confirmation с code page вернули собственный граф.

Cleanup15 остановился при закрытии пакета: ожидание по одному размеру hidden
messagebox могло завершиться раньше появления нового Save dialog, затем
одноразовый dialog.count() пропустил discard. `cleanup-refusal` подтверждает
ожидаемый вопрос о сохранении Package1 и кнопку «Не сохранять». Разработчику
передана замена на bounded observation видимого exact dialog либо packages0,
с записью эффектов до single dispatch. Report сохраняет CLEANUP_UNCONFIRMED.
Recovery15 отдельно подтвердил `jsteach`, packages0, logout/context close.
Evidence: `g1-operator-15/report.json`, `g1-recovery-15.json`. G1 частично закрыт
наблюдениями identity/editor, полный gate и G2–G7 ещё открыты.

Operator16 завершён с **подтверждённым полным cleanup**: package closed,
UI logout и browser closed true; дополнительный recovery не потребовался.
Source SHA оператора `4c335c766c4622b93ade7d69b6f7ad127eaf14d5733184b582ec1f4163f244c5`.
CodeMirror на стенде — **4.11.1**, настройки совпадают с operator15.

G4 input probe: keyboard.type изменил sample (896 вместо 849 байт); insertText
передал sample точно (849 байт/8 строк, 20ms). Граничный insertText: ровно
32768 UTF-8 байт/1024 строки, полное совпадение SHA256
`5aead120eaa874ee7b1f02c0e2971dd79eac6ddf091528053b59ccf343b186e0`, 1007ms.
Baseline восстановлен точно, прежний SHA `6eb6e2f9…ebecc64`, 22ms.
Aggregate `PROBE_PASS`, selected_method=insertText, full_g4_status=not_closed.
Это доказательство выбранного способа ввода и readback на этом редакторе;
сохранение, исполнение и вся матрица G4 ещё не доказаны.

После восстановления шаблона единственный Next со страницы code2 открыл
`DoneWizard`, «Описание узла», checked native indicator4. Indicator3 оказался
скрытым; его назначение не установлено. Остальные native owners и отсутствие
blockers подтверждены. Оператор ошибочно требовал видимость всех индикаторов
и переход строго index+1, потому финальный work status FAILED на
`expected_page_transition`. Исправление должно сохранять owner и ограниченный
порядок, но учитывать наблюдённые пропуски условных страниц. Done/Preview не
нажимались. Evidence — `g1-operator-16/report.json`; очистка прошла штатно.

## Подготовка G2/G3

Координатор проверил `execution-probe-design.md` разработчика: собственный
закреплённый CSV → наблюдённые typed input6×5 → отдельные declared/code trials,
sentinel положительно доказывает исполнение, отсутствие sentinel его не
отрицает; passive table read не должен повторять Execute. Execution runner
ещё разрабатывается, live G2/G3 не запускался.

Независимый private oracle подготовлен стандартным Python csv из source с
проверенным SHA `4fce338d2edd2901ba35732ed148a1a80eba4a5fbf927f2828f3cdbe6b8fa09e`.
Сохранены пробелы Customer, кириллица и все30 входных значений. Ожидаемый
результат — 6×2: ObservedID Integer1..6 и PhaseMarker String JS_G2_TABLE_V1,
исходный порядок, numerical tolerance0. Technical names входа ещё должны быть
наблюдены на стенде; позиционное совпадение не заменяет binding.
`g2-independent-oracle.json` в кампании, SHA256
`d61d649ed91c41c4961f51855508a893b17d6fc75b11c30419d3836186e8f97a`.
Статус expected_not_live_validated; это не финальный business CLI oracle.

Source oracle в новом `javascript-execution-evidence.mjs` независимо сверён
координатором с Python oracle: все30 входных и12 выходных значений и обе схемы
совпали (pinned Node, package directory). Live correctness этим не доказана.
В review передано требование fresh sentinel messages для конкретного
once-effect/node/source SHA: прежняя запись консоли не подтверждает исполнение
после нового Next/Done/Preview; terminal outcome проверяется отдельно.


## CLI-профиль: offline reconciliation после отменённого OAuth

Старый guard отменённого сеанса (nonce `b0e663b1-6c9f-48f0-9e32-54150f220415`)
архивирован только после проверки отсутствия процессов со ссылками на собственный
профиль в args/environment/cwd/fd, пустого state/locks и отсутствия auth.json.
Недоступные служебные процессы отдельно идентифицированы как sd-pam/ssh-agent.
Acceptance lease свободен; проверка/архивирование выполнены под registry lock.

Первый source `providers list` в developer worktree завершился CLI_START_FAILED:
AppRuntime import не находил cross-spawn в SDK. Pinned Bun1.3.14 выполнил
`install --frozen-lockfile --ignore-scripts`, установлено2 пакета. bun.lock SHA256
до/после совпал: `e97377f2000cd858fa0d4d770cc5f03d0012312edc4606267cb3c3b3513184ff`.
Guard этого неуспешного запуска тоже архивирован после отдельной offline-проверки.
Повтор `providers list` завершился exit0, **0 credentials**; штатный выход снял
.writer, state/locks пуст, auth.json отсутствует. OAuth не возобновлялся, прежний
код входа не используется. Это подготовка source CLI, не приёмка candidate.

Private receipt/backups: `cli-oauth-offline-reconciliation-20260926/` в прежней
кампании. CLI profile остаётся прежним, новый профиль/кампания не создавались.
Требуется новый собственный OAuth перед приёмкой собранного кандидата.

## История остановки: MCP при возобновлении разработчика

После recovery11 задача разработчика подтвердила отсутствие OpenViking tools
и ошибку `MCP startup failed`, code `-32003`, `OpenViking transport request
failed; no automatic write replay.` Это наблюдение turn
`01a0deec-d45a-7493-a286-913922938f20`, а не отрицание ранее проверенного полного
цикла. Продуктовая работа приостановлена по правилу проекта о доступной памяти.

Координатор повторно прочитал точный URI результата через штатный root-плагин.
Установленный Doctor подтвердил `/ready`, авторизацию и 15 MCP tools:
0 failures; warning относится к прежним ENOENT transcript других задач.
Свежий отдельный запуск того же собранного `20260926.2/server.mjs` выполнил
initialize/tools-list и получил 15 инструментов без stderr. Причина первоначального
транспортного сбоя не установлена; ошибка уже загруженного MCP-клиента разработчика
остаётся. Не объявлять её доказанной ошибкой регистрации или недоступностью сервера.

Регистрация, routes, hooks и capture state не менялись. Наблюдённый cursor — 298,
canonical workspace Peer сохранён; ручной capture/commit не запускался.
Приватный receipt — `developer-memory-startup-20260926T1814.json` в кампании.
Разработчик idle; Browser закрыт с подтверждённым logout/recovery11; resources
lease сохранён, CLI acceptance slot не занят. Начатый device-code OAuth процесс
ожидал входа; при окончательной остановке отменён координатором через Ctrl+C,
exec session 82194 завершился с exit 0. Auth-файл не появился; `.writer/owner`
остался, поэтому профиль нельзя считать освобождённым. Guard сохранён для
отдельной reconciliation перед следующим OAuth запуском, не удалён вслепую.

Следующий шаг: Restart MCP `openviking` в приложении, владеющем задачей, затем
actor health/find/read в **той же** задаче разработчика. Root CLI daemon control
socket отсутствует; новый отдельный App Server не обновит подключение Desktop.
Пользователю отправлен запрос перезапуска MCP, при отсутствии кнопки — Codex.
Не пересоздавать задачу, не повторять enrollment и не сбрасывать cursor.
После восстановления продолжить диагностику конкретного условия wizard-ready11,
затем G1–G7. Runtime/исходники адаптера и предыдущие доказательства сохранены.

Блокер подтверждён в трёх последовательных ходах Goal: исходная диагностика,
повторный turn `01a0deef-c99b-7e41-a799-8074412e5efb` и последний
`01a0def0-6c07-7d82-b3a3-f269d3225e60`. Каждый повтор дал ту же ошибку запуска
при одном вызове зарегистрированного MCP. Все 18 файлов source manifest совпали
с hashes. Дальнейших безопасных действий для восстановления MCP уже загруженной
задачи доступными средствами не найдено; Goal переводится в **blocked**, не
complete. После перезапуска подключения пользователем продолжить эту кампанию.

## Актуальное состояние после реализации адаптера

- В Git добавлены собственные исходники project-memory, generation `20260926.2`,
  source commit `1419ec3906b80a30be91cdd5bab9af35ad88e548`.
  Внешний macOS adapter больше не требуется. Старые hashes/runtime сохраняют
  историческое значение; [отчёт реализации и проверки](../../../../services/loginom-ai/tools/project-memory/ubuntu-adapter.md).
- В прежнем worktree `.worktrees/node-javascript` создана настоящая задача
  `01a0de3e-6a07-7661-aa88-ed4807aef6ec` — «JavaScript: общая память и допуск Ubuntu»,
  Astra medium. Product base `a8ad59766dbdb4f2da0b54367a755ce00891dd71` сохранён.
  После передачи документации исходный чистый HEAD разработчика —
  `b21a63f01ad326870c70c2479508508bc59825c1`; plan source —
  `14a4fa47b676f087eac06de21a2654737788f8ef`. Все 30 отличающихся от base файлов
  документации совпали с источником побайтно; product code не переносился.
- Registration `22ccfcf0-7919-4954-9342-82450a28a6f3` активна. Пять project hooks
  trusted, original memory hooks в worktree отсутствуют; основной плагин сохранён.
- Реальные host metadata Codex совпали с thread/cwd. Успешны actor health/find/read,
  официальный Stop/capture, native PreCompact/commit, exact read-back и semantic
  find результата из основного проекта. Cursor `0 → 13 → 22`, сервер: 22 сообщения,
  один commit. При смене поколения capture state сохранён побайтно; сброса не было.
- Извлечённая запись:
  `viking://user/kiselev/peers/-home-george-git-loginom-ai-agent/memories/events/2026/09/26/memory_verification_success.md`.
  Ручных remember/write не было. Локально: 59 runtime Node + 13 Python + 23 helper
  Node checks PASS. Документационный validator и diff whitespace checks PASS.
- Runtime и квитанции приватны: `.local/project-memory/{runtime,rollouts}/20260926.2/`.
  Неуспешный первый runtime/rollout `20260926.1` сохранён. Основной checkout и корень
  worktree получили `0755` вместо `0775`; cache плагина не менялся, hooks используют
  отдельную защищённую копию с теми же bytes. Validators ownership не ослаблены.
- На границе проверки памяти compaction turn completed подтверждён приложением;
  тогда задача была notLoaded, model/hook
  writer не оставлен работающим. Capture cursor 22, ovSessionId null, own lock отсутствует.
  Browser/CLI в этой проверке не запускались; выделенный headed profile закрыт ранее.

Продолжение назначено **этой же** задаче после переноса явно выбранных docs-only
commits: фазы 0A/0B и разработка до первого ревью. Browser/account/profile lease
теперь принадлежит координатору: разработчик готовит исходники оператора,
координатор выполняет headed-проверки и возвращает evidence. Параллельных
Loginom-сессий нет. Повторная регистрация не нужна. Использовать Ubuntu
Node/Bun, `jsteach`, заданный стенд, только headed; установить server OS и storage,
подготовить независимый CLI profile/candidate, выполнить JS discovery. Полный план
обучения пока не завершён; снята его блокирующая зависимость от внешнего adapter.

## Текущее выполнение на Ubuntu

Desktop при продолжении задачи разработчика выбрал managed sandbox без доступа
к сети стенда и внешнему browser profile. Возобновление этой же задачи отдельным
App Server остановлено штатным active-writer guard. Guard, capture state и
права sandbox не менялись. Поэтому координатор выполняет живую часть в своей
разрешённой среде; разработчик сохраняет владение исходниками handler/оператора.

Разработчик подготовил каталог 14 engine probes и оператор `javascript-live.mjs`
в своём worktree. Это пока исходники проб, не доказательство native execution.
Первый headed запуск `g1-operator-01/report.json` подтвердил account `jsteach`,
Loginom Enterprise 7.4.2, ноль исходных пакетов, собственный черновик `Package1`
и native model `MF;TF-1`. На скрытом элементе палитры выполнение остановилось;
JS-узел не создан. Закрытие черновика подтверждено Count=0, logout первой попытки
не подтверждён. Отдельная адресная recovery `g1-recovery-01.json` затем подтвердила
тот же аккаунт, ноль пакетов, UI logout и закрытие browser context. Обе попытки
сохранены вне Git. Server OS/storage остаются не установленными; G1 не закрыт.

Дополнительные наблюдения: `g1-palette-02` завершился с полным cleanup, но снял
пустое дерево до загрузки строк. В `g1-operator-03` ожидание строк подтвердило
палитру и элемент JavaScript; отказ произошёл при hit-test после прокрутки,
до drag. Сообщение — `Palette item covered after scroll`, а не timeout.
Cleanup остановился на неизвестном подтверждении, его последний native snapshot
показал Count=0. Отдельный `g1-recovery-03.json` подтвердил `jsteach`, ноль пакетов,
UI logout и context close. Следующий шаг — ограниченная диагностика координат,
фактического элемента в точке захвата и сообщения cleanup; не повторять drag
без устранения причины. Все 14 engine probes по-прежнему not_run.

Последующее уточнение `g1-hit-test-04`: элемент перекрывала `bg-mask-message`
формы сценария. При раннем закрытии наблюдён диалог Loginom
`Cannot read properties of null (reading 'GetNodes')`. Ожидание снятия маски
в 05 устранило это препятствие. В 05 также обнаружена ошибка атрибуции оператора:
системный узел переменных был принят за новый; JS creation этим не доказан.
В 06 после нового drag появился отдельный GUID/label JavaScript, но проверка
ошибочно отвергла промежуточные null icon/DOM. Сохранён фактический prompt
отбрасывания своего пакета и кнопка «Не сохранять». Recovery06 прошла.
В 07 создание пакета подтвердилось, но workflow не загрузился за 30 секунд;
это ошибка подготовки графа, не JS-кода. Screenshot показывает загрузочную
маску без сообщения об ошибке. Для 08 owner пакета связывается до ожидания
графа; отдельный диагностический предел графа — 90 секунд, без повторного create.

Независимая readonly-проверка `storage-platform-01.json` подтвердила отсутствие
пакетов до/после навигации (reconciliation07), собственный каталог `/jsteach`,
native `DefaultStorageDirectoryTreeNode`, доступные Upload/CreateDirectory,
UI logout и context close. Файлы/каталоги не создавались: write/readback ещё
not_checked. Assignment обновлён этим наблюдённым storage; server OS не установлен.

В worktree разработчика зафиксирован отдельный Host commit `9d75933fac`:
валидированный явный URL сохраняет внутренний `urlSource: explicit`, поэтому
не мигрирует на product default при restart. Старые записи без provenance
сохраняют legacy migration. Проверки разработчика: 44 tests PASS, включая
6 отдельных процессов для Desktop/CLI codec; Host typecheck PASS. Координатор
прочитал diff и выполнил commit, поскольку sandbox разработчика запрещает
запись worktree git index. Это source-проверка J27, не actual candidate CLI gate
и не формальное ревью фазы 5. Product base регистрации не изменялся.

Последующие попытки G1 сохранены отдельно:

- 08 выявила ещё одну промежуточную фазу создания: native package уже существует,
  но имя/путь ещё null. Recovery08 подтвердила `jsteach`, Count=0 и полный выход.
  Оператор теперь сначала связывает native package, затем ожидает его metadata
  и граф в пределах одного исходного deadline, без повторного Create.
- 09 доказала создание отдельного JS-узла: GUID
  `5de8c1c2-47ac-4d58-b61a-025cbcc41d54`, иконка `bg-vendor-icon-javascript`,
  собственный DOM в графе; системный узел переменных сохранён. Double-click
  внутреннего vertex был отклонён из-за перекрытия кнопками выбранного узла.
  Закрытие пакета, UI logout и browser close подтверждены в этой попытке.
- 10 открыла мастер через принадлежащую этому узлу кнопку `;Setting`, как
  существующий `node-wizard-open.mjs`. Наблюдена страница «Настройка входных
  столбцов». При закрытии появился точный диалог подтверждения с кнопками
  «Да/Нет»; оператор его не обработал. Recovery10 подтвердила Count=0 и выход.
- 11 сохранила screenshot и DOM уже открытого мастера без видимого сообщения,
  но readiness predicate истёк. Это отказ оператора, а не доказательство
  неработоспособности JS-узла. Close не отправлялся после истечения deadline;
  cleanup той попытки не подтверждён, browser context закрыт. Отдельная
  `g1-recovery-11.json` подтвердила account `jsteach`, Count=0, UI logout и
  context close. Следующая проба должна показать результат каждого условия
  readiness и проверить native ownership по существующему node-context.

После recovery11 браузер закрыт; lease профиля остаётся у координатора.
CodeMirror, источник/версия редактора, страницы после входного mapping и
движок ещё не проверены. Все 14 engine probes остаются `not_run`, G1–G7 открыты.
Видимые пять индикаторов страниц мастера нельзя автоматически приравнять
к четырём страницам исторического e2e enum; порядок предстоит наблюдать.

CLI dependency preparation завершена закреплённым Bun по lockfile. После
адресной reconciliation собственного неуспешного старта команда source CLI
`providers list` завершилась с exit 0 и показала 0 credentials в отдельном
профиле кампании. Начата штатная device-code OAuth авторизация ChatGPT, ожидается
пользовательский вход. Название метода `headless` относится к device-code flow,
браузер в этом процессе не запускается. Это source preflight, не compiled
candidate и не CLI-приёмка. До приёмки нужны собственный candidate и проверка
OpenAI OAuth/доступности Sol по регламенту.

## История подготовки до нового адаптера

Ниже сохранены прежние проверки и причины остановки. Статусы «не создана»,
«adapter отсутствует» и прежний next trigger относятся к прошлым шагам;
актуальный допуск и следующий шаг указаны выше.

## Изоляция и владельцы

- campaign: `javascript-20260926-ubuntu`, mode `single`, единственный узел
  `component.programming.JavaScript`; attempt реализации/CLI ещё не создан.
- Координатор: task `01a0ddc9-3e19-75d3-a5c9-724783ed6c35`, основной checkout
  `/home/george/git/loginom-ai-agent`, ветка `javascript`.
- Создан постоянный worktree
  `/home/george/git/loginom-ai-agent/.worktrees/node-javascript`, ветка
  `node-javascript`, чистый HEAD/base
  `a8ad59766dbdb4f2da0b54367a755ce00891dd71` (`loginom`).
- Задача разработчика/её bootstrap **не созданы**; регистрация памяти не активна.
  Это намеренно сохраняет HEAD==base для fresh-enrollment helper.
- Исходный согласованный docs source:
  `086cad12c3` (перед исполнением); дополнения Ubuntu находятся в этом checkpoint
  и соседнем плане. Перед переносом закрепить полный SHA docs-коммита этих файлов.
  Координаторские изменения memory kit — отдельный
  `01cc4dc86392cf3e8820780fc8cc68b6e9a22985`; они не меняют product base.
  Переносить только явно выбранные docs-only commits после допуска памяти.
- Приватный общий журнал:
  `~/.local/state/loginom-ai-agent/node-development/host-resources.json`, owner —
  текущая задача; создан под атомарным `registry.lock` после проверки списка задач
  приложения и процессов. Других активных Loginom-задач в полученном списке нет;
  существующие Chrome-процессы не присваивались и не изменялись.
- Кампания: `~/.local/state/loginom-ai-agent/node-development/campaigns/javascript-20260926-ubuntu/campaign.json`.
  Lease `javascript-20260926-ubuntu-preparation`; CLI slot не занят,
  `acceptance.lock` не создавался. Общий lock записи освобождён.

## Проверено на Ubuntu

1. Сеть: назначенный `http://logi-test-plan.bg.local/app/` разрешается в
   `10.200.11.224`, прямой HTTP GET вернул 200.
2. Пользователь назначил выделенный аккаунт `jsteach`; он закреплён в lease.
   Секреты в документацию/Git не сохраняются.
3. Штатный `src/connection-check.mjs::loginBrowser`, отдельный профиль
   `connection-preflight-profile` внутри приватной кампании, `headless:false`,
   Chromium1243, действующий DISPLAY, sandbox и `--no-proxy-server`.
   Прочитаны фактические account=`jsteach`, Connected=true, `bg.app.Version=7.4.2`,
   PackageNodes.Count=0. Logout через UI и закрытие собственного context подтверждены;
   пакеты/узлы/файлы Loginom не создавались. Native receipt:
   `connection-preflight.json`; операторский скрипт и screenshot — рядом, вне Git.
   Screenshot был сделан до полной отрисовки рабочего интерфейса и не доказывает
   готовность палитры/мастера. Редакция и ОС сервера пока **не установлены**.
4. Отдельный toolchain в
   `~/.local/state/loginom-ai-agent/node-development/toolchains/`:
   Bun `1.3.14+0d9b296af`, полный Node `24.19.0`, npm `11.17.0`.
   PATH пользователя и системный Bun `1.3.13+bf2e2cecf` не менялись.
   Bun получен из [официального release](https://github.com/oven-sh/bun/releases/tag/bun-v1.3.14);
   archive SHA256 `951ee2aee855f08595aeec6225226a298d3fea83a3dcd6465c09cbccdf7e848f`
   сверён с GitHub release asset digest. Node archive SHA256
   `14b342e71204f811bde6153be8e04b62aef63c236fef92b55f9c83154b409647`
   сверён с официальным SHASUMS256; executable SHA256
   `bc17c508ffeed0ec622934f9b7fa72f8e78da65350e63c3eceb56fa688aa5e12`
   совпал с product pin. Точные пути — приватный `javascript-toolchain.json`.
5. Использованный Chromium executable SHA256
   `8c599d43aec53f2460a31ae2f4af6bd863f8258b34ff519564bc5d4726bfaa1e`
   совпал с Linux product pin. Это ещё не проверка целого candidate/resource manifest.

## Память и переносимость подготовки

Основной checkout использует рабочий штатный OpenViking. Doctor подтвердил
авторизацию, `system/status`, чтение, MCP и `/ready`: 0 failures, 1 warning о
прошлых прерванных recall. Точное чтение памяти текущего проекта прошло.
Effective Peer выводится из Ubuntu cwd; macOS URI не копировался.

Подтверждены и исправлены в координаторском kit:

- Исходный adapter передаётся явно `--source`; больше нет исполняемого default
  `/Users/kartamyshev/...`. Старый upstream manifest/hashes сохранены.
- `review_hooks.mjs --codex <absolute executable>` вместо пути macOS app.
  Настоящий Ubuntu `/home/george/.local/bin/codex` (Desktop 0.153.4) успешно
  выполнил initialize и hooks/list; системное доверие этим чтением не менялось.
- Фактический установленный ID — `openviking-memory@loginom-dock`, версия 0.8.1.
  Он передаётся `--plugin-id`, сохраняется в manifest и отключается только в
  новом worktree. Для прежних manifest сохраняется прежний marketplace.
- До bootstrap inventory должен доказать отсутствие original memory hooks
  **любого marketplace** в worktree; helper отказывает раньше захвата данных.
- Ubuntu umask `0002` создаёт `0775`/`0664`, которые текущий ownership validator
  отвергает. В тестовых fixtures установлен приватный umask; в CURRENT описаны
  проверка прав и защищённая копия неизменённого plugin pin. Права основного
  checkout и установленного плагина ещё не менялись, validators не ослаблялись.

Локальные проверки: **11 Python preparation tests + 4 Node hook-review tests PASS**.
Первый Python запуск дал 11 setup errors из-за umask `0002`; после исправления
fixtures — 11/11. Python suite выполнялась с временным preparation fixture:
настоящий overlay и `workspace-peer.mjs`, совпавший с upstream hash;
`server.mjs` специально неработоспособен и выбрасывает ошибку при запуске.
Это проверяет Git/TOML/manifest preparation, **не собранный MCP adapter**.
Node suite использует процесс RPC fixture и не пишет реальное доверие Codex.
Проверки синтаксиса Python/Node и `git diff --check` прошли.

Отдельный исходный `integrations/codex-mcp-adapter` с 11 файлами из manifest
пока не найден в проверенных checkout, cache и подходящих локальных архивах.
Установленный официальный plugin — другой компонент и не содержит этот adapter.
Путь/репозиторий его копии запрошен у пользователя. Поэтому project runtime,
hooks manifest/install, registration ID, bootstrap, activation и actor access
новой задачи пока отсутствуют. Тестовый fixture не установлен как runtime.
Capture/extraction/read-back новой задачи ожидают её допуска и первого этапа.

## Следующий шаг

Владелец — координатор текущей задачи. Восстановить точный исходный adapter,
проверить все hashes и собрать настоящий runtime. Затем закрыть права/identity
установки по CURRENT, проверить новый worktree до bootstrap, создать настоящую
задачу, оформить свежие receipts, activation и actor health/find/read.
После допуска перенести docs-only commits и выполнить discovery 0B в headed
Loginom под выделенным аккаунтом. Отдельно установить edition/ОС сервера,
палитру JavaScript, доступный storage, action manifest и будущий CLI/OAuth profile.

Подготовительный Loginom logout/context close подтверждены; неизвестных мутаций
или pending browser operations нет. Приватный profile/evidence сохранён.
При возобновлении сверить worktree, процессы, account lease и receipts;
не создавать вторую кампанию и не сбрасывать состояние существующих задач.

## Продолжение 0A: интерфейс и целостность bundle

Повторная проверка 2026-09-26, после docs source
`ed45485ac032ff6bc4921a2ca4a55a5650356719`. Worktree остаётся чистым на product
base; разработчик/bootstrap ещё не созданы, исходный adapter по-прежнему отсутствует.
Запрос его доступной копии остаётся без ответа. Предыдущий этап дал реальный
прогресс (Ubuntu helpers/toolchain/login), этот — следующие наблюдения.

- Штатный `verifyResources` выполнен bundled Node: **4668 файлов PASS**,
  manifest SHA256 `ff80b90e2c543a0f3afcdddae843af28372fad43c27c51cce0d58a7f9c66a9b4`.
  Приватный receipt — `source-bundle-verification.json` в каталоге кампании.
  При отдельном сравнении с product release pin найдено одно различие:
  `endpoint=https://loginom.duckdns.org/mcp` у этого bundle вместо актуального
  `https://mcp.loginom.ai/mcp`. Поэтому целостность подтверждена, но **допуск
  candidate не выдан**. Новый candidate должен собираться из исходников и pins
  по фазе 6; существующий source bundle не подменять именем нового candidate.
  Action manifest URI/hash и остальные release fields совпали с product pin.
- В собственном headed context под `jsteach` ранний переход «О программе»
  после успешного login показал `Cannot read properties of undefined (reading
  'NodeIndex')`. Доказательство сохранено: `platform-preflight.json` и screenshot.
  About metadata не прочитаны, logout первой пробы **не подтверждён**, context
  закрыт. Попытка сохранена как неуспешная, не переписана последующей проверкой.
- Отдельная recovery-проба подтвердила тот же account, 0 пакетов, отсутствие
  открытых сообщений, затем успешные UI logout и context close:
  `platform-recovery.json`. Серверных объектов/пакетов не создавалось.
- Проба с ожиданием видимой страницы «Начало» установила `homeVisible=true`,
  `bg.app.PlatformEdition=Enterprise`, успешные logout/context close:
  `platform-readiness.json`. Это отделяет login admission от загрузки интерфейса.
- Повтор чтения «О программе» после ожидания HomePage и подтверждения native
  active tab == `FAboutNode` прошёл. Фактически прочитаны
  `MF;TF-1;About;lblPlatformEditionValue=Enterprise` и
  `MF;TF-1;About;lblVersionValue=7.4.2`. Успешные UI logout/context close —
  `platform-ready.json`; screenshot — `platform-ready.png`. Полные локальные
  observations остаются приватными. Страница не содержит ОС сервера;
  эта характеристика запрошена у пользователя и не выведена из ОС агента.

Последний Loginom context закрыт, logout подтверждён. Browser lease хранит
профиль и evidence, но не объявляет работающий процесс; CLI slot свободен.
Содержимое установленного bundle не менялось. Блокирующее условие регистрации
памяти прежнее: нужна точная копия исходного adapter либо отдельно реализованное
и проверенное новое поколение; ослабление manifest/routing guards не допускается.
Условие сохраняется третий последовательный ход Goal: создание worktree,
Ubuntu-адаптация и дополнительные live-проверки дали прогресс, но не восстановили
зависимость. Автоматическое продолжение приостановлено на этом предусловии;
Goal не завершён. Next trigger — доступная копия adapter с проверяемыми hashes
или новое явное решение о замене механизма регистрации. ОС сервера также ожидает
подтверждения; работающий штатный OpenViking основного checkout не отключён.

## Передача разработчику — 2026-09-26

Задача подтверждена active/inProgress через App API. Разработчику назначен Goal
до ready-for-review, без запуска нового ревью/CLI-приёмки; scope обоих output
режимов и всей матрицы сохранён. Одно same-task review и acceptance будут
назначены отдельно на соответствующих границах. Product base и memory
registration не менялись. В docs-only transfer конфликт CURRENT.md разрешён
точной закреплённой версией документа, code-коммиты kit исключены.

Координатор отдельно готовит CLI provider/OAuth prerequisites. Source CLI
`providers list` в собственном приватном `cli-profile` завершился до model/Host
dispatch с CLI_START_FAILED. Диагностика import обнаружила отсутствующую
зависимость https-proxy-agent; это ещё не дефект продукта. Запущена установка
по lockfile закреплённым Bun с `--frozen-lockfile --ignore-scripts`. Guard
этого профиля сохранён до адресной проверки cleanup; browser не запускался.
