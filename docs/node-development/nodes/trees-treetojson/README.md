# Дерево в JSON

Устойчивый ID: `component.trees.TreeToJSON`. Slug: `trees-treetojson`. Исторического номера подплана нет.

[Подплан](plan.md) · [реестр](../../registry.json).

## Текущий срез v0.4.0

Зарегистрирован `trees.to_json` / `serialize`. Типизированное объектное дерево в одну компактную JSON-строку на выходе 0: exclude_root=true, pretty=false, keys=names, multi_row=false, datetime=iso8601.

Ограничения: Без корневых массивов, дат, Variant, меток вместо имён, форматирования, разделения и переменных. Полное исходное дерево читается перед преобразованием.

Источник: `origin/v040-loginom-sync@94551fa4933ba0e23ab442ff47febaa6142d1c01`; [tree-conversion-node.mjs](../../../../packages/loginom-runtime/client/lib/tree-conversion-node.mjs):1–130; [tree-conversion-parameters.mjs](../../../../packages/loginom-runtime/client/lib/tree-conversion-parameters.mjs):1–53; [trees.to_json.md](../../../../packages/product/skills/loginom-automation/references/nodes/trees.to_json.md):1–25. Регистрация не заменяет живую приёмку точного SHA; прежние результаты ниже относятся к своим ревизиям.

## Исторические материалы и план расширений

## Планируемый объём по этапам

- Этап 1: Структурная сериализация и корневой массив.
- Этап 2: Метки, даты, форматирование и переменные.

## Источники

- [Справка](https://help.loginom.ru/userguide/processors/data-trees/tree-to-json.html), `loginom-help@353e506b:data/processors/data-trees/tree-to-json.md`.
- E2E `e2e-tests@486caef44:bg/labels.ts:220 — название компонента; tests/toreview/acceptance/wizards/datatree/trees_source.ts — общий tree source, :toreview` — источник требований, без переноса PASS.
