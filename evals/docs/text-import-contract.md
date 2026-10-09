# Контракт текстового импорта

Подготовка offline; live-приёмка выполняется отдельным этапом. Модели Rich,
Ben и Evaler сохраняются. Loginom AI Agent: `openai/gpt-6-luna`, `high` для
reference и product. LAB-55 и действующие CLI/skill pins не изменяются.

Дополнение к `docs/superpowers/specs/2026-09-18-evals-design.md`:
`task.json.output_mode = "diagnostic"` допускает отсутствие reference и
успешного пакета. Поле reference загружается как пустая строка; judge запрещён.
Другие задачи по-прежнему требуют настоящий reference. Успешное завершение
процесса диагностической попытки даёт `completed`, а её PASS определяется
code validator по receipt/events, а не отсутствию артефакта. Неожиданный пакет
сохраняется для проверки. Очистка, ошибки процесса и recovery сохраняют контракт.
Диагностический prompt не требует сохранить успешный пакет. Его отдельная
инструкция входит в agent inputs hash, режим — в rubric hash. Legacy hashes
не меняются. `{{PACKAGE_PATH}}` заменяется путём текущей попытки.

`checker_files` перечисляет закрытые относительные файлы SPEC.json, acceptance
и typed expectations; каждый входит в rubric hash, ни один — в inputs модели.
Подготовленные 58 кейсов хранятся в `drafts/text-import`; положительные черновики
без настоящего reference не загружаются в готовую коллекцию. Десять
диагностических кейсов используют собственный outcome-контракт.

Runner и reference-wrapper маршрутизируют семейство по `text-import-cases.json`.
Native collector сохраняет полные execution journals из собственного confirmed
profile_history. Checker перечитывает оригиналы и сравнивает SHA/содержимое.
Подмена проекции, незавершённые receipt, несоответствие delivery и чужой GUID
не подтверждают PASS. `completed` без корректных refusal evidence даёт FAIL.

`script/prepare-text-import-cold.ts CASE ATTEMPT NEW_DIR /account/package.lgp`
только готовит cold-контракт после code checks: последний source при refresh,
независимый oracle, точный package hash и исходные events. Он не выполняет
Loginom, не заменяет cold rerun и не финализирует reference.

`script/text-import-cold/reader.mjs` подготовлен из принятого CLI source pin;
provenance и исходные/адаптированные SHA — рядом. Проверка неправильного pin
останавливается до загрузки браузера. Warm XML проверяет граф/GUID/путь;
полные сохранённые настройки/columns/mapping подтверждаются native cold readback
без Apply. `check-text-import-cold.py` связывает граф/GUID, новый execution,
скачанные исходные bytes, readback, полную typed таблицу и close/logout.

`script/finalize-text-import.ts CASE ATTEMPT NEW_COLLECTION [COLD]` переносит
положительный пакет только после warm и cold PASS; diagnostic требует warm PASS
без положительного reference. Каталог кейса создаётся эксклюзивно. Helper проверяет
loadTasks и записывает CODE_CHECKS_ONLY provenance; operational ACCEPT требует
проверки actual модели/бюджета/CLI/skill/leases и cleanup по skill 1.0.7.

`script/bundle-text-import.py --out NEW_DIR` создаёт семь детерминированных ZIP
по allowlist TASK.md и task.inputs; source bytes сверяются с исходным SPEC.
В каждом внутренний manifest/hash; внешний manifest содержит ID и ZIP SHA256.
Checker-side SPEC/oracle/reference/results и private transactions исключены.
