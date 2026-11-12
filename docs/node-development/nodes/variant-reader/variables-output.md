# Выход переменных Variant (W1) для «Таблицы в переменные» — этап 0

Частичные native-пробы LAB-1445 и нерешённая граница канала:
[variables-output-probes.md](variables-output-probes.md).

Назначение LAB-1191. База `origin/v040@0263a21987`; опора — план общего
reader (#906, `variant-reader-plan@d72c70e829`, `variant-reader/plan.md`)
и цикл 1 табличного reader (#922, `variant-native-tags@e2e32e63bb`).
Это предложение владельцу по коду, без живых прогонов: runtime, оснастка,
каталог типов и навык не менялись. Строки кода указаны по `origin/v040`,
пути client — относительно `packages/loginom-runtime/client/`.

## Как сейчас читается выход переменных

Путь исполняемого variable-источника (W1, `kind:variables`):

1. `lib/node-port-output.mjs:10` `makeNodeVariableOutputCode` допускает чтение
   только после подтверждённого собственного Execute.
2. `lib/node-port-output.mjs:20` `readNodeVariableOutput`: проверяет документ,
   граф, узел, порт (`FType 1`, `FSubType 3`, строка 34), дерево выполнения
   и свежесть процесса; правым кликом по порту открывает
   `mn;mniShowDataPreview`, затем ждёт
   `<prefix>;ModelForm;PreviewWindow;PreviewForm;VariablesForm;grdValuePreview`
   со store `complete`, `loadCount≥1` (строки 63–75). Grid store обязан быть
   `form.FVariablesStore` того же `VariablesForm` и того же узла.
3. `lib/node-output-context.mjs:6` `readVariableRecords(store,'preview',decode)`:
   ≤128 записей, полный загруженный Ext store; на запись — `Index`, `ID`,
   `Name`, `DisplayName`, `DataType` и **`ValueVariant`**. Value/$self proxy
   и RPC намеренно не вызываются (строка 5). `undefined` — «значение не
   загружено», не NULL (строка 19). Тип — только из карты DataType 1–5
   (строка 13).
4. Значение декодирует `lib/node-port-output.mjs:166` `decodePortCell`;
   reader требует `limitations.length===0` (`node-output-context.mjs:21`).
5. Ответ модели — `nodeVariableOutputSchema` (`lib/node-result-schema.mjs:45`):
   `type ∈ integer|real|boolean|string|datetime`; описание `read.variable_ports`
   — `lib/node-api.mjs:211`.
6. Cold: `scripts/node-acceptance/cold-check.mjs:232` читает тот же путь
   (`readVariablePort`) и сверяет `matchVariableInventoryOutput`;
   ожидания разбирает `parseExpectedVariableInventory`
   (`scripts/node-acceptance/expected-outputs.mjs:387`) — тоже без `variant`.

Пользовательские переменные (`variables.user`, режим `values`) читают
`DisplayValue`/`ValueIsNull` из `VariablesEditValuesWizard`; для выхода
DataToVar этот путь не применяется (`OriginType 1` только у своих переменных).

## Почему нельзя просто добавить DataType 6

Наблюдено в LAB-1051 (`variables-datatovar/discovery-aggregate-types.md:50,71–84`):
у V-агрегатов min/max/mode/first/last/only **native DataType 6**, а запись
store содержит только Index, Name, DisplayName, DataType, ValueVariant.

Даже если добавить `6:'variant'` в карту:

- `decodePortCell(raw,'variant')` для любого непустого значения возвращает
  `formatted_display` + `variant_display_precision` (строки 204, 208–210) —
  reader откажет `scalar precision`;
- схема ответа и matcher cold не знают `variant` — cold W1 упадёт даже при
  проходящем reader;
- главное — `ValueVariant` уже JS-значение. Number `2` не различает integer
  (tag 20/3) и real (tag 5/4); `null` не различает NULL (tag 1) и Empty
  (tag 0). Boolean, string и Date различимы по `typeof`/классу, но date
  остаётся с ограничениями civil time из #906.

Выдать `{type:'variant', value:2}` — значит опубликовать неподтверждённый
подтип; ослабить `limitations===0` — значит снять гарантию точности для
всех переменных. Оба варианта противоречат #906.

## Чем доступ к переменным отличается от табличного interface116

| | Таблица (#922) | Выход переменных |
|---|---|---|
| Источник | `port.data.get_Output()` → `QueryInterface(IBGDataSource)` (`node-port-output.mjs:304–305`), `$I 116` | port `FSubType 3`; в коде такой цепочки нет |
| Ячейка | method 321 (row, column) → native frame с tag | только `ValueVariant` из Ext store VariablesForm |
| Guards | pinned реализации, сессия, владелец, release, ≤512 KiB | owner узла/порта/процесса, полный store, без RPC |
| Подтип | tag frame (1,3,4,5,7,8,11,20) | теряется при распаковке в JS до store |

Значит, `variant-native-read.mjs` к переменным напрямую не применим. Нужен
канал, дающий подтип **каждой** переменной этого же выполнения. Кандидаты
(в порядке инвазивности) проверяет список проб ниже. Новый pinned RPC к
интерфейсу переменных — изменение публичной границы чтения и требует
решения владельца (как interface116 в #906).

Зависимость обработчика: в #890 (`datatovar-aggregates-scalars`)
`variables-datatovar-parameters.mjs` явно не допускает поле Variant
(«Variant is not admitted»), `DATA_TO_VAR_TYPE_FUNCTIONS` — только
integer/real/string/boolean/datetime.

## Native-пробы для разработчика

Только `https://app.loginom.ai/app/?testable=true`, свой аккаунт пары,
своя копия `variables-datatovar/fixtures/aggregate-source.lgp`
(N,K,S,B,D,V; V = `2`, `"x"`, `false`, NULL, `2`). Это discovery вне
пользовательского графа: вспомогательные узлы проб в сценарий и приёмку
не входят. Сырые журналы — вне Git, в отчёт — журнал:строка.

Общие data-tid (LAB-1051): палитра
`MF;TF-1;ModelForm;colVendors_Компоненты>Переменные>Таблица_в_переменные;TreeText`;
мастер `MF;TF-1;WizrdMCF;DataToVariablesWizard`, перенос
`colDisplayName_V` → `frmMoveButtons;btnMove0`, функции —
`FactorEditDialog;…;grpFactors;chb[-N]` (1 count, 6 mode, 8 unique, 9 null,
10 first, 11 last, 12 only; min/max — 2/3), `btnApply`, `WizrdMCF;btnNext`,
`btnExecute`; выход `Таблица_в_переменные;Output_Var-0`; preview — путь из
раздела выше.

| # | Действие | Ожидаемое наблюдение | Критерий решения |
|---|---|---|---|
| P1 | После Execute DataToVar по V с 9 функциями открыть preview `Output_Var-0`; в `grdValuePreview.getStore()` для каждой записи снять `Object.keys(record.data)`, `DataType`, `typeof ValueVariant`, `ValueVariant?.constructor?.name`, `ValueVariant===null`, `===undefined`; `getModel().getFields()` — имена. Без вызова методов proxy. | 9 записей; count/uniq/null — DataType 4; min/max/mode/first/last/only — 6. Поля как в LAB-1051. | Если integer- и real-значения Variant приходят разными классами (например `Int64` vs `number`) — пассивный канал для чисел есть, иначе нет. `null` у V_Only ≠ доказательство NULL |
| P2 | Точный подтип **входа**: прочитать выход JavaScript-источника `Output_Data-0` поле V табличным точным reader (#922, `typedVariants`). Сначала проверить, допущен ли этот тип узла; если нет — тот же опыт на входе = выход Свёртки из #906 (`fixtures/mixed.csv`, tags известны). | Для V: tag значения `2` (20, 3, 4 или 5), tag 11, 8, 1. | Даёт oracle подтипа для mode/first/last. Без P2 ожидание «2 — integer» — догадка; JS-число может стать real |
| P3 | Диагностический мост в **отдельной** копии пакета: `Output_Var-0` → «Переменные в таблицу», Execute, выход прочитать с `typedVariants` (cold уже так читает `variables.to_table`, `cold-check.mjs:422`). | По tag на каждую из 6 Variant-переменных; у V_Only tag 1 или 0. | Совпадение с P2 подтверждает, что подтип переживает порт переменных. Мост — только проверка, не путь продукта: добавлять его в граф пользователя нельзя (#906) |
| P4 | Пустой вход (фильтр источника до 0 строк, как в `variables-datatovar/acceptance/task-empty.md`, поле V) и вход, где V целиком NULL: first/last/only/min/max. P1 + P3. | ValueVariant `null`/`undefined`/иное; tag 1 или 0. | tag 0 встречен — Empty воспроизводим, нужен отдельный `cell_type`; не встречен — Empty вне объёма, остаётся отказ |
| P5 | Save → Close/logout → новое открытие → Execute без перенастройки; повторить P1 и P3. | Те же DataType/классы/tags. | Подтип стабилен после сохранения — условие cold |
| P6 | Только пассивно: у `port.data` порта переменных снять `$I`, `$OW`, `$O`; перечислить `Object.keys(bg).filter(k=>/Variab/.test(k))`. Ни `get_Output`, ни QueryInterface не вызывать. | Номер интерфейса порта и имена интерфейсов переменных. | Если P1 не дал канала, а P3 дал — это кандидат пути с pinned методом; вызов только после решения владельца |
| P7 | В `VariablesForm` снять заголовки колонок grid и отображение типа V-переменных (DOM, data-tid). | Колонка/иконка типа показывает «Variant» без подтипа. | Подтверждает, что UI не даёт подтипа; пробелы `data-tid` — в отчёт |

Наблюдения P1–P7 записываются в `variant-reader/` отдельным docs-PR до
начала цикла 2.

## Разбиение на циклы

| Цикл | Содержание | Сценарий | Прогоны |
|---|---|---|---|
| 1 | DataToVar допускает поле Variant только с count/unique_count/null_count (выход integer); остальные функции для Variant — точный отказ preflight с перечнем допустимых. Поверх #890. Reader W1 не меняется | `datatovar-variant-counts` | ×1 |
| 2, главный | Адаптер W1 Variant по каналу из P1/P3/P6: DataType 6, подтип каждой переменной, cell union #906 (`cell_type`, native), схема ответа и `node-api` описание, matcher/cold; DataToVar допускает min/max/mode/first/last/only для Variant | `variables-datatovar/acceptance/task-variant.md` | ≥2/3 + независимые 2/3 |
| 3, условный | Empty/all-NULL по итогам P4 | `datatovar-variant-empty` | ×1 |

Вход в цикл 2: P1–P5 выполнены и решён канал подтипа. Если подтип даёт
только P6 (новый вызов) — нужно решение владельца; без него цикл 2 не
начинается, действует исход Б ниже.

Затронутые пути цикла 2: `lib/node-output-context.mjs`, variable-ветка
`lib/node-port-output.mjs`, `lib/node-result-schema.mjs`, `lib/node-api.mjs`,
`variables-datatovar-parameters.mjs`/`-preflight.mjs`/`-readback.mjs`,
`scripts/node-acceptance/expected-outputs.mjs`, `cold-check.mjs`, адресные
тесты. Ориентир 2–3 цикла правки вместе с циклом 1.

Текст задания цикла 1 (для модели, без подсказки исхода):

> Открой подготовленную для задания копию пакета {{PACKAGE_PATH}}.
> Сохрани исходный JavaScript-источник и его данные. Добавь «Таблица в
> переменные» для поля V: количество строк, число различных непустых
> значений и число пропусков. Выполни узел и покажи полный выход переменных
> с именами, метками, типами и значениями. Сохрани пакет по новому пути и
> сообщи его.

Ожидание цикла 1 — подмножество `aggregate-types/expected.json#variant`:
V_Count 5, V_Uniq 3, V_Null 1, integer.

## Проект критериев на утверждение

Цикл 1:

1. Выход 0: ровно 3 переменные в native-порядке, имена/типы/значения как
   выше; метки — `label_any`, если задача их не задаёт.
2. Запрос модели min/max/mode/first/last/only для Variant — отказ preflight
   до первого жеста мастера, без частично настроенного узла.
3. Save по новому пути, cold Execute без перенастройки, Close/logout; ×1 PASS.
4. Регрессии: адресные тесты DataToVar (#890), W1 scalar-переменных
   (Калькулятор переменных, Замена, пользовательские, Column Union).

Цикл 2, исход А (канал подтипа подтверждён P1/P3/P6 и одобрен):

1. 9 переменных `task-variant.md` в порядке; count/uniq/null — integer
   5/3/1; min/max/mode/first/last/only — `type:variant`, значения из
   `aggregate-types/expected.json#variant` (false, `x`, 2, 2, 2, NULL).
2. `cell_type` каждой Variant-переменной сверяется с P2/P3, а не с
   expected (там `native_subtypes_verified:false`): boolean, string,
   подтип числа по tag входа, NULL с `is_null:true`. Без
   `formatted_display`/`unverified`.
3. Save → Close/logout → новое открытие и Execute без перенастройки: те же
   типы, подтипы и значения, новый execution binding.
4. ≥2/3 PASS на одном SHA + независимые 2/3 своей парой; cleanup без discard.
5. Регрессии: все текущие W1 consumers и cold; табличный exact reader
   (#922); бюджеты ≤128 переменных и 1 MiB.

Цикл 2, исход Б (канала нет или не одобрен): Variant-переменные дают точный
отказ чтения с указанием имён переменных и причины; ни одна не публикуется
с выдуманным подтипом; integer-переменные того же выхода не выдаются
частичным успехом. `task-variant.md` в этом случае не приёмочный сценарий.

## Риски и возможные ограничения платформы

- Подтип теряется при распаковке Variant в JS до Ext store (наиболее
  вероятный исход P1). Тогда пассивного канала нет.
- Интерфейс порта переменных может не иметь метода с native frame; если
  сервер отдаёт только распакованное значение — это **ограничение
  платформы**: точный подтип выхода переменных недоступен, остаётся исход Б.
- Мост «Переменные в таблицу» может сам приводить подтип (например, к real);
  тогда P3 не доказательство, нужно сравнение с P2.
- JavaScript-источник может записывать JS-число в Variant как real; тогда
  ожидание mode/first/last = real, а не integer. Oracle — только P2.
- Empty (tag 0) может быть невоспроизводим штатными узлами — тогда он вне
  объёма, а NULL и Empty не различаются по ValueVariant.
- Канал через класс значения (`Int64`/`number`) зависит от внутренней
  распаковки Loginom; требует pin реализации, как в #922, и ломается при
  обновлении 7.4.x.
- Datetime-Variant наследует ограничения civil time/ms из #906.
- Расширение matcher переменных полем `cell_type` — изменение штатной
  проверки; без решения владельца не вводится.
