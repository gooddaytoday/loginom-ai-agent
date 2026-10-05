# Разбиение на множества

Устойчивый ID: `component.preprocessing.DataPartition`. Slug: `preprocessing-datapartition`. Исторический номер не назначен.

[Подплан](plan.md) · [реестр](../../registry.json).

## Состояние

Обработчика нет; `discovery_required`. Следующая карточка Multica — этап 0 (живое исследование), отдельно от реализации. Назначение этапа 1 требует закреплённого контракта и решения владельца по общим изменениям: W3.
Живые наблюдения, CLI и численная приёмка не выполнялись; готовность реестра не менялась.

## Планируемый объём по этапам

- Этап 1 — Размеры, приоритет и три выхода.
- Этап 2 — Все методы сэмплинга и seed.

Общие изменения: W3 — адресация и независимое чтение нескольких портов одного узла.

## Источники

- [Разбиение на множества](https://help.loginom.ru/userguide/processors/preprocessing/partitioning.html) — `loginom-help@353e506b:data/processors/preprocessing/partitioning.md`.
- `e2e-tests@486caef44:bg/labels.ts:150-160 — метки Предобработки; общие workflow/port_label и mapping-сценарии не являются oracle этого алгоритма` — прочитанные исходники, не результат выполнения.
- Runtime `loginom@dada8010e`: `node-contracts.mjs:8-22`, `node-support.mjs:27-41`; обработчика нет.
