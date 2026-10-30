Общий приёмочный комплект пары хранится в
`../../trees-jsontotree/fixtures/` и `../../trees-jsontotree/acceptance/`.
Его oracle не импортирует Loginom/runtime.

- Основная цепочка с повторением родителей: общий `task.md` и `expected.json`.
- Вариант без повторения: здешний `task.md` и общий `expected-no-repeat.json`;
  рассчитывается `oracle.py --no-repeat`, проверяется с `--no-repeat --check`.
- Каждый вариант — отдельный новый пакет, чат и профиль будущего run-check.
  Модель получает только task и `documents.csv`, не oracle/expected/manifest.
- Это предложение v0.3.9. Текущий run-check не регистрирует эти сценарии,
  а cold-check не читает `proposed_tree_output`. Запуск сейчас не является
  приёмкой пары, даже если табличный итог совпал.
