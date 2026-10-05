# Факторный анализ

Устойчивый ID: `component.research.FactorAnalysis`. Slug: `research-factoranalysis`. Исторический номер не назначен.

[Подплан](plan.md) · [реестр](../../registry.json).

## Состояние

Обработчика нет; `discovery_required`. Следующая карточка Multica — этап 0 (живое исследование), отдельно от реализации. Назначение этапа 1 требует закреплённого контракта и решения владельца по общим изменениям: W1/W2/W3/W5.
Живые наблюдения, CLI и численная приёмка не выполнялись; готовность реестра не менялась.

## Планируемый объём по этапам

- Этап 1 — PCA с заданным числом факторов.
- Этап 2 — Критерии отбора и ограничение числа.
- Этап 3 — Varimax/Quartimax и сохранение.

Общие изменения: W1 — обучение и переобучение; W2 — допуск вещественных колонок, объявленный в expected.json до прогона; W3 — адресация и независимое чтение нескольких портов одного узла; W5 — политика динамической схемы факторного анализа для автоподбора.

## Источники

- [Факторный анализ](https://help.loginom.ru/userguide/processors/scrutiny/factor-analysis.html) — `loginom-help@353e506b:data/processors/scrutiny/factor-analysis.md`.
- `e2e-tests@486caef44:tests/acceptance/wizards/factoranalysis/factoranalysis.ts:108-123 — отказ без обучения и явный RetrainNode; test.skip:341 — пустые controls` — прочитанные исходники, не результат выполнения.
- Runtime `loginom@dada8010e`: `node-contracts.mjs:8-22`, `node-support.mjs:27-41`; обработчика нет.
