# Таблица в переменные

Устойчивый ID: `component.variables.DataToVar`. Slug: `variables-datatovar`. Исторического номера подплана нет.

[Подплан](plan.md) · [реестр](../../registry.json).

## Текущий срез v0.4.0

Зарегистрирован `variables.from_table` / `aggregate`. Числовые поля таблицы в переменные: sum/count/min/max/avg; variable output 0, без обучения. Count включает NULL, другие функции пропускают NULL.

Ограничения: Полная настройка выбранных полей/функций; sum/avg real, count integer, min/max тип входа. На пустой таблице count=0, прочие NULL.

Источник: `origin/v040-loginom-sync@94551fa4933ba0e23ab442ff47febaa6142d1c01`; [variables-datatovar-node.mjs](../../../../packages/loginom-runtime/client/lib/variables-datatovar-node.mjs):1–28; [variables-datatovar-parameters.mjs](../../../../packages/loginom-runtime/client/lib/variables-datatovar-parameters.mjs):1–61; [variables.from_table.md](../../../../packages/product/skills/loginom-automation/references/nodes/variables.from_table.md):1–32. Регистрация не заменяет живую приёмку точного SHA; прежние результаты ниже относятся к своим ревизиям.

## Исторические материалы и план расширений

### Прежнее состояние

Подплан `ready_for_development`: живое [исследование](discovery.md) и независимый комплект подготовлены в LAB-822. Этап 1 назначается после утверждения предложенных критериев и контракта W1. Реестр и runtime в этапе 0 не менялись.

## Планируемый объём по этапам

- Этап 1: Базовые агрегаты и выход переменных.
- Этап 2: Все допустимые агрегаты, типы и выходная схема.

## Источники

- [Справка](https://help.loginom.ru/userguide/processors/variables/variables-from-table.html), `loginom-help@353e506b:data/processors/variables/variables-from-table.md`.
- E2E `e2e-tests@486caef44:tests/acceptance/wizards/data_to_variables.ts:18,24,200-221; tests/acceptance/wizards/data_to_variables/concat.ts` — источник требований, без переноса PASS.
