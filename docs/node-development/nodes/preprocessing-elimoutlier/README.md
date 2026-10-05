# Редактирование выбросов

Устойчивый ID: `component.preprocessing.Elimoutlier`. Slug: `preprocessing-elimoutlier`. Исторический номер не назначен.

[Подплан](plan.md) · [реестр](../../registry.json).

## Состояние

Обработчика нет; `discovery_required`. Следующая карточка Multica — этап 0 (живое исследование), отдельно от реализации. Назначение этапа 1 требует закреплённого контракта и решения владельца по общим изменениям: W2/W3.
Живые наблюдения, CLI и численная приёмка не выполнялись; готовность реестра не менялась.

## Планируемый объём по этапам

- Этап 1 — Выявление и независимые выходы.
- Этап 2 — Все методы редактирования.

Общие изменения: W2 — допуск вещественных колонок, объявленный в expected.json до прогона; W3 — адресация и независимое чтение нескольких портов одного узла.

## Источники

- [Редактирование выбросов](https://help.loginom.ru/userguide/processors/preprocessing/eliminate-outliers.html) — `loginom-help@353e506b:data/processors/preprocessing/eliminate-outliers.md`.
- `e2e-tests@486caef44:bg/labels.ts:150-160 — метки Предобработки; общие workflow/port_label и mapping-сценарии не являются oracle этого алгоритма` — прочитанные исходники, не результат выполнения.
- Runtime `loginom@dada8010e`: `node-contracts.mjs:8-22`, `node-support.mjs:27-41`; обработчика нет.
