# JSON в дерево

Устойчивый ID: `component.trees.JSONToTree`. Slug: `trees-jsontotree`. Исторического номера подплана нет.

[Подплан](plan.md) · [реестр](../../registry.json).

## Состояние

Обработчика нет. Подплан — `ready_for_development` по результатам этапа 0
LAB-536; в v0.3.8 этапа 1 нет. Реестр runtime не менялся.
[Живые наблюдения](discovery.md), [контракт пары](../trees-jsontotree/contract.md)
и приёмочный комплект готовы как предложение v0.3.9. Начало реализации —
после решения владельца по W1/tree_io, идентичности и критериям.

## Планируемый объём по этапам

- Этап 1: Автоструктура и типизированное чтение.
- Этап 2: Ручная схема и строгая проверка.
- Этап 3: Загрузка схем, даты и полный mapping.

## Источники

- [Справка](https://help.loginom.ru/userguide/processors/data-trees/json-to-tree.html), `loginom-help@353e506b:data/processors/data-trees/json-to-tree.md`.
- E2E `e2e-tests@486caef44:bg/labels.ts:208,566 — название и страницы мастера; tests/toreview/acceptance/wizards/datatree/trees_links.ts:14 — общий mapping, :toreview` — источник требований, без переноса PASS.
- Runtime `loginom@dada8010e`: `node-contracts.mjs:8-22`, `node-support.mjs:27-41`; зарегистрированного обработчика нет.
