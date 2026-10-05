# Автокорреляция

Устойчивый ID: `component.research.AutoCorrelation`. Slug: `research-autocorrelation`. Исторический номер не назначен.

[Подплан](plan.md) · [реестр](../../registry.json).

## Состояние

Обработчика нет; `discovery_required`. Следующая карточка Multica — этап 0 (живое исследование), отдельно от реализации. Назначение этапа 1 требует закреплённого контракта и решения владельца по общим изменениям: W2.
Живые наблюдения, CLI и численная приёмка не выполнялись; готовность реестра не менялась.

## Планируемый объём по этапам

- Этап 1 — Временная АКФ и полный выход.
- Этап 2 — Частотная/автоматическая АКФ и ЧАКФ.

Общие изменения: W2 — допуск вещественных колонок, объявленный в expected.json до прогона.

## Источники

- [Автокорреляция](https://help.loginom.ru/userguide/processors/scrutiny/autocorrelation.html) — `loginom-help@353e506b:data/processors/scrutiny/autocorrelation.md`.
- `e2e-tests@486caef44:tests/acceptance/wizards/autocorrelation/autocorrelation.ts:155-250 — execute, отсчёты, домен и числовые роли; autocorr_pacf.ts — ЧАКФ` — прочитанные исходники, не результат выполнения.
- Runtime `loginom@dada8010e`: `node-contracts.mjs:8-22`, `node-support.mjs:27-41`; обработчика нет.
