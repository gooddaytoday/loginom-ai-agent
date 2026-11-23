# Качество данных

Устойчивый ID: `component.research.Quality`. Slug: `research-quality`. Исторический номер не назначен.

[Подплан](plan.md) · [реестр](../../registry.json).

## Текущий срез v0.4.0

Зарегистрирован `research.quality` / `profile`. Штатный profile с parameters={}: continuous integer/real и discrete string; пять портов 0…4, точное чтение Moda/variant.

Ограничения: Без изменения порогов/исправления данных, скрытых настроек, обучения и apply. Порты 1/2 могут быть пустыми при ненулевых Out/Extr; порт 3 сохраняет вход, не фильтрует NULL.

Источник: `origin/v040-loginom-sync@94551fa4933ba0e23ab442ff47febaa6142d1c01`; [quality-node.mjs](../../../../packages/loginom-runtime/client/lib/quality-node.mjs):1–25; [quality-parameters.mjs](../../../../packages/loginom-runtime/client/lib/quality-parameters.mjs):1–24; [research.quality.md](../../../../packages/product/skills/loginom-automation/references/nodes/research.quality.md):1–58. Регистрация не заменяет живую приёмку точного SHA; прежние результаты ниже относятся к своим ревизиям.

## Исторические материалы и план расширений

### Прежнее состояние

Кандидат обработчика `research.quality` / `profile` реализован в `client/lib/quality-*.mjs`.
Публичные apply/read допускают пять портов; только Moda порта 4 читается существующим
native Variant decoder, остальные значения — обычным completed-port reader.
Нативный update подтвердил Null=4, Avg=1.5, Median=2, Moda=2.5 (real/tag 5);
все пять выходов совпали с независимым oracle. Автономная CLI/cold-приёмка кандидата
и независимая проверка остаются отдельными критериями. Следующий текст описывает этап 0.

Этап 0 LAB-774: `ready_for_development` для предложенного контракта. Нативно
исследован TBGQualityEngine в Loginom 7.4.2 и пять выходов; подготовлены
[независимый oracle, задания и expected](acceptance/README.md).
модельная и cold-приёмка не выполнялись, готовность
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
