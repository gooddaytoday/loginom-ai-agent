# JSON в дерево

## Расширения v0.4.0, этап 0 — LAB-1042

[Новые режимы и приёмочный комплект](modes.md) — предложение до решения
владельца. Общие reader-изменения сверх регистрации и неподтверждённые
правила требуют согласования; прежний статус относится к прежнему срезу.
Runtime в этом docs-PR не изменён, новые PASS не заявлены.

Устойчивый ID: `component.trees.JSONToTree`. Slug: `trees-jsontotree`. Исторического номера подплана нет.

[Подплан](plan.md) · [реестр](../../registry.json).

## Текущий срез v0.4.0

Зарегистрирован `trees.from_json` / `auto_structure`. JSON object из одной строковой колонки; native автоматическая структура; типизированный tree output.

Ограничения: Без ручной схемы. Чтение дерева ограничено 256 узлами, глубиной 16 и 1 MiB; превышение вызывает отказ.

Источник: `origin/v040-loginom-sync@94551fa4933ba0e23ab442ff47febaa6142d1c01`; [tree-node.mjs](../../../../packages/loginom-runtime/client/lib/tree-node.mjs):1–136; [tree-parameters.mjs](../../../../packages/loginom-runtime/client/lib/tree-parameters.mjs):1–86; [trees.from_json.md](../../../../packages/product/skills/loginom-automation/references/nodes/trees.from_json.md):1–49. Регистрация не заменяет живую приёмку точного SHA; прежние результаты ниже относятся к своим ревизиям.

## Исторические материалы и план расширений

## Планируемый объём по этапам

- Этап 1: Автоструктура и типизированное чтение.
- Этап 2: Ручная схема и строгая проверка.
- Этап 3: Загрузка схем, даты и полный mapping.

## Источники

- [Справка](https://help.loginom.ru/userguide/processors/data-trees/json-to-tree.html), `loginom-help@353e506b:data/processors/data-trees/json-to-tree.md`.
- E2E `e2e-tests@486caef44:bg/labels.ts:208,566 — название и страницы мастера; tests/toreview/acceptance/wizards/datatree/trees_links.ts:14 — общий mapping, :toreview` — источник требований, без переноса PASS.
