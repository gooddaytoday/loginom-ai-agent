# REST-запрос

Устойчивый ID: `component.integration.RestRequest`. Slug: `integration-restrequest`. Исторический номер не назначен.

[Подплан](plan.md) · [реестр](../../registry.json).

## Состояние

На базе `loginom@dada8010e` обработчика нет, статус `discovery_required`. Следующая карточка Multica — этап 0 отдельно; этап 1 только после решения владельца по необходимым ему W; полный перечень по всем этапам: W1, W2, W3.

LAB-86: [живое исследование 17.10.2026](discovery.md) и
[комплект этапа 0](acceptance/README.md). Вариант runtime type —
`integration.rest_request` / `request`. GET к публичному echo выполнен сервером
Loginom без администратора. Модельные прогоны и cold-check не проводились;
`expected.json` содержит явно обозначенное предложение W2 для стабильных полей JSON.

## Планируемый объём по этапам

- Этап 1 — Методы, URL и request bindings.
- Этап 2 — Ошибки, повтор, simulation и сохранение.
- Этап 3 — Полная матрица auth/TLS.

Внешняя среда волны 2: публичный `https://httpbin.org/anything`, доступность
подтверждена с сервера Loginom. Только echo без секретов; свой сервер и ledger
не нужны. Недоступность сервиса, отсутствие компонента или необходимость
администратора — Blocked. Готовность реестра документацией не повышается.

## Источники

- [Справка](https://help.loginom.ru/userguide/processors/integration/rest-request.html), `loginom-help@353e506b:data/processors/integration/rest-request.md`.
- `e2e-tests@486caef44` — источник требований, не результаты прогона.
- Runtime `node-contracts.mjs:8-22`, `node-support.mjs:27-41`; контракт приёмки `scripts/node-acceptance/expected-outputs.mjs`.
