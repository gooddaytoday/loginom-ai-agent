Комплект LAB-1558: typed tree reader на одном узле `trees.from_json`.
R1 (LAB-1601): даты подтверждены native-пробой на Loginom 7.4.2 от 13.11.2026
и зарегистрированы как `tree-dates`; общий reader не меняется. R2 (LAB-1647)
добавляет массивы скаляров и `tree-scalar-arrays`; Variant остаётся циклом R3. План общего
reader — [variant-reader/tree-reader.md](../../../variant-reader/tree-reader.md),
раздел цикла — [plan.md](../../plan.md), «Typed tree reader — LAB-1558».
`expected.json` — контейнер `cases` в формате `tree_outputs` (`check_tree`),
**не вход stock run-check**. `expected-dates.json` — отдельная stock-проекция
`cases.dates` без изменения исходных значений, с `outputs:[]`, двумя узлами
`label_any` и `tree_outputs`. `expected-scalar-arrays.json` так же проецирует
`cases.scalar_arrays`; обе проекции проверяет `oracle.py --check`.

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

Три формы ожидания аддитивны к `check_tree`:
лист `type:"variant"` с `cell_type`/`value`, тип схемы `<scalar>_array` и
значение DateTime `YYYY-MM-DDTHH:MM:SS.mmm`. DateTime уже проверяется с
`precision:millisecond` и `representation:local_datetime`; `<scalar>_array`
проверяется в R2, Variant ждёт R3. Нового механизма проверки нет. Массив назван
`items`: этого требует `check_tree`.

Отношение к прежним комплектам. `acceptance/task-mixed-leaves.md` (LAB-1136)
— тот же Variant-лист без real и Int64; при регистрации берётся этот,
расширенный. `acceptance/modes/task-dates.md` (LAB-1042) задаёт формат с
миллисекундами из отдельного файла. Он остаётся случаем ручной настройки
формата, а этот случай проверяет формат по умолчанию. Их `--check` не
затронуты.

Правила oracle подтверждены native-пробой для трёх исходных документов:
- дата — строка по формату узла по умолчанию `YYYY-MM-DDThh:mm:ss`
  (LAB-1136), полдень и время вдали от переходов на летнее время;
- подтип Variant — по JSON-литералу: целое → integer, дробное → real;
- пустой массив даёт ноль экземпляров, его определение в схеме остаётся.

Ответы пробы 1–5 приведены в [плане reader](../../../variant-reader/tree-reader.md#native-проба-lab-1601-13112026).
Кратко: default DateTime DataType=2, civil-время без сдвига при strict on/off;
дата без времени тоже DateTime (полночь). Variant DataType=6 возвращает
`number/string/boolean/null/number/Int64`, большое целое точно; JS `number`
не сохраняет различие integer/real. Reader interface=166, его кеширующий helper
использует internal interface=2178: GetMetadata=7228, GetValues=7229,
GetAsVariant=7230. Для scalar arrays Array=true/Container=false, tags=5,
scores=3; у второй записи оба диапазона size=0. Формат native-кадра и
направление R3 фиксируются в плане reader; табличный interface 116 сюда не переносится.

Положительная приёмка — существующий стандарт деревьев: полное дерево,
схема и порядок, точные типы, Int64 и NULL, границы каждого массива, Save,
новый профиль, cold Execute без настройки, cleanup. Tree output в CSV не
выгружается. Метки, не заданные задачей, — `label_any`.
