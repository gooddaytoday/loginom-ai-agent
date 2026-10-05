# Корреляционный анализ

Устойчивый ID: `component.research.CorrAnalysis`. Slug: `research-corranalysis`. Исторический номер не назначен.

[Подплан](plan.md) · [реестр](../../registry.json).

## Состояние

Обработчика нет; `discovery_required`. Следующая карточка Multica — этап 0 (живое исследование), отдельно от реализации. Назначение этапа 1 требует закреплённого контракта и решения владельца по общим изменениям: W2.
Живые наблюдения, CLI и численная приёмка не выполнялись; готовность реестра не менялась.

## Планируемый объём по этапам

- Этап 1 — Пары и Pearson.
- Этап 2 — Ранги и текстовые категории.
- Этап 3 — Взаимнокорреляция и все сочетания.

Общие изменения: W2 — допуск вещественных колонок, объявленный в expected.json до прогона.

## Источники

- [Корреляционный анализ](https://help.loginom.ru/userguide/processors/scrutiny/correlation-analysis.html) — `loginom-help@353e506b:data/processors/scrutiny/correlation-analysis.md`.
- `e2e-tests@486caef44:tests/acceptance/wizards/corranalysis.ts:14-33 — ошибки несвязанного/ненастроенного узла; далее коэффициенты и preview` — прочитанные исходники, не результат выполнения.
- Runtime `loginom@dada8010e`: `node-contracts.mjs:8-22`, `node-support.mjs:27-41`; обработчика нет.
