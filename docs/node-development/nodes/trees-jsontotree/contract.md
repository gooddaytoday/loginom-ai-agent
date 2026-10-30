# Предложение контракта пары для v0.3.9

Статус: предложение LAB-536 для утверждения владельцем. В v0.3.8 нет
этапа реализации этой пары. Этот документ не разрешает общие правки.

## Ограниченный первый этап

| Runtime type / mode | Компонент | Основные порты |
|---|---|---|
| `trees.from_json` / `auto_structure` | `component.trees.JSONToTree` | table input 0 → tree output 0 |
| `trees.to_table` / `selected_nodes` | `component.trees.TreeToData` | tree input 0 → table output 0 |

Один JSON object в одной строке входа, автоструктура и auto root. Одна
повторяющаяся ветвь объектов, scalar ancestors, отсутствие коллизий leaf names.
До 64 выбранных полей; первый приёмочный fixture — 4 строки × 6 полей.
Tree mapping по умолчанию, без ручного изменения схемы, исключения корня,
переменных, Variant, дат, XSD, нескольких sibling arrays и forced root modes.
Strict остаётся native true, формат дат — исходный, но даты не входят в scope.
Ограничения проверять до мутации; произвольный JSON нельзя молча обрезать
до принятого примера. Если ограничения невозможно установить без изменения
узла, вернуть объяснимый отказ, а не заявлять поддержку всех JSON.

Параметры как данные — [schema-proposal.json](acceptance/schema-proposal.json).
Все поля имеют description; enum содержат только строки. Новому узлу нужны
все обязательные поля, существующий `parameters:{}` сохраняет настройки;
явный набор выбранных leaf paths заменяет выбор целиком. Это различие
проверяет handler до UI, как у существующих узлов базы.

`selected_paths` — пути **схемы**, например `/id`, `/active`, `/items/sku`;
индексов экземпляров массива в них нет. `/items/3/note` — путь **данных**,
используемый oracle. Имена экранируются по JSON Pointer (`~0`, `~1`).
Путь связывается с наблюдаемым узлом схемы и текущим портом; подписи Root и
совпадение текста не заменяют идентичность. Порядок выбранных путей должен
соответствовать порядку схемы; произвольную перестановку не обещаем.

## Текст `NODE_TYPES.semantics`

`trees.from_json`:

> Parse one input string-column JSON object using native automatic structure
> and root inference. Output 0 is a typed tree, not a table. Preserve array
> order, scalar types and exact Int64. Missing scalar fields in an inferred
> record become NULL; empty strings remain distinct. One repeated object
> branch only. Manual schema, forced root modes, dates, Variant and sibling
> arrays are unsupported. Read the actual tree before converting it to a table.

`trees.to_table`:

> Convert one selected repeated tree branch into one table row per instance.
> Select exact schema paths in schema order; ancestor selection is automatic.
> Output 0 is a table. repeat_parents=true copies selected parent values to
> every row; false retains them in the first row and emits NULL thereafter.
> Missing scalar and JSON null both yield NULL, distinct from empty string,
> zero and false. Leaf names and labels only; index columns and sibling-array
> combinations are unsupported. Read every output row and its declared type.

Тексты описывают предложенную поддержку, не уже зарегистрированные типы.
Их надо доставлять через полную и компактную карточку и свой раздел навыка
`packages/product/skills/loginom-automation`; task не обучает модель tool names.

## Значения, порядок и точность

- Схема отделена от экземпляров: имя, метка, scalar type, container/array flags,
  родитель, порядок; optional/required — только после фактического readback.
- Сохраняются порядок схемы и массива. Табличный результат — ordered=true,
  column_order=exact, output_port=0. Генерируемые метки сравниваются с label_any.
- NULL — типизированный отсутствующий scalar, не строка `"null"` и не `""`.
  В этом fixture missing note → материализованный NULL уже на tree output.
  Отсутствие контейнера или пустой массив — отдельные состояния, их политика
  вне первого этапа; scalar-правило на контейнеры не распространяется.
- Int64 передаётся десятичной строкой; никакого промежуточного `Number` для
  `9007199254740993`. Boolean не числовой 0/1. Real — binary64 с точным чтением;
  fixture использует 1.25, 0.5, 2.0, для него abs=rel=0. Недоказанная точность
  должна приводить к отказу. Другие допуски задаются заранее отдельной задачей.
- Oracle использует Python int и Decimal, сохраняет порядок JSON, нормализует
  только наблюдённую политику missing scalar → NULL. Runtime его не импортирует.
  Нельзя сравнить лишь конечную таблицу и объявить дерево правильным.

## Компактный readback

Предлагаемая компактная конфигурация первого узла:

```json
{"kind":"json_to_tree","mode":"auto_structure","json_field":"Document","root_mode":"auto","auto_structure":true,"strict":true,"exclude_root":false}
```

Второго:

```json
{"kind":"tree_to_table","mode":"selected_nodes","selected_paths":["/id","/active","/items/sku","/items/qty","/items/price","/items/note"],"repeat_parents":true,"composite_names":false,"composite_labels":false,"label_separator":"."}
```

Общая оболочка дополнительно сохраняет реальные document/workflow/node/port
identities, тип каждого порта, фактические связи и наблюдённую схему.
Выполнение и чтение различаются: Done не доказывает output; Execute получает
новый результат; Close отменяет draft. Readback не должен содержать полный JSON
повторно вместо дерева или выдавать старую схему за выполненную.

## Общая работа, требуемая до handler

Одной аддитивной регистрации недостаточно. На базе `2098aaf`:

1. `node-contracts.mjs` / `.d.ts` валидируют tabular inputs;
   `node-target-browser.mjs:110` распознаёт только `(Input|Output)_Data-N`,
   а DataTree уходит в other_ports/foreign_links. Нужны typed tree ports,
   проверка совместимости и принадлежности workflow, корректный tree→tree link.
2. `node-procedure.mjs`, `workspace-ui.mjs`, `node-port-output.mjs`,
   `node-output-context.mjs`, `node-read-*` ориентированы на таблицу. Нужен
   привязанный к собственному tree-порту reader схемы и всех экземпляров,
   с границами/полнотой, точными числами, NULL и проверенной очисткой UI.
   Предложение первого предела: ≤256 экземпляров узлов, глубина ≤16,
   сериализованный ответ ≤1 MiB; превышение — отказ без усечения.
3. `node-api.mjs`, `node-result-schema.mjs`, `user-results.mjs` потребуют
   общего представления дерева и компактного результата. Не добавлять tree
   в tabular_outputs и не притворяться, что строковый preview — typed tree.
   Это изменение общего контракта, **требующее отдельного решения владельца**.
4. `expected-outputs.mjs` поддерживает ordered, output_port и real tolerance,
   но только табличные columns/rows. `cold-check.mjs` читает табличные выходы;
   `proposed_tree_output` текущим reader **не проверяется**. Нужен отдельный
   branch tree в существующем cold-check: reopen, новое выполнение,
   чтение исходного tree output 0 и финального table output 0, сравнение
   независимых schema/instances. Не создавать параллельный механизм проверки.
5. `run-check.py` / каталог сценариев: два изолированных сценария пары с
   repeat on/off, доставка только входного CSV, свои новый чат/профиль/пакет;
   tree cold вызывается существующим runner. В этом PR их регистрации нет.

Обозначим эту общую работу **W1 / tree_io**. Файлы перечислены как точки
проектирования, не как разрешение на массовый рефакторинг. `packages/agent`,
бюджеты, таймауты и общая схема сейчас не меняются. FullType gap из discovery
должен быть разрешён до регистрации либо явно включён в согласованный профиль
идентичности. После W1 узлы, параметры и своё расширение навыка можно добавлять
аддитивно. Ручной schema mapping / XSD — отдельный W2 позднее.

## Приёмка, предлагаемая владельцу

Два отдельных сценария: основной общий task и вариант no-repeat в подплане
второго узла. Основной — четыре ordered строки:

| id | active | sku | qty | price | note |
|---|---|---|---|---|---|
| 9007199254740993 | false | A | 2 | 1.25 | NULL |
| 9007199254740993 | false | B | 0 | 0.5 | пустая строка |
| 9007199254740993 | false | C | 3 | 2.0 | x |
| 9007199254740993 | false | D | 1 | 0.5 | NULL |

No-repeat: id/active первой строки те же, остальные три строки — NULL в этих
двух полях; остальные значения и порядок неизменны. Оба output_port=0.
Tree oracle проверяет schema order/types, четыре повторения items, каждое
значение и нормализацию missing note. Подмена дерева промежуточной таблицей
не принимается. Невыбранный индекс массива отсутствует в выходе.

После W1: независимый cold-check сохранённого пакета PASS; ≥2 PASS из 3 на одном
SHA у исполнителя и 2/3 под вторым аккаунтом на том же SHA; тесты затронутых
пакетов; package_closed=true, logged_out=true. Отказы неподдержанных modes,
неверного leaf path, чужого порта/workflow — до мутации.
Сейчас эти критерии **предложены, не утверждены и не выполнены**.

## Размер схемы и оценка

`node-caption-schema.test.mjs` базы: **3/3 PASS**, полная inputSchema
`dock_node_apply` — **45 891 Б** UTF-8 JSON.stringify (без pretty print).
В [measure-schema.mjs](acceptance/measure-schema.mjs) клонируется именно эта
полная схема, добавляются type/mode enum и свойства parameters из предложения:

| Добавление | Приращение | Полный размер |
|---|---:|---:|
| trees.from_json | 275 Б | 46 166 Б |
| trees.to_table | 712 Б | 46 603 Б |
| Оба | 987 Б | 46 878 Б |

Каждый тип ≤1 050 Б. Обязательность new/existing проверяется handler, без
дублирования parameter_schema в allOf. Semantics/карточки/readback не входят
в inputSchema. **Общее tree_io здесь не посчитано:** его контракт ещё не принят;
к окончательной регистрации измерить полный эффект повторно. Превышение
46 000 Б не останавливает этап 0; резерв всего состава относится к F2/LAB-516.

Оценка после утверждения W1: **4 основных цикла + 1–2 резервных**, каждый цикл
с наблюдением, адресной правкой и проверкой, без гарантии wall-clock срока:

1. W1 typed graph/contracts и совместимость портов, отказ неправильных связей.
2. W1 tree reader + независимый cold branch, точность и пределы полноты.
3. JSONToTree и TreeToData handlers, schema/readback/skill, первые живые сценарии.
4. Исправление наблюдённых отказов, обе автономные приёмки на чистом SHA.

Резерв — FullType/точное чтение дерева или повторный отказ UI. Для общего W1
нужна отдельная карточка и согласование контрактов; без неё этап 1 не начинать.
