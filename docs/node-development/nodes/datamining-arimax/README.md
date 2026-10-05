# ARIMAX

Устойчивый ID: `component.dataMining.Arimax`. Slug: `datamining-arimax`.

[Подплан](plan.md) · [реестр](../../registry.json).

## Состояние

Обработчика нет. Подплан готов к назначению этапа 0 (живое исследование) отдельной карточкой Multica; этап 1 — ручная несезонная модель — после решения владельца по общим изменениям: обучение узла (W1) и допуск сравнения вещественных выходов (W2).

Планируемый объём по этапам: ручная структура p/d/q, горизонт, ошибка и интервал → автоподбор, сезонность и «Сводка» → внешние факторы и нормализация.

## Источники

- [Справка](https://help.loginom.ru/userguide/processors/datamining/arimax.html).
- E2E `e2e-tests@486caef44:tests/toreview/acceptance/workflow/teach/teach_node.ts` — обучаемый узел.
