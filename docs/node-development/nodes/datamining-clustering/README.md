# Кластеризация

Устойчивый ID: `component.dataMining.Clustering`. Slug: `datamining-clustering`. Исторический номер не назначен.

[Подплан](plan.md) · [discovery этапа 0](discovery.md) · [задание](acceptance/task.md) · [реестр](../../registry.json).

## Состояние

В LAB-87 подготовлен кандидат обработчика `datamining.clustering` / `k_means`; готовность реестра не менялась. LAB-84 подготовила discovery и acceptance-комплект для фиксированного k-means волны 2: роли X/Y, нормализация «Нет», k=3, seed=42, оба табличных выхода. Живые наблюдения и их ограничения перечислены в discovery; это не модельная приёмка обработчика.
W1 реализует штатное обучение перед Execute и readback текущего входа. Tolerance и адресация output_port используются из общей приёмки. Модельные 2/3 и независимая приёмка кандидата ещё не завершены. Полный native fulltype и расширенная матрица остаются непроверенными.

## Планируемый объём по этапам

- Этап 1 — Фиксированный k-means.
- Этап 2 — g-means и нормализация.

Общие изменения: W1 — обучение и переобучение; W2 — допуск вещественных колонок, объявленный в expected.json до прогона; W3 — адресация и независимое чтение нескольких портов одного узла.

## Источники

- [Кластеризация](https://help.loginom.ru/userguide/processors/datamining/clustering.html) — `loginom-help@353e506b:data/processors/datamining/clustering.md`.
- [Нормализация непрерывных данных](https://help.loginom.ru/userguide/processors/normalization/normalization-continuous.html) — `loginom-help@353e506b:data/processors/normalization/normalization-continuous.md`.
- [Нормализация дискретных данных](https://help.loginom.ru/userguide/processors/normalization/normalization-discrete.html) — `loginom-help@353e506b:data/processors/normalization/normalization-discrete.md`.
- `e2e-tests@486caef44:tests/toreview/acceptance/wizards/data_mining/clustering/sClustering.ts:61-73 — ClusterizationWizard, min/max, threshold и RandSeedEdit; clustering*.ts — master/normalization, :toreview` — прочитанные исходники, не результат выполнения.
- Runtime `loginom@dada8010e`: `node-contracts.mjs:8-22`, `node-support.mjs:27-41`; обработчика нет.
