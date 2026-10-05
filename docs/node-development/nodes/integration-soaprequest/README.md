# SOAP-запрос

Устойчивый ID: `component.integration.SoapRequest`. Slug: `integration-soaprequest`. Исторический номер не назначен.

[Подплан](plan.md) · [реестр](../../registry.json).

## Состояние

На базе `loginom@dada8010e` обработчика нет, статус `discovery_required`. Следующая карточка Multica — этап 0 отдельно; этап 1 только после решения владельца по W1, W2, W3.

## Планируемый объём по этапам

- Этап 1 — Операции, группы и три выхода.
- Этап 2 — Разбор ответа, fault и debugging modes.
- Этап 3 — WSDL/auth/protocol матрица.

Внешняя среда: Loginom Standard/Enterprise/Cloud; контролируемый WSDL1.1/SOAP1.1 и SOAP1.2 сервис Sum с ledger, fault/delay/malformed endpoints; тестовые TLS/auth профили и резервный WSDL. Её отсутствие — Blocked; готовность реестра этим PR не меняется.

## Источники

- [Справка](https://help.loginom.ru/userguide/processors/integration/soap-request.html), `loginom-help@353e506b:data/processors/integration/soap-request.md`.
- `e2e-tests@486caef44` — источник требований, не результаты прогона.
- Runtime `node-contracts.mjs:8-22`, `node-support.mjs:27-41`; контракт приёмки `scripts/node-acceptance/expected-outputs.mjs`.
