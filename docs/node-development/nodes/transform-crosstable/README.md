# Кросс-таблица

Устойчивый ID: `component.transform.CrossTable`. Slug: `transform-crosstable`. Исторический подплан 15.

[Подплан](plan.md) · [наблюдения стенда](discovery.md) · [реестр](../../registry.json).

## Состояние

Обработчик `transform.cross_table` / `pivot` принят тремя этапами на SHA `4c1eb0f49720b84e848028985691d0318f8eb9f5`: standalone CLI, независимый cold oracle по 24 выходам и независимая приёмка проверяющего (LAB-13 Done). Влит в `loginom` ([PR #33](https://github.com/gooddaytoday/loginom-ai-agent/pull/33), `dada8010e`); релиз не выполнен.

Принятый объём: фиксированные и скользящие категории; агрегаты по наблюдённой матрице типов, включая Variant; несколько измерений строк и колонок; изменение схемы после смены источника без перенастройки; резерв и ограничение категорий; четыре разделителя; имена по категориям; три локальные управляющие переменные; переименование, порядок и автосинхронизация собственного выхода.

Ограничения: native-чтение 50 × 8 и 1 MiB; поля собственного выхода с `Required=true` не исключаются — исключение через отдельный downstream «Параметры полей»; «Единственного» в мастере 7.4.2 нет.

## Источники

- [Справка](https://help.loginom.ru/userguide/processors/transformation/cross-table.html).
- [Публичный контракт узлов](../../../../packages/loginom-runtime/client/lib/node-api.mjs).
- [Приёмочное задание](acceptance/task.md) и [независимый oracle](acceptance/oracle.py).
- [Историческая постановка 15](../../../../services/loginom-ai/docs/plans/loginom-dock/15-cross-table.md) — справка, не подтверждение.
