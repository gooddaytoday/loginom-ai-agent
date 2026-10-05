# Импорт — Kafka

Устойчивый ID: `component.imports.Kafka`. Slug: `imports-kafka`. Номер исторического подплана не назначен.

[Подплан](plan.md) · [реестр](../../registry.json).

## Состояние

Обработчика нет; статус `discovery_required`. Следующая карточка Multica — этап 0 отдельно: живое исследование, контракт и независимые ожидания. Type/mode `imports.kafka` / `consume` — предложение. Этап 1 — после решения владельца по W1 и W2; W1; W2; W3 подробно описаны в подплане. Готовность реестра не повышалась.

Внешняя среда: Loginom Enterprise/Cloud с Kafka; broker с выделенным topic (две партиции), отдельной consumer group для роли/попытки, ACL; producer, эталонный consumer и admin-клиент offsets; этап 2 — отдельные SASL/SSL профили. Если среда/компонент недоступны — Blocked, документальное покрытие сохраняется.

## Планируемый объём по этапам

- Этап 1 — Ограниченное чтение одного выделенного topic, явные group.id/client.id и лимит сообщений/timeout; политика начальной позиции закрепляется discovery.
- Этап 2 — r02, r03, r04: пять политик offset по партициям, Consumer/bindings/auth, повтор/reopen и lost-reply reconciliation без скрытого сброса группы.

Файловые/внешние/переменные результаты требуют соответствующего независимого аудита; существующий cold-check покрывает только табличные выходы. CLI, UI, E2E и модельная приёмка при переработке документации не запускались.

## Источники

- [Kafka](https://help.loginom.ru/userguide/integration/import/kafka.html), Help 7.4, сверено 2026-10-05.
- [Kafka](https://help.loginom.ru/userguide/integration/connections/list/kafka.html), Help 7.4, сверено 2026-10-05.
- [Сравнение редакций](https://help.loginom.ru/userguide/compare-editions.html), Help 7.4, сверено 2026-10-05.
- Runtime `loginom@dada8010e`: [контракты](../../../../packages/loginom-runtime/client/lib/node-contracts.mjs), [диспетчер](../../../../packages/loginom-runtime/client/lib/node-support.mjs).
- E2E `e2e-tests@486caef44:bg/labels.ts:77-78 — метка Kafka в импорте; offsets и полный payload закрепляет независимый producer/admin-клиент` — источники требований, не текущая приёмка.
