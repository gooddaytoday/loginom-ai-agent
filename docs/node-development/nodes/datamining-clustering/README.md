# Кластеризация

Устойчивый ID: `component.dataMining.Clustering`. Slug: `datamining-clustering`. Исторический номер не назначен.

[Подплан](plan.md) · [реестр](../../registry.json).

## Состояние

Обработчика нет; `discovery_required`. Следующая карточка Multica — этап 0 (живое исследование), отдельно от реализации. Назначение этапа 1 требует закреплённого контракта и решения владельца по общим изменениям: W1/W2/W3.
Живые наблюдения, CLI и численная приёмка не выполнялись; готовность реестра не менялась.

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
