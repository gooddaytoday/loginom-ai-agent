# Экспорт — Kafka

Устойчивый ID: `component.exports.Kafka`. Slug: `exports-kafka`. Номер исторического подплана не назначен.

[Подплан](plan.md) · [реестр](../../registry.json).

## Состояние

Обработчика нет; статус `discovery_required`. Следующая карточка Multica — этап 0 отдельно: живое исследование, контракт и независимые ожидания. Type/mode `exports.kafka` / `publish` — предложение. Этап 1 — после решения владельца по W1 и W2; W1; W2; W3 подробно описаны в подплане. Готовность реестра не повышалась.

Внешняя среда: Loginom Enterprise/Cloud с Kafka; изолированный broker, выделенный topic/ACL и отдельный consumer; этап 2 — PLAINTEXT, SASL_Plaintext, SSL, SASL_SSL и SASL PLAIN/SCRAM-SHA-256/SCRAM-SHA-512 по отдельным профилям. Если среда/компонент недоступны — Blocked, документальное покрытие сохраняется.

## Планируемый объём по этапам

- Этап 1 — Ограниченная таблица в одном topic, явные поле ключа и поле сообщения, client.id; полный независимый readback опубликованных байтов.
- Этап 2 — r02, r03, r04: пачки/timeout, конфигурация Producer, bindings и профили подключения, пустой вход и reconciliation частичной доставки.

Файловые/внешние/переменные результаты требуют соответствующего независимого аудита; существующий cold-check покрывает только табличные выходы. CLI, UI, E2E и модельная приёмка при переработке документации не запускались.

## Источники

- [Kafka](https://help.loginom.ru/userguide/integration/export/kafka.html), Help 7.4, сверено 2026-10-05.
- [Kafka](https://help.loginom.ru/userguide/integration/connections/list/kafka.html), Help 7.4, сверено 2026-10-05.
- [Сравнение редакций](https://help.loginom.ru/userguide/compare-editions.html), Help 7.4, сверено 2026-10-05.
- Runtime `loginom@dada8010e`: [контракты](../../../../packages/loginom-runtime/client/lib/node-contracts.mjs), [диспетчер](../../../../packages/loginom-runtime/client/lib/node-support.mjs).
- E2E `e2e-tests@486caef44:bg/labels.ts:247-248 — метка Kafka в экспорте; узловые байтовые ожидания готовит независимый consumer` — источники требований, не текущая приёмка.
