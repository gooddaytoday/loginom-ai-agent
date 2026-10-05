# Линейная регрессия

Устойчивый ID: `component.dataMining.LinRegression`. Slug: `datamining-linregression`. Исторический номер не назначен.

[Подплан](plan.md) · [реестр](../../registry.json).

## Состояние

Обработчика нет; `discovery_required`. Следующая карточка Multica — этап 0 (живое исследование), отдельно от реализации. Назначение этапа 1 требует закреплённого контракта и решения владельца по общим изменениям: W1/W2/W3/W4.
Живые наблюдения, CLI и численная приёмка не выполнялись; готовность реестра не менялась.

## Планируемый объём по этапам

- Этап 1 — Базовая модель и сохранённое применение.
- Этап 2 — Все способы настройки модели.
- Этап 3 — Нормализация, выборки и валидация.
- Этап 4 — Полная статистика и управление переменными.

Общие изменения: W1 — обучение и переобучение; W2 — допуск вещественных колонок, объявленный в expected.json до прогона; W3 — адресация и независимое чтение нескольких портов одного узла; W4 — чтение выходного порта переменных и его проверка; входные управляющие привязки — только в этапах, где они назначены; node-api.mjs, node-read-*.mjs, node-result-schema.mjs и cold-check.mjs.

## Источники

- [Линейная регрессия](https://help.loginom.ru/userguide/processors/datamining/linear-regression/) — `loginom-help@353e506b:data/processors/datamining/linear-regression/README.md`.
- [Линейная регрессия — Сводка](https://help.loginom.ru/userguide/processors/datamining/linear-regression/report.html) — `loginom-help@353e506b:data/processors/datamining/linear-regression/report.md`.
- [Линейная регрессия — Коэффициенты регрессии](https://help.loginom.ru/userguide/processors/datamining/linear-regression/coef-regression.html) — `loginom-help@353e506b:data/processors/datamining/linear-regression/coef-regression.md`.
- [Нормализация непрерывных данных](https://help.loginom.ru/userguide/processors/normalization/normalization-continuous.html) — `loginom-help@353e506b:data/processors/normalization/normalization-continuous.md`.
- [Нормализация дискретных данных](https://help.loginom.ru/userguide/processors/normalization/normalization-discrete.html) — `loginom-help@353e506b:data/processors/normalization/normalization-discrete.md`.
- [Валидация моделей](https://help.loginom.ru/userguide/processors/validation.html) — `loginom-help@353e506b:data/processors/validation.md`.
- `e2e-tests@486caef44:bg/labels.ts:163-183 — метки Data Mining; tests/toreview/acceptance/workflow/teach/teach_node.ts:27-49 — список обучаемых компонентов, :toreview` — прочитанные исходники, не результат выполнения.
- Runtime `loginom@dada8010e`: `node-contracts.mjs:8-22`, `node-support.mjs:27-41`; обработчика нет.
