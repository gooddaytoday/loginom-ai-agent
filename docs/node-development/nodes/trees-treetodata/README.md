# Дерево в таблицу

Устойчивый ID: `component.trees.TreeToData`. Slug: `trees-treetodata`. Исторического номера подплана нет.

[Подплан](plan.md) · [реестр](../../registry.json).

## Состояние

Обработчика нет; статус `discovery_required`. Следующая карточка Multica — этап 0 отдельно: живое исследование, контракт и независимый комплект. Этап 1 — после решения владельца по нужным ему W (W1). Общие изменения всех этапов: W1, W2; точный объём и условия — в подплане.

## Планируемый объём по этапам

- Этап 1: Выбранная ветвь и полный малый output.
- Этап 2: Индексы, родительские значения и schema mapping.

## Источники

- [Справка](https://help.loginom.ru/userguide/processors/data-trees/tree-to-table.html), `loginom-help@353e506b:data/processors/data-trees/tree-to-table.md`.
- E2E `e2e-tests@486caef44:tests/acceptance/wizards/trees/treetodata/treeToData.ts:21,76-206; tests/toreview/acceptance/wizards/datatree/trees_links.ts:14 — :toreview` — источник требований, без переноса PASS.
- Runtime `loginom@dada8010e`: `node-contracts.mjs:8-22`, `node-support.mjs:27-41`; зарегистрированного обработчика нет.
