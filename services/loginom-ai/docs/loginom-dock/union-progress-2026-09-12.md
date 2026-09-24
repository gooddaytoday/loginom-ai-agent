> Исторический документ, адаптированный для навигации в Loginom AI Agent. Даты, версии, SHA и результаты относятся к прежним проверкам. Пути к коду указаны относительно нового репозитория; это не доказательство проверки текущих файлов. Исходник `source-ae7e5c29c872` и изменения: [происхождение](../../../../docs/node-development/provenance.json). `unavailable:artifact-*` означает [неперенесённый материал](../../../../docs/node-development/history/unavailable.md). Актуальная работа: [регламент](../../../../docs/node-development/README.md).

# Объединение: реализация подплана 10

Статус: **завершён в source runtime**. Заключительная автономная приёмка
`20260912-174232-0449c132`:12/12операций,71/71 frozen PASS.
[Аудит требований](../plans/loginom-dock/10-completion-audit.md),
[машинная сводка](union-acceptance-2026-09-12.json).
Ниже сохранён хронологический журнал, включая промежуточные отказы.

## Подготовка и источники

Рабочее дерево перед началом чистое. Прочитаны подплан10, общие контракты README,
agent-handoff и исходная реализация Слияния с общим циклом node.apply.
OpenViking health успешен; отдельный Experience find вернул MCP -32001.
Сетевая диагностика подтвердила авторизацию, system/status, fs/ls и все ready
подсистемы. Ошибка DNS внутри sandbox не воспроизвелась с сетевым доступом.
Конфигурация памяти не менялась. Наличие injected context опровергает общий
вывод старого doctor о полном отсутствии hooks; этот вывод не принят.

Dock prepare успешен, skill `afa295bf48dc48da5d3c995665a06ef2190ff620bae3243d46557e0371536790`.
Архив текущего classic подключения не активен (подтверждено diagnostics).
Через Dock прочитаны Help `data/processors/transformation/union.md`, E2E
`bg/sels/transform/sUniondata.ts` и `bg/helpers/wizards/transform/uniondata_helpers.ts`.
Мастер автоматически связывает совместимые поля; несопоставленные столбцы
включаются отдельно. Все соответствия требуется сверять с явным запросом.

## Диагностическая сессия

`packages/loginom-runtime/tools/loginom-acceptance/union-live.mjs` использует общий source runtime,
настоящий browser MCP и публичный MCP wire для операций узлов. Это операторская
диагностика, не инструкция Hermes и не автономная приёмка.
Первый запуск отказал до браузера из-за Node22; повтор с закреплённым Node24.19.0
открыл Loginom7.4.2. Аккаунт `test-1` и каталог `/test-1` проверены в UI.
Viewport=null, окно1508×949, страница1508×862. Создан отдельный несохранённый черновик.
Доказательства: `unavailable:artifact-153a79a035516871`.

До сессии созданы три CSV и отдельный expected в
`unavailable:artifact-c1ecb5c5a40e42b5`. Ожидаются5/7строк для2/3входов,
кратность повторяющейся строки3/4, Null, пустая строка и отдельное поле Extra.
Все три файла доставлены и проверены. Старый диагностический скрипт ошибочно
читал корневой status вместо outcome.status; исправлен без повторной доставки.
Импорт запущен; его полный результат ещё требуется проверить.

## Остаток

Живой UI мастера, полное чтение mappings и источник их идентичности;
handler/карточка/схема результата/аудитор;2/3входа, изменение existing,
полная матрица и негативные/recovery случаи, Done/Close, save/reopen/reexecute;
полные применимые проверки и финальная goal-only приёмка Hermes Sol/low.
Подплан10 остаётся planned; V4/V5 не закрыты. Установка/deploy/push не выполнялись.

## Живое исследование и первый модуль чтения

Все три импорта завершились SUCCEEDED,3/2/2строки прочитаны полностью; Null и
пустая строка подтверждены. Новый Union-Diagnostic создан с двумя связями.
После выбора узла появляется Setting; dblclick тела лишь выделил узел, мастер
открыт отдельной кнопкой. Общий openPreparedWizard уже содержит фазу выбора.

В `UnionDataWizard` найден owner `@@TestCmpController`, связанный с FWizardForm.
`FMainColumnStore` и `FJoinedColumnStores` — полные локальные Ext.data.Store /
CollectionProxy. Главный store содержит chkN/colN, присоединённый — Link/Value.
Взаимность проверяется через исходные Index, не порядок сортировки/отображения.
RPC-поля FEngine, FLinks и data.$self не читаются.
Флажок Code сначала выбрал Memo (совпавший тип); через dropdown явно заменён
на Key. Остальные пары Amount→Value, Note→Memo подтверждены.
Next→DoneWizard; промежуточный Done, отдельный DerivedDataSourceOutputSocketWizard
показал3поля. После добавления третьего источника появились ровно один новый
вход и связь, прежний GUID узла сохранился. Новый логический вход2 соответствует
динамическому SVG Input_Data-3. Последующая диагностика ниже уточнила:
его настоящий FPortIndex и индекс дерева равны2; это разные системы нумерации.

Добавлен `packages/loginom-runtime/client/lib/union-context.mjs` с полным чтением, сверкой владельца,
целостности stores и взаимности mappings. Живое чтение подтвердило2и3входа,
сохранённые пары первого присоединяемого входа и отдельный unmatched Extra.
Раннее чтение после открытия корректно вернуло union_owner_or_pending; готовое
состояние принято. Шесть focused tests PASS, включая отрицательные случаи
неполных/чужих stores, неверных/односторонних связей, переменных и RPC-доступа.
Модуль пока НЕ зарегистрирован в node.apply и не является полным обработчиком.

Перед third target обнаружен отказ NOT_APPLIED/effect_possible=false:
после ручного Done порт под мышью имел hover-shape без data-tid в graph state.
Прямая проверка native ports установила причину; после mouse.move за пределы
узла data-tid восстановился. Новый запрос add_input+connect прошёл SUCCEEDED,
без повторения возможного эффекта. Общие guards не ослаблялись. Нужно проверить,
возникает ли дефект в штатном handler, где общий cleanup управляет указателем.

Третьи пары Code→Item, Amount→Total, Note→Text прочитаны; Extra оставлен отдельным.
Next→DoneWizard, выходной мастер подтвердил Code/Amount/Note/Extra с autosync=true.
Имена/типы полностью прочитаны, но результат выполнения Union ещё не проверен.
Сохранение `/test-1/packages/Union-diagnostic-20260912.lgp` завершилось
SUCCEEDED: `save.json`, save_completed=true, workflow_preserved=true.
Это квитанция сохранения, не независимая проверка содержимого после reopen.

После подтверждённого save диагностический пакет закрыт штатно (`close-package.json`).
Сессия завершена командой operator close; следующий прогон закрепляет новые pins.
`git diff --check` прошёл. Общий handler, результат Union и Hermes ещё не проверены.


## Обработчик и публичный прогон

Добавлены параметры append_all с полным tables/fields и явным main=null для
отдельных столбцов, проверка типов/имён, preflight, настройка входов/мастера/выхода,
readback и регистрация в публичных схемах. Нормальный цикл использует общий
node.apply, без второго исполнителя. Полный локальный store читается и при
фильтрации списка выбора поля. Поддержка пока кандидатная, приёмка не закрыта.

`unavailable:artifact-054ee7950c4f27fd`: существующий трёхвходовый узел
выполнился, прочитаны все7строк. Финальная сверка ошибочно требовала Join-флаги;
результат AMBIGUOUS не принят. Ошибка исправлена, добавлен отдельный тест readback.
Следующая сессия `live-1789216512894` открыла старый пакет только для чтения;
preflight остановился без открытия порта. Добавлен ранний отказ для locked узла.
Не использовать эти прогоны как успешную приёмку.

`unavailable:artifact-23dc31ae88df25ab`, runtime
`32605dec586d865e71028f5904b711caaaf1bb5a27e4467811d356eaf4a72cea`:
три свежих импорта SUCCEEDED; `union-new-two-v2` SUCCEEDED через настоящий MCP.
Независимый `union_oracle.py` сравнил все5строк, типы, Null/пустую строку и
кратность A=3 (`new-two-values-audit.json`). Узел
`938ed927-6caa-45fc-9d8e-fe4aee7b5a58` сохранил identity при добавлении третьего
входа: Input_Add и связь подтверждены общей фазой target. Затем входной мастер
остановился до жеста: `Port native hit identity unavailable`.

Live-проба установила SVG Input_Data-3 при FPortIndex=2 и tree FIndex=2.
Исправлен общий node-port-open: у Union табличный ordinal отделён от SVG creation
index, при этом cell/GUID/menu/tree identity продолжают проверяться. Прямое
диагностическое открытие входа2 с исправленным кодом SUCCEEDED. Полный повтор
node.apply на новой source pin ещё требуется; этот ручной успех его не заменяет.

Из-за AMBIGUOUS общий runtime сохранил gate. Оператор после осмотра отказа,
подтверждения отсутствия жеста и закрытия диагностического мастера сохранил
рабочий пакет общим guarded save capability без выдачи node.apply за успешный:
`/test-1/packages/Union-handler-20260912.lgp`, save_completed=true,
persisted_content_verified=false. В нём3импорта и один Union-Two с3связями,
первые2входа настроены; третий ещё требует полного handler-прогона.

Проверки: общие node-api/result/workspace-ui/sorting-preflight276/276 PASS;
Union + graph recovery + port opening61/61 PASS, затем дополнительный реалистичный
тест SVG3/native2 — port suite16/16 PASS. Python oracle2/2 PASS.
`git diff --check` PASS. Полный client suite после последних изменений не запускался.

### Следующая точка

Открыть сохранённый Union-handler в новой закреплённой диагностической сессии.
Проверить полный existing execute3входов, затем новый2→existing3 с Input_Add,
Done/Close, prefix edit, input/output aliases/order/autosync/exclusion и пустой
вход. Отдельно проверить preflight явного переподключения существующего входа:
сейчас он читает retained input mapping, нужна сверка с новым upstream до эффектов.
Далее независимый raw auditor, негативные проверки, сохранение/штатное закрытие/
reopen/reexecute и goal-only Hermes openai-codex/gpt-5.6-sol/low без UI-резерва.
Сверить source/catalog pins для финального запуска. Следующие подпланы, V4/V5,
публикация и установка не закрыты; цель остаётся активной.


### Последнее уточнение точки продолжения

`live-1789216629187` завершён: сохранённый Union-handler закрыт штатно
(`close-handler.json` closed=true), браузер закрыт. Дополнительный реалистичный
тест сразу трёх портов подтвердил SVG3/native2 (port suite16/16).
Добавлен независимый `union_configuration_evidence.py`; raw аудит операции
union-new-two-v2 прошёл (`new-two-configuration-audit.json`). Он ещё не покрывает
весь пользовательский сценарий и нуждается в негативных тестах.

Новая сессия `live-1789217218851`, pin
`2fcc3094c781f65890ec85604af93a3c2c0b62104b6c86d654f090d8517d341d`,
снова получила Union-handler только для чтения. Полный existing execute не
начался: readiness отказ до открытия входного порта. Проверка node.locked
сама по себе не выявила read-only package; нужно отдельно диагностировать
принадлежность/режим пакета и завершение прежних серверных сессий либо сделать
отдельную рабочую копию, как в Join checkpoint live-1789165926106. Не выдавать
этот отказ за прохождение исправленного полного handler. Браузер закрыт.


## Полная матрица 2→3 и mappings (продолжение)

Предыдущий виток дал проверенный прогресс, не блокировку цели.
`live-1789217412234`: копия через save_checkpoint стала writable, но новый
wizard сменил старые lazy navigation tids, поэтому old preparation был отклонён.
Мастер отменён с подтверждением, рабочая копия закрыта. Эти ограничения относятся
к операторскому переносу пакета; не считать попытку успешным node.apply.

Надёжный путь диагностической копии: `package.save_as` в новый путь с явным
reopen, затем новый `makeWorkspacePrepareCode` для уже открытого пути. В
`live-1789217551256` это выполнено через публичный MCP, файл
`/test-1/packages/Union-reopened-20260912.lgp`, tab MF;TF-3,
workflow1789217585124-blcgwc09h8n-2, runtime
`2fcc3094c781f65890ec85604af93a3c2c0b62104b6c86d654f090d8517d341d`.

Успешные публичные операции:
- union-handler-existing-v3: исходный3входовый Union-Two,7строк, A=4;
- union-done-v1: execution not_requested, output not_refreshed;
- union-close-v1: configuration discarded, без запуска и чтения;
- union-new-two-fixed: новый Union-New,5строк, A=3;
- union-add-third-fixed: тот же GUID ff7d6f3b-9b67-4b28-8755-467653b4d7dd,
  один Input_Add и одна связь,7строк, A=4, посторонние объекты сохранены;
- union-aliases-exclude: input1 SourceKey/Memo/Value с изменённым порядком,
  одинаковыми метками Same и autosync=false; output Comment/Identifier/Sum,
  Same labels, autosync=false, Extra явно исключён.7строк полностью сверены.

Независимые доказательства: existing-audit.json, two-three-audit.json,
third-graph-audit.json и aliases-audit.json — PASS. Добавлены
union_configuration_evidence.py и union_graph_evidence.py, которые сверяют
raw observations/квитанции/полные исходные схемы/дельту графа отдельно от handler.
union_evidence_negative.py обнаружил14/14искажений, включая пропуск поля,
чужую identity, тип, режим, неправильный порт, дополнительный узел/связь/жест.
Полный client suite:1369PASS,1SKIP,0FAIL (client-full.log), затем новые contract
тесты2/2PASS. Проверка diff без замечаний.

### Префиксы и оставшаяся работа

union-prefix-done остановился до изменения флажка: выбирался DisplayEl,
тогда как observer публикует InputEl. Исправлено на штатный set_checked.
Поля префиксов не имеют собственного data-tid: используются input с точным
identity.anchor_tid ValueControl; после fill выполняется Tab, затем native read.
Reader теперь также проверяет pedUsePrefixes.FLastViewMode/FLastValue и ValueControl,
чтобы управляющая переменная или незавершённое значение не стали булевым PASS.

Прямой UI diagnostic подтвердил custom name T_, label 'T: ' и сгенерированный
T_Extra / 'T: Extra'; node-процедура с исправлением ещё требует полного прогона
на новой pin. Текущий исходный Union-Two сохранён с этими custom prefixes;
Union-New содержит успешную alias/exclusion-конфигурацию. Это5аналитических узлов
(3импорта+2Union), не весь финальный Hermes-сценарий.
После исправления: union/contract/context/procedure/readback + port suite42/42PASS.

Остаются: полный prefix handler, пустой вход, live negative cases, окончательное
save/reopen/reexecute с независимой сверкой обеих конфигураций и строк,
source/catalog pins, финальная goal-only Hermes Sol/low приёмка и её полный auditor.
Не возобновлять Hermes до завершения диагностики. Общий graph contract явно
отказывает в переподключении занятого existing входа; до разрешения отдельного
контракта такие ссылки не удаляются. Это уточняет предыдущую запись про reconnect.

Матрица сохранена с явным replace: preserve-matrix-replace.json SUCCEEDED,
save_completed=true, без заявления о persisted content. Первый fail-policy
отказ подтвердил существующий файл и штатно закрыл конфликт; второй запрос имел
свой receipt ID. close-matrix.json closed=true; session25741 завершён exit0.
Активных диагностических браузеров этого витка не осталось. При следующем запуске
использовать новую pin и, если исходный файл readonly, отдельную копию через
save_as с reopen перед новым prepare; не запускать handler по stale copy crumbs.

## Пустой вход, префиксы и сохранённая конфигурация — следующий виток

На source pin `bcd0c147e7e9bf4ac8414d42a8f8c5155f2e2c14f8e17f4d51b6b39bb71dc3a2`
в `live-1789218432011` полные MCP-операции подтвердили:
- custom prefixes `P_` / `Источник: `, затем выключение флажка; 7 строк;
- импорт пустого CSV с заголовком: 0 строк, объединение с main: 3 строки;
- повторное выполнение сохранённого Union-New без повторного mapping:
  Comment/Identifier/Sum, все метки Same, Extra исключено, 7 строк.
Независимые raw configuration + fresh output аудиторы прошли для всех четырёх
операций (`prefix-empty-audit.json`, `persisted-toggle-audit.json`).
Файл `/test-1/packages/Union-final-matrix-20260912.lgp` сохранён checkpoint/replace.

Live negative: незаданный mapping получил NOT_APPLIED; чужой workflow отклонён
public validator. Отсутствующий GUID выявил поздний таймаут source preview.
Граф до/после совпал по GUID, типам, именам, портам и связям; исходное сравнение
всего observation включало меняющийся dom_epoch и было слишком строгим.
Добавлена ранняя валидация всех supplied source refs/output indices по полному
графу до открытия preview. Source pin теперь
`1a12e23ac7ee7c77210b3b03ded61335870fa74ce82bf38cbd0b8abd26e0f096`.
Повтор `live-1789219210317` был readonly и остановился до source preview;
это не PASS негативной матрицы. Он закрыт. Следующий diagnostic
`live-1789219323954` сначала создаёт записываемую копию через save_as/reopen,
выполняет existing Union для активных upstream и лишь затем проверяет отказы.

Подготовлены frozen fixtures/goal, `union_upload_probe.py`, подключение цели
`union-node-complete` в run.py, независимый `union_node_acceptance.py`,
проверка неизменности полных Union parameters после reopen. Ожидаются 12 полных
операций Hermes: 3 imports, 2→3 входа, alias/exclude, Done, Close, 3 imports
после reopen и итоговый Union. Проверяются public calls, source bytes,
порядок и полные значения, raw mappings, точный graph delta, save/reopen identity,
новое execution и эффективность. 14/14 повреждений raw evidence отклонены.
Hermes пока не запускался; подплан остаётся in_progress.

### Финальная Codex-матрица перед Hermes

`live-1789219323954` на pin `1a12e23ac7ee7c77210b3b03ded61335870fa74ce82bf38cbd0b8abd26e0f096`:
- custom prefix полный MCP PASS, 7 строк;
- несовместимые типы, неполный mapping и отсутствующий GUID: NOT_APPLIED;
  foreign/stale workflow: public validation refusal; точный граф не изменился;
- alias mapping существующего узла: PASS 7 × 3;
- checkpoint + save_as/reopen того же `/test-1/packages/Union-final-recheck-20260912.lgp`;
- новый workflow ref, тот же GUID, mappings=[]: PASS 7 × 3, новая execution identity,
  полное совпадение сохранённых настроек.
`final-negative-prefix-audit.json` и `final-persistence-audit.json` прошли.
Диагностический браузер закрыт, exec exit0. Полный клиент: 1374 PASS / 1 SKIP;
Python: 497 PASS. Проверки scoped Union: 27 PASS (включая ранний source guard).

После успешной Codex-матрицы запущен один самостоятельный goal-only Hermes run,
`union-node-complete`, Sol/low, source runtime, timeout 3600s, max_turns 100.
Файлы auditor/goal/runtime заморожены до завершения и независимой приёмки.
Наличие запущенной попытки не означает PASS; итог будет внесён после аудита.

### Исправление адреса стенда приёмки

Первый Hermes `20260912-162617-cc165bee` завершился без операций: личная Dock
конфигурация указывала `dev-test.bg.local/staging/app-debug` (7.5.0-alpha+build.49891),
а pinned catalog — 7.4.2. `dock_prepare` вернул UI_BUILD_MISMATCH, prepared=false,
effect_possible=false. Модель сохранила Sol/low, не обходила guard; audit FAIL
(twelve_operations, efficiency). Это ошибка привязки запуска к стенду, не Union PASS.

Копирование конфигурации с api_key было отклонено автоматической проверкой и не
выполнялось. Вместо переноса ключа добавлен `--replay-loginom-url` для executor-replay,
а harness принимает `--loginom-url` и требует его для Union. URL проверяется на
HTTP(S), отсутствие credentials/token query/fragment. Исходный файл доступа не
меняется и не копируется. Эффективный адрес проверен через реальный loadConfig.
Теперь source pin `aa7a1c34f16a3436901ea64f1b1a2ec35a870b48402562c7410080007b20b6ea`.
Полный клиент 1375 PASS / 1 SKIP; Python 498 PASS; Union harness 6 PASS.
Preflight подтверждает Sol/low и новый pin. Повтор стартовал с явным
`http://logi-test-plan.bg.local/app/?testable=true`, тем же каталогом и учётной
записью test-1. Копию installed config не создавать.

### Автономный run 163138: общий process-panel дефект

`20260912-163138-46f8c7db` выполнил 10 полных операций: 3 imports, Union2,
Union3 (один Input_Add + одна связь, тот же GUID), remap/exclude, Done, Close,
save_checkpoint + save_as/reopen, повторные main/second imports.
Независимые raw config/output проверки Union2/Union3/remap и exact third graph
прошли ещё до завершения. Done/Close: not_requested/not_refreshed, Close discarded.
Пакет `/test-1/packages/Dock-acceptance-20260912-163138-46f8c7db.lgp` содержит
ровно 4 аналитических узла и 3 связи.

Третий повторный импорт `reopen-third-exec-163138` остановился AMBIGUOUS в
подготовке execution baseline, ещё до мастера. После показа process console
right_click по `ConsoleForm;ProgressForm;trpProgress;grd;tbl` получил два
UI_EPOCH_CHANGED и UI_ROOT_STALE; все NOT_APPLIED/effect_possible=false.
В длинной панели уже 15 групп. Hermes ушёл в диагностику/восстановление и
попробовал запрещённый goal UI fallback. Run остановлен оператором после
подтверждённой terminal failure (SIGTERM только owned child PID27908), evidence
экспортирован. Полный frozen audit FAIL, не засчитывать как приёмку.

Вернуться к прямой UI диагностике process-console readiness. Active diagnostic
`live-1789220926656`, exec66728, pin aa7a1c34…, writable copy
`/test-1/packages/Union-process-repro-20260912.lgp`. После existing Union prime
запускается bounded loop штатного execution driver, чтобы воспроизвести длинную
виртуализованную историю. Ни runtime, ни auditor пока не исправлены по этому дефекту.
Третий Hermes run не запускать до Codex diagnosis и проверки исправления.

### Прямое воспроизведение process-panel

В `live-1789220926656` операторский цикл штатного execution driver с явной
UI-деактивацией между запусками воспроизвёл исходный дефект: 9 успешных циклов,
затем process-repro-v5-9 получил три pre-gesture UI_EPOCH_CHANGED перед меню.
UI screenshot подтвердил открытую длинную process console. Диагностические
варианты v1–v4 не считаются проверкой: активный узел нельзя запустить вновь,
hover controls мешают locator по body, у метки отдельное rename-menu.
Надёжная deactivation в диагностике: Escape, contextmenu по центру наблюдённого
body (его собственные NodesControls overlay), точный mn;mniDeactivateNode.

Исправлена готовность: перед меню process console нужны два совпадающих epoch;
confirmIdentity сохраняется в perform при безопасном pre-gesture refresh.
85 профильных тестов PASS. Fixed loop прошёл 6 циклов, затем выявил второй
случай: reveal сбрасывал список с top782 в top0 и затем к830. В правом native
buffer появились две таблицы record633, включая Ext view.all cache; left был
уникален. Reader корректно вернул duplicate_rendered_record, поэтому ожидание
смещения не завершилось. Проверку дубликатов НЕ ослабляли.

Убрана ненужная прокрутка к началу: полное native process order + реально
доступные row controls задают направление к целевому record. Для нового процесса
ниже viewport выполняется только нужное движение вниз. 91 профильный тест PASS.
Диагностически переключён show_completed off/on (без удаления истории), чтобы
перестроить повреждённый буфер. Запущен `process-loop-fixed-v2` на той же истории,
20 bounded cycles, evidence `process-fixed-v2-full.json`; exec66728 остаётся активен.
Перед новой Hermes-приёмкой нужны его результат, full client suite и новый pin.

Fresh-loop checkpoint: mixed historical diagnostic reached process21 and native
Loginom retention gave the same data-tid path to records20/21. The reader kept
refusing ambiguous controls; no uniqueness guard was weakened. This is distinct
from the original pre-menu repaint failure. Existing bounded recovery does not
promise continuation over a malformed native process UI.

Сейчас новая чистая сессия `live-1789222274165`, exec12714, browser
`4199a4d1-930b-47e6-8bb6-85ee3f4332d1`, source pin
`76cd8f9d4528a2299b45cb21667099b2921a58cde89e5dc205aef9739257c354`.
Prime полной Union операцией, затем18execution cycles: вместе20process groups,
ровно длина полного acceptance сценария. Копия
`/test-1/packages/Union-process-fresh-20260912.lgp`. Все source fixes загружены
обычными imports в свежем процессе, без подмены активного runtime.
Full client после fixes:1377PASS/1SKIP. Прежняя смешанная сессия закрыта exit0.

### Свежая проверка длинной истории

Fresh `live-1789222274165` прошёл16повторов; на17-м (group19) native right buffer
снова продублировал record635. UI screenshot и Ext cache сохранены. Повторное
открытие панели не исправило; show_completed off/on перестроил список, но также
пересоздал внутренние record IDs. Поэтому такой refresh запрещён после baseline.
Добавлен refresh ДО baseline только для длинной полностью завершённой истории
(30records), с точным сравнением server process IDs, родителей, caption, state/error.
После обновления baseline получает новые record IDs; execution guards не ослаблены.
142профильных теста PASS, включая этот переход. Python498PASS.
Новая отдельная сессия `live-1789222933291`, exec22095, source
`c5c6a69e69d91b64231617833f7f97354fcd04a4ff0986ad8d4766766270348c`,
пакет `/test-1/packages/Union-process-refresh-20260912.lgp`: prime+18cycles.
Предыдущая диагностическая сессия закрыта. Hermes пока не запускается.

Свежая проверка завершилась:18/18cycles SUCCEEDED, independent sequence+execution
audit PASS18/18, returned execution IDs совпали. Исходный Union prime создаёт2
groups, полная история достигла20. `process-fresh-audit.json` сохранён рядом.
Диагностическая сессия закрыта exit0. Full suite1378PASS/1SKIP (повтор с локальными
сокетами после sandbox EPERM в lock/shutdown тестах), Python498PASS, diff-checkPASS.

Заключительный Hermes запущен: `20260912-172619-f01cae66`, exec75917. Sol/low,
явный Loginom7.4.2, `/test-1`, source pin c5c6a69e69d91b64231617833f7f97354fcd04a4ff0986ad8d4766766270348c.
Source/goal/auditor заморожены до результата и полного audit.

Hermes `20260912-172619-f01cae66` самостоятельно завершил12/12операций безUI
резерва. Frozen audit69/70: единственный FAIL changed_union требовал inputs=[],
хотя запрос повторно объявлял те же3связи. Все raw configs/full outputs/save/reopen
прошли. Старый отчёт не переписывался. Исправлен auditor: принимает[]или точные
исходные3links и отдельно проверяет неизменность полного графа, отсутствие
effects/receipts. Диагностическое чтение старого evidence подтвердило условие.
499Python testsPASS, включая отрицательные подмены графа/эффектов.
Новый заранее замороженный run `20260912-174232-0449c132`, exec2207, тот же
source pin c5c6a69e69d91b64231617833f7f97354fcd04a4ff0986ad8d4766766270348c.
