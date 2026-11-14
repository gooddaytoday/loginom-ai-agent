Комплект LAB-1558; native-проба выполнена в LAB-1581 до изменения кода.
`expected.json` остаётся неизменённым контейнером `cases`, **не вход stock
run-check**. Для `group-real`, `group-boolean` и `group-date` его `cases.real.stages`,
`cases.boolean.stages` и `cases.date.stages` без изменения чисел, типов и допусков выделены в
`expected-real.json`, `expected-boolean.json` и `expected-date.json`.
Для `group-mode-tie` и `group-empty` так же выделены `cases.mode_tie.stages`
и `cases.empty.stages` в `expected-mode-tie.json` и `expected-empty.json`;
`group-variant` использует отдельный `expected-variant.json`, без изменения
`cases.variant.stages`. Раздел цикла — [plan.md](../../plan.md), «Предложение
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
| real | task-real.md | types.csv | median, mode, stddev по Real; ничья моды E → 0.5 | зарегистрирован `group-real`; Real открыт по native-матрице |
| date | task-date.md | types.csv | min, max, last, null_count по DateTime | зарегистрирован `group-date`; DateTime открыт по native-матрице LAB-1581, выходы сохраняют datetime; null_count → integer |
| boolean | task-boolean.md | types.csv | min, max, mode, unique_count, null_count по Boolean; ничья E → False | зарегистрирован `group-boolean`; Boolean открыт по native-матрице LAB-1581 |
| variant | task-variant.md | variant.csv → Свёртка | count, null_count, first, last по Variant | зарегистрирован `group-variant`; native-функции открыты, exact reader сохраняет `cell_type`/`value` |
| mode_tie | task-mode-tie.md | mode-tie.csv | ничья моды integer/string → наименьшее | зарегистрирован `group-mode-tie`; native LAB-1581 (Q2) |
| empty | task-empty.md | empty.csv (только заголовок) | пустой вход → пустой типизированный результат | зарегистрирован `group-empty`; native LAB-1581 (Q7); CSV только с заголовком |

Правила oracle сохранены; native-проба 13.11.2026 их подтвердила для
проверенных случаев (подробности ниже):

- Ничья моды — наименьшее значение: False, меньшее число, лексикографически
  меньшая строка (справка `processors/func/aggregation-functions.md`, «Мода»).
  В fixture ничьи только там, где порядок кодовых точек и локали совпадает.
- Mode all-NULL: integer → 0, string → пустая строка наблюдены (LAB-998).
  Real → 0.0 и Boolean → False подтверждены LAB-1581.
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

Native-проба LAB-1581: база `eb92f4f467ef05cc5c2205a0239891e14f3e553b`,
7.4.2 / mas / Node 24.19.0 / Chromium 1246, свой пакет, UI по `data-tid`.
Сведения относятся к native Loginom; runtime расширен на Real (LAB-1581)
и Boolean (LAB-1616), DateTime (LAB-1659), Variant (LAB-1675). Для DateTime/Boolean/Variant sum/avg/median/stddev/concat
отклоняются и при настройке, и при чтении сохранённой маски функций.
Полные наблюдения и границы — [discovery](../../discovery.md).

| Вопрос плана | Наблюдение |
|---|---|
| 1. Матрица | FactorEditDialog chb 0–12 для Real; chb 1,2,3,6,8–12 для DateTime/Boolean/Variant. Concat выключен у всех четырёх. |
| 2. Ничья | Integer 5/3 → 3, Real 1.5/0.5 → 0.5, Boolean → False; Beta/alpha → Beta (кодовые точки). |
| 3. Date/Variant mode | Date — ранняя; Variant 10/3.5/"text" → Real 3.5, 1/1.0/"1" → Integer 1. Другие подтипы не обобщаем. |
| 4. All-NULL mode | Real 0, Boolean False; дополнительно Date 1899-12-30, Variant NULL. |
| 5. Выходные типы | Boolean min/max — Boolean, False < True; Real median/stddev — Real. Все 15 Real-ячеек совпали с `cases.real`. |
| 6. Variant и порядок | Min пропускает NULL; First/Last сохраняют native-подтип и крайний NULL; Свёртка — RowID × исходные столбцы. |
| 7. Пустой вход | Execute успешен, 0 строк с полной схемой `cases.empty`, `sample_complete:true`. |
| 8. DateTime | Ключи и меры сохранили день и 00:00:00.000, timezone unspecified; для этих дат полдень не нужен. |
| 9. Variant unique | 1, 1.0 и "1" дают 2 различных значения. |

Native-пакет сохранён, `package_closed=true`, `logged_out=true`.
Гипотеза о Variant Min с NULL как нижним значением не подтвердилась,
но Variant Min не входит в oracle комплекта; ожидания First/Last совпали.
