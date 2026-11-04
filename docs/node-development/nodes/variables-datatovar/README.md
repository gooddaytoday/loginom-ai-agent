# Таблица в переменные

Устойчивый ID: `component.variables.DataToVar`. Slug: `variables-datatovar`. Исторического номера подплана нет.

[Подплан](plan.md) · [реестр](../../registry.json).

## Состояние

Обработчика пока нет. Подплан `ready_for_development`: живое [исследование](discovery.md) и независимый комплект подготовлены в LAB-822. Этап 1 назначается после утверждения предложенных критериев и контракта W1. Реестр и runtime в этапе 0 не менялись.

## Планируемый объём по этапам

- Этап 1: Базовые агрегаты и выход переменных.
- Этап 2: Все допустимые агрегаты, типы и выходная схема.

## Источники

- [Справка](https://help.loginom.ru/userguide/processors/variables/variables-from-table.html), `loginom-help@353e506b:data/processors/variables/variables-from-table.md`.
- E2E `e2e-tests@486caef44:tests/acceptance/wizards/data_to_variables.ts:18,24,200-221; tests/acceptance/wizards/data_to_variables/concat.ts` — источник требований, без переноса PASS.
- Runtime `loginom@dada8010e`: `node-contracts.mjs:8-22`, `node-support.mjs:27-41`; зарегистрированного обработчика нет.
