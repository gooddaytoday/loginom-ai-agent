# Typed tree reader: даты, Variant, массивы скаляров — этап 0

Назначение LAB-1558. База `origin/v040@864fad6efe`, 13.11.2026, только
документы. Runtime, оснастка и навык не менялись, native-пробы не было —
её делает разработчик первым шагом цикла. Основание: решение владельца
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
