Предложение LAB-1015, критерии не утверждены. Стандартные typed expected
проверяют весь результат; oracle не импортирует Loginom/runtime и не читает
таблицу стенда. Только выбранные task/CSV передаются модели.

| Задание | Fixture | Expected | Строк |
|---|---|---|---:|
| task-mixed.md | mixed.csv | expected.json | 15 |
| task-ignore.md | mixed.csv | expected-ignore.json | 10 |
| task-null.md | all-null.csv | expected-null.json | 10 |
| task-null-ignore.md | all-null.csv | expected-null-ignore.json | 0 |
| task-header.md | header-only.csv | expected-header.json | 0 |
| task-header-ignore.md | header-only.csv | expected-header-ignore.json | 0 |
| task-variant.md | mixed.csv | expected-variant.json | 15 |

Файлы входов — в fixtures/. Явные типы нужны даже для пустого набора.
NULL обозначается `?`; пустая строка остаётся строкой. Ожидание ignore_empty
исключает только NULL, сохраняя 0, false и пустую строку.

Каждый scalar-сценарий задаёт полный входной mapping Id→RowID, I→Units,
S→Text и остальные поля без переименования; затем полные роли и выходной
mapping RowID/Field/FieldLabel/Cell/Kind. Многократно одинаковые метки не
заменяют техническую identity. Все пять выходных полей проверяются,
в том числе DataTypes→Kind. У пустого выхода проверяется схема, а не только
отсутствие строк. Метка Cell явно задана, остальные — label_any.

Variant создаётся первой свёрткой, а вторая транспонирует поле Cell.
Итоговый Kind=6 — **тип входного поля**, при этом Cell содержит независимые
typed `{cell_type,value}` ожидания. Нельзя проверять subtype по Kind.
Метка второй свёртки задана для однозначного stock cold selector.
Модель не получает oracle или результат, только CSV и пользовательское задание.

`python3 -B oracle.py --write` / `--check`. JSON совместим с существующим
parseExpectedOutputs. Новых декодеров/методов верификации нет.
Полное точное чтение Variant по-прежнему ограничено 50 строками × 8 полями
и доказанным происхождением. Наши наборы укладываются по размеру, но сама
поддержка цепочки источника Collapse→Collapse в точном reader **не доказана**.
Она требует отдельного решения, если затронет общий путь: не ослаблять
provenance и не заменять полный результат sample.

Живо проверены две последовательные свёртки на 3×(integer,string): 6 строк
на каждой, DataTypes=4/5 на первой и 6 на второй. Это DOM-наблюдение, а не
проверка точных variant bytes, широких fixtures, all-null или header-only.
Они остаются предложением для проверки на этапе 1. Стандартные CSV/Save/cold/
cleanup и ≥2/3 на одном SHA для обеих ролей обязательны после утверждения.

Карточка типа и узловой файл навыка — инертные *.proposal.*;
hash-поля карточки заменены 64 нулями. Основной skill не расширяется.
