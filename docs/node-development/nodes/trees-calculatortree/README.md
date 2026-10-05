# Калькулятор (дерево)

Устойчивый ID: `component.trees.CalculatorTree`. Slug: `trees-calculatortree`. Исторического номера подплана нет.

[Подплан](plan.md) · [реестр](../../registry.json).

## Состояние

Обработчика нет; статус `discovery_required`. Следующая карточка Multica — этап 0 отдельно: живое исследование, контракт и независимый комплект. Этап 1 — после решения владельца по нужным ему W (W1, W2). Общие изменения всех этапов: W1, W2, W3, W4, W5; точный объём и условия — в подплане.

## Планируемый объём по этапам

- Этап 1: Скалярные выражения и replacement.
- Этап 2: Иерархия, массивы и переменные.
- Этап 3: CommonJS и полная конфигурация.

## Источники

- [Справка](https://help.loginom.ru/userguide/processors/data-trees/calculator-tree/), `loginom-help@353e506b:data/processors/data-trees/calculator-tree/README.md`.
- E2E `e2e-tests@486caef44:tests/toreview/acceptance/wizards/calculator_tree/calculator_tree.ts:13,19 — :sandbox; calculator_tree_expressions_path.ts — :toreview` — источник требований, без переноса PASS.
- Runtime `loginom@dada8010e`: `node-contracts.mjs:8-22`, `node-support.mjs:27-41`; зарегистрированного обработчика нет.
