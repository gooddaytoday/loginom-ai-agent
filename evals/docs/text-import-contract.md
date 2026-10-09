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
