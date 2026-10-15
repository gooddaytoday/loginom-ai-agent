# Приёмочный комплект Группировки

`task.md` передаётся модели после замены `{{PACKAGE_PATH}}` на новый путь в каталоге карточки; вместе с ним передаётся только `data/grouping.csv`. Oracle, expected, matrix и журналы прежних попыток остаются вне контекста модели.

`python3 oracle.py` вычисляет `expected.json`, `initial.json` и `fixtures/` исключительно из CSV. Основной вход побайтно скопирован из прежнего oracle; `legacy_goal_contract.py` — неизменённый независимый расчёт. Manifest фиксирует байты, SHA-256, формат, порядок и типы полей. Дополнительные CSV материализуют матрицу подплана; ожидаемая семантика all-null и пустого входа требует живого подтверждения до самостоятельного прогона, статус `not_checked` не является PASS.

Итоговый результат проверяется штатным `scripts/node-acceptance/cold-check.mjs` из проверяемого SHA: позиционная схема, мультимножество всех строк, новый execution, происхождение исходных байтов, сохранённый пакет и cleanup. В копии expected для попытки заменить путь пакета, не значения. Сохранённые receipts/journal проверяются отдельно: конфигурация полного набора функций, порядок ключей, исходное поле Factor, mapping, сохранение незапрошенных свойств, идентичность изменяемого узла, отказы до мутации и recovery. Старый `grouping_node_acceptance.py` с Hermes/model/catalog pins не запускается как CLI gate.

Адресные независимые аудиторы `grouping_configuration_evidence.py` и `grouping_output_evidence.py` из `packages/loginom-runtime/tools/loginom-acceptance/` остаются источником проверок raw observations. Их CLI-транспорт и привязка к receipt/journal пока не квалифицированы; один cold-check не доказывает всю матрицу. Не объявлять полный PASS до завершения этой адаптации и всех пунктов подплана.

Тесты генератора: `python3 -m unittest discover -s docs/node-development/nodes/grouping/acceptance -p 'test_*.py'` из корня репозитория. Входы, expectations и manifest версионируются до модельного прогона; результаты попыток сохраняются отдельно, без секретов.
# Проверка полного результата и freshness

`oracle.compare_output` сравнивает весь упорядоченный список колонок
`name/label/type` и мультимножество полных строк. Порядок групп не является
ожиданием; составные группы и совпадающие проекции исключённого ключа нельзя
схлопывать по одному видимому ключу. Для header-only обязательна полная схема
при нуле строк. Count считает строки, включая NULL/empty, а не COUNT(field).

Перед сравнением caller обязан передать подтверждённые existing receipt evidence:
`expected_execution_id`, совпадающий `observed_execution_id`, `read_complete=True`
и `read_fresh=True`. Совпадение чисел само по себе не доказывает freshness.
Флаги нельзя выводить из oracle или задавать без подтверждения выполнения/чтения.
Helper не заменяет штатный CLI, cold-check, проверку конфигурации/пакета и cleanup.
Native all-null semantics и матрица остаются `not_checked` до независимого живого
подтверждения; ожидаемые legacy значения и критерии подплана не изменены.
