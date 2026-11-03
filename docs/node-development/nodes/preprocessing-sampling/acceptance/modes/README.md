Предложение LAB-648 для утверждения владельцем, не runnable-кейс run-check.
См. [исследование](../../modes-v039.md), задания `../task-*.md`
и вход `../../fixtures/modes.csv`.

Из корня репозитория:

```sh
python3 docs/node-development/nodes/preprocessing-sampling/acceptance/oracle-modes.py --node sampling
```

Вывод должен структурно совпадать с expected.json. Генератор вычисляет
домены строк и квоты из CSV независимо от Loginom. У случайных методов
конкретные строки не предсказаны; biased содержит явный нерешённый критерий.
Не подавать JSON генератору модели и не выдавать его за stock exact-rows.
Новые механизмы приёмки — только после решения владельца.
