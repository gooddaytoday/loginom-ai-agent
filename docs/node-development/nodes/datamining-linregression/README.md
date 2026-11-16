# Линейная регрессия

Устойчивый ID: `component.dataMining.LinRegression`. Slug: `datamining-linregression`. Исторический номер не назначен.

[Подплан](plan.md) · [реестр](../../registry.json).

## Текущий срез v0.4.0

Маршрутизация CSV (LAB-1695): справка связывает технические имена выходов с их
назначением. Порт 0 — исходные строки с `<target>_rergession`, порт 1 — таблица
коэффициентов, физический порт 2 — сводка (`read.variable_ports:[0]`). Режим
`statistics:"full"` расширяет только порт 1; назначенный CSV прогнозов получает
порт 0. CSV коэффициентов создаётся только по явной просьбе под отдельным именем.
Основание — два наблюдения неверного Export после правильного полного чтения
портов 0/1: текущая карточка и LAB-1576. Native-имена, readback, task и oracle
не меняются; устранена неоднозначность назначения CSV в общей и Enter-справке.

LAB-1695, C8: сводка качества доступна существующим `read.variable_ports:[0]`
после Execute. Сводка — третий физический выход, но первый среди выходов
переменных: API использует раздельные ordinals. Native-проба 7.4.2 подтвердила
полный свежий VariablesForm: TotalSamples, TotalSelectedSamples, TrainSamples,
LogLikelihood, R2, AdjustedR2, StdDev, DFE, ModelDF, FStatistic, AIC, AICc, BIC,
HQC, ModelPValue. Счётчики и степени свободы — Integer, остальные — Real.
На design.csv Enter с X1/X2/X3: R²≈0.985507, F≈272, DFE=12; численный oracle
не менялся. `linreg-summary` проверяет чтение модели и cold тем же matcher,
оба табличных порта, CSV, Save и cleanup; oracle/expected не передаются модели.

LAB-1576, C6: Enter поддерживает последовательное разбиение в строках через
`linear_regression.partition:{method:"sequential",train_count:16,test_count:2}`.
Первые 16 строк обучают, следующие 2 получают прогноз без участия в обучении.
Native 7.4.2: размеры 16/2 сохраняются после Next/Back и Save; тестовые Y=±999
не меняют коэффициенты 3/2/0.5/≈0, прогнозы 6.5/9.5. Порт 0 содержит все 18 строк
без дополнительного признака разбиения. Сценарий `linreg-partition-sequential`
использует утверждённый комплект C6, численный oracle не изменён.
Cold сохраняет строковые размеры и прогнозы. Native autosync переставляет
поля в порядок X1/X2/X3/Y/RowID/IsTest; обработчик фиксирует исходный порядок
прогнозного порта перед обучением тем же механизмом, что LASSO/Elastic Net.

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
