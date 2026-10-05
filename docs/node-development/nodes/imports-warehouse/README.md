# Импорт — Deductor Warehouse

Устойчивый ID: `component.imports.Warehouse`. Slug: `imports-warehouse`. Номер исторического подплана не назначен.

[Подплан](plan.md) · [реестр](../../registry.json).

## Состояние

Обработчика нет; статус `discovery_required`. Следующая карточка Multica — этап 0 отдельно: живое исследование, контракт и независимые ожидания. Type/mode `imports.warehouse` / `process` — предложение. Этап 1 — после решения владельца по W1; W1; W2 подробно описаны в подплане. Готовность реестра не повышалась.

Внешняя среда: готовый Deductor Warehouse на Firebird с Product(Group) и Sales, DW-драйвер сервера Loginom, read-only роль и независимый SQL/DW-клиент; этап 2 — отдельные MS SQL/Oracle профили с версиями и драйверами. Если среда/компонент недоступны — Blocked, документальное покрытие сохраняется.

## Планируемый объём по этапам

- Этап 1 — Один процесс/измерение DW на Firebird, упорядоченные элементы и пять агрегаций фактов; независимый набор исключает зависимость от нового exports-warehouse.
- Этап 2 — r03, r04: фильтрация без вывода поля, списки/переменные и три DW-провайдера; начальная квалификация Firebird не доказывает MS SQL/Oracle.

Файловые/внешние/переменные результаты требуют соответствующего независимого аудита; существующий cold-check покрывает только табличные выходы. CLI, UI, E2E и модельная приёмка при переработке документации не запускались.

## Источники

- [Deductor Warehouse](https://help.loginom.ru/userguide/integration/import/warehouse.html), Help 7.4, сверено 2026-10-05.
- [Подключения](https://help.loginom.ru/userguide/integration/connections/), Help 7.4, сверено 2026-10-05.
- Runtime `loginom@dada8010e`: [контракты](../../../../packages/loginom-runtime/client/lib/node-contracts.mjs), [диспетчер](../../../../packages/loginom-runtime/client/lib/node-support.mjs).
- E2E `e2e-tests@486caef44:bg/labels.ts:73-74 — метка DW импорта; ожидания агрегаций задаются по fixture, не результатам другого узла` — источники требований, не текущая приёмка.
