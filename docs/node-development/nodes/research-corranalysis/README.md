# Корреляционный анализ

Component ID `component.research.CorrAnalysis`, native engine `TBGCorrAnalysisEngine`.
Предлагаемый runtime `research.corr_analysis`, mode `pearson`.

## Текущий срез v0.4.0

Зарегистрирован `research.corr_analysis` / `pearson`. Два набора числовых полей; попарное исключение NULL; повторный расчёт текущего входа; пять полей порта 0.

Ограничения: Только Pearson; нулевая дисперсия даёт NULL; пустой вход не принят.

Источник: `origin/v040-loginom-sync@94551fa4933ba0e23ab442ff47febaa6142d1c01`; [corr-analysis-node.mjs](../../../../packages/loginom-runtime/client/lib/corr-analysis-node.mjs):1–14; [corr-analysis-parameters.mjs](../../../../packages/loginom-runtime/client/lib/corr-analysis-parameters.mjs):1–19; [research.corr_analysis.md](../../../../packages/product/skills/loginom-automation/references/nodes/research.corr_analysis.md):1–20. Регистрация не заменяет живую приёмку точного SHA; прежние результаты ниже относятся к своим ревизиям.

## Исторические материалы и план расширений

[Подплан](plan.md) · [Discovery](discovery.md) ·
[Приёмочный комплект](acceptance/README.md) · [Реестр](../../registry.json).

Статус подплана **ready_for_development**, этап 0 / LAB-520. Критерии для этапа 1
ещё утверждает владелец. Порог схемы <46 000 Б не повышается; регистрация типа
в этапе 1 после F2/LAB-516. Приращение предлагаемой аддитивной схемы — 742 Б.

Подтверждены Loginom 7.4.2, палитра/fulltype, мастер, порт 0, native схема,
порядок пар, частичные NULL, константы, Execute и замена входа на том же узле,
сохранение и повторное выполнение в новом профиле. Oracle и expected готовы.
На пустом источнике native вывел значения, совпавшие с прежними: эта граница остаётся
r05/этапом 3 и не объявлена принятой.


Этап 1 — числовые наборы и Pearson; этап 2 — ранги и текстовые категории;
этап 3 — взаимнокорреляция и дополнительные границы. Назначения раздельные.
