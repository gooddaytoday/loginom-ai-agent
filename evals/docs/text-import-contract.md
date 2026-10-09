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
