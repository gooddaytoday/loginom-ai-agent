# Объединение (дерево)

Устойчивый ID: `component.trees.UnionTree`. Slug: `trees-uniontree`. Исторического номера подплана нет.

[Подплан](plan.md) · [реестр](../../registry.json).

## Состояние

Обработчика нет; статус `discovery_required`. Следующая карточка Multica — этап 0 отдельно: живое исследование, контракт и независимый комплект. Этап 1 — после решения владельца по нужным ему W (W1). Общие изменения всех этапов: W1, W2, W3; точный объём и условия — в подплане.

## Планируемый объём по этапам

- Этап 1: Конкатенация и динамические входы.
- Этап 2: Первый активный и неактивные схемы.
- Этап 3: Полные mappings и сохранение.

## Источники

- [Справка](https://help.loginom.ru/userguide/processors/data-trees/union-tree.html), `loginom-help@353e506b:data/processors/data-trees/union-tree.md`.
- E2E `e2e-tests@486caef44:bg/labels.ts:214 — название компонента; tests/toreview/acceptance/wizards/datatree/trees_links.ts:14 — общий tree mapping, :toreview` — источник требований, без переноса PASS.
- Runtime `loginom@dada8010e`: `node-contracts.mjs:8-22`, `node-support.mjs:27-41`; зарегистрированного обработчика нет.
