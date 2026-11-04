# Качество данных

Устойчивый ID: `component.research.Quality`. Slug: `research-quality`. Исторический номер не назначен.

[Подплан](plan.md) · [реестр](../../registry.json).

## Состояние

Этап 0 LAB-774: `ready_for_development` для предложенного контракта. Нативно
исследован TBGQualityEngine в Loginom 7.4.2 и пять выходов; подготовлены
[независимый oracle, задания и expected](acceptance/README.md).
Обработчика пока нет; модельная и cold-приёмка не выполнялись, готовность
реестра не повышалась. Этап 1 требует утверждения критериев и дополнительных
общих адаптаций из [подплана](plan.md).

## Планируемый объём по этапам

- Этап 0 — Нативное исследование и предложение контракта: [discovery](discovery.md).
- Этап 1 — Реализация profile, пять портов и точная проверка всех метрик.

Общие изменения: W3 — адресация и независимое чтение нескольких портов одного узла.

## Источники

- [Исследование](https://help.loginom.ru/userguide/processors/scrutiny/) — `loginom-help@353e506b:data/processors/scrutiny/README.md`.
- [Качество данных](https://help.loginom.ru/userguide/visualization/data-quality/) — `loginom-help@353e506b:data/visualization/data-quality/README.md`.
- `e2e-tests@486caef44:bg/labels.ts:139 — метка Quality; tests/toreview/helpers/qualityview.ts — визуализатор, не контракт узла Quality` — прочитанные исходники, не результат выполнения.
- Runtime `loginom@dada8010e`: `node-contracts.mjs:8-22`, `node-support.mjs:27-41`; обработчика нет.
