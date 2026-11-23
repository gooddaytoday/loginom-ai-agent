# Конечные классы

LAB-1055 (07.11, mas3): **checkpoint / blocked после второго разрыва**.
[Продолжение подплана](plan.md#8-lab-1055-checkpoint) · [новые предложения и статусы](acceptance/modes/README.md).
Новые runtime-режимы не реализованы; критерии ожидают решения владельца.

Component ID: `component.preprocessing.CoarseClasses`; slug `preprocessing-coarseclasses`.
Предложение runtime: `preprocessing.coarse_classes`, modes `internal` / `apply`.

## Текущий срез v0.4.0

Зарегистрирован `preprocessing.coarse_classes` / `internal`, `apply`. Дискретный String-предиктор и бинарная String-цель; automatic-классы; internal обучает, apply существующего узла использует сохранённые классы; порты 0/1/2.

Ограничения: Без непрерывных предикторов, external/manual/frozen-классов, переменных и неизвестных/NULL значений предиктора.

Источник: `origin/v040-loginom-sync@94551fa4933ba0e23ab442ff47febaa6142d1c01`; [coarse-classes-node.mjs](../../../../packages/loginom-runtime/client/lib/coarse-classes-node.mjs):1–46; [coarse-classes-parameters.mjs](../../../../packages/loginom-runtime/client/lib/coarse-classes-parameters.mjs):1–31; [preprocessing.coarse_classes.md](../../../../packages/product/skills/loginom-automation/references/nodes/preprocessing.coarse_classes.md):1–34. Регистрация не заменяет живую приёмку точного SHA; прежние результаты ниже относятся к своим ревизиям.

## Исторические материалы и план расширений

[Подплан](plan.md) · [Discovery](discovery.md) ·
[Приёмочный комплект](acceptance/README.md) · [Реестр](../../registry.json).

Статус подплана — `ready_for_development`: этап 0 LAB-775 подготовил конкретные
критерии для утверждения оркестратором **до этапа 1**. Обработчика в runtime нет;
модельная, CSV и cold-приёмка ещё не проводились. Готовность реализации/релиза
и реестровые статусы приёмки не повышаются.

Native Loginom 7.4.2: палитра и engine `TBGCoarseClassesEngine` подтверждены.
Объём — один дискретный строковый признак, бинарная цель и событие, автоматическое
разбиение, WoE/IV всех трёх выходов и apply сохранённой модели на holdout без fit.
Фикстуры: A=2/8, B=8/2; WoE ±ln(4), общий IV=1.2*ln(4).
Наблюдён save/reopen/apply собственного пакета. Подробные численные ожидания,
NULL/empty, точные схемы и допуски зафиксированы в discovery и acceptance.

Непрерывные признаки, новые/NULL predictor-категории, smoothing нулевых частот,
внешние/ручные/замороженные классы и variables — отдельные назначения.
W1/W2/W3 уже доступны на базе; необходимость общей алгоритмической правки
не установлена. Основной skill базы 49525 Б превышает бюджет 40000 Б;
это ограничение отмечено в discovery, общий skill здесь не меняется.
