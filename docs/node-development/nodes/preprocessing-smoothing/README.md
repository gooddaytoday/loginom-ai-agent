# Сглаживание

Устойчивый ID: `component.preprocessing.Smoothing`. Slug: `preprocessing-smoothing`. Исторический номер не назначен.

[Подплан](plan.md) · [реестр](../../registry.json).

## Состояние

Обработчика нет; `discovery_required`. Следующая карточка Multica — этап 0 (живое исследование), отдельно от реализации. Назначение этапа 1 требует закреплённого контракта и решения владельца по общим изменениям: W2.
Живые наблюдения, CLI и численная приёмка не выполнялись; готовность реестра не менялась.

## Планируемый объём по этапам

- Этап 1 — Ходрик–Прескотт.
- Этап 2 — Три семейства вейвлетов.

Общие изменения: W2 — допуск вещественных колонок, объявленный в expected.json до прогона.

## Источники

- [Сглаживание](https://help.loginom.ru/userguide/processors/preprocessing/smoothing.html) — `loginom-help@353e506b:data/processors/preprocessing/smoothing.md`.
- `e2e-tests@486caef44:tests/toreview/acceptance/wizards/preprocessing/Smoothing/smoothing.ts и smoothing_helpers.ts — настройка HP/wavelet; :toreview` — прочитанные исходники, не результат выполнения.
- Runtime `loginom@dada8010e`: `node-contracts.mjs:8-22`, `node-support.mjs:27-41`; обработчика нет.
