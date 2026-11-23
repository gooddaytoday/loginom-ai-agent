Предложение LAB-1012, уточнённое в LAB-1120 на базе `ecb11c0e`.
Boolean/real/DateTime роли, NULL-группа, empty и singleton проверены вручную
в UI 7.4.2 по data-tid; наблюдения и предел доказательства — в дополнении
LAB-1120 подплана. Критерии всё ещё требуют утверждения до изменения handler.

| Задание в acceptance/ | Вход из fixtures/ | Результат здесь |
|---|---|---|
| task-typed-keys.md | typed-keys.csv | expected.json |
| task-empty.md | typed-empty.csv | expected-empty.json |
| task-singleton.md | typed-singleton.csv | expected-singleton.json |

`python3 docs/node-development/nodes/duplicates/acceptance/modes/oracle.py --write`
воспроизводит артефакты; `--check` сверяет. Только stdlib и исходные CSV.
Ровно одна группа каждого вида: exact number=1, непомеченный номер NULL.
Это прежнее предложение для утверждения; значения и нумерация expected
после живого просмотра не менялись. Добавлен только `null_marker:"NULL"`,
уже явно заданный в заданиях, для точного отличия пропуска от пустой строки.
Проверка всех значений/типов/NULL и исходных полей остаётся стандартной.

Модели только задание и один CSV; expected/oracle/карточка ей не передаются.
Схема карточки не расширена относительно базы, хеши заменены 64 нулями.
Карточка включает guidance режима mark; в reference добавлены штатные mode-маркеры.
Это измеримый образец describe, не активация новых возможностей.
Замер из корня репозитория:
`node docs/node-development/nodes/transform-crosstable/fixtures/measure-proposals.mjs`.
CSV/Save/cold/cleanup и 2/3 + 2/3 одного SHA — NOT_RUN.
