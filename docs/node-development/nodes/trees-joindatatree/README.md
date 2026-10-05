# Слияние (дерево)

Устойчивый ID: `component.trees.JoindataTree`. Slug: `trees-joindatatree`. Исторического номера подплана нет.

[Подплан](plan.md) · [реестр](../../registry.json).

## Состояние

Обработчика нет; статус `discovery_required`. Следующая карточка Multica — этап 0 отдельно: живое исследование, контракт и независимый комплект. Этап 1 — после решения владельца по нужным ему W (W1). Общие изменения всех этапов: W1, W2; точный объём и условия — в подплане.

## Планируемый объём по этапам

- Этап 1: Контейнер и включение корня.
- Этап 2: Массив и объединение схем.
- Этап 3: Выходные mappings и сохранение.

## Источники

- [Справка](https://help.loginom.ru/userguide/processors/data-trees/join-tree.html), `loginom-help@353e506b:data/processors/data-trees/join-tree.md`.
- E2E `e2e-tests@486caef44:bg/labels.ts:216 — название компонента; tests/toreview/acceptance/wizards/datatree/trees_links.ts:14,26-99 — общий mapping, :toreview` — источник требований, без переноса PASS.
- Runtime `loginom@dada8010e`: `node-contracts.mjs:8-22`, `node-support.mjs:27-41`; зарегистрированного обработчика нет.
