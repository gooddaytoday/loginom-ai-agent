# Переменные в таблицу

Устойчивый ID: `component.variables.VarToData`. Slug: `variables-vartodata`. Исторического номера подплана нет.

[Подплан](plan.md) · [реестр](../../registry.json).

## Состояние

Обработчика нет. Материалы этапа 0 готовы: [discovery](discovery.md),
[предложение контракта](contract.md), [приёмочный комплект](acceptance/README.md).
Подплан — `ready_for_development`; критерии и W1 требуют утверждения до этапа 1.
Реестр, runtime и техническая приёмка этим docs-PR не изменяются.

## Планируемый объём по этапам

- Этап 1: Переменные в столбцы.
- Этап 2: Переменные в строки и смешанные типы.

## Источники

- [Справка](https://help.loginom.ru/userguide/processors/variables/variables-to-table.html), `loginom-help@353e506b:data/processors/variables/variables-to-table.md`.
- E2E `e2e-tests@486caef44:bg/labels.ts:199 — название компонента; специализированного мастера в tests/acceptance/wizards не найдено` — источник требований, без переноса PASS.
- Runtime `loginom@dada8010e`: `node-contracts.mjs:8-22`, `node-support.mjs:27-41`; зарегистрированного обработчика нет.
