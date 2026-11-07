# Наблюдения native UI

LAB-989, mas2, 07.11.2026, Loginom 7.4.2; база — [README](README.md).
Исследован только собственный пакет и назначенная уточнённая пара. Факты ниже
получены штатными жестами по `data-tid`; чтение native объектов — read-only.
Сырой журнал `bindings-native/ui.jsonl` остаётся вне Git; номера ниже позволяют
сопоставить наблюдение с приватной диагностикой. Это native discovery, не
модельная приёмка и не подтверждение ещё не реализованного общего API.

## Пять полей разных семейств

TID — суффикс владельца `MF;TF-1;WizrdMCF;` наблюдённого документа. В другом
документе owner надо разрешать заново. Общий source содержит integer Amount=7,
Limit=5, K=2, Seed=42; boolean Flag=true; string Wrong="bad", CsvPath=A;
типизированные NULL Missing(integer), NullFlag(boolean), NullPath(string).

| Узел / поле | TID редактора (его дети SwitchButton, VariableControl) | Тип / привязка | Несовместимый тип и NULL |
|---|---|---|---|
| Фильтр строк, Amount > порог | `FilterDataWizard;FilterDataPanel;VariantPropEdit` | integer → Limit | Picker содержит только integer, строка/bool отсутствуют. Missing разрешён на Next; Execute с NULL дал пустой выход 0 (журнал 18–22) |
| Импорт текста, имя файла | `ImportTextFilePreviewWizard;edtFileName` | string → CsvPath | Picker содержит только строки; integer/bool отсутствуют. NullPath выбирается, Next отклонён: «Имя файла не может быть пустым» (`btnError`, data-qtip; 25–26) |
| Кластеризация, число кластеров | `ClusterizationWizard;pedClusters` | integer → K; autoClusters=false | Только integer. Missing допускается до Done/«Обучить», обучение с NULL не запускалось; восстановлен K=2 (42–43) |
| Группировка, сортировать результат | `GroupDataWizard;pedSortResult` | boolean → Flag | Только Flag и NullFlag. NullFlag допускается до Done, выполнение с NULL не проверялось (36–37) |
| Сортировка, локаль | `SortingWizard;SortingColumnCollection;chkLocaleAware` | boolean → Flag | Только Flag и NullFlag. NullFlag допускается до Done, выполнение с NULL не проверялось (39–40) |

Это пять полей из разрешённых назначением 5–6. Seed линейной регрессии остаётся
кандидатом из [LAB-828 evidence](../capabilities-evidence.md), а не шестым
подтверждённым полем этого запуска. Диапазон K и false для двух boolean-полей
здесь не проверены; их будущая узловая регистрация требует адресной проверки.

Общий жест: подключить variables/control input → открыть нужную страницу →
SwitchButton → VariableControl/picker → точная переменная → commit → Next/Done.
Для Фильтра сначала открывается inline-редактор конкретной строки условия;
для K нужна ручная настройка числа кластеров. Это узловые условия адресации,
а не принципиально иной механизм. При включении SwitchButton native может
автоматически выбрать первую подходящую переменную (например Amount вместо K).
Обязателен явный выбор и readback точного mapped имени, не только pressed=true.

Filter/Grouping/Sorting/Clustering используют раскрытый control input subtype 4.
Файловый Import Text — variables input subtype 3 (`Input_Var-1` в этом DOM),
роль которого объявлена файловым обработчиком. Ordinal W1 не следует получать
из текстового суффикса TID. Каждый вход связан с собственным source output 4.

Неподходящие типы исключены native picker; принудительная подстановка ID через
JS не делалась. NULL не равен неподходящему типу: native реакции различны.
Предлагаемый строгий отказ NULL в первом API-срезе — осознанная политика
[контракта](contract-proposal.md), а не утверждение универсального native отказа.

## Done, изменение только source и Save

Фильтр после Done и независимого reopen показывал `Limit (5)` (22).
При Amount=7 выход 0 содержал одну строку. Затем в прежнем source изменены
только Limit 5→9 и CsvPath A→B. Все десять names/types/IDs сохранены
(58–60); настройки проверяемых Фильтра и Импорта между выполнениями не открывались.
Тот же Фильтр дал выход 0 пустой, выход 1 — одну строку Amount=7/Limit=9
(57,61–62). Тот же Import Text прочитал три строки A: Amount=10,0,NULL;
после source-only update — B: 20,-4,7 (32,63). Загружены собственные CSV из
`fixtures/import-a.csv` и `import-b.csv` под исследовательскими именами.

В пакет сохранены пять variable-mode настроек, три Variant-сценария, 11 узлов
и 14 связей (64). Пакет закрыт штатным меню, выполнен logout, старый browser
context закрыт (65). В новом context выполнены новый вход и OpenPackage;
восстановлены те же GUID 11 узлов (66). До выполнения проверяемых узлов
независимо открыты сохранённые настройки, без переноса старых component handles:

| Cold readback | Variable mode / ровно один selected record | Журнал |
|---|---|---|
| Фильтр | true / Limit (9) | 67–68 |
| Импорт текста | true / CsvPath (собственный B) | 69 |
| Группировка | true / Flag (true) | 70 |
| Сортировка | true / Flag (true) | 71 |
| Число кластеров | true / K (2) | 72 |

После чтения каждый мастер закрыт Cancel с подтверждением; настройки не
переписывались. Native активация источника/входа допустима и не заменяет
readback. Новое Execute Фильтра: выход 0 — 0 строк, выход 1 — одна строка
Amount=7/Limit=9 (73,76); Import B — 3 строки с Amount=20,-4,7 (75).
Ранняя пустая модель preview выхода 1 (74) не использована как результат:
окончательное чтение дождалось полной схемы и строки (76).
После cold собственный пакет закрыт штатным меню без запроса сохранения,
logout выполнен, видимых model graphs нет (77); context и браузер закрыты.

Нельзя читать первый найденный DOM-элемент: скрытый старый master может иметь
тот же data-tid. Использованы visible owner и его Ext component. Также VariableControl
создаётся до загрузки store: pressed=false и options=[""] в промежуточном UI
не доказывают потерю binding (такое раннее чтение было в 38). Нужны quiet owner,
полный непустой store, ровно один выбранный ConnectedRecord и точный variable ID.
Скрытый literal ValueControl — не доказательство выбранной переменной.

## Variant на табличном входе

Native source: собственные десять переменных → VarToData rows. Полная input
схема: Name:string, DisplayName:string, Value:variant (native DataType=6).
Значения: integer 7,5,2,42; boolean true; string bad и собственный path A;
три NULL с исходными scalar types integer/boolean/string. Для этих трёх NULL
VarToData выдаёт Variant-NULL; сохранение исходного scalar типа NULL не обещается.
Отдельный [variant-input.json](fixtures/variant-input.json) — более строгий
предлагаемый будущий fixture, **не** точная запись этого native источника.

| Узел | Действие и результат | Что это доказывает / граница |
|---|---|---|
| Калькулятор | Production context reader видит Value:variant. Добавлено независимое real-выражение `0`; Next/Done принято. Execute: 10 строк, три входных поля сохранены, Value header `bg-TBGDataType-dtVariant-before` (48–50) | Variant можно пропускать, новое выражение имеет свой scalar type. Операции над самим Value, subtype и temporal precision не проверены |
| Группировка | Value:variant выбран ключом; Name — мера Count. Next/Done принято. Execute: 8 групп, NULL-группа count=3, остальные count=1; Value header dtVariant, count dtInteger (51–53) | Ключ Variant принят без принудительного scalar cast в этом случае. Sum/min/max над Variant и эквивалентность 7 и "7" не проверены |
| Сортировка | Value ASC, затем Name ASC; native locale=true. Execute: все 10 строк, Value header dtVariant (55–56) | Наблюдён порядок NULL×3, true, 2,5,7,42, path A, bad; это один fixture, не универсальный порядок subtype/locale |

Отказа мастера или вынужденного scalar cast в этих трёх сценариях не было.
Значения наблюдены в native preview; текст и CSS типа колонки не доказывают
exact cell subtype, integer precision или civil time. Принятие входной Variant
колонки отдельно от функций/агрегатов над нею. Обещать все операции нельзя.

W2: [VarToData discovery](../../nodes/variables-vartodata/discovery.md),
[контракт](../../nodes/variables-vartodata/contract.md),
[план этапа 2](../../nodes/variables-vartodata/plan.md#этап-2--отдельное-назначение-r02-r03).
На базе `node-procedure.mjs:263` включает typedVariants только для
`variables.to_table` и `imports.lgd`. `node-port-output.mjs:328–342` уже имеет
native typed reader с civil time. Opt-in трёх новых типов требует адресной W2
проверки owner/completeness/cleanup, а не нового универсального evaluator.

Читателю нужны отдельные column type=variant и cell subtype, exact integer,
boolean/string/real, NULL без подмены, temporal civil time/точность до ms;
0, false, пустая строка и NULL различимы. Полная схема, count, новые execution/read
IDs обязательны. Наблюдённый preview не является exact typed-output PASS.

## Существующий код и границы общего среза

[LAB-828](../capabilities.md), [W1](../discovery.md) и
[Калькулятор](../../nodes/calculator/discovery-variables.md) использованы как
исходные материалы. `filter-procedure.mjs:205–225` и `crosstable-variables.mjs:222–257`
уже содержат частные жесты. Filter variable operand, CrossTable local bindings
и LGD bindings сохраняют свои API. Общий envelope нельзя объявлять уже доступным.
`grouping-context.mjs:46–50` и `sorting-context.mjs:42–48` читают hidden literal
отдельно от pressed: им нужен явный variable-mode inventory.
Пути client/lib в этом документе относительны `packages/loginom-runtime`.
