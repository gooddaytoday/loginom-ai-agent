# Фильтр строк: реализация подплана 06

Статус: **implemented / live_verified (source runtime)**, не released.
[Итоговый аудит требований и обе Hermes-попытки](../plans/loginom-dock/06-completion-audit.md).
Пользователь поручил выполнить подплан06 через `/goal`. Ниже сохранена история
диагностики; на старте рабочее дерево было чистым, OpenViking healthy.

## Проверенная исходная точка

Установленный клиент отличается от source runtime; source pin на старте
`ab4702e56bbe6dac75a7df75f99919e5f6152324bf3d0633eae11cdf4bf03313`.
Для operator harness нужен Node **24.19.0**:
`~/.loginom-dock/current/runtime/node`. Системный Node 22 отклонён штатной защитой.

Выполнен `dock_prepare` установленного подключения. Оно указывает на
dev-test staging; диагностика отдельно запущена на предусмотренном планом
`http://logi-test-plan.bg.local/app/?testable=true`, Loginom **7.4.2**,
явный аккаунт `user`, storage `/user/dock-p3/packages`.
Окно 2044×1035, outer 2044×1122, available 2048×1122, viewport null;
штатный session launcher использует `--start-maximized`.

Используется `tools/loginom-acceptance/calculator-live.mjs` — общий operator
harness с настоящим MCP для публичных вызовов и отдельной UI-диагностикой.
Доказательства: `.dock/calculator-v3/live-1789116641797/`.
Исходники Help/E2E получены через Dock, сохранены в `.dock/row-filter/sources.txt`:
`sFilterData.ts`, `filterdataTr.ts`, row-filter `README.md`, `filtering-criteria.md`.

Принятый пакет параметров полей открыт только как источник, затем создана
отдельная копия `/user/dock-p3/packages/RowFilter-diagnostic-1789116677055.lgp`.
После Save As выполнены отдельные close/reopen: label меняется раньше navigation tids.
В копии добавлен Filter06, точная связь от Данные; оба выхода [0,1] подтверждены.
Конфигурация фильтра подтверждена через Next/Done; пакет с фильтром пока не сохранён.

## Live-наблюдения

- Новый мастер автоматически создаёт одну пустую строку. Добавление следующей
  строки автоматически открывает поле; выбор поля открывает оператор; выбор
  оператора открывает значение. Нельзя вслепую кликать перекрытую ячейку заново.
- Узловой root: `WizrdMCF;FilterDataWizard;FilterDataPanel`. Не смешивать с
  фильтром БД или визуализатора.
- Grid и controller `FFilterItemsStore` связаны с локальным Ext.data.Store /
  bg.ext.CollectionProxy. `FColumnInfoStore` содержит схему и отдельный
  RowNumberer=1 (целый); `getTotalCount` устаревает после добавления.
- Строки имеют `internalId`, DOM `data-recordid` и `data-boundview`;
  условия/ИЛИ хранятся в порядке grid. ИЛИ — `IsOperatorRecord=true`.
  При синхронизации временно исчезают строки; наблюдение должно ждать окончания.
- Операторы integer: коды 0–11, string: 0–17. 6/7 — Null/not Null,
  8/9 — interval, 10/11 — list. Строковые 12–17 подтверждены отдельным native read.
- Диапазон Id 2–4 применён обычным вводом+Tab+OK. Сразу после OK было видно
  прежнее значение 0–0; позднее точное чтение подтвердило 2–4. Нужна проверка
  результата, не задержка или доверие клику.
- Список Comment `["keep","A,b"]` добавлен через btnAdd, input fill, Enter,
  затем OK; точный cached CompareValueList подтвердил оба значения.
- Range portal: `ModalWindow_BetweenValuesEditor`; controller FModel — исходная
  запись grid. List portal: `ModalWindow_ValueListEditor`, FFilterRecord.
- Null не участвует в обычных сравнениях; предпросмотр читает первые 1000 строк,
  показывает до 25 совпадений. Он не заменяет выполнение и оба выхода.

## Что добавлено и что ещё требуется

`filter-parameters.mjs`: ограниченный полный набор OR-групп с AND внутри,
точные input_field/row_number, scalar type, проверка операторов и operands,
явный string case_sensitive, запрет переменных/variant/пустых групп.
`filter-context.mjs`: отдельное bound чтение cached UI с проверкой владельца,
полной схемы, порядка строк, точных значений и привязки editor/dialog.
На живом мастере прочитан диапазон + OR + string list; полные входные поля
и три строки подтверждены (`typed-filter-context.json`).

Пока выполнены **11/11** проверок параметров. Это не поведенческая приёмка узла.
Обработчик подключён к candidate node.apply; полная публичная операция ещё не проверена. Не повышать coverage.

Далее: допроверить остальные редакторы/регистры/удаление и оба выхода; добавить
ограниченные UI refs, readFilter в общей procedure, настройку полного набора,
preflight, общий lifecycle с двумя портами и сохранением настроек. Затем
golden/source/live/QA, отрицательные проверки независимого аудитора, и только
после отладки goal-only Hermes `openai-codex / gpt-5.6-sol / low` без fallback.
Нужны save/reopen/reexecute, полный audit и измерения. Hermes ещё не запускался.
Установленный клиент, production, модели и публичный выпуск не менялись.

## Продолжение диагностики

Полная замена условий Id 2–4 ИЛИ Comment в `["keep","A,b"]` с case_sensitive=true
прошла через общий owner/epoch/receipt gate (`configure-range-list-9.json`).
CaseSensitive фиксируется только после выхода из редактора; безопасный press Tab
привязан к владельцу BooleanPropEdit;ValueControl. Next привёл сразу к Done.
`filter-done.json` подтверждает возвращение к графу после применения настроек.

Добавлены filter-procedure/node/output/readback, маршрутизация candidate runtime,
схемы groups/conditions и оба read/mapping порта. В общей оболочке добавлены
типовые hooks configureAllOutputs/readOutputs. Нативные настройки обоих выходов
успешно прочитаны и закрыты (`filter-outputs-3.json`), оба порта имеют разные GUID.
При диагностике выявлено прежнее ограничение resolver на output 0; output 1
допускается только при точной проверенной port-owner привязке.

Выполнение фильтра завершилось с независимым native process-owner подтверждением
(`filter-execution.json`), execution `1789116644403-9nrchcwy3ei:690:1`.
Первое чтение упёрлось в суффикс ViewerAddCard-1 второго порта: общий observer
ранее распознавал только ViewerAddCard. Исправлено в границах native port panel,
добавлена регрессионная проверка. Продолжается повторное чтение обоих выходов
без повторного выполнения (`filter-read-outputs-2`).

Локально ранее прошли 308 проверок procedure/UI, затем 37 параметров/API/mappings;
новая группа API/UI выполняется отдельно. Это source-проверки, не приёмка.
Диагностический harness загружен до правок; для полной публичной операции нужно
сохранить отдельный пакет и перезапустить harness с актуальным source runtime.
Текущие диагностические скрипты и все неуспешные попытки сохранены в `.dock`.


### Первый полный публичный проход и typed golden

В новой source-сессии `.dock/calculator-v3/live-1789118961710/` (runtime
`9a68cbd7fedc5606fb5f081c45fc178537c708d2d63f678065fedbf153043dd4`) полный
`filter-public-scalar.json` прошёл SUCCEEDED через MCP: existing Id>=4,
новое выполнение, оба выхода по три строки и конфигурационный readback.
Предыдущая попытка в `live-1789118633657` остановилась на чтении сохранённого
range/list: Loginom не хранит неиспользуемое CompareValue. Reader исправлен
на чтение только операндов текущего оператора; добавлен regression test.
Список доступных полей после reopen сортируется независимо от схемы mapping;
readback сопоставляет точные name/label/type независимо от порядка selector list.

Введён golden fixture `tools/loginom-acceptance/fixtures/row-filter/golden.csv`:
10 строк, полный дубликат, Null/empty, пять scalar types, дроби >2 знаков, секунды.
CSV доставлен с байтовой верификацией; новый import Golden прошёл публичную
операцию (`golden-import-2.json`) и прочитал все 10 ожидаемых строк.
Независимый математический oracle добавлен; это ещё не полный execution auditor.

Новый GoldenFilter добавлен публичной операцией. На range real выявлен native
separator=","; ввод точки удалял её. Диагностический ввод `1,23456`+Tab
сохранил 1.23456 без округления (несмотря на decimalPrecision=2 в Ext).
Reader теперь отдаёт separator exact bound number input; процедура использует его.
На дискретном datetime combo дата со временем требует запятую между ними:
`02.01.2024, 12:30:01`; обычный пробел разбирался как полночь. Значение после
запятой подтверждено отдельным поздним чтением cached condition. Для datetime
combo и datetimefield теперь различается формат ввода; повторная диагностика идёт.
Все неуспешные публичные исходы остаются AMBIGUOUS, не перезаписаны успешными.
Текущая сессия имеет pending failed public operation: последующая работа здесь
только operator diagnosis; перед следующей полной публичной приёмкой нужен новый
source harness/session. GoldenFilter node id 63cce64a-14c4-434d-8ae4-2160abac4cd7.

### Продолжение: golden, публичная матрица и аудит

В `live-1789118961710` typed golden operator diagnosis завершил оба выхода 5+5:
IDs 3,4,5,6,6 / 1,2,7,8,9, все пять типов, Null/empty и полный дубликат.
`golden-values-audit.json` подтвердил значения независимым oracle; это не публичная
приёмка всей операции. Boolean native codes подтверждены: 22/23. Отдельно прошли
datetime range/list, real list и row_number not_between. Сохранён и закрыт seed
`/user/dock-p3/packages/RowFilter-matrix-seed-20260911.lgp`.

Первый полный публичный scalar проход проверен независимым output auditor,
семь подмен checkpoint отвергнуты (`filter-output-audit*.json`). Добавлен независимый
configuration auditor: native codes, группы, owner, receipts, оба output mappings,
readback; семь подмен отвергнуты в `live-1789121026091/configuration-auditor-negatives.json`.

В матрице обнаружена повторная загрузка derived source schema при исключённых
выходных столбцах. Пока sources не загружены, reader сохраняет проверенный inventory,
но выставляет source_identity_verified=false. Get source columns восстанавливает
связи; исключённые placeholders получают новые field_id/record_id. Сравнение
сохраняет все их свойства и позиции, а для действующих полей — и field_id.
Проверены 23 focused source tests. Первые повторные публичные matrix cases после
исправления прошли. Каждый завершённый operation ID повторён без обращения к UI.

Для существующего фильтра добавлено parameters={} — проверка сохранённых условий
без их переприсваивания. Новые/пустые/неподдержанные условия по-прежнему отвергаются.
Source test подтверждает отсутствие конфигурационных жестов; live roundtrip ещё нужен.
Общий client suite: 1270 tests, 1269 passed, 1 skipped, 0 failed
(`.dock/row-filter/all-client-tests.log`). Это не Hermes acceptance.

Текущая серия `live-1789121026091` проверяет integer comparisons публично. При
одностолбцовом выходе выявлено ограничение independent Table restoration auditor:
перед Apply редактор уже восстановлен, metadata_fields ещё содержит временную маску.
Проверка значений/условий проходит, полный output audit пока не проходит. Нужно
проверить post-Apply native state и добавить строгое доказательство восстановления;
нельзя ослабить auditor лишь по checkpoint флагу.

### Post-Apply и повторная серия

Одностолбцовый формат подтверждён после Apply по закрытому, привязанному к Table
UI-cache (`live-1789121823088/restore-single.json` и subsequent public matrix case).
Общий restoreTablePrecision теперь читает нулевую страницу только для этой проверки,
не переоткрывая Format. Independent audit различает данные до восстановления и
нулевое контрольное чтение после него; поздние данные не принимаются как output.
`single-output-audit.json` passed; подмена восстановленной маски отвергнута.
Прошли 32 JS проверки output procedure/value и 31 Python output auditor test,
12 reopen tests и 4 oracle/dialog tests. Новый frozen goal contract проверен 3 тестами.

Создан черновик `filter-node-complete`: import 10 строк, первоначальная очистка 8/2,
замена условий 5/5, save/reopen и повторное выполнение без reassignment. Подготовлены
fixture descriptor и independent full-scenario auditor; Hermes ещё не запускался.

Автоматическая матрица сохраняет отдельную копию каждые 6 случаев. Warning исходного
read-only seed закрывается только после подтверждения writable copy, по точному
тексту с исходным путём и через `toast;p.h;close`; прочие предупреждения не скрываются.
В серии `live-1789122000285` первые два случая прошли, третий отказался до right_click:
UI_ROOT_STALE / observing / effect_possible=false после закрытия input mapping.
Общий bounded refresh расширен на этот конкретный pre-gesture отказ, с теми же
identity/intent, не более двух попыток и прежним deadline. Effects/foreign targets
не разрешают повтор; 50 JS procedure tests и 20 Python sequence tests прошли.
Серия `.dock/row-filter/matrix-driver-3.log` запущена на новом source runtime.
Все предыдущие неуспешные попытки сохранены; план остаётся in progress.

### Матрица, крайние случаи и независимые проверки

Полностью прошли публичный MCP и независимые config/output audits случаи 0–23:
integer (`live-1789122214514`, `live-1789122576262`) и real
(`live-1789122884553`, `live-1789123185561`). Каждый completed operation ID
повторён без новых browser calls. Для 18–23 итоговый аудит сохранён как
`matrix-independent-audit-canonical-json.json`: Python и JavaScript различались
записью малых чисел в подписи (`1e-05` / `0.00001`). Общий аудитор теперь вычисляет
ECMAScript JSON digest отдельным локальным процессом, использующим только стандартные
модули Node, без импорта обработчика. Подмена значения по-прежнему отвергается.

Публичные большие данные (`live-1789122652150`): 1105 строк, совпадение №1105,
Done без выполнения, existing `{}` execute, Close без применения нового условия,
сортировка по убыванию и номер строки после сортировки, ноль совпадений. Сохранён
чистый edge seed `/user/dock-p3/packages/RowFilter-edges-pre-empty-20260911.lgp`.
Отдельный import с discrete Id встретил ограничение horizontal reveal; fixture
large-data явно использует continuous Id. Это не устранённое ограничение импорта.
Проверки потерянного ответа после add (`live-1789122801954`), после execute
(`live-1789122892772`) и cancel перед add (`live-1789123307395`) прошли: AMBIGUOUS,
не более одной попытки, повтор operation ID не вызывает мутацию.

Пустой output как upstream обнаружил прежнее ограничение schema preview единственным
портом. Reader теперь проверяет native graph-shape identity обоих выходов и выбранный
индекс/GUID; неактивные cached DataSetForms исключены из DOM-уникальности. 9 focused
preview tests прошли. В `live-1789123295209` existing `{}` после reopen дал 0/1105,
но добавление следующего узла оборвалось из-за Loginom session disconnect. Реальная
модальная форма восстановлена оператором; частично добавленный узел сохранён в
диагностической сессии, add не повторялся. Новая чистая копия проверяется в
`live-1789124173259` (source `98b0e935b7ea94919fdf2a93477443ac75b853950fa69a135cec80ea9138dd9e`).

Случаи дат 24–29 в `live-1789123695493` дали правильные значения, но case 24 отклонён
независимым аудитором: readiness elapsed_ms=-90 после обратной коррекции системных
часов. Не ослабляя аудит, ожидания переведены на монотонный таймер с исходным parent
deadline. 51 procedure test прошёл, включая clock rollback и timeout. Матрица
перезапущена с case 24 (`.dock/row-filter/matrix-driver-6.log`). Старые попытки сохранены.

Документирован source-контракт `row-filter-node.md`, обновлена инструкция Hermes.
Preflight существующей ChatGPT подписки подтвердил `openai-codex/gpt-5.6-sol/low`,
без fallback, Loginom account `user`, storage `/user/dock-p3`; модель не запускалась.
Перед финальной приёмкой необходимо повторить preflight на окончательно frozen
runtime/harness, завершить матрицу, empty-input и typed full-output Codex QA,
проверить full-goal auditor. План и coverage ещё не готовы; production не изменён.

### Даты и устойчивое открытие Table

Повторные cases 24–29 (`live-1789124172180`, runtime `98b0e935…`) прошли оба
независимых аудита, включая readiness. Общий client suite после monotonic change:
1274 tests, 1273 passed, 1 skipped; Python acceptance suite: 471 passed. Старый
negative test port=1 обновлён после расширения source preview: допускаются два
порта, неверные индексы/типы и foreign owner по-прежнему отвергаются.

Второй empty-input run `live-1789124173259` повторил отказ полной отрисовки портов
после create без разрыва сессии. Последующая read-only диагностика подтвердила
созданный узел и полные порты; исходный operation ID не повторял add. Проверка
размещения ближе к центру в `live-1789124380569` остановилась раньше, на чтении
AfterOrder: кнопка `btnEnter` новой Table была видна после add, затем исчезла при
смене hover; UI_EPOCH_CHANGED корректно отказал до жеста, ожидание не восстановило
hover-only кнопку. Операторский dblclick по точной native карточке открыл тот же
visualizer GUID и пустой Table. Общий enter_table теперь привязан к постоянно
видимой native карточке и использует двойной щелчок. 272 focused UI/output tests
прошли, включая hidden-enter и чужие panel/card/vendor. Public empty-input run
на новом source `ff833af6…` выполняется в `live-1789124649523`.

Матрица продолжена с case 30; текущий driver 6. Независимые негативные проверки
исходного output/config аудита повторно запущены; edge audit подтвердил none,
after-order, beyond1000 и lifecycle. Старый неуспешный empty-input закономерно
не прошёл (отсутствует checkpoint), его нельзя учитывать как принятую проверку.

### Empty input принят, продолжение матрицы

`live-1789124649523` прошёл public MCP + независимые config/output audits для
reopened AfterOrder 0/1105, нового EmptyInput 0/0 и нового FromSecond, подключённого
к output 1: 1/1104. `foreign-graph-audit.json` подтверждает сохранность 9/10/11
посторонних узлов и их связей. Размещение новых узлов в средней части схемы прошло;
отказы complete-render при прежнем нижнем размещении остаются диагностическим
ограничением общего graph driver, не доказанным дефектом условий фильтра.

Общий client suite после карточек: 1274 tests / 1273 passed / 1 skipped; Python:
471 passed. Cases 30–32 в `live-1789124475019` имели правильные значения, case 33
на старом UI-reader остановился на hover-only enter. Новый runtime в
`live-1789124722758` прошёл case 30, case 31 встретил появившуюся загрузку редактора
интервала: raw browser 879/881 содержит busy mask точного BetweenValuesEditor,
а native 882 ещё не содержит готового dialog record. Добавлено wait-only разрешение
этого transient состояния: собственный wizard, выбранная строка, соответствующий
range/list operator и exact busy-mask owner; завершение ожидания и мутация всё ещё
требуют готового bound editor. 55 procedure tests прошли, включая проверку первого
неудовлетворённого sample, timeout, foreign dialog и wrong operator. Driver 8
перезапускает batch 30. Предыдущие отказы не удалены и не считаются успешными.

Typed full-output QA начат в том же live session: inactive saved Golden корректно
отклонил filter preflight. Existing import требует проверенную source identity,
поэтому в диагностическую копию доставлен новый экземпляр frozen fixture и Golden
повторно настраивается через public import handler перед новым TypedFull фильтром.
Финальный Hermes пока не запускался.

### Null и case policy

В typed QA `live-1789124649523` новый TypedFull дошёл до условий Amount not_null
и Text not_null. У Text not_null в реальном wizard отсутствует редактор регистра;
прежний контракт ошибочно требовал case_sensitive для любого string-предиката.
Контракт уточнён: explicit case_sensitive нужен только строковым предикатам со
значением, у is_null/not_null запрещён до UI. Native inactive case flag не участвует
в семантике Null; readback, независимый аудитор, matrix generator, goal contract и
инструкция Hermes согласованы. 23 focused filter tests прошли. Первый typed отказ
сохранён, успешной конфигурацией не считается.

Новый полный typed проход начат на чистой копии в `live-1789125326642`, source
`e4fcfa4f59e5106142cdc3cb5910bdfcc0919da36078ad1f5fc86ff6d997366e`: public verified
fixture delivery, существующий Golden import с явной полной конфигурацией,
затем новый TypedFull, замена отбора и parameters={} без переписывания.
Driver 8 продолжает datetime batch 30 на ранее frozen runtime; новые batches
получают текущий source. Перед Hermes обязательна финальная фиксация всех версий.

### Строковые значения, регистр и прокрутка операторов

Full typed initial в `live-1789125798606` прошёл независимые config/output audits:
8/2 строки, все пять столбцов, точные дроби/даты, Null, пустая строка и дубли.
Изменённый отбор пока не принят. При выборе Contains на пятой строке пункт оказался
частично обрезан dropdown; строгий action отказал до клика (UI_REFERENCE_OBSCURED).
Добавлена ограниченная прокрутка по наблюдаемому owner списка, через видимый option
той же строки, с проверкой изменения scroll.top и полной центральной hit point.

В string case-policy выявлены два пути: click по ячейке открывает и переключает
checkbox; Tab из поля значения только открывает его. Обработчик теперь повторно не
кликает уже открытый editor, при несовпадении флага нажимает Space на exact bound
ValueControl, проверяет DisplayEl и после Tab — native row. Live операторская
проверка `live-1789125326642/case-key-exact.json` дала true → false → true.
Case36 в `live-1789125720557` прошёл обработчик с case_sensitive=true, но выявил
ошибку математического oracle: codepoint-сравнение считало alpha > Beta. Закреплённый
E2E filterdataTr использует ru Collator/caseFirst=upper; независимый Node Intl
подтвердил порядок frozen ASCII значений: empty, A,b, Alpha, alpha, Beta, end,
preTAIL, preTail. Fixture-only oracle отделяет алфавитный порядок от literal equality;
non-ASCII ordering им намеренно не моделируется. Source handler по-прежнему использует
нативное сравнение Loginom. 3 oracle tests и 23 filter tests прошли.

Driver 11 (`.dock/row-filter/matrix-driver-11.log`) перезапущен с case36 после
обновления oracle и dropdown reveal. Cases0–35 полностью приняты; все ранние
отказы и ошибочные ожидания сохранены. Current typed session `live-1789125798606`
закрыла незавершённый changed wizard с подтверждением discard; сохраняется
`/user/dock-p3/packages/RowFilter-typed-initial-20260911.lgp` для следующего source QA.

### Переход после редактора и строковые сравнения

Cases36–41 в `live-1789126037309` завершены публично с правильными полными Id
разбиениями и replay без browser; batch independent audit выполняется driver 11.
Полный client suite после reveal: 1280 tests / 1279 passed / 1 skipped; Python:
472 passed. В `live-1789126127233` reopened initial без перенастройки вновь прошёл
8/2. Changed корректно прокрутил и выбрал Contains, но Next встретил активный
CaseSensitive editor с уже правильным false: первый click лишь завершил редактирование,
WIZARD_STEP_NOT_CONFIRMED корректно остановил операцию. Filter теперь делает Tab
и проверяет native row также когда flag уже совпадает. Продолжение typed QA идёт
на новой source-копии RowFilter-typed-finish-20260911.lgp. Failed changed не принят;
его draft явно закрыт с подтверждением discard, исходный saved initial сохранён.

### Полный typed отбор прошёл, проверка сравнения границ

`live-1789126379733`, runtime `5c945f3e…`: public existing initial после reopen
без переписывания 8/2, changed 5/5, preserved `{}` 5/5. Все три независимых
configuration/output audits прошли, включая полные пять столбцов. В этой сессии
запущен дополнительный новый TypedNew (создание + initial/changed/preserved), чтобы
подтвердить весь new-node путь после исправлений.

Case42 на том же runtime выполнился, но текущий fixture oracle завысил состав
строкового интервала [Alpha, preTail]: native исключил alpha и preTAIL. Это
соответствует lowercase-first на равных без регистра строках; E2E's explicit
uppercase-first относится к отображаемому списку значений, а не доказывает native
сравнение фильтра. До очередной правки ожидаемых результатов закреплены две новые
независимые проверки `< Alpha` и `> preTail` с case_sensitive=true, по гипотезе
lowercase-first и отдельному Intl comparator. Они выполняются в
`live-1789126596945`, `.dock/row-filter/collation-probes.json`. Пока их результат
не подтверждён, batch42 не считается принятым. Последующие изменения oracle должны
оставаться ограниченными frozen fixture; не заявлять общую Unicode/locale модель.

### Подтверждение collation и нового полного узла

Две заранее заданные native проверки в `live-1789126596945` прошли:
case-sensitive `< Alpha` дал Id [2,4,6,6], `> preTail` — [8],
с полными дополнительными выходами и replay без браузерных действий. Исправлен
fixture-only oracle: буквенный порядок, затем lowercase-first для case variants.
Это уточняет предыдущую запись: upper-first в E2E относится только к списку
редактора. Общая Unicode/locale модель не заявлена. Три теста oracle прошли;
90 ожидаемых случаев пересчитаны, driver12 продолжил с case42.

В `live-1789126379733` новый TypedNew прошёл initial 8/2, changed 5/5 и
preserved 5/5. Все шесть операций TypedFull/TypedNew прошли независимые
configuration/output audits, включая полные пять столбцов и дубли. Public
package.save_checkpoint сохранил `/user/dock-p3/packages/RowFilter-typed-finish-20260911.lgp`,
пакет закрыт. Проверка сохранности после нового открытия пока выполняется.
Самостоятельная Hermes-приёмка ещё не запускалась; готовность не объявлена.

### Полный roundtrip и финальные source checks

`live-1789127086536` открыл сохранённый RowFilter-typed-finish. Оба существующих
TypedFull/TypedNew выполнены с `parameters={}`, `inputs=[]`, `mappings=[]`:
5/5 полных строк, независимые raw configuration/output audits прошли.
Сохранены node GUID, условия, bindings и настройки выходов, execution identity новая.
Сравнение persistence нормализует локальную дату с отсутствующими нулевыми
миллисекундами и входной список по уникальным именам: native picker переставляет
его после загрузки. Порядок/индексы выходов остаются строгими. Новый независимый
`filter_persistence_semantics.py` проверен тремя тестами: допустимые представления,
семь запрещённых изменений, отказ при повторённом имени входа. Raw аудит каждой
операции по-прежнему сверяет полное наблюдение без этой нормализации.

Полный client suite на runtime `5c945f3e…`: 1280 total / 1279 pass / 1 skip / 0 fail.
Предыдущий полный Python suite: 472 pass; после persistence добавлены три теста,
полный прогон повторяется. 14 отрицательных проверок конфигурации/выходов вновь
отклонили все подмены. Driver12 принял cases42–47 вместе с независимым аудитом,
сохранил/закрыл batch и перешёл к48. Harness теперь штатно завершает stdin после
закрытия: отдельное принудительное завершение этого batch не понадобилось.

### Усиление проверки приоритета до её live запуска

Повторный просмотр ожидаемых случаев выявил недискриминирующий case86:
`Id=1 OR (Id>=6 AND Id<=7)` совпадал с ошибочной left-associative группировкой.
До запуска86 условие заменено на `Id=9 OR (Id>=6 AND Id<=7)`. Правильный выход
[6,6,7,9], ошибочный [6,6,7]; unit oracle проверяет это различие. Пересчитан
matrix.json; предыдущие cases0–85 не изменены. Source handler не менялся.
Hermes ещё не запускался; окончательная фиксация harness будет после этой проверки.

### Матрица завершена; переход к автономной приёмке

Driver12 завершил cases42–89 с независимыми аудитами и штатным закрытием каждого
пакета/процесса. Итоговый `complete-matrix-audit.json` заново проверил все90 случаев
на текущем независимом oracle, исходном CSV и raw configuration/output evidence:
90/90 PASS. Усиленный case86 дал [6,6,7,9]; cases87/88 — 10/0 и 0/10,
case89 отделил пустую строку от Null. Полный Python suite после последней правки
oracle: 475 PASS (`python-tests-final-oracle.log`). Source client неизменен после
полного 1279 PASS / 1 skip; runtime `5c945f3e189e6588acf036ca7139e35c62bf055b30b7ce78bd1fa7b2c548756d`.
Native skill SHA `714104445d37265943ab5e7d55a7c505c00fe38a62bc38a0c3c8ea24f7764b39`.

Отдельный preflight подтвердил ChatGPT subscription openai-codex / gpt-5.6-sol /
low. Старый output preflight не перезаписывался: первоначальный повтор остановился
с FileExistsError до запуска модели, новый отдельный файл успешно создан.
Финальный goal-only Hermes запускается после завершения Codex QA; результат
и subplan readiness ещё не объявлены. Во время приёмки runtime/harness/skill
не менять; полный frozen audit и отрицательные подмены обязательны.

### Первая Hermes-попытка и исправление независимого контракта

Run `20260911-152244-2a09363f`: все пять node.apply SUCCEEDED, import10,
filter8/2 →5/5, save/reopen, import10 и filter5/5 без перенастройки.
Исходный frozen audit: **48/49**, единственный отказ `declared_task.seed_columns`.
Модель законно передала дополнительный `source_name`, равный исходному имени
каждого столбца. Контракт импорта поддерживает это; raw configuration, значения,
сохранение, граф и новая execution identity прошли. Аудитор ошибочно сравнивал
словари только с вариантом без optional source_name. Оригинальный отказ сохранён,
весь прежний harness скопирован и проверен по request hashes в `frozen-harness/`.
Попытка не переименована в успешную frozen acceptance.

Codex вернулся в реальный UI: отдельная копия сохранённого результата
`RowFilter-acceptance-diagnosis-20260911.lgp`, сессия `live-1789130142546`.
На странице форматов подтверждены исходные пять имён/меток, типы и data kinds.
Предпросмотр мастера не использовался как полноточное доказательство значений;
их доказательство — обе реальные выходные таблицы в raw-аудите. Мастер закрыт
без применения, диагностическая копия закрыта, процесс завершён.

`filter_goal_contract.py` теперь допускает source_name только при точном равенстве
ожидаемому исходному имени. Все прочие свойства, состав и порядок остаются строгими.
Тесты отклоняют чужое/пустое/Null source_name и перестановку колонок. Полный Python:
475 PASS (`python-tests-final-source-name.log`). Diagnostic re-audit старого evidence:
47/47 содержательных checks; это не frozen acceptance. Десять отрицательных
подмен полного evidence отклонены, в том числе согласованное округление 8.76543,
утрата второго выхода, save, receipt, повторное execution declaration и смена модели.
Source runtime и native skill не менялись. Следующая автономная попытка получает
новый frozen harness. Все параметры модели остались Sol/low, без fallback.


### Завершение подплана06

Финальный Hermes `20260911-154023-843300b0`:49/49 frozen PASS;10/10 отрицательных
подмен отклонены. Пакет `/user/dock-p3/packages/Dock-acceptance-20260911-154023-843300b0.lgp`: ровно два узла/одна связь, пять столбцов обоих выходов,
8/2 →5/5 → save/reopen/reexecute5/5. Текущий runtime/harness повторно совпал
с pins после обновления документации и coverage; итоговый frozen аудит вновь PASS.
Все90 cases повторно проверены независимым аудитором. Матрица, границы,
Done/Close/Execute, uncertain/replay, сохранность и самостоятельный полный goal
закрывают требования06. Реестр FilterData повышен доlive_verified по этим доказательствам.

Обновлены основной план, реестр подпланов, handoff/resume, implementation-status
и итоговый отчёт. Клиент/сервер не переустанавливались, новый выпуск не публиковался.
Предыдущие неуспешные попытки и границы сохранены. Первоначальный запуск CLI без
обязательного --run был отклонён parser до модели; фактических Hermes-попыток две.


### Исправления после ревью приняты

[Четыре замечания](row-filter-review-live-2026-09-11.md) воспроизведены и исправлены.
Изменены только три runtime-модуля относительно предыдущей приёмки. Client
1287 PASS / 1 SKIP, Python 475 PASS. Проверены длинный фильтр и 1000 полей,
оба широких выхода (2000 значений), сохранение и reopen. Отдельный общий
UI_SCAN_LIMIT широкого публичного preflight явно сохранён как ограничение.
Hermes 181220 остановился из-за другого URL в пользовательском config;
Codex повторно проверил правильный стенд и использовал отдельный приватный config.
Hermes `20260911-181616-1338ee3f`: 49/49 frozen PASS, 10 подмен отклонены,
openai-codex / gpt-5.6-sol / low, runtime
`fd2999ce9f87a878882a20962eda56b69941d15dcedd8d7a70852579c5819e53`.
Основной config сохранён, временный удалён. Установка, публикация и commit не выполнялись.
