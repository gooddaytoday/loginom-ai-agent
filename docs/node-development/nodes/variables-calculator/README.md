# Калькулятор (переменные)

Устойчивый ID: `component.variables.Calculator`. Slug: `variables-calculator`. Исторического номера подплана нет.

[Подплан](plan.md) · [реестр](../../registry.json).

## Состояние

Обработчика нет; статус `discovery_required`. Следующая карточка Multica — этап 0 отдельно: живое исследование, контракт и независимый комплект. Этап 1 — после решения владельца по нужным ему W (W1). Общие изменения всех этапов: W1; точный объём и условия — в подплане.

## Планируемый объём по этапам

- Этап 1: Выражения и типизированный результат.
- Этап 2: Порядок, замена и полный редактор выражений.

## Источники

- [Справка](https://help.loginom.ru/userguide/processors/variables/variables-calc.html), `loginom-help@353e506b:data/processors/variables/variables-calc.md`.
- E2E `e2e-tests@486caef44:tests/toreview/acceptance/wizards/calculatorvariable/preview.ts:15,21-35 — :toreview, CalcVariablesWizard` — источник требований, без переноса PASS.
- Runtime `loginom@dada8010e`: `node-contracts.mjs:8-22`, `node-support.mjs:27-41`; зарегистрированного обработчика нет.
