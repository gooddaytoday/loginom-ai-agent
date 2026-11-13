## Фильтр строк: Top-N и пороги real/datetime/NULL из переменных — комплект этапа 0 (LAB-1546)

База — голова `coverage-refresh` (#1069) поверх `origin/v040@cb0733a0`. Только
документы: runtime, run-check и навык не менялись, модельных прогонов не было.
**Top-N: готов (LAB-1575)** — native-проба подтвердила picker integer-порога
номера строки, 1-based, исходный порядок и ссылку после Save/Close/Open.
Подробности — [discovery-variables.md](../../discovery-variables.md#top-n-native-проба-lab-1575-13112026).
Real/datetime/NULL: **предл.**, отдельный следующий цикл; здесь не принимаются.

### Что известно о 7.4.2

| Факт | Источник | Статус |
|---|---|---|
| Операторов «первые/последние N», top/bottom, процентов нет; «первый/последний» — строковые операторы над значением | справка `row-filter/filtering-criteria.html` | документ |
| Native-поле «номер строки»: `RowNumberer=1`, `DataType=4` | `filter-context.mjs:29`, `filter-procedure.mjs:147`; уже `field.kind:"row_number"` | реализовано |
| Привязка порога к переменной — `input_field` integer/string, integer scalar `row_number` | `filter-bindings.mjs`, LAB-1575 | реализовано |
| Scalar-редактор `VariantPropEdit;SwitchButton` → picker совместимых переменных (integer) | `../../discovery-variables.md:38-47` | наблюдено для integer |
| Picker для номера строки; integer TopN | LAB-1575, `native-probe/ui.jsonl:3–4,27` | наблюдено; Save/Close/Open |
| Picker для real/datetime поля | — | **NOT_CHECKED** |
| Переменные real, datetime, NULL у builtin «Переменные сценария» | `../../../variables-user/discovery.md:1-36` (LAB-898) | наблюдено |
| Сравнение с NULL ложно, NULL-строки не проходят без условия «пустой» | справка | документ; для NULL-**переменной** — гипотеза |
| Логический тип: только «истина/ложь/пустой/не пустой», значения для привязки нет | справка, таблица операторов | документ |

Выводы для среза:

- **Первые N** = `row_number <= N`. С литералом N это уже поддержано (0 циклов
  runtime); новое — N из переменной (привязка `row_number`).
- **Последние N — огр. 7.4.2, не берём.** Штатного параметра нет; через
  `row_number > count - N` нужен отдельный источник числа строк — это
  сценарий из нескольких узлов, а не параметр Фильтра.
- **boolean-переменная — огр. 7.4.2, не берём:** у логического поля нет
  оператора со значением; привязывать нечего.
- **real, datetime** — расширение привязки на эти типы.
- **NULL-переменная** — гипотеза SQL: выход 0 пуст, все 8 строк в выходе 1.
  Если native-проба покажет ошибку мастера или выполнения, цикл делает
  честный отказ до мутации, а `expected-null.json` уходит из комплекта.

### Файлы

- [rows.csv](../../fixtures/typed/rows.csv) — 8 строк: Score на пороге 2.5 и 2.4999,
  Seen на пороге и +1 с, високосный день, NULL в Score и в Seen.
- [task-top-n.md](task-top-n.md) — TopN 3 → 5; `expected-top-initial/final.json`,
  `ordered:true`.
- [task-variable-typed.md](task-variable-typed.md) — MinScore (real) и Since
  (datetime), затем новые значения; `expected-typed-initial/final.json`.
- [task-variable-null.md](task-variable-null.md) — MinScore = NULL; `expected-null.json`.
- [oracle.py](oracle.py) — stdlib, без Loginom. `--check` сверяет пять expected и
  проверяет границы и полноту разделения на выходы 0/1. Номер строки 1-based —
  подтверждён native-пробой LAB-1575.

```sh
python3 -B docs/node-development/nodes/row-filter/acceptance/typed/oracle.py --check
```

Все expected: оба выхода, все 4 поля, `column_order:any`, `label_any`;
Score — tolerance `abs 1e-9 / rel 1e-12`. Источник переменных — builtin
`variables.user` (output 4), как в `filter-bindings`.

### Предлагаемые критерии карточки цикла

1. `row-filter-top-n`: TopN=3 → RowID 1–3 в исходном порядке; после смены
   только TopN=5 и Execute того же Фильтра — 1–5; после cold — привязка
   `row_number` к TopN, не литерал.
2. `row-filter-typed`: initial — RowID 2, 8; final — 2, 3, 7, 8 (порог включён,
   NULL не проходит); после cold — обе привязки к MinScore/Since.
3. `row-filter-null`: MinScore=NULL — выход 0 пуст, выход 1 = все 8 строк, либо
   честный отказ по итогу native-пробы (решается до прогонов, не после).
4. Регрессия: `filter-bindings`, `row-filter-*`.
5. Стандарт сквада: cold, Save, cleanup, 2/3 у исполнителя и проверяющего
   на одном SHA. Новых критериев сверх стандарта нет.

### Оценка этапа 1

**2 цикла** (+1 резерв): (1) привязка `row_number` + Top-N; (2) real/datetime,
NULL-переменная. Файлы: `filter-bindings.mjs` (типы, `row_number`, NULL),
`filter-readback.mjs`, сценарии в `run-check.py`.
**Бюджет — главный риск:** справка `transform.filter_data.md` **5921 / 6000 Б**,
карточка `conditions` **11 238 / 12 000 Б**. Нужно +~350 Б справки (Top-N через
`row_number`, типы порога, NULL) и +~250 Б схемы. Без сжатия текущей справки
на ~300 Б не влезает; сжатие — часть первого цикла.
