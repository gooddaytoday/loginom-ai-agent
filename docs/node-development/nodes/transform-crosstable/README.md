# Кросс-таблица

Устойчивый ID: `component.transform.CrossTable`. Slug: `transform-crosstable`. Исторический подплан 15.

Ключи строк: дискретные string/integer/real/boolean/datetime и непрерывные
integer/real. Колонки требуют дискретных полей; типы и функции фактов сохраняют
существующий контракт. Равные числовые ключи объединяются точно, без округления;
NULL образует отдельную группу. Подробности — [наблюдения стенда](discovery.md).
Сценарий `crosstable-real-keys` проверяет fixed → sliding на том же узле,
сочетание real с дискретным ключом, NULL, CSV, Save и cold.

[Подплан](plan.md) · [наблюдения стенда](discovery.md) · [реестр](../../registry.json).

## Текущий срез v0.4.0

Зарегистрирован `transform.cross_table` / `pivot`. Фиксированные и скользящие колонки, агрегаты и изменение схемы при повторном чтении того же узла; NULL/Other-группы по настройке.

Ограничения: Native-чтение ограничено 50 строками × 8 колонками и 1 MiB, протокол 321; шире — точный formatted reader. Поля собственного выхода с Required=true не исключаются; исключение — отдельным downstream «Параметры полей». Функции — по наблюдённой матрице типов Loginom 7.4.2; «Единственного» в мастере нет. Изменён общий код других обработчиков; их CLI-приёмка на этом SHA не выполнялась.

Источник: `origin/v040-loginom-sync@94551fa4933ba0e23ab442ff47febaa6142d1c01`; [crosstable-node.mjs](../../../../packages/loginom-runtime/client/lib/crosstable-node.mjs):1–86; [crosstable-parameters.mjs](../../../../packages/loginom-runtime/client/lib/crosstable-parameters.mjs):1–61; [transform.cross_table.md](../../../../packages/product/skills/loginom-automation/references/nodes/transform.cross_table.md):1–47. Регистрация не заменяет живую приёмку точного SHA; прежние результаты ниже относятся к своим ревизиям.

## Исторические материалы и план расширений

### Прежнее состояние

Обработчик `transform.cross_table` / `pivot` принят тремя этапами на SHA `4c1eb0f49720b84e848028985691d0318f8eb9f5`: standalone CLI, независимый cold oracle по 24 выходам и независимая приёмка проверяющего (LAB-13 Done). Влит в `loginom` ([PR #33](https://github.com/gooddaytoday/loginom-ai-agent/pull/33), `dada8010e`); релиз не выполнен.

Принятый объём: фиксированные и скользящие категории; агрегаты по наблюдённой матрице типов, включая Variant; несколько измерений строк и колонок; изменение схемы после смены источника без перенастройки; резерв и ограничение категорий; четыре разделителя; имена по категориям; три локальные управляющие переменные; переименование, порядок и автосинхронизация собственного выхода.

Ограничения: native-чтение 50 × 8 и 1 MiB; поля собственного выхода с `Required=true` не исключаются — исключение через отдельный downstream «Параметры полей»; «Единственного» в мастере 7.4.2 нет.

## Источники

- [Справка](https://help.loginom.ru/userguide/processors/transformation/cross-table.html).
- [Публичный контракт узлов](../../../../packages/loginom-runtime/client/lib/node-api.mjs).
- [Приёмочное задание](acceptance/task.md) и [независимый oracle](acceptance/oracle.py).
- [Историческая постановка 15](../../../../services/loginom-ai/docs/plans/loginom-dock/15-cross-table.md) — справка, не подтверждение.
