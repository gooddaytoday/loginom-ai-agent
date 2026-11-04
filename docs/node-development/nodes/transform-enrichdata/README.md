# Дополнение данных

Устойчивый ID: `component.transform.EnrichData`. Slug: `transform-enrichdata`. Исторического номера подплана нет.

[Подплан](plan.md) · [реестр](../../registry.json).

## Состояние

Статус подплана `ready_for_development`: этап 0 LAB-769 подготовил [живое исследование](discovery.md), контракт и [приёмочное предложение](acceptance/README.md). Обработчика runtime пока нет. Этап 1 — только после утверждения предложенных критериев и отдельного назначения. Аддитивная регистрация динамических входов обязательна; общие алгоритмы не меняются. Реестр готовности не повышен.

## Планируемый объём по этапам

- Этап 1: Многостороннее LEFT enrichment.

## Источники

- [Справка](https://help.loginom.ru/userguide/processors/transformation/enrich-data.html), `loginom-help@353e506b:data/processors/transformation/enrich-data.md`.
- E2E `e2e-tests@486caef44:tests/acceptance/wizards/enrichdata.ts; tests/acceptance/wizards/enrichdata/enrichdata_helpers.ts:31,51-52; sEnrichdata.ts` — источник требований, без переноса PASS.
- Runtime `loginom@dada8010e`: `node-contracts.mjs:8-22`, `node-support.mjs:27-41`; зарегистрированного обработчика нет.
