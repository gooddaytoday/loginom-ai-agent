# REST-запрос

Устойчивый ID: `component.integration.RestRequest`. Slug: `integration-restrequest`. Исторический номер не назначен.

[Подплан](plan.md) · [реестр](../../registry.json).

## Состояние

На базе этапа 0 обработчика REST нет, статус реестра `discovery_required`. Discovery LAB-86 принят владельцем; приёмочный комплект скорректирован по ревью PR #95. Готовность обработчика этим docs PR не заявляется.

LAB-86: [живое исследование 17.10.2026](discovery.md) и
[комплект этапа 0](acceptance/README.md). Вариант runtime type —
`integration.rest_request` / `request`. GET к публичному echo выполнен сервером
Loginom без администратора. Модельные прогоны и cold-check не проводились;
`expected.json` проверяет только конечную таблицу RequestId, Key, HttpStatusCode после разбора JSON в самом сценарии. Новые виды проверки в cold-check не нужны.

## Планируемый объём по этапам

- Этап 1 — GET с RequestId/Key в строке запроса, стабильный результат после разбора JSON, выгрузка и сохранение.
- Этапы 2+ — остальные методы, сегменты/замена URL, тело, заголовки, timezone, ошибки, retry и simulation.
- Этап 3 — Полная матрица auth/TLS.

Внешняя среда волны 2: публичный `https://httpbin.org/anything`, доступность
подтверждена с сервера Loginom. Только echo без секретов; свой сервер и ledger
не нужны. Недоступность сервиса, отсутствие компонента или необходимость
администратора — Blocked. Готовность реестра документацией не повышается.

## Источники

- [Справка](https://help.loginom.ru/userguide/processors/integration/rest-request.html), `loginom-help@353e506b:data/processors/integration/rest-request.md`.
- `e2e-tests@486caef44` — источник требований, не результаты прогона.
- Runtime `node-contracts.mjs:8-22`, `node-support.mjs:27-41`; контракт приёмки `scripts/node-acceptance/expected-outputs.mjs`.
