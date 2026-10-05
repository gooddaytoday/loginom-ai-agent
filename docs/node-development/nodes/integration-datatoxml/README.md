# Формирование XML

Устойчивый ID: `component.integration.DataToXml`. Slug: `integration-datatoxml`. Исторический номер не назначен.

[Подплан](plan.md) · [реестр](../../registry.json).

## Состояние

На базе `loginom@dada8010e` обработчика нет, статус `discovery_required`. Следующая карточка Multica — этап 0 отдельно; этап 1 только после решения владельца по W1, W2.

## Планируемый объём по этапам

- Этап 1 — Соответствие XSD и все виды группирования документов.
- Этап 2 — Типы, форматирование и переменные.

Внешняя среда: Набор XSD-схем Order/Item в собственном файловом хранилище Loginom; подключение XSD, доступное обоим аккаунтам. Внешний HTTP-сервис не нужен. Её отсутствие — Blocked; готовность реестра этим PR не меняется.

## Источники

- [Справка](https://help.loginom.ru/userguide/processors/integration/xml-generation.html), `loginom-help@353e506b:data/processors/integration/xml-generation.md`.
- `e2e-tests@486caef44` — источник требований, не результаты прогона.
- Runtime `node-contracts.mjs:8-22`, `node-support.mjs:27-41`; контракт приёмки `scripts/node-acceptance/expected-outputs.mjs`.
