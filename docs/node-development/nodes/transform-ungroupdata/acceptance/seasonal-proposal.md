# Сезонная приёмка: постоянная опора и края

Это ограниченная бизнес-приёмка постоянной опоры и вырожденных входов.
Она не доказывает правильность произвольного seasonal estimator. Исходный
чередующийся `seasonal-support.csv` остаётся исследовательским: независимой
формулы native тренда, интервалов и индексов для него нет.

`task-seasonal.md` явно исключает доверительные границы из порта 0 через
штатное соответствие выходных столбцов. Остальные десять полей и весь порт 1
проверяются целиком существующим сравнителем, без игнорирования actual-полей,
новых предикатов или ослабления точности. Постоянная опора уже зарегистрирована;
решение владельца `v040-scope-expansion` разрешает zero/null по наблюдённым
expected, а empty требует честного отказа. Произвольный estimator не принят.

| Сценарий | Task | Expected | Строки 0 / 1 | Статус |
|---|---|---|---:|---|
| ungroup-seasonal | task-seasonal.md | expected-seasonal.json | 4 / 2 | доли, тренд, индексы вычислены и проверяются; UngroupQuality=NaN (`{"non_finite":"NaN"}`, решение `v040-nan-exact`) — наблюдение 7.4.2, не заявляется в справке |
| ungroup-seasonal-zero | task-seasonal-zero.md | expected-seasonal-zero.json | 4 / 2 | наблюдённый expected разрешён владельцем для PASS |
| ungroup-seasonal-null | task-seasonal-null.md | expected-seasonal-null.json | 0 / 0 | наблюдённый expected разрешён владельцем для PASS |
| ungroup-seasonal-empty-support | task-seasonal-empty-support.md | expected-seasonal-empty-support.json | — | явный отказ; без CSV и cold |
| ungroup-seasonal-empty-totals | task-seasonal-empty-totals.md | expected-seasonal-empty-totals.json | — | явный отказ; без CSV и cold |

Поля `claim` и `observation` у zero/null сохранены как происхождение эталона:
это ограниченное native-наблюдение, а не формула произвольных рядов. Решение
`v040-scope-expansion` разрешает именно эти эталоны. В zero не допускается
нормирование нулей до ненулевых долей; null не подменяется нулями.
Empty-файлы содержат только заголовок, в отличие от непустой NULL-опоры.
Expected отказа фиксируется до живых прогонов и проверяется штатной веткой
runner; сообщение должно назвать пустой вход, успешный экспорт запрещён.

Во всех сценариях два входных CSV: totals и support из `oracle-seasonal.py:CASES`;
выгрузки названы в task: `seasonal-details.csv` — порт 0, `seasonal-quality.csv` — порт 1
(порядок `outputs` в expected), даты экспорта — `yyyy-mm-dd hh:mm:ss`, NULL входа — `?`;
схема входов задана task. Для constant/zero/null — два экспорта, новый
чат/профиль/пакет, стандартные CSV/Save/cold/cleanup, минимум 2/3 на одном SHA.
Для empty — отказ, Save и cleanup без экспорта/cold. Независимая приёмка
назначается отдельно.
Модель получает только task и входные CSV, без oracle/expected/этого текста.

Порядок столбцов задан task. Порядок строк — totals, затем a,b; порт 1 — a,b.
Типы integer/string/datetime строгие, real abs=rel=1e-12; метки label_any.
NULL отличается от числовых 0 и 1 и точного NaN-маркера.

Oracle использует Python csv/Fraction и только входные fixtures. Он проверяет
36 разных месячных точек и постоянство каждого ряда, считает нормированные
доли и постоянный тренд, задаёт единичные индексы. Соглашения NULL/zero
и коды результата — явно ограниченная наблюдённая спецификация; empty —
явный отказ, а не прогноз нулевых строк; формулу
качества для произвольных рядов он не реализует. Непостоянная опора отвергается
assert, а не подгоняется под actual. Воспроизведение из корня:

```sh
python3 docs/node-development/nodes/transform-ungroupdata/acceptance/oracle-seasonal.py
python3 docs/node-development/nodes/transform-ungroupdata/acceptance/oracle-seasonal.py zero
python3 docs/node-development/nodes/transform-ungroupdata/acceptance/oracle-seasonal.py null
python3 docs/node-development/nodes/transform-ungroupdata/acceptance/oracle-seasonal.py empty-support
python3 docs/node-development/nodes/transform-ungroupdata/acceptance/oracle-seasonal.py empty-totals
python3 -I docs/node-development/nodes/transform-ungroupdata/acceptance/oracle-seasonal.py --check
```

Вывод побайтно совпадает с соответствующим expected; `--check` сверяет все пять.
Сопоставление с DOM этапа 0 не заменяет живые прогоны и cold точного SHA.
Невозможно объявить полный сезонный режим принятым по этому ограниченному
комплекту без отдельного решения о чередующемся ряде и доверительных границах.
