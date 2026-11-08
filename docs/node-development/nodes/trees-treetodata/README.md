# Дерево в таблицу

## Расширения v0.4.0, этап 0 — LAB-1042

[Новые режимы и приёмочный комплект](modes.md) — предложение до решения
владельца. Общие reader-изменения сверх регистрации и неподтверждённые
правила требуют согласования; прежний статус относится к прежнему срезу.
Runtime в этом docs-PR не изменён, новые PASS не заявлены.

Устойчивый ID: `component.trees.TreeToData`. Slug: `trees-treetodata`. Исторического номера подплана нет.

[Подплан](plan.md) · [реестр](../../registry.json).

## Текущий срез v0.4.0

Зарегистрирован `trees.to_table` / `selected_nodes`. Выбранная ветвь дерева в таблицу; поля/пути, повторение родителей on/off; типы, NULL, boolean, empty и Int64 сохраняются.

Ограничения: Принят только ограниченный срез пары JSON→tree→table; расширенная матрица подплана не подтверждена; чтение дерева ≤256 узлов / depth16 / 1 MiB.

Источник: `origin/v040-loginom-sync@94551fa4933ba0e23ab442ff47febaa6142d1c01`; [tree-node.mjs](../../../../packages/loginom-runtime/client/lib/tree-node.mjs):1–136; [tree-parameters.mjs](../../../../packages/loginom-runtime/client/lib/tree-parameters.mjs):1–86; [trees.to_table.md](../../../../packages/product/skills/loginom-automation/references/nodes/trees.to_table.md):1–49. Регистрация не заменяет живую приёмку точного SHA; прежние результаты ниже относятся к своим ревизиям.

## Исторические материалы и план расширений

## Планируемый объём по этапам

- Этап 1: Выбранная ветвь и полный малый output.
- Этап 2: Индексы, родительские значения и schema mapping.

## Источники

- [Справка](https://help.loginom.ru/userguide/processors/data-trees/tree-to-table.html), `loginom-help@353e506b:data/processors/data-trees/tree-to-table.md`.
- E2E `e2e-tests@486caef44:tests/acceptance/wizards/trees/treetodata/treeToData.ts:21,76-206; tests/toreview/acceptance/wizards/datatree/trees_links.ts:14 — :toreview` — источник требований, без переноса PASS.
