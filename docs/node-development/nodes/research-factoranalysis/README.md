# Факторный анализ

Устойчивый ID: `component.research.FactorAnalysis`, runtime type
`research.factor_analysis` / `pca_fixed`.
[Подплан](plan.md) · [исследование](discovery.md) · [приёмка](acceptance/README.md).

## Текущий срез v0.4.0

Зарегистрирован `research.factor_analysis` / `pca_fixed`. PCA корреляционной матрицы: полный набор конечных continuous Integer/Real, фиксированное число факторов, rotation=none; порты 0/1.

Ограничения: Без констант, пропусков, вырожденных данных, автоматического отбора, вращений и сохранённого apply. При K<P неиспользованные scores NULL, loadings нулевые.

Источник: `origin/v040-loginom-sync@94551fa4933ba0e23ab442ff47febaa6142d1c01`; [factor-analysis-node.mjs](../../../../packages/loginom-runtime/client/lib/factor-analysis-node.mjs):1–32; [factor-analysis-parameters.mjs](../../../../packages/loginom-runtime/client/lib/factor-analysis-parameters.mjs):1–19; [research.factor_analysis.md](../../../../packages/product/skills/loginom-automation/references/nodes/research.factor_analysis.md):1–30. Регистрация не заменяет живую приёмку точного SHA; прежние результаты ниже относятся к своим ревизиям.

## Исторические материалы и план расширений

Утверждённый приёмочный срез — PCA, K=2, без вращения,
полные конечные числовые признаки. Автоотбор, вращения, сохранённый apply и
обучение с NULL — последующие назначения. Первыми шагами отдельной карточки
этапа 1 идут выходной mapping, точный порядок после reopen и полный readback
после retrain; расхождение — стоп. Навык — по структуре LAB-768.
Готовность реализации в реестре не меняется.
