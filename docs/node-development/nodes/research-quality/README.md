# Качество данных

Устойчивый ID: `component.research.Quality`. Slug: `research-quality`. Исторический номер не назначен.

[Подплан](plan.md) · [реестр](../../registry.json).

## Состояние

Обработчика нет; `discovery_required`. Следующая карточка Multica — этап 0 (живое исследование), отдельно от реализации. Назначение этапа 1 требует закреплённого контракта и решения владельца по общим изменениям: W3.
Живые наблюдения, CLI и численная приёмка не выполнялись; готовность реестра не менялась.

## Планируемый объём по этапам

- Этап 1 — Установить идентичность и источник контракта.
- Этап 2 — Задокументировать подтверждённые режимы всех выходов.

Общие изменения: W3 — адресация и независимое чтение нескольких портов одного узла.

## Источники

- [Исследование](https://help.loginom.ru/userguide/processors/scrutiny/) — `loginom-help@353e506b:data/processors/scrutiny/README.md`.
- [Качество данных](https://help.loginom.ru/userguide/visualization/data-quality/) — `loginom-help@353e506b:data/visualization/data-quality/README.md`.
- `e2e-tests@486caef44:bg/labels.ts:139 — метка Quality; tests/toreview/helpers/qualityview.ts — визуализатор, не контракт узла Quality` — прочитанные исходники, не результат выполнения.
- Runtime `loginom@dada8010e`: `node-contracts.mjs:8-22`, `node-support.mjs:27-41`; обработчика нет.
