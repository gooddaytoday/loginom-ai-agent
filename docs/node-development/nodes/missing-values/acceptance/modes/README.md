Предложение LAB-1012, до утверждения не runnable-кейсы run-check и не PASS.
UI-наблюдения, ограничения и остановка исследования — в разделе LAB-1012 подплана.

| Задание в acceptance/ | Вход из fixtures/ | Независимый результат здесь |
|---|---|---|
| task-median-mode.md | statistics.csv | expected.json |
| task-previous.md | ordered.csv | expected-previous.json |
| task-linear.md | ordered.csv | expected-linear.json |
| task-random.md | random-single-value.csv | expected-random.json |
| task-delete.md | delete.csv | expected-delete.json |

`python3 docs/node-development/nodes/missing-values/acceptance/modes/oracle.py --write`
воспроизводит артефакты; `--check` сверяет. Python stdlib, без Loginom и runtime.
Модели только задание и выбранный CSV. Oracle/expected/schema/card — проверяющему.
`parameter-schema.proposal.json` и `node-card.proposal.json` — данные для оценки
будущего describe, не зарегистрированный контракт. Хеши карточки — 64 нуля.
Текст будущего навыка — в fixtures/*proposal.md.

Границы: медиана нечётного числа известных значений, уникальная строковая мода,
previous и linear только с известными концами, random с единственным значением,
delete по одному полю. Прочие ветки не считаются покрытыми этим комплектом.
Числовая константа не предлагается: в двух числовых UI-меню её нет.
Переменные, seed, качество, cubic/spline и новый verifier не добавляются.
Все ожидаемые значения — предложения, новые выполненные выходы не получены.
