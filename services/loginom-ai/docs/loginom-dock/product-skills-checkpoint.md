# Поставка skills в Loginom AI Agent

Актуальное состояние продукта на 2026-10-06. Старые журналы Dock описывают
историческую серверную публикацию, а не текущий источник skills приложения.

Исходники `loginom-automation` и `package-docs` находятся в
`packages/product/skills/`. Общий staging включает весь каталог в ресурсы
Linux Desktop и standalone CLI; runtime читает локальный automation skill
через manifest с проверкой файлов, ссылок и revision. Правила каталога:
[Product AGENTS](../../../../packages/product/AGENTS.md).

`deploy/loginom-dock/publish-skill.py` отключён: он завершается кодом 2 с
`LOGINOM_SKILL_PUBLICATION_DISABLED`, не читая переданные файлы и не открывая
сетевые соединения. Новая публикация продукта через Skills API не выполняется.
Общий API сервера и источник справки `ai-skills` сохраняются.

Существующая запись `viking://agent/skills/loginom-automation` пока нужна старым
клиентам и сохранённому baseline CLI. Её удаление — отдельный этап после выпуска,
приёмки парных evals, проверки зависимых Codex/Hermes-клиентов и явной команды
пользователя. Репозиторий Loginom Dock и серверная запись этим изменением
не меняются.

Реализация ещё продолжается. Текущее состояние и фактически выполненные
source-only проверки перечислены в
[журнале реализации](../../../../docs/testing/loginom-ai-agent/package-docs-implementation.md).
Установленная Linux-приёмка и live evals остаются открытыми.
