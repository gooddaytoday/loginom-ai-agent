# Квантование

Устойчивый ID: `component.preprocessing.Binning`. Slug: `preprocessing-binning`. Исторический номер не назначен.

[Подплан](plan.md) · [реестр](../../registry.json).

## Состояние

Обработчика нет; `discovery_required`. Следующая карточка Multica — этап 0 (живое исследование), отдельно от реализации. Назначение этапа 1 требует закреплённого контракта и решения владельца по общим изменениям: W1/W2/W3.
Живые наблюдения, CLI и численная приёмка не выполнялись; готовность реестра не менялась.

## Планируемый объём по этапам

- Этап 1 — Внутренние интервалы и сохранённая модель.
- Этап 2 — Внешние диапазоны и оба результата.

Общие изменения: W1 — обучение и переобучение; W2 — допуск вещественных колонок, объявленный в expected.json до прогона; W3 — адресация и независимое чтение нескольких портов одного узла.

## Источники

- [Квантование](https://help.loginom.ru/userguide/processors/preprocessing/binning.html) — `loginom-help@353e506b:data/processors/preprocessing/binning.md`.
- [Внешние диапазоны](https://help.loginom.ru/userguide/processors/preprocessing/binning/external-ranges.html) — `loginom-help@353e506b:data/processors/preprocessing/binning/external-ranges.md`.
- [Структура результирующего набора](https://help.loginom.ru/userguide/processors/preprocessing/binning/calculated-columns.html) — `loginom-help@353e506b:data/processors/preprocessing/binning/calculated-columns.md`.
- [Параметры диапазонов квантования](https://help.loginom.ru/userguide/processors/preprocessing/binning/parameters-of-binning-ranges.html) — `loginom-help@353e506b:data/processors/preprocessing/binning/parameters-of-binning-ranges.md`.
- `e2e-tests@486caef44:tests/toreview/acceptance/wizards/binning/node_status.ts:25-78 — состояния с основным/внешним входом, test.skip:36; method_settings.ts и button_toolbar.ts — настройки, :toreview` — прочитанные исходники, не результат выполнения.
- Runtime `loginom@dada8010e`: `node-contracts.mjs:8-22`, `node-support.mjs:27-41`; обработчика нет.
