# REST-запрос

Устойчивый ID: `component.integration.RestRequest`. Slug: `integration-restrequest`. Исторический номер не назначен.

[Подплан](plan.md) · [реестр](../../registry.json).

## Состояние

На базе `loginom@dada8010e` обработчика нет, статус `discovery_required`. Следующая карточка Multica — этап 0 отдельно; этап 1 только после решения владельца по W1, W2, W3.

## Планируемый объём по этапам

- Этап 1 — Методы, URL и request bindings.
- Этап 2 — Ошибки, повтор, simulation и сохранение.
- Этап 3 — Полная матрица auth/TLS.

Внешняя среда: Контролируемый HTTP(S) echo-сервис с ledger по RequestId, маршрутами success/400/408/429/500/wrong-type/delay, тестовыми сертификатами и REST-подключением Loginom. Не производственный API. Её отсутствие — Blocked; готовность реестра этим PR не меняется.

## Источники

- [Справка](https://help.loginom.ru/userguide/processors/integration/rest-request.html), `loginom-help@353e506b:data/processors/integration/rest-request.md`.
- `e2e-tests@486caef44` — источник требований, не результаты прогона.
- Runtime `node-contracts.mjs:8-22`, `node-support.mjs:27-41`; контракт приёмки `scripts/node-acceptance/expected-outputs.mjs`.
