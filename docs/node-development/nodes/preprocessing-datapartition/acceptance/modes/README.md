Предложение LAB-648, не runnable-кейс run-check.
См. [исследование S/P](../../../preprocessing-sampling/modes-v039.md).
Вход — `../../fixtures/modes.csv`; задания — `../task-*.md`.

Из корня репозитория:

```sh
python3 docs/node-development/nodes/preprocessing-sampling/acceptance/oracle-modes.py --node data_partition
```

Вывод должен структурно совпадать с expected.json. Используется тот же
независимый генератор и побайтово одинаковый fixture, что у Сэмплинга.
Модель получает только задание и CSV. Критерии, формат ожидаемых инвариантов
и дальнейший механизм проверки должны быть утверждены владельцем.
