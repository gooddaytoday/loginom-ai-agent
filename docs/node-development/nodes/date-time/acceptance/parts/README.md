## Дата и время: части даты — комплект этапа 0 (LAB-1546)

База — голова `coverage-refresh` (#1069) поверх `origin/v040@cb0733a0`. Только
документы: runtime, run-check и навык не менялись, модельных прогонов не было.
**Статус: готов.** Native-проба LAB-1560 на `app.loginom.ai`, mas3,
13.11.2026 подтвердила значения, integer-типы и суффиксы.
Подробности — [discovery](../../discovery.md#части-даты-native-проба-lab-1560).

### Что известно о 7.4.2

Матрица `MF;TF-2;WizrdMCF;DateReformWizard;grdDataFormat`: 29 строк, 19 обычных
и 10 ISO (`../../plan.md:210-222`, `../../discovery.md:80`). Обычные строки
и шаблоны `StringFmt`, наблюдённые в cached store:

| Предлагаемая operation | Native `(Func, ISO)` | Подпись | Маркер | Статус |
|---|---|---|---|---|
| `week` | (7, false) | Неделя | `%W` | h1 подтверждена; суффикс WY |
| `day_of_year` | (8, false) | День года | `%z` | значения подтверждены; суффикс DY |
| `millisecond` | (15, false) | Миллисекунды | `%u` | значения подтверждены; суффикс MSEC |
| `quarter` | (5, false) | Квартал | `%Q` | **уже зарегистрирован** (`date-time-parameters.mjs:4`), здесь — регрессия |

Флаг числа — колонка `;colDoNumber_<index>` (`../../discovery.md:64-73`); суффикс
индекса не является enum. Выходные имена по образцу `DateA_<SUFFIX>_<n>`; суффиксы
новых строк (`W`, `DY`, `MS`?) **NOT_CHECKED** — их читает этап 1 из
`DerivedDataSourceOutputSocketWizard;grdTargetColumns`, не угадывает.
Справка: `%z` «номер дня в году», `%u` «миллисекунды с ведущими нулями»,
`%W` «номер недели в году» — без правила начала недели и недели 0/1.
Разбор строк и часовой пояс — огр. 7.4.2 (`../../plan.md:234-237`), не берём.
Той же ценой доступны «День квартала» (9, `%q`) и «Неделя в месяце/квартале»
— в комплект не включены: карточка их не называет.

### Файлы

- [data/parts.csv](data/parts.csv) — 8 строк: 1/60/365/366-й день, мс 0/1/10/125/500/999,
  кварталы 1/3/4, воскресенья 1–3 января (различают гипотезы недели), NULL.
- [task.md](task.md) — день года, квартал, миллисекунды; [expected.json](expected.json).
- [task-week.md](task-week.md) — неделя; [expected-week.json](expected-week.json)
  (`week_convention`).
- [oracle.py](oracle.py) — stdlib, без Loginom. `--check` сверяет оба expected и
  проверяет, что fixture покрывает границы и различает гипотезы недели.

```sh
python3 -B docs/node-development/nodes/date-time/acceptance/parts/oracle.py --check
```

**Неделя.** Обычная «Неделя» Loginom не описана; в oracle две гипотезы:
h1 — неделя с понедельника, неделя 1 содержит 1 января (по умолчанию);
h2 — strftime `%W`, дни до первого понедельника — неделя 0. На fixture
они расходятся в строках 4–6 (53/52, 1/0, 1/0). Native-проба
на `parts.csv` (preview по `data-tid`, без модели) выбрала h1: строки 4–6
дают 53/1/1. `expected-week.json` остаётся исходным, h2 отвергнута.
После первого прогона expected не подгоняется.

### Критерии карточки цикла

1. Новые operation `day_of_year`, `millisecond`, `week` в существующем
   `mode=calendar`; выход integer, NULL→NULL; исходные поля не меняются.
2. `parts`: все 8 строк × 6 столбцов совпадают с `expected.json`
   (`ordered:false`, `column_order:exact`, `label_any`).
3. `parts-week`: `expected-week.json` при подтверждённой конвенции.
4. Регрессия: `date-time-iso` и `date-time-formats` без изменений.
5. Стандарт сквада: cold, Save, cleanup, 2/3 у исполнителя и проверяющего
   на одном SHA. Новых критериев сверх стандарта нет.

### Оценка этапа 1

**1 цикл** (+1 резерв на неделю, если конвенция не h1/h2 или preview не
показывает мс). Строки в `DATE_TIME_OPERATIONS` (`date-time-parameters.mjs`),
readback суффиксов (`date-time-readback.mjs`), регистрация двух сценариев в
`run-check.py`. Навык: справка `transform.date_time.md` **3825 Б** → ~4150 Б
(+~300 Б: три operation и «неделя — штатная обычная, не ISO») при лимите 6000 Б;
карточка `calendar` **7118 Б** → ~7350 Б (enum operation) при лимите 12 000 Б.
