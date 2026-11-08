# Сезонность LAB-1127: предложение, ожидающее решения

Это ограниченная бизнес-приёмка постоянной опоры и вырожденных входов.
Она не доказывает правильность произвольного seasonal estimator. Исходный
чередующийся `seasonal-support.csv` остаётся исследовательским: независимой
формулы native тренда, интервалов и индексов для него нет.

`task-seasonal.md` явно исключает доверительные границы из порта 0 через
штатное соответствие выходных столбцов. Остальные десять полей и весь порт 1
проверяются целиком существующим сравнителем, без игнорирования actual-полей,
новых предикатов или ослабления точности. Такое ограничение объёма требует
решения владельца до этапа 1; оно не согласовано этим PR.

| Сценарий (ещё не зарегистрирован) | Task | Expected | Строки 0 / 1 |
|---|---|---|---:|
| ungroup-seasonal | task-seasonal.md | expected-seasonal.json | 4 / 2 |
| ungroup-seasonal-zero | task-seasonal-zero.md | expected-seasonal-zero.json | 4 / 2 |
| ungroup-seasonal-null | task-seasonal-null.md | expected-seasonal-null.json | 0 / 0 |
| ungroup-seasonal-empty-support | task-seasonal-empty-support.md | expected-seasonal-empty-support.json | 0 / 0 |
| ungroup-seasonal-empty-totals | task-seasonal-empty-totals.md | expected-seasonal-empty-totals.json | 0 / 0 |

Во всех сценариях два CSV: totals и support из `oracle-seasonal.py:CASES`;
пустые файлы импортируются с явно заданной схемой, без определения типов
по отсутствующим строкам. Два экспорта, новый чат/профиль/пакет, стандартные
CSV/Save/cold/cleanup, 2/3 и независимые 2/3 на одном SHA. При пустых входах
нужен полноценный пустой CSV с заголовком каждого порта, не отсутствие файла.
Модель получает только task и входные CSV, без oracle/expected/этого текста.

Порядок столбцов задан task. Порядок строк — totals, затем a,b; порт 1 — a,b.
Типы integer/string/datetime строгие, real abs=rel=1e-12; метки label_any.
NULL в качестве качества отличается от числовых 0 и 1.

Oracle использует Python csv/Fraction и только входные fixtures. Он проверяет
36 разных месячных точек и постоянство каждого ряда, считает нормированные
доли и постоянный тренд, задаёт единичные индексы. Соглашения NULL/zero/empty
и коды результата — явно ограниченная наблюдённая спецификация; формулу
качества для произвольных рядов он не реализует. Непостоянная опора отвергается
assert, а не подгоняется под actual. Воспроизведение из корня:

```sh
python3 docs/node-development/nodes/transform-ungroupdata/acceptance/oracle-seasonal.py
python3 docs/node-development/nodes/transform-ungroupdata/acceptance/oracle-seasonal.py zero
python3 docs/node-development/nodes/transform-ungroupdata/acceptance/oracle-seasonal.py null
python3 docs/node-development/nodes/transform-ungroupdata/acceptance/oracle-seasonal.py empty-support
python3 docs/node-development/nodes/transform-ungroupdata/acceptance/oracle-seasonal.py empty-totals
```

Вывод побайтно совпадает с соответствующим expected. Сопоставление с live DOM
этапа 0 не означает PASS runtime или cold: они не запускались, CLI не собирался.
Невозможно объявить полный сезонный режим принятым по этому ограниченному
комплекту без отдельного решения о чередующемся ряде и доверительных границах.
