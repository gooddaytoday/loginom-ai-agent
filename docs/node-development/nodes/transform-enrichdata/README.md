# Дополнение данных

Устойчивый ID: `component.transform.EnrichData`. Slug: `transform-enrichdata`. Исторического номера подплана нет.

[Подплан](plan.md) · [реестр](../../registry.json).

## Состояние

Обработчика нет; статус `discovery_required`. Следующая карточка Multica — этап 0 отдельно: живое исследование, контракт и независимый комплект. Этап 1 — после решения владельца подтверждения, что общей табличной оболочки достаточно. Общие изменения всех этапов: нет; точный объём и условия — в подплане.

## Планируемый объём по этапам

- Этап 1: Многостороннее LEFT enrichment.

## Источники

- [Справка](https://help.loginom.ru/userguide/processors/transformation/enrich-data.html), `loginom-help@353e506b:data/processors/transformation/enrich-data.md`.
- E2E `e2e-tests@486caef44:tests/acceptance/wizards/enrichdata.ts; tests/acceptance/wizards/enrichdata/enrichdata_helpers.ts:31,51-52; sEnrichdata.ts` — источник требований, без переноса PASS.
- Runtime `loginom@dada8010e`: `node-contracts.mjs:8-22`, `node-support.mjs:27-41`; зарегистрированного обработчика нет.
