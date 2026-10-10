# Приёмочный комплект Группировки

`task.md` передаётся модели после замены `{{PACKAGE_PATH}}` на новый путь в каталоге карточки; вместе с ним передаётся только `data/grouping.csv`. Oracle, expected, matrix и журналы прежних попыток остаются вне контекста модели.

`python3 oracle.py` вычисляет `expected.json`, `initial.json` и `fixtures/` исключительно из CSV. Основной вход побайтно скопирован из прежнего oracle; `legacy_goal_contract.py` — неизменённый независимый расчёт. Manifest фиксирует байты, SHA-256, формат, порядок и типы полей. Дополнительные CSV материализуют матрицу подплана; ожидаемая семантика all-null и пустого входа требует живого подтверждения до самостоятельного прогона, статус `not_checked` не является PASS.

Итоговый результат проверяется штатным `scripts/node-acceptance/cold-check.mjs` из проверяемого SHA: позиционная схема, мультимножество всех строк, новый execution, происхождение исходных байтов, сохранённый пакет и cleanup. В копии expected для попытки заменить путь пакета, не значения. Сохранённые receipts/journal проверяются отдельно: конфигурация полного набора функций, порядок ключей, исходное поле Factor, mapping, сохранение незапрошенных свойств, идентичность изменяемого узла, отказы до мутации и recovery. Старый `grouping_node_acceptance.py` с Hermes/model/catalog pins не запускается как CLI gate.

Адресные независимые аудиторы `grouping_configuration_evidence.py` и `grouping_output_evidence.py` из `packages/loginom-runtime/tools/loginom-acceptance/` остаются источником проверок raw observations. Их CLI-транспорт и привязка к receipt/journal пока не квалифицированы; один cold-check не доказывает всю матрицу. Не объявлять полный PASS до завершения этой адаптации и всех пунктов подплана.

Тесты генератора: `python3 -m unittest discover -s docs/node-development/nodes/grouping/acceptance -p 'test_*.py'` из корня репозитория. Входы, expectations и manifest версионируются до модельного прогона; результаты попыток сохраняются отдельно, без секретов.
