# Разбор XML

Устойчивый ID: `component.integration.ExtractXml`. Slug: `integration-extractxml`. Исторический номер не назначен.

[Подплан](plan.md) · [реестр](../../registry.json).

## Состояние

На базе `loginom@dada8010e` обработчика нет, статус `discovery_required`. Следующая карточка Multica — этап 0 отдельно; этап 1 только после решения владельца по W1, W2, W3.

## Планируемый объём по этапам

- Этап 1 — Разбор, идентификация и два выхода.
- Этап 2 — Валидация, escaping, время и переменные.

Внешняя среда: Собственное XSD-подключение Order/Item и UTF-8 XML в файловом хранилище Loginom; доступ worker/reviewer к проверенным входам. Её отсутствие — Blocked; готовность реестра этим PR не меняется.

## Источники

- [Справка](https://help.loginom.ru/userguide/processors/integration/extracting-xml.html), `loginom-help@353e506b:data/processors/integration/extracting-xml.md`.
- `e2e-tests@486caef44` — источник требований, не результаты прогона.
- Runtime `node-contracts.mjs:8-22`, `node-support.mjs:27-41`; контракт приёмки `scripts/node-acceptance/expected-outputs.mjs`.
