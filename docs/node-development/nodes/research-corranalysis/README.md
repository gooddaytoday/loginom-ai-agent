# Корреляционный анализ

Устойчивый ID: `component.research.CorrAnalysis`. Slug: `research-corranalysis`. Исторический номер не назначен.

[Подплан](plan.md) · [реестр](../../registry.json).

## Состояние

Обработчика нет; `blocked_stage0`, LAB-520. [Частичное живое исследование](discovery.md): компонент найден в Loginom 7.4.2; предлагаемая регистрация добавляет 742 байта и превышает общий порог схемы. Требуется решение владельца до продолжения. [Приёмочный комплект](acceptance/README.md) пока не содержит native expected.json; готовность реестра не менялась. CLI, модельная и cold-приёмка не выполнялись. W2 (числовой допуск) уже имеется в базе назначения.

## Планируемый объём по этапам

- Этап 1 — Пары и Pearson.
- Этап 2 — Ранги и текстовые категории.
- Этап 3 — Взаимнокорреляция и все сочетания.

Общие изменения: W2 — допуск вещественных колонок, объявленный в expected.json до прогона.

## Источники

- [Корреляционный анализ](https://help.loginom.ru/userguide/processors/scrutiny/correlation-analysis.html) — `loginom-help@353e506b:data/processors/scrutiny/correlation-analysis.md`.
- `e2e-tests@486caef44:tests/acceptance/wizards/corranalysis.ts:14-33 — ошибки несвязанного/ненастроенного узла; далее коэффициенты и preview` — прочитанные исходники, не результат выполнения.
- Runtime `loginom@dada8010e`: `node-contracts.mjs:8-22`, `node-support.mjs:27-41`; обработчика нет.
