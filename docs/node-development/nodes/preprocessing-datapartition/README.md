# Разбиение на множества

Component ID: `component.preprocessing.DataPartition`. Runtime type:
`preprocessing.data_partition`. Зарегистрирован; текущие режимы и источники ниже.

## Текущий срез v0.4.0

Зарегистрирован `preprocessing.data_partition` / `sequential`, `random`, `stratified`, `biased`. sequential, random, stratified, biased; явные размеры и seed для случайных методов; strata_fields для stratified, bias_field/bias_factors для biased. Сэмплинг: count; разбиение: train_count/test_count и выходы combined/train/test; allocation_order только для sequential.

Ограничения: uniform не поддержан. Bias — дискретное строковое поле, факторы 0…1 для всех наблюдённых категорий; размер не задаёт точные квоты категорий.

Источник: `origin/v040-loginom-sync@94551fa4933ba0e23ab442ff47febaa6142d1c01`; [data-partition-node.mjs](../../../../packages/loginom-runtime/client/lib/data-partition-node.mjs):1–4; [data-partition-parameters.mjs](../../../../packages/loginom-runtime/client/lib/data-partition-parameters.mjs):1–6; [preprocessing.data_partition.md](../../../../packages/product/skills/loginom-automation/references/nodes/preprocessing.data_partition.md):1–13. Регистрация не заменяет живую приёмку точного SHA; прежние результаты ниже относятся к своим ревизиям.

## Исторические материалы и план расширений

[Подплан](plan.md) · [Discovery](discovery.md) · [Приёмочный комплект](acceptance/README.md).

В v0.3.8 только «Последовательный». Native engine, основные типы, параметры,
численные результаты и порты подтверждены в UI Loginom 7.4.2. Этап 0 завершён
с разрешённой оговоркой: **NULL/empty — проверяется на этапе 1 по oracle**;
четыре новые сессии не дали подтверждённых выходов этих случаев.
Готовность подплана не означает подтверждение NULL/empty или приёмку обработчика.
Смещение и случайные/стратифицированные методы — следующие этапы.
CLI не собирался; run-check/cold NOT_RUN. Критерии и оговорку утверждает владелец
до этапа 1.
