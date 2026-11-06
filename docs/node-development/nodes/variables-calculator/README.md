# Калькулятор (переменные)

Устойчивый ID: `component.variables.Calculator`. Slug: `variables-calculator`. Исторического номера подплана нет.

[Подплан](plan.md) · [реестр](../../registry.json).

## Текущий срез v0.4.0

Зарегистрирован `variables.calculator` / `expression`. Упорядоченные выражения Loginom создают integer/real/string/boolean переменные; existing patch сохраняет неуказанные выражения; variable output 0.

Ограничения: Без datetime, Variant, промежуточных выражений, замены входных переменных, кэша, перестановки и JavaScript.

Источник: `origin/v040-loginom-sync@94551fa4933ba0e23ab442ff47febaa6142d1c01`; [variables-calculator-node.mjs](../../../../packages/loginom-runtime/client/lib/variables-calculator-node.mjs):1–25; [variables-calculator-parameters.mjs](../../../../packages/loginom-runtime/client/lib/variables-calculator-parameters.mjs):1–66; [variables.calculator.md](../../../../packages/product/skills/loginom-automation/references/nodes/variables.calculator.md):1–28. Регистрация не заменяет живую приёмку точного SHA; прежние результаты ниже относятся к своим ревизиям.

## Исторические материалы и план расширений

### Прежнее состояние

Подплан `ready_for_development`: живое [исследование](discovery.md) и независимый комплект подготовлены в LAB-822. Этап 1 назначается после утверждения предложенных критериев и контракта W1. Реестр и runtime в этапе 0 не менялись.

## Планируемый объём по этапам

- Этап 1: Выражения и типизированный результат.
- Этап 2: Порядок, замена и полный редактор выражений.

## Источники

- [Справка](https://help.loginom.ru/userguide/processors/variables/variables-calc.html), `loginom-help@353e506b:data/processors/variables/variables-calc.md`.
- E2E `e2e-tests@486caef44:tests/toreview/acceptance/wizards/calculatorvariable/preview.ts:15,21-35 — :toreview, CalcVariablesWizard` — источник требований, без переноса PASS.
