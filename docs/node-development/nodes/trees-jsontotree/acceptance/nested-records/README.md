# Приёмочный комплект LAB-1136 — предложение

Единственная корневая строка в каждом case. [Наблюдения и стоп](../../nested-records.md).
`documents.csv` содержит четыре независимых JSON-поля; source JSON-файлы
приложены для проверки человеком. Импортировать каждое поле как строку.
`untyped.csv` — отдельный однострочный boundary input.

| Task из acceptance/ | Вход | Expected |
|---|---|---|
| task-nested-records.md | fixtures/nested-records/documents.csv, nested | cases.nested |
| task-mixed-leaves.md | тот же CSV, mixed | cases.mixed |
| task-empty-containers.md | тот же CSV, empty | cases.empty |
| task-null-leaves.md | тот же CSV, null | cases.null |
| task-untyped-containers.md | fixtures/nested-records/untyped.csv, Document | untyped_boundary |

`python3 -I docs/node-development/nodes/trees-jsontotree/acceptance/nested-records/oracle.py --check`
пересчитывает expected независимо, только stdlib JSON/csv/Decimal и обход путей
(без аргументов — перезаписывает expected.json). Int64 — точные десятичные
строки, порядок сохраняется, boolean проверяется до integer.

Формат (LAB-1166): каждый case — обычный expected run-check
(`package_path`, `nodes`, `outputs:[]`) с `proposed_tree_output`, который
проверяет `check_tree` в `scripts/node-acceptance/run-check.py`:
`schema_field_order`, `item_field_order`, `nested_field_order`, `schema_types`,
`document`. Сравниваемый документ — `document`: нормализованный JSON, где
scalar, отсутствующий в записи или пустом объекте, заполнен NULL по полям
соседних экземпляров того же пути схемы (`source_missing_paths` их перечисляет).
Ключи нормализации выводятся из fixture, не вписываются вручную;
`mixed_leaf.cell_types` тоже выводится. Регистрация case в run-check — этап 1.

`schema_types` содержат только пути с не-NULL свидетелем типа. Флаги путей без
свидетеля — всегда пустой массив `emptyArray` (`type:variant`, `is_array:true`,
`is_container:false`) и NULL-only `nullOnly` (`type:variant`) — взяты из
выходного мастера после пробы и лежат в `observation` с пометкой
«наблюдение, не заявляется»; проверяемый expected их не содержит.

До утверждения владельцем новые случаи не запускаются как приёмка.
Старые modes/task-nested.md и LAB-1112 не меняются. Здесь нет N root rows,
глобальных индексов, flatten или sibling multiplication.

Модель получает только task и указанный CSV. Oracle, expected, измеритель,
предложение карточки и навыка модели не передаются. Полный typed tree,
Save/cold/cleanup и штатный стандарт 2/3+2/3 описаны в nested-records.md.
