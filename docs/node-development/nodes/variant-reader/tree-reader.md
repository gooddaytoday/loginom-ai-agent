# Typed tree reader: даты, Variant, массивы скаляров — этап 0

Назначение LAB-1558. База `origin/v040@864fad6efe`, 13.11.2026, только
документы. Runtime, оснастка и навык не менялись, native-пробы не было —
её делает разработчик первым шагом цикла. Результат этого шага для LAB-1601
приведён ниже; описание отказов далее относится к исходной базе. Основание: решение владельца
`v040-open-scope` и строка «Деревья» решения `v040-scope-expansion`
(«даты, Variant, scalar arrays в typed tree reader — после W1»). W1 влит
(#1032). Комплект на один узел —
[trees-jsontotree/acceptance/typed](../trees-jsontotree/acceptance/typed/README.md).
Пути client даны относительно `packages/loginom-runtime/client/`.

## Как дерево читается сейчас

`lib/node-port-output.mjs:187` `readTreePortSource` обходит схему
`source.get_RootNodeDef()` источника с `$I` 141. Затем он берёт
`source.GetReader(definitions)` и читает каждый лист через
`reader.AsVariant(index,row)`. Значение декодирует `decodePortCell`
(`:265`). Пределы: 256 узлов, глубина 16, 1 MiB, ровно один документ.
Табличный точный Variant reader (`lib/variant-native-read.mjs`) сюда не
подключён: он закреплён за interface 116 / method 321 и 427 / 1141, а у
источника дерева другой интерфейс и другой reader.

## Где отказ сегодня

| Возможность | Отказ | Где |
|---|---|---|
| Даты в JSON | preflight `Tree stage 1 does not support inferred dates` | `lib/tree-parameters.mjs:57` |
| Даты в выходе | `validateJsonTreeSchema`: только integer/real/string/boolean | `lib/tree-parameters.mjs:94`, вызов `lib/tree-node.mjs:138` |
| Даты при чтении | **отказа нет**: `decodePortCell` читает DateTime точно; `tree_unverified_precision` только для DST-неоднозначности и лет 0–99 | `lib/node-port-output.mjs:280-308`, `:249` |
| Variant в схеме | `tree_scalar_type` | `lib/node-port-output.mjs:209` |
| Variant при чтении | `decodePortCell(...,'variant')` даёт только display → `tree_unverified_precision` | `:311-313`, `:249` |
| Variant в JSON | preflight `Mixed Variant fields are outside tree stage 1` | `lib/tree-parameters.mjs:69` |
| Массив скаляров в схеме | `tree_schema_metadata` (`!array||container`) | `lib/node-port-output.mjs:207` |
| Массив скаляров в JSON | `requires one nonempty repeated object branch` | `lib/tree-parameters.mjs:60`, `:93` |
| Проверка run-check | `check_tree` требует ветку `/items`; нет сравнения Variant/DateTime, тип массива всегда `object_array` | `scripts/node-acceptance/run-check.py:1685-1731` |

`validateSelectedTreePaths` (`lib/tree-parameters.mjs:101`, Дерево в
таблицу) имеет тот же список типов. Его расширение — отдельный цикл узла
`trees.to_table`, в этот план не входит.

## Что меняется в общем коде

Три независимых шага. Каждый — отдельный PR с red→green на native-примере
из пробы. Пределы 256/16/1 MiB и проверки владения, свежести и cleanup не
меняются. Новых модулей и параметров нет.

**R1. Даты — общий reader не меняется.** Узловая правка:
`tree-parameters.mjs:57` и `:94` пропускают DateTime. Это возможно только
если проба подтвердит, что автоструктура с форматом `pedDateTimeFormat`
выдаёт лист DataType 2. В `check_tree` добавляется ветка datetime:
`precision == 'millisecond'`, `representation == 'local_datetime'`, value —
civil `YYYY-MM-DDTHH:MM:SS.mmm`. Это аддитивная строка оснастки.

**R2. Массивы скаляров — малая правка общего reader.**
Реализация LAB-1647: reader допускает Array=true/Container=false для DataType
1–5; JSON preflight/output принимают однородные scalar arrays с типизированным
свидетелем по тому же пути. Соседние массивы скаляров разрешены; ограничения
ветви массивов объектов, Variant и `trees.to_table` сохраняются. Сценарий
`tree-scalar-arrays` использует отдельный `typed/expected-scalar-arrays.json`.
- `node-port-output.mjs:207`: допустить `array && !container` для скалярного
  листа с DataType 1–5.
- `instance()` (`:230-250`) уже обходит `is_array` через `GetRowRange` и
  читает элементы как листья. Нужен адресный тест на пустой массив
  (size 0) и на элементы разных записей.
- Узловая правка — `tree-parameters.mjs:60/:93`.
- В `check_tree` тип схемы `<scalar>_array`.

**R3. Variant — общий reader, основной объём.**
- `:209` пропускает DataType 6.
- Лист Variant читается с подтипом. Способ выбирает проба (вопросы 3–4 ниже):
  - (а) если `reader.AsVariant` отдаёт различимые JS-типы (Int64 для целых,
    number для вещественных, Date, boolean, string, null), подтип
    выводится из них. Тогда это правка `decodePortCell` под отдельным
    флагом дерева, без нового RPC;
  - (б) иначе нужен кадр с тегом. Это аддитивная возможность
    `variant-native-read.mjs`: третья закреплённая пара interface/method
    для reader дерева, тот же `decodeVariantFrame` и `adaptCell`, теги
    1/5/7/8/11/20, остальные — отказ.
- Узловая правка — `tree-parameters.mjs:69`.
- В `check_tree` лист `type: "variant"` сравнивается по `cell_type` и
  `value`, как табличный Variant в `expected-outputs.mjs:82`.

Ветка (б) — изменение общего канала чтения того же класса, что W1
(#1032). Если проба приведёт к (б), разработчик фиксирует номер
метода/интерфейса и pins в `discovery` и делает один PR на R3, без
рефакторинга. Подмена или перехват JS Loginom не нужны ни в одной ветке.

### Реализация R3 / LAB-1668

`tree-variant` использует ветку (б): reader166, internal interface2178,
GetAsVariant7230, существующие decodeVariantFrame/adaptCell. `DataType 6`
допущен общим reader; JSON preflight/output допускают смешанные скалярные
листья. `cell_type`, native-тег и точное `value` сохраняются в tree instances;
`check_tree` сравнивает их и отдельно проверяет native NULL. Табличный канал
116/321 и переменные 427/1141 сохраняют прежние привязки и правила тегов.
Пины функций, формат запроса и правила отказа —
[discovery](../trees-jsontotree/discovery.md#r3--lab-1668-variant-reader-ветка-б).
Сценарий и отдельная oracle-проекция — в typed-комплекте; смешанные массивы
скаляров и преобразование Variant в таблицу остаются вне этого цикла.

## Кто выигрывает

Все узлы с выходом-деревом читаются через `readTreePortSource`:
`trees.from_json`, `trees.from_table`. У каждого после R1–R3 остаётся
своя узловая правка валидатора и свой комплект: `trees-datatotree/modes.md`,
`trees-jsontotree/acceptance/modes/task-dates.md` (LAB-1042),
`acceptance/task-mixed-leaves.md` (LAB-1136). `trees.to_table` и
`trees.to_json` читают таблицу или файл — им нужна правка входной
стороны, а не reader.

## Оценка

| Шаг | Циклов | Комплект |
|---|---:|---|
| R1 + `trees.from_json` даты | 1 | `typed/task-dates.md` |
| R2 + `trees.from_json` массивы скаляров | 1 | `typed/task-scalar-arrays.md` |
| R3 общий Variant (red→green на native-примере) | 1 | адресные тесты reader |
| `trees.from_json` Variant | 1 | `typed/task-variant.md` |
| резерв: ветка (б) или DST-неоднозначность стенда | +1 | — |

Итого для `trees.from_json` — **4 цикла (+1 резерв)**. Для каждого
следующего узла дерева — +1 цикл на валидатор и регистрацию. Ориентир:
40–120 строк production, большая часть — в R3; адресные тесты
`tree-*.test.mjs`, `node-port-output` и `run-check` tests.

## Native-проба LAB-1601, 13.11.2026

Loginom 7.4.2, `app.loginom.ai`, собственная пара mas3. Исходные три
JSON-столбца `fixtures/typed/documents.csv` импортированы как строки;
дополнительно исследована отдельная строка только с датой. Настройки прочитаны
по `MF;TF-1;WizrdMCF;JSONToTreeWizard;pedDateTimeFormat;ValueControl`
(`YYYY-MM-DDThh:mm:ss`), `pedBuildTreeAuto;ValueControl;DisplayEl` и
`pedStrictMode;ValueControl;DisplayEl`. Native-объекты привязаны к своему
GUID узла и его активному tree output 0; все полученные proxy освобождены.
Проба сохранила пакет, закрыла его и вышла из аккаунта.

1. **Даты.** Автоструктура даёт `/items/when` DataType **2**, id — 4.
   Strict on и off дают одну схему и значения. Отдельный JSON
   `{"items":[{"id":1,"when":"2026-01-15"}]}` тоже даёт DataType 2
   и полночь; отдельный формат даты не задавался.
2. **AsVariant даты.** Возвращается JS Date. Civil-поля равны
   `2026-01-15T12:00:00.000` и `2026-07-01T12:30:15.000`; NULL — null.
   Browser zone `America/New_York`, offsets 300/240 минут; соответствующие
   UTC ISO — `17:00:00Z`/`16:30:15Z`. Сдвига civil-времени нет, UTC-строка
   не является значением дерева. Существующий DateTime decoder подходит R1.
3. **Variant.** `/items/value` DataType **6**; AsVariant возвращает для
   7/семь/false/NULL/2.5/9007199254740993 соответственно
   `number/string/boolean/null/number/Int64`. Последний `toString()` точен.
   Малое целое и real имеют одинаковый JS-тип, поэтому ветка R3(а) недостаточна.
4. **Reader и RPC.** `source.GetReader(definitions)` возвращает interface
   **166**, с `$FHelper` кеширующего reader. Сам `AsVariant` — вызов helper,
   а не прямой getter с табличным method 321. Наблюдённый `$GetAsType` для
   обычного листа использует пакетный GetValues; для scalar array — GetAsVariant.
   Загруженный `bg/js/bg.customconnectors.rpc.js` регистрирует internal interface
   **2178**: GetMetadata **7228**, GetValues **7229**, GetAsVariant **7230**.
   Для 7230: request static size 32, int32 NodeInfoID offset 0 и IntPtr Row
   offset 4; response static size 12, затем ReadVariant. R3 требует отдельной
   привязки этого канала и проверки типов, а не подстановки interface 116.
   Прямая read-only проба 7230 дала теги int16 LE **20/8/11/1/5/20**
   для шести значений Variant; существующий `decodeVariantFrame` читает их
   без изменения формата. Отличается привязка getter, не формат Variant.
5. **Scalar arrays.** `/items/tags`: Array=true, Container=false, DataType=5;
   `/items/scores`: true/false/3. GetRowRange для родителей 0/1/2 даёт
   start/size `0/2`, `2/0`, `2/1` для обоих массивов. Пустая вторая запись
   сохраняет определения схемы и не создаёт экземпляров.

Исходные случаи oracle не расходятся с наблюдениями. R1 разрешает DateTime
только в `trees.from_json`: снят preflight-отказ, расширен output validator,
зарегистрирован `tree-dates` с отдельным `expected-dates.json`; общий reader
и валидаторы `trees.to_table`/`trees.to_json` не меняются. Вопросы 6–7 ниже
не входят в эту пробу и остаются not_checked.

## Вопросы native-пробы

1. Автоструктура с `pedDateTimeFormat = YYYY-MM-DDThh:mm:ss`: становится ли
   `"2026-01-15T12:00:00"` листом DataType 2? Что со строгим режимом и со
   строкой только с датой (`"2026-01-15"`): строка, дата или Variant?
2. `reader.AsVariant` для такого листа отдаёт Date, civil-время которого
   равно тексту JSON без сдвига пояса стенда?
3. Лист Variant со значениями 7, "семь", false, null, 2.5,
   9007199254740993: какие JS-типы отдаёт `reader.AsVariant`? Различимы ли
   integer и real? Точно ли большое целое?
4. Если в п. 3 нет: interface id объекта `source.GetReader(...)` и method id
   его `AsVariant`. Совпадает ли формат кадра с табличным (тег int16 LE)?
5. Массивы `tags` (строки) и `scores` (вещественные): флаги схемы
   Array=true, Container=false, DataType 5/3? Пустой массив второй записи —
   `GetRowRange` size 0?
6. Массив `[1, 2.5]`: real или Variant? Дата внутри Variant-листа — подтип
   datetime или string?
7. Иконка `bg-TBGDataType-dtVariant` и `EditDataTreeNodeDefForm;cbxDataType`
   для листа value совпадают с LAB-1136 (`trees-jsontotree/nested-records.md`)?
