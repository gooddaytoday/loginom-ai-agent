# Сэмплинг

Устойчивый ID: `component.preprocessing.Sampling`. Slug: `preprocessing-sampling`. Исторический номер не назначен.

[Подплан](plan.md) · [реестр](../../registry.json).

## Состояние

Обработчика нет; `discovery_required`. Следующая карточка Multica — этап 0 (живое исследование), отдельно от реализации. Назначение этапа 1 требует закреплённого контракта и решения владельца по общим изменениям: нет.
Живые наблюдения, CLI и численная приёмка не выполнялись; готовность реестра не менялась.

## Планируемый объём по этапам

- Этап 1 — Последовательный и базовый случайный отбор.
- Этап 2 — Стратификация и смещение.

Общие изменения: нет в объявленном срезе.

## Источники

- [Сэмплинг](https://help.loginom.ru/userguide/processors/preprocessing/sampling.html) — `loginom-help@353e506b:data/processors/preprocessing/sampling.md`.
- `e2e-tests@486caef44:tests/toreview/acceptance/wizards/preprocessing/sampling/sampling.ts:202-478 — random/uniform/stratified/sequential/bias; :toreview` — прочитанные исходники, не результат выполнения.
- Runtime `loginom@dada8010e`: `node-contracts.mjs:8-22`, `node-support.mjs:27-41`; обработчика нет.
