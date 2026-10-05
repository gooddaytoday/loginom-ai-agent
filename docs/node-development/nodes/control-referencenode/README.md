# Узел-ссылка

Устойчивый ID: `component.control.ReferenceNode`. Slug: `control-referencenode`. Исторического номера подплана нет.

[Подплан](plan.md) · [реестр](../../registry.json).

## Состояние

Обработчика нет; статус `discovery_required`. Следующая карточка Multica — этап 0 отдельно: живое исследование, контракт и независимый комплект. Этап 1 — после решения владельца по нужным ему W (W1). Общие изменения всех этапов: W1, W2, W3; точный объём и условия — в подплане.

## Планируемый объём по этапам

- Этап 1: Ссылка в одном корневом сценарии и табличный результат.
- Этап 2: Ссылки между областями, все типы выходов и кэш.

## Источники

- [Справка](https://help.loginom.ru/userguide/processors/control/reference-node.html), `loginom-help@353e506b:data/processors/control/reference-node.md`.
- E2E `e2e-tests@486caef44:tests/acceptance/wizards/control/reference_node/reference_node.ts:25,109,304,351; reference_node_other_package.ts; reference_node_changing_data_other_package.ts` — источник требований, без переноса PASS.
- Runtime `loginom@dada8010e`: `node-contracts.mjs:8-22`, `node-support.mjs:27-41`; зарегистрированного обработчика нет.
