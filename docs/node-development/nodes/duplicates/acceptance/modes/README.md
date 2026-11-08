Предложение LAB-1012. Живая семантика типизированных/NULL-ключей в этой карточке
ещё не подтверждена; см. дополнение в подплане. Handler уже допускает эти типы.

| Задание в acceptance/ | Вход из fixtures/ | Результат здесь |
|---|---|---|
| task-typed-keys.md | typed-keys.csv | expected.json |
| task-empty.md | typed-empty.csv | expected-empty.json |
| task-singleton.md | typed-singleton.csv | expected-singleton.json |

`python3 docs/node-development/nodes/duplicates/acceptance/modes/oracle.py --write`
воспроизводит артефакты; `--check` сверяет. Только stdlib и исходные CSV.
Ровно одна группа каждого вида: exact number=1, непомеченный номер NULL.
Это предложение для утверждения, не подгонка нумерации по фактическому выходу.
Проверка всех значений/типов/NULL и исходных полей остаётся стандартной.

Модели только задание и один CSV; expected/oracle/карточка ей не передаются.
Схема карточки не расширена относительно базы, хеши заменены 64 нулями;
это измеримый образец describe, не активация новых возможностей.
CSV/Save/cold/cleanup и 2/3 + 2/3 одного SHA — NOT_RUN.
