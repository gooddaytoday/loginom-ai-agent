# Узел11 «Замена»: source-разработка

Статус: исследование UI; обработчик пока не реализован. Ветка
`codex/node-11-replacement`, база `a3b419bde8a660e1905284ee62a46362d5a49e09`.
Автономная приёмка Hermes и ревью не запускались.

## Допуск и pins

Собственный classic MCP: Node24.19.0, Playwright1.63.0-alpha-2026-08-31,
MCP0.0.80, Chromium153.0.8010.12/revision1243. Source revision
`c475d504d9d81f54807c6a3b272351b6fbbe0959d434465e384dc3e0caca190a`:
все элементы clientSourceManifest сверены с файлами этой ветки.

Первичная сессия `f451c7ae-3f1e-46ac-bc74-a880740d30ab`; собственные config/state,
profile/artifacts лежат в `.dock/stream-runtime`. Полный skill получен через
`dock_prepare`, revision `afa295bf48dc48da5d3c995665a06ef2190ff620bae3243d46557e0371536790`.
OpenViking health успешен, actor retrieval выполнен без обращения к Peer main.
Loginom7.4.2, вход test-2 и личный каталог /test-2 подтверждены UI.
Окно1508×949, viewport:null, доступная область1512×949; launch --start-maximized.
`archiveActive=false`; отсутствие исполнения всех глобальных hooks не доказано.
Безопасный приватный допуск: `.dock/stream-preflight.json`.

## Диагностические пакеты

- `/test-2/Node11-Diagnostic-20260912-f451c7ae.lgp`: первичное создание узла.
- `/test-2/Node11-Source-0e808ea9.lgp`: сохранённый импорт шести строк; повторное
  открытие подтвердило наличие узла. Открылся readonly после завершения старой
  сессии; старый браузерный процесс отсутствовал. Для продолжения сделана копия.
- `/test-2/Node11-Rules-88e87e25.lgp`: собственная редактируемая копия, исследование
  строковых и вещественных правил; текущие последующие правки ещё требуют сохранения.

Harness `.dock/replacement/harness.mjs` создаёт полный source bridge, вызывает
`dock_prepare` и pinActionCatalog, затем публичный MCP wire существующего executor.
Рабочая сессия `88e87e25-0f56-476d-a4dc-dcaa1273141e`; её `prepare.json`,
`remote-pins.json`, `browser-*.json` и именованные результаты — приватные evidence.
Повторные старты имеют собственные профили. Для текущей сессии выставлен settle:0.

Неизменяемый каталог `2026.09.11-parallel-pilot.1-candidate`, digest
`4ac827fc9e0cefa609bf2cb8fd7d3d79318dd3fe92999decc7e385fae51fc6e2`, прошёл
проверку хешей/ABI/profile. Селекторы и действия add/link/import совпали с базой;
save-действия отличаются revision/effect (разрешены test-1/test-2/test-3).
Это только основа диагностики, не допуск нового узла или новой автономной приёмки.
Новый candidate-каталог потребуется отдельно; серверные каталоги не менялись.

## Наблюдения реального UI

Help substitution/{README,exact-match,other-match}.md и E2E sReplace.ts,
packages.ts, filedialog.ts, replace_helpers.ts, variant_value_editor.ts прочитаны
через Dock. Начальная palette содержит «Трансформация → Замена»; иконка
`vendors/replacecolumns.svg`.

- grdDataList: Ext.data.Store / bg.ext.CollectionProxy, имена и типы полей,
  ReplaceMode0=не заменять,1=ввод вручную. Новые поля по умолчанию mode0.
- grdReplaceItems: Ext.data.Store / bg.ext.CollectionListProxy. totalCount бывает
  0 при непустой таблице; имеются пустые placeholder records по группам.
  Реальные записи имеют CollectionID0, Index, DataValueType, ReplaceByType,
  ValueRender и ReplaceRender. CollectionID1 относится к regex.
- ValueRender сохраняет тип: string, number либо null. Null и пустая строка
  различаются. Проверены North→N, Null→Missing, пустая→Empty, null→Literal;
  вещественная1.25→9.125. Подменять эти поля удалёнными proxy getters нельзя.
- Row data-tid дублируется summary-строкой; выбирать реальные tr.x-grid-row,
  исключая .x-grid-row-summary, и связывать с record identity.
- Добавление точной пары не открывает редактор. Нужен double-click реальной строки;
  commit через roweditorbuttons;update и ожидание закрытия. String editor txt,
  real editor num (русский десятичный ввод). Null задаётся trg_SetNullTrigger.
  Локальный Controller.FVariantEditor имеет FValueIsNull и FDataType.
- Other combo:0=сохранить,1=Null,2=явное значение,3=regex. Checkbox case_sensitive
  подтверждён getValue=true после клика DisplayEl. Одного press Space было
  недостаточно для доказательства изменения.
- Выходной мастер DerivedDataSourceMappingEngineOutputPortWizard:
  btnProduceType cycle dptDefault/dptSupplement/dptReplace. Supplement сохраняет
  исходные поля, добавляет *_Replace и boolean *_Replaced. Переключение режима
  сохраняет предыдущий порядок target mapping и дописывает новые поля в конец;
  порядок источников и выхода поэтому различается.
- После Execute автоматическая метка стала «Замена: Category, Amount»; data-tid
  изменился. Ссылки нужно перечитывать по GUID. Повторное открытие активного узла
  требует адресного подтверждения деактивации.
- Ручной quick preview6×9 подтвердил отдельные строковые Null/empty/null и
  сохранение1.2501 при точности0 (flag=false). Quick preview округляет real:
  полноточная приёмка требует Table и независимого expected.

## Диагностическое ограничение

Первая операция импорта `node11-import` в сессии `0e808ea9-…` вернула AMBIGUOUS
на read: закончился общий300-секундный бюджет при восстановлении формата Table.
Настройка и execution подтверждены; UI показал все6 строк и закрытый формат.
Первое ожидание «Table format dialog closed» прошло за1.65с, повторное остановлено
остатком общего deadline (~0.56с). Операция не повторялась, её статус не подменён.
Classic settle создавал накладные задержки; следующий harness использует settle:0.
Код продукта для этой причины не менялся.

### Продолжение: native reader и черновик handler

- После штатного восстановления разорванной сессии подтверждён integer editor
  `Int64Field`: пара `1 → 9223372036854775807`. Локальный `ReplaceRender` содержит
  BigInt для большого значения; reader сериализует integer десятичной строкой.
- Native `FIconCls` узла подтверждён: `bg-vendor-icon-replacecolumns`.
- Ручной пакет `/test-2/Node11-Rules-88e87e25.lgp` выполнен и сохранён штатной
  кнопкой Save. Имеет Category/Code/Amount, supplement; это диагностический
  пример, не acceptance expected. Отдельное reopen-readback ещё впереди.
- Добавлены черновые parameters/context/procedure/output/readback/node и
  регистрация `transform.replace_columns`, `mode=exact`; workspace observation
  привязывает поле/пару к record ID. Native reader проверен на Category и Code.
  Handler целиком ещё НЕ проверен; production/admission не объявлены.
- Переключение поля обновляет таблицу асинхронно: сразу после выбора Category
  reader отверг прежнюю integer-таблицу, после обновления прочёл четыре пары.
  Procedure ожидает смены record IDs; нужны дополнительные проверки однотипных
  полей и отсутствия устаревшего readback.
- Следующий шаг: свежий source harness для новых ревизий модулей, проверка
  `node.apply` и исправление контролов редактора/inline output на живом UI.

### Первое подключение handler

Новая source session `90de4e18-8195-4201-b457-b11a86cac8c8`, геометрия
1508×862/1508×949, viewport null. Пакет `/test-2/Node11-Handler-90de4e18.lgp`
создан копией сохранённого источника. У источника GUID
`e767562b-c17a-4e0f-a243-425fcf46c6a8`, у нового узла
`d319aa17-0f0d-4700-8c7b-c99f2658eef7`.

Первый `node11-handler-1` создал/связал узел и остановился на input_mapping:
после Save As breadcrumbs ещё имели старые tids, обновившиеся при открытии
мастера. Узел не дублировали. После ручного Done входного mapping выполнили
новый workspace.prepare `node11-prepare2`; новый workflow ref заканчивается
`-2`. `node11-handler-existing-1` подтвердил input_mapping/open и остановился
на недоступном AddButton. Обе ошибки сохранены как AMBIGUOUS, не PASS.

Прямая Codex-диагностика загружает свежие source-модули в отдельный debug channel
в текущем браузере; это не неизменяемая ревизия MCP и не автономная приёмка.
Перед итоговым полным node.apply требуется новый source session с pin всех
окончательных модулей. Через debug channel уже подтверждена настройка
North→N, case-sensitive, other keep, остальные поля без изменений.
Исправлены выдача AddButton/roweditorbuttons и точные Int64 значения.

Обнаружено, что новый inline output открывается в режиме «Связи»; до полного
native mapping read требуется переключить его в «Таблица». Меню produce mode
также отдельный portal; добавлен узкий выбор его root. Полный выход ещё в работе.

Проверки: replacement parameters 6/6; node-procedure + sorting-context + эти
parameters 71/71; workspace-ui + node-api + node-mapping-context 287/287.
Последние изменения menu-root после этих 287 тестов ещё не перепроверены.

### Ограничение реального редактора «остальные → значение»

Через обычный UI введено `-5.125` в `edtReplaceOtherFloat`; после commit
прочитаны `getValue=-5.13`, raw `-5,13`. Локальный контрол
`Ext.form.field.Number` имеет `decimalPrecision=2`, `allowExponential=true`,
menu=false. Обычная exact-пара `1.25 → 9.125` сохраняет все знаки.
Это разные контролы. В parameters добавлен ранний отказ other/value real,
которые меняет округление до двух десятичных знаков. Ограничение передано
координатору; нативные свойства контрола не изменялись. Для оставшихся QA
выбрано точное значение `-5.25`.

Через direct debug успешно пройдены inline output add и отдельный output
с загрузкой полного source schema. Порядок по умолчанию Loginom проверен,
намеренный output mapping/order ещё нуждается в QA. Добавлены четыре
отрицательные/identity native-reader проверки (4/4); общий replacement набор
до добавления ограничения other/value был 10/10.

### Checkpoint перед свежим полным прогоном

`direct-multi-5` подтвердил все три набора правил: Category четыре типизированные
пары + other Null/case true; Code 1→Int64 max + keep; Amount 1.25→9.125 +
other -5.25/precision0. `multi-inline` подтвердил supplement 11 полей.
Мастер завершён Done, выполнен UI Save и закрытие пакета. Source harness
`90de4e18-8195-4201-b457-b11a86cac8c8` закрыт штатно, exit0.

Новый нюанс: после повторной загрузки `ReplaceRender` большого Int64 — локальная
структура `{lo,hi}`. Reader теперь декодирует её через BigInt без методов объекта,
с проверкой собственных data descriptors и 32-битных границ. На текущий момент
replacement unit-набор 12/12. В `fixtures/replacement/` созданы CSV и независимый
ручной expected-multi (6 строк, 11 колонок в явно заданном порядке). Это ещё не
сверка с выполненным результатом.

Следующий source harness должен открыть `/test-2/Node11-Handler-90de4e18.lgp`
без Save As (чтобы не получить отложенную смену breadcrumb tids), выполнить
source import, затем node.apply на существующем GUID
`d319aa17-0f0d-4700-8c7b-c99f2658eef7`, с output mapping в порядке expected-multi.
После полного прохода требуются остальные cases, независимый auditor, negative
подмены, документы, финальные tests и локальный commit. Полный node.apply всё
ещё не был успешным, readiness не объявлена. Hermes не запускать.

### Полный multi и независимый flag probe

Свежая session `e1c4b3ce-424a-4a65-8fe5-25f4dbec6805` открыла пакет напрямую,
без read-only и без смены tids. `node11-complete-multi-1` внутренне SUCCEEDED:
11 фаз, 6/6 строк, 11 полей в явном порядке, exact numbers. Публичный MCP
ответ был отклонён из-за отсутствовавшего replacement readback в result schema;
вариант добавлен и проверен отдельным schema-тестом (общий файл 7/7).
Нужна свежая проверка публичного контракта; исходный transport error сохранён.

Независимый `replacement_configuration_evidence` по raw observations дал PASS.
Первый output audit дал FAIL ровно на Category_Replaced для north/Other:
ожидали false по pinned Help other-match, получили true. Help перечитан через
текущий source harness: пример действительно содержит false.

Для отдельной проверки создан `Node11 Flag Probe` (GUID
`39403e16-be7a-450c-a7a5-c4c7975cfa55`), операция `node11-null-flag-probe`:
пустая exact-таблица Category, case=true, other=null, add. Все 6 выходных значений
Null и все 6 флагов true, включая уже Null-вход. Вызов внутреннего source runtime
обходит только известную ошибку публичной result schema; не является новым
успешным MCP admission. Полный source handler прошёл и на новом узле.

Закреплена target-specific семантика Loginom 7.4.2: other keep unmatched=false;
other Null=true; other value=true. Флаг не равен «значение изменилось».
Expected-multi обновлён после отдельного probe для будущего проверочного прогона;
первый failed audit не переписан. Документированный пример Help расходится с
проверенным стендом. Нельзя выдавать это за поведение всех версий Loginom.

### Остановка живых проверок из-за подключения Dock

После закрытия диагностического браузера свежий source harness завершился до
подготовки: connect timeout к `loginom.duckdns.org:443`. Три последующих
read-only HTTPS проверки также завершились `SSL connection timeout`.
Подмена endpoint/provider/model и изменение сервера не выполнялись.
Последняя успешная session e1c4b3ce закрыта штатно; её пакет сохранён UI Save
после штатного восстановления разорванного соединения и закрыт.

Общий набор клиента: 1398 проверок, 1388 PASS, 1 SKIP, 9 ошибок EPERM при
открытии локальных сокетов в sandbox. Повтор четырёх соответствующих файлов
с разрешёнными локальными сокетами — 14/14 PASS. После дополнительных защит
уникальности output sources и присутствия produce_mode профильные tests — 21/21.
Independent audit после отдельного flag probe — PASS. Negative audit сначала
обнаружил пропущенную подмену имени схемы, затем после явной сверки returned
schema — 12/12 PASS; оба отчёта сохранены раздельно.

Новые файлы аудитора проверяют одну операцию. Они **не** заявляют source-byte
identity, package persistence или autonomous acceptance: эти внешние проверки
ещё предстоит завершить. Нужны новый публичный MCP прогон исправленной схемы,
full source/import proof, оставшаяся live-матрица и отдельный reopen/reexecute.
Координатору переданы сетевой блокер и ограничения. Узел14 исключён из будущей
очереди этого потока по сообщению координатора; текущий scope — только узел11.

Финальная локальная проверка после усиления выбранного record binding и
добавления Replacement в тест условного Next: `workspace-ui` 261/261 PASS.
`git diff --check` и компиляция трёх Python-аудиторов прошли. Исходная
bootstrap-правка `.gitignore` сохранена отдельно и не включается в commit узла.

### Возобновление 13 сентября: публичный MCP и расширенная матрица

HEAD при возобновлении `e4ae106842293d65fa10399284fe0deab2762898`, ветка и
изолированный cwd подтверждены; исходная `.gitignore` сохранена отдельно.
OpenViking healthy. Первая новая подготовка получила skill HTTP409; отдельная
read-only загрузка manifest и всех восьми entries прошла, затем полноценная
подготовка session `961f9801-0b4f-4eae-bde1-156bf3a1224e` прошла.
Source client revision `ad2074a2cc3f7b32be9a1194ccf14bc65d36933c06a68c90ce855cfbe480a4d4`,
Node24.19.0/Chromium1243 и прежний immutable candidate catalog закреплены.
Dock connection.ok; свой профиль, account test-2, окно1508×949/viewport1508×862,
viewport:null и --start-maximized проверены. Архив inactive, что не доказывает
общую изоляцию hooks. Новый пакет или действия в других аккаунтах не выполнялись.

`node11-complete-multi-1` теперь успешно вернул публичный MCP результат.
Independent configuration/output/schema audit PASS: 6×11 и точный Int64 max.
Повтор operation ID: result идентичен, browser sequence1518→1518.
Публичный `node11-save-multi` package.save_checkpoint SUCCEEDED; содержимое
после reopening этим ещё не подтверждено.

CSV доставлен под `/test-2/Node11-input-961f9801.csv`, 124 байта/SHA256 совпали.
Исходный import обновлён через публичную операцию. Создан отдельный
`Node11 QA Input` GUID309f2e5a-666e-4d4b-b7dd-b16b2f483012, затем новый
`Node11 QA Replace` GUIDb765d170-af84-4c14-8b8f-90dbdc9330d7.
`node11-qa-new` и independent audit PASS: replace, casefalse North/north,
integer2→Null, unmatched→Int64 min, input Code→Key и одинаковые метки Category/Keep,
output aliases/order/Id exclusion; весь результат6×6 совпал с заранее сохранённым
expected-qa.json. Это Codex QA, не Hermes acceptance.

Полный аудитор import обнаружил ошибку приватной обвязки: journal metadata
`targetIdentity` был null (в classic metadata не обновляется от ручной workspace
подготовки). Исходные отчёты source-audit/qa-source-audit оставлены FAIL;
не переписывались и не подменялись. Для следующих операций после отдельной
проверки live origin/build закреплены targetIdentity и actionManifestDigest.
Команда prepare-handler исправлена для будущих сессий. На этой точке запущен
новый `node11-import-verified` для полного source-byte audit без ослабления
существующих проверяющих функций. Далее partial update/Done/Close, широкие правила,
пустой вход, сохранение/reopen/reexecute и outer audit. Readiness пока не объявлена.

`node11-import-verified` создал Node11 Verified Input
GUID5ad19625-aaaa-4170-9315-d70b651c593e; integrated delivery/source/output и
configuration audits теперь PASS. Partial update `node11-qa-update-done`
остановился AMBIGUOUS на conditional output: `Grouping output must have unique
source links`. Живой UI сохранил excluded Id с `exclusion_source`; Replacement
передавал общий default sourceOf, который учитывал только source. Исправлена
передача sourceOf=source??exclusion_source; профильные7/7 PASS, в том числе
сохранение aliases/exclusion и отказ дублированной связи.

Pending operation проинспектирована; internal resume недоступен. Мастер закрыт
штатным Close с подтверждённым диалогом «Вы действительно хотите закрыть мастер
настройки?» → Да, rollback подтверждён закрытием мастера. UI Save сохранён,
пакет закрыт; отдельный snapshot подтвердил Home и отсутствие Graph/Wizard.
Session961f9801 затем штатно закрывается. Неуспешная операция не переименована
в успех. Wide/partial/Close/refusal команды и независимые expected готовы,
ещё не исполнены. После свежей подготовки восстановить GUID refs из живого графа;
не использовать прежние document/workflow IDs. Следующий full public прогон
должен использовать исправленный replacement-output и новые runtime pins.

### Исправленная свежая сессия и lifecycle

Session7809ab9a-c36e-44cf-b5b7-bf8f38de7347 закрепила исправленный source;
prepare заранее задаёт journal targetIdentity/manifest. Подтверждены собственные
GUID в новом document1789251509304-hwra6lqdrq4/workflow-1 и окно1508×862.
Node11 QA Input и Verified Input активированы только после чтения inactive
значка собственного порта; после жеста прочитан active. Прямой repeat
`node11-qa-reopen-unchanged` с parameters={} дал прежний6×6, independent PASS.
Это подтвердило rollback неудачной настройки и сохранение output aliases/exclusion.

`node11-qa-update-done` исправленного source SUCCEEDED: Category полностью
заменена на North→Changed/casefalse/otherRest, Key не изменён, output mapping
сохранён. Configuration audit PASS; execution not_requested/output not_refreshed.
`node11-qa-updated-execute` с parameters={} — independent6×6 PASS.

`node11-qa-close` ввёл заведомо отличающийся черновик Other→MUST_NOT_PERSIST,
case=true/otherNull и завершился Close: configuration discarded, no execution.
Два публичных dock_node_apply одного ID во время running и дальнейший status/wait
дали ровно один node_apply_prepared и один checkpoint. Затем
`node11-qa-after-close` с parameters={} дал unchanged6×6 PASS; отдельный
replacement_lifecycle_evidence сверил наблюдавшийся изменённый черновик,
Close, принадлежность узла и полное совпадение сохранённых settings до/после.

Четыре public API отказа прошли до браузера (sequence1911→1911 каждый):
конфликт North/north в casefalse, nonASCII casefalse, precision1,
remaining real-5.125. Source tests после исправления27/27 PASS.
Negative multi после усиления точной request→journal привязки12/12 PASS.
На этой точке запущен новый Node11 Wide с24 строковыми парами и заранее
заданным expected-wide; результата ещё нет. Пустой вход и final save/reopen
ещё впереди. Автономную приёмку и review не запускать внутри разработки.

Wide остановился после13 пар: AddButton оставался в DOM, но находился выше
scroll viewport (button y343, grid y373..714). Raw pair grid scroll.top=35,
max_top75. Прямая физическая wheel(-400) вернула button y378 внутрь области.
Исправлен revealReplacementAdd: перед Add bounded scroll только по привязанной
таблице пар, неизменный selected field, обязательное уменьшение top; 2/2 tests
проверили несколько прокруток, no-op, чужую таблицу/поле и отсутствие прогресса.
Старый AMBIGUOUS не переисполнялся вслепую. После inspection и live диагноза
мастер Node11 Wide закрыт Close/Да с подтверждённым rollback. Узел остаётся в
графе для следующего existing-target прогона; новый дубль не создавать.
Session7809 затем сохраняется и закрывается для новых source pins.

### Заключительная исправленная ревизия, пустой вход и persistence

Sessione1368ffd-31b0-4766-968a-076b121d1e6c, source revision
`8ff2de3c4e5e35dc4a2f02af1b2e1d6608ef7448e91ce72a9a67653a9005690f`.
Проверены155 файлов source manifest: расхождений нет. Node11 Wide найден по
GUIDde5f7509-4671-4240-bc55-68f477bfb4da в новом document/workflow. Повтор
`node11-wide-existing` успешно настроил24 строки Category и числовые Code/Amount;
independent raw/config/output/schema6×11 PASS. Затем тот же CSV заново доставлен
под `/test-2/Node11-input-e1368ffd.csv`, existing Verified Input обновлён полными
settings и точным target label; full source/config audit PASS без ослабления
общего аудитора. `node11-wide-source-refreshed` parameters={} —6×11 PASS.

Пустой CSV `/test-2/Node11-empty-e1368ffd.csv`:29 байт,
SHA2564df9ac77b4092d75e010a5b4e430023549fd2428d76110382cb73fbaf8377cf3.
Node11 Empty Input GUID1e1b589a-0969-43a7-8ebe-084de59384b4 и Empty Replace
GUID923a1793-5127-4bbc-9c90-0c893529b32f созданы в этом пакете. Полный source
аудит и replacement0×7 PASS, включая полную выходную схему при отсутствии строк.

`node11-final-save` package.save_checkpoint и `node11-final-reopen` package.save_as
прошли публичный MCP. Граф точно совпал с заранее заданным expected:
9 обычных узлов/5 связей (системные переменные исключены из стандартного snapshot).
Сохранён прежний собственный путь `/test-2/Node11-Handler-90de4e18.lgp`.
После настоящего закрытия/открытия prepare-persisted вернул тот же document,
новые MF;TF-5/tab5/workflow-2. Все GUID заново прочитаны из живого графа.
`node11-import-persisted` с пустым settings и прежним источником дал fresh6×5;
общий existing-import аудитор с ранее проверенным seed —PASS. Затем
`node11-wide-persisted` с parameters={}/mappings=[] дал fresh6×11, правила и
все mappings идентичны до/после reopening. Persistence audit v2 PASS; первый
отчёт сохранён FAIL, потому что аудитор ошибочно ожидал revision1 сохранения
из локального базового каталога. Проверенные по хешу в source harness pinned actions
имеют revision2 для обеих операций; v2 принимает явные проверенные revisions,
не выводит их из проверяемых events. Все6 подмен path/graph/close/session/settings/
reconfiguration отклонены.

Дополнительная отдельная диагностика `node11-dropped-response`: локальный
InMemoryTransport действительно отбросил JSON-RPC ответ dock_node_apply после
старта worker. MCP клиент получил timeout-32001; status/wait восстановили
SUCCEEDED без повторного запуска. Это fault-injection диагностика Codex,
не автономная приёмка. Изменения параметры={} на прежнем QA Replace завершены
Done без выполнения. Итоговый UI Save сохранён перед закрытием сессии.

Полный client suite на текущем source:1402 PASS/1 SKIP,0 FAIL (1403 tests),
с разрешёнными локальными сокетами. Python-аудиторы скомпилированы,
git diff --check прошёл. Ни Hermes, ни review, ни следующий узел, ни push/merge,
ни build/deploy/обновление общего плагина не запускались. Дальнейший процесс
ведёт координатор: одно ревью в этом же чате Astra/medium, затем при необходимости
один раунд подтверждённых живым UI доработок; повторного review после него нет.
Hermes Sol/low — только после выдачи единственного слота координатором.

Итоговый статус этапа: **разработка завершена, готов к отдельному ревью**.
Проверка потерянного ответа PASS, все3 её подмены обнаружены; суммарно26/26
negative evidence. Итоговая сводка содержит19 PASS-групп. Последний snapshot
подтвердил Home без Graph/Wizard, harness e1368ffd завершился exit0.
Ограничения и дальнейшие требования находятся в
`docs/plans/loginom-dock/11-development-audit.md`, машинные результаты —
`docs/loginom-dock/replacement-development-2026-09-13.json`.
Автономная приёмка не подменена этими проверками. Настройки, модели, production
и общий плагин не изменялись. Передано на локальный commit в текущей ветке;
bootstrap `.gitignore` не включается.

## 13 сентября: назначенный раунд исправления N11-R1 — выполняется

Единственное ревью рассмотрело полный диапазон a3b419bde8a660e1905284ee62a46362d5a49e09
→ 8aaf6a8a425d94974d65b5bd8b27a55f362fac4d. Отчёт:
`docs/plans/loginom-dock/11-code-review-2026-09-13.md`. Повторное ревью и Hermes
не запускались; координатор назначил один раунд исправления N11-R1.

Обе формы дефекта подтверждены на неизменённом кандидате, в отдельных source
sessions test-2. Сессия `0d961a54-13c6-45f6-ae25-e6227901c1df` создала через
публичный save_as диагностическую копию `/test-2/Node11-R1-0d961a54.lgp`, исходный
пакет разработки не редактировался. Копия содержит дополнительный CSV-вход
`A;A_Replace;B;C`, 2 строки; доставка67 байт, SHA256
`e195cdcbcc187601a822f31e26fc7d55f9507c66c51cb9e9d799d785649a1123`.
Исходные узлы настроены и выполнены, копия сохранена до конфликтующих запросов.

- `node11-r1-attempt1`: исходный replace с правилом A, только output_mode:add.
  Реальное переключение produce_mode в supplement, имя A_Replace_1, затем
  AMBIGUOUS / Replacement generated schema differs, pending configure.
- Сессия `4a25e4eb-abad-4f3b-a9c3-5d477644e2e3`, `node11-r1-attempt2`:
  исходный add с правилом B, новое правило A без output_mode. В raw stores уже
  появились A/north→North при сохранённом B/old→New; выход получил A_Replace_1,
  затем тот же AMBIGUOUS. После каждого отказа черновик отменён через UI,
  пакет закрыт до Home; оба harness завершились с exit0.
- Дополнительная прямая диагностика показала: при открытии Replacement страница
  выхода уже создана, но iconCls produce-mode ещё не инициализирован. Next без
  изменения правил открывает её и даёт проверенный supplement. Поэтому чтение
  скрытого неинициализированного контрола не используется.

Исправление объединяет сохранённые и переданные правила до их изменения. Для
partial rules без режима выполняет Next→чтение output policy→Previous в том же
мастере, затем проверяет сохранность правил/входа. Коллизия отменяет черновик;
FAILED/cleanup=true разрешается только по проверенному закрытию своего узла,
при этом effect_possible=true честно сохраняет деактивацию/ранние фазы.
Handler revision replacement-v1-internal-2. Source revision новой сессии
`32dcbd73-e39c-486b-a0f5-c8e4f9dec541`:
`892f346d250f3696d30913dadfb0b7f61f86ac252d77be256649effae96a1ff7`.
75 targeted PASS; полный client suite1405 PASS/1 SKIP,0 FAIL.
Живая проверка исправления ещё выполняется; готовность этого раунда не объявлена.

Дополнительно по запросу координатора выполнен MEMORY_ACCESS_CHECK. Собственный
Peer остался worktree-derived. Адресный find общей памяти прошёл; единственный
read отклонён автоматической проверкой разрешения. Настройки/Peer не менялись,
повторов/обхода нет; координатор получил точную ошибку. Это не блокирует работу
по своей доступной памяти, исходникам и live evidence. Правка AGENTS.md от
координатора и bootstrap .gitignore сохраняются отдельно.

Первая fixed-сессия 32dcbd73: before1/reject1/after1 завершились ожидаемо;
независимый partial-refusal audit подтвердил неизменность правил, режима, mapping
и всех2×5 значений. Для reject2 новый policy-probe получил readiness timeout
до Next: perform не имел initialObservation с node_replacement, поэтому native
readiness не переносилась в новое наблюдение. Live snapshot подтвердил только
старое правило B. Добавлена передача свежего initialObservation и проверка этого
контракта в targeted-тест;75/75 PASS. Сессия закрыла черновик, сохранила только
проверенные исходные mappings диагностической копии и завершилась с exit0/Home.
Новая сессия запускает целевую матрицу на итоговом source; повторное ревью не было.

Сессия 1fea2a71-fe34-41de-8521-beca917247c1: начальный before2 был NOT_APPLIED
без эффектов из-за кратковременной маски после активации источника. Маска проверена
как снятая; resume отклонён штатным контрактом, затем отдельный before2-ready
успешно выполнился. Policy-probe reject2 прошёл Next/Table/Previous, но штатный
Previous пересоздал Ext input records:381–384→402–405 при полностью тех же
A/A_Replace/B/C, labels/types/modes/order. Старое сравнение временных IDs было
слишком строгим. Добавлены проверка полного неизменённого содержимого перед
перепривязкой новых IDs и явная квитанция input_inventory_refresh. Аудитор принимает
только наблюдаемый переход с той же полной схемой и реальным Previous, прочие
смены identity по-прежнему отклоняет. Тест также отклоняет изменение label при
таком обновлении. Черновик отменён, копия закрыта без сохранения изменений,
Home подтверждён, harness exit0. Новая fixed-сессия c6874c61-d27b-41b6-a618-00074f6c9bf4
продолжает целевую матрицу; все эти итерации относятся к одному назначенному раунду.

## 13 сентября: назначенный раунд N11-R1 завершён

Финальная сессия c6874c61-d27b-41b6-a618-00074f6c9bf4: все девять операций
завершились ожидаемо (семь SUCCEEDED и два контролируемых FAILED).
13/13 групп независимого аудита PASS;16/16 подмен обнаружены. Source pin
b99b922033e87b7580f14c2eec8cd0744c23bab29ee45b2548212cdac8c394ca,155 файлов
совпадают. Полный клиент:1405 PASS/1 SKIP/0 FAIL; целевой набор75/75 PASS.
Копия /test-2/Node11-R1-0d961a54.lgp сохранена публичным checkpoint; граф
12 узлов/7 связей совпал с исходной диагностической копией. Новый reopen не
проводился. Home подтверждён, harness exit0.
[Полный отчёт](../plans/loginom-dock/11-fix-results-2026-09-13.md).
Следующее действие назначает координатор; Hermes без слота не запускать.

## 13 сентября: комплект автономной приёмки подготовлен

Команда node11:acceptance-preparation:1:91dee921e9e17343d53bf20fd7ca5f3b19f8de7a.
Код runtime не менялся. Подготовлены обычный goal, два CSV, полные эталоны,
внешний автономный аудитор и запуск на существующей подписке Sol/low.
28 тестов и preflight PASS;7 групп на сохранённых доказательствах PASS,18 подмен
отклонены. Это подготовка: нового live/Hermes/reopening ещё нет.
Source archive389 файлов совпадает с91dee921. Candidate2026.09.13-node11.1-candidate
только предложен; проверенного URI/SHA нет, stage закрепляет координатор.
[Отчёт](../plans/loginom-dock/11-acceptance-preparation-2026-09-13.md).
Следующий шаг — передать stage/readback и слот; ручной checkpoint N11-R1
по-прежнему не доказывает persistence окончательной ревизии после reopening.

## 13 сентября: первый Hermes завершён с полным FAIL, диагностика закончена

Run20260913-054024-fef0b53e, candidate28434c4b61305eaa08c76db1dad470599852b48f333f734ad3e946687941ab37,
код91dee921, подготовкаbe4d31bf. HermesSol/low:31APIcall,exit0,11/11nodeSUCCEEDED.
Полный audit55/59,FAIL: отсутствует отдельный checkpoint перед save_as;
аудитор считает пустую precheck metadata второй рабочей сессией. Геометрия
исходного окна не подтверждена из-за CUA ScreenCaptureKit -3811.
Postrun выводы обеих Замен, настройки и новые execution IDs проверены отдельно
и не заменяют общийFAIL. Диагностическая сессияc8a8405c-c68e-4c1b-a795-1bbba83e7da0
открыла пакет только для чтения, подтвердила4узла/2связи и своё окно1508×862.
После устранения оставшегося avatar-menu mask пакет открыт, затем закрыт;
Home,graphCount0,harness exit0. Собственных процессов нет.
Слотnode11-hermes-20260913-28434c4b освобождён; координатор отозвал его и передал12
командойnode11:slot-release-control:20260913-054024-fef0b53e. НовогоHermesнебыло.
[Отчёт и следующие шаги](../plans/loginom-dock/11-autonomous-acceptance-2026-09-13.md).
Goal/auditor/source не исправлялись в этом ходе: сначала решение координатора
о двухэтапном save, metadata gate и измерении исходного окна.


## 2026-09-13 — acceptance-followup:1 завершён

A1: сохранение с открытым пакетом и подтверждением выделено в самостоятельный шаг.
A2: рабочая сессия связана с prepare/public/journal и pins; лишняя сессия разрешена
только с положительной официальной initialize/list_tools provenance. Исправлена
проверка полной ревизии навыка. A3: геометрия снимается внутри prepare того же
браузера; прямой окончательный smoke прошёл, свои черновики закрыты штатно.
Клиент `7de7f23e`, 1407 PASS/1 SKIP/0 FAIL; harness41 PASS; новый исходный архив392 файла.
Исторический FAIL и все опубликованные хеши сохранены; пропущенный checkpoint
по-прежнему отклонён, происхождение старой extra session не доказано.
Новый runtime требует новой сборки/stage/readback. Save/reopen fix принадлежит
узлу12; перед запуском учесть его интеграцию. Новый слот11 не выдан, Hermes не запускался.
[Отчёт и точные pins](../plans/loginom-dock/11-acceptance-followup-2026-09-13.md).


## 2026-09-13 — coordinator-reply-resume:1

Подготовлен минимальный пакет переноса Save As из `0e11a3fb`: runtime hunk и один
race test. `git apply --check` подтвердил чистое применение runtime; тестовый hunk
требует адаптации EOF-контекста, перенос семиколонных labels и аудиторов12 не нужен.
Код не менялся, тесты/браузер/Hermes не запускались. Статус
`integration_package_ready / awaiting_user_authorization`.
[Пакет и план проверки test-2](../plans/loginom-dock/11-saveas-integration-package-2026-09-13.md).


## 2026-09-13 — saveas-integration:1:direct-user

Пакет55ccc7b6 применён ровно в двух согласованных файлах из0e11a3fb;
source commit `b0571534`, runtime `8d6d4b3c…`. Executor38 PASS.
Focused test-2 smoke Main→Typed: checkpoint keepOpen, overwrite SaveAs→настоящее
close/reopen, повторное выполнение и полный Typed6×11; component audit10/10 PASS.
Main потребовал прежние source/settings и использовал existing import wizard;
Typed выполнился с пустыми parameters/mappings, configure effect_possible=false.
Собственный пакет закрыт штатно без пересохранения после выполнения; процессов нет.
Исходный FAIL/A1–A3 сохранены, полный аудит не повторялся, Hermes не запускался.
Новые pins и архив392 файла подготовлены для следующего stage по решению координатора.
[Отчёт и ограничения](../plans/loginom-dock/11-saveas-integration-results-2026-09-13.md).

# Узел11: candidate v2 preflight пройден — 13 сентября 2026

**candidate_preflight_passed / awaiting_hermes_slot**. Новый candidate v2 закреплён;
source/runtime/goal и 253 harness inputs проверены. Свежий dock_prepare READY,
реальная геометрия окна и save pins подтверждены, собственный черновик закрыт.
[Отчёт и команда следующей приёмки](../plans/loginom-dock/11-candidate-v2-preflight-2026-09-13.md).
Hermes11 не запускался: ожидается отдельный слот координатора, текущий остаётся node14.

---

# Узел11: автономная приёмка v2 завершена FAIL57/59 — 13 сентября 2026

Один разрешённый run `20260913-122247-a862a34d` выполнен на Sol/low.
11node.apply и обе save операции завершены; независимый аудит не принял две
persistence-проверки из-за контракта первого сохранения нового черновика.
[Полный отчёт и точный FAIL](../plans/loginom-dock/11-autonomous-v2-2026-09-13.md).
Второго запуска и исправлений не было; собственные процессы завершены.
Ожидается решение координатора, полная приёмка не пройдена.

---

# Узел11: frozen run переоценён PASS59/59 — 13 сентября 2026

Исправлен только диагностический persistence verifier: стадии нового draft
fail/пустой прежний путь и overwrite replace/точный предыдущий путь связаны явно.
Verifier `9ddb33ed`;17 focused и36 family tests PASS. Отдельный аудит тех же
замороженных evidence прошёл59/59 с provenance execution/new verifier.
[Отчёт и все59 checks](../plans/loginom-dock/11-persistence-reassessment-2026-09-13.md).
Исходный FAIL57/59 сохранён; Hermes/browser/product runtime не запускались/не менялись.
Ожидается решение координатора; следующий узел не начат.

---
