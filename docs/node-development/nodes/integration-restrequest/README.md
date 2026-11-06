# REST-запрос

Устойчивый ID: `component.integration.RestRequest`. Slug: `integration-restrequest`. Исторический номер не назначен.

[Подплан](plan.md) · [реестр](../../registry.json).

## Текущий срез v0.4.0

Зарегистрирован `integration.rest_request` / `request`. request: GET полного URL с REST-подключением; запрос без входа/query либо с параметрами строки запроса из входной таблицы.

Ограничения: Прочие HTTP-методы, тело, произвольные заголовки, retry и auth/TLS вне среза; независимый plain GET подтверждён LAB-690.

Источник: `origin/v040-loginom-sync@94551fa4933ba0e23ab442ff47febaa6142d1c01`; [rest-request-node.mjs](../../../../packages/loginom-runtime/client/lib/rest-request-node.mjs):1–198; [rest-request-parameters.mjs](../../../../packages/loginom-runtime/client/lib/rest-request-parameters.mjs):1–36; [integration.rest_request.md](../../../../packages/product/skills/loginom-automation/references/nodes/integration.rest_request.md):1–15. Регистрация не заменяет живую приёмку точного SHA; прежние результаты ниже относятся к своим ревизиям.

## Исторические материалы и план расширений

### Прежнее состояние

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
