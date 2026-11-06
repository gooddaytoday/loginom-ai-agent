# Линейная регрессия

Устойчивый ID: `component.dataMining.LinRegression`. Slug: `datamining-linregression`. Исторический номер не назначен.

[Подплан](plan.md) · [реестр](../../registry.json).

## Текущий срез v0.4.0

Зарегистрирован `datamining.lin_regression` / `enter`, `apply`. Простой закон на чистых самостоятельных данных: роли полей, обучение, коэффициенты и прогноз новых строк.

Ограничения: Enter с константой без нормализации; непрерывные числовые предикторы и цель, один вход; выходы 0 (прогнозы) и 1 (коэффициенты), без переопределения mappings. apply сохранённой модели (D27, LAB-421, PR #499) реализован без зафиксированной живой приёмки; выпущен только в v0.3.7. Варианты переобучения, валидация, полная статистика и W4 — этапы 2+.

Источник: `origin/v040-loginom-sync@94551fa4933ba0e23ab442ff47febaa6142d1c01`; [linregression-node.mjs](../../../../packages/loginom-runtime/client/lib/linregression-node.mjs):1–48; [linregression-parameters.mjs](../../../../packages/loginom-runtime/client/lib/linregression-parameters.mjs):1–23; [datamining.lin_regression.md](../../../../packages/product/skills/loginom-automation/references/nodes/datamining.lin_regression.md):1–9. Регистрация не заменяет живую приёмку точного SHA; прежние результаты ниже относятся к своим ревизиям.

## Исторические материалы и план расширений

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
