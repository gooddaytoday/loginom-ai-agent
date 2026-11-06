# Переменные в таблицу

Устойчивый ID: `component.variables.VarToData`. Slug: `variables-vartodata`. Исторического номера подплана нет.

[Подплан](plan.md) · [реестр](../../registry.json).

## Текущий срез v0.4.0

Зарегистрирован `variables.to_table` / `columns`, `rows`. Непустой набор integer/real/boolean/string/datetime и typed NULL в таблицу: columns — одна строка; rows — Name/DisplayName/Value variant; порядок источника сохраняется.

Ограничения: Без переключения режима existing, изменения набора переменных, Variant на входе и пустых наборов; гражданское datetime сохраняет миллисекунды.

Источник: `origin/v040-loginom-sync@94551fa4933ba0e23ab442ff47febaa6142d1c01`; [variables-vartodata-node.mjs](../../../../packages/loginom-runtime/client/lib/variables-vartodata-node.mjs):1–19; [variables-vartodata-parameters.mjs](../../../../packages/loginom-runtime/client/lib/variables-vartodata-parameters.mjs):1–28; [variables.to_table.md](../../../../packages/product/skills/loginom-automation/references/nodes/variables.to_table.md):1–47. Регистрация не заменяет живую приёмку точного SHA; прежние результаты ниже относятся к своим ревизиям.

## Исторические материалы и план расширений

## Планируемый объём по этапам

- Этап 1: Переменные в столбцы.
- Этап 2: Переменные в строки и смешанные типы.

## Источники

- [Справка](https://help.loginom.ru/userguide/processors/variables/variables-to-table.html), `loginom-help@353e506b:data/processors/variables/variables-to-table.md`.
- E2E `e2e-tests@486caef44:bg/labels.ts:199 — название компонента; специализированного мастера в tests/acceptance/wizards не найдено` — источник требований, без переноса PASS.
