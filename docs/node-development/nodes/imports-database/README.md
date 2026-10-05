# Импорт — База данных

Устойчивый ID: `component.imports.DataBase`. Slug: `imports-database`. Номер исторического подплана не назначен.

[Подплан](plan.md) · [реестр](../../registry.json).

## Состояние

Обработчика нет; статус `discovery_required`. Следующая карточка Multica — этап 0 отдельно: живое исследование, контракт и независимые ожидания. Type/mode `imports.database` / `table` — предложение. Этап 1 — после решения владельца по W1; W1; W2; W3 подробно описаны в подплане. Готовность реестра не повышалась.

Внешняя среда: изолированный PostgreSQL с People и VIEW, драйвер сервера Loginom, read-only роль и отдельный SQL-клиент; задержки/ошибки в контролируемой схеме, каждый иной провайдер получает отдельный профиль. Если среда/компонент недоступны — Blocked, документальное покрытие сохраняется.

## Планируемый объём по этапам

- Этап 1 — PostgreSQL, выбор таблицы/VIEW или явный читающий SELECT, упорядоченный выбранный набор полей; фиксированная строгая схема и пустой результат.
- Этап 2 — r03, r04, r05, r06: фильтры, параметры/макросы, статусы/тайм-аут, провайдеры и schema change при строгом чтении; автоматическая relaxed schema сюда не входит.

Файловые/внешние/переменные результаты требуют соответствующего независимого аудита; существующий cold-check покрывает только табличные выходы. CLI, UI, E2E и модельная приёмка при переработке документации не запускались.

## Источники

- [База данных](https://help.loginom.ru/userguide/integration/import/database.html), Help 7.4, сверено 2026-10-05.
- [Подключения](https://help.loginom.ru/userguide/integration/connections/), Help 7.4, сверено 2026-10-05.
- [Фильтр строк](https://help.loginom.ru/userguide/processors/transformation/row-filter/), Help 7.4, сверено 2026-10-05.
- Runtime `loginom@dada8010e`: [контракты](../../../../packages/loginom-runtime/client/lib/node-contracts.mjs), [диспетчер](../../../../packages/loginom-runtime/client/lib/node-support.mjs).
- E2E `e2e-tests@486caef44:tests/toreview/acceptance/wizards/db_import/wizard/sql_table.ts:13 — :toreview, skip:88,129,185; рядом sql_input.ts и sql_variables.ts. E2E не запускались` — источники требований, не текущая приёмка.
