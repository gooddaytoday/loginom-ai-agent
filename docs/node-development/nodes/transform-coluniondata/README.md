# Соединение (таблицы по позиции)

Устойчивый ID: `component.transform.ColUnionData`. Slug: `transform-coluniondata`. Исторического номера подплана нет.

[Подплан](plan.md) · [реестр](../../registry.json).

## Состояние

Обработчика нет; статус `discovery_required`. Следующая карточка Multica — этап 0 отдельно: живое исследование, контракт и независимый комплект. Этап 1 — после решения владельца подтверждения, что общей табличной оболочки достаточно. Общие изменения всех этапов: W1; точный объём и условия — в подплане.

## Планируемый объём по этапам

- Этап 1: Позиционное соединение таблиц.
- Этап 2: Присоединяемые переменные.

## Источники

- [Справка](https://help.loginom.ru/userguide/processors/transformation/column-union.html), `loginom-help@353e506b:data/processors/transformation/column-union.md`.
- E2E `e2e-tests@486caef44:tests/acceptance/wizards/coluniondata/coluniondata.ts:24,282-301,306-317,360-418` — источник требований, без переноса PASS.
- Runtime `loginom@dada8010e`: `node-contracts.mjs:8-22`, `node-support.mjs:27-41`; зарегистрированного обработчика нет.
