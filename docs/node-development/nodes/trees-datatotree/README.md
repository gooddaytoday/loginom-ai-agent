# Таблица в дерево

## Расширения v0.4.0, этап 0 — LAB-1042

[Новые режимы и приёмочный комплект](modes.md) — предложение до решения
владельца. Общие reader-изменения сверх регистрации и неподтверждённые
правила требуют согласования; прежний статус относится к прежнему срезу.
Runtime в этом docs-PR не изменён, новые PASS не заявлены.

Устойчивый ID: `component.trees.DataToTree`. Slug: `trees-datatotree`. Исторического номера подплана нет.

[Подплан](plan.md) · [реестр](../../registry.json).

## Текущий срез v0.4.0

Зарегистрирован `trees.from_table` / `manual_structure`. Ручная структура: каждая строка таблицы — отдельный объект массива под Root; точные source_field и типы, порядок, Int64, Boolean, NULL и empty.

Ограничения: Один массив и не более одного вложенного объекта; без группировки, XSD, дат, Variant, переменных и пустого входа.

Источник: `origin/v040-loginom-sync@94551fa4933ba0e23ab442ff47febaa6142d1c01`; [tree-conversion-node.mjs](../../../../packages/loginom-runtime/client/lib/tree-conversion-node.mjs):1–130; [tree-conversion-parameters.mjs](../../../../packages/loginom-runtime/client/lib/tree-conversion-parameters.mjs):1–53; [trees.from_table.md](../../../../packages/product/skills/loginom-automation/references/nodes/trees.from_table.md):1–23. Регистрация не заменяет живую приёмку точного SHA; прежние результаты ниже относятся к своим ревизиям.

## Исторические материалы и план расширений

## Планируемый объём по этапам

- Этап 1: Ручная структура и табличные связи.
- Этап 2: Все свойства/схемы и глубина.

## Источники

- [Справка](https://help.loginom.ru/userguide/processors/data-trees/table-to-tree.html), `loginom-help@353e506b:data/processors/data-trees/table-to-tree.md`.
- E2E `e2e-tests@486caef44:tests/acceptance/wizards/trees/datatotree/dataToTree.ts:15,90-243; dataToTree_Errors.ts; associated_node_displayname.ts` — источник требований, без переноса PASS.
