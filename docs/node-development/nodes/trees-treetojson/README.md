# Дерево в JSON

Устойчивый ID: `component.trees.TreeToJSON`. Slug: `trees-treetojson`. Исторического номера подплана нет.

[Подплан](plan.md) · [реестр](../../registry.json).

## Состояние

Обработчика нет; статус `discovery_required`. Следующая карточка Multica — этап 0 отдельно: живое исследование, контракт и независимый комплект. Этап 1 — после решения владельца по нужным ему W (W1). Общие изменения всех этапов: W1, W2; точный объём и условия — в подплане.

## Планируемый объём по этапам

- Этап 1: Структурная сериализация и корневой массив.
- Этап 2: Метки, даты, форматирование и переменные.

## Источники

- [Справка](https://help.loginom.ru/userguide/processors/data-trees/tree-to-json.html), `loginom-help@353e506b:data/processors/data-trees/tree-to-json.md`.
- E2E `e2e-tests@486caef44:bg/labels.ts:220 — название компонента; tests/toreview/acceptance/wizards/datatree/trees_source.ts — общий tree source, :toreview` — источник требований, без переноса PASS.
- Runtime `loginom@dada8010e`: `node-contracts.mjs:8-22`, `node-support.mjs:27-41`; зарегистрированного обработчика нет.
