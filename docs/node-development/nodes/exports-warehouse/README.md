# Экспорт — Deductor Warehouse

Устойчивый ID: `component.exports.Warehouse`. Slug: `exports-warehouse`. Номер исторического подплана не назначен.

[Подплан](plan.md) · [реестр](../../registry.json).

## Состояние

Обработчика нет; статус `discovery_required`. Следующая карточка Multica — этап 0 отдельно: живое исследование, контракт и независимые ожидания. Type/mode `exports.warehouse` / `dimension` — предложение. Этап 1 — после решения владельца по W1 и W2; W1; W2 подробно описаны в подплане. Готовность реестра не повышалась.

Внешняя среда: готовый Deductor Warehouse на Firebird с отдельными Product и Sales, поддержанный DW-драйвер сервера Loginom и независимый SQL/DW-клиент; этап 2 — отдельные MS SQL/Oracle профили с версиями и драйверами. Если среда/компонент недоступны — Blocked, документальное покрытие сохраняется.

## Планируемый объём по этапам

- Этап 1 — Изолированное DW на Firebird, один выбранный объект и ручные связи; основной case — измерение Product, процесс Sales принимается следующим этапом.
- Этап 2 — завершение r01 (процесс и auto-link), r02, r03, r04: ограниченное удаление, агрегации/порядок, persistence и отдельные Firebird/MS SQL/Oracle доказательства.

Файловые/внешние/переменные результаты требуют соответствующего независимого аудита; существующий cold-check покрывает только табличные выходы. CLI, UI, E2E и модельная приёмка при переработке документации не запускались.

## Источники

- [Deductor Warehouse](https://help.loginom.ru/userguide/integration/export/warehouse.html), Help 7.4, сверено 2026-10-05.
- [Подключения](https://help.loginom.ru/userguide/integration/connections/), Help 7.4, сверено 2026-10-05.
- Runtime `loginom@dada8010e`: [контракты](../../../../packages/loginom-runtime/client/lib/node-contracts.mjs), [диспетчер](../../../../packages/loginom-runtime/client/lib/node-support.mjs).
- E2E `e2e-tests@486caef44:bg/labels.ts:243-244 — метка DW экспорта; oracle записи выполняет внешний SQL/DW-клиент` — источники требований, не текущая приёмка.
