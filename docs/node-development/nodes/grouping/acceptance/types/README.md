Предложение LAB-1558, этап 0 по документам. Runtime не менялся, native-пробы
не было. `expected.json` — контейнер `cases`, **не вход stock run-check**:
при регистрации цикла его случай выделяется в отдельный expected, как у
`acceptance/modes`. Раздел цикла — [plan.md](../../plan.md), «Предложение
LAB-1558».

Модели передаются только выбранный `task-*.md` и его CSV из
`../../fixtures/types/`. Oracle, expected и этот README остаются в проверке.

```sh
python3 -I docs/node-development/nodes/grouping/acceptance/types/oracle.py --check
```

Oracle читает только CSV (SHA-256 закреплены в коде), не импортирует
runtime и не читает expected как источник чисел.

| Случай | Task | Вход | Что проверяет | Что сейчас мешает |
|---|---|---|---|---|
| real | task-real.md | types.csv | median, mode, stddev по Real; ничья моды E → 0.5 | `grouping-parameters.mjs:6` — median/stddev только integer, mode — integer/string |
| date | task-date.md | types.csv | min, max, last, null_count по DateTime | min/max проходят валидатор (`:6` их не ограничивает), тип выхода DateTime даёт `grouping-output.mjs:13`; last и null_count закрыты `:6` |
| boolean | task-boolean.md | types.csv | min, max, mode, unique_count, null_count по Boolean; ничья E → False | mode/unique_count/null_count закрыты `:6` |
| variant | task-variant.md | variant.csv → Свёртка | count, null_count, first, last по Variant | `:6` закрывает null_count/first/last; Variant-выход Группировки не читается точно: `transform.group_data` нет в `typedVariants` (`node-procedure.mjs:269`) |
| mode_tie | task-mode-tie.md | mode-tie.csv | ничья моды integer/string → наименьшее | код допускает; ничья не наблюдалась (`modes/oracle.py` её запрещает) |
| empty | task-empty.md | empty.csv (только заголовок) | пустой вход → пустой типизированный результат | код не запрещает; поведение 7.4.2 не наблюдалось |

Правила oracle — предложение, их сверяет native-проба:

- Ничья моды — наименьшее значение: False, меньшее число, лексикографически
  меньшая строка (справка `processors/func/aggregation-functions.md`, «Мода»).
  В fixture ничьи только там, где порядок кодовых точек и локали совпадает.
- Mode all-NULL: integer → 0, string → пустая строка наблюдены (LAB-998).
  Real → 0.0 и Boolean → False — продолжение того же правила, вопрос пробы.
- First/Last включают крайний NULL (наблюдено для integer/string).
- Min/Max/First/Last сохраняют тип входа, Count/UniqueCount/NullCount —
  integer, Median/StdDev — real (Кросс-таблица 7.4.2, `transform-crosstable/discovery.md:62`,
  LAB-998 для Группировки).
- StdDev — выборочная, n=1 → 0, порядок `sqrt((Σx²/n − mean²)·n/(n−1))`;
  у столбца допуск 1e-12 штатным `tolerance`.
- Даты без времени, в январе–феврале и июне–июле: вдали от переходов на
  летнее время, год ≥ 1900. Ожидание — `YYYY-MM-DDT00:00:00.000`.
- Variant: Свёртка выдаёт строки RowID × (IntValue, RealValue, TextValue)
  в этом порядке, пустые сохраняются; подтипы — по исходному столбцу.

Положительная приёмка — существующий стандарт: полный typed-результат,
CSV, точные типы, имена и порядок полей, NULL, Save, новый профиль, cold
Execute без настройки, cleanup. Порядок групп не проверяется (`ordered:false`).
Незаданные метки — `label_any`. Новых матчеров и механизмов проверки нет.
