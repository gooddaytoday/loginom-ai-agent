# Соединение (таблицы по позиции)

Устойчивый ID: `component.transform.ColUnionData`. Slug: `transform-coluniondata`. Исторического номера подплана нет.

[Подплан](plan.md) · [реестр](../../registry.json).

## Текущий срез v0.4.0

Зарегистрирован `transform.col_union_data` / `positional`. Ровно две таблицы по позиции: row_count minimum/maximum/input; determining_input main/attached; padding null/repeat/last; выход 0.

Ограничения: Без третьего входа, переменных и apply; пустой источник при repeat/last дополняется NULL. Это позиционное соединение, не Слияние по ключам.

Источник: `origin/v040-loginom-sync@94551fa4933ba0e23ab442ff47febaa6142d1c01`; [col-union-node.mjs](../../../../packages/loginom-runtime/client/lib/col-union-node.mjs):1–25; [col-union-parameters.mjs](../../../../packages/loginom-runtime/client/lib/col-union-parameters.mjs):1–48; [transform.col_union_data.md](../../../../packages/product/skills/loginom-automation/references/nodes/transform.col_union_data.md):1–23. Регистрация не заменяет живую приёмку точного SHA; прежние результаты ниже относятся к своим ревизиям.

## Исторические материалы и план расширений

## Планируемый объём по этапам

- Этап 1: Позиционное соединение таблиц.
- Этап 2: Присоединяемые переменные.

## Источники

- [Справка](https://help.loginom.ru/userguide/processors/transformation/column-union.html), `loginom-help@353e506b:data/processors/transformation/column-union.md`.
- E2E `e2e-tests@486caef44:tests/acceptance/wizards/coluniondata/coluniondata.ts:24,282-301,306-317,360-418` — источник требований, без переноса PASS.
