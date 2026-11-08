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

`python3 docs/node-development/nodes/trees-jsontotree/acceptance/nested-records/oracle.py --check`
пересчитывает expected независимо, только stdlib JSON/csv/Decimal и обход путей.
Int64 — точные десятичные строки, порядок сохраняется, boolean проверяется
до integer; missing scalar и поля пустого объекта нормализуются в NULL.
Пустые контейнеры и NULL-only без свидетеля типа предложены отдельно после
native-пробы; default type — Variant, empty scalar array не превращается
в object array. Это oracle-формат, не зарегистрированный wire contract.

До утверждения владельцем новые случаи не запускаются как приёмка.
Старые modes/task-nested.md и LAB-1112 не меняются. Здесь нет N root rows,
глобальных индексов, flatten или sibling multiplication.

Модель получает только task и указанный CSV. Oracle, expected, измеритель,
предложение карточки и навыка модели не передаются. Полный typed tree,
Save/cold/cleanup и штатный стандарт 2/3+2/3 описаны в nested-records.md.
