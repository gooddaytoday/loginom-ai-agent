Предложение LAB-1558, этап 0 по документам: typed tree reader на одном узле
`trees.from_json`. Runtime не менялся, native-пробы не было. План общего
reader — [variant-reader/tree-reader.md](../../../variant-reader/tree-reader.md),
раздел цикла — [plan.md](../../plan.md), «Typed tree reader — LAB-1558».
`expected.json` — контейнер `cases` в формате `tree_outputs` (`check_tree`),
**не вход stock run-check**: при регистрации цикла его случай выделяется в
отдельный expected.

Модели передаются только выбранный `task-*.md` и
`../../fixtures/typed/documents.csv` (одна строка, три строковых JSON-столбца).

```sh
python3 -I docs/node-development/nodes/trees-jsontotree/acceptance/typed/oracle.py --check
```

| Случай | Task | Столбец | Что проверяет | Шаг reader |
|---|---|---|---|---|
| dates | task-dates.md | dates | `/items/when` — DateTime, civil `2026-01-15T12:00:00.000`, NULL | R1 |
| variant | task-variant.md | mixed | `/items/value` — Variant: integer 7, string, false, NULL, real 2.5, Int64 9007199254740993 | R3 |
| scalar_arrays | task-scalar-arrays.md | arrays | `tags` — массив строк, `scores` — массив real, пустые массивы второй записи | R2 |

Три формы ожидания аддитивны к `check_tree` и сегодня им не принимаются:
лист `type:"variant"` с `cell_type`/`value`, тип схемы `<scalar>_array` и
значение DateTime `YYYY-MM-DDTHH:MM:SS.mmm`. Правка `run-check.py` входит
в соответствующий шаг R1–R3, нового механизма проверки нет. Массив назван
`items`: этого требует `check_tree`.

Отношение к прежним комплектам. `acceptance/task-mixed-leaves.md` (LAB-1136)
— тот же Variant-лист без real и Int64; при регистрации берётся этот,
расширенный. `acceptance/modes/task-dates.md` (LAB-1042) задаёт формат с
миллисекундами из отдельного файла. Он остаётся случаем ручной настройки
формата, а этот случай проверяет формат по умолчанию. Их `--check` не
затронуты.

Правила oracle — предложение, их сверяет проба:
- дата — строка по формату узла по умолчанию `YYYY-MM-DDThh:mm:ss`
  (LAB-1136), полдень и время вдали от переходов на летнее время;
- подтип Variant — по JSON-литералу: целое → integer, дробное → real;
- пустой массив даёт ноль экземпляров, его определение в схеме остаётся.

Положительная приёмка — существующий стандарт деревьев: полное дерево,
схема и порядок, точные типы, Int64 и NULL, границы каждого массива, Save,
новый профиль, cold Execute без настройки, cleanup. Tree output в CSV не
выгружается. Метки, не заданные задачей, — `label_any`.
