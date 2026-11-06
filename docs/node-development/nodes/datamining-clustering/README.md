# Кластеризация

Устойчивый ID: `component.dataMining.Clustering`. Slug: `datamining-clustering`. Исторический номер не назначен.

[Подплан](plan.md) · [discovery этапа 0](discovery.md) · [задание](acceptance/task.md) · [реестр](../../registry.json).

Дополнение LAB-717: [стандартизация числовых признаков](normalization.md),
[приёмочный сценарий](acceptance/normalized/task.md). API допускает
`normalization:"none"|"standardize"`; g-means и остальные нормировки остаются
за пределами этого среза.

## Текущий срез v0.4.0

Зарегистрирован `datamining.clustering` / `k_means`. k_means: k 2…1000, seed; normalization none/standardize/scale_minus_one_one/scale_zero_one/absolute_scale. Train текущего входа; выход 0 — строки, Cluster/Distance; выход 1 — центры в исходных единицах. Distance в нормированных единицах.

Ограничения: Только continuous integer/real, один вход, без mapping overrides; g-means и saved-model apply не поддержаны. Пропуск normalization у existing сохраняет однородный поддерживаемый метод; смешанные методы требуют явного выбора; ручной диапазон и контроль диапазона не поддержаны.

Источник: `origin/v040-loginom-sync@94551fa4933ba0e23ab442ff47febaa6142d1c01`; [clustering-node.mjs](../../../../packages/loginom-runtime/client/lib/clustering-node.mjs):1–36; [clustering-parameters.mjs](../../../../packages/loginom-runtime/client/lib/clustering-parameters.mjs):1–19; [datamining.clustering.md](../../../../packages/product/skills/loginom-automation/references/nodes/datamining.clustering.md):1–36. Регистрация не заменяет живую приёмку точного SHA; прежние результаты ниже относятся к своим ревизиям.

## Исторические материалы и план расширений

### Прежнее состояние

В LAB-87 подготовлен кандидат обработчика `datamining.clustering` / `k_means`; готовность реестра не менялась. LAB-84 подготовила discovery и acceptance-комплект для фиксированного k-means волны 2: роли X/Y, нормализация «Нет», k=3, seed=42, оба табличных выхода. Живые наблюдения и их ограничения перечислены в discovery; это не модельная приёмка обработчика.
W1 реализует штатное обучение перед Execute и readback текущего входа. Tolerance и адресация output_port используются из общей приёмки. Модельные 2/3 и независимая приёмка кандидата ещё не завершены. Полный native fulltype и расширенная матрица остаются непроверенными.

## Планируемый объём по этапам

- Этап 1 — Фиксированный k-means.
- Последующие расширения — g-means; пять поддерживаемых нормировок перечислены в текущем срезе выше.

Общие изменения: W1 — обучение и переобучение; W2 — допуск вещественных колонок, объявленный в expected.json до прогона; W3 — адресация и независимое чтение нескольких портов одного узла.

## Источники

- [Кластеризация](https://help.loginom.ru/userguide/processors/datamining/clustering.html) — `loginom-help@353e506b:data/processors/datamining/clustering.md`.
- [Нормализация непрерывных данных](https://help.loginom.ru/userguide/processors/normalization/normalization-continuous.html) — `loginom-help@353e506b:data/processors/normalization/normalization-continuous.md`.
- [Нормализация дискретных данных](https://help.loginom.ru/userguide/processors/normalization/normalization-discrete.html) — `loginom-help@353e506b:data/processors/normalization/normalization-discrete.md`.
- `e2e-tests@486caef44:tests/toreview/acceptance/wizards/data_mining/clustering/sClustering.ts:61-73 — ClusterizationWizard, min/max, threshold и RandSeedEdit; clustering*.ts — master/normalization, :toreview` — прочитанные исходники, не результат выполнения.
