# Сэмплинг

Устойчивый ID: `component.preprocessing.Sampling`. Slug: `preprocessing-sampling`. Исторический номер не назначен.

[Подплан](plan.md) · [реестр](../../registry.json).

## Состояние

Обработчика нет; `discovery_required`. В LAB-533 выполнена часть живого
исследования пары; этап 0 blocked из-за неподтверждённого детерминированного
контракта «Отбора со смещением». [Наблюдения](discovery.md),
[приёмочные предложения](acceptance/README.md). CLI не собирался,
модельная приёмка не запускалась; готовность реестра не менялась.

## Планируемый объём по этапам

- Назначенный этап 1 — Последовательный и Отбор со смещением; контракт
  последнего требует решения владельца до завершения этапа 0.
- Случайные и стратифицированные режимы — отдельные последующие назначения.

Общие изменения: нет в объявленном срезе.

## Источники

- [Сэмплинг](https://help.loginom.ru/userguide/processors/preprocessing/sampling.html) — `loginom-help@353e506b:data/processors/preprocessing/sampling.md`.
- `e2e-tests@486caef44:tests/toreview/acceptance/wizards/preprocessing/sampling/sampling.ts:202-478 — random/uniform/stratified/sequential/bias; :toreview` — прочитанные исходники, не результат выполнения.
- Runtime `loginom@dada8010e`: `node-contracts.mjs:8-22`, `node-support.mjs:27-41`; обработчика нет.
